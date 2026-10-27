import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Image, Linking, ActivityIndicator, Switch, Dimensions, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Camera, Keyboard, Zap, ZapOff, RotateCcw, Check, Info } from 'lucide-react-native';
import { C, FONT, RADIUS, SPACE, typeColor, typeLabel } from '../../src/theme';
import { Screen, Header, Card, T, Button, Segmented, Sheet, Row, Badge, tap } from '../../src/ui';
import { useVerim, useActiveProperty, useTariffs } from '../../src/store/useVerim';
import { UtilityType, Reading } from '../../src/engine/types';
import { validateNewReading, parseMeterInput, Check as VCheck } from '../../src/engine/validation';
import { forecastMonth, sortReadings, monthKey } from '../../src/engine/consumption';
import { billFor } from '../../src/engine/bills';
import { latestCalibration } from '../../src/engine/summary';
import { readMeter, ocrAvailable } from '../../src/services/ocr';
import { MeterGuide } from '../../src/ui/MeterGuide';
import { scheduleMonthlyReminder, scheduleSecondReading } from '../../src/services/notify';
import { MapPin } from 'lucide-react-native';
import { Candidate } from '../../src/engine/ocrPick';
import { tl, m3, num, dateTR } from '../../src/utils/format';

const { width: SW } = Dimensions.get('window');
const VF = { w: SW - 2 * SPACE.lg, h: 150 };

const HINT: Record<UtilityType, string> = {
  water: 'Siyah zemindeki rakamları oku (m³). Kırmızı rakamlar litredir; istersen virgülden sonra yaz.',
  gas: 'Virgülden önceki tüm rakamları oku (m³). Kartlı sayaçta ekrandaki "toplam tüketim / m³" değerini kullan.',
};

export default function Scan() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const focused = useIsFocused();
  const prop = useActiveProperty();
  const bundle = useTariffs();
  const readings = useVerim(s => s.readings);
  const bills = useVerim(s => s.bills);
  const addReading = useVerim(s => s.addReading);
  const guideSeen = useVerim(s => s.settings.guideSeen);
  const setSettings = useVerim(s => s.setSettings);
  const [guide, setGuide] = useState(false);

  const types = useMemo<UtilityType[]>(() => {
    const t: UtilityType[] = [];
    if (prop?.hasGas && prop.gasMode !== 'central') t.push('gas');
    if (prop?.hasWater) t.push('water');
    return t;
  }, [prop]);

  const [type, setType] = useState<UtilityType>((params.type as UtilityType) || types[0] || 'water');
  useEffect(() => { if (params.type === 'water' || params.type === 'gas') setType(params.type); }, [params.type]);
  useEffect(() => { if (types.length && !types.includes(type)) setType(types[0]); }, [types]);

  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [input, setInput] = useState('');
  const [when, setWhen] = useState<'now' | 'yesterday'>('now');
  const [reset, setReset] = useState(false);
  const [confirm, setConfirm] = useState<{ value: number; check: VCheck } | null>(null);

  const color = typeColor(type);
  const mine = useMemo(() => readings.filter(r => r.propertyId === prop?.id && r.type === type), [readings, prop, type]);
  const last = sortReadings(mine)[mine.length - 1];

  const clear = () => { setPhoto(null); setCandidates(null); setInput(''); setReset(false); setWhen('now'); };
  useEffect(clear, [type, prop?.id]);
  // İlk kez bu türü okuyan kullanıcıya rehberi göster
  useEffect(() => {
    if (!focused || !prop || types.length === 0) return;
    if (!guideSeen?.[type] && readings.filter(r => r.propertyId === prop.id && r.type === type).length === 0) setGuide(true);
  }, [focused, type, prop?.id]);
  const closeGuide = () => { setGuide(false); setSettings({ guideSeen: { ...(guideSeen ?? {}), [type]: true } }); };

  // Onay ekranı önizlemesi: bu okumayla birlikte ay durumu
  const preview = useMemo(() => {
    if (!prop || !confirm || !Number.isFinite(confirm.value) || confirm.check.severity === 'error') return null;
    const date = when === 'now' ? new Date() : new Date(Date.now() - 86_400_000);
    const next: Reading[] = [...mine, { id: 'tmp', propertyId: prop.id, type, date: date.toISOString(), index: confirm.value, source: 'manual', meterReset: reset || undefined }];
    const fc = forecastMonth(next, type);
    const cal = latestCalibration(bills.filter(b => b.propertyId === prop.id), type, bundle, prop.province);
    const month = monthKey(new Date());
    const since = last && !reset ? confirm.value - last.index : null;
    const days = last && !reset ? Math.max(0.04, (date.getTime() - new Date(last.date).getTime()) / 86_400_000) : null;
    return {
      since, days,
      soFar: fc.measured > 0 ? billFor(bundle, type, prop.province, month, fc.measured, cal) : null,
      projected: fc.reliable ? billFor(bundle, type, prop.province, month, fc.projected, cal) : null,
      fc,
    };
  }, [confirm, mine, when, reset, bills, bundle, prop, type, last]);

  if (!prop) return null;
  if (types.length === 0) {
    return (
      <Screen><Header title="Sayaç oku" />
        <Card><T.Body>Bu evde okunacak sayaç tanımlı değil. Merkezi sistem doğalgaz için Özet'ten fatura girebilirsin.</T.Body>
          <Button kind="secondary" title="Ev ayarları" onPress={() => router.push({ pathname: '/property', params: { id: prop.id } })} style={{ marginTop: SPACE.md }} />
        </Card>
      </Screen>
    );
  }

  const capture = async () => {
    if (!cam.current || busy) return;
    setBusy(true);
    try {
      const p = await cam.current.takePictureAsync({ quality: 0.9, skipProcessing: false });
      if (!p) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setPhoto(p.uri);
      // Vizör ekranın üst-ortasında; fotoğrafın orta bandını kırp (oransal)
      const c = await readMeter(p.uri, p.width, p.height, { x: 0.04, y: 0.28, w: 0.92, h: 0.34 }, last?.index);
      setCandidates(c);
      if (c && c[0]) setInput(String(c[0].value).replace('.', ','));
    } catch {
      setCandidates([]);
    } finally {
      setBusy(false);
    }
  };

  const review = () => {
    const v = parseMeterInput(input, type);
    if (v == null) {
      setConfirm({ value: NaN, check: { severity: 'error', code: 'INVALID', message: 'Geçerli bir sayaç değeri gir. Örn: 43817 veya 43817,05' } });
      return;
    }
    const date = when === 'now' ? new Date() : new Date(Date.now() - 86_400_000);
    setConfirm({ value: v, check: validateNewReading(mine, type, v, date, reset) });
  };

  const save = () => {
    if (!confirm || confirm.check.severity === 'error') return;
    const date = when === 'now' ? new Date() : new Date(Date.now() - 86_400_000);
    addReading({
      propertyId: prop.id, type, date: date.toISOString(), index: confirm.value,
      source: candidates && candidates.length ? 'ocr' : 'manual', meterReset: reset || undefined, photoUri: photo ?? undefined,
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const firstEver = readings.filter(r => r.propertyId === prop.id).length === 0;
    setConfirm(null);
    clear();
    router.navigate('/');
    if (firstEver) {
      // Bağlamlı izin: ikinci okumayı hatırlatmak için
      setTimeout(() => Alert.alert(
        'İkinci okumayı hatırlatalım mı?',
        'Tüketimini hesaplamak için birkaç gün sonra tekrar okuman gerekiyor. Ayrıca doğalgaz hakkın dolmak üzereyken seni uyarabiliriz.',
        [{ text: 'Şimdi değil', style: 'cancel' }, { text: 'Hatırlat', onPress: () => {
          scheduleMonthlyReminder(useVerim.getState().settings.reminderDay || 1, true).then(() => scheduleSecondReading()).catch(() => {});
        } }],
      ), 600);
    }
  };

  return (
    <Screen>
      <Header title="Sayaç oku" subtitle={`${prop.name} · ${prop.province}`}
        right={<TouchableOpacity onPress={() => { tap(); setGuide(true); }} style={s.whereBtn} accessibilityRole="button">
          <MapPin size={16} color={C.brand} /><Text style={s.whereText}>Sayacım nerede?</Text>
        </TouchableOpacity>} />
      {types.length > 1 && (
        <Segmented value={type} onChange={setType}
          options={types.map(t => ({ value: t, label: typeLabel(t), color: typeColor(t) }))} />
      )}
      <View style={{ height: SPACE.md }} />
      <Segmented value={mode} onChange={m => { setMode(m); setPhoto(null); setCandidates(null); }}
        options={[{ value: 'camera', label: 'Kamera' }, { value: 'manual', label: 'Elle gir' }]} />

      <View style={{ height: SPACE.lg }} />

      {mode === 'camera' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {!perm ? <ActivityIndicator color={C.brand} style={{ margin: SPACE.xl }} />
            : !perm.granted ? (
              <View style={{ padding: SPACE.lg }}>
                <T.Body>Sayacı okutmak için kamera izni gerekiyor. Fotoğraflar cihazından çıkmaz.</T.Body>
                <Button title={perm.canAskAgain ? 'Kameraya izin ver' : 'Ayarları aç'} style={{ marginTop: SPACE.md }}
                  onPress={() => (perm.canAskAgain ? requestPerm() : Linking.openSettings())} />
                <Button kind="ghost" title="Elle gir" onPress={() => setMode('manual')} />
              </View>
            ) : photo ? (
              <View>
                <Image source={{ uri: photo }} style={{ width: '100%', height: 260 }} resizeMode="cover" accessibilityLabel="Sayaç fotoğrafı" />
                <TouchableOpacity style={s.retake} onPress={() => { tap(); setPhoto(null); setCandidates(null); setInput(''); }} accessibilityLabel="Tekrar çek">
                  <RotateCcw size={18} color={C.text} /><Text style={s.retakeText}>Tekrar çek</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ height: 340 }}>
                {focused ? <CameraView ref={cam} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} /> : null}
                <View style={s.overlay} pointerEvents="none">
                  <View style={[s.vf, { borderColor: color }]} />
                  <Text style={s.vfText}>Rakamları çerçevenin içine al</Text>
                </View>
                <View style={s.camBar}>
                  <TouchableOpacity onPress={() => { tap(); setTorch(t => !t); }} style={s.camSide} accessibilityLabel="Flaş">
                    {torch ? <Zap size={22} color={C.warn} /> : <ZapOff size={22} color={C.text} />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={capture} style={[s.shutter, { borderColor: color }]} accessibilityLabel="Fotoğraf çek" disabled={busy}>
                    {busy ? <ActivityIndicator color={color} /> : <Camera size={28} color={color} />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { tap(); setMode('manual'); }} style={s.camSide} accessibilityLabel="Elle gir">
                    <Keyboard size={22} color={C.text} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
        </Card>
      )}

      {(mode === 'manual' || photo) && (
        <Card>
          {photo && candidates !== null && (
            candidates.length > 0 ? (
              <View style={{ marginBottom: SPACE.md }}>
                <T.Small>Okunan değer — doğru olanı seç veya düzelt:</T.Small>
                <View style={s.cands}>
                  {candidates.map(c => {
                    const v = String(c.value).replace('.', ',');
                    const on = input === v;
                    return (
                      <TouchableOpacity key={v} onPress={() => { tap(); setInput(v); }} style={[s.cand, on && { borderColor: color, backgroundColor: color + '18' }]}>
                        <Text style={[s.candText, on && { color }]}>{num(c.value)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : (
              <T.Small color={C.warn} style={{ marginBottom: SPACE.md }}>
                {ocrAvailable() ? 'Rakamlar net okunamadı. Fotoğrafa bakarak değeri yaz ya da tekrar çek (yakından, flaşla).' : 'Otomatik okuma bu sürümde kapalı; fotoğrafa bakarak değeri yaz.'}
              </T.Small>
            )
          )}

          <T.Label>{typeLabel(type)} sayacı endeksi</T.Label>
          <View style={[s.bigInput, { borderColor: color + '66' }]}>
            <TextInput value={input} onChangeText={t => setInput(t.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad"
              placeholder={last ? num(last.index) : '00000'} placeholderTextColor={C.textMuted} style={s.bigInputText}
              selectionColor={color} autoFocus={mode === 'manual' && !photo} accessibilityLabel="Sayaç endeksi" maxLength={14} />
            <Text style={s.unit}>m³</Text>
          </View>
          <View style={s.hint}><Info size={14} color={C.textMuted} /><T.Small style={{ flex: 1 }}>{HINT[type]}</T.Small></View>
          {last ? <T.Small style={{ marginTop: 6 }}>Son okuma: {num(last.index)} m³ · {dateTR(last.date)}</T.Small> : (
            <T.Small style={{ marginTop: 6, color: C.text }}>İlk okuman başlangıç noktası olacak — tüketim bir sonraki okumadan itibaren hesaplanır.</T.Small>
          )}

          <View style={{ height: SPACE.lg }} />
          <Segmented value={when} onChange={setWhen} options={[{ value: 'now', label: 'Şimdi okudum' }, { value: 'yesterday', label: 'Dün okudum' }]} />
          {last ? (
            <View style={s.resetRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.resetTitle}>Sayaç değişti / sıfırlandı</Text>
                <T.Small>Yeni sayaç takıldıysa işaretle; bu okuma yeni başlangıç olur.</T.Small>
              </View>
              <Switch accessibilityLabel="Sayaç değişti / sıfırlandı" value={reset} onValueChange={setReset} trackColor={{ true: color, false: C.border }} />
            </View>
          ) : null}
          <Button title="Devam" color={color} disabled={!input} onPress={review} style={{ marginTop: SPACE.lg }} />
        </Card>
      )}

      <MeterGuide kind={type} visible={guide} onClose={closeGuide} />

      <Sheet visible={!!confirm} onClose={() => setConfirm(null)} title={confirm?.check.severity === 'error' ? 'Kontrol et' : 'Okumayı onayla'}>
        {confirm && (
          <View>
            {confirm.check.severity !== 'ok' && (
              <View style={[s.alert, { borderColor: (confirm.check.severity === 'error' ? C.danger : C.warn) + '66', backgroundColor: (confirm.check.severity === 'error' ? C.danger : C.warn) + '12' }]}>
                <T.Body>{confirm.check.message}</T.Body>
              </View>
            )}
            {Number.isFinite(confirm.value) && confirm.check.severity !== 'error' && (
              <>
                <View style={{ alignItems: 'center', marginVertical: SPACE.lg }}>
                  <Badge text={typeLabel(type)} color={color} />
                  <Text style={[s.confirmBig, { color }]}>{num(confirm.value)} <Text style={{ fontSize: FONT.lg }}>m³</Text></Text>
                  {reset ? <T.Small>Yeni sayaç başlangıcı</T.Small> : null}
                </View>
                {preview?.since != null && preview.days != null && (
                  <Row label={`Son okumadan beri (${preview.days < 1 ? '1 günden az' : Math.round(preview.days) + ' gün'})`} value={m3(preview.since, 3)} />
                )}
                {preview?.soFar && <Row label="Bu ay şu ana kadar" value={`${m3(preview.fc.measured)} · ${tl(preview.soFar.total)}`} />}
                {preview?.projected && <Row label="Ay sonu tahmini" value={tl(preview.projected.total)} bold valueColor={color} />}
                {preview?.projected?.gas && (
                  <Row label="Doğalgaz fiyatı (ay sonu)" value={preview.projected.gas.tier === 1 ? 'Destekli' : 'Desteksiz — hak aşılıyor'} valueColor={preview.projected.gas.tier === 2 ? C.danger : C.ok} />
                )}
                {!last && <T.Small style={{ marginTop: SPACE.md }}>Bu ilk okuman. Birkaç gün sonra tekrar okuduğunda tüketim ve fatura tahmini başlar.</T.Small>}
              </>
            )}
            <View style={{ height: SPACE.lg }} />
            {confirm.check.severity === 'error'
              ? <Button title="Düzelt" kind="secondary" onPress={() => setConfirm(null)} />
              : <Button title={confirm.check.severity === 'warning' ? 'Yine de kaydet' : 'Kaydet'} color={color} icon={<Check size={18} color="#04140D" />} onPress={save} />}
            {confirm.check.severity !== 'error' && <Button kind="ghost" title="Düzelt" onPress={() => setConfirm(null)} />}
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  whereBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.brand + '44', backgroundColor: C.brandDim },
  whereText: { color: C.brand, fontWeight: '700', fontSize: FONT.sm },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingBottom: 70 },
  vf: { width: VF.w - 40, height: VF.h, borderWidth: 2, borderRadius: RADIUS.md, backgroundColor: 'rgba(255,255,255,0.03)' },
  vfText: { color: '#fff', marginTop: 10, fontSize: FONT.sm, fontWeight: '700', textShadowColor: '#000', textShadowRadius: 4 },
  camBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: 'rgba(7,10,18,0.7)' },
  camSide: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  shutter: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  retake: { position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(7,10,18,0.8)', paddingHorizontal: 14, minHeight: 40, borderRadius: RADIUS.full },
  retakeText: { color: C.text, fontWeight: '700' },
  cands: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  cand: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: RADIUS.md, borderWidth: 1, borderColor: C.border, backgroundColor: C.bgRaised },
  candText: { color: C.text, fontSize: FONT.lg, fontWeight: '800', fontVariant: ['tabular-nums'] },
  bigInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: RADIUS.lg, backgroundColor: C.bgRaised, paddingHorizontal: SPACE.lg, marginTop: 8 },
  bigInputText: { flex: 1, color: C.text, fontSize: 34, fontWeight: '800', paddingVertical: 14, fontVariant: ['tabular-nums'], letterSpacing: 1 },
  unit: { color: C.textDim, fontSize: FONT.lg, fontWeight: '700' },
  hint: { flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'flex-start' },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.lg },
  resetTitle: { color: C.text, fontSize: FONT.md, fontWeight: '600' },
  alert: { borderWidth: 1, borderRadius: RADIUS.md, padding: SPACE.md, marginBottom: SPACE.md },
  confirmBig: { fontSize: 40, fontWeight: '800', marginTop: 8, fontVariant: ['tabular-nums'] },
});
