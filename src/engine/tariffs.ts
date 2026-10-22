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

const W = (
  authority: string, tiers: WaterTier[], fixedMonthly = 0,
  extra: Partial<WaterProvince> = {},
): WaterProvince => ({
  authority, tiers, fixedMonthly,
  kdv: 0.04, ctvPerM3: 4.0,
  source: `${authority} — tahmini başlangıç değeri`, asOf: '2026-06-01', verified: false,
  ...extra,
});

/** Tek fiyatlı (ortalama) tarife: 20 m³ hane tüketimine göre basında yayımlanan su+atıksu m³ fiyatı. */
const flat = (rate: number): WaterTier[] => [{ upTo: null, rate }];
const PRESS_0311 = 'Büyükşehir su fiyatları karşılaştırması, 20 m³ ortalama (mersinobjektif.com.tr, 11.03.2026)';

/**
 * Doğrulanmış / basında yayımlanmış tarifeler. Listede olmayan il → NATIONAL_WATER_DEFAULT (tahmini).
 * Fiyatlar su + atıksu toplamı, KDV hariç (aksi belirtilmedikçe). Belediyeler aylık endeksleme
 * yapabildiği için uygulama uzak tarife dosyasını ve kullanıcı faturası kalibrasyonunu önceliklendirir.
 */
const WATER_KNOWN: Record<string, WaterProvince> = {
  'Ankara': W('ASKİ', tiers3(58.13, 81.41, 105.24), 0, {
    source: 'ASKİ resmi su tarifesi (aski.gov.tr/Yukle/Dosya/SuTarifesi.pdf), 05.10.2026', asOf: '2026-10-05', verified: true,
  }),
  'İstanbul': W('İSKİ', tiers3(65.52, 99.83, 144.40), 0, {
    freeM3: 3,
    source: 'İSKİ Ekim 2026 konut birim fiyatları (03.10.2026; hesaplala.com derlemesi). İnsani su hakkı 3 m³', asOf: '2026-10-03', verified: true,
  }),
  'İzmir': W('İZSU', [
    { upTo: 6, rate: 25 }, { upTo: 10, rate: 60 }, { upTo: 20, rate: 99.83 }, { upTo: 40, rate: 145 }, { upTo: null, rate: 201.9 },
  ], 0, { source: 'İZSU 1 Haziran 2026 tarifesi (ekonomim.com, 19.05.2026)', asOf: '2026-06-01', verified: true }),
  'Erzurum':       W('ESKİ (Erzurum)', flat(30.24), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Malatya':       W('MASKİ (Malatya)', flat(31.41), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Şanlıurfa':     W('ŞUSKİ', flat(38.29), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Kayseri':       W('KASKİ', flat(40.41), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Adana':         W('ASKİ (Adana)', flat(41.42), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Diyarbakır':    W('DİSKİ', flat(43.19), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Sakarya':       W('SASKİ', flat(44.29), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Eskişehir':     W('ESKİ', flat(45.38), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Antalya':       W('ASAT', flat(45.95), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Trabzon':       W('TİSKİ', flat(51.77), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Hatay':         W('HATSU', flat(53.89), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Konya':         W('KOSKİ', flat(56.30), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Kahramanmaraş': W('KASKİ (K.Maraş)', flat(68.36), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Kocaeli':       W('İSU', flat(70.23), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Gaziantep':     W('GASKİ', flat(72.56), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Mersin':        W('MESKİ', flat(76.31), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
};

/** Doğrulanmış verisi olmayan iller: büyükşehir ortalamasına yakın tahmini; faturayla kalibrasyon şart. */
export const NATIONAL_WATER_DEFAULT: WaterProvince = W('Belediye su idaresi', flat(50), 0, {
  ctvPerM3: 2.0,
  source: 'Tahmini (büyükşehir ortalamaları, Mart 2026). Doğru sonuç için faturanla kalibre et.',
  asOf: '2026-03-11',
});

/** Büyükşehir belediyesi olan 30 il — ÇTV konut tarifesi daha yüksek (GİB 2026). */
const METRO = ['Adana','Ankara','Antalya','Aydın','Balıkesir','Bursa','Denizli','Diyarbakır','Erzurum','Eskişehir','Gaziantep','Hatay','İstanbul','İzmir','Kahramanmaraş','Kayseri','Kocaeli','Konya','Malatya','Manisa','Mardin','Mersin','Muğla','Ordu','Sakarya','Samsun','Şanlıurfa','Tekirdağ','Trabzon','Van'];

export const ALL_PROVINCES: string[] = Object.keys(GAS_LIMITS_2026).sort((a, b) => a.localeCompare(b, 'tr'));

export const DEFAULT_BUNDLE: TariffBundle = {
  version: '2026.10-bundled',
  gas: { national: GAS_NATIONAL, provinces: GAS_PROVINCES },
  water: Object.fromEntries(ALL_PROVINCES.map(il => [il, WATER_KNOWN[il] ?? { ...NATIONAL_WATER_DEFAULT, ctvPerM3: METRO.includes(il) ? 4.0 : 2.0 }])),
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
