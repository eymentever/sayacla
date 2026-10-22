// Kullanıcıya para kazandıran içgörüler: kademe uyarısı, anomali, kaçak testi.

import { Reading, UtilityType } from './types';
import { buildIntervals, forecastMonth, monthlyUsage, monthKey } from './consumption';
import { TariffBundle } from './tariffs';
import { gasBillRaw, gasLimit, Calibration } from './bills';
import { d1, d0 } from './fmt';

export type Level = 'info' | 'warning' | 'critical';
export interface Insight {
  id: string;
  type: UtilityType;
  level: Level;
  title: string;
  body: string;
  /** Kullanıcının alabileceği aksiyon */
  action?: string;
  /** Tahmini TL etkisi (+ = kayıp riski / tasarruf fırsatı) */
  impactTL?: number;
}

const r0 = (n: number) => Math.round(n);

/** Gaz kademe: ay sonu tahmini limiti aşacak mı, kaç m³ kaldı, aşarsa ne kadar fazla ödenir. */
export function gasTierInsight(
  readings: Reading[], bundle: TariffBundle, province: string, now = new Date(), cal?: Calibration,
): Insight | null {
  const fc = forecastMonth(readings, 'gas', now);
  if (fc.measured === 0 && !fc.reliable) return null;
  const month = monthKey(now);
  const limit = gasLimit(bundle, province, month);
  if (!Number.isFinite(limit)) return null;
  const f = cal?.factor ?? 1;
  const remaining = limit - fc.measured;
  const daysLeft = Math.max(0, fc.daysInMonth - now.getDate());
  const atLimitK1 = gasBillRaw(bundle, province, month, limit).total * f;
  const justOverK2 = gasBillRaw(bundle, province, month, limit + 0.01).total * f;
  const penalty = justOverK2 - atLimitK1;

  if (fc.measured > limit) {
    return {
      id: 'gas-tier-exceeded', type: 'gas', level: 'critical',
      title: 'Doğalgaz 2. kademeye geçti',
      body: `Bu ay ${d1(fc.measured)} m³ kullandın; ${province} limiti ${d1(limit)} m³. ` +
        `Ayın tüm tüketimi 2. kademe fiyatından (${bundle.gas.national.k2} TL/Sm³) faturalanacak.`,
      action: 'Bundan sonraki tüketim faturayı daha da büyütür; kombiyi 1–2 °C düşürmek etkili olur.',
      impactTL: r0(penalty),
    };
  }
  if (fc.reliable && fc.projected > limit) {
    const perDayBudget = daysLeft > 0 ? remaining / daysLeft : 0;
    return {
      id: 'gas-tier-risk', type: 'gas', level: 'warning',
      title: `Kademe limitine ${d1(remaining)} m³ kaldı`,
      body: `Bu hızla ay sonunda ~${d0(fc.projected)} m³ olacak (limit ${d1(limit)} m³). ` +
        `Limiti 1 m³ bile aşarsan faturan yaklaşık ${d0(penalty)} TL artar.`,
      action: daysLeft > 0 ? `Limitte kalmak için günde en fazla ${d1(perDayBudget)} m³ kullan.` : undefined,
      impactTL: r0(penalty),
    };
  }
  if (fc.measured > 0) {
    return {
      id: 'gas-tier-ok', type: 'gas', level: 'info',
      title: `1. kademedesin — ${d1(remaining)} m³ hakkın var`,
      body: `${province} için bu ayın limiti ${d1(limit)} m³. Ay sonu tahmini ~${d0(fc.projected)} m³.`,
    };
  }
  return null;
}

/** Son ay, önceki ayların ortalamasına göre belirgin yüksekse uyarır (mevsim etkisi için gazda aynı ay yıllık kıyas tercih edilir). */
export function anomalyInsight(readings: Reading[], type: UtilityType, now = new Date()): Insight | null {
  const months = monthlyUsage(buildIntervals(readings, type)).filter(m => m.coveredDays >= 20);
  if (months.length < 3) return null;
  const cur = months[months.length - 1];
  const norm = (m: typeof cur) => (m.m3 / m.coveredDays) * m.daysInMonth;
  let baseline: number | null = null;
  if (type === 'gas') {
    const lastYear = months.find(m => m.month === `${+cur.month.slice(0, 4) - 1}${cur.month.slice(4)}`);
    if (lastYear) baseline = norm(lastYear);
    else return null; // gazda mevsimsellik çok güçlü; geçen yıl yoksa kıyas yanıltıcı
  } else {
    const prev = months.slice(-4, -1);
    baseline = prev.reduce((s, m) => s + norm(m), 0) / prev.length;
  }
  if (!baseline || baseline <= 0) return null;
  const ratio = norm(cur) / baseline;
  if (ratio < 1.3) return null;
  return {
    id: `${type}-anomaly`, type,
    level: ratio >= 1.8 ? 'critical' : 'warning',
    title: `${type === 'water' ? 'Su' : 'Doğalgaz'} tüketimi %${d0((ratio - 1) * 100)} arttı`,
    body: type === 'water'
      ? `Bu ay ~${d1(norm(cur))} m³, önceki aylar ortalaması ~${d1(baseline)} m³.`
      : `Bu ay ~${d0(norm(cur))} m³, geçen yılın aynı ayı ~${d0(baseline)} m³.`,
    action: type === 'water'
      ? 'Kaçak testi yap: tüm muslukları kapat, 2 saat sonra sayacı tekrar oku.'
      : 'Kombi bakımı ve oda termostatı ayarını kontrol et.',
  };
}

/**
 * Kaçak testi: kullanıcı tüm suyu kapatıp iki okuma yapar. Aradaki artış kaçak demektir.
 * Su sayacındaki kırmızı ondalık hanelerin de okunması önerilir (0,001 m³ = 1 litre).
 */
export function leakTestResult(startIndex: number, endIndex: number, minutes: number) {
  const liters = Math.max(0, (endIndex - startIndex) * 1000);
  const perDayL = minutes > 0 ? (liters / minutes) * 1440 : 0;
  if (liters <= 0.5) return { leak: false as const, liters, perDayL: 0, message: 'Kaçak görünmüyor. Sayaç kapalıyken sabit kaldı.' };
  return {
    leak: true as const, liters, perDayL,
    message: `Tüm su kapalıyken ${d1(liters)} litre geçti — günde ~${d0(perDayL)} litre (ayda ~${d1((perDayL * 30 / 1000))} m³) kaçak olabilir. ` +
      'Önce rezervuarı (klozet) kontrol et; sorun sürerse tesisatçı çağır.',
  };
}

export function allInsights(
  readings: Reading[], bundle: TariffBundle, province: string, now = new Date(), gasCal?: Calibration,
): Insight[] {
  const out: (Insight | null)[] = [
    gasTierInsight(readings, bundle, province, now, gasCal),
    anomalyInsight(readings, 'water', now),
    anomalyInsight(readings, 'gas', now),
  ];
  const order: Record<Level, number> = { critical: 0, warning: 1, info: 2 };
  return (out.filter(Boolean) as Insight[]).sort((a, b) => order[a.level] - order[b.level]);
}
