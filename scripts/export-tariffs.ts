// Gömülü tarife paketini tariffs/tariffs.json olarak yazar. Uygulama bu dosyayı GitHub'dan çeker;
// fiyat değişince yalnızca JSON'u güncelleyip push etmek yeterlidir (uygulama güncellemesi gerekmez).
import { writeFileSync } from 'node:fs';
import { DEFAULT_BUNDLE } from '../src/engine/tariffs';
const out = { ...DEFAULT_BUNDLE, version: new Date().toISOString().slice(0, 10), generatedAt: new Date().toISOString() };
writeFileSync('tariffs/tariffs.json', JSON.stringify(out, null, 1));
console.log('tariffs/tariffs.json yazıldı:', Object.keys(out.water).length, 'il');
