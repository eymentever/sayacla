// Motor metinleri için Türkçe sayı biçimi (virgül ondalık). Intl'e bağımlı değil — deterministik.
export const d1 = (n: number) => n.toFixed(1).replace('.', ',');
export const d0 = (n: number) => Math.round(n).toLocaleString('tr-TR');
