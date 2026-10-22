import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { C, FONT, RADIUS, SPACE } from '../src/theme';
import { Screen, T, Button, tap } from '../src/ui';
import { useVerim, useActiveProperty } from '../src/store/useVerim';
import { HomeProfile } from '../src/engine/diagnosis';

type Q<K extends keyof HomeProfile> = { key: K; q: string; hint?: string; opts: { v: HomeProfile[K]; label: string }[] };

const QUESTIONS: Q<any>[] = [
  { key: 'sizeM2', q: 'Evin yaklaşık kaç m²?', opts: [{ v: 'lt80', label: '80 m² altı' }, { v: '80_120', label: '80–120' }, { v: '120_180', label: '120–180' }, { v: 'gt180', label: '180 üstü' }] },
  { key: 'position', q: 'Evin konumu', opts: [{ v: 'middle', label: 'Apartman ara kat' }, { v: 'top_or_ground', label: 'En üst / zemin kat' }, { v: 'detached', label: 'Müstakil ev' }] },
  { key: 'roomTemp', q: 'Kışın evin genelde kaç derece?', hint: 'Bilmiyorsan: kışın evde tişörtle rahat ediyorsan muhtemelen 23 °C üstü.', opts: [{ v: 'le20', label: '20 °C ve altı' }, { v: '21_22', label: '21–22 °C' }, { v: '23_24', label: '23–24 °C' }, { v: 'ge25', label: '25 °C üstü' }] },
  { key: 'nightMode', q: 'Gece ve evde yokken kombi?', opts: [{ v: 'lower', label: 'Düşürüyorum' }, { v: 'same', label: 'Aynı kalıyor' }, { v: 'off', label: 'Tamamen kapatıyorum' }] },
  { key: 'roomThermostat', q: 'Oda termostatın var mı?', hint: 'Duvarda veya masada sıcaklık ayarladığın küçük cihaz.', opts: [{ v: true, label: 'Var' }, { v: false, label: 'Yok / bilmiyorum' }] },
  { key: 'trvValves', q: 'Petek vanaların numaralı (termostatik) mı?', hint: 'Üzerinde 1–5 rakamları olan döner başlık.', opts: [{ v: true, label: 'Evet' }, { v: false, label: 'Hayır / bilmiyorum' }] },
  { key: 'boilerAge', q: 'Kombin kaç yaşında?', opts: [{ v: 'lt5', label: '5 yıldan yeni' }, { v: '5_10', label: '5–10 yıl' }, { v: 'gt10', label: '10 yıldan eski' }, { v: 'unknown', label: 'Bilmiyorum' }] },
  { key: 'boilerService', q: 'Son kombi bakımı?', opts: [{ v: 'lt12m', label: 'Son 1 yıl içinde' }, { v: 'gt12m', label: '1 yıldan önce' }, { v: 'never', label: 'Hiç / hatırlamıyorum' }] },
  { key: 'windows', q: 'Pencereler', opts: [{ v: 'double_new', label: 'Çift cam, sağlam' }, { v: 'double_old', label: 'Çift cam ama eski / hava alıyor' }, { v: 'single', label: 'Tek cam' }] },
  { key: 'radiatorsCovered', q: 'Peteklerin önü kapalı mı?', hint: 'Perde, kanepe, petek örtüsü veya üstünde çamaşır kurutma.', opts: [{ v: true, label: 'Evet, bazıları' }, { v: false, label: 'Hayır, açık' }] },
  { key: 'showerMin', q: 'Ortalama duş süresi', opts: [{ v: 'le5', label: '5 dk ve altı' }, { v: '6_10', label: '6–10 dk' }, { v: 'gt10', label: '10 dk üstü' }] },
];

export default function Diagnose() {
  const router = useRouter();
  const prop = useActiveProperty();
  const update = useVerim(s => s.updateProperty);
  const [a, setA] = useState<Partial<HomeProfile>>(prop?.home ?? {});
  if (!prop) return null;
  const done = QUESTIONS.every(q => a[q.key as keyof HomeProfile] !== undefined);
  const answered = QUESTIONS.filter(q => a[q.key as keyof HomeProfile] !== undefined).length;

  return (
    <Screen tabs={false}>
      <View style={s.head}>
        <T.Title style={{ fontSize: FONT.xl, flex: 1 }}>Neden fazla kullanıyorum?</T.Title>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Kapat"><X size={24} color={C.textDim} /></TouchableOpacity>
      </View>
      <T.Body dim style={{ marginBottom: SPACE.lg }}>11 kısa soru. Cevaplarına göre paranın nereye gittiğini ve en çok neyin kazandıracağını sıralayacağız.</T.Body>
      <View style={s.progress}><View style={[s.progressFill, { width: `${(answered / QUESTIONS.length) * 100}%` }]} /></View>

      {QUESTIONS.map(q => (
        <View key={q.key} style={{ marginBottom: SPACE.lg }}>
          <Text style={s.q}>{q.q}</Text>
          {q.hint ? <T.Small style={{ marginBottom: 6 }}>{q.hint}</T.Small> : null}
          <View style={s.opts}>
            {q.opts.map(o => {
              const on = a[q.key as keyof HomeProfile] === o.v;
              return (
                <TouchableOpacity key={String(o.v)} onPress={() => { tap(); setA(x => ({ ...x, [q.key]: o.v })); }}
                  style={[s.opt, on && { borderColor: C.brand, backgroundColor: C.brand + '18' }]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <Text style={[s.optText, on && { color: C.brand }]}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      <Button title={done ? 'Sonuçları gör' : `${QUESTIONS.length - answered} soru kaldı`} disabled={!done}
        onPress={() => { update(prop.id, { home: a as HomeProfile }); router.back(); }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.sm },
  progress: { height: 4, backgroundColor: C.border, borderRadius: 2, marginBottom: SPACE.xl, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: C.brand },
  q: { color: C.text, fontSize: FONT.md, fontWeight: '700', marginBottom: 8 },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgRaised },
  optText: { color: C.textDim, fontWeight: '600', fontSize: FONT.sm },
});
