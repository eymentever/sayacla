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
import { gasLimit, billFor, gasBillRaw } from '../../src/engine/bills';
import { monthKey } from '../../src/engine/consumption';
import { tl, m3, pct, monthName, daysAgo } from '../../src/utils/format';
import { notifyNow, scheduleTierFollowUp, scheduleNextLimitNotice, syncWeeklyHeatingReminder } from '../../src/services/notify';
import { protectedSavings } from '../../src/engine/insights';
import { track } from '../../src/services/analytics';
import { ContributeCard } from '../../src/ui/Contribute';
import { diagnose, compareToAverage, combinedGasPct } from '../../src/engine/diagnosis';
import { Stethoscope, HelpCircle } from 'lucide-react-native';
import { Shield } from 'lucide-react-native';

export default function Dashboard() {
  const router = useRouter();
  const d = useDashboard();
  const profile = useVerim(s => s.profile);
  const properties = useVerim(s => s.properties);
  const setActive = useVerim(s => s.setActiveProperty);
  const readings = useVerim(s => s.readings);
  const tierAlerts = useVerim(s => s.settings.tierAlerts);
  const weeklyHeating = useVerim(s => s.settings.weeklyHeating);
  const warned = useVerim(s => s.warned);
  const markWarned = useVerim(s => s.markWarned);
  const bills = useVerim(s => s.bills);
  const [switcher, setSwitcher] = useState(false);
  const [allTips, setAllTips] = useState(false);

  // Kademe riski / aşımı → ayda bir kez yerel bildirim
  useEffect(() => {
    if (!d || !tierAlerts) return;
    const ins = d.insights.find(i => i.id === 'gas-tier-risk' || i.id === 'gas-tier-exceeded');
    if (!ins) return;
    if (ins.id === 'gas-tier-risk') { markWarned(d.prop.id, monthKey(new Date())); scheduleTierFollowUp().catch(() => {}); }
    const key = `verim-alert-${d.prop.id}-${monthKey(new Date())}-${ins.id}`;
    AsyncStorage.getItem(key).then(v => {
      if (v) return;
      AsyncStorage.setItem(key, '1');
      track('tier_alert', { kind: ins.id, province: d.prop.province });
      notifyNow(ins.title, ins.body, '/').catch(() => {});
    }).catch(() => {});
  }, [d?.insights, tierAlerts]);

  // Isıtma sezonu: haftalık hatırlatıcı + gelecek ayın limit bildirimi
  useEffect(() => {
    if (!d?.gas || d.prop.gasMode === 'central') { syncWeeklyHeatingReminder(false).catch(() => {}); return; }
    syncWeeklyHeatingReminder(weeklyHeating).catch(() => {});
    if (!weeklyHeating) return;
    const n = new Date();
    const next = monthKey(new Date(n.getFullYear(), n.getMonth() + 1, 15));
    scheduleNextLimitNotice(d.prop.province, gasLimit(d.bundle, d.prop.province, next), gasLimit(d.bundle, d.prop.province, monthKey(n)), monthName(next, false)).catch(() => {});
  }, [d?.prop.id, d?.prop.province, weeklyHeating]);

  if (!d) return <Screen><Empty title="Mülk bulunamadı" body="Ayarlar'dan bir ev ekle." action={<Button title="Ev ekle" onPress={() => router.push('/property')} />} /></Screen>;

  const now = new Date();
  const month = monthKey(now);
  const hasAny = !!(d.water?.hasData || d.gas?.hasData);
  const propReadings = readings.filter(r => r.propertyId === d.prop.id);
  const delta = d.lastTotal != null ? d.totalProjected - d.lastTotal : null;
  const needsCalibration = [d.water?.projectedBill, d.gas?.projectedBill].some(b => b && b.confidence !== 'calibrated');
  // Öneriler: ev profili varsa kişisel teşhis, yoksa genel öneriler. Kademe/su dilimi önerileri her zaman.
  const home = d.prop.home;
  const causes = home ? diagnose(home, d.gas?.projectedBill?.total ?? 0, d.water?.projectedBill?.total ?? 0,
    d.water?.forecast.projected ?? 0, profile.householdSize, now.getMonth()) : [];
  const GENERIC = ['gas-1c', 'gas-night', 'gas-valves', 'gas-dhw', 'water-shower'];
  const actions: Tip[] = [
    ...d.tips.filter(t => !home || !GENERIC.includes(t.id)),
    ...causes.map(c => ({ id: c.id, type: c.type, title: c.title, body: `${c.why} ${c.fix}`, monthlyTL: c.monthlyTL, effort: c.effort })),
  ].sort((a, b) => b.monthlyTL - a.monthlyTL);
  const visibleTips = allTips ? actions : actions.slice(0, 4);
  const combined = home ? combinedGasPct(causes) : 0;

  return (
    <Screen>
      <Header
        title={profile.name ? `Merhaba, ${profile.name}` : 'Sayaçla'}
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
          <View style={{ marginTop: SPACE.md, gap: 10 }}>
            {[
              { n: 1, t: 'Sayacını bul ve oku', d: 'Fotoğrafını çek ya da rakamları yaz. 30 saniye.', done: propReadings.length > 0 },
              { n: 2, t: '3–7 gün sonra tekrar oku', d: 'Aradaki farktan günlük tüketimini buluruz.', done: false },
              { n: 3, t: 'Faturanı önceden gör', d: 'Ay sonu tutarı, doğalgaz limitin ve sana özel tasarruf yolları.', done: false },
            ].map(x => (
              <View key={x.n} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={[s.stepNum, x.done && { backgroundColor: C.brand, borderColor: C.brand }]}>
                  <Text style={[s.stepNumText, x.done && { color: '#04140D' }]}>{x.done ? '✓' : x.n}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepTitle}>{x.t}</Text>
                  <T.Small>{x.d}</T.Small>
                </View>
              </View>
            ))}
          </View>
        )}
        <Button title={hasAny ? 'Sayacı oku' : propReadings.length ? 'İkinci okumayı yap' : 'İlk okumayı yap'}
          icon={<ScanLine size={18} color="#04140D" />} onPress={() => router.push('/scan')} style={{ marginTop: SPACE.lg }} />
      </Card>

      {/* ── Sayaçla ile korunan para ── */}
      {d.gas && d.prop.gasMode !== 'central' && (() => {
        const ps = protectedSavings(propReadings, warned[d.prop.id] ?? [], d.bundle, d.prop.province, now,
          latestCalibration(bills.filter(b => b.propertyId === d.prop.id), 'gas', d.bundle, d.prop.province));
        if (ps.total <= 0) return null;
        return (
          <Card accent={C.ok} style={{ backgroundColor: C.ok + '0D' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
              <Shield size={22} color={C.ok} />
              <View style={{ flex: 1 }}>
                <T.Small>Sayaçla ile korunan</T.Small>
                <Text style={{ color: C.ok, fontSize: FONT['2xl'], fontWeight: '800' }}>{tl(ps.total)}</Text>
                <T.Small>{ps.months.map(m => monthName(m.month, false)).join(', ')}: uyarıdan sonra limitin altında kaldın; pahalı fiyat farkını ödemedin.</T.Small>
              </View>
            </View>
          </Card>
        );
      })()}

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
      {hasAny && (
        <Card>
          <View style={s.tipsHead}>
            <Lightbulb size={18} color={C.brand} />
            <T.Title style={{ flex: 1, marginLeft: 8 }}>Faturanı nasıl düşürürsün?</T.Title>
          </View>
          {home && combined > 0.05 && d.gas?.projectedBill ? (
            <T.Body style={{ marginBottom: SPACE.sm }}>
              Evinin cevaplarına göre doğalgazda ~%{Math.round(combined * 100)} tasarruf payın var — ayda yaklaşık {tl(d.gas.projectedBill.total * combined)}.
            </T.Body>
          ) : (
            <T.Small style={{ marginBottom: SPACE.sm }}>Kendi tüketimin ve {d.prop.province} tarifesiyle, aylık TL olarak. Öneriler birbiriyle örtüşebilir; toplanmaz.</T.Small>
          )}
          {visibleTips.map(t => <TipRow key={t.id} t={t} />)}
          {actions.length > 4 && (
            <Button kind="ghost" title={allTips ? 'Daha az göster' : `Tümü (${actions.length})`} onPress={() => setAllTips(v => !v)} />
          )}
          <TouchableOpacity onPress={() => { tap(); router.push('/diagnose'); }} style={s.diagRow} accessibilityRole="button">
            <Stethoscope size={18} color={C.brand} />
            <View style={{ flex: 1 }}>
              <Text style={s.diagTitle}>{home ? 'Ev bilgilerini güncelle' : 'Neden fazla kullandığını bul (1 dk)'}</Text>
              {!home ? <T.Small>11 kısa soru: kombi, sıcaklık, pencere, duş… Sana özel sıralı çözüm listesi.</T.Small> : null}
            </View>
          </TouchableOpacity>
        </Card>
      )}

      {/* ── İzinli anonim katkı (bir kez sorulur) ── */}
      {readings.some(r => r.propertyId === d.prop.id) ? <ContributeCard /> : null}

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
  const [explain, setExplain] = useState(false);
  const activeProp = useVerim(st => st.properties.find(p => p.id === st.activePropertyId));
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
                <TouchableOpacity onPress={() => { tap(); setExplain(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel="Ucuz fiyat limiti nedir?">
                  <T.Small>Ucuz fiyat limiti ({monthName(month, false)})</T.Small>
                  <HelpCircle size={14} color={C.textDim} />
                </TouchableOpacity>
                <T.Small color={x.forecast.measured > limit ? C.danger : C.text}>{m3(x.forecast.measured)} / {m3(limit)}</T.Small>
              </View>
              <View style={{ marginTop: 8 }}>
                <Progress ratio={x.forecast.measured / limit}
                  color={x.forecast.measured > limit ? C.danger : x.forecast.projected > limit ? C.warn : C.ok}
                  marker={x.forecast.reliable ? Math.min(1, x.forecast.projected / limit) : undefined} />
              </View>
              {info ? <T.Small style={{ marginTop: 8 }}>{info.body}</T.Small> : null}
              {x.forecast.reliable ? (() => {
                const cmp = compareToAverage(x.forecast.projected, limit, province, activeProp?.home);
                return cmp ? <T.Small color={cmp.ratio > 1.1 ? C.warn : C.textDim} style={{ marginTop: 8 }}>{cmp.sentence}</T.Small> : null;
              })() : null}
              {b?.gas?.tier === 2 && x.forecast.measured <= limit ? (
                <T.Small color={C.ok} style={{ marginTop: 8 }}>
                  Limitin altında kalırsan bu ay ~{tl(billFor(bundle, 'gas', province, month, limit, cal).total)} ödersin (tahmine göre {tl(b.total - billFor(bundle, 'gas', province, month, limit, cal).total)} az).
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
      <Sheet visible={explain} onClose={() => setExplain(false)} title="Ucuz fiyat limiti nedir?">
        <T.Body>Doğalgaz evlere iki fiyattan satılıyor: ucuz fiyat (yaklaşık {Math.round(gasPerM3(bundle, province, month, 1))} ₺/m³) ve pahalı fiyat (yaklaşık {Math.round(gasPerM3(bundle, province, month, 2))} ₺/m³, vergiler dahil).</T.Body>
        <T.Body style={{ marginTop: SPACE.md }}>Her il için her ay bir limit var. Bu ay {province} limiti <Text style={{ fontWeight: '800' }}>{m3(gasLimit(bundle, province, month))}</Text>. Limitin altında kalırsan ayın tüm gazı ucuz fiyattan hesaplanır.</T.Body>
        <T.Body style={{ marginTop: SPACE.md }}>Limiti <Text style={{ fontWeight: '800' }}>1 m³ bile aşarsan</Text> o ayın tamamı pahalı fiyattan hesaplanır; sadece aşan kısım değil. Bu yüzden limite yaklaşınca birkaç m³ az kullanmak yüzlerce lira fark yaratabilir.</T.Body>
        <T.Body style={{ marginTop: SPACE.md }}>Sayaçla tüketim hızına bakıp ay sonunu tahmin eder ve limiti aşmadan önce seni uyarır. Limit her ayın 1'inde sıfırlanır; kışın yükselir, yazın düşer.</T.Body>
        <T.Small style={{ marginTop: SPACE.md }}>Kaynak: BOTAŞ kademeli konut tarifesi (4 Nisan 2026). Limit, ilin son 5 yıldaki aynı ay ortalama konut tüketiminin %75 fazlasıdır. Şehit yakınları ve gaziler bu uygulamanın dışındadır.</T.Small>
      </Sheet>
    </Card>
  );
}

/** Vergiler dahil m³ başı fiyat (kademe zorlanmış) */
function gasPerM3(bundle: any, province: string, month: string, tier: 1 | 2) {
  return gasBillRaw(bundle, province, month, 10, tier).total / 10;
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
            Merkezi sistemde limit, bina tüketiminin daire sayısına bölünmesiyle hane başına uygulanır.
            O ay {province} limiti {m3(lim)}: {last.m3 > lim ? 'aşılmış, pahalı fiyattan faturalanmış olmalı.' : 'limitin altında kalmışsın, ucuz fiyat.'}
          </T.Small>
        </View>
      ) : (
        <T.Body dim>Merkezi sistemde bireysel sayaç olmadığı için aylık faturanı (hane payı m³ ve tutar) girerek limit durumunu takip edebilirsin.</T.Body>
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
  stepNum: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: C.textDim, fontWeight: '800', fontSize: FONT.sm },
  stepTitle: { color: C.text, fontSize: FONT.md, fontWeight: '700' },
  diagRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.md, paddingTop: SPACE.md, borderTopWidth: 1, borderTopColor: C.divider, minHeight: 48 },
  diagTitle: { color: C.brand, fontSize: FONT.md, fontWeight: '700' },
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
