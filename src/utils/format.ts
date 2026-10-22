// Türkçe biçimlendirme yardımcıları.

const nf = (min: number, max: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: min, maximumFractionDigits: max });
const N0 = nf(0, 0), N1 = nf(0, 1), N2 = nf(2, 2), N3 = nf(0, 3);

export const tl = (n: number) => `${N0.format(Math.round(n))} ₺`;
export const tl2 = (n: number) => `${N2.format(n)} ₺`;
export const m3 = (n: number, d: 0 | 1 | 3 = 1) => `${(d === 0 ? N0 : d === 1 ? N1 : N3).format(n)} m³`;
export const num = (n: number) => N3.format(n);
export const pct = (r: number) => `%${N0.format(Math.abs(r * 100))}`;

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTHS_S = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** 'YYYY-MM' → 'Ekim 2026' */
export const monthName = (key: string, withYear = true) => {
  const m = parseInt(key.slice(5, 7), 10) - 1;
  return withYear ? `${MONTHS[m]} ${key.slice(0, 4)}` : MONTHS[m];
};
export const monthShort = (key: string) => MONTHS_S[parseInt(key.slice(5, 7), 10) - 1];

export const dateTR = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
export const dateTimeTR = (iso: string) =>
  new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? 'bugün' : d === 1 ? 'dün' : `${d} gün önce`;
};
