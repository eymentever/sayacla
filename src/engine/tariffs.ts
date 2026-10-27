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
  'Kayseri': W('KASKİ', [{ upTo: 15, rate: 35.74 }, { upTo: 30, rate: 46.54 }, { upTo: null, rate: 55.19 }], 0, { source: 'KASKİ su fiyatları, Grup A merkez ilçeler; KDV ve ÇTV hariç, aylık TÜFE ile güncellenir (kaski.gov.tr, 27.10.2026)', asOf: '2026-10-27', verified: true }),
  'Adana':         W('ASKİ (Adana)', flat(41.42), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Diyarbakır': W('DİSKİ', [{ upTo: 18, rate: 37.32 }, { upTo: 26, rate: 49.73 }, { upTo: null, rate: 57.69 }], 0, { source: 'DİSKİ güncel su fiyatları, Ekim 2026 (Kayapınar, Yenişehir, Bağlar, Sur), KDV hariç', asOf: '2026-10-01', verified: true }),
  'Sakarya': W('SASKİ', flat(44.28), 0, { source: 'SASKİ merkez ilçeler su 29,52 TL (KDV hariç) + %50 atıksu (sakarya.bel.tr)', asOf: '2025-10-01' }),
  'Eskişehir': W('ESKİ', flat(46.26), 0, { source: 'ESKİ merkez (Odunpazarı, Tepebaşı) su 33,03 + atıksu 13,22, KDV hariç, 4 Nisan 2026; aylık TÜFE ile artar (iscihaber.net)', asOf: '2026-04-04' }),
  'Antalya': W('ASAT', [{ upTo: 20, rate: 30.63 }, { upTo: 40, rate: 75.36 }, { upTo: null, rate: 107.66 }], 0, { source: 'ASAT Mart 2026 resmi tarife cetveli, KDV hariç; her ay (ÜFE+TÜFE)/2 artar', asOf: '2026-03-01', verified: true }),
  'Trabzon':       W('TİSKİ', flat(51.77), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Hatay':         W('HATSU', flat(53.89), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Konya': W('KOSKİ', flat(48.87), 0, { source: 'KOSKİ Ekim 2026 zammı sonrası m³ fiyatı, üç ayda bir güncellenir (merhabahaber.com, 05.10.2026)', asOf: '2026-10-05' }),
  'Kahramanmaraş': W('KASKİ (K.Maraş)', flat(68.36), 0, { source: PRESS_0311, asOf: '2026-03-11' }),
  'Kocaeli': W('İSU', [{ upTo: 12, rate: 38.49 }, { upTo: 20, rate: 70.23 }, { upTo: null, rate: 110.0 }], 0, { source: 'İSU resmi birim fiyatlar, Ekim 2026 (1–31.10.2026), mesken su+atıksu (isu.gov.tr)', asOf: '2026-10-01', verified: true }),
  'Gaziantep': W('GASKİ', [{ upTo: 12, rate: 53.79 }, { upTo: null, rate: 80.69 }], 0, { source: 'GASKİ konut su 46,27/69,40 + atıksu 7,52/11,29 (olaymedya.com, 31.07.2026)', asOf: '2026-07-31' }),
  'Mersin': W('MESKİ', flat(53.93), 0, { source: 'MESKİ su+atıksu satış fiyatı, Mayıs 2026 sonu; her ay (TEFE+TÜFE)/2 artar (Başkan Seçer açıklaması, 12.05.2026)', asOf: '2026-05-31' }),
  'Bursa': W('BUSKİ', [{ upTo: 15, rate: 57.65 }, { upTo: 20, rate: 109.53 }, { upTo: null, rate: 167.17 }], 0, { source: 'BUSKİ 1 Haziran 2026 kademe düzenlemesi; su+atıksu, KDV hariç (inegolonline.com, yenisafak.com 14.05.2026)', asOf: '2026-06-01' }),
  'Balıkesir': W('BASKİ', [{ upTo: 10, rate: 67.65 }, { upTo: 20, rate: 123.29 }, { upTo: null, rate: 163.05 }], 0, { source: 'BASKİ 2026 konut tarifesi (politikam.com, 10.10.2026)', asOf: '2026-10-10' }),
  'Manisa': W('MASKİ (Manisa)', [{ upTo: 12, rate: 59.38 }, { upTo: 22, rate: 89.06 }, { upTo: null, rate: 123.36 }], 0, { source: 'MASKİ 2026 su fiyatları (KDV hariç) + atıksu; Mayıs 2026 kademe genişletmesi (manisahaberx.com 12.05.2026)', asOf: '2026-05-12' }),
  'Samsun': W('SASKİ (Samsun)', [{ upTo: 17, rate: 86.76 }, { upTo: null, rate: 100.89 }], 0, { source: 'SASKİ Temmuz 2026 mesken Grup 1 su 57,84/67,26 + %50 atıksu, KDV hariç (habergazetesi.com.tr 29.07.2026)', asOf: '2026-07-01' }),
  'Tekirdağ': W('TESKİ', [{ upTo: 10, rate: 34.86 }, { upTo: null, rate: 69.71 }], 0, { source: 'TESKİ satış fiyatı 69,71 TL/m³ (Mayıs 2026); 1 Temmuz 2026’dan itibaren 1–10 m³ için %50 indirim (tekirdagyenihaber.com 15.05.2026)', asOf: '2026-07-01' }),
  'Denizli': W('DESKİ', flat(27.84), 0, { source: 'DESKİ açıklaması: indirim sonrası m³ bedeli 27,84 TL (denizlihaber.com, 18.06.2026)', asOf: '2026-06-18' }),
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
  version: '2026.10.27-bundled',
  gas: { national: GAS_NATIONAL, provinces: GAS_PROVINCES },
  water: Object.fromEntries(ALL_PROVINCES.map(il => [il, WATER_KNOWN[il] ?? { ...NATIONAL_WATER_DEFAULT, ctvPerM3: METRO.includes(il) ? 4.0 : 2.0 }])),
};

/** Uzak paketi varsayılanın üstüne güvenli biçimde birleştirir (eksik alanlar varsayılandan gelir). */
export function mergeBundle(base: TariffBundle, remote: Partial<TariffBundle> | null | undefined): TariffBundle {
  if (!remote || typeof remote !== 'object') return base;
  // Uzak dosya bozulsa ya da kurcalansa bile saçma değerler uygulamaya giremez
  const num = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  const gasProv = { ...base.gas.provinces };
  for (const [il, p] of Object.entries(remote.gas?.provinces ?? {})) {
    if (!gasProv[il] || !p || typeof p !== 'object') continue;
    const okLimits = Array.isArray(p.limits) && p.limits.length === 12 && p.limits.every(l => num(l, 1, 2000));
    gasProv[il] = {
      ...gasProv[il],
      ...(num(p.skbPerM3, 0, 50) ? { skbPerM3: p.skbPerM3 } : {}),
      ...(typeof p.source === 'string' ? { source: p.source.slice(0, 300) } : {}),
      limits: okLimits ? p.limits : gasProv[il].limits,
    };
  }
  const water = { ...base.water };
  for (const [il, w] of Object.entries(remote.water ?? {})) {
    if (!water[il] || !w || !Array.isArray(w.tiers) || w.tiers.length === 0 || w.tiers.length > 8) continue;
    const tiersOk = w.tiers.every(t => t && num(t.rate, 1, 1000) && (t.upTo == null || num(t.upTo, 1, 10000)));
    if (!tiersOk) continue;
    water[il] = {
      ...water[il], ...w,
      kdv: num(w.kdv, 0, 0.3) ? w.kdv : water[il].kdv,
      ctvPerM3: num(w.ctvPerM3, 0, 50) ? w.ctvPerM3 : water[il].ctvPerM3,
      fixedMonthly: num(w.fixedMonthly, 0, 2000) ? w.fixedMonthly : water[il].fixedMonthly,
      source: typeof w.source === 'string' ? w.source.slice(0, 300) : water[il].source,
    };
  }
  const nat = remote.gas?.national ?? {};
  const national = { ...base.gas.national };
  for (const [k, lo, hi] of [['k1', 1, 200], ['k2', 1, 400], ['otvPerM3', 0, 20], ['kdv', 0, 0.5], ['kwhPerM3', 5, 15]] as const) {
    if (num((nat as any)[k], lo, hi)) (national as any)[k] = (nat as any)[k];
  }
  if (typeof (nat as any).source === 'string') national.source = (nat as any).source.slice(0, 300);
  return {
    version: typeof remote.version === 'string' ? remote.version.slice(0, 40) : base.version,
    gas: { national, provinces: gasProv },
    water,
  };
}
