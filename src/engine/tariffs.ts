// Tarife veri modeli + varsayılanlar. Uzak JSON (tariffs/tariffs.json) bu değerleri geçersiz kılar,
// böylece fiyat değişince uygulama güncellemesi gerekmez.

import { GAS_LIMITS_2026 } from '../data/gasLimits2026';

export interface Sourced {
  /** Değerin dayandığı kaynak (kurum / yayın) */
  source: string;
  /** Değerin geçerli olduğu tarih 'YYYY-MM-DD' */
  asOf: string;
  /** true → resmi kaynaktan doğrulandı; false → tahmini */
  verified: boolean;
}

export interface GasNational extends Sourced {
  /** BOTAŞ 1. kademe, TL/Sm³ (vergisiz) */
  k1: number;
  /** BOTAŞ 2. kademe, TL/Sm³ (vergisiz) */
  k2: number;
  /** ÖTV, TL/Sm³ */
  otvPerM3: number;
  /** KDV oranı */
  kdv: number;
  /** Sm³ → kWh dönüşümü (üst ısıl değer) */
  kwhPerM3: number;
}

export interface GasProvince extends Sourced {
  /** Dağıtım şirketi */
  distributor?: string;
  /** Sistem kullanım (dağıtım) bedeli, TL/Sm³, vergisiz */
  skbPerM3: number;
  /** 12 ay için 1. kademe limitleri, Sm³ */
  limits: readonly number[];
}

export interface WaterTier {
  /** Kademe üst sınırı, m³/ay (null = sınırsız) */
  upTo: number | null;
  /** Su + atıksu birim fiyatı, TL/m³, vergisiz */
  rate: number;
}

export interface WaterProvince extends Sourced {
  /** Su idaresi (İSKİ, ASKİ …) */
  authority: string;
  tiers: WaterTier[];
  /** Vergiler dahil efektif KDV oranı (su %1, atıksu %10 karışımı için ağırlıklı) */
  kdv: number;
  /** Çevre Temizlik Vergisi, TL/m³ */
  ctvPerM3: number;
  /** Sabit aylık bedel (vergiler dahil), TL */
  fixedMonthly: number;
  /** Aylık ücretsiz m³ (varsa) */
  freeM3?: number;
}

export interface TariffBundle {
  version: string;
  gas: { national: GasNational; provinces: Record<string, GasProvince> };
  water: Record<string, WaterProvince>;
}

// ── Doğalgaz ─────────────────────────────────────────────────────────────────

export const GAS_NATIONAL: GasNational = {
  k1: 10.625,
  k2: 18.0,
  otvPerM3: 0.1468,
  kdv: 0.20,
  kwhPerM3: 10.64,
  source: 'BOTAŞ konut tarifesi (4 Nisan 2026); ÖTV/KDV: basın (karar.com 04.04.2026)',
  asOf: '2026-04-04',
  verified: true,
};

/** Dağıtım bedeli bilinmeyen iller için tahmini değer (Ankara faturasından türetilen ~3,26 TL/Sm³'e yakın). */
const DEFAULT_SKB = 3.0;

const KNOWN_SKB: Record<string, { skb: number; distributor: string; note: string }> = {
  'Ankara':   { skb: 3.26, distributor: 'Başkentgaz', note: 'Vergili 16,84 / 25,69 TL/Sm³ (04.04.2026) fiyatından türetildi' },
  'İstanbul': { skb: 2.75, distributor: 'İGDAŞ',      note: 'Vergili 1. kademe 16,23 TL (Nisan 2026) fiyatından türetildi' },
};

export const GAS_PROVINCES: Record<string, GasProvince> = Object.fromEntries(
  Object.entries(GAS_LIMITS_2026).map(([il, limits]) => {
    const k = KNOWN_SKB[il];
    return [il, {
      limits,
      skbPerM3: k?.skb ?? DEFAULT_SKB,
      distributor: k?.distributor,
      source: k ? `BOTAŞ limitleri; dağıtım bedeli: ${k.note}` : 'BOTAŞ limitleri; dağıtım bedeli tahmini',
      asOf: '2026-04-04',
      verified: false,
    }];
  }),
);

// ── Su ───────────────────────────────────────────────────────────────────────
// Belediyeler tarifeyi sık (bazıları aylık, TÜFE/ÜFE endeksli) günceller. Bu değerler başlangıç
// tahminidir; kullanıcının faturasıyla kalibrasyon kesin sonucu verir.

const tiers3 = (a: number, b: number, c: number, l1 = 15, l2 = 30): WaterTier[] =>
  [{ upTo: l1, rate: a }, { upTo: l2, rate: b }, { upTo: null, rate: c }];
const tiers2 = (a: number, b: number, l1 = 15): WaterTier[] =>
  [{ upTo: l1, rate: a }, { upTo: null, rate: b }];

const W = (
  authority: string, tiers: WaterTier[], fixedMonthly = 25,
  extra: Partial<WaterProvince> = {},
): WaterProvince => ({
  authority, tiers, fixedMonthly,
  kdv: 0.04, ctvPerM3: 4.0,
  source: `${authority} — tahmini başlangıç değeri`, asOf: '2026-06-01', verified: false,
  ...extra,
});

/** Büyükşehirler ve bilinen idareler. Listede olmayan il → NATIONAL_WATER_DEFAULT. */
const WATER_KNOWN: Record<string, WaterProvince> = {
  'İstanbul':  W('İSKİ', tiers3(46.62, 71.04, 102.75), 27, {
    freeM3: 0, source: 'İSKİ, 1 Haziran 2025 tarifesi (dunya.com 14.05.2025); sonrası aylık endeksli', asOf: '2025-06-01',
  }),
  'Ankara':    W('ASKİ', tiers3(52.94, 80.5, 116.5), 22),
  'İzmir':     W('İZSU', [{ upTo: 6, rate: 25 }, { upTo: 20, rate: 60 }, { upTo: 40, rate: 99.83 }, { upTo: null, rate: 145 }], 24),
  'Bursa':     W('BUSKİ', tiers3(41, 62, 85, 10, 30)),
  'Antalya':   W('ASAT', tiers3(38.5, 57, 78)),
  'Kocaeli':   W('İSU', tiers3(43, 65, 88)),
  'Sakarya':   W('SASKİ', tiers2(42.77, 60)),
  'Eskişehir': W('ESKİ', tiers3(37, 55, 74)),
  'Konya':     W('KOSKİ', tiers2(35, 52)),
  'Gaziantep': W('GASKİ', tiers2(33, 50)),
  'Adana':     W('ASKİ (Adana)', tiers2(34, 51)),
  'Mersin':    W('MESKİ', tiers2(34.5, 51.5)),
  'Kayseri':   W('KASKİ', tiers2(36, 54)),
  'Trabzon':   W('TİSKİ', tiers2(32, 48)),
  'Diyarbakır':W('DİSKİ', tiers2(30, 45)),
  'Samsun':    W('SASKİ (Samsun)', tiers2(33.5, 50)),
  'Hatay':     W('HATSU', tiers2(31, 46.5)),
  'Manisa':    W('MASKİ', tiers2(36.5, 54.5)),
  'Balıkesir': W('BASKİ', tiers2(35.5, 53)),
  'Şanlıurfa': W('ŞUSKİ', tiers2(44.21, 66.3)),
  'Aydın':     W('ASKİ (Aydın)', tiers2(38, 58)),
  'Denizli':   W('DESKİ', tiers2(36, 55)),
  'Tekirdağ':  W('TESKİ', tiers2(45, 68)),
  'Muğla':     W('MUSKİ', tiers2(44, 67)),
  'Mardin':    W('MARSU', tiers2(18, 28)),
  'Kahramanmaraş': W('KASKİ (K.Maraş)', tiers2(30, 46)),
  'Van':       W('VASKİ', tiers2(25, 38)),
  'Malatya':   W('MASKİ (Malatya)', tiers2(32, 50)),
  'Erzurum':   W('ESKİ (Erzurum)', tiers2(28, 42)),
  'Ordu':      W('OSKİ', tiers2(30, 46)),
};

export const NATIONAL_WATER_DEFAULT: WaterProvince = W('Belediye su idaresi', tiers2(35, 52), 22, {
  ctvPerM3: 2.0,
  source: 'Türkiye geneli ortalama — tahmini; faturanla kalibre et',
});

export const ALL_PROVINCES: string[] = Object.keys(GAS_LIMITS_2026).sort((a, b) => a.localeCompare(b, 'tr'));

export const DEFAULT_BUNDLE: TariffBundle = {
  version: '2026.10-bundled',
  gas: { national: GAS_NATIONAL, provinces: GAS_PROVINCES },
  water: Object.fromEntries(ALL_PROVINCES.map(il => [il, WATER_KNOWN[il] ?? { ...NATIONAL_WATER_DEFAULT }])),
};

/** Uzak paketi varsayılanın üstüne güvenli biçimde birleştirir (eksik alanlar varsayılandan gelir). */
export function mergeBundle(base: TariffBundle, remote: Partial<TariffBundle> | null | undefined): TariffBundle {
  if (!remote || typeof remote !== 'object') return base;
  const gasProv = { ...base.gas.provinces };
  for (const [il, p] of Object.entries(remote.gas?.provinces ?? {})) {
    if (gasProv[il] && p && Array.isArray(p.limits) && p.limits.length === 12) gasProv[il] = { ...gasProv[il], ...p };
    else if (gasProv[il] && p) gasProv[il] = { ...gasProv[il], ...p, limits: gasProv[il].limits };
  }
  const water = { ...base.water };
  for (const [il, w] of Object.entries(remote.water ?? {})) {
    if (water[il] && w && Array.isArray(w.tiers) && w.tiers.length > 0) water[il] = { ...water[il], ...w };
  }
  return {
    version: remote.version ?? base.version,
    gas: { national: { ...base.gas.national, ...(remote.gas?.national ?? {}) }, provinces: gasProv },
    water,
  };
}
