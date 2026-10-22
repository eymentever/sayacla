// "Neden fazla kullanıyorum?" — ev profili + tüketimden kişisel teşhis ve TL bazlı çözüm sıralaması.
// Oranlar ihtiyatlı, yaygın kabul gören enerji verimliliği değerleridir; arayüzde "yaklaşık" olarak sunulur.

import { UtilityType } from './types';
import { d0 } from './fmt';

export interface HomeProfile {
  sizeM2: 'lt80' | '80_120' | '120_180' | 'gt180';
  position: 'middle' | 'top_or_ground' | 'detached';
  boilerAge: 'lt5' | '5_10' | 'gt10' | 'unknown';
  boilerService: 'lt12m' | 'gt12m' | 'never';
  roomTemp: 'le20' | '21_22' | '23_24' | 'ge25';
  nightMode: 'lower' | 'same' | 'off';
  roomThermostat: boolean;
  trvValves: boolean;
  windows: 'double_new' | 'double_old' | 'single';
  radiatorsCovered: boolean;
  showerMin: 'le5' | '6_10' | 'gt10';
}

const SIZE_M2: Record<HomeProfile['sizeM2'], number> = { lt80: 70, '80_120': 100, '120_180': 150, gt180: 210 };
/** Ortalama hane ~100 m² kabulü (TÜİK konut ortalamasına yakın) */
const AVG_M2 = 100;

export interface Comparison {
  /** Kullanıcının aylık tüketimi / ilindeki benzer evin ortalaması */
  ratio: number;
  avgM3: number;
  sentence: string;
}

/**
 * BOTAŞ limiti, ilin son 5 yıllık aynı ay hane ortalamasının %75 fazlası olarak belirlenir.
 * Buradan ortalama hane tüketimi = limit / 1,75; ev büyüklüğü ve konumuyla ölçeklenir.
 */
export function compareToAverage(m3: number, limit: number, province: string, home?: HomeProfile | null): Comparison | null {
  if (!(m3 > 0) || !Number.isFinite(limit) || limit <= 0) return null;
  let avg = limit / 1.75;
  if (home) {
    avg *= SIZE_M2[home.sizeM2] / AVG_M2;
    if (home.position === 'top_or_ground') avg *= 1.15;
    if (home.position === 'detached') avg *= 1.35;
  }
  const ratio = m3 / avg;
  const pctTxt = `%${d0(Math.abs(ratio - 1) * 100)}`;
  const like = home ? 'senin büyüklüğündeki ortalama bir ev' : 'ortalama bir ev';
  const sentence = ratio > 1.1
    ? `Evin, ${province}'da ${like}den ${pctTxt} fazla gaz yakıyor.`
    : ratio < 0.9
      ? `Evin, ${province}'da ${like}den ${pctTxt} az gaz yakıyor. İyi gidiyorsun.`
      : `Evin, ${province}'da ${like} kadar gaz yakıyor.`;
  return { ratio, avgM3: avg, sentence };
}

export interface Cause {
  id: string;
  type: UtilityType;
  title: string;
  why: string;
  fix: string;
  /** Tüketimdeki tahmini azalma oranı (0–1) */
  pct: number;
  monthlyTL: number;
  effort: 'kolay' | 'orta' | 'yatırım';
}

const isHeating = (m0: number) => m0 >= 9 || m0 <= 3;

/**
 * @param gasBillTL ay sonu tahmini gaz faturası (vergili)
 * @param month0 ay indeksi (0–11) — ısıtma sezonunda gazın ~%80'i ısınmaya gider
 */
export function diagnose(
  home: HomeProfile, gasBillTL: number, waterBillTL: number, waterM3: number, household: number, month0: number,
): Cause[] {
  const out: Cause[] = [];
  const heat = isHeating(month0) ? 0.8 : 0;
  const gasTL = (p: number) => Math.round(gasBillTL * p);
  const addGas = (c: Omit<Cause, 'type' | 'monthlyTL'>) => out.push({ ...c, type: 'gas', monthlyTL: gasTL(c.pct) });

  if (gasBillTL > 0 && heat > 0) {
    const tempOver = home.roomTemp === 'ge25' ? 4 : home.roomTemp === '23_24' ? 2 : home.roomTemp === '21_22' ? 1 : 0;
    if (tempOver > 0) addGas({
      id: 'temp', effort: 'kolay', pct: heat * 0.06 * tempOver,
      title: `Ev ${home.roomTemp === 'ge25' ? '25 °C üstü' : home.roomTemp === '23_24' ? '23–24 °C' : '21–22 °C'} — ${tempOver} °C düşür`,
      why: 'Her 1 °C fazla ısıtma, ısınma tüketimini yaklaşık %6 artırır.',
      fix: home.roomTemp === '21_22' ? 'Oturma odasını 21, yatak odasını 18–19 °C’ye ayarla.' : 'Termostatı 21 °C’ye çek; üşürsen ince bir kat giy.',
    });
    if (home.nightMode === 'same') addGas({
      id: 'night', effort: 'kolay', pct: heat * 0.09,
      title: 'Gece ve evde yokken de aynı sıcaklık',
      why: 'Boş evi ve uyurken evi 21 °C’de tutmak gereksiz tüketimdir.',
      fix: 'Gece ve dışarıdayken 17–18 °C’ye düşür. Tamamen kapatma; ev çok soğursa yeniden ısıtmak daha pahalıya gelir.',
    });
    if (home.nightMode === 'off') addGas({
      id: 'night-off', effort: 'kolay', pct: heat * 0.04,
      title: 'Kombiyi tamamen kapatıp açıyorsun',
      why: 'Soğuyan duvarları ve suyu yeniden ısıtmak kombiyi uzun süre tam güçte çalıştırır.',
      fix: 'Kapatmak yerine 17 °C’ye düşür.',
    });
    if (!home.roomThermostat) addGas({
      id: 'thermostat', effort: 'yatırım', pct: heat * 0.10,
      title: 'Oda termostatı yok',
      why: 'Termostat yoksa kombi, ev ısındıktan sonra da peteklere sıcak su basmaya devam eder.',
      fix: 'Kablosuz bir oda termostatı tak (yaklaşık 1.000–2.500 ₺); kombi istenen sıcaklıkta kendini durdurur.',
    });
    if (!home.trvValves) addGas({
      id: 'trv', effort: 'yatırım', pct: heat * 0.08,
      title: 'Petek vanaları termostatik değil',
      why: 'Kullanılmayan odalar da salon kadar ısıtılıyor.',
      fix: 'Termostatik vana tak; boş odaları 2–3 kademesinde tut.',
    });
    if (home.boilerService !== 'lt12m') addGas({
      id: 'service', effort: 'orta', pct: heat * (home.boilerService === 'never' ? 0.10 : 0.06),
      title: home.boilerService === 'never' ? 'Kombi hiç bakım görmemiş' : 'Kombi bakımı 1 yılı geçmiş',
      why: 'Kirli eşanjör ve ayarsız yanma verimi düşürür; aynı ısı için daha çok gaz yakılır.',
      fix: 'Yetkili serviste yıllık bakım yaptır; petek temizliğini de iste.',
    });
    if (home.boilerAge === 'gt10') addGas({
      id: 'boiler-old', effort: 'yatırım', pct: heat * 0.15,
      title: 'Kombi 10 yaşından büyük',
      why: 'Eski (yoğuşmasız) kombiler yeni yoğuşmalı modellere göre belirgin şekilde daha az verimlidir.',
      fix: 'Değişim düşünüyorsan yoğuşmalı kombi seç; önce bakım ve termostatla başla.',
    });
    if (home.windows !== 'double_new') addGas({
      id: 'windows', effort: 'yatırım', pct: heat * (home.windows === 'single' ? 0.12 : 0.05),
      title: home.windows === 'single' ? 'Tek cam pencere' : 'Eski çift cam / contalar yıpranmış',
      why: 'Isının önemli bir kısmı pencere ve kasa aralıklarından kaçar.',
      fix: home.windows === 'single' ? 'Isıcam (çift cam) en büyük kazancı sağlar; hemen yapamıyorsan kalın perde ve conta bandı kullan.' : 'Conta bandı yenile (birkaç yüz ₺); kasa çevresine silikon çek.',
    });
    if (home.radiatorsCovered) addGas({
      id: 'covered', effort: 'kolay', pct: heat * 0.05,
      title: 'Peteklerin önü kapalı',
      why: 'Perde, mobilya ya da üstüne serilen çamaşır ısının odaya yayılmasını engeller; kombi daha uzun çalışır.',
      fix: 'Peteklerin önünü aç, çamaşırı peteğin üstünde kurutma; petek arkasına ısı yansıtıcı folyo yapıştır.',
    });
    if (home.position !== 'middle') addGas({
      id: 'envelope', effort: 'yatırım', pct: heat * 0.15,
      title: home.position === 'detached' ? 'Müstakil ev — dış duvarlar soğuk' : 'En üst / zemin kat — çatı veya zemin ısı kaybettiriyor',
      why: 'Ara kat dairelere göre daha fazla dış yüzeyin var; ısı oradan kaçıyor.',
      fix: 'Bina mantolaması / çatı yalıtımı için yöneticiyle konuş; kısa vadede halı ve kalın perde yardımcı olur.',
    });
  }

  if (waterBillTL > 0 && waterM3 > 0) {
    const people = Math.max(1, household);
    const extraMin = home.showerMin === 'gt10' ? 6 : home.showerMin === '6_10' ? 3 : 0;
    if (extraMin > 0) {
      const m3Saved = Math.min(waterM3 * 0.4, (people * extraMin * 9 * 30) / 1000 * 0.7); // haftada ~5 duş
      out.push({
        id: 'shower', type: 'water', effort: 'kolay', pct: m3Saved / waterM3,
        monthlyTL: Math.round(waterBillTL * (m3Saved / waterM3) * 0.9),
        title: `Duş ${home.showerMin === 'gt10' ? '10 dakikadan uzun' : '6–10 dakika'}`,
        why: 'Standart duş başlığı dakikada yaklaşık 9 litre su akıtır; sıcak suyu da kombi ısıtır.',
        fix: 'Duşu 5 dakikaya indir, tasarruflu duş başlığı tak (debiyi %30–50 düşürür).',
      });
    }
  }

  // Örtüşmeyi önle: oranları çarpımsal birleştir, en büyükten küçüğe
  out.sort((a, b) => b.monthlyTL - a.monthlyTL);
  return out.filter(c => c.monthlyTL >= 5);
}

/** Tüm gaz çözümleri uygulanırsa toplam azalma (örtüşme düşülerek) */
export function combinedGasPct(causes: Cause[]): number {
  return 1 - causes.filter(c => c.type === 'gas').reduce((p, c) => p * (1 - c.pct), 1);
}
