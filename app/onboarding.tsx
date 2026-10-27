import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Droplet, Flame, TrendingDown, Bell, Check } from 'lucide-react-native';
import { C, FONT, RADIUS, SPACE } from '../src/theme';
import { Screen, Button, Picker, Stepper, Field, T, tap } from '../src/ui';
import { PROVINCES } from '../src/data/provinces';
import { ALL_PROVINCES } from '../src/engine/tariffs';
import { useVerim } from '../src/store/useVerim';
import { track } from '../src/services/analytics';
import { ContributeInfo } from '../src/ui/Contribute';

type GasChoice = 'meter' | 'central' | 'none';

export default function Onboarding() {
  const router = useRouter();
  const complete = useVerim(s => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [hasWater, setHasWater] = useState(true);
  const [gas, setGas] = useState<GasChoice>('meter');
  const [household, setHousehold] = useState(3);
  const [name, setName] = useState('');

  const finish = (contribute: boolean) => {
    useVerim.getState().setSettings({ contribute });
    complete({
      name, householdSize: household,
      property: {
        name: 'Evim', province, district, hasWater, hasGas: gas !== 'none',
        gasMode: gas === 'central' ? 'central' : 'meter',
      },
    });
    track('onboarding_done', { province, gas_mode: gas, has_water: hasWater, household, contribute });
    // Korumalı rota onboarding'i kapatır; ardından ilk okumaya yönlendir
    setTimeout(() => router.replace('/scan'), 0);
  };

  return (
    <Screen tabs={false}>
      <View style={s.dots}>
        {[0, 1, 2, 3].map(i => <View key={i} style={[s.dot, i <= step && { backgroundColor: C.brand, width: 22 }]} />)}
      </View>

      {step === 0 && (
        <View>
          <Text style={s.brand}>Sayaçla</Text>
          <Text style={s.hero}>Su ve doğalgaz faturanı{'\n'}ödemeden önce bil.</Text>
          <View style={{ gap: SPACE.md, marginTop: SPACE.xl }}>
            <Feature icon={<Flame size={20} color={C.gas} />} title="Doğalgazda pahalı fiyata düşme uyarısı"
              body="Doğalgaz iki fiyattan satılıyor. İlinin aylık limitini takip eder, aşmadan önce uyarır. Limiti aşarsan ayın tüm gazı pahalı fiyattan hesaplanır." />
            <Feature icon={<Droplet size={20} color={C.water} />} title="Sayacı okut, faturayı gör"
              body="Kamerayla okut ya da elle gir. İlinin tarifesiyle bu ayın tahmini faturasını hemen hesaplar." />
            <Feature icon={<TrendingDown size={20} color={C.brand} />} title="TL bazlı tasarruf önerileri"
              body="Kendi tüketimine göre neyi değiştirirsen ayda kaç TL kazanacağını gösterir." />
            <Feature icon={<Bell size={20} color={C.textDim} />} title="Verilerin sende"
              body="Hesap yok, reklam yok. Tüm okumaların yalnızca bu cihazda saklanır." />
          </View>
          <Button title="Başla" onPress={() => setStep(1)} style={{ marginTop: SPACE['2xl'] }} />
        </View>
      )}

      {step === 1 && (
        <View>
          <T.Title style={s.q}>Nerede oturuyorsun?</T.Title>
          <T.Body dim style={{ marginBottom: SPACE.xl }}>Su tarifeleri ve doğalgaz limitleri il bazında değişir.</T.Body>
          <Picker label="İl" value={province} options={ALL_PROVINCES}
            onChange={v => { setProvince(v); setDistrict(''); }} placeholder="İl seç" />
          {province ? (
            <Picker label="İlçe" value={district} options={PROVINCES[province]?.districts ?? []} onChange={setDistrict} placeholder="İlçe seç" />
          ) : null}
          <Button title="Devam" disabled={!province || !district} onPress={() => setStep(2)} />
          <Button title="Geri" kind="ghost" onPress={() => setStep(0)} style={{ marginTop: SPACE.sm }} />
        </View>
      )}

      {step === 2 && (
        <View>
          <T.Title style={s.q}>Evini tanıyalım</T.Title>
          <T.Body dim style={{ marginBottom: SPACE.xl }}>Bunları sonra Ayarlar'dan değiştirebilirsin.</T.Body>

          <Text style={s.label}>Su sayacın var mı?</Text>
          <View style={s.choices}>
            <Choice on={hasWater} label="Evet, kendi sayacım var" onPress={() => setHasWater(true)} color={C.water} />
            <Choice on={!hasWater} label="Hayır / ortak sayaç" onPress={() => setHasWater(false)} color={C.water} />
          </View>

          <Text style={s.label}>Doğalgaz</Text>
          <View style={s.choices}>
            <Choice on={gas === 'meter'} label="Kombi — kendi sayacım var (kartlı dahil)" onPress={() => setGas('meter')} color={C.gas} />
            <Choice on={gas === 'central'} label="Merkezi sistem / pay ölçer" onPress={() => setGas('central')} color={C.gas} />
            <Choice on={gas === 'none'} label="Doğalgaz yok" onPress={() => setGas('none')} color={C.gas} />
          </View>

          <Stepper label="Evde kaç kişi yaşıyor?" value={household} onChange={setHousehold} />
          <Field label="Adın (isteğe bağlı)" value={name} onChangeText={setName} placeholder="Ör. Eymen" />

          <Button title="Devam" disabled={!hasWater && gas === 'none'} onPress={() => setStep(3)} />
          <Button title="Geri" kind="ghost" onPress={() => setStep(1)} style={{ marginTop: SPACE.sm }} />
        </View>
      )}
      {step === 3 && (
        <View>
          <T.Title style={s.q}>Son bir şey</T.Title>
          <ContributeInfo />
          <Button title="Katkı ver ve başla" onPress={() => finish(true)} style={{ marginTop: SPACE.lg }} />
          <Button title="Hayır, teşekkürler" kind="ghost" onPress={() => finish(false)} style={{ marginTop: SPACE.sm }} />
          <Button title="Geri" kind="ghost" onPress={() => setStep(2)} />
        </View>
      )}
    </Screen>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <View style={s.feature}>
      <View style={s.featureIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={s.fTitle}>{title}</Text>
        <Text style={s.fBody}>{body}</Text>
      </View>
    </View>
  );
}

function Choice({ on, label, onPress, color }: { on: boolean; label: string; onPress: () => void; color: string }) {
  return (
    <TouchableOpacity onPress={() => { tap(); onPress(); }} style={[s.choice, on && { borderColor: color, backgroundColor: color + '14' }]}
      accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <Text style={[s.choiceText, on && { color: C.text }]}>{label}</Text>
      {on ? <Check size={18} color={color} /> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 6, marginBottom: SPACE.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  brand: { color: C.brand, fontSize: FONT.base, fontWeight: '900', letterSpacing: 4, textTransform: 'uppercase' },
  hero: { color: C.text, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: SPACE.md, lineHeight: 40 },
  feature: { flexDirection: 'row', gap: SPACE.md, backgroundColor: C.card, padding: SPACE.lg, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: C.border },
  featureIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.bgRaised, alignItems: 'center', justifyContent: 'center' },
  fTitle: { color: C.text, fontWeight: '700', fontSize: FONT.md },
  fBody: { color: C.textDim, fontSize: FONT.sm, marginTop: 3, lineHeight: 18 },
  q: { fontSize: FONT['2xl'], marginBottom: 6 },
  label: { color: C.textDim, fontSize: FONT.sm, fontWeight: '600', marginBottom: 8 },
  choices: { gap: 8, marginBottom: SPACE.lg },
  choice: { minHeight: 52, borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgRaised, paddingHorizontal: SPACE.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  choiceText: { color: C.textDim, fontSize: FONT.md, fontWeight: '600', flex: 1 },
});
