// Yeni okumanın doğrulanması. 'error' → kaydedilmez, 'warning' → kullanıcı onayı ister.

import { Reading, UtilityType } from './types';
import { sortReadings } from './consumption';
import { d1, d0 } from './fmt';

export type Severity = 'ok' | 'warning' | 'error';
export interface Check {
  severity: Severity;
  code: 'OK' | 'INVALID' | 'FUTURE' | 'BEFORE_LAST' | 'BACKWARD' | 'SPIKE' | 'SAME_AS_LAST' | 'TOO_SOON';
  message: string;
}

/** Konut için makul günlük üst sınırlar (m³/gün). Kış gazı yüksek olabilir. */
const SPIKE: Record<UtilityType, number> = { water: 3, gas: 25 };
const DAY = 86_400_000;

export function validateNewReading(
  existing: Reading[], type: UtilityType, index: number, date: Date, meterReset = false, now: Date = new Date(),
): Check {
  if (!Number.isFinite(index) || index < 0 || index > 99_999_999) {
    return { severity: 'error', code: 'INVALID', message: 'Geçerli bir sayaç değeri gir (yalnızca rakam).' };
  }
  if (date.getTime() > now.getTime() + 5 * 60_000) {
    return { severity: 'error', code: 'FUTURE', message: 'Okuma tarihi gelecekte olamaz.' };
  }
  const rs = sortReadings(existing.filter(r => r.type === type));
  const last = rs[rs.length - 1];
  if (!last || meterReset) return { severity: 'ok', code: 'OK', message: 'Okuma geçerli.' };

  const lastT = new Date(last.date).getTime();
  if (date.getTime() < lastT) {
    return { severity: 'error', code: 'BEFORE_LAST', message: 'Bu tarih son okumandan önce. Geçmiş okumayı düzenlemek için geçmiş listesini kullan.' };
  }
  if (index < last.index) {
    return {
      severity: 'error', code: 'BACKWARD',
      message: `Yeni değer (${fmt(index)}) son okumandan (${fmt(last.index)}) düşük. Sayaçlar geri gitmez — ` +
        `rakamları kontrol et. Sayaç değiştiyse "Sayaç değişti" seçeneğini işaretle.`,
    };
  }
  const days = (date.getTime() - lastT) / DAY;
  const diff = index - last.index;
  if (diff === 0) {
    return { severity: 'warning', code: 'SAME_AS_LAST', message: 'Değer son okumanla aynı — bu sürede hiç tüketim olmamış görünüyor. Doğru mu?' };
  }
  if (days < 1 / 24) {
    return { severity: 'warning', code: 'TOO_SOON', message: 'Son okumadan 1 saat bile geçmedi. Yine de kaydedilsin mi?' };
  }
  const perDay = diff / Math.max(days, 1);
  if (perDay > SPIKE[type]) {
    return {
      severity: 'warning', code: 'SPIKE',
      message: `${days < 1 ? 'Kısa sürede' : `${Math.round(days)} günde`} ${fmt(diff)} m³ (günde ~${d1(perDay)} m³). ` +
        `Bu, normalin çok üstünde. Rakamı doğru okuduğundan emin ol; doğruysa kaçak olabilir.`,
    };
  }
  return { severity: 'ok', code: 'OK', message: 'Okuma geçerli.' };
}

function fmt(n: number) {
  return n.toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}

/**
 * Türk sayaç formatlarını sayıya çevirir. Virgül ondalıktır; nokta binlik olabilir.
 * "43.817,05" → 43817.05 · "43817,05" → 43817.05 · "284510.372" (gaz) → 284510.372 · "00200" → 200
 */
export function parseMeterInput(raw: string, type: UtilityType): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!/^[\d.,]+$/.test(s)) return null;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  let norm: string;
  if (commas > 1) return null;
  if (commas === 1) norm = s.replace(/\./g, '').replace(',', '.');
  else if (dots > 1) norm = s.replace(/\./g, '');
  else if (dots === 1) {
    const [a, b] = s.split('.');
    // Su sayacında "43.817" binlik ayraçtır; gaz sayaçlarında nokta ondalıktır.
    norm = type === 'water' && a.length <= 3 && b.length === 3 ? a + b : s;
  } else norm = s;
  const v = Number(norm);
  return Number.isFinite(v) ? v : null;
}
