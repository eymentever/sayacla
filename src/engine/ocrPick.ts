// OCR çıktısından sayaç endeksini seçen saf mantık (test edilebilir).
// ML Kit satırları + çerçeve yükseklikleri gelir; sayaç rakamları genelde en iri, 4–9 haneli dizidir.
// En güçlü ipucu: yeni endeks son okumadan büyük-eşit ve ona yakın olmalıdır.

export interface OcrLine { text: string; height: number }
export interface Candidate { value: number; raw: string; score: number }

const UNIT_NOISE = /(m3|m³|m\^3|kwh|kw|bar|mbar|qmax|qmin|qn|g4|g6|dn\d+|r\d+|class|°c|ce|mid|\d{4}\/\d{2})/gi;

export function pickMeterReading(lines: OcrLine[], lastIndex?: number): Candidate[] {
  const maxH = Math.max(1, ...lines.map(l => l.height));
  const seen = new Map<string, Candidate>();
  for (const l of lines) {
    const cleaned = l.text.replace(UNIT_NOISE, ' ').replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');
    // Rakam grupları: "0 4 3 8 1 7" gibi boşluklu tekerlek okumalarını da birleştir
    const groups = cleaned.match(/\d[\d\s.,]*\d|\d/g) ?? [];
    for (const g of groups) {
      const compact = g.replace(/\s+/g, '');
      const intPart = compact.split(/[.,]/)[0];
      if (intPart.replace(/^0+/, '').length === 0 && compact.length < 4) continue;
      if (intPart.length < 4 || intPart.length > 9) continue;
      // Seri no / yıl gibi 10+ hane veya tarih kalıplarını ele
      if (/^(19|20)\d{2}$/.test(intPart)) continue;
      const dec = compact.includes(',') || compact.includes('.') ? compact.split(/[.,]/)[1] ?? '' : '';
      const value = Number(`${intPart}${dec ? '.' + dec.slice(0, 3) : ''}`);
      if (!Number.isFinite(value)) continue;
      let score = (l.height / maxH) * 50;                 // iri rakam = sayaç
      score += intPart.length >= 5 && intPart.length <= 8 ? 15 : 0;
      if (lastIndex != null) {
        if (value < lastIndex) score -= 60;               // sayaç geri gitmez
        else {
          const diff = value - lastIndex;
          score += diff <= 200 ? 40 : diff <= 2000 ? 20 : 0; // makul aralık
        }
      }
      const key = String(value);
      const prev = seen.get(key);
      if (!prev || prev.score < score) seen.set(key, { value, raw: g.trim(), score });
    }
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 4);
}
