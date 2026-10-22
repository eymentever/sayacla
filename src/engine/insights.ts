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
      title: 'Doğalgazda devlet desteğini bu ay kaybettin',
      body: `Bu ay ${d1(fc.measured)} m³ kullandın; ${province} için destekli kullanım hakkın ${d1(limit)} m³. ` +
        `Hakkı aştığın için ayın tüm gazı desteksiz (pahalı) fiyattan faturalanacak.`,
      action: 'Bundan sonraki tüketim faturayı daha da büyütür; kombiyi 1–2 °C düşürmek etkili olur.',
      impactTL: r0(penalty),
    };
  }
  if (fc.reliable && fc.projected > limit) {
    const perDayBudget = daysLeft > 0 ? remaining / daysLeft : 0;
    return {
      id: 'gas-tier-risk', type: 'gas', level: 'warning',
      title: `Destekli gaz hakkının bitmesine ${d1(remaining)} m³ kaldı`,
      body: `Bu hızla ay sonunda ~${d0(fc.projected)} m³ kullanacaksın; hakkın ${d1(limit)} m³. ` +
        `1 m³ bile aşarsan devlet desteği o ay tamamen düşer ve faturan yaklaşık ${d0(penalty)} TL artar.`,
      action: daysLeft > 0 ? `Hakkında kalmak için ay sonuna kadar günde en fazla ${d1(perDayBudget)} m³ kullan.` : undefined,
      impactTL: r0(penalty),
    };
  }
  if (fc.measured > 0) {
    return {
      id: 'gas-tier-ok', type: 'gas', level: 'info',
      title: `Destekli fiyattasın — ${d1(remaining)} m³ hakkın var`,
      body: `${province} için bu ayki destekli kullanım hakkın ${d1(limit)} m³. Ay sonu tahminin ~${d0(fc.projected)} m³.`,
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

// ── Verim ile korunan para ───────────────────────────────────────────────────

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
  if (Math.abs(diff) < 2 || rel < 0.15) {
    return { status: 'ok', readM3, diffM3: diff, message: `Faturan okumalarınla uyumlu (okumalarına göre ~${d1(readM3)} m³).` };
  }
  if (diff > 0) {
    return {
      status: 'high', readM3, diffM3: diff,
      message: `Faturadaki tüketim okumalarından ~${d1(diff)} m³ fazla. Faturada "tahmini okuma" ibaresi var mı, ilk ve son endeksler sayacınla uyuşuyor mu kontrol et; uyuşmuyorsa dağıtım şirketine itiraz edebilirsin.`,
    };
  }
  return {
    status: 'low', readM3, diffM3: diff,
    message: `Faturadaki tüketim okumalarından ~${d1(-diff)} m³ az. Muhtemelen tahmini okuma yapıldı; fark sonraki faturaya eklenir.`,
  };
}
