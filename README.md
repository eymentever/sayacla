# Sayaçla — Su & Doğalgaz Fatura Takibi

Tever Technology. React Native (Expo SDK 54, Expo Router 6, TypeScript).

Sayacı okut → bu ayın tahmini faturası, geçen ayla fark, doğalgaz kademe durumu ve TL bazlı tasarruf önerileri.

## Mimari
```
app/                     Ekranlar (Expo Router)
  (tabs)/index.tsx       Özet: tahmini fatura, kıyas, kademe, uyarılar, öneriler
  (tabs)/scan.tsx        Kamera (ML Kit OCR) + elle giriş + doğrulama
  (tabs)/history.tsx     12 aylık grafik, aylar, faturalar, okumalar
  (tabs)/settings.tsx    Evler, hane, doğruluk, bildirimler, acil, veri
  onboarding / bill / leak-test / property / tariff / privacy
src/engine/              Saf hesap motoru (React'siz, test edilir)
  consumption.ts         Okumalar → dönemler → takvim ayına gün bazlı dağıtım, tahmin
  tariffs.ts             81 il tarife modeli (kaynak + tarih + doğrulandı bayrağı), uzak birleştirme
  bills.ts               Gaz (BOTAŞ kademe, tüm ay kuralı) + su faturası, kalibrasyon
  insights.ts            Kademe uyarısı, anomali, kaçak testi
  summary.ts             Özet, geçen ay kıyası, kişisel TL önerileri
  validation.ts          Okuma doğrulama + Türkçe sayı ayrıştırma
  ocrPick.ts             OCR çıktısından sayaç endeksini seçme
src/data/                BOTAŞ 2026 limitleri (81 il × 12 ay), 81 il / 973 ilçe, gizlilik metni
src/store/useSayacla.ts  Zustand + AsyncStorage — sadece ham veri (okuma, fatura, ev)
tariffs/tariffs.json     Uzak tarife paketi (uygulama günlük çeker)
docs/                    Gizlilik politikası, App Store paketi ve ekran görüntüleri
tests/                   Motor birim testleri
```

**İlke:** Tüketim ve tutar saklanmaz, her zaman okumalardan türetilir. Tarife güncellenince geçmiş de doğru hesaplanır.

## Komutlar
```bash
npm install
npm test                 # motor testleri
npx tsc --noEmit         # tip kontrolü (0 hata)
npx expo start           # Expo Go (OCR hariç her şey)
eas build -p ios --profile development   # OCR dahil test derlemesi
```

## Veri kaynakları
- Doğalgaz: BOTAŞ konut tarifesi 4 Nisan 2026 (1. kademe 10,625 / 2. kademe 18,00 TL/Sm³), il bazlı aylık limitler; KDV %20, ÖTV 0,1468 TL/Sm³.
- Su: ASKİ 05.10.2026 resmi tarife, İSKİ Ekim 2026, İZSU Haziran 2026; diğer büyükşehirler Mart 2026 basın karşılaştırması; geri kalanlar tahmini → faturayla kalibrasyon.

Yayın adımları: [docs/APP_STORE.md](docs/APP_STORE.md)
