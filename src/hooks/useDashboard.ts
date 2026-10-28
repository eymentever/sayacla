import { useMemo } from 'react';
import { useSayacla, useActiveProperty, useTariffs } from '../store/useSayacla';
import { summarize, savingsTips, latestCalibration } from '../engine/summary';
import { allInsights } from '../engine/insights';
import { billingPeriod } from '../engine/consumption';

/** Aktif mülk için ana sayfa verisi — tamamı motor tarafından türetilir. */
export function useDashboard(now = new Date()) {
  const prop = useActiveProperty();
  const bundle = useTariffs();
  const readings = useSayacla(s => s.readings);
  const bills = useSayacla(s => s.bills);
  const household = useSayacla(s => s.profile.householdSize);
  const dayKey = now.toISOString().slice(0, 10);

  return useMemo(() => {
    if (!prop) return null;
    const rs = readings.filter(r => r.propertyId === prop.id);
    const bs = bills.filter(b => b.propertyId === prop.id);
    const d = new Date();
    const water = prop.hasWater ? summarize(rs, bs, 'water', bundle, prop.province, d) : null;
    const gasPeriod = prop.gasMode === 'central' ? null : billingPeriod(d, prop.billReadDay);
    const gas = prop.hasGas ? summarize(rs, bs, 'gas', bundle, prop.province, d, gasPeriod) : null;
    const insights = allInsights(rs, bundle, prop.province, d, latestCalibration(bs, 'gas', bundle, prop.province), gasPeriod)
      .filter(i => (i.type === 'water' ? prop.hasWater : prop.hasGas));
    const tips = savingsTips(rs, bs, bundle, prop.province, household, d, gasPeriod)
      .filter(t => (t.type === 'water' ? prop.hasWater : prop.hasGas));
    const totalProjected = (water?.projectedBill?.total ?? 0) + (gas?.projectedBill?.total ?? 0);
    const lastTotal = (water?.lastMonth?.amount ?? 0) + (gas?.lastMonth?.amount ?? 0);
    const comparable = [water, gas].filter(Boolean).every(x => !x!.hasData || (x!.lastMonth && (x!.forecast.reliable || x!.basis === 'bill')));
    return {
      prop, bundle, water, gas, insights, tips, totalProjected, gasPeriod,
      lastTotal: comparable && lastTotal > 0 ? lastTotal : null,
      readingsCount: rs.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop, bundle, readings, bills, household, dayKey]);
}
