# 🚀 Deploy Öncesi Kontrol Listesi
**CBS — Bursa Büyükşehir Belediyesi — Tek Belediye Sürümü**

> Bu proje canlıda tek sürüm yaklaşımıyla yönetilir.
> Canlıya çıkış için sadece belediye paketi hazırlanır ve yüklenir.

---

## ✅ ADIM 0 — Strateji Kontrolü

- [ ] Bu release belediye canlı paketi olarak hazırlanıyor
- [ ] Public/demo sürüm için ayrı release yapılmıyor (opsiyonel kol)

---

## ✅ ADIM 1 — Versiyonu Güncelle (Cache Busting)

**Dosya:** app/index.html

- [ ] `var VER = 'x.y.z'` değerini artır
- [ ] Aynı dosyadaki sabit `?v=...` geçen script/link satırlarını da aynı versiyona getir

**Dosya (önerilen):** package.json

- [ ] `version` değerini yeni sürümle uyumlu tut

> Not: Mevcut yapıda versiyon bilgisi birden çok yerde geçiyor; hepsi aynı olmalı.

---

## ✅ ADIM 2 — Belediye Paketini Üret

**Standart komut:**

```bash
npm run build:deploy
```

**Büyük veri gerekiyorsa:**

```bash
npm run build:deploy:full
```

**Ön kontrol (dosya kopyalamadan):**

```bash
npm run build:deploy:dry
```

Kontrol et:

- [ ] dist/app var
- [ ] dist/Scene var (varsayılan modda Scene/Data hariç)
- [ ] dist/import varsa doğru içerikte
- [ ] dist/logo varsa doğru içerikte

> Not: build script bazı klasörler yoksa "Skip missing path" uyarısı verip devam eder.

---

## ✅ ADIM 3 — Tarayıcı Fonksiyon Testi

- [ ] F12 Console: kırmızı hata yok
- [ ] Splash ekranı normal açılıp kapanıyor
- [ ] Mesafe / alan / yükseklik / koordinat araçları çalışıyor
- [ ] Snap davranışı doğru
- [ ] İçe aktarma (GeoJSON/DXF) çalışıyor
- [ ] Dışa aktarma (GeoJSON) çalışıyor
- [ ] Mobilde temel çizim akışları çalışıyor

---

## ✅ ADIM 4 — Güvenlik ve İç Ağ Kontrolü

- [ ] app/config.js mevcut ve güncel
- [ ] app/config.example.js ile anahtar seti uyumlu
- [ ] Supabase tarafında RLS ve tablolar doğru
- [ ] Hassas bilgi içeren debug log satırı bırakılmadı

İç ağda gerekli olabilir (Bilgi İşlem ile):

| Alan adı | Amaç | Öncelik |
|---|---|---|
| qnobscsbcsrhizqcraif.supabase.co | Telemetry ve yönetim paneli | Kritik |
| cdn.jsdelivr.net | Supabase SDK, EmailJS, jsPDF eklentileri | Kritik |
| cdnjs.cloudflare.com | proj4, jszip | Kritik |
| cdn.sheetjs.com | Excel dışa aktarma | Kritik |
| cesium.com | Cesium fallback script/css | Kritik |
| unpkg.com | Leaflet (admin harita) | Kritik |
| fonts.googleapis.com | Font CSS | Orta |
| fonts.gstatic.com | Font dosyaları | Orta |
| tile.openstreetmap.org | OSM katmanı | Orta |
| services.arcgisonline.com | Uydu katmanı | Orta |
| ipapi.co | Yaklaşık IP konumu | Opsiyonel |
| api.emailjs.com | Geri bildirim e-posta gönderimi | Opsiyonel |

> Not: İç ağda bazı alan adları kapalıysa Bilgi İşlem tarafından allowlist açılması gerekir.

---

## ✅ ADIM 5 — Git Gerçekliği (Mevcut .gitignore ile)

### Git'e gitmeyenler (ignore)

- dist/
- node_modules/
- pointcloud/
- import/
- app/Cesium/
- logo/
- skills/
- _backup_editions/
- recent_changes*.diff
- .vercel/
- .env*.local
- serve.bat

### Git'e gidenler (çekirdek uygulama)

- app içindeki ana dosyalar (index.html, main.js, edit-manager.js, volume-manager.js vb.)
- app/admin-panel.html ve app/admin-style.css
- app/dev-panel.js, app/design-system.html (ignore edilmedikleri için)
- README.md, DEPLOY_ONCESI_KONTROL.md, package.json vb.

> Kritik not: "Git'e gidiyor" ile "sunucuya kopyalanıyor" aynı şey değildir. Canlı için esas kaynak dist paketidir.

---

## ✅ ADIM 6 — Sunucuya Kopyalama (Tek Akış)

Önerilen yöntem:

1. Sunucuda mevcut canlı klasörün tarihli yedeğini al
2. `npm run build:deploy` çalıştır
3. dist içeriğini sunucuya kopyala
4. Sonrası ADIM 7 kontrolleri

Manuel kopyada minimum hedef:

- dist/app/
- dist/Scene/
- dist/import/ (varsa)
- dist/logo/ (varsa)

---

## ✅ ADIM 7 — Deploy Sonrası Kontrol

1. Tarayıcıda Ctrl + Shift + R ile zorla yenile
2. Network sekmesinde yeni versiyon dosyalarının indiğini doğrula
3. Console'u 1 dakika izle (hata olmamalı)
4. Telemetry akışını doğrula (HEARTBEAT/log kayıtları)
5. Yönetim panelinde canlı oturumların geldiğini kontrol et

---

## ✅ ADIM 8 — Hızlı Geri Dönüş (Rollback)

- [ ] Kritik hata varsa yeni paketi geri al
- [ ] ADIM 6'da alınan bir önceki canlı yedeği geri yükle
- [ ] Tarayıcıda zorla yenile ve temel smoke testi tekrar et
- [ ] Olay kaydını not düş (sürüm, saat, neden rollback)

---

## 📋 Sürüm Geçmişi

| Sürüm | Tarih | Özet |
|---|---|---|
| 0.9.0 | 2026-03 | İlk canlı sürüm |
| 0.9.1 | 2026-03 | Splash ekranı, ClipBox, ENU refactor |
| 0.9.2 | 2026-03 | Snap loupe, mobil arayüz, monitoring paneli |
| 0.9.2.3 | 2026-03-08 | Performans ve güvenlik düzeltmeleri + cache busting |
| 0.9.2.4 | 2026-03-08 | Snap performans iyileştirmeleri, edit→çizim geçiş iyileştirmesi |
| 0.9.3 | 2026-03-08 | Edit modu X-Ray sync, Delete ghost primitive fix, preRender optimizasyonu |

> Yeni sürümde bu tabloya satır ekle ve ADIM 1 versiyonlarını birlikte güncelle.
