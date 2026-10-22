// Cihaz içi OCR (Google ML Kit). Expo Go'da native modül yoktur → null döner, kullanıcı elle girer.

import * as ImageManipulator from 'expo-image-manipulator';
import { pickMeterReading, Candidate, OcrLine } from '../engine/ocrPick';

type TR = { recognize: (uri: string) => Promise<{ blocks: { lines: { text: string; frame?: { height: number } }[] }[] }> };

let mod: TR | null | undefined;
function loadModule(): TR | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('@react-native-ml-kit/text-recognition').default as TR;
  } catch {
    mod = null;
  }
  return mod;
}

export const ocrAvailable = () => loadModule() != null;

/**
 * Fotoğraftan sayaç endeksi adayları. Görüntü vizör bölgesine kırpılır (daha az gürültü, daha hızlı).
 * @param crop vizörün fotoğraf içindeki oranları (0–1)
 */
export async function readMeter(
  uri: string, width: number, height: number,
  crop: { x: number; y: number; w: number; h: number },
  lastIndex?: number,
): Promise<Candidate[] | null> {
  const tr = loadModule();
  if (!tr) return null;
  let target = uri;
  try {
    const r = await ImageManipulator.manipulateAsync(uri, [
      { crop: { originX: width * crop.x, originY: height * crop.y, width: width * crop.w, height: height * crop.h } },
      { resize: { width: 1400 } },
    ], { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG });
    target = r.uri;
  } catch { /* kırpma başarısızsa tam görüntü */ }
  try {
    const res = await tr.recognize(target);
    const lines: OcrLine[] = res.blocks.flatMap(b => b.lines.map(l => ({ text: l.text, height: l.frame?.height ?? 1 })));
    let c = pickMeterReading(lines, lastIndex);
    if (c.length === 0 && target !== uri) {
      const full = await tr.recognize(uri);
      c = pickMeterReading(full.blocks.flatMap(b => b.lines.map(l => ({ text: l.text, height: l.frame?.height ?? 1 }))), lastIndex);
    }
    return c;
  } catch {
    return [];
  }
}
