# 🚀 Deploy Öncesi Kontrol Listesi
**CBS — 3D Şehir Modeli | Bursa Büyükşehir Belediyesi | v0.9.3**

> Git'e push **ya da** belediye sunucusuna göndermeden önce bu listeyi tepeden aşağıya tara.

---

## ✅ ADIM 1 — Versiyon Numarasını Artır

**Dosya:** `app/index.html` → ~satır 29

```js
var VER = '0.9.3';  // ← her deploy'da bu sayıyı bir artır → 0.9.4
```

> Bu yapılmazsa kullanıcılar yeni kodu göremez, tarayıcı önbelleğindeki eskiyi okur.

---

## ✅ ADIM 2 — Tarayıcıda Test Et

**Sunucuya atmadan önce kendi bilgisayarında:**

- [ ] Deploy paketi gerekiyorsa `npm run build:deploy` çalıştır; varsayılan olarak `pointcloud/` ve `Scene/Data/` deploy paketine alınmaz
- [ ] `dist/` içinde `app/`, `Scene/` (Data hariç), `import/`, `logo/` klasörlerini doğrula
- [ ] Büyük veri de gerekiyorsa sadece o durumda `npm run build:deploy:full` kullan

- [ ] F12 → Console → kırmızı hata yok
- [ ] Splash ekranı açıldı ve 10sn içinde kapandı
- [ ] Mesafe / alan / yükseklik / koordinat araçları çalışıyor
- [ ] Snap: mevcut bir noktaya yaklaşınca kırmızı snap noktası çıkıyor
- [ ] İçe aktarma (GeoJSON veya DXF) çalışıyor — haritada görünüyor
- [ ] Dışa aktarma (GeoJSON) çalışıyor — dosya bilgisayara iniyor
- [ ] Mobil cihazda snap loupe (büyüteç) ve çizim tamamlama butonu çalışıyor

---

## ✅ ADIM 3 — Güvenlik Kontrolü

- [ ] `app/config.js` mevcut, güncel ve `app/config.example.js` ile aynı anahtarları içeriyor
- [ ] `app/config.js` içindeki `supabaseUrl` ve `supabaseAnonKey` doğru ve eksiksiz
- [ ] Supabase Dashboard → `telemetry_logs` tablosunda **RLS aktif** (tablo yanında kilit ikonu)
- [ ] Kod içinde hassas bilgi içeren `console.log(...)` satırı bırakılmadı

---

## 📦 NEREYE NE GİDER?

### 🔵 A) GİT'E PUSH

Git, kodun geçmişini tutar. Büyük/hassas veri ve geliştirme araçları Git'e gitmez.

```bash
git add .
git commit -m "v0.9.2.3 — [değişikliğin kısa açıklaması]"
git push origin master
```

**Git'e giden dosyalar** (`.gitignore`'a göre otomatik):

| Dosya/Klasör | Git'e gider mi? |
|---|---|
| `app/index.html` | ✅ Evet |
| `app/main.js` | ✅ Evet |
| `app/cbs-storage.js` | ✅ Evet |
| `app/edit-manager.js` | ✅ Evet |
| `app/monitoring-service.js` | ✅ Evet |
| `app/messages.js` | ✅ Evet |
| `app/import-worker.js` | ✅ Evet |
| `app/admin-panel.html` | ✅ Evet |
| `app/admin-style.css` | ✅ Evet |
| `app/cbs-logo.png` | ✅ Evet |
| `app/clear.html` | ✅ Evet |
| `import/` (örnek veri) | ✅ Evet |
| `DEPLOY_ONCESI_KONTROL.md` | ✅ Evet |
| `README.md` | ✅ Evet |
| `app/Cesium/` | ✅ Evet — yerel loader için zorunlu, git'e alındı |
| `app/dev-panel.js` | ❌ Hayır — sadece geliştirme aracı |
| `app/design-system.html` | ❌ Hayır — sadece tasarım referansı |
| `app/analyze.js` | ❌ Hayır — analiz aracı |
| `app/audit_results.txt` | ❌ Hayır — analiz çıktısı |
| `app/main.js.bak` / `main_original.js` | ❌ Hayır — yedek dosyalar |
| `pointcloud/` | ❌ Hayır — çok büyük veri |
| `logo/` | ❌ Hayır — ham tasarım dosyaları |
| `_backup_editions/` | ❌ Hayır — eski sürüm yedekleri |
| `skills/` `.gemini/` | ❌ Hayır — AI araçları |

---

### 🟠 B) BELEDİYE SUNUCUSUNA KOPYALA

Sunucuda çalışacak minimum dosya seti. **Sadece bunları kopyala:**

```
app/
├── index.html          ← zorunlu
├── main.js             ← zorunlu
├── cbs-storage.js      ← zorunlu
├── edit-manager.js     ← zorunlu
├── monitoring-service.js ← zorunlu
├── messages.js         ← zorunlu
├── import-worker.js    ← zorunlu (dosya içe aktarma için)
├── admin-panel.html    ← admin izleme paneli
├── admin-style.css     ← admin panel stili
├── cbs-logo.png        ← logo ve favicon
├── clear.html          ← önbellek temizleme sayfası
└── Cesium/             ← zorunlu (git'ten geliyor, ayrıca kopyalamana gerek yok)
```

> ⚠️ `dev-panel.js`, `design-system.html`, `main_original.js`, `*.bak`, `analyze.js`, `audit_results.txt` **kesinlikle sunucuya gitmemeli.**

---

## ✅ ADIM 4 — Deploy Sonrası Kontrol

1. Tarayıcıda **Ctrl + Shift + R** — önbelleği temizleyerek zorla yenile
2. F12 → Network → `main.js?v=0.9.3` — yeni sürümün indiğini doğrula
3. F12 → Console — 1 dakika açık bırak, kırmızı hata çıkmamalı
4. Supabase → `telemetry_logs` tablosu — yeni `HEARTBEAT` kayıtları geliyor mu bak

---

## 📋 Sürüm Geçmişi

| Sürüm | Tarih | Özet |
|---|---|---|
| 0.9.0 | 2026-03 | İlk canlı sürüm |
| 0.9.1 | 2026-03 | Splash ekranı, ClipBox, ENU refactor |
| 0.9.2 | 2026-03 | Snap loupe, mobil arayüz, monitoring paneli |
| 0.9.2.3 | 2026-03-08 | Performans & güvenlik düzeltmeleri + cache busting |
| 0.9.2.4 | 2026-03-08 | Snap performans (2D kutu filtresi), rubber-band (globe.pick güvenliği), mobil snap öncelik mantığı, edit→çizim geçiş commit |
| **0.9.3** | **2026-03-08** | Edit modu X-Ray sync, Delete tuşu ghost primitive fix (stopEdit cleanup), preRender scratch Cartesian3 optimizasyonu |

> Yeni sürüm çıkınca bu tabloya bir satır ekle ve Adım 1'deki VER numarasını güncelle.
