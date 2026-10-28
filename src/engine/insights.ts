// Kullanıcıya para kazandıran içgörüler: kademe uyarısı, anomali, kaçak testi.

import { Reading, UtilityType } from './types';
import { buildIntervals, forecastMonth, forecastPeriod, monthlyUsage, monthKey, BillingPeriod } from './consumption';
import { TariffBundle } from './tariffs';
import { gasBillRaw, gasLimit, periodGasLimit, Calibration } from './bills';
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
  readings: Reading[], bundle: TariffBundle, province: string, now = new Date(), cal?: Calibration, period?: BillingPeriod | null,
): Insight | null {
  const fc = period ? forecastPeriod(readings, 'gas', period, now) : forecastMonth(readings, 'gas', now);
  if (fc.measured === 0 && !fc.reliable) return null;
  const month = monthKey(now);
  const limit = period ? periodGasLimit(bundle, province, period.start, period.end) : gasLimit(bundle, province, month);
  if (!Number.isFinite(limit)) return null;
  const f = cal?.factor ?? 1;
  const remaining = limit - fc.measured;
  const daysLeft = period
    ? Math.max(0, Math.ceil((period.end.getTime() - now.getTime()) / 86_400_000))
    : Math.max(0, fc.daysInMonth - now.getDate());
  // Dil: fatura dönemi biliniyorsa "bu dönem", bilinmiyorsa takvim ayı
  const W = period
    ? { now: 'Bu fatura döneminde', end: 'dönem sonunda', until: 'Sayaç okunana kadar', whole: 'dönemin', reset: 'Limit her fatura döneminde sıfırlanır.', next: 'gelecek dönem', thisLimit: 'bu dönemki' }
    : { now: 'Bu ay', end: 'ay sonunda', until: 'Ay sonuna kadar', whole: 'ayın', reset: 'Limit her ayın 1\'inde sıfırlanır.', next: 'gelecek ay', thisLimit: 'bu ayki' };
  const atLimitK1 = gasBillRaw(bundle, province, month, limit, undefined, limit).total * f;
  const justOverK2 = gasBillRaw(bundle, province, month, limit + 0.01, undefined, limit).total * f;
  const penalty = justOverK2 - atLimitK1;

  if (fc.measured > limit) {
    const m3End = Math.max(fc.measured, fc.projected);
    const extra = (gasBillRaw(bundle, province, month, m3End, 2).total - gasBillRaw(bundle, province, month, m3End, 1).total) * f;
    return {
      id: 'gas-tier-exceeded', type: 'gas', level: 'critical',
      title: `${W.now} doğalgaz pahalı fiyattan hesaplanacak`,
      body: `${W.now} ${d1(fc.measured)} m³ kullandın; ${province} için ucuz fiyat limiti ${d1(limit)} m³. ` +
        `Limit aşıldığı için ${W.whole} tüm gazı pahalı fiyattan hesaplanır; bu sana yaklaşık ${d0(extra)} TL ek maliyet.`,
      action: `${W.reset} ${W.until} her 1 °C düşüş yine faturayı azaltır; ${W.next} limitin altında kalman için seni zamanında uyaracağız.`,
      impactTL: r0(extra),
    };
  }
  if (fc.reliable && fc.projected > limit) {
    const perDayBudget = daysLeft > 0 ? remaining / daysLeft : 0;
    return {
      id: 'gas-tier-risk', type: 'gas', level: 'warning',
      title: `Ucuz fiyat limitine ${d1(remaining)} m³ kaldı`,
      body: `Bu hızla ${W.end} ~${d0(fc.projected)} m³ kullanacaksın; limit ${d1(limit)} m³. ` +
        `Limiti 1 m³ bile aşarsan ${W.whole} tüm gazı pahalı fiyattan hesaplanır ve faturan yaklaşık ${d0(penalty)} TL artar.`,
      action: daysLeft <= 0 ? undefined
        : fc.measured > 0 && perDayBudget < 0.4 * ((fc.projected - fc.measured) / Math.max(1, daysLeft))
          ? `Ucuz fiyatta kalmak için günde ${d1(perDayBudget)} m³'e inmen gerekir; bu, şu anki tüketiminin çok altında. Yine de kombiyi 1–2 °C düşürmek ve gece kısmak faturayı belirgin şekilde azaltır.`
          : `${W.until} günde en fazla ${d1(perDayBudget)} m³ kullanırsan ucuz fiyatta kalırsın.`,
      impactTL: r0(penalty),
    };
  }
  if (fc.measured > 0) {
    return {
      id: 'gas-tier-ok', type: 'gas', level: 'info',
      title: `Ucuz fiyattasın — limite ${d1(remaining)} m³ var`,
      body: `${province} için ${W.thisLimit} ucuz fiyat limiti ${d1(limit)} m³. ${W.end[0].toUpperCase() + W.end.slice(1)} tahminin ~${d0(fc.projected)} m³.`,
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
  readings: Reading[], bundle: TariffBundle, province: string, now = new Date(), gasCal?: Calibration, gasPeriod?: BillingPeriod | null,
): Insight[] {
  const out: (Insight | null)[] = [
    gasTierInsight(readings, bundle, province, now, gasCal, gasPeriod),
    anomalyInsight(readings, 'water', now),
    anomalyInsight(readings, 'gas', now),
  ];
  const order: Record<Level, number> = { critical: 0, warning: 1, info: 2 };
  return (out.filter(Boolean) as Insight[]).sort((a, b) => order[a.level] - order[b.level]);
}

// ── Sayaçla ile korunan para ───────────────────────────────────────────────────

export interface ProtectedMonth { month: string; m3: number; limit: number; savedTL: number }

/**
 * Kademe riski için uyardığımız ve kullanıcının 1. kademede kapattığı geçmiş aylar.
 * Korunan tutar = aynı tüketim 2. kademeden faturalansaydı ödenecek fark. Yalnızca ay en az 20 gün
 * okumalarla kapsanmışsa sayılır (abartmamak için).
 */
export function protectedSavings(
  readings: Reading[], warnedMonths: string[], bundle: TariffBundle, province: string, now = new Date(), cal?: Calibration,
): { total: number; months: ProtectedMonth[] } {
  const cur = monthKey(now);
  const f = cal?.factor ?? 1;
  const usage = monthlyUsage(buildIntervals(readings, 'gas'));
  const months: ProtectedMonth[] = [];
  for (const m of [...new Set(warnedMonths)]) {
    if (m >= cur) continue;
    const u = usage.find(x => x.month === m);
    if (!u || u.coveredDays < 20) continue;
    const m3 = (u.m3 / u.coveredDays) * u.daysInMonth;
    const limit = gasLimit(bundle, province, m);
    if (!Number.isFinite(limit) || m3 > limit) continue;
    const saved = (gasBillRaw(bundle, province, m, m3, 2).total - gasBillRaw(bundle, province, m, m3, 1).total) * f;
    months.push({ month: m, m3, limit, savedTL: Math.round(saved) });
  }
  months.sort((a, b) => a.month.localeCompare(b.month));
  return { total: months.reduce((s, x) => s + x.savedTL, 0), months };
}

// ── Fatura kontrolü ──────────────────────────────────────────────────────────

export interface BillCheck { status: 'ok' | 'high' | 'low' | 'unknown'; readM3?: number; diffM3?: number; message: string }

/**
 * Faturadaki tüketimi kullanıcının kendi okumalarıyla karşılaştırır. Fark %15 ve 2 m³'ü aşarsa uyarır —
 * tahmini okuma veya hatalı endeks olabilir. m³ kıyaslanır; tarife farkından etkilenmez.
 */
export function checkBillAgainstReadings(readings: Reading[], type: UtilityType, month: string, billM3: number): BillCheck {
  const u = monthlyUsage(buildIntervals(readings, type)).find(x => x.month === month);
  if (!u || u.coveredDays < 20) {
    return { status: 'unknown', message: 'Bu ayı okumalarla karşılaştırmak için ay boyunca en az iki okuma gerekiyor.' };
  }
  const readM3 = (u.m3 / u.coveredDays) * u.daysInMonth;
  const diff = billM3 - readM3;
  const rel = readM3 > 0 ? Math.abs(diff) / readM3 : 1;
  if (Math.abs(diff) < 3 || rel < 0.25) {
    return { status: 'ok', readM3, diffM3: diff, message: `Faturan okumalarınla uyumlu (okumalarına göre ~${d1(readM3)} m³).` };
  }
  if (diff > 0) {
    return {
      status: 'high', readM3, diffM3: diff,
      message: `Faturadaki tüketim, okumalarına göre bu takvim ayı için beklenenden ~${d1(diff)} m³ fazla. Fatura dönemi ayın ortasından başlıyorsa fark normal olabilir. Faturadaki "ilk endeks" ve "son endeks"i sayacınla karşılaştır; son endeks sayacındaki değerden büyükse ya da "tahmini okuma" yazıyorsa dağıtım şirketine itiraz edebilirsin.`,
    };
  }
  return {
    status: 'low', readM3, diffM3: diff,
    message: `Faturadaki tüketim okumalarından ~${d1(-diff)} m³ az. Muhtemelen tahmini okuma yapıldı; fark sonraki faturaya eklenir.`,
  };
}
