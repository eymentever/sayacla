// Kalıcı depolama anahtarı 'verim-v2' bilinçli olarak eski adla kalır: değişirse kullanıcıların verisi kaybolur.
// Sayaçla — tek kaynak veri deposu (v2). Sadece ham veri saklanır: okumalar, faturalar, mülkler.
// Tüketim ve maliyet her zaman motor tarafından türetilir → tarife güncellenince geçmiş de doğru olur.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reading, UtilityType } from '../engine/types';
import { PaidBill } from '../engine/summary';
import { TariffBundle, DEFAULT_BUNDLE, mergeBundle } from '../engine/tariffs';
import { HomeProfile } from '../engine/diagnosis';

export interface Property {
  id: string;
  name: string;
  province: string;
  district: string;
  hasWater: boolean;
  hasGas: boolean;
  /** 'meter' → kendi gaz sayacı (kombi, kartlı dahil) · 'central' → merkezi sistem, yalnızca fatura girilir */
  gasMode?: 'meter' | 'central';
  /** Doğalgaz sayacının fatura için okunduğu gün (1–28). Yoksa takvim ayı kullanılır. */
  billReadDay?: number;
  /** "Neden fazla kullanıyorum?" ev profili */
  home?: HomeProfile;
}

export interface Profile {
  name: string;
  householdSize: number;
  onboarded: boolean;
}

export interface Settings {
  /** Aylık okuma hatırlatıcısı (ayın günü, 0 = kapalı) */
  reminderDay: number;
  /** Gaz kademe uyarısı bildirimleri */
  tierAlerts: boolean;
  /** Isıtma sezonunda haftalık okuma hatırlatıcısı + ayın 1'inde limit bildirimi */
  weeklyHeating: boolean;
  /** Sayaç rehberi gösterildi mi (tür başına) */
  guideSeen?: { water?: boolean; gas?: boolean };
  /** Anonim kullanım istatistikleri (varsayılan açık, Ayarlar'dan kapatılabilir) */
  analytics: boolean;
  /** Anonim tüketim verisiyle il istatistiklerine katkı — açık rıza; null = henüz sorulmadı */
  contribute: boolean | null;
}

interface State {
  hydrated: boolean;
  profile: Profile;
  properties: Property[];
  activePropertyId: string | null;
  readings: Reading[];
  bills: PaidBill[];
  settings: Settings;
  /** Mülk başına kademe riski uyarısı verilen aylar ('YYYY-MM') — "korunan para" hesabı için */
  warned: Record<string, string[]>;
  /** Uzak tarife paketi (null → gömülü paket) */
  remoteTariffs: Partial<TariffBundle> | null;
  tariffsFetchedAt: string | null;
  /** Kuruluma özgü rastgele kimlik — kişiyi tanımlamaz, "Tüm verileri sil" ile yenilenir */
  installId: string;
  installedAt: string;

  completeOnboarding: (p: { name: string; householdSize: number; property: Omit<Property, 'id'> }) => void;
  addProperty: (p: Omit<Property, 'id'>) => string;
  updateProperty: (id: string, u: Partial<Property>) => void;
  removeProperty: (id: string) => void;
  setActiveProperty: (id: string) => void;
  setProfile: (u: Partial<Profile>) => void;
  addReading: (r: Omit<Reading, 'id'>) => void;
  removeReading: (id: string) => void;
  addBill: (b: Omit<PaidBill, 'id'>) => void;
  removeBill: (id: string) => void;
  setSettings: (u: Partial<Settings>) => void;
  markWarned: (propertyId: string, month: string) => void;
  setRemoteTariffs: (t: Partial<TariffBundle>) => void;
  resetAll: () => void;
}

export const newInstallId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const INITIAL = {
  profile: { name: '', householdSize: 3, onboarded: false },
  properties: [] as Property[],
  activePropertyId: null as string | null,
  readings: [] as Reading[],
  bills: [] as PaidBill[],
  settings: { reminderDay: 1, tierAlerts: true, weeklyHeating: true, analytics: true, contribute: null } as Settings,
  remoteTariffs: null as Partial<TariffBundle> | null,
  tariffsFetchedAt: null as string | null,
  warned: {} as Record<string, string[]>,
};

export const useSayacla = create<State>()(
  persist(
    (set, get) => ({
      hydrated: false,
      ...INITIAL,
      installId: newInstallId(),
      installedAt: new Date().toISOString(),

      completeOnboarding: ({ name, householdSize, property }) => {
        const id = uid();
        set({
          profile: { name: name.trim(), householdSize, onboarded: true },
          properties: [{ ...property, id }],
          activePropertyId: id,
        });
      },
      addProperty: p => {
        const id = uid();
        set(s => ({ properties: [...s.properties, { ...p, id }], activePropertyId: id }));
        return id;
      },
      updateProperty: (id, u) => set(s => ({ properties: s.properties.map(p => (p.id === id ? { ...p, ...u } : p)) })),
      removeProperty: id => set(s => {
        const properties = s.properties.filter(p => p.id !== id);
        return {
          properties,
          readings: s.readings.filter(r => r.propertyId !== id),
          bills: s.bills.filter(b => b.propertyId !== id),
          activePropertyId: s.activePropertyId === id ? properties[0]?.id ?? null : s.activePropertyId,
        };
      }),
      setActiveProperty: id => set({ activePropertyId: id }),
      setProfile: u => set(s => ({ profile: { ...s.profile, ...u } })),
      addReading: r => set(s => ({ readings: [...s.readings, { ...r, id: uid() }] })),
      removeReading: id => set(s => ({ readings: s.readings.filter(r => r.id !== id) })),
      addBill: b => set(s => ({
        // Aynı mülk/tür/ay için tek fatura: yenisi eskisinin yerine geçer
        bills: [...s.bills.filter(x => !(x.propertyId === b.propertyId && x.type === b.type && x.month === b.month)), { ...b, id: uid() }],
      })),
      removeBill: id => set(s => ({ bills: s.bills.filter(b => b.id !== id) })),
      setSettings: u => set(s => ({ settings: { ...s.settings, ...u } })),
      markWarned: (pid, month) => set(s => {
        const cur = s.warned[pid] ?? [];
        return cur.includes(month) ? s : { warned: { ...s.warned, [pid]: [...cur, month] } };
      }),
      setRemoteTariffs: t => set({ remoteTariffs: t, tariffsFetchedAt: new Date().toISOString() }),
      resetAll: () => set({ ...INITIAL, installId: newInstallId(), installedAt: new Date().toISOString() }),
    }),
    {
      name: 'verim-v2',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted: any, current) => ({
        ...current, ...(persisted ?? {}),
        settings: { ...current.settings, ...(persisted?.settings ?? {}) },
        warned: persisted?.warned ?? {},
        installId: persisted?.installId ?? current.installId,
        installedAt: persisted?.installedAt ?? current.installedAt,
      }),
      partialize: ({ hydrated, ...rest }) => rest as any,
      onRehydrateStorage: () => state => {
        migrateLegacy().finally(() => useSayacla.setState({ hydrated: true }));
        void state;
      },
    },
  ),
);

// ── Seçiciler ────────────────────────────────────────────────────────────────

export function useActiveProperty(): Property | null {
  return useSayacla(s => s.properties.find(p => p.id === s.activePropertyId) ?? s.properties[0] ?? null);
}

let cachedBundle: { key: unknown; value: TariffBundle } | null = null;
export function useTariffs(): TariffBundle {
  const remote = useSayacla(s => s.remoteTariffs);
  if (!cachedBundle || cachedBundle.key !== remote) cachedBundle = { key: remote, value: mergeBundle(DEFAULT_BUNDLE, remote) };
  return cachedBundle.value;
}

export function readingsFor(readings: Reading[], propertyId: string | undefined, type?: UtilityType) {
  return readings.filter(r => r.propertyId === propertyId && (!type || r.type === type));
}

// ── Eski (v1) veriyi taşı ────────────────────────────────────────────────────

async function migrateLegacy() {
  try {
    const s = useSayacla.getState();
    if (s.profile.onboarded) return;
    const raw = await AsyncStorage.getItem('verim-utility-store');
    if (!raw) return;
    const old = JSON.parse(raw)?.state;
    if (!old?.profile?.setupComplete) return;
    const props: Property[] = (old.properties ?? []).map((p: any) => ({
      id: String(p.id), name: p.name ?? 'Evim', province: p.city ?? 'İstanbul', district: p.district ?? '',
      hasWater: true, hasGas: true,
    }));
    const readings: Reading[] = (old.logs ?? [])
      .filter((l: any) => typeof l.indexValue === 'number' && l.date && (l.type === 'water' || l.type === 'gas'))
      .map((l: any) => ({
        id: String(l.id), propertyId: String(l.propertyId), type: l.type, date: l.date, index: l.indexValue, source: 'manual' as const,
      }));
    useSayacla.setState({
      profile: { name: old.profile.name ?? '', householdSize: old.profile.householdSize ?? 3, onboarded: props.length > 0 },
      properties: props,
      activePropertyId: old.activePropertyId ?? props[0]?.id ?? null,
      readings,
    });
    await AsyncStorage.removeItem('verim-utility-store');
  } catch {
    /* taşıma başarısızsa kullanıcı baştan kurulum yapar */
  }
}
