// Gizlilik politikası metni — uygulama içi ekran ve docs/privacy.md aynı metni kullanır.
export const PRIVACY_UPDATED = '22 Ekim 2026';
export const PRIVACY_SECTIONS: { h: string; p: string }[] = [
  { h: 'Kısaca', p: 'Sayaçla hesap açtırmaz, reklam göstermez ve seni tanımlayan hiçbir veri toplamaz. Girdiğin okumalar, faturalar ve ev bilgilerin yalnızca bu cihazda saklanır.' },
  { h: 'Cihazında saklananlar', p: 'Ev bilgilerin (ad, il, ilçe), sayaç okumaların, girdiğin faturalar, hane kişi sayısı ve uygulama ayarların. Bu veriler cihazının uygulama alanında tutulur, Tever Technology dahil kimseye gönderilmez. Uygulamayı silmek veya Ayarlar > Tüm verileri sil ile kalıcı olarak silinir.' },
  { h: 'Kamera ve otomatik okuma', p: 'Kamera yalnızca sen sayaç fotoğrafı çektiğinde kullanılır. Rakamlar cihaz üzerinde Google ML Kit ile okunur; fotoğraf ve okunan rakamlar internete yüklenmez. ML Kit, Google’a kimliğe bağlı olmayan teşhis verisi gönderir: cihaz modeli ve işletim sistemi sürümü, uygulama sürümü, kuruluma özgü bir tanımlayıcı (kişiyi veya cihazı tanımlamak amacı taşımaz), performans ölçümleri ve hata kodları. Bu veriler yalnızca hizmetin çalışmasını ve kalitesini ölçmek için kullanılır; takip veya reklam amacıyla kullanılmaz.' },
  { h: 'Bildirimler', p: 'Okuma hatırlatıcısı ve kademe uyarıları cihaz içinde planlanan yerel bildirimlerdir; bildirim sunucusu kullanılmaz.' },
  { h: 'İnternet bağlantısı', p: 'Uygulama güncel tarife dosyasını günde en fazla bir kez GitHub (raw.githubusercontent.com) üzerinden indirir. Bu istekte kişisel veri gönderilmez; GitHub standart sunucu kayıtları (IP adresi gibi) tutabilir.' },
  { h: 'Üçüncü taraflar', p: 'Reklam veya takip SDK’sı kullanılmaz. Tek üçüncü taraf bileşen, yukarıda açıklanan Google ML Kit metin tanımadır. Verilerin satılmaz veya paylaşılmaz.' },
  { h: 'Çocuklar', p: 'Uygulama genel kitleye yöneliktir ve çocuklardan bilerek veri toplamaz.' },
  { h: 'Haklar (KVKK / GDPR)', p: 'Veriler yalnızca cihazında olduğundan erişim, düzeltme ve silme hakkını doğrudan uygulama içinden kullanabilirsin. Ayarlar > Verilerimi dışa aktar ile tüm verini alabilirsin.' },
  { h: 'İletişim', p: 'Tever Technology — m.eymen@teverorman.com' },
];
