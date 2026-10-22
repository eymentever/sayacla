// Aylık fatura tahmini — gaz (BOTAŞ kademe, tüm ay kuralı) ve su (kademeli).

import { BillEstimate, BillLine } from './types';
import { TariffBundle, WaterProvince } from './tariffs';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Calibration {
  /** Gerçek fatura / motor tahmini oranı. 1 = kalibrasyon yok */
  factor: number;
  /** Kalibrasyon faturasının tarihi */
  asOf: string;
}

/** 'YYYY-MM' → ay indeksi 0–11 */
const monthIdx = (month: string) => Math.max(0, Math.min(11, parseInt(month.slice(5, 7), 10) - 1));

export function gasLimit(bundle: TariffBundle, province: string, month: string): number {
  const p = bundle.gas.provinces[province];
  return p ? p.limits[monthIdx(month)] : Infinity;
}

/** Ham (kalibrasyonsuz) gaz faturası. */
export function gasBillRaw(bundle: TariffBundle, province: string, month: string, m3: number) {
  const n = bundle.gas.national;
  const p = bundle.gas.provinces[province];
  const skb = p?.skbPerM3 ?? 3.0;
  const limit = gasLimit(bundle, province, month);
  const tier: 1 | 2 = m3 > limit ? 2 : 1;
  const unit = tier === 1 ? n.k1 : n.k2;
  const energy = m3 * unit;
  const dist = m3 * skb;
  const otv = m3 * n.otvPerM3;
  const kdv = (energy + dist + otv) * n.kdv;
  return { tier, unit, energy, dist, otv, kdv, total: energy + dist + otv + kdv, limit, kwh: m3 * n.kwhPerM3 };
}

export function gasBill(
  bundle: TariffBundle, province: string, month: string, m3: number, cal?: Calibration,
): BillEstimate {
  const b = gasBillRaw(bundle, province, month, Math.max(0, m3));
  const f = cal?.factor ?? 1;
  const lines: BillLine[] = [
    { label: `Gaz bedeli (${b.tier}. kademe, ${b.unit.toFixed(3)} TL/Sm³)`, amount: r2(b.energy * f) },
    { label: 'Dağıtım (sistem kullanım) bedeli', amount: r2(b.dist * f) },
    { label: 'ÖTV', amount: r2(b.otv * f) },
    { label: 'KDV %20', amount: r2(b.kdv * f) },
  ];
  const p = bundle.gas.provinces[province];
  return {
    type: 'gas', month, m3, total: r2(b.total * f), lines,
    confidence: cal ? 'calibrated' : (bundle.gas.national.verified && p?.verified ? 'official' : 'estimate'),
    gas: { tier: b.tier, limit: b.limit, remaining: b.limit - m3, kwh: b.kwh },
  };
}

/** Su: kademeli birim fiyat, ücretsiz m³ düşülür, KDV + ÇTV + sabit bedel eklenir. */
export function waterBillRaw(w: WaterProvince, m3: number) {
  const billable = Math.max(0, m3 - (w.freeM3 ?? 0));
  let rest = billable;
  let prev = 0;
  let tariff = 0;
  for (const t of w.tiers) {
    if (rest <= 0) break;
    const cap = t.upTo == null ? Infinity : t.upTo - prev;
    const v = Math.min(rest, cap);
    tariff += v * t.rate;
    rest -= v;
    prev = t.upTo ?? prev;
  }
  const kdv = tariff * w.kdv;
  const ctv = m3 * w.ctvPerM3;
  return { tariff, kdv, ctv, fixed: w.fixedMonthly, total: tariff + kdv + ctv + w.fixedMonthly };
}

export function waterBill(
  bundle: TariffBundle, province: string, month: string, m3: number, cal?: Calibration,
): BillEstimate {
  const w = bundle.water[province];
  const b = waterBillRaw(w, Math.max(0, m3));
  const f = cal?.factor ?? 1;
  return {
    type: 'water', month, m3,
    total: r2(b.total * f),
    lines: [
      { label: `Su + atıksu (${w.authority})`, amount: r2(b.tariff * f) },
      { label: 'KDV', amount: r2(b.kdv * f) },
      { label: 'Çevre Temizlik Vergisi', amount: r2(b.ctv * f) },
      { label: 'Sabit bedel', amount: r2(b.fixed * f) },
    ],
    confidence: cal ? 'calibrated' : w.verified ? 'official' : 'estimate',
  };
}

/**
 * Faturadan kalibrasyon: kullanıcının gerçek faturasındaki m³ ve toplam TL'yi motor tahminiyle oranlar.
 * Aşırı oranlar (yanlış giriş) reddedilir.
 */
export function calibrate(
  bundle: TariffBundle, type: 'water' | 'gas', province: string, month: string, m3: number, totalTL: number,
): { ok: true; cal: Calibration } | { ok: false; reason: string } {
  if (!(m3 > 0) || !(totalTL > 0)) return { ok: false, reason: 'Tüketim ve tutar sıfırdan büyük olmalı.' };
  const est = type === 'gas'
    ? gasBillRaw(bundle, province, month, m3).total
    : waterBillRaw(bundle.water[province], m3).total;
  const factor = totalTL / est;
  if (factor < 0.4 || factor > 2.5) {
    return { ok: false, reason: `Girilen tutar beklenenden çok farklı (tahmin ≈ ${Math.round(est)} TL). Faturadaki m³ ve "ödenecek tutar" alanlarını kontrol et.` };
  }
  return { ok: true, cal: { factor, asOf: new Date().toISOString().slice(0, 10) } };
}

export function billFor(
  bundle: TariffBundle, type: 'water' | 'gas', province: string, month: string, m3: number, cal?: Calibration,
): BillEstimate {
  return type === 'gas' ? gasBill(bundle, province, month, m3, cal) : waterBill(bundle, province, month, m3, cal);
}
