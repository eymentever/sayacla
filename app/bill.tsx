import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { C, FONT, RADIUS, SPACE, typeColor, typeLabel } from '../src/theme';
import { Screen, T, Field, Button, Segmented, Card, Row, tap } from '../src/ui';
import { useVerim, useActiveProperty, useTariffs } from '../src/store/useVerim';
import { UtilityType } from '../src/engine/types';
import { calibrate, billFor, inferGasTier } from '../src/engine/bills';
import { checkBillAgainstReadings } from '../src/engine/insights';
import { monthKey } from '../src/engine/consumption';
import { parseMeterInput } from '../src/engine/validation';
import { monthName, tl } from '../src/utils/format';
import { onBillSaved } from '../src/services/analytics';

export default function BillScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const prop = useActiveProperty();
  const bundle = useTariffs();
  const addBill = useVerim(s => s.addBill);
  const readings = useVerim(s => s.readings);

  const types: UtilityType[] = [prop?.hasGas ? 'gas' : null, prop?.hasWater ? 'water' : null].filter(Boolean) as UtilityType[];
  const [type, setType] = useState<UtilityType>((params.type as UtilityType) && types.includes(params.type as UtilityType) ? (params.type as UtilityType) : types[0] ?? 'water');
  const now = new Date();
  const months = useMemo(() => Array.from({ length: 13 }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 15))), []);
  const [month, setMonth] = useState(months[1]);
  const [qty, setQty] = useState('');
  const [qtyUnit, setQtyUnit] = useState<'m3' | 'kwh'>('m3');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!prop) return null;
  const color = typeColor(type);
  const q = parseMeterInput(qty, 'gas');
  const a = parseMeterInput(amount, 'gas');
  const m3v = q == null ? null : type === 'gas' && qtyUnit === 'kwh' ? q / bundle.gas.national.kwhPerM3 : q;
  const est = m3v && m3v > 0 ? billFor(bundle, type, prop.province, month, m3v) : null;

  const save = () => {
    if (!m3v || !a) { setError('Tüketim ve tutarı gir.'); return; }
    const c = calibrate(bundle, type, prop.province, month, m3v, a);
    if (!c.ok) { setError(c.reason); return; }
    const rec = { propertyId: prop.id, type, month, m3: Math.round(m3v * 1000) / 1000, amount: a };
    addBill(rec);
    onBillSaved(rec);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  return (
    <Screen tabs={false}>
      <View style={s.head}>
        <T.Title style={{ fontSize: FONT.xl, flex: 1 }}>Fatura gir</T.Title>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Kapat"><X size={24} color={C.textDim} /></TouchableOpacity>
      </View>
      <T.Body dim style={{ marginBottom: SPACE.lg }}>
        Faturadaki tüketimi ve ödenecek tutarı gir. Sayaçla bunu senin gerçek birim fiyatın olarak kullanır; belediye zamları ve dağıtım bedelleri otomatik hesaba girer.
      </T.Body>

      {types.length > 1 && <Segmented value={type} onChange={t => { setType(t); setError(null); }} options={types.map(t => ({ value: t, label: typeLabel(t), color: typeColor(t) }))} />}

      <Text style={s.label}>Tüketimin ait olduğu ay</Text>
      <T.Small style={{ marginBottom: 8 }}>Faturada "dönem" ya da "okuma tarihi" yazar; tüketimin çoğu hangi aya aitse onu seç.</T.Small>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACE.lg }} contentContainerStyle={{ gap: 8 }}>
        {months.map(m => (
          <TouchableOpacity key={m} onPress={() => { tap(); setMonth(m); }} style={[s.chip, m === month && { borderColor: color, backgroundColor: color + '18' }]}>
            <Text style={[s.chipText, m === month && { color }]}>{monthName(m)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {type === 'gas' && (
        <View style={{ marginBottom: SPACE.md }}>
          <Segmented value={qtyUnit} onChange={setQtyUnit} options={[{ value: 'm3', label: 'Faturada m³ yazıyor' }, { value: 'kwh', label: 'kWh yazıyor' }]} />
        </View>
      )}
      <Field label={type === 'gas' && qtyUnit === 'kwh' ? 'Tüketim (kWh)' : 'Tüketim (m³)'} value={qty} onChangeText={t => { setQty(t); setError(null); }}
        keyboardType="decimal-pad" placeholder={type === 'gas' ? (qtyUnit === 'kwh' ? '650' : '61') : '14'} suffix={type === 'gas' && qtyUnit === 'kwh' ? 'kWh' : 'm³'}
        hint={type === 'gas' && qtyUnit === 'kwh' && m3v ? `≈ ${m3v.toFixed(1).replace('.', ',')} m³ (1 Sm³ ≈ ${bundle.gas.national.kwhPerM3} kWh)` : undefined} />
      <Field label="Ödenecek tutar (KDV dahil)" value={amount} onChangeText={t => { setAmount(t); setError(null); }}
        keyboardType="decimal-pad" placeholder="1.250,40" suffix="₺" error={error ?? undefined} />

      {m3v && m3v > 0 ? (() => {
        const chk = checkBillAgainstReadings(readings.filter(r => r.propertyId === prop.id), type, month, m3v);
        if (chk.status === 'unknown') return null;
        const col = chk.status === 'ok' ? C.ok : chk.status === 'high' ? C.danger : C.warn;
        return (
          <Card accent={col} style={{ backgroundColor: col + '0D' }}>
            <T.Label color={col}>Fatura kontrolü</T.Label>
            <T.Body style={{ marginTop: 6 }}>{chk.message}</T.Body>
          </Card>
        );
      })() : null}

      {est && a ? (
        <Card>
          <Row label="Sayaçla tahmini (takvim ayı)" value={tl(est.total)} />
          <Row label="Senin faturan" value={tl(a)} bold />
          <Row label="Senin birim fiyatın" value={`${(a / m3v!).toFixed(2).replace('.', ',')} ₺/m³`} valueColor={color} />
          {est.gas ? (() => {
            const t = inferGasTier(bundle, prop.province, month, m3v!, a);
            return <Row label="Faturan hangi fiyattan?" value={t === 1 ? 'Ucuz fiyat' : 'Pahalı fiyat (limit aşılmış)'} valueColor={t === 2 ? C.danger : C.ok} />;
          })() : null}
        </Card>
      ) : null}

      <Button title="Kaydet" color={color} onPress={save} disabled={!qty || !amount} style={{ marginTop: SPACE.sm }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md },
  label: { color: C.textDim, fontSize: FONT.sm, fontWeight: '600', marginBottom: 8, marginTop: SPACE.lg },
  chip: { paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgRaised },
  chipText: { color: C.textDim, fontWeight: '700', fontSize: FONT.sm },
});
