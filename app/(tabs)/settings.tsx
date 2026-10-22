import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Alert, Linking, Share } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Home, Plus, Receipt, Database, Droplet, Bell, Phone, Shield, Trash2, Download, RefreshCw, Mail } from 'lucide-react-native';
import { C, FONT, SPACE } from '../../src/theme';
import { Screen, Header, Card, T, Row, Divider, Stepper, Sheet, Button } from '../../src/ui';
import { useVerim, useActiveProperty, useTariffs } from '../../src/store/useVerim';
import { syncTariffs } from '../../src/services/tariffSync';
import { scheduleMonthlyReminder, ensurePermission } from '../../src/services/notify';
import { dateTR } from '../../src/utils/format';

export default function Settings() {
  const router = useRouter();
  const st = useVerim();
  const active = useActiveProperty();
  const bundle = useTariffs();
  const [dayOpen, setDayOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const exportData = async () => {
    const payload = JSON.stringify({
      app: 'Sayaçla', exportedAt: new Date().toISOString(),
      properties: st.properties, readings: st.readings.map(({ photoUri, ...r }) => r), bills: st.bills,
    }, null, 2);
    await Share.share({ message: payload, title: 'Sayaçla verileri' }).catch(() => {});
  };

  const wipe = () => Alert.alert('Tüm verileri sil', 'Evlerin, okumaların ve faturaların bu cihazdan kalıcı olarak silinir. Geri alınamaz.', [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Sil', style: 'destructive', onPress: () => { st.resetAll(); scheduleMonthlyReminder(0).catch(() => {}); } },
  ]);

  const refresh = async () => {
    setSyncing(true);
    const r = await syncTariffs(true);
    setSyncing(false);
    Alert.alert('Tarifeler', r === 'updated' ? 'Tarifeler güncellendi.' : 'Şu an güncellenemedi; kayıtlı tarifeler kullanılmaya devam ediyor.');
  };

  return (
    <Screen>
      <Header title="Ayarlar" />

      <T.Label style={s.section}>Evlerim</T.Label>
      <Card style={{ paddingVertical: SPACE.sm }}>
        {st.properties.map((p, i) => (
          <React.Fragment key={p.id}>
            {i > 0 && <Divider />}
            <Row icon={<Home size={18} color={p.id === active?.id ? C.brand : C.textDim} />}
              label={`${p.name} · ${p.district ? p.district + ', ' : ''}${p.province}`}
              value={p.id === active?.id ? 'Aktif' : undefined} valueColor={C.brand}
              onPress={() => router.push({ pathname: '/property', params: { id: p.id } })} />
          </React.Fragment>
        ))}
        <Divider />
        <Row icon={<Plus size={18} color={C.brand} />} label="Yeni ev ekle (yazlık, kiradaki daire…)" onPress={() => router.push('/property')} />
      </Card>

      <T.Label style={s.section}>Hane</T.Label>
      <Card>
        <Stepper label="Evde yaşayan kişi sayısı" value={st.profile.householdSize} onChange={v => st.setProfile({ householdSize: v })} />
        <T.Small>Su tasarrufu önerileri kişi başı tüketime göre hesaplanır.</T.Small>
      </Card>

      <T.Label style={s.section}>Doğruluk</T.Label>
      <Card style={{ paddingVertical: SPACE.sm }}>
        <Row icon={<Receipt size={18} color={C.brand} />} label="Fatura gir / kalibre et" onPress={() => router.push('/bill')} />
        <Divider />
        <Row icon={<Database size={18} color={C.textDim} />} label={`${active?.province ?? ''} tarifeleri ve kaynakları`} onPress={() => router.push('/tariff')} />
        <Divider />
        <Row icon={<RefreshCw size={18} color={C.textDim} />} label={syncing ? 'Güncelleniyor…' : 'Tarifeleri şimdi güncelle'}
          value={st.tariffsFetchedAt ? dateTR(st.tariffsFetchedAt) : 'gömülü'} onPress={syncing ? undefined : refresh} />
        <T.Small style={{ paddingBottom: SPACE.sm }}>Tarife paketi: {bundle.version}</T.Small>
      </Card>

      <T.Label style={s.section}>Araçlar</T.Label>
      <Card style={{ paddingVertical: SPACE.sm }}>
        <Row icon={<Droplet size={18} color={C.water} />} label="Su kaçak testi (2 okuma ile)" onPress={() => router.push('/leak-test')} />
      </Card>

      <T.Label style={s.section}>Bildirimler</T.Label>
      <Card style={{ paddingVertical: SPACE.sm }}>
        <Row icon={<Bell size={18} color={C.textDim} />} label="Aylık okuma hatırlatıcısı"
          value={st.settings.reminderDay ? `Her ayın ${st.settings.reminderDay}. günü` : 'Kapalı'} onPress={() => setDayOpen(true)} />
        <Divider />
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Doğalgaz destek hakkı uyarıları</Text>
            <T.Small>Limiti aşma riski olduğunda ayda en fazla bir kez bildirir.</T.Small>
          </View>
          <Switch value={st.settings.tierAlerts} trackColor={{ true: C.brand, false: C.border }}
            onValueChange={async v => { if (v) await ensurePermission(); st.setSettings({ tierAlerts: v }); }} />
        </View>
      </Card>

      <Card style={{ paddingVertical: SPACE.sm, marginTop: -SPACE.sm }}>
        <View style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchTitle}>Kış sezonu haftalık kontrol</Text>
            <T.Small>Ekim–Nisan her pazar hatırlatır; her ayın 1'inde yeni destekli hakkını bildirir.</T.Small>
          </View>
          <Switch value={st.settings.weeklyHeating} trackColor={{ true: C.brand, false: C.border }}
            onValueChange={async v => { if (v) await ensurePermission(); st.setSettings({ weeklyHeating: v }); }} />
        </View>
      </Card>

      <T.Label style={s.section}>Acil durum</T.Label>
      <Card style={{ paddingVertical: SPACE.sm }}>
        <Row icon={<Phone size={18} color={C.danger} />} label="Doğalgaz acil — 187" onPress={() => Linking.openURL('tel:187')} />
        <Divider />
        <Row icon={<Phone size={18} color={C.water} />} label="Su arıza — 185" onPress={() => Linking.openURL('tel:185')} />
        <T.Small style={{ paddingBottom: SPACE.sm }}>Gaz kokusu alırsan elektrik düğmelerine dokunma, pencereleri aç, binadan çık ve 187'yi ara.</T.Small>
      </Card>

      <T.Label style={s.section}>Veri ve gizlilik</T.Label>
      <Card style={{ paddingVertical: SPACE.sm }}>
        <Row icon={<Shield size={18} color={C.textDim} />} label="Gizlilik politikası" onPress={() => router.push('/privacy')} />
        <Divider />
        <Row icon={<Download size={18} color={C.textDim} />} label="Verilerimi dışa aktar" onPress={exportData} />
        <Divider />
        <Row icon={<Mail size={18} color={C.textDim} />} label="Geri bildirim gönder" onPress={() => Linking.openURL('mailto:m.eymen@teverorman.com?subject=Sayaçla%20geri%20bildirim')} />
        <Divider />
        <Row icon={<Trash2 size={18} color={C.danger} />} label="Tüm verileri sil" onPress={wipe} />
      </Card>

      <T.Small style={{ textAlign: 'center', marginTop: SPACE.lg }}>
        Sayaçla {Constants.expoConfig?.version ?? ''} · Tever Technology{'\n'}Tahminler bilgilendirme amaçlıdır; kesin tutar faturandadır.
      </T.Small>

      <Sheet visible={dayOpen} onClose={() => setDayOpen(false)} title="Hatırlatıcı günü">
        <T.Body dim style={{ marginBottom: SPACE.md }}>Faturan genelde ayın hangi günü kesiliyorsa ondan 1–2 gün önce okumak en doğru karşılaştırmayı verir.</T.Body>
        <View style={s.days}>
          {[0, 1, 5, 10, 15, 20, 25, 28].map(d => (
            <Button key={d} kind={st.settings.reminderDay === d ? 'primary' : 'secondary'} title={d === 0 ? 'Kapalı' : `${d}`}
              style={{ width: '22%', minHeight: 48 }}
              onPress={async () => { st.setSettings({ reminderDay: d }); await scheduleMonthlyReminder(d).catch(() => {}); setDayOpen(false); }} />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  section: { marginTop: SPACE.md, marginBottom: SPACE.sm, marginLeft: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingVertical: SPACE.md },
  switchTitle: { color: C.text, fontSize: FONT.md },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
});
