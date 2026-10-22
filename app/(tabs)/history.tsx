import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Dimensions } from 'react-native';
import Svg, { Rect, Text as SvgText, Line } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Trash2, Receipt, ScanLine } from 'lucide-react-native';
import { C, FONT, SPACE, typeColor, typeLabel } from '../../src/theme';
import { Screen, Header, Card, T, Segmented, Empty, Button, Badge, tap } from '../../src/ui';
import { useVerim, useActiveProperty, useTariffs } from '../../src/store/useVerim';
import { UtilityType } from '../../src/engine/types';
import { buildIntervals, monthlyUsage, monthKey, sortReadings } from '../../src/engine/consumption';
import { billFor } from '../../src/engine/bills';
import { latestCalibration } from '../../src/engine/summary';
import { tl, m3, num, monthName, monthShort, dateTimeTR } from '../../src/utils/format';

const { width: SW } = Dimensions.get('window');
const CW = SW - 2 * SPACE.lg - 2 * SPACE.lg;
const CH = 170;

export default function History() {
  const router = useRouter();
  const prop = useActiveProperty();
  const bundle = useTariffs();
  const readings = useVerim(s => s.readings);
  const bills = useVerim(s => s.bills);
  const removeReading = useVerim(s => s.removeReading);
  const removeBill = useVerim(s => s.removeBill);

  const types: UtilityType[] = [prop?.hasGas ? 'gas' : null, prop?.hasWater ? 'water' : null].filter(Boolean) as UtilityType[];
  const [type, setType] = useState<UtilityType>(types[0] ?? 'water');
  const [unit, setUnit] = useState<'tl' | 'm3'>('tl');
  const color = typeColor(type);

  const data = useMemo(() => {
    if (!prop) return null;
    const rs = readings.filter(r => r.propertyId === prop.id && r.type === type);
    const bs = bills.filter(b => b.propertyId === prop.id && b.type === type);
    const cal = latestCalibration(bs, type, bundle, prop.province);
    const usage = monthlyUsage(buildIntervals(rs, type));
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15)));
    const rows = months.map(m => {
      const u = usage.find(x => x.month === m);
      const paid = bs.find(b => b.month === m);
      const full = u && u.coveredDays > 0 ? (u.m3 / u.coveredDays) * u.daysInMonth : 0;
      const isCurrent = m === monthKey(now);
      const est = u ? billFor(bundle, type, prop.province, m, isCurrent ? u.m3 : full, cal) : null;
      return {
        month: m, m3: paid?.m3 ?? (isCurrent ? u?.m3 ?? 0 : full), est: est?.total ?? 0, paid: paid?.amount ?? null,
        partial: !!u && u.coveredDays < u.daysInMonth - 0.5, tier: est?.gas?.tier, isCurrent,
        hasData: !!u || !!paid,
      };
    });
    return { rows, readings: sortReadings(rs).reverse(), bills: [...bs].sort((a, b) => b.month.localeCompare(a.month)) };
  }, [prop, readings, bills, bundle, type]);

  if (!prop || !data) return null;
  const vals = data.rows.map(r => (unit === 'tl' ? r.paid ?? r.est : r.m3));
  const max = Math.max(1, ...vals);
  const bw = CW / 12 - 6;
  const anyData = data.rows.some(r => r.hasData);

  const confirmDelete = (title: string, fn: () => void) =>
    Alert.alert(title, 'Bu kayıt silinecek. Hesaplamalar buna göre güncellenir.', [
      { text: 'Vazgeç', style: 'cancel' }, { text: 'Sil', style: 'destructive', onPress: fn },
    ]);

  return (
    <Screen>
      <Header title="Geçmiş" subtitle={`${prop.name} · ${prop.province}`} />
      {types.length > 1 && <Segmented value={type} onChange={setType} options={types.map(t => ({ value: t, label: typeLabel(t), color: typeColor(t) }))} />}
      <View style={{ height: SPACE.md }} />

      {!anyData ? (
        <Empty icon={<ScanLine size={28} color={color} />} title="Henüz geçmiş yok"
          body="İki okumadan sonra aylık tüketim ve fatura grafiğin burada oluşur. Geçmiş faturalarını girerek hemen başlayabilirsin."
          action={<View style={{ gap: 8 }}>
            <Button title="Sayacı oku" color={color} onPress={() => router.push({ pathname: '/scan', params: { type } })} />
            <Button kind="secondary" title="Geçmiş fatura gir" onPress={() => router.push({ pathname: '/bill', params: { type } })} />
          </View>} />
      ) : (
        <Card>
          <View style={s.rowBetween}>
            <T.Title>Son 12 ay</T.Title>
            <View style={{ width: 120 }}>
              <Segmented value={unit} onChange={setUnit} options={[{ value: 'tl', label: '₺' }, { value: 'm3', label: 'm³' }]} />
            </View>
          </View>
          <Svg width={CW} height={CH + 22} style={{ marginTop: SPACE.md }}>
            <Line x1={0} y1={CH} x2={CW} y2={CH} stroke={C.border} strokeWidth={1} />
            {data.rows.map((r, i) => {
              const v = vals[i];
              const h = v > 0 ? Math.max(3, (v / max) * (CH - 18)) : 0;
              const x = i * (CW / 12) + 3;
              const fill = r.tier === 2 ? C.danger : color;
              return (
                <React.Fragment key={r.month}>
                  {h > 0 && <Rect x={x} y={CH - h} width={bw} height={h} rx={4} fill={fill} opacity={r.partial || r.isCurrent ? 0.45 : r.paid != null ? 1 : 0.8} />}
                  <SvgText x={x + bw / 2} y={CH + 15} fontSize={9} fontFamily="System" fill={r.isCurrent ? C.text : C.textMuted} textAnchor="middle">{monthShort(r.month)}</SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
          <View style={s.legend}>
            <Legend color={color} label="Okumalardan" opacity={0.8} />
            <Legend color={color} label="Eksik / bu ay" opacity={0.45} />
            {type === 'gas' ? <Legend color={C.danger} label="Desteksiz fiyat" /> : null}
          </View>
        </Card>
      )}

      {anyData && (
        <Card>
          <T.Title style={{ marginBottom: SPACE.sm }}>Aylar</T.Title>
          {[...data.rows].reverse().filter(r => r.hasData).map(r => (
            <View key={r.month} style={s.monthRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.monthName}>{monthName(r.month)}{r.isCurrent ? ' (devam ediyor)' : ''}</Text>
                <T.Small>{m3(r.m3)}{r.partial && !r.isCurrent ? ' · eksik veriden tamamlandı' : ''}{r.tier === 2 ? ' · desteksiz fiyat' : ''}</T.Small>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {r.paid != null ? <><Text style={s.monthTL}>{tl(r.paid)}</Text><Badge text="fatura" color={C.ok} /></>
                  : <><Text style={s.monthTL}>{tl(r.est)}</Text><T.Small>tahmini</T.Small></>}
              </View>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <View style={s.rowBetween}>
          <T.Title>Faturalar</T.Title>
          <TouchableOpacity onPress={() => { tap(); router.push({ pathname: '/bill', params: { type } }); }} style={s.addBtn}>
            <Receipt size={16} color={C.brand} /><Text style={s.addText}>Ekle</Text>
          </TouchableOpacity>
        </View>
        {data.bills.length === 0 ? <T.Small style={{ marginTop: SPACE.sm }}>Fatura girdiğinde tahminler senin gerçek birim fiyatına göre ayarlanır.</T.Small>
          : data.bills.map(b => (
            <View key={b.id} style={s.item}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{monthName(b.month)}</Text>
                <T.Small>{m3(b.m3)} · {tl(b.amount)} · {(b.amount / b.m3).toFixed(2).replace('.', ',')} ₺/m³</T.Small>
              </View>
              <TouchableOpacity onPress={() => confirmDelete('Faturayı sil', () => removeBill(b.id))} style={s.del} accessibilityLabel="Faturayı sil">
                <Trash2 size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
      </Card>

      <Card>
        <T.Title style={{ marginBottom: SPACE.sm }}>Okumalar</T.Title>
        {data.readings.length === 0 ? <T.Small>Henüz okuma yok.</T.Small> : data.readings.map((r, i) => {
          const prev = data.readings[i + 1];
          const diff = prev && !r.meterReset ? r.index - prev.index : null;
          return (
            <View key={r.id} style={s.item}>
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{num(r.index)} m³ {r.meterReset ? '· yeni sayaç' : ''}</Text>
                <T.Small>{dateTimeTR(r.date)}{diff != null ? ` · +${num(Math.round(diff * 1000) / 1000)} m³` : i === data.readings.length - 1 ? ' · başlangıç' : ''}{r.source === 'ocr' ? ' · kamera' : ''}</T.Small>
              </View>
              <TouchableOpacity onPress={() => confirmDelete('Okumayı sil', () => removeReading(r.id))} style={s.del} accessibilityLabel="Okumayı sil">
                <Trash2 size={18} color={C.textMuted} />
              </TouchableOpacity>
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

function Legend({ color, label, opacity = 1 }: { color: string; label: string; opacity?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, opacity }} />
      <Text style={{ color: C.textDim, fontSize: FONT.xs }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  legend: { flexDirection: 'row', gap: SPACE.lg, marginTop: SPACE.sm, flexWrap: 'wrap' },
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.divider },
  monthName: { color: C.text, fontSize: FONT.md, fontWeight: '600' },
  monthTL: { color: C.text, fontSize: FONT.md, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.divider, minHeight: 52 },
  itemTitle: { color: C.text, fontSize: FONT.md, fontWeight: '600', fontVariant: ['tabular-nums'] },
  del: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8 },
  addText: { color: C.brand, fontWeight: '700' },
});
