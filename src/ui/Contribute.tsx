// İzinli anonim tüketim katkısı: ne gönderilir, ne gönderilmez — kurulumda ve Özet'te aynı metin.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { BarChart3, Check, X } from 'lucide-react-native';
import { C, SPACE } from '../theme';
import { T, Card, Button } from './index';
import { useVerim } from '../store/useVerim';
import { track } from '../services/analytics';

export function ContributeInfo() {
  return (
    <View>
      <T.Body dim style={{ marginBottom: SPACE.lg }}>
        Okumalarını anonim olarak il istatistiğine eklememize izin verir misin? Böylece "ilindeki benzer evler ne kadar harcıyor" kıyasını
        tahminle değil gerçek veriyle gösterebiliriz; sen de evinin nerede durduğunu görürsün.
      </T.Body>
      <View style={s.box}>
        <Line ok text="İl ve ilçe, dönemlik tüketim (m³), fatura tutarı" />
        <Line ok text="Hane kişi sayısı ve ev özellikleri (m², kat, kombi yaşı…)" />
        <Line text="Adın, adresin, konumun, fotoğrafların, sayaç numaran" />
      </View>
      <T.Small style={{ marginTop: SPACE.md }}>
        İstediğin zaman Ayarlar'dan kapatabilirsin. Uygulamayı geliştirmek için ayrıca anonim kullanım istatistiği (hangi özelliklerin kullanıldığı)
        toplanır; onu da Ayarlar'dan kapatabilirsin. Ayrıntılar Gizlilik politikasında.
      </T.Small>
    </View>
  );
}

function Line({ ok, text }: { ok?: boolean; text: string }) {
  return (
    <View style={s.line}>
      {ok ? <Check size={16} color={C.ok} /> : <X size={16} color={C.danger} />}
      <T.Small color={C.text} style={{ flex: 1 }}>{ok ? '' : 'Asla: '}{text}</T.Small>
    </View>
  );
}

/** Kurulumu önceki sürümde yapmış kullanıcılar için bir kerelik soru (Özet ekranı). */
export function ContributeCard() {
  const contribute = useVerim(s => s.settings.contribute);
  const setSettings = useVerim(s => s.setSettings);
  if (contribute !== null) return null;
  const choose = (v: boolean) => { setSettings({ contribute: v }); track('consent', { contribute: v, where: 'home' }); };
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.sm }}>
        <BarChart3 size={20} color={C.brand} />
        <T.Title style={{ flex: 1 }}>İlindeki evlerle kıyaslayalım mı?</T.Title>
      </View>
      <ContributeInfo />
      <Button title="Katkı ver" onPress={() => choose(true)} style={{ marginTop: SPACE.lg }} />
      <Button title="Hayır, teşekkürler" kind="ghost" onPress={() => choose(false)} style={{ marginTop: SPACE.sm }} />
    </Card>
  );
}

const s = StyleSheet.create({
  box: { gap: 10, padding: SPACE.md, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgRaised },
  line: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
});
