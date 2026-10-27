// Ana sayfa özeti: bu ay tahmini fatura, geçen ayla kıyas, kişisel ve TL bazlı tasarruf önerileri.

import { Reading, UtilityType, BillEstimate } from './types';
import { buildIntervals, monthlyUsage, forecastMonth, monthKey, MonthForecast } from './consumption';
import { TariffBundle } from './tariffs';
import { billFor, Calibration, gasLimit, calibrationFactor, inferGasTier } from './bills';
import { d1, d0 } from './fmt';

/** Kullanıcının girdiği gerçek fatura (kalibrasyon + "geçen ay ne ödedim" için) */
export interface PaidBill {
  id: string;
  propertyId: string;
  type: UtilityType;
  /** Faturanın ait olduğu ay 'YYYY-MM' */
  month: string;
  m3: number;
  amount: number;
}

export interface TypeSummary {
  type: UtilityType;
  hasData: boolean;
  forecast: MonthForecast;
  /** Ay sonu tahmini fatura */
  projectedBill: BillEstimate | null;
  /** Şu ana kadar oluşan tutar */
  soFarBill: BillEstimate | null;
  lastMonth: { month: string; m3: number; amount: number; isActual: boolean } | null;
  /** Bu ay tahmini − geçen ay (TL) */
  deltaTL: number | null;
  deltaPct: number | null;
  /** Değişimin nedeni, insan dilinde */
  reason: string | null;
}

export interface Tip {
  id: string;
  type: UtilityType;
  title: string;
  body: string;
  /** Aylık tahmini tasarruf, TL */
  monthlyTL: number;
  effort: 'kolay' | 'orta' | 'yatırım';
}

const prevMonthKey = (now: Date) => monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 15));
const r0 = (n: number) => Math.round(n);

export function latestCalibration(bills: PaidBill[], type: UtilityType, bundle: TariffBundle, province: string): Calibration | undefined {
  const b = [...bills].filter(x => x.type === type && x.m3 > 0 && x.amount > 0).sort((a, c) => c.month.localeCompare(a.month))[0];
  if (!b) return undefined;
  const factor = calibrationFactor(bundle, type, province, b.month, b.m3, b.amount);
  if (!(factor >= 0.4 && factor <= 2.5)) return undefined;
  return { factor, asOf: b.month };
}

export function summarize(
  readings: Reading[], bills: PaidBill[], type: UtilityType, bundle: TariffBundle, province: string, now = new Date(),
): TypeSummary {
  const rs = readings.filter(r => r.type === type);
  const fc = forecastMonth(rs, type, now);
  const cal = latestCalibration(bills, type, bundle, province);
  const month = monthKey(now);
  const hasData = buildIntervals(rs, type).length > 0;

  const projectedBill = hasData ? billFor(bundle, type, province, month, fc.projected, cal) : null;
  const soFarBill = hasData ? billFor(bundle, type, province, month, fc.measured, cal) : null;

  // Geçen ay: önce gerçek fatura, yoksa okumalardan tahmin (en az 20 gün kapsanmışsa)
  const pm = prevMonthKey(now);
  const paid = bills.find(b => b.type === type && b.month === pm);
  let lastMonth: TypeSummary['lastMonth'] = null;
  if (paid) lastMonth = { month: pm, m3: paid.m3, amount: paid.amount, isActual: true };
  else {
    const mu = monthlyUsage(buildIntervals(rs, type)).find(m => m.month === pm);
    if (mu && mu.coveredDays >= 20) {
      const m3 = (mu.m3 / mu.coveredDays) * mu.daysInMonth;
      lastMonth = { month: pm, m3, amount: billFor(bundle, type, province, pm, m3, cal).total, isActual: false };
    }
  }

  let deltaTL: number | null = null, deltaPct: number | null = null, reason: string | null = null;
  if (projectedBill && lastMonth && fc.reliable) {
    deltaTL = projectedBill.total - lastMonth.amount;
    deltaPct = lastMonth.amount > 0 ? deltaTL / lastMonth.amount : null;
    const dM3 = fc.projected - lastMonth.m3;
    const parts: string[] = [];
    if (Math.abs(dM3) >= 0.5) parts.push(`tüketim ${dM3 > 0 ? '+' : ''}${d1(dM3)} m³`);
    if (type === 'gas' && projectedBill.gas) {
      const lastTier = lastMonth.isActual ? inferGasTier(bundle, province, pm, lastMonth.m3, lastMonth.amount) : (lastMonth.m3 > gasLimit(bundle, province, pm) ? 2 : 1);
      if (projectedBill.gas.tier !== lastTier) parts.push(projectedBill.gas.tier === 2
        ? (fc.measured > gasLimit(bundle, province, month) ? 'devlet desteği bu ay kaybedildi (pahalı fiyat)' : 'devlet desteğini kaybetme riski')
        : 'destekli fiyata dönüş');
    }
    if (type === 'gas') {
      const limNow = gasLimit(bundle, province, month), limPrev = gasLimit(bundle, province, pm);
      if (Number.isFinite(limNow) && Math.abs(limNow - limPrev) > 1) parts.push(`destekli hak ${d0(limPrev)} → ${d0(limNow)} m³`);
    }
    reason = parts.length ? parts.join(' · ') : 'tüketim geçen ayla aynı seviyede';
  }

  return { type, hasData, forecast: fc, projectedBill, soFarBill, lastMonth, deltaTL, deltaPct, reason };
}

/**
 * Davranış önerilerinin TL karşılığı: mevcut kademede kalarak (kademe atlaması ayrı öneri olduğundan
 * çift sayılmaz) değişken kısmın orantılı azalması. Sabit bedeller düşülür.
 */
function linearSaving(bill: BillEstimate | null, m3: number, cutM3: number, fixedTL = 0) {
  if (!bill || m3 <= 0 || cutM3 <= 0) return 0;
  return Math.max(0, bill.total - fixedTL) * Math.min(1, cutM3 / m3);
}

/** Kademe sınırı önerileri için: gerçek tarife farkı (kademe atlaması dahil). */
function savingOf(bundle: TariffBundle, type: UtilityType, province: string, month: string, m3: number, cutM3: number, cal?: Calibration) {
  if (m3 <= 0 || cutM3 <= 0) return 0;
  return billFor(bundle, type, province, month, m3, cal).total - billFor(bundle, type, province, month, Math.max(0, m3 - cutM3), cal).total;
}

const isHeatingMonth = (m0: number) => m0 >= 9 || m0 <= 3; // Ekim–Nisan

/**
 * Kişisel öneriler: kullanıcının kendi ay sonu tahmini ve ilinin tarifesiyle TL hesaplanır, büyükten küçüğe.
 * Oranlar ihtiyatlı genel kabullerdir; başlıklarda "yaklaşık" vurgulanır.
 */
export function savingsTips(
  readings: Reading[], bills: PaidBill[], bundle: TariffBundle, province: string, householdSize: number, now = new Date(),
): Tip[] {
  const month = monthKey(now);
  const tips: Tip[] = [];

  // ── Doğalgaz ──
  const g = summarize(readings, bills, 'gas', bundle, province, now);
  const gCal = latestCalibration(bills, 'gas', bundle, province);
  const gM3 = g.forecast.projected;
  if (g.hasData && gM3 > 0) {
    const limit = gasLimit(bundle, province, month);
    if (Number.isFinite(limit) && gM3 > limit && gM3 < limit * 1.35) {
      const cut = gM3 - limit + 0.5;
      tips.push({
        id: 'gas-stay-k1', type: 'gas', effort: 'kolay',
        title: `${d1(cut)} m³ az kullan, devlet desteğini kaybetme`,
        body: `Ay sonu tahminin ${d1(gM3)} m³, destekli hakkın ${d1(limit)} m³. Hakkında kalırsan ayın tüm gazı destekli (ucuz) fiyattan faturalanır.`,
        monthlyTL: r0(savingOf(bundle, 'gas', province, month, gM3, cut, gCal)),
      });
    }
    if (isHeatingMonth(now.getMonth())) {
      tips.push({
        id: 'gas-1c', type: 'gas', effort: 'kolay',
        title: 'Oda sıcaklığını 1 °C düşür',
        body: 'Her 1 °C düşüş ısıtma tüketimini yaklaşık %6 azaltır. 21 °C konfor için genelde yeterlidir.',
        monthlyTL: r0(linearSaving(g.projectedBill, gM3, gM3 * 0.06)),
      });
      tips.push({
        id: 'gas-night', type: 'gas', effort: 'kolay',
        title: 'Gece ve evde yokken 17 °C’ye ayarla',
        body: 'Programlanabilir/oda termostatıyla gece ve gündüz boş saatlerde düşürmek yaklaşık %10 tasarruf sağlar.',
        monthlyTL: r0(linearSaving(g.projectedBill, gM3, gM3 * 0.10)),
      });
      tips.push({
        id: 'gas-valves', type: 'gas', effort: 'yatırım',
        title: 'Peteklere termostatik vana tak',
        body: 'Kullanılmayan odaları ayrı ayarlamak yaklaşık %10–15 tasarruf sağlar; vana başına birkaç yüz TL’lik yatırım.',
        monthlyTL: r0(linearSaving(g.projectedBill, gM3, gM3 * 0.12)),
      });
    } else {
      tips.push({
        id: 'gas-dhw', type: 'gas', effort: 'kolay',
        title: 'Kombi sıcak su sıcaklığını 45–50 °C yap',
        body: 'Yaz aylarında gazın büyük kısmı sıcak suya gider; gereksiz yüksek ayar yaklaşık %8 fazla tüketir.',
        monthlyTL: r0(linearSaving(g.projectedBill, gM3, gM3 * 0.08)),
      });
    }
  }

  // ── Su ──
  const w = summarize(readings, bills, 'water', bundle, province, now);
  const wCal = latestCalibration(bills, 'water', bundle, province);
  const wM3 = w.forecast.projected;
  const wFixed = bundle.water[province].fixedMonthly * (wCal?.factor ?? 1);
  if (w.hasData && wM3 > 0) {
    const people = Math.max(1, householdSize);
    const lpd = (wM3 * 1000) / w.forecast.daysInMonth / people;
    if (lpd > 180) {
      tips.push({
        id: 'water-leak-test', type: 'water', effort: 'kolay',
        title: 'Kaçak testi yap (2 dakika)',
        body: `Kişi başı günde ~${d0(lpd)} litre kullanıyorsun; bu yüksek. Klozet rezervuarı sızıntısı ayda birkaç m³ boşa akıtabilir.`,
        monthlyTL: r0(linearSaving(w.projectedBill, wM3, Math.min(wM3 * 0.15, 3), wFixed)),
      });
    }
    tips.push({
      id: 'water-shower', type: 'water', effort: 'kolay',
      title: 'Duşu 2 dakika kısalt',
      body: `Standart duş başlığı dakikada ~9 litre akıtır. ${people} kişi için ayda ~${d1((people * 2 * 9 * 30 / 1000))} m³ eder.`,
      monthlyTL: r0(linearSaving(w.projectedBill, wM3, Math.min(wM3 * 0.4, people * 2 * 9 * 30 / 1000), wFixed)),
    });
    tips.push({
      id: 'water-aerator', type: 'water', effort: 'yatırım',
      title: 'Musluklara perlatör (tasarruf başlığı) tak',
      body: 'Musluk debisini %30–50 düşürür; tanesi genelde 100 TL altındadır ve birkaç ayda kendini öder.',
      monthlyTL: r0(linearSaving(w.projectedBill, wM3, wM3 * 0.08, wFixed)),
    });
    // Su kademe sınırı yakınındaysa
    const tiers = bundle.water[province].tiers;
    const edge = tiers.find(t => t.upTo != null && wM3 > t.upTo && wM3 < t.upTo * 1.25);
    if (edge && edge.upTo != null) {
      const cut = wM3 - edge.upTo;
      tips.push({
        id: 'water-tier', type: 'water', effort: 'orta',
        title: `${d1(cut)} m³ az kullan, ucuz fiyat dilimine in`,
        body: `Belediye ${edge.upTo} m³ üstünü daha pahalı fiyatla faturalıyor; ay sonu tahminin ${d1(wM3)} m³.`,
        monthlyTL: r0(savingOf(bundle, 'water', province, month, wM3, cut, wCal)),
      });
    }
  }

  return tips.filter(t => t.monthlyTL >= 5).sort((a, b) => b.monthlyTL - a.monthlyTL);
}
