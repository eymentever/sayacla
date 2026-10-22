import { useMemo } from 'react';
import { useVerim, useActiveProperty, useTariffs } from '../store/useVerim';
import { summarize, savingsTips, latestCalibration } from '../engine/summary';
import { allInsights } from '../engine/insights';

/** Aktif mülk için ana sayfa verisi — tamamı motor tarafından türetilir. */
export function useDashboard(now = new Date()) {
  const prop = useActiveProperty();
  const bundle = useTariffs();
  const readings = useVerim(s => s.readings);
  const bills = useVerim(s => s.bills);
  const household = useVerim(s => s.profile.householdSize);
  const dayKey = now.toISOString().slice(0, 10);

  return useMemo(() => {
    if (!prop) return null;
    const rs = readings.filter(r => r.propertyId === prop.id);
    const bs = bills.filter(b => b.propertyId === prop.id);
    const d = new Date();
    const water = prop.hasWater ? summarize(rs, bs, 'water', bundle, prop.province, d) : null;
    const gas = prop.hasGas ? summarize(rs, bs, 'gas', bundle, prop.province, d) : null;
    const insights = allInsights(rs, bundle, prop.province, d, latestCalibration(bs, 'gas', bundle, prop.province))
      .filter(i => (i.type === 'water' ? prop.hasWater : prop.hasGas));
    const tips = savingsTips(rs, bs, bundle, prop.province, household, d)
      .filter(t => (t.type === 'water' ? prop.hasWater : prop.hasGas));
    const totalProjected = (water?.projectedBill?.total ?? 0) + (gas?.projectedBill?.total ?? 0);
    const lastTotal = (water?.lastMonth?.amount ?? 0) + (gas?.lastMonth?.amount ?? 0);
    const comparable = [water, gas].filter(Boolean).every(x => !x!.hasData || (x!.lastMonth && x!.forecast.reliable));
    return {
      prop, bundle, water, gas, insights, tips, totalProjected,
      lastTotal: comparable && lastTotal > 0 ? lastTotal : null,
      readingsCount: rs.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop, bundle, readings, bills, household, dayKey]);
}
