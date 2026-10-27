// Kullanım: npx tsx scripts/apply-crowd-water.ts crowd.json
// crowd.json: Supabase public.crowd_water_price satırları [{province, homes, median_tl_per_m3, latest}]
// Resmi doğrulanmış (verified) iller değiştirilmez. Diğerlerine faturadan çıkan gerçek fiyat (vergiler ayrıştırılarak) yazılır.
// Not: scripts/export-tariffs.ts tariffs.json dosyasını baştan yazar; ondan sonra bu betiği yeniden çalıştır.
import { readFileSync, writeFileSync } from 'node:fs';

const rows: { province: string; homes: number; median_tl_per_m3: number; latest: string }[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const path = 'tariffs/tariffs.json';
const bundle = JSON.parse(readFileSync(path, 'utf8'));
let changed = 0;
for (const r of rows) {
  const w = bundle.water?.[r.province];
  if (!w || w.verified) continue;
  const rate = Math.round(((r.median_tl_per_m3 - (w.ctvPerM3 ?? 0)) / (1 + (w.kdv ?? 0.04))) * 100) / 100;
  if (!(rate > 5 && rate < 500)) continue;
  bundle.water[r.province] = {
    ...w, tiers: [{ upTo: null, rate }], fixedMonthly: 0,
    source: `Sayaçla kullanıcı faturaları: ${r.homes} evin medyan birim fiyatı (vergiler ayrıştırıldı)`,
    asOf: String(r.latest).slice(0, 10), verified: false,
  };
  changed++;
}
const d = new Date();
bundle.version = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}-crowd`;
writeFileSync(path, JSON.stringify(bundle, null, 2) + '\n');
console.log(`${changed} il güncellendi`);
