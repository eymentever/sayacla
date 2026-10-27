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

/** Fatura dönemi limiti: dönemdeki her günün, o ayın günlük limitinin (aylık limit / ayın gün sayısı) toplamı. */
export function periodGasLimit(bundle: TariffBundle, province: string, start: Date, end: Date): number {
  const p = bundle.gas.provinces[province];
  if (!p) return Infinity;
  let sum = 0;
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    sum += p.limits[d.getMonth()] / dim;
  }
  return Math.round(sum * 10) / 10;
}

/** Ham (kalibrasyonsuz) gaz faturası. forceTier verilirse limit yerine o kademe uygulanır. */
export function gasBillRaw(bundle: TariffBundle, province: string, month: string, m3: number, forceTier?: 1 | 2, limitOverride?: number) {
  const n = bundle.gas.national;
  const p = bundle.gas.provinces[province];
  const skb = p?.skbPerM3 ?? 3.0;
  const limit = limitOverride ?? gasLimit(bundle, province, month);
  const tier: 1 | 2 = forceTier ?? (m3 > limit ? 2 : 1);
  const unit = tier === 1 ? n.k1 : n.k2;
  const energy = m3 * unit;
  const dist = m3 * skb;
  const otv = m3 * n.otvPerM3;
  const kdv = (energy + dist + otv) * n.kdv;
  return { tier, unit, energy, dist, otv, kdv, total: energy + dist + otv + kdv, limit, kwh: m3 * n.kwhPerM3 };
}

export function gasBill(
  bundle: TariffBundle, province: string, month: string, m3: number, cal?: Calibration, limit?: number,
): BillEstimate {
  const b = gasBillRaw(bundle, province, month, Math.max(0, m3), undefined, limit);
  const f = cal?.factor ?? 1;
  const lines: BillLine[] = [
    { label: `Gaz bedeli (${b.tier === 1 ? 'ucuz' : 'pahalı'} fiyat, ${b.unit.toFixed(3).replace('.', ',')} TL/Sm³)`, amount: r2(b.energy * f) },
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
  let rest = m3;
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
  // İnsani su hakkı (ör. İSKİ): 1. kademedeki tüketimin %20'si, en fazla freeM3, 1. kademe fiyatından düşülür.
  // Kademe sınırları gerçek tüketime göre kalır.
  if (w.freeM3 && w.freeM3 > 0) {
    const t1 = w.tiers[0];
    const inTier1 = Math.min(m3, t1.upTo ?? m3);
    tariff -= Math.min(w.freeM3, inTier1 * 0.2) * t1.rate;
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
/**
 * Gaz faturasının gerçekte hangi kademeden kesildiğini birim fiyattan çıkarır. Faturalar okuma
 * tarihinden okuma tarihine kesildiği için takvim ayı limitiyle aynı sonucu vermeyebilir.
 */
export function inferGasTier(bundle: TariffBundle, province: string, month: string, m3: number, amount: number): 1 | 2 {
  const k1 = gasBillRaw(bundle, province, month, m3, 1).total;
  const k2 = gasBillRaw(bundle, province, month, m3, 2).total;
  return Math.abs(amount - k1) <= Math.abs(amount - k2) ? 1 : 2;
}

/** Kalibrasyon katsayısı: gerçek tutar / aynı kademedeki motor tahmini (yalnızca dağıtım+vergi farkını öğrenir). */
export function calibrationFactor(
  bundle: TariffBundle, type: 'water' | 'gas', province: string, month: string, m3: number, totalTL: number,
): number {
  const est = type === 'gas'
    ? gasBillRaw(bundle, province, month, m3, inferGasTier(bundle, province, month, m3, totalTL)).total
    : waterBillRaw(bundle.water[province], m3).total;
  return totalTL / est;
}

/**
 * Faturadan kalibrasyon: kullanıcının gerçek faturasındaki m³ ve toplam TL'yi motor tahminiyle oranlar.
 * Aşırı oranlar (yanlış giriş) reddedilir.
 */
export function calibrate(
  bundle: TariffBundle, type: 'water' | 'gas', province: string, month: string, m3: number, totalTL: number,
): { ok: true; cal: Calibration; tier?: 1 | 2 } | { ok: false; reason: string } {
  if (!(m3 > 0) || !(totalTL > 0)) return { ok: false, reason: 'Tüketim ve tutar sıfırdan büyük olmalı.' };
  const factor = calibrationFactor(bundle, type, province, month, m3, totalTL);
  if (factor < 0.4 || factor > 2.5) {
    const est = type === 'gas' ? gasBillRaw(bundle, province, month, m3).total : waterBillRaw(bundle.water[province], m3).total;
    return { ok: false, reason: `Girilen tutar beklenenden çok farklı (tahmin ≈ ${Math.round(est).toLocaleString('tr-TR')} TL). Faturadaki m³ ve "ödenecek tutar" alanlarını kontrol et.` };
  }
  return {
    ok: true, cal: { factor, asOf: new Date().toISOString().slice(0, 10) },
    tier: type === 'gas' ? inferGasTier(bundle, province, month, m3, totalTL) : undefined,
  };
}

export function billFor(
  bundle: TariffBundle, type: 'water' | 'gas', province: string, month: string, m3: number, cal?: Calibration, gasLimitOverride?: number,
): BillEstimate {
  return type === 'gas' ? gasBill(bundle, province, month, m3, cal, gasLimitOverride) : waterBill(bundle, province, month, m3, cal);
}
