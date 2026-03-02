# 🏙️ CBS 3D Şehir Modeli

Belediyeler için geliştirilmiş, **CesiumJS** tabanlı 3D şehir görselleştirme ve coğrafi bilgi sistemi (CBS) uygulaması.

![CBS 3D](https://img.shields.io/badge/Platform-Web-blue) ![CesiumJS](https://img.shields.io/badge/Engine-CesiumJS-green) ![Status](https://img.shields.io/badge/Status-Demo-orange)

## ✨ Özellikler

- 🗺️ **3D Şehir Modeli** — 3D Tiles formatında şehir görselleştirme
- 📏 **Ölçüm Araçları** — Mesafe, alan' yüksekli ve nokta ölçümü
- 📐 **Snap Özelliği** — Mevcut noktalara ve çizgilere otomatik snap
- 🎨 **Tema Desteği** — Açık ve koyu tema
- 📱 **Responsive Tasarım** — Masaüstü ve mobil uyumlu
- 📊 **Ölçüm Grupları** — Ölçümleri kategorilere ayırma ve yönetme

## 🚀 Başlarken

### Gereksinimler

- Modern bir web tarayıcı (Chrome, Firefox, Edge)
- 3D Tiles formatında şehir modeli verisi
- Web sunucusu (lokal geliştirme için)

### Kurulum

1. Bu repo'yu klonlayın:
   ```bash
   git clone https://github.com/ahmetguner74/cbs-3d-sehir-modeli.git
   ```

2. CesiumJS'i `app/Cesium/` dizinine yerleştirin veya CDN kullanın

3. 3D Tiles verilerinizi `Scene/` dizinine kopyalayın

4. `Chrome_ile_Ac.bat` ile veya bir web sunucusu üzerinden açın

## 📁 Proje Yapısı

```
├── app/
│   ├── index.html          # Ana uygulama sayfası
│   ├── main.js             # Uygulama mantığı
│   ├── design-system.html  # Tasarım sistemi referansı
│   ├── cbs-logo.png        # CBS logosu
│   └── Cesium/             # CesiumJS kütüphanesi (gitignore)
├── Scene/                  # 3D Tiles verileri (gitignore)
├── logo/                   # Logo dosyaları
└── Chrome_ile_Ac.bat       # Hızlı başlatma scripti
```

## 🛠️ Teknolojiler

- **CesiumJS** — 3D harita motoru
- **HTML5 / CSS3 / JavaScript** — Frontend
- **3D Tiles** — Şehir modeli formatı

## 📄 Lisans

Bu proje şu an geliştirme aşamasındadır.

## 👤 Geliştirici

**Ahmet Güner** — 3D Model ve CBS Uzmanı

---

> 🏗️ Bu uygulama, belediyelerin CBS altyapısını güçlendirmek amacıyla geliştirilmektedir.
