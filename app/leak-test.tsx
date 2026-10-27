import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X, Droplet, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { C, FONT, SPACE } from '../src/theme';
import { Screen, T, Field, Button, Card } from '../src/ui';
import { leakTestResult } from '../src/engine/insights';
import { parseMeterInput } from '../src/engine/validation';
import { track } from '../src/services/analytics';

const KEY = 'verim-leak-test';

export default function LeakTest() {
  const router = useRouter();
  const [start, setStart] = useState<{ value: number; at: number } | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<ReturnType<typeof leakTestResult> | null>(null);
  const [err, setErr] = useState<string | undefined>();
  const [, force] = useState(0);

  useEffect(() => { AsyncStorage.getItem(KEY).then(v => v && setStart(JSON.parse(v))).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => force(x => x + 1), 30_000); return () => clearInterval(t); }, []);

  const minutes = start ? (Date.now() - start.at) / 60_000 : 0;

  const begin = () => {
    const v = parseMeterInput(input, 'water');
    if (v == null) return setErr('Değeri ondalıklarıyla gir, ör. 43817,052');
    const st = { value: v, at: Date.now() };
    setStart(st); setInput(''); setErr(undefined);
    AsyncStorage.setItem(KEY, JSON.stringify(st)).catch(() => {});
  };
  const finish = () => {
    const v = parseMeterInput(input, 'water');
    if (v == null || !start) return setErr('Değeri ondalıklarıyla gir, ör. 43817,058');
    if (v < start.value) return setErr('İkinci değer ilkinden küçük olamaz; rakamları kontrol et.');
    const res = leakTestResult(start.value, v, minutes);
    setResult(res);
    track('leak_test_done', { minutes: Math.round(minutes), leak: res.leak });
    AsyncStorage.removeItem(KEY).catch(() => {});
  };
  const restart = () => { setStart(null); setResult(null); setInput(''); AsyncStorage.removeItem(KEY).catch(() => {}); };

  return (
    <Screen tabs={false}>
      <View style={s.head}>
        <T.Title style={{ fontSize: FONT.xl, flex: 1 }}>Su kaçak testi</T.Title>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Kapat"><X size={24} color={C.textDim} /></TouchableOpacity>
      </View>

      {result ? (
        <Card accent={result.leak ? C.danger : C.ok}>
          {result.leak ? <AlertTriangle size={28} color={C.danger} /> : <CheckCircle2 size={28} color={C.ok} />}
          <T.Title style={{ marginTop: SPACE.md }}>{result.leak ? 'Kaçak olabilir' : 'Kaçak görünmüyor'}</T.Title>
          <T.Body style={{ marginTop: 6 }}>{result.message}</T.Body>
          <Button title="Yeni test" kind="secondary" onPress={restart} style={{ marginTop: SPACE.lg }} />
        </Card>
      ) : !start ? (
        <>
          <Card>
            <Droplet size={24} color={C.water} />
            <T.Body style={{ marginTop: SPACE.md }}>1. Evdeki tüm muslukları, çamaşır/bulaşık makinesini ve kombiyi su kullanmayacak şekilde kapat.</T.Body>
            <T.Body style={{ marginTop: 6 }}>2. Sayaçtaki siyah ve kırmızı rakamların tamamını yaz (kırmızılar litre).</T.Body>
            <T.Body style={{ marginTop: 6 }}>3. En az 30 dakika (ideal 2 saat) hiç su kullanmadan bekle, sonra tekrar oku.</T.Body>
          </Card>
          <Field label="Başlangıç değeri" value={input} onChangeText={t => { setInput(t); setErr(undefined); }} keyboardType="decimal-pad" placeholder="43817,052" suffix="m³" error={err} autoFocus />
          <Button title="Testi başlat" color={C.water} onPress={begin} disabled={!input} />
        </>
      ) : (
        <>
          <Card>
            <T.Label>Test sürüyor</T.Label>
            <Text style={s.timer}>{Math.floor(minutes)} dk</Text>
            <T.Small>Başlangıç: {start.value.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} m³. {minutes < 30 ? `En az ${Math.ceil(30 - minutes)} dk daha bekle.` : 'Şimdi tekrar okuyabilirsin.'}</T.Small>
          </Card>
          <Field label="Şimdiki değer" value={input} onChangeText={t => { setInput(t); setErr(undefined); }} keyboardType="decimal-pad" placeholder="43817,052" suffix="m³" error={err} />
          <Button title="Sonucu gör" color={C.water} onPress={finish} disabled={!input || minutes < 1} />
          <Button title="Testi iptal et" kind="ghost" onPress={restart} />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.lg },
  timer: { color: C.water, fontSize: 44, fontWeight: '800', marginVertical: 6 },
});
