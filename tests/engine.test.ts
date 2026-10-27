import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIntervals, monthlyUsage, forecastMonth } from '../src/engine/consumption';
import { DEFAULT_BUNDLE as B, ALL_PROVINCES } from '../src/engine/tariffs';
import { gasBill, waterBill, waterBillRaw, calibrate, gasBillRaw } from '../src/engine/bills';
import { validateNewReading, parseMeterInput } from '../src/engine/validation';
import { gasTierInsight, leakTestResult, anomalyInsight } from '../src/engine/insights';
import { Reading } from '../src/engine/types';

const R = (date: string, index: number, type: 'water' | 'gas' = 'gas', extra: Partial<Reading> = {}): Reading =>
  ({ id: date + index, propertyId: 'p', type, date, index, source: 'manual', ...extra });

test('81 il var, her ilin 12 aylık gaz limiti ve su tarifesi var', () => {
  assert.equal(ALL_PROVINCES.length, 81);
  for (const il of ALL_PROVINCES) {
    assert.equal(B.gas.provinces[il].limits.length, 12, il);
    assert.ok(B.water[il].tiers.length > 0, il);
  }
});

test('dönem tüketimi aylara gün oranında dağıtılır', () => {
  const ivs = buildIntervals([R('2026-09-21T00:00:00', 1000), R('2026-10-11T00:00:00', 1020)], 'gas');
  assert.equal(ivs.length, 1);
  const mu = monthlyUsage(ivs);
  assert.equal(mu.length, 2);
  assert.equal(mu[0].month, '2026-09');
  assert.ok(Math.abs(mu[0].m3 - 10) < 0.01, `Eylül ${mu[0].m3}`); // 10 gün
  assert.ok(Math.abs(mu[1].m3 - 10) < 0.01, `Ekim ${mu[1].m3}`);  // 10 gün
  assert.ok(Math.abs(mu[0].m3 + mu[1].m3 - 20) < 1e-9);
});

test('sayaç değişimi zinciri sıfırlar, negatif tüketim üretmez', () => {
  const ivs = buildIntervals([
    R('2026-08-01T00:00:00', 5000), R('2026-09-01T00:00:00', 5030),
    R('2026-09-10T00:00:00', 2, 'gas', { meterReset: true }), R('2026-10-01T00:00:00', 22),
  ], 'gas');
  assert.deepEqual(ivs.map(i => i.m3), [30, 20]);
});

test('gaz: limit altı 1. kademe, 0,01 m³ üstü TÜM ay 2. kademe', () => {
  const lim = B.gas.provinces['İstanbul'].limits[9]; // Ekim 43.73
  assert.equal(lim, 43.73);
  const under = gasBill(B, 'İstanbul', '2026-10', lim);
  const over = gasBill(B, 'İstanbul', '2026-10', lim + 0.01);
  assert.equal(under.gas!.tier, 1);
  assert.equal(over.gas!.tier, 2);
  assert.ok(over.total > under.total * 1.5, `${under.total} → ${over.total}`);
});

test('gaz Ankara vergili birim fiyat basında açıklanan 16,84 / 25,69 TL ile tutarlı', () => {
  const k1 = gasBillRaw(B, 'Ankara', '2026-10', 10).total / 10;
  const k2 = gasBillRaw(B, 'Ankara', '2026-10', 100).total / 100;
  assert.ok(Math.abs(k1 - 16.84) < 0.05, `k1 ${k1}`);
  assert.ok(Math.abs(k2 - 25.69) < 0.05, `k2 ${k2}`);
});

test('su kademeleri doğru sınırda geçer', () => {
  const w = B.water['İstanbul'];
  const t15 = waterBillRaw(w, 15).tariff;
  const t16 = waterBillRaw(w, 16).tariff;
  // İnsani su hakkı: 15 m³ → %20 = 3 m³ ücretsiz; kademe sınırı gerçek tüketimde kalır
  assert.ok(Math.abs(t15 - 12 * 65.52) < 1e-6, `${t15}`);
  assert.ok(Math.abs(t16 - t15 - 99.83) < 1e-6, `${t16 - t15}`);
  assert.ok(Math.abs(waterBillRaw(w, 5).tariff - 4 * 65.52) < 1e-6, '5 m³ → 1 m³ ücretsiz');
  const a30 = waterBillRaw(B.water['Ankara'], 30).tariff, a31 = waterBillRaw(B.water['Ankara'], 31).tariff;
  assert.ok(Math.abs(a31 - a30 - 105.24) < 1e-6);
});

test('kalibrasyon gerçek faturayı birebir verir, saçma girişi reddeder', () => {
  const c = calibrate(B, 'water', 'Konya', '2026-10', 12, 700);
  assert.ok(c.ok);
  if (c.ok) assert.equal(waterBill(B, 'Konya', '2026-10', 12, c.cal).total, 700);
  assert.equal(calibrate(B, 'water', 'Konya', '2026-10', 12, 70000).ok, false);
});

test('doğrulama: geri okuma hata, sayaç değişimi serbest, sıçrama uyarı, gelecek tarih hata', () => {
  const ex = [R('2026-10-01T00:00:00', 43817, 'water')];
  const now = new Date('2026-10-22T12:00:00');
  assert.equal(validateNewReading(ex, 'water', 43800, now, false, now).code, 'BACKWARD');
  assert.equal(validateNewReading(ex, 'water', 12, now, true, now).severity, 'ok');
  assert.equal(validateNewReading(ex, 'water', 43900, now, false, now).code, 'SPIKE');
  assert.equal(validateNewReading(ex, 'water', 43830, now, false, now).severity, 'ok');
  assert.equal(validateNewReading(ex, 'water', 43830, new Date('2026-11-01'), false, now).code, 'FUTURE');
  assert.equal(validateNewReading(ex, 'water', 43830, new Date('2026-09-01'), false, now).code, 'BEFORE_LAST');
});

test('sayaç girişi ayrıştırma', () => {
  assert.equal(parseMeterInput('43.817,05', 'water'), 43817.05);
  assert.equal(parseMeterInput('43817,05', 'water'), 43817.05);
  assert.equal(parseMeterInput('43.817', 'water'), 43817);
  assert.equal(parseMeterInput('284510.372', 'gas'), 284510.372);
  assert.equal(parseMeterInput('00200', 'water'), 200);
  assert.equal(parseMeterInput('12a', 'water'), null);
  assert.equal(parseMeterInput('1,2,3', 'water'), null);
});

test('kademe uyarısı: gidişat limiti aşacaksa uyarır ve günlük bütçe verir', () => {
  const rs = [R('2026-10-01T00:00:00', 1000), R('2026-10-15T00:00:00', 1028)]; // 2 m³/gün → ay sonu ~62 > 43.73
  const ins = gasTierInsight(rs, B, 'İstanbul', new Date('2026-10-15T12:00:00'));
  assert.ok(ins);
  assert.equal(ins!.level, 'warning');
  assert.ok(ins!.impactTL! > 0);
  const ok = gasTierInsight([R('2026-10-01T00:00:00', 1000), R('2026-10-15T00:00:00', 1007)], B, 'İstanbul', new Date('2026-10-15T12:00:00'));
  assert.equal(ok!.level, 'info');
});

test('ay sonu tahmini kapsanmayan günleri son hızla doldurur', () => {
  const fc = forecastMonth([R('2026-10-01T00:00:00', 0, 'water'), R('2026-10-11T00:00:00', 10, 'water')], 'water', new Date('2026-10-11T00:00:00'));
  assert.ok(Math.abs(fc.measured - 10) < 1e-9);
  assert.ok(Math.abs(fc.projected - 31) < 1e-6, `${fc.projected}`);
});

test('kaçak testi litre hesabı', () => {
  assert.equal(leakTestResult(100.000, 100.000, 120).leak, false);
  const r = leakTestResult(100.000, 100.010, 120); // 10 L / 2 saat
  assert.equal(r.leak, true);
  assert.ok(Math.abs(r.perDayL - 120) < 1e-6);
});

test('gaz anomalisi geçen yıl yoksa üretilmez (mevsimsel yanılgı yok)', () => {
  const rs = [R('2026-07-01T00:00:00', 0), R('2026-08-01T00:00:00', 20), R('2026-09-01T00:00:00', 40), R('2026-10-01T00:00:00', 60), R('2026-11-01T00:00:00', 200)];
  assert.equal(anomalyInsight(rs, 'gas'), null);
});

import { summarize, savingsTips, billBasedProjection } from '../src/engine/summary';
import { gasLimit } from '../src/engine/bills';
const DEFAULT_BUNDLE = B;

test('özet: geçen ay gerçek fatura varsa onunla kıyaslar ve nedeni açıklar', () => {
  const rs = [R('2026-10-01T00:00:00', 1000), R('2026-10-15T00:00:00', 1028)];
  const bills = [{ id: 'b', propertyId: 'p', type: 'gas' as const, month: '2026-09', m3: 25, amount: 420 }];
  const s = summarize(rs, bills, 'gas', B, 'İstanbul', new Date('2026-10-15T12:00:00'));
  assert.ok(s.projectedBill && s.lastMonth?.isActual);
  assert.equal(s.lastMonth!.amount, 420);
  assert.ok(s.deltaTL! > 0);
  assert.match(s.reason!, /pahalı fiyat/);
});

test('öneriler TL bazlı, büyükten küçüğe, kademe sınırı önerisi en üstte', () => {
  const rs = [R('2026-10-01T00:00:00', 1000), R('2026-10-15T00:00:00', 1022), R('2026-10-01T00:00:00', 500, 'water'), R('2026-10-15T00:00:00', 510, 'water')];
  const tips = savingsTips(rs, [], B, 'İstanbul', 3, new Date('2026-10-15T12:00:00'));
  assert.ok(tips.length >= 3);
  assert.equal(tips[0].id, 'gas-stay-k1');
  for (let i = 1; i < tips.length; i++) assert.ok(tips[i - 1].monthlyTL >= tips[i].monthlyTL);
});

import { pickMeterReading } from '../src/engine/ocrPick';

test('OCR: iri sayaç rakamını seçer, seri no ve birimleri eler, son okumaya yakın olanı öne alır', () => {
  const lines = [
    { text: 'G4 Qmax 6 m3/h 2019', height: 12 },
    { text: 'No 12345678901', height: 10 },
    { text: '0 4 3 8 1 7 , 0 5', height: 60 },
    { text: 'm³', height: 20 },
  ];
  const c = pickMeterReading(lines, 43790);
  assert.equal(c[0].value, 43817.05);
  const c2 = pickMeterReading([{ text: '01234', height: 50 }, { text: '04382', height: 48 }], 4370);
  assert.equal(c2[0].value, 4382);
});

import { inferGasTier } from '../src/engine/bills';

test('gaz kalibrasyonu: 1. kademeden kesilmiş fatura, takvim ayı limiti aşılsa bile 1. kademe kabul edilir', () => {
  const k1 = gasBillRaw(B, 'İstanbul', '2026-09', 61, 1).total;
  assert.equal(inferGasTier(B, 'İstanbul', '2026-09', 61, k1 * 1.05), 1);
  const c = calibrate(B, 'gas', 'İstanbul', '2026-09', 61, k1 * 1.05);
  assert.ok(c.ok && Math.abs(c.cal.factor - 1.05) < 1e-9, 'faktör yalnızca dağıtım/vergi farkını yansıtır');
  const k2 = gasBillRaw(B, 'İstanbul', '2026-09', 61, 2).total;
  assert.equal(inferGasTier(B, 'İstanbul', '2026-09', 61, k2), 2);
});

import { protectedSavings, checkBillAgainstReadings } from '../src/engine/insights';

test('korunan para: uyarılan ve 1. kademede kapanan ay sayılır, aşılan ay sayılmaz', () => {
  // İstanbul Eylül limiti 29.23: Eylül 28 m³ (altında), Ağustos 30 m³ (limit 26.72 üstü)
  const rs = [R('2026-08-01T00:00:00', 1000), R('2026-09-01T00:00:00', 1030), R('2026-10-01T00:00:00', 1058)];
  const p = protectedSavings(rs, ['2026-08', '2026-09'], B, 'İstanbul', new Date('2026-10-15T12:00:00'));
  assert.equal(p.months.length, 1);
  assert.equal(p.months[0].month, '2026-09');
  assert.ok(p.total > 150, `${p.total}`);
});

test('fatura kontrolü: okumalardan belirgin fazlaysa uyarır, yakınsa onaylar', () => {
  const rs = [R('2026-09-01T00:00:00', 500, 'water'), R('2026-10-01T00:00:00', 515, 'water')];
  assert.equal(checkBillAgainstReadings(rs, 'water', '2026-09', 15.5).status, 'ok');
  assert.equal(checkBillAgainstReadings(rs, 'water', '2026-09', 22).status, 'high');
  assert.equal(checkBillAgainstReadings(rs, 'water', '2026-09', 17.5).status, 'ok', 'dönem farkı toleransı');
  assert.equal(checkBillAgainstReadings(rs, 'water', '2026-09', 9).status, 'low');
  assert.equal(checkBillAgainstReadings(rs, 'water', '2026-07', 9).status, 'unknown');
});

import { compareToAverage, diagnose, combinedGasPct, HomeProfile } from '../src/engine/diagnosis';

test('ortalamayla kıyas: limit = ortalama × 1,75; ev büyüklüğüyle ölçeklenir', () => {
  const c = compareToAverage(43.73, 43.73, 'İstanbul');
  assert.ok(c && Math.abs(c.ratio - 1.75) < 1e-9);
  assert.match(c!.sentence, /%75 fazla/);
  const home = { sizeM2: '120_180', position: 'middle' } as HomeProfile;
  assert.ok(compareToAverage(43.73, 43.73, 'İstanbul', home)!.ratio < 1.75);
});

test('teşhis: sıcak ev + termostatsız + bakımsız → en büyük nedenler sıralı, birleşik oran makul', () => {
  const home: HomeProfile = { sizeM2: '80_120', position: 'middle', boilerAge: 'gt10', boilerService: 'never', roomTemp: '23_24',
    nightMode: 'same', roomThermostat: false, trvValves: false, windows: 'double_old', radiatorsCovered: true, showerMin: 'gt10' };
  const cs = diagnose(home, 2000, 800, 18, 3, 10);
  assert.ok(cs.length >= 6);
  for (let i = 1; i < cs.length; i++) assert.ok(cs[i - 1].monthlyTL >= cs[i].monthlyTL);
  const comb = combinedGasPct(cs);
  assert.ok(comb > 0.3 && comb < 0.7, `${comb}`);
  // Yaz ayında ısınma kaynaklı neden çıkmaz
  assert.equal(diagnose(home, 400, 800, 18, 3, 6).filter(c => c.type === 'gas').length, 0);
});

test('ilk gün: okuma yokken son faturadan mevsime göre tahmin', () => {
  const now = new Date(2026, 10, 10); // Kasım
  const bills = [{ id: 'b', propertyId: 'p', type: 'gas' as const, month: '2026-10', m3: 60, amount: 1100 }];
  const bp = billBasedProjection(bills, 'gas', DEFAULT_BUNDLE, 'Ankara', now)!;
  const lo = gasLimit(DEFAULT_BUNDLE, 'Ankara', '2026-10'), ln = gasLimit(DEFAULT_BUNDLE, 'Ankara', '2026-11');
  assert.ok(Math.abs(bp.m3 - (60 / 31) * (ln / lo) * 30) < 0.01);
  const s = summarize([], bills, 'gas', DEFAULT_BUNDLE, 'Ankara', now);
  assert.equal(s.basis, 'bill');
  assert.ok(s.hasData && s.projectedBill && s.projectedBill.total > 0);
  assert.equal(billBasedProjection(bills, 'gas', DEFAULT_BUNDLE, 'Ankara', new Date(2027, 3, 1)), null); // 3 aydan eski
});

import { billingPeriod, forecastPeriod } from '../src/engine/consumption';
import { periodGasLimit } from '../src/engine/bills';
test('fatura dönemi: 15inden 15ine, limit günlük orantılı, uyarı döneme göre', () => {
  const now = new Date(2026, 10, 20); // 20 Kasım
  const p = billingPeriod(now, 15)!;
  assert.equal(p.start.getDate(), 15); assert.equal(p.start.getMonth(), 10); assert.equal(p.end.getMonth(), 11);
  const before = billingPeriod(new Date(2026, 10, 3), 15)!;
  assert.equal(before.start.getMonth(), 9); // 15 Ekim – 15 Kasım
  const lim = periodGasLimit(B, 'Ankara', before.start, before.end);
  const lo = gasLimit(B, 'Ankara', '2026-10'), ln = gasLimit(B, 'Ankara', '2026-11');
  assert.ok(Math.abs(lim - (lo / 31 * 17 + ln / 30 * 14)) < 0.1);
  const rs: Reading[] = [
    { id: '1', propertyId: 'p', type: 'gas', date: new Date(2026, 10, 15).toISOString(), index: 1000, source: 'manual' },
    { id: '2', propertyId: 'p', type: 'gas', date: new Date(2026, 10, 20).toISOString(), index: 1020, source: 'manual' },
  ];
  const fc = forecastPeriod(rs, 'gas', p, now);
  assert.ok(Math.abs(fc.measured - 20) < 0.01);
  assert.ok(Math.abs(fc.projected - (20 + (p.days - 5) * 4)) < 0.01);
  const ins = gasTierInsight(rs, B, 'Ankara', now, undefined, p);
  assert.ok(ins && /fatura döneminde|dönem sonunda|bu dönemki|Dönem sonunda/i.test(ins.title + ins.body));
  assert.equal(billingPeriod(now, undefined), null);
});
