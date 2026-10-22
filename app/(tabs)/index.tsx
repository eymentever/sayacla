import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Droplet, Flame, ArrowUpRight, ArrowDownRight, AlertTriangle, Lightbulb, ScanLine, Receipt, ChevronDown, Home, Info,
} from 'lucide-react-native';
import { C, FONT, RADIUS, SPACE, typeColor, typeLabel } from '../../src/theme';
import { Screen, Header, Card, T, Badge, Progress, Button, Empty, Sheet, Row, tap } from '../../src/ui';
import { useDashboard } from '../../src/hooks/useDashboard';
import { useVerim, useTariffs } from '../../src/store/useVerim';
import { TypeSummary, Tip, latestCalibration } from '../../src/engine/summary';
import { Insight } from '../../src/engine/insights';
import { gasLimit, billFor } from '../../src/engine/bills';
import { monthKey } from '../../src/engine/consumption';
import { tl, m3, pct, monthName, daysAgo } from '../../src/utils/format';
import { notifyNow } from '../../src/services/notify';

export default function Dashboard() {
  const router = useRouter();
  const d = useDashboard();
  const profile = useVerim(s => s.profile);
  const properties = useVerim(s => s.properties);
  const setActive = useVerim(s => s.setActiveProperty);
  const readings = useVerim(s => s.readings);
  const tierAlerts = useVerim(s => s.settings.tierAlerts);
  const [switcher, setSwitcher] = useState(false);
  const [allTips, setAllTips] = useState(false);

  // Kademe riski / aşımı → ayda bir kez yerel bildirim
  useEffect(() => {
    if (!d || !tierAlerts) return;
    const ins = d.insights.find(i => i.id === 'gas-tier-risk' || i.id === 'gas-tier-exceeded');
    if (!ins) return;
    const key = `verim-alert-${d.prop.id}-${monthKey(new Date())}-${ins.id}`;
    AsyncStorage.getItem(key).then(v => {
      if (v) return;
      AsyncStorage.setItem(key, '1');
      notifyNow(ins.title, ins.body, '/').catch(() => {});
    }).catch(() => {});
  }, [d?.insights, tierAlerts]);

  if (!d) return <Screen><Empty title="Mülk bulunamadı" body="Ayarlar'dan bir ev ekle." action={<Button title="Ev ekle" onPress={() => router.push('/property')} />} /></Screen>;

  const now = new Date();
  const month = monthKey(now);
  const hasAny = !!(d.water?.hasData || d.gas?.hasData);
  const propReadings = readings.filter(r => r.propertyId === d.prop.id);
  const delta = d.lastTotal != null ? d.totalProjected - d.lastTotal : null;
  const needsCalibration = [d.water?.projectedBill, d.gas?.projectedBill].some(b => b && b.confidence !== 'calibrated');
  const visibleTips = allTips ? d.tips : d.tips.slice(0, 3);

  return (
    <Screen>
      <Header
        title={profile.name ? `Merhaba, ${profile.name}` : 'Verim'}
        subtitle={`${d.prop.name} · ${d.prop.district ? d.prop.district + ', ' : ''}${d.prop.province}`}
        right={properties.length > 1 ? (
          <TouchableOpacity onPress={() => { tap(); setSwitcher(true); }} style={s.switchBtn} accessibilityLabel="Ev değiştir">
            <Home size={16} color={C.textDim} /><ChevronDown size={16} color={C.textDim} />
          </TouchableOpacity>
        ) : undefined}
      />

      {/* ── Bu ayın tahmini ── */}
      <Card style={s.hero}>
        <T.Label>{monthName(month, false)} tahmini faturan</T.Label>
        {hasAny ? (
          <>
            <T.Big style={{ marginTop: 6 }}>{tl(d.totalProjected)}</T.Big>
            {delta != null ? (
              <View style={s.deltaRow}>
                {delta >= 0 ? <ArrowUpRight size={18} color={C.danger} /> : <ArrowDownRight size={18} color={C.ok} />}
                <Text style={[s.deltaText, { color: delta >= 0 ? C.danger : C.ok }]}>
                  Geçen aya göre {delta >= 0 ? '+' : '−'}{tl(Math.abs(delta))} ({pct(delta / d.lastTotal!)})
                </Text>
              </View>
            ) : (
              <T.Small style={{ marginTop: 6 }}>Geçen ayla kıyas için geçen ayın faturasını gir veya düzenli okuma yap.</T.Small>
            )}
            <View style={s.splitRow}>
              {d.water?.projectedBill ? <Split color={C.water} label="Su" value={tl(d.water.projectedBill.total)} /> : null}
              {d.gas?.projectedBill ? <Split color={C.gas} label="Doğalgaz" value={tl(d.gas.projectedBill.total)} /> : null}
            </View>
          </>
        ) : (
          <T.Body dim style={{ marginTop: 8 }}>
            {propReadings.length === 0
              ? 'İlk okumanı yap. İlk okuma başlangıç noktasıdır; ikinci okumadan itibaren tüketimini ve faturanı hesaplarız.'
              : 'Başlangıç okuman kaydedildi. Birkaç gün sonra tekrar okut — tüketimin ve tahmini faturan burada belirecek.'}
          </T.Body>
        )}
        <Button title={hasAny ? 'Sayacı oku' : propReadings.length ? 'İkinci okumayı yap' : 'İlk okumayı yap'}
          icon={<ScanLine size={18} color="#04140D" />} onPress={() => router.push('/scan')} style={{ marginTop: SPACE.lg }} />
      </Card>

      {/* ── Uyarılar ── */}
      {d.insights.filter(i => i.level !== 'info').map(i => <InsightCard key={i.id} i={i} onLeak={() => router.push('/leak-test')} />)}

      {/* ── Tür kartları ── */}
      {d.gas && d.prop.gasMode === 'central'
        ? <CentralGasCard province={d.prop.province} propertyId={d.prop.id} onAdd={() => router.push({ pathname: '/bill', params: { type: 'gas' } })} />
        : d.gas ? <TypeCard s={d.gas} province={d.prop.province} bundle={d.bundle} readings={propReadings.filter(r => r.type === 'gas')}
          info={d.insights.find(i => i.id === 'gas-tier-ok')} onScan={() => router.push({ pathname: '/scan', params: { type: 'gas' } })} /> : null}
      {d.water ? <TypeCard s={d.water} province={d.prop.province} bundle={d.bundle} readings={propReadings.filter(r => r.type === 'water')}
        onScan={() => router.push({ pathname: '/scan', params: { type: 'water' } })} /> : null}

      {/* ── Ne yapmalısın ── */}
      {d.tips.length > 0 && (
        <Card>
          <View style={s.tipsHead}>
            <Lightbulb size={18} color={C.brand} />
            <T.Title style={{ flex: 1, marginLeft: 8 }}>Ne yapmalısın?</T.Title>
          </View>
          <T.Small style={{ marginBottom: SPACE.sm }}>Kendi tüketimin ve {d.prop.province} tarifesiyle, aylık TL olarak. Öneriler birbiriyle örtüşebilir; toplanmaz.</T.Small>
          {visibleTips.map(t => <TipRow key={t.id} t={t} />)}
          {d.tips.length > 3 && (
            <Button kind="ghost" title={allTips ? 'Daha az göster' : `Tüm öneriler (${d.tips.length})`} onPress={() => setAllTips(v => !v)} />
          )}
        </Card>
      )}

      {/* ── Kalibrasyon ── */}
      {hasAny && needsCalibration && (
        <Card accent={C.brand} onPress={() => router.push('/bill')}>
          <View style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'center' }}>
            <Receipt size={22} color={C.brand} />
            <View style={{ flex: 1 }}>
              <T.Title style={{ fontSize: FONT.md }}>Son faturanı bir kez gir</T.Title>
              <T.Small>Tahminler senin gerçek birim fiyatınla hesaplanır — belediye zamları dahil.</T.Small>
            </View>
          </View>
        </Card>
      )}

      <Sheet visible={switcher} onClose={() => setSwitcher(false)} title="Ev seç">
        {properties.map(p => (
          <Row key={p.id} label={`${p.name} · ${p.province}`} value={p.id === d.prop.id ? 'Aktif' : undefined} valueColor={C.brand}
            onPress={() => { setActive(p.id); setSwitcher(false); }} />
        ))}
        <Button kind="secondary" title="Yeni ev ekle" onPress={() => { setSwitcher(false); router.push('/property'); }} style={{ marginTop: SPACE.md }} />
      </Sheet>
    </Screen>
  );
}

function Split({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={s.split}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={[s.splitDot, { backgroundColor: color }]} />
        <Text style={s.splitLabel}>{label}</Text>
      </View>
      <Text style={s.splitValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const CONF = {
  calibrated: { text: 'Faturana göre', color: C.ok },
  official: { text: 'Resmi tarife', color: C.water },
  estimate: { text: 'Tahmini tarife', color: C.warn },
} as const;

function TypeCard({ s: x, province, bundle, readings, info, onScan }: {
  s: TypeSummary; province: string; bundle: any; readings: { date: string; index: number }[]; info?: Insight; onScan: () => void;
}) {
  const color = typeColor(x.type);
  const Icon = x.type === 'water' ? Droplet : Flame;
  const last = [...readings].sort((a, b) => b.date.localeCompare(a.date))[0];
  const stale = last && Date.now() - new Date(last.date).getTime() > 30 * 86_400_000;
  const month = monthKey(new Date());
  const limit = x.type === 'gas' ? gasLimit(bundle, province, month) : null;
  const b = x.projectedBill;
  const allBills = useVerim(st => st.bills);
  const activeId = useVerim(st => st.activePropertyId);
  const cal = latestCalibration(allBills.filter(bb => bb.propertyId === activeId), x.type, bundle, province);

  return (
    <Card>
      <View style={s.typeHead}>
        <View style={[s.typeIcon, { backgroundColor: color + '1A' }]}><Icon size={18} color={color} /></View>
        <T.Title style={{ flex: 1, marginLeft: 10 }}>{typeLabel(x.type)}</T.Title>
        {b ? <Badge text={CONF[b.confidence].text} color={CONF[b.confidence].color} /> : null}
      </View>

      {!x.hasData ? (
        <View>
          <T.Body dim>{last ? `Başlangıç okuması: ${last.index.toLocaleString('tr-TR')} m³ (${daysAgo(last.date)}). Bir sonraki okumada tüketimin hesaplanacak.` : 'Henüz okuma yok.'}</T.Body>
          <Button kind="secondary" title={last ? 'Tekrar oku' : 'Okumaya başla'} onPress={onScan} style={{ marginTop: SPACE.md }} />
        </View>
      ) : (
        <View>
          <View style={s.typeNums}>
            <View>
              <T.Small>Ay sonu tahmini</T.Small>
              <Text style={[s.typeBig, { color }]}>{tl(b!.total)}</Text>
              <T.Small>{m3(x.forecast.projected)} · şu ana kadar {tl(x.soFarBill?.total ?? 0)}</T.Small>
            </View>
            {x.lastMonth ? (
              <View style={{ alignItems: 'flex-end' }}>
                <T.Small>{monthName(x.lastMonth.month, false)} {x.lastMonth.isActual ? '(fatura)' : '(tahmini)'}</T.Small>
                <Text style={s.typeLast}>{tl(x.lastMonth.amount)}</Text>
                {x.deltaTL != null ? (
                  <Text style={{ color: x.deltaTL >= 0 ? C.danger : C.ok, fontWeight: '700', fontSize: FONT.sm }}>
                    {x.deltaTL >= 0 ? '+' : '−'}{tl(Math.abs(x.deltaTL))}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
          {x.reason ? <T.Small style={{ marginTop: SPACE.sm }}>Neden: {x.reason}</T.Small> : null}
          {!x.forecast.reliable ? <T.Small color={C.warn} style={{ marginTop: SPACE.sm }}>Tahmin için veri az; birkaç gün sonra tekrar okut.</T.Small> : null}

          {limit != null && Number.isFinite(limit) && (
            <View style={{ marginTop: SPACE.lg }}>
              <View style={s.rowBetween}>
                <T.Small>Kademe limiti ({monthName(month, false)}, {province})</T.Small>
                <T.Small color={x.forecast.measured > limit ? C.danger : C.text}>{m3(x.forecast.measured)} / {m3(limit)}</T.Small>
              </View>
              <View style={{ marginTop: 8 }}>
                <Progress ratio={x.forecast.measured / limit}
                  color={x.forecast.measured > limit ? C.danger : x.forecast.projected > limit ? C.warn : C.ok}
                  marker={x.forecast.reliable ? Math.min(1, x.forecast.projected / limit) : undefined} />
              </View>
              {info ? <T.Small style={{ marginTop: 8 }}>{info.body}</T.Small> : null}
              {b?.gas?.tier === 2 && x.forecast.measured <= limit ? (
                <T.Small color={C.ok} style={{ marginTop: 8 }}>
                  Limitte kalırsan bu ay ~{tl(billFor(bundle, 'gas', province, month, limit, cal).total)} ödersin (tahmine göre {tl(b.total - billFor(bundle, 'gas', province, month, limit, cal).total)} az).
                </T.Small>
              ) : null}
            </View>
          )}
        </View>
      )}
      {stale ? (
        <TouchableOpacity onPress={onScan} style={s.stale}>
          <Info size={14} color={C.warn} />
          <Text style={s.staleText}>Son okuma {daysAgo(last!.date)}. Doğru tahmin için şimdi oku.</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

function CentralGasCard({ province, propertyId, onAdd }: { province: string; propertyId: string; onAdd: () => void }) {
  const allBills = useVerim(s => s.bills);
  const bundle = useTariffs();
  const last = allBills.filter(b => b.propertyId === propertyId && b.type === 'gas').sort((a, b) => b.month.localeCompare(a.month))[0];
  const lim = last ? gasLimit(bundle, province, last.month) : null;
  return (
    <Card>
      <View style={s.typeHead}>
        <View style={[s.typeIcon, { backgroundColor: C.gasDim }]}><Flame size={18} color={C.gas} /></View>
        <T.Title style={{ flex: 1, marginLeft: 10 }}>Doğalgaz · merkezi sistem</T.Title>
      </View>
      {last && lim != null ? (
        <View>
          <T.Body>{monthName(last.month)}: {m3(last.m3)} → {tl(last.amount)}</T.Body>
          <T.Small style={{ marginTop: 6 }}>
            Merkezi sistemde kademe, bina tüketiminin daire sayısına bölünmesiyle hane başına uygulanır.
            O ayın {province} limiti {m3(lim)}: {last.m3 > lim ? '2. kademeden faturalanmış olmalı.' : '1. kademede kalmışsın.'}
          </T.Small>
        </View>
      ) : (
        <T.Body dim>Merkezi sistemde bireysel sayaç olmadığı için aylık faturanı (hane payı m³ ve tutar) girerek kademe durumunu takip edebilirsin.</T.Body>
      )}
      <Button kind="secondary" title="Fatura gir" onPress={onAdd} style={{ marginTop: SPACE.md }} />
    </Card>
  );
}

function InsightCard({ i, onLeak }: { i: Insight; onLeak: () => void }) {
  const color = i.level === 'critical' ? C.danger : C.warn;
  return (
    <Card accent={color} style={{ backgroundColor: color + '0D' }}>
      <View style={{ flexDirection: 'row', gap: SPACE.md }}>
        <AlertTriangle size={20} color={color} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={[s.insTitle, { color }]}>{i.title}</Text>
          <T.Body style={{ marginTop: 4 }}>{i.body}</T.Body>
          {i.action ? <T.Small style={{ marginTop: 6, color: C.text }}>→ {i.action}</T.Small> : null}
          {i.type === 'water' ? <Button kind="ghost" title="Kaçak testini başlat" onPress={onLeak} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, minHeight: 40 }} /> : null}
        </View>
      </View>
    </Card>
  );
}

function TipRow({ t }: { t: Tip }) {
  const color = typeColor(t.type);
  return (
    <View style={s.tip}>
      <View style={[s.tipBar, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.tipTitle}>{t.title}</Text>
        <Text style={s.tipBody}>{t.body}</Text>
        <Text style={s.tipEffort}>{t.effort === 'kolay' ? 'Hemen yapılabilir' : t.effort === 'orta' ? 'Biraz çaba' : 'Küçük yatırım'}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.tipTL}>~{tl(t.monthlyTL)}</Text>
        <Text style={s.tipPer}>/ay</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingHorizontal: 12, borderRadius: RADIUS.full, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  hero: { padding: SPACE.xl, backgroundColor: C.cardHi },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  deltaText: { fontSize: FONT.sm, fontWeight: '700' },
  splitRow: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.lg },
  split: { flex: 1, backgroundColor: C.bgRaised, borderRadius: RADIUS.md, padding: SPACE.md, gap: 4 },
  splitDot: { width: 8, height: 8, borderRadius: 4 },
  splitLabel: { color: C.textDim, fontSize: FONT.sm },
  splitValue: { color: C.text, fontSize: FONT.lg, fontWeight: '800' },
  typeHead: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACE.md },
  typeIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  typeNums: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  typeBig: { fontSize: FONT['2xl'], fontWeight: '800', marginVertical: 2 },
  typeLast: { color: C.text, fontSize: FONT.lg, fontWeight: '700', marginVertical: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  stale: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: C.divider, minHeight: 44 },
  staleText: { color: C.warn, fontSize: FONT.sm, flex: 1 },
  insTitle: { fontSize: FONT.md, fontWeight: '800' },
  tipsHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  tip: { flexDirection: 'row', gap: SPACE.md, paddingVertical: SPACE.md, borderTopWidth: 1, borderTopColor: C.divider },
  tipBar: { width: 3, borderRadius: 2 },
  tipTitle: { color: C.text, fontSize: FONT.md, fontWeight: '700' },
  tipBody: { color: C.textDim, fontSize: FONT.sm, marginTop: 3, lineHeight: 18 },
  tipEffort: { color: C.textMuted, fontSize: FONT.xs, marginTop: 4, fontWeight: '700' },
  tipTL: { color: C.brand, fontSize: FONT.md, fontWeight: '800' },
  tipPer: { color: C.textMuted, fontSize: FONT.xs },
});
