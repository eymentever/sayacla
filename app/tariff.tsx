import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { C, FONT, SPACE } from '../src/theme';
import { Screen, T, Card, Row, Badge, Divider } from '../src/ui';
import { useActiveProperty, useTariffs } from '../src/store/useVerim';
import { monthKey } from '../src/engine/consumption';
import { monthShort } from '../src/utils/format';

const MONTHS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);

export default function TariffInfo() {
  const router = useRouter();
  const prop = useActiveProperty();
  const b = useTariffs();
  if (!prop) return null;
  const g = b.gas.provinces[prop.province];
  const w = b.water[prop.province];
  const n = b.gas.national;
  const cur = parseInt(monthKey(new Date()).slice(5, 7), 10) - 1;
  const f = (x: number, d = 2) => x.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <Screen tabs={false}>
      <View style={s.head}>
        <T.Title style={{ fontSize: FONT.xl, flex: 1 }}>{prop.province} tarifeleri</T.Title>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Kapat"><X size={24} color={C.textDim} /></TouchableOpacity>
      </View>

      <Card>
        <View style={s.row}><T.Title style={{ flex: 1 }}>Doğalgaz</T.Title><Badge text={n.verified ? 'BOTAŞ resmi' : 'tahmini'} color={n.verified ? C.ok : C.warn} /></View>
        <Row label="Ucuz fiyat (1. kademe, vergisiz)" value={`${f(n.k1, 3)} ₺/Sm³`} />
        <Row label="Pahalı fiyat (2. kademe, vergisiz)" value={`${f(n.k2, 3)} ₺/Sm³`} />
        <Row label="Dağıtım bedeli" value={`~${f(g.skbPerM3)} ₺/Sm³`} />
        <Row label="ÖTV / KDV" value={`${f(n.otvPerM3, 4)} ₺ · %${Math.round(n.kdv * 100)}`} />
        <T.Small style={{ marginTop: SPACE.sm }}>Aylık limiti aşarsan o ayın tüm tüketimi pahalı fiyattan faturalanır.</T.Small>
        <Divider />
        <T.Label style={{ marginTop: SPACE.md, marginBottom: SPACE.sm }}>Aylık ucuz fiyat limiti (Sm³)</T.Label>
        <View style={s.grid}>
          {MONTHS.map((m, i) => (
            <View key={m} style={[s.cell, i === cur && { borderColor: C.gas }]}>
              <T.Small color={i === cur ? C.gas : C.textDim}>{monthShort(m)}</T.Small>
              <T.Body style={{ fontWeight: '700' }}>{f(g.limits[i], 0)}</T.Body>
            </View>
          ))}
        </View>
        <T.Small style={{ marginTop: SPACE.sm }}>Kaynak: {g.source}. {n.source}.</T.Small>
      </Card>

      <Card>
        <View style={s.row}><T.Title style={{ flex: 1 }}>Su · {w.authority}</T.Title><Badge text={w.verified ? 'doğrulandı' : 'tahmini'} color={w.verified ? C.ok : C.warn} /></View>
        {w.tiers.map((t, i) => {
          const from = i === 0 ? 0 : w.tiers[i - 1].upTo ?? 0;
          return <Row key={i} label={w.tiers.length === 1 ? 'Ortalama birim fiyat' : t.upTo == null ? `${from}+ m³` : `${from}–${t.upTo} m³`} value={`${f(t.rate)} ₺/m³`} />;
        })}
        <Row label="ÇTV" value={`${f(w.ctvPerM3)} ₺/m³`} />
        {w.freeM3 ? <Row label="İnsani su hakkı" value={`ayda ${w.freeM3} m³'e kadar`} /> : null}
        <T.Small style={{ marginTop: SPACE.sm }}>Kaynak: {w.source} ({w.asOf}).</T.Small>
        {!w.verified && <T.Small color={C.warn} style={{ marginTop: SPACE.sm }}>Bu il için güncel resmi tarife doğrulanmadı. Bir faturanı girersen hesaplar senin gerçek fiyatınla yapılır.</T.Small>}
      </Card>
      <T.Small style={{ textAlign: 'center' }}>Tarife paketi {b.version}. Uygulama tarifeleri internetten günlük olarak günceller.</T.Small>
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.lg },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: '23%', borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 8, alignItems: 'center', backgroundColor: C.bgRaised },
});
