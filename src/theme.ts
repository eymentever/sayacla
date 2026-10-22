/**
 * Verim — tasarım sistemi. Koyu, endüstriyel, yüksek kontrast. Tüm ekranlar buradan import eder.
 */

export const C = {
  bg: '#070A12',
  bgRaised: '#0B101C',
  card: '#0F1626',
  cardHi: '#141D31',
  border: '#1C2740',
  divider: '#141C2E',

  text: '#EEF2F8',
  textDim: '#8C99B0',
  textMuted: '#55627A',

  brand: '#00E59B',
  brandDim: '#00E59B1A',
  water: '#22C3E6',
  waterDim: '#22C3E61A',
  gas: '#FFA630',
  gasDim: '#FFA6301A',

  danger: '#FF5468',
  dangerDim: '#FF54681A',
  warn: '#FFC247',
  warnDim: '#FFC2471A',
  ok: '#3DDC84',
  okDim: '#3DDC841A',
  // Geriye dönük uyumluluk
  success: '#3DDC84',
  successDim: '#3DDC841A',
  cardBorder: '#1C2740',
} as const;

export const FONT = { xs: 11, sm: 13, md: 15, base: 16, lg: 18, xl: 22, '2xl': 28, '3xl': 36, '4xl': 46 } as const;
export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 22, full: 9999 } as const;
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, '2xl': 32 } as const;

export const typeColor = (t: 'water' | 'gas') => (t === 'water' ? C.water : C.gas);
export const typeDim = (t: 'water' | 'gas') => (t === 'water' ? C.waterDim : C.gasDim);
export const typeLabel = (t: 'water' | 'gas') => (t === 'water' ? 'Su' : 'Doğalgaz');

/** Alt sekme çubuğu yüksekliği + boşluk — ekran içerikleri bunun kadar alttan pay bırakır */
export const TAB_CLEARANCE = 110;
