// Okumalardan tüketim türetme: dönemler, takvim ayına gün bazlı dağıtım, tahmin.

import { Reading, Interval, MonthUsage, UtilityType } from './types';

const DAY = 86_400_000;

export const monthKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const daysInMonth = (y: number, m0: number): number => new Date(y, m0 + 1, 0).getDate();

export function sortReadings(readings: Reading[]): Reading[] {
  return [...readings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Tek mülk + tek tür için okumalar → dönemler. meterReset okumaları zinciri yeniden başlatır. */
export function buildIntervals(readings: Reading[], type: UtilityType): Interval[] {
  const rs = sortReadings(readings.filter(r => r.type === type));
  const out: Interval[] = [];
  for (let i = 1; i < rs.length; i++) {
    const prev = rs[i - 1];
    const cur = rs[i];
    if (cur.meterReset) continue;
    const ms = new Date(cur.date).getTime() - new Date(prev.date).getTime();
    if (ms <= 0) continue;
    const m3 = cur.index - prev.index;
    if (m3 < 0) continue; // doğrulama katmanı engeller; burada savunma
    const days = ms / DAY;
    out.push({ type, start: prev.date, end: cur.date, m3, days, perDay: m3 / days });
  }
  return out;
}

/**
 * Dönem tüketimini, kapsadığı takvim günlerine eşit dağıtarak aylık toplam çıkarır.
 * Örn. 20 Eyl → 10 Eki arası 30 m³: Eylül'e ~10.5, Ekim'e ~9.5 gün payı.
 */
export function monthlyUsage(intervals: Interval[]): MonthUsage[] {
  const map = new Map<string, { m3: number; ms: number; dim: number }>();
  for (const iv of intervals) {
    let t = new Date(iv.start).getTime();
    const end = new Date(iv.end).getTime();
    const rate = iv.m3 / (end - t);
    while (t < end) {
      const d = new Date(t);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const segEnd = Math.min(end, nextMonth);
      const key = monthKey(d);
      const cur = map.get(key) ?? { m3: 0, ms: 0, dim: daysInMonth(d.getFullYear(), d.getMonth()) };
      cur.m3 += rate * (segEnd - t);
      cur.ms += segEnd - t;
      map.set(key, cur);
      t = segEnd;
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      m3: v.m3,
      coveredDays: Math.min(v.dim, v.ms / DAY),
      daysInMonth: v.dim,
    }));
}

/** Son N günün ortalama günlük tüketimi (en güncel dönemlerden, ağırlıklı). */
export function recentPerDay(intervals: Interval[], windowDays = 30): number | null {
  if (intervals.length === 0) return null;
  let m3 = 0;
  let days = 0;
  for (let i = intervals.length - 1; i >= 0 && days < windowDays; i--) {
    const iv = intervals[i];
    const take = Math.min(iv.days, windowDays - days);
    m3 += iv.perDay * take;
    days += take;
  }
  return days > 0 ? m3 / days : null;
}

export interface MonthForecast {
  month: string;
  /** Okumalarla kesinleşen kısım */
  measured: number;
  /** Ay sonu tahmini toplam */
  projected: number;
  coveredDays: number;
  daysInMonth: number;
  /** Tahmin güvenilir mi: ≥ 3 gün veri ve son okuma 45 günden eski değil */
  reliable: boolean;
}

/**
 * Ay sonu tahmini: ölçülen + (kapsanmayan günler × son günlük ortalama).
 * Son okumadan bugüne kadar olan süre de tahmine girer.
 */
export function forecastMonth(
  readings: Reading[],
  type: UtilityType,
  now: Date = new Date(),
): MonthForecast {
  const ivs = buildIntervals(readings, type);
  const key = monthKey(now);
  const dim = daysInMonth(now.getFullYear(), now.getMonth());
  const mu = monthlyUsage(ivs).find(m => m.month === key);
  const measured = mu?.m3 ?? 0;
  const covered = mu?.coveredDays ?? 0;
  const rate = recentPerDay(ivs);
  const rs = sortReadings(readings.filter(r => r.type === type));
  const last = rs[rs.length - 1];
  const staleDays = last ? (now.getTime() - new Date(last.date).getTime()) / DAY : Infinity;
  const projected = rate == null ? measured : measured + Math.max(0, dim - covered) * rate;
  return {
    month: key,
    measured,
    projected,
    coveredDays: covered,
    daysInMonth: dim,
    reliable: rate != null && ivs.reduce((s, i) => s + i.days, 0) >= 3 && staleDays <= 45,
  };
}
