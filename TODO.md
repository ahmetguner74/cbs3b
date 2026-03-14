# 📋 TODO — CBS 3D Şehir Modeli

## Belediye Tek Sürüm Faz Planı (Güncel)

Bu proje artık ana hat olarak sadece belediye canlı sürümü ile yönetilecek.
Public/demo sürüm zorunlu release hattı değil, opsiyonel.

| Faz | Hedef | Yapılacaklar | Çıkış Kriteri |
|---|---|---|---|
| Faz 0 | Karar ve doküman senkronu | `DEPLOY_ONCESI_KONTROL.md`, `.gitignore`, build scriptleri aynı gerçekliği anlatacak şekilde hizalanacak | Doküman ve gerçek paket içeriği birebir tutarlı |
| Faz 1 | Tek sürüm profili | Uygulama varsayılan davranışı belediye profiline göre netleştirilecek; hardcode değil config/flag kontrollü olacak | Canlıya çıkış için yalnızca belediye profili yeterli |
| Faz 2 | Kapalı ağ uyumu | Dış bağımlılıklar local-first yaklaşımıyla çalışacak (yerel kaynak, gerekirse kontrollü internet) | İç ağda soğuk açılış ve temel araçlar sorunsuz çalışır |
| Faz 3 | Güvenlik sertleştirme | Admin doğrulama, komut kanalı güvenliği, panel XSS yüzeyi ve veri temizleme korumaları güçlendirilecek | Yetkisiz erişim ve komut riskleri kabul edilebilir seviyeye iner |
| Faz 4 | Tek paket yayın akışı | Belediye canlı paketi tek komutla üretilecek, deploy adımları sadeleşecek | "Canlıya almak için belediye paketini yüklemek" tek prosedür olur |
| Faz 5 | Belediye kabul testleri | Ölçüm, import/export, admin, telemetry ve hata senaryoları için sabit smoke checklist uygulanacak | Her release aynı test kapılarından geçer |
| Faz 6 (Opsiyonel) | Demo/public kolu | Gerekirse belediye sürümünden türetilmiş sınırlı demo paketi ayrı tutulacak | Demo ihtiyacı olduğunda ana canlı hattı etkilemeden sunulur |

## Görsel İyileştirmeler
- [ ] **Arka Plan Gradient** — Siyah yerine koyu lacivert gradient (#0f1729 → #050a15) + hafif vignette efekti. CAD/GIS çizim kontrastı ve göz konforu için optimize. (AutoCAD/QGIS dark theme referansı)

## Teknik Borç
- [ ] **Versiyon Senkronizasyonu** — `index.html` cache-busting parametrelerini `package.json` ile eşitle
- [ ] **main.js Modülerleştirme** — 10K satırlık monolitik yapıyı modüllere ayır (ölçüm, kamera, UI, import/export)

## Kentsel Donusum — Kat Odakli Cizim Plani (Basladi)

Kural guncellemesi (Madde 5):
- [x] Hangi kat ciziliyorsa sadece o katin alanlari gosterilecek.
- [x] Zemin kat referansi islem katina tasinmis hesap mantiginda kullanilacak.
- [x] Kullanici sadece islem yaptigi kati gorecek.

Uygulama fazlari:
- [x] Faz 1: Kat odak modu UI (islem kati, zemin kati, kati goster, tum katlar)
- [x] Faz 1: Aktif kat gorunurluk filtresi (liste + sahne)
- [x] Faz 1: Kat bazli alan ozeti (zemin + ek = kat toplami)
- [x] Faz 1: Yeni polygonlari aktif kata otomatik baglama
- [x] Faz 2: Onizleme popup 2D duzenleme (aktif kat odakli)
- [x] Faz 2: Katlar arasi gecis akisi ve kat adi yonetimi iyilestirme
- [x] Faz 3: Bina bazli kesin iliski (ayrik parca havuzu, bina/kat elle baglama)
- [x] Faz 3: Kaydet oncesi kat ve bina toplam alan ozetinin final UX'i
