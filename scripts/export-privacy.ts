import { writeFileSync } from 'node:fs';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '../src/data/privacy';
const md = `# Verim — Gizlilik Politikası\n\n_Son güncelleme: ${PRIVACY_UPDATED}_\n\n` + PRIVACY_SECTIONS.map(s => `## ${s.h}\n\n${s.p}\n`).join('\n');
writeFileSync('docs/privacy.md', md);
const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verim — Gizlilik Politikası</title><style>body{font-family:-apple-system,system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.6;color:#111}h1{font-size:28px}h2{font-size:18px;margin-top:28px}</style></head><body><h1>Verim — Gizlilik Politikası</h1><p><em>Son güncelleme: ${PRIVACY_UPDATED}</em></p>` + PRIVACY_SECTIONS.map(s => `<h2>${s.h}</h2><p>${s.p}</p>`).join('') + `</body></html>`;
writeFileSync('docs/privacy.html', html);
writeFileSync('docs/index.html', html);
console.log('docs/privacy.{md,html} yazıldı');
