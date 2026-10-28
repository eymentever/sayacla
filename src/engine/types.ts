// Sayaçla hesap motoru — ortak tipler. Saf TypeScript; React/Expo import etmez.

export type UtilityType = 'water' | 'gas';

/** Kullanıcının sayaçtan okuduğu ham değer. Tüketim ve maliyet bundan TÜRETİLİR, saklanmaz. */
export interface Reading {
  id: string;
  propertyId: string;
  type: UtilityType;
  /** Okuma zamanı (ISO 8601) */
  date: string;
  /** Sayaç endeksi, m³ (ondalık serbest) */
  index: number;
  source: 'manual' | 'ocr';
  /** true → sayaç değişti / sıfırlandı; bu okuma yeni başlangıçtır, önceki ile fark alınmaz */
  meterReset?: boolean;
  /** OCR fotoğrafının yerel URI'si (isteğe bağlı, kanıt) */
  photoUri?: string;
}

/** İki ardışık okuma arasındaki dönem */
export interface Interval {
  type: UtilityType;
  start: string;
  end: string;
  m3: number;
  days: number;
  perDay: number;
}

export interface MonthUsage {
  /** 'YYYY-MM' */
  month: string;
  m3: number;
  /** Ayın kaç günü okumalarla kapsandı */
  coveredDays: number;
  daysInMonth: number;
}

export interface BillLine {
  label: string;
  amount: number;
}

export interface BillEstimate {
  type: UtilityType;
  month: string;
  m3: number;
  total: number;
  lines: BillLine[];
  /** Tarife resmi kaynaktan doğrulanmış mı + kullanıcı faturasıyla kalibre edilmiş mi */
  confidence: 'calibrated' | 'official' | 'estimate';
  /** Sadece gaz */
  gas?: {
    tier: 1 | 2;
    limit: number;
    /** Limite kalan m³ (negatif = aşıldı) */
    remaining: number;
    kwh: number;
  };
}
