import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, Switch, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { C, FONT, SPACE } from '../src/theme';
import { Screen, T, Field, Button, Picker, Segmented, Card } from '../src/ui';
import { useVerim } from '../src/store/useVerim';
import { PROVINCES } from '../src/data/provinces';
import { ALL_PROVINCES } from '../src/engine/tariffs';

export default function PropertyScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const st = useVerim();
  const existing = st.properties.find(p => p.id === id);
  const [name, setName] = useState(existing?.name ?? (st.properties.length ? 'Yeni ev' : 'Evim'));
  const [province, setProvince] = useState(existing?.province ?? '');
  const [district, setDistrict] = useState(existing?.district ?? '');
  const [hasWater, setHasWater] = useState(existing?.hasWater ?? true);
  const [readDay, setReadDay] = useState<string>(existing?.billReadDay ? String(existing.billReadDay) : 'Bilmiyorum (takvim ayı)');
  const [gas, setGas] = useState<'meter' | 'central' | 'none'>(existing ? (existing.hasGas ? existing.gasMode ?? 'meter' : 'none') : 'meter');

  const save = () => {
    const data = { name: name.trim() || 'Evim', province, district, hasWater, hasGas: gas !== 'none', gasMode: gas === 'central' ? 'central' as const : 'meter' as const, billReadDay: gas === 'meter' && readDay !== 'Bilmiyorum (takvim ayı)' ? Number(readDay) : undefined };
    if (existing) st.updateProperty(existing.id, data); else st.addProperty(data);
    router.back();
  };
  const remove = () => {
    if (!existing) return;
    if (st.properties.length === 1) return Alert.alert('Silinemez', 'En az bir evin olmalı. Tüm verileri silmek için Ayarlar > Tüm verileri sil.');
    Alert.alert('Evi sil', `${existing.name} ve tüm okumaları/faturaları silinecek.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => { st.removeProperty(existing.id); router.back(); } },
    ]);
  };

  return (
    <Screen tabs={false}>
      <View style={s.head}>
        <T.Title style={{ fontSize: FONT.xl, flex: 1 }}>{existing ? 'Evi düzenle' : 'Yeni ev'}</T.Title>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Kapat"><X size={24} color={C.textDim} /></TouchableOpacity>
      </View>
      <Field label="Ad" value={name} onChangeText={setName} placeholder="Evim, Yazlık, Kiradaki daire…" />
      <Picker label="İl" value={province} options={ALL_PROVINCES} onChange={v => { setProvince(v); setDistrict(''); }} />
      {province ? <Picker label="İlçe" value={district} options={PROVINCES[province]?.districts ?? []} onChange={setDistrict} /> : null}

      <Card>
        <View style={s.sw}>
          <Text style={s.swText}>Kendi su sayacım var</Text>
          <Switch accessibilityLabel="Kendi su sayacım var" value={hasWater} onValueChange={setHasWater} trackColor={{ true: C.water, false: C.border }} />
        </View>
      </Card>
      <Text style={s.label}>Doğalgaz</Text>
      <Segmented value={gas} onChange={setGas} options={[
        { value: 'meter', label: 'Kombi', color: C.gas }, { value: 'central', label: 'Merkezi', color: C.gas }, { value: 'none', label: 'Yok', color: C.gas },
      ]} />
      <T.Small style={{ marginTop: 8, marginBottom: SPACE.lg }}>Kartlı sayaçlar "Kombi" kapsamındadır. Merkezi sistemde fatura girerek limit takibi yapılır.</T.Small>
      {gas === 'meter' ? (
        <>
          <Picker label="Doğalgaz faturası ayın kaçında okunuyor?" value={readDay}
            options={['Bilmiyorum (takvim ayı)', ...Array.from({ length: 28 }, (_, i) => String(i + 1))]} onChange={setReadDay} />
          <T.Small style={{ marginTop: -SPACE.sm, marginBottom: SPACE.lg }}>Faturada "okuma tarihi" yazar. Girersen limit, fatura dönemine göre (ör. 15'inden 15'ine) hesaplanır; uyarılar tam o döneme göre gelir.</T.Small>
        </>
      ) : null}

      {existing && existing.id !== st.activePropertyId && (
        <Button kind="secondary" title="Bu evi aktif yap" onPress={() => { st.setActiveProperty(existing.id); router.back(); }} style={{ marginBottom: SPACE.sm }} />
      )}
      <Button title="Kaydet" onPress={save} disabled={!province || !district || (!hasWater && gas === 'none')} />
      {existing && <Button kind="danger" title="Evi sil" onPress={remove} style={{ marginTop: SPACE.sm }} />}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.lg },
  sw: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swText: { color: C.text, fontSize: FONT.md },
  label: { color: C.textDim, fontSize: FONT.sm, fontWeight: '600', marginBottom: 8 },
});
