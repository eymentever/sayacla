# Verim — App Store yayın paketi

## 1. Kimlik
| Alan | Değer |
|---|---|
| Uygulama adı (30) | Verim: Su ve Doğalgaz Takibi |
| Alt başlık (30) | Fatura tahmini, kademe uyarısı |
| Bundle ID | com.tevertechnology.verim |
| SKU | verim-ios-001 |
| Birincil kategori | Yardımcı Araçlar (Utilities) |
| İkincil kategori | Finans |
| Yaş derecesi | 4+ |
| Fiyat | Ücretsiz (uygulama içi satın alma yok — v1.0) |
| Birincil dil | Türkçe |

## 2. Anahtar kelimeler (100 karakter)
```
doğalgaz,kademe,botaş,su faturası,sayaç,igdaş,iski,aski,fatura hesapla,tasarruf,kombi,enerji
```

## 3. Tanıtım metni (170)
Doğalgazda 1 m³ fazla tüketim ayın tamamını 2. kademeye taşıyabilir. Verim, ilinin BOTAŞ limitini takip eder ve aşmadan önce seni uyarır.

## 4. Açıklama
Su ve doğalgaz faturanı ödemeden önce bil.

Verim, sayacını okuttuğun anda bu ayın tahmini faturasını, geçen aya göre farkı ve neyi değiştirirsen ayda kaç TL tasarruf edeceğini gösterir.

DOĞALGAZ KADEME UYARISI
4 Nisan 2026’dan beri doğalgazda il bazlı kademeli tarife uygulanıyor. Aylık limitini 1 m³ bile aşarsan o ayın tüm tüketimi 2. kademe fiyatından faturalanıyor. Verim 81 ilin 12 aylık BOTAŞ limitlerini bilir, ay sonu tüketimini tahmin eder ve “limitine 6 m³ kaldı, günde en fazla 0,8 m³ kullan” gibi net uyarılar verir.

SAYACI OKUT, FATURAYI GÖR
• Kamerayla okut — rakamlar cihaz üzerinde okunur, fotoğraf internete gitmez
• Ya da elle gir; Türkçe sayı biçimleri (43.817,05) desteklenir
• Hatalı okumayı yakalar: sayaç geri gidemez, ani sıçramalar için uyarır
• Sayaç değişimi, kartlı sayaç ve merkezi sistem desteği

GERÇEK FİYATINLA HESAP
• 81 il ve 973 ilçe
• Resmi tarifeler (BOTAŞ, ASKİ, İSKİ, İZSU…) — kaynak ve tarihleriyle
• Bir faturanı gir: hesaplar senin gerçek birim fiyatına göre ayarlanır, belediye zamları dahil
• Tarifeler internetten otomatik güncellenir

NE YAPMALISIN?
Kendi tüketimin ve ilinin tarifesiyle hesaplanmış, TL bazlı öneriler: kademede kalmak için gereken azaltım, oda sıcaklığı, duş süresi, perlatör, kaçak testi…

SU KAÇAK TESTİ
İki okumayla klozet rezervuarı ve tesisat sızıntılarını litre olarak ölç.

GİZLİLİK
Hesap yok, reklam yok, takip yok. Tüm verilerin yalnızca cihazında saklanır.

Tahminler bilgilendirme amaçlıdır; kesin tutar dağıtım şirketinin / belediyenin faturasındadır.

## 5. URL’ler
| Alan | Değer |
|---|---|
| Gizlilik politikası URL | https://eymentever.github.io/verim/privacy.html (yayında) |
| Destek URL | https://github.com/eymentever/verim/blob/main/docs/privacy.md (veya teverorman.com iletişim sayfası) |
| Destek e-postası | m.eymen@teverorman.com |

## 6. App Privacy (Gizlilik etiketleri)
**Kimliğe bağlı olmayan veriler (yayınlandı):** Device ID, Performance Data, Other Diagnostic Data — amaç Analytics, takip yok. Kaynak: Google ML Kit cihaz içi metin tanıma teşhis verisi (developers.google.com/ml-kit/ios-data-disclosure). Fotoğraf ve okumalar cihazdan çıkmaz.

## 7. Review notları (App Review Information)
```
Verim requires no account. To test:
1) Complete onboarding: pick any province (e.g. İstanbul / Kadıköy), keep defaults.
2) On "Sayaç oku", choose "Elle gir" and enter 1000, tap Devam → Kaydet (baseline).
3) Enter a second reading, e.g. 1012 → Kaydet. The Özet tab now shows the monthly bill
   estimate, natural-gas tier (kademe) status and savings tips.
Camera OCR runs fully on-device (Google ML Kit). No login, no in-app purchases, no tracking.
Tariff data is fetched from https://raw.githubusercontent.com/eymentever/verim/main/tariffs/tariffs.json
```

## 8. Ekran görüntüleri
`docs/appstore/` klasöründe 6,9" (1320×2868) — 6 adet. Gerçek cihazdan alınmış görüntülerle değiştirilmesi önerilir (yazı tipi iOS'ta SF Pro olacaktır).

## 9. Yayın adımları (Windows'tan, EAS bulut derlemesi)
```bash
npm i -g eas-cli
eas login                       # Expo hesabı
eas init                        # projeyi Expo'ya bağlar (app.json'a projectId yazar)
eas build -p ios --profile production
eas submit -p ios --latest      # App Store Connect API anahtarı veya Apple ID ile
```
- Mac gerekmez; derleme Expo sunucularında yapılır.
- İlk derlemede Apple Developer hesabına giriş istenir; sertifika ve provisioning profilini EAS otomatik oluşturur.
- Kamera OCR'ı (ML Kit) Expo Go'da çalışmaz. Test için: `eas build -p ios --profile development` → cihaza kur → `npx expo start --dev-client`.
- TestFlight'ta kontrol listesi: ilk okuma, ikinci okuma, kamera okuma, fatura girişi, kaçak testi, bildirim izni, Ayarlar > Tüm verileri sil.

## 10. Tarife güncelleme (uygulama güncellemesi gerektirmez)
1. `src/engine/tariffs.ts` veya doğrudan `tariffs/tariffs.json` içindeki değeri güncelle (kaynak + tarih ile).
2. `npx tsx scripts/export-tariffs.ts` → `tariffs/tariffs.json`
3. `main`'e push et. Uygulamalar 24 saat içinde yeni tarifeyi çeker.
