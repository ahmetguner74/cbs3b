# CBS 3D Sehir Modeli

Bursa Buyuksehir Belediyesi icin gelistirilen, CesiumJS tabanli 3D sehir modeli ve CBS uygulamasi.

## Proje Durumu

- Ana hat: tek belediye surumu
- Canliya cikis: belediye paketi tek akis
- Demo/public: opsiyonel, zorunlu release hatti degil

Detayli yayin kontrol adimlari icin bkz. [DEPLOY_ONCESI_KONTROL.md](DEPLOY_ONCESI_KONTROL.md).

## Temel Ozellikler

- 3D Tiles sehir modeli goruntuleme
- Mesafe, alan, yukseklik ve koordinat olcum araclari
- Snap ve cizim yardimlari
- GeoJSON ve DXF ice aktarma
- GeoJSON disa aktarma
- Admin paneli ve telemetry izleme
- Mobil uyumlu kullanim

## Gelistirme Ortami Kurulumu

Gereksinimler:

- Node.js 18+
- npm 9+

Adimlar:

1. Bagimliliklari yukleyin.

```bash
npm install
```

2. [app/config.example.js](app/config.example.js) dosyasini [app/config.js](app/config.js) olarak kopyalayin ve belediye ortami bilgilerini doldurun.
3. Gelistirme sunucusunu baslatin.

```bash
npm run dev
```

4. Tarayici acildiginda kok [index.html](index.html) otomatik olarak [app/index.html](app/index.html) sayfasina yonlendirir.

## Komutlar

| Komut | Aciklama |
|---|---|
| `npm run dev` | Tailwind derleyip Vite gelistirme sunucusunu acar |
| `npm run build` | Uretim build'i olusturur |
| `npm run build:deploy` | Standart belediye deploy paketini uretir |
| `npm run build:deploy:dry` | Kopyalama yapmadan deploy paketini dogrular |
| `npm run build:deploy:full` | Buyuk veri dahil deploy paketi uretir |
| `npm run preview` | Uretim build ciktisini lokalde onizler |

## Tek Belediye Deploy Ozeti

1. [app/index.html](app/index.html) icindeki versiyonu guncelleyin.
2. Gerekliyse [package.json](package.json) versiyonunu ayni surume cekin.
3. `npm run build:deploy` calistirin.
4. `dist/` altindaki paketi belediye sunucusuna kopyalayin.
5. Fonksiyon ve telemetry kontrollerini tamamlayin.

Tum kontrol listesi: [DEPLOY_ONCESI_KONTROL.md](DEPLOY_ONCESI_KONTROL.md).

## Belediye Canli Yolu Notu

Belediye tarafinda uygulama asagidaki gibi bir adresten aciliyorsa:

`https://cbsuygulamalari.bursa.bel.tr/model/data/merinos1/app/`

sunucudaki klasor yapisi kardes klasor mantigiyla korunmalidir:

- `.../model/data/merinos1/app/`
- `.../model/data/merinos1/Scene/`
- `.../model/data/merinos1/import/` (opsiyonel)
- `.../model/data/merinos1/logo/` (opsiyonel)

Notlar:

- `app/index.html` icindeki kritik kaynak yollari gorelidir; alt dizinden yayin senaryosu ile uyumludur.
- Sadece `app/` kopyalanir ve `Scene/` kardes klasoru eksik kalirsa 3D model yuklenmez (`../Scene/merinos1.json`).
- Bu nedenle pratikte en guvenli yontem `npm run build:deploy` ciktisi olan `dist/` paketini bir butun olarak kopyalamaktir.

## Dizin Notlari

- [dist](dist) build cikti dizinidir, deploy kaynagidir.
- [scripts/build-deploy-package.mjs](scripts/build-deploy-package.mjs) deploy paketini uretir.
- [app/Cesium](app/Cesium), [import](import), [pointcloud](pointcloud), [logo](logo) gibi buyuk veya ortama bagli yollar `.gitignore` kapsamindadir.
- [Scene/Data](Scene/Data) varsayilan deploy modunda pakete dahil edilmez.

## Operasyon Notu

Kapali ag ortami kullaniliyorsa gerekli alan adlari ve allowlist listesi [DEPLOY_ONCESI_KONTROL.md](DEPLOY_ONCESI_KONTROL.md) icinde yer alir.
