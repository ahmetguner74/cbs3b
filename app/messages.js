// ═══════════════════════════════════════════════════════════════
// MERKEZİ BİLGİLENDİRME VE UYARI METİNLERİ (Localization / Messages)
// Uygulama içindeki tüm panellere basılan metinler buradan yönetilir.
// ═══════════════════════════════════════════════════════════════
window.AppMessages = {
    // Ölçüm Modu Aktif Mesajları
    HINT_POINT: '📍 Nokta modu aktif — haritaya dokunun',
    HINT_DISTANCE: '📏 Mesafe ölçümü — noktaları işaretleyin',
    HINT_AREA_FREE: '📐 Serbest Alan ölçümü — köşeleri belirleyin',
    HINT_AREA_BOX3P: '📐 3 Noktalı Kutu ölçümü — 3 nokta seçin',
    HINT_HEIGHT_1: '📊 Yükseklik ölçümü — 1. noktayı (zemin veya tepe) seçin',
    HINT_HEIGHT_2: '📊 Yükseklik ölçümü — 2. noktayı seçin',
    HINT_HEIGHT_UNDO: 'Yükseklik: 2 nokta tıklayın.',
    HINT_LINE_L: '📐 L-Mesafe (M.13) — 2 nokta arası yükseklik farkı 1. noktayı seçin',

    // İşlem Adımları & Sonuçlar
    DIST_RESULT: (dist, seg, mob) => `<b>Mesafe:</b> ${parseFloat(dist).toFixed(2)} m (${seg} segment). ${mob ? '<i>(↩ geri al)</i>' : '<i>(Geri: Ctrl+Z)</i>'}`,
    DIST_PROGRESS: (dist, seg) => `<b>Mesafe:</b> ${parseFloat(dist).toFixed(2)} m (${seg} segment). <i>(Geri: Ctrl+Z)</i>`,
    AREA_RESULT: (pts, mob) => `<b>Alan:</b> ${pts} nokta. ${mob ? '<i>(↩ geri al, ✓ bitir)</i>' : '<i>(Geri: Ctrl+Z) Sağ tık kapat.</i>'}`,
    AREA_FREE_RESULT: (pts, mob) => `<b>Alan (Serbest):</b> ${pts} nokta. ${mob ? '<i>(↩ geri al, ✓ bitir)</i>' : '<i>(Geri: Ctrl+Z) Sağ tık kapat.</i>'}`,
    AREA_BOX3P_PROGRESS: (rem, mob) => `<b>Alan (3 Nokta Kutu):</b> ${rem} nokta kaldı. ${mob ? '<i>(↩ geri al)</i>' : '<i>(Geri: Ctrl+Z)</i>'}`,
    AREA_FINISH: (area, pts) => `<b>Alan:</b> ${area} (${pts} köşe)`,
    AREA_FINISH_FULL: (resultText, pts, warningMsg) => `<b>Alan:</b> ${resultText} (${pts} köşe)${warningMsg}`,
    AREA_INTERSECT_WARN: (resultText, num) => `<b>Alan:</b> ${resultText} (${num}. ölçüm) <b style="color:#ef4444">⚠️ Kendini kesen poligon — alan hesabı yanlış olabilir!</b>`,
    POINT_FINISH: 'Nokta at işlemi tamamlandı.',
    POINT_COORD: (y, x, z) => `<b>Y:</b> ${parseFloat(y).toFixed(3)} | <b>X:</b> ${parseFloat(x).toFixed(3)} | <b>Z:</b> ${parseFloat(z).toFixed(3)} m`,
    HEIGHT_RESULT: (heightA, heightB, diff) => `<strong>Zemin:</strong> ${parseFloat(heightA).toFixed(2)} m | <strong>Tepe:</strong> ${parseFloat(heightB).toFixed(2)} m<br><span class="text-green-400 font-bold block mt-1 text-[11px]">Yükseklik Farkı: ${parseFloat(diff).toFixed(2)} m</span>`,
    HIDE_ALL: 'Ekrandaki çizimler gizlendi. <span class="text-xs text-slate-500 block mt-1">(Kayıtlar silinmedi)</span>',
    DEFAULT_IDLE: 'Araç seçin ve haritaya tıklayın.',
    HOME_VIEW: '🏠 Ana görünüme dönüldü',

    // Splash / Başlangıç İpuçları
    SPLASH_TITLE: '3D SAYISAL VERİ ÜRETİM VE ANALİZ PORTALI',
    SPLASH_SLOGAN: 'BİLGİ İŞLEM DAİRESİ BAŞKANLIĞI',
    SPLASH_LOAD_3D: '3D model yükleniyor...',
    SPLASH_LOAD_FAILED: 'Model yüklenemedi!',
    SPLASH_LOAD_READY: 'Hazır!',
    SPLASH_LOAD_UI_READY: 'Arayüz hazır, model bekleniyor...',
    SPLASH_LOAD_DETAILS: 'Detaylar yükleniyor...',
    SPLASH_LOAD_MODEL_READY: 'Model hazır, açılıyor...',
    SPLASH_LOAD_MODEL_WAIT_UI: 'Model hazır, arayüz hazırlanıyor...',

    SPLASH_TIPS_MOBILE: [
        { key: '👆', text: 'Tek tık: Seç & Ekle' },
        { key: '👆👆', text: 'Çift tık: Bitir' },
        { key: '🔄', text: 'İki parmak: Döndür & Eğ' }
    ],
    SPLASH_TIPS_DESKTOP: `
        <div class="flex items-center gap-3 w-full">
            <span style="min-width:70px;text-align:right;color:#fff;font-weight:bold;background:rgba(30,41,59,0.8);border-radius:4px;padding:4px 8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #334155;">H</span> 
            <span style="color:#e2e8f0;">Ana Görünüme Dön</span>
        </div>
        <div class="flex items-center gap-3 w-full">
            <span style="min-width:70px;text-align:right;color:#fff;font-weight:bold;background:rgba(30,41,59,0.8);border-radius:4px;padding:4px 8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #334155;">Z</span> 
            <span style="color:#e2e8f0;">Yükseklik Ayarla</span>
        </div>
        <div class="flex items-center gap-3 w-full">
            <span style="min-width:70px;text-align:right;color:#fff;font-weight:bold;background:rgba(30,41,59,0.8);border-radius:4px;padding:4px 8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #334155;">Del</span> 
            <span style="color:#e2e8f0;">Seçili Ölçümü Sil</span>
        </div>
        <div class="flex items-center gap-3 w-full">
            <span style="min-width:70px;text-align:right;color:#fff;font-weight:bold;background:rgba(30,41,59,0.8);border-radius:4px;padding:4px 8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #334155;">1-4</span> 
            <span style="color:#e2e8f0;">Ölçüm Araçları Kısayolu</span>
        </div>
        <div class="flex items-center gap-3 w-full">
            <span style="min-width:70px;text-align:right;color:#fff;font-weight:bold;background:rgba(30,41,59,0.8);border-radius:4px;padding:4px 8px;box-shadow:0 1px 2px rgba(0,0,0,0.05);border:1px solid #334155;">Orta Tık</span> 
            <span style="color:#e2e8f0;">Haritayı Döndür</span>
        </div>
    `,

    // Hatalar / Uyarılar
    ERR_EPSG: '<span class="text-red-400 font-bold text-[11px]">İçe aktarım için Koordinat Sistemi (EPSG) seçmelisiniz!</span>',
    ERR_CRS_SCOPE: (msg) => `<span class="text-red-400 font-bold text-[11px]">${msg}</span>`,
    ERR_MSG: (msg) => `<span class="text-red-400 font-bold text-[11px]">${msg}</span>`,
    SELF_INTERSECT_WARNING: ' <b style="color:#ef4444">⚠️ Kendini kesen poligon — alan hesabı yanlış olabilir!</b>',

    // Alan Mod Seçimi
    AREA_MODE_HINT: (mode, mob) => `Alan (${mode === 'free' ? 'Serbest' : '3 Nokta'}): ${mob ? 'Köşelere dokunun. <i>(✓ = kapat)</i>' : 'Noktaları tıklayın. <i>(Sağ tık = kapat)</i>'}`,

    // İçe Aktarma
    IMPORT_GUIDES: {
        btnImportCSV: 'CSV formatı: <b>NoktaAdi, X, Y, Z</b> (virgül veya noktalı virgül ayraçlı). İlk satır başlık olabilir.',
        btnImportGeoJSON: 'GeoJSON formatı: Standart <b>FeatureCollection</b>. Point, LineString ve Polygon desteklenir.',
        btnImportDXF: 'DXF formatı: <b>POINT, LINE, POLYLINE</b> entity tipleri desteklenir.'
    },
    IMPORT_GUIDE: (guide, crsLabel) => `<span class="text-slate-300 text-[10px]">📂 ${guide} Seçili sistem: <b class="text-primary">${crsLabel}</b></span>`,
    IMPORT_SUCCESS: (count, fileName, zOffset) => `<span class="text-green-400 font-bold text-[11px]">✓ ${count} ${count === 1 ? 'nokta' : 'öğe'} "${fileName}" grubuna aktarıldı.${zOffset !== 0 ? ' (Z+' + zOffset + 'm)' : ''}</span>`
};
