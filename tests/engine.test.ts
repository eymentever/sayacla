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
  assert.ok(Math.abs(t15 - 15 * 46.62) < 1e-6);
  assert.ok(Math.abs(t16 - t15 - 71.04) < 1e-6);
  assert.ok(waterBill(B, 'İstanbul', '2026-10', 0).total > 0, 'sabit bedel 0 m³ te de var');
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
