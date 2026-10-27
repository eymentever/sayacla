// Anonim kullanım ölçümü ve (izinli) tüketim katkısı.
// Gönderilmeyenler: ad, ev adı, fotoğraf, konum, adres, sayaç endeksi, cihaz kimliği, IP'ye bağlı profil.
// Kimlik: kuruluma özgü rastgele UUID (store.installId); "Tüm verileri sil" ile yenilenir.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useVerim } from '../store/useVerim';
import { Reading, UtilityType } from '../engine/types';

const BASE = 'https://lqruvibidinnuqmbgeno.supabase.co/rest/v1/';
const KEY = 'sb_publishable_zoiPMlu4Yif537pDgIY4dQ_X3G0rHmM';
const OUTBOX = 'sayacla-outbox';
const LAST_OPEN = 'sayacla-last-open';
const MAX_QUEUE = 400;

type Table = 'events' | 'usage_samples';
interface Item { t: Table; row: Record<string, unknown> }

let queue: Item[] = [];
let loaded = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

const enabled = () => !__DEV__ && Platform.OS !== 'web';
const version = () => Constants.expoConfig?.version ?? '';

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(OUTBOX);
    if (raw) queue = [...JSON.parse(raw), ...queue].slice(-MAX_QUEUE);
  } catch { /* yok say */ }
}

async function persist() {
  try { await AsyncStorage.setItem(OUTBOX, JSON.stringify(queue.slice(-MAX_QUEUE))); } catch { /* yok say */ }
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush().catch(() => {}); }, 4000);
}

function push(item: Item) {
  if (!enabled()) return;
  queue.push(item);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  persist();
  schedule();
}

export async function flush() {
  if (!enabled() || flushing) return;
  await load();
  if (!queue.length) return;
  flushing = true;
  try {
    for (const t of ['events', 'usage_samples'] as Table[]) {
      const batch = queue.filter(i => i.t === t).slice(0, 100);
      if (!batch.length) continue;
      const res = await fetch(BASE + t, {
        method: 'POST',
        headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(batch.map(b => b.row)),
      });
      // PostgREST toplu eklemede tüm satırların anahtarları aynı olmalı — satırlar sabit şemayla üretilir.
      // 2xx → gönderildi; 4xx → kalıcı hata (şema), tekrar deneme; 5xx/ağ → kuyrukta kalır
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        const sent = new Set(batch);
        queue = queue.filter(i => !sent.has(i));
      }
    }
    await persist();
  } catch { /* çevrimdışı — sonra tekrar */ } finally {
    flushing = false;
  }
}

/** Anonim kullanım olayı (Ayarlar'dan kapatılabilir). */
export function track(name: string, props: Record<string, string | number | boolean | null | undefined> = {}) {
  const st = useVerim.getState();
  if (!st.settings.analytics) return;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) if (v !== undefined) clean[k] = v;
  push({ t: 'events', row: { install_id: st.installId, name, props: clean, app_version: version(), platform: Platform.OS, client_ts: new Date().toISOString() } });
}

function propertyContext(propertyId: string) {
  const st = useVerim.getState();
  const p = st.properties.find(x => x.id === propertyId);
  if (!p) return null;
  return {
    province: p.province, district: p.district || null,
    household: st.profile.householdSize || null,
    gas_mode: p.hasGas ? (p.gasMode ?? 'meter') : null,
    home: p.home ?? null,
  };
}

/** Yeni okuma kaydedilince: olay + (izin varsa) önceki okumayla aradaki tüketim. */
export function onReadingSaved(r: Omit<Reading, 'id'>) {
  const st = useVerim.getState();
  const same = st.readings.filter(x => x.propertyId === r.propertyId && x.type === r.type).sort((a, b) => a.date.localeCompare(b.date));
  track('reading_saved', { type: r.type, source: r.source, nth: same.length, reset: !!r.meterReset });
  if (st.settings.contribute !== true || r.meterReset) return;
  const idx = same.findIndex(x => x.date === r.date && x.index === r.index);
  const prev = idx > 0 ? same[idx - 1] : null;
  if (!prev) return;
  const days = (new Date(r.date).getTime() - new Date(prev.date).getTime()) / 864e5;
  const m3 = r.index - prev.index;
  if (days < 0.5 || m3 < 0) return;
  const ctx = propertyContext(r.propertyId);
  if (!ctx) return;
  push({ t: 'usage_samples', row: { install_id: st.installId, type: r.type, period_start: prev.date, period_end: r.date, m3: Math.round(m3 * 1000) / 1000, bill_amount: null, source: 'reading', ...ctx } });
}

/** Fatura kaydedilince: olay + (izin varsa) aylık tüketim ve tutar. */
export function onBillSaved(b: { propertyId: string; type: UtilityType; month: string; m3: number; amount: number }) {
  const st = useVerim.getState();
  track('bill_saved', { type: b.type });
  if (st.settings.contribute !== true) return;
  const ctx = propertyContext(b.propertyId);
  if (!ctx) return;
  const [y, m] = b.month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString();
  push({ t: 'usage_samples', row: { install_id: st.installId, type: b.type, period_start: start, period_end: end, m3: b.m3, bill_amount: b.amount, source: 'bill', ...ctx } });
}

/** Günde bir kez "uygulama açıldı" — elde tutma (D1/D7/D30) ölçümü için. */
export async function trackDailyOpen() {
  const st = useVerim.getState();
  if (!st.profile.onboarded) return;
  const today = new Date().toISOString().slice(0, 10);
  try {
    if ((await AsyncStorage.getItem(LAST_OPEN)) === today) { flush().catch(() => {}); return; }
    await AsyncStorage.setItem(LAST_OPEN, today);
  } catch { /* yok say */ }
  const p = st.properties.find(x => x.id === st.activePropertyId) ?? st.properties[0];
  const days = Math.floor((Date.now() - new Date(st.installedAt).getTime()) / 864e5);
  track('app_open', {
    days_since_install: days, readings: st.readings.length, bills: st.bills.length, homes: st.properties.length,
    province: p?.province, has_gas: p?.hasGas, has_water: p?.hasWater, contribute: st.settings.contribute,
  });
}
