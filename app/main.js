// ═══════════════════════════════════════════════════════════════
// Bursa Büyükşehir Belediyesi — 3D Ölçüm ve Dijitalleştirme
// ═══════════════════════════════════════════════════════════════

// 1. CESIUM ION TOKEN (her zaman gerekli — CesiumJS dahili olarak kullanır)
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyYmExYjdkYS03YjFkLTRkMDMtYjFkMS1kNjJiYzA1ZGIyNWQiLCJpZCI6NDE3MTMsImlhdCI6MTc2NjEzMjI3OH0.OGK7rOk1E5pLcZ_Wauyz8hiUlSPb9zmMWuRW2lhp-7c';
var _isMunicipality = true;

// 2. Protokol tespiti: file:// → Ion/terrain kullanma (CORS hatası verir)
var isLocalFile = window.location.protocol === 'file:';

// 3. VIEWER
var viewer = new Cesium.Viewer('cesiumContainer', {
	animation: false, timeline: false, vrButton: false, infoBox: false,
	sceneModePicker: false, baseLayerPicker: false, geocoder: false,
	homeButton: false,
	navigationHelpButton: false,
	imageryProvider: isLocalFile ? false : undefined, // file:// → imagery kapalı
	terrainProvider: new Cesium.EllipsoidTerrainProvider()  // Başlangıçta düz elipsoid
});

// Mobil tespiti (tarayıcı tabanlı — Cesium API'ye bağımlı değil)
var _isMob = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1);
var isMobile = _isMob; // Geriye dönük uyumluluk için

// ═══════════════════════════════════════════════════════════════
// MERKEZ VEKTÖR STİL YAPILANDIRMASI
// Tüm ölçüm çizimlerinin görsel parametreleri tek yerden yönetilir.
// Endüstri standardı: QGIS / ArcGIS referans değerleri.
// ═══════════════════════════════════════════════════════════════
var VEC_STYLE = {
	// ── NOKTA (Köşe Noktası) ─────────────────
	point: {
		size: 6,                        // Ölçüm köşe noktası (px) — GIS std: 6-8
		outline: 2,                     // Çerçeve kalınlığı (px)
		outlineColor: Cesium.Color.BLACK
	},
	// ── ÇİZGİ (Mesafe Ölçüm) ────────────────
	line: {
		width: 3                        // Mesafe çizgisi (px)
	},
	// ── ALAN (Poligon) ───────────────────────
	polygon: {
		edgeWidth: 2,                   // Kenar çizgisi (px)
		fillAlpha: 0.3,                 // Dolgu saydamlığı
		previewAlpha: 0.2               // Canlı önizleme saydamlığı
	},
	// ── YÜKSEKLİK (L-Çizgi) ─────────────────
	height: {
		horizontalWidth: 2,             // Yatay çizgi (px)
		verticalWidth: 3,               // Dikey çizgi (px)
		verticalAlpha: 0.6,             // Dikey çizgi saydamlığı
		dashLength: 16.0,               // Kesikli çizgi uzunluğu
		midPointSize: 6                 // pMid ara noktası (px)
	},
	// ── ETİKET (Label) ───────────────────────
	label: {
		font: 'bold 13px sans-serif',
		outlineWidth: 2,
		outlineColor: Cesium.Color.BLACK,
		offsetY: -8                     // Dikey piksel ofseti
	},
	// ── SNAP (Yakalama Göstergesi) ───────────
	snap: {
		vertexSize: 12,                 // Köşe snap (px)
		edgeSize: 8,                    // Kenar snap (px)
		vertexAlpha: 0.8,
		edgeAlpha: 0.8
	}
};

// ═══════════════════════════════════════════════════════════════
// PROJ4 KOORDİNAT SİSTEMİ TANIMLARI (EPSG:5254 - ITRF96 TM30)
if (typeof proj4 !== 'undefined' && !proj4.defs('EPSG:5254')) {
	proj4.defs("EPSG:5254", "+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs");
}

// HTTP modunda Ion World Terrain'i asenkron yükle (belediye sürümünde Ion kullanılmaz)
if (!isLocalFile && !_isMunicipality) {
	Cesium.createWorldTerrainAsync().then(function (terrain) {
		viewer.terrainProvider = terrain;
	}).catch(function (err) {
		console.warn('World Terrain yüklenemedi:', err);
	});
}

// KALİTE MODU: Sistem kaliteli modda başlar (FXAA + fog sadece HTTP'de)
viewer.scene.postProcessStages.fxaa.enabled = !isLocalFile;
viewer.scene.fog.enabled = !isLocalFile;
// Logarithmic depth buffer 1:1 ölçekli dünyada titremeyi önlemek için kritiktir. 
// Sadece çok eski mobil GPU'larda sorun yaratır, modern cihazlarda açık kalmalıdır.
viewer.scene.logarithmicDepthBuffer = true;
viewer.scene.globe.depthTestAgainstTerrain = true;
// Near plane değerini mobilde 1.0 yaparak derinlik tamponu (Z-buffer) hassasiyetini optimize ediyoruz
viewer.scene.camera.frustum.near = _isMob ? 1.0 : 0.1;
viewer.scene.logarithmicDepthBuffer = true; // Modern cihazlarda her zaman açık olmalı
viewer.scene.pickTranslucentDepth = true;
if (viewer.scene.skyAtmosphere) { viewer.scene.skyAtmosphere.show = false; }

// file:// → skyBox da CORS hatası verir, kapat
if (isLocalFile && viewer.scene.skyBox) { viewer.scene.skyBox.show = false; }

viewer.scene.globe.show = false; // Küreyi tamamen gizle (Globe butonu ile açılır)

// ─── PERFORMANS: Sahne değişmediğinde GPU render'ı durdur ───
viewer.scene.requestRenderMode = true;
viewer.scene.maximumRenderTimeChange = 0.0; // Etkileşimde anında render et

// ─── RENDER HATASI YAKALAYICI ───────────────────────────────────
// Geçersiz geometri (self-intersecting polygon vb.) render döngüsünü çökertmesin.
// Bu listener varsa CesiumJS hatayı yutup render'ı durdurmak yerine devam eder.
viewer.scene.renderError.addEventListener(function (scene, error) {
	console.warn('CesiumJS render hatası yakalandı (çalışmaya devam ediyor):', error);
});

// ─── GEZİNME AYARLARI (Camera Controller) ───
var controller = viewer.scene.screenSpaceCameraController;
controller.minimumZoomDistance = 2;        // Min 2m yakınlaşma
controller.maximumZoomDistance = 3000;     // Max 3km uzaklaşma
controller.inertiaSpin = 0.3;             // Döndürme ataleti (düşük = hızlı durur)
controller.inertiaTranslate = 0.3;        // Kaydırma ataleti
controller.inertiaZoom = 0.3;             // Zoom ataleti
controller.bounceAnimationTime = 1.0;     // Çarpışma geri sekme süresi (3s → 1s)
controller.enableLook = true;              // Ctrl+Shift: serbest bakış (FPS tarzı)

// Harita katmanları: Uydu + OSM Sokak
var satelliteLayer;
if (viewer.imageryLayers.length > 0) {
	// HTTP modunda Ion varsayılan uydu katmanı mevcut
	satelliteLayer = viewer.imageryLayers.get(0);
} else {
	// file:// modunda Ion çalışmaz — ESRI World Imagery kullan (CORS-dostu)
	Cesium.ArcGisMapServerImageryProvider.fromUrl(
		'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
	).then(function (provider) {
		satelliteLayer = viewer.imageryLayers.addImageryProvider(provider);
	}).catch(function (err) {
		console.warn('ESRI Imagery yüklenemedi:', err);
	});
}

var streetLayer = viewer.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({
	url: 'https://tile.openstreetmap.org/'
}));
streetLayer.show = true; // Başlangıçta sokak katmanı açık
if (satelliteLayer) satelliteLayer.show = false; // Uydu katmanı başlangıçta kapalı

// ═══ EDITION: Sabit Belediye Sürümü ═══
// Üstte halledildi. Müşteri her zaman sokak haritası ile başlatmak istiyor.

// YAKLAŞTIRMA HASSASİYETİ KESİN ÇÖZÜMÜ (Mouse Wheel Zoom)
// zoomFactor her zaman istenen sonucu vermediği için doğrudan fare tekerleği sinyalini zayıflatıyoruz.
var zoomSensitivity = 0.25; // Değer ne kadar küçükse o kadar yavaş yaklaşır (0.25 = %25 hız)
viewer.scene.canvas.addEventListener('wheel', function (e) {
	if (e.isTrusted) {
		e.stopPropagation();
		var slowEvent = new WheelEvent('wheel', {
			deltaX: e.deltaX * zoomSensitivity,
			deltaY: e.deltaY * zoomSensitivity,
			deltaZ: e.deltaZ * zoomSensitivity,
			clientX: e.clientX,
			clientY: e.clientY,
			screenX: e.screenX,
			screenY: e.screenY,
			bubbles: true,
			cancelable: true
		});
		viewer.scene.canvas.dispatchEvent(slowEvent);
	}
}, true); // Capture phase (Cesium'dan önce yakalar)

// Kredi bilgisini güvenli yöntemle ekle (deprecated removeDefaultCredit/addDefaultCredit kullanma)
try {
	var cd = viewer.creditDisplay || viewer.scene.frameState.creditDisplay;
	if (cd && cd.addStaticCredit) {
		cd.addStaticCredit(new Cesium.Credit('Bursa Büyükşehir Belediyesi'));
	} else if (cd && cd.addDefaultCredit) {
		cd.addDefaultCredit(new Cesium.Credit('Bursa Büyükşehir Belediyesi'));
	}
} catch (e) {
	console.warn('Kredi ekleme atlandı:', e);
}

var drawLayer = new Cesium.CustomDataSource('Olcumler');
viewer.dataSources.add(drawLayer);

// Z-fighting ofseti (metre) — eksik değişken tanımlandı
var ENTITY_HEIGHT_OFFSET = 0.5; // metre — çizimlerin titremesini engelleyen ofset

// requestRenderMode=true iken entity değişikliklerinde sahneyi otomatik yenile
drawLayer.entities.collectionChanged.addEventListener(function () {
	viewer.scene.requestRender();
});

var currentAreaMode = 'free'; // 'free', 'box3p'

// ─── ALAN KUTU HESAPLAMA FONKSİYONLARI ──────────────────────────

function calculateBox3P(p1, p2, p3) {
	// 3 Noktadan yönlü dikdörtgen (kutu) hesaplar.
	// P1-P2 ana kenar, P3 genişliği/yönü belirler.
	// TAM 3D — yatay, eğimli veya dikey her yüzeyde doğru dikdörtgen üretir.

	// ENU koordinat sistemine dönüştür (anti-jitter)
	var enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(p1);
	var invEnuMatrix = Cesium.Matrix4.inverse(enuMatrix, new Cesium.Matrix4());

	var localP1 = Cesium.Matrix4.multiplyByPoint(invEnuMatrix, p1, new Cesium.Cartesian3());
	var localP2 = Cesium.Matrix4.multiplyByPoint(invEnuMatrix, p2, new Cesium.Cartesian3());
	var localP3 = Cesium.Matrix4.multiplyByPoint(invEnuMatrix, p3, new Cesium.Cartesian3());

	// P1→P2 yön vektörü (tam 3D)
	var v12 = Cesium.Cartesian3.subtract(localP2, localP1, new Cesium.Cartesian3());
	var len12 = Cesium.Cartesian3.magnitude(v12);
	if (len12 === 0) return [p1, p2, p3, p3];

	// Normalize edilmiş ana eksen
	var dir = Cesium.Cartesian3.divideByScalar(v12, len12, new Cesium.Cartesian3());

	// P1→P3 vektörü (tam 3D)
	var v13 = Cesium.Cartesian3.subtract(localP3, localP1, new Cesium.Cartesian3());

	// P3'ün P1-P2 doğrultusu üzerindeki bileşenini çıkar → dik bileşeni bul
	var projScalar = Cesium.Cartesian3.dot(v13, dir);
	var projVec = Cesium.Cartesian3.multiplyByScalar(dir, projScalar, new Cesium.Cartesian3());
	var perpVec = Cesium.Cartesian3.subtract(v13, projVec, new Cesium.Cartesian3());

	// Dikdörtgen köşelerini hesapla (3D)
	var localP3_Corrected = Cesium.Cartesian3.add(localP2, perpVec, new Cesium.Cartesian3());
	var localP4 = Cesium.Cartesian3.add(localP1, perpVec, new Cesium.Cartesian3());

	// Dünyaya geri dönüştür
	var worldP3 = Cesium.Matrix4.multiplyByPoint(enuMatrix, localP3_Corrected, new Cesium.Cartesian3());
	var worldP4 = Cesium.Matrix4.multiplyByPoint(enuMatrix, localP4, new Cesium.Cartesian3());

	return [p1, p2, worldP3, worldP4];
}

// ─── MERKEZİ ALAN YÖNETİCİSİ (ENDÜSTRİ STANDARDI) ───
// Tüm 2D/3D alan hesaplamaları ve kontrolleri buradan yönetilir.
var AreaManager = {
	// İki çizginin kesişip kesişmediğini kontrol eder
	segmentsIntersect2D: function (a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
		var d1x = a2x - a1x, d1y = a2y - a1y;
		var d2x = b2x - b1x, d2y = b2y - b1y;
		var cross = d1x * d2y - d1y * d2x;
		if (Math.abs(cross) < 1e-10) return false;
		var dx = b1x - a1x, dy = b1y - a1y;
		var t = (dx * d2y - dy * d2x) / cross;
		var u = (dx * d1y - dy * d1x) / cross;
		var eps = 1e-6;
		return t > eps && t < (1 - eps) && u > eps && u < (1 - eps);
	},

	// Poligonun kendi kendini kesip kesmediğini kontrol eder
	isSelfIntersecting: function (points) {
		if (points.length < 4) return false;
		var origin = points[0];
		var enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(origin);
		var inv = Cesium.Matrix4.inverse(enuMatrix, new Cesium.Matrix4());
		var localPts = points.map(function (p) {
			return Cesium.Matrix4.multiplyByPoint(inv, p, new Cesium.Cartesian3());
		});
		var n = localPts.length;
		for (var i = 0; i < n; i++) {
			var i2 = (i + 1) % n;
			for (var j = i + 2; j < n; j++) {
				if (i === 0 && j === n - 1) continue;
				var j2 = (j + 1) % n;
				if (this.segmentsIntersect2D(
					localPts[i].x, localPts[i].y, localPts[i2].x, localPts[i2].y,
					localPts[j].x, localPts[j].y, localPts[j2].x, localPts[j2].y
				)) return true;
			}
		}
		return false;
	},

	// 3D Alan Hesabı (Newell Algoritması - ECEF Koordinatları)
	calculate3D: function (points) {
		var nx = 0, ny = 0, nz = 0;
		for (var i = 0; i < points.length; i++) {
			var j = (i + 1) % points.length;
			var p1 = points[i], p2 = points[j];
			nx += (p1.y - p2.y) * (p1.z + p2.z);
			ny += (p1.z - p2.z) * (p1.x + p2.x);
			nz += (p1.x - p2.x) * (p1.y + p2.y);
		}
		return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2.0;
	},

	// 2D Alan Hesabı (EPSG:5254 TM30 Projeksiyonu ile Shoelace Formülü)
	calculate2D: function (points) {
		if (points.length < 3) return 0;
		var projCoords = points.map(function (p) {
			var carto = Cesium.Cartographic.fromCartesian(p);
			var lat = Cesium.Math.toDegrees(carto.latitude);
			var lon = Cesium.Math.toDegrees(carto.longitude);
			return wgs84ToTm30(lat, lon); // [x, y]
		});
		var sum2D = 0;
		for (var i = 0; i < projCoords.length; i++) {
			var j = (i + 1) % projCoords.length;
			sum2D += (projCoords[i][0] * projCoords[j][1]) - (projCoords[j][0] * projCoords[i][1]);
		}
		return Math.abs(sum2D) / 2.0;
	},

	// Tüm sonuçları hesaplayıp döndürür
	processArea: function (points) {
		return {
			area3D: this.calculate3D(points),
			area2D: this.calculate2D(points),
			isIntersecting: this.isSelfIntersecting(points)
		};
	}
};

var tileset; // Asenkron yüklenecek

// Tileset'i asenkron yükle (CesiumJS 1.105+ uyumlu)
Cesium.Cesium3DTileset.fromUrl("../Scene/merinos1.json", {
	maximumScreenSpaceError: 2,
	dynamicScreenSpaceError: true,
	cullWithChildrenBounds: true
}).then(function (loadedTileset) {
	tileset = loadedTileset;
	viewer.scene.primitives.add(tileset);
	viewer.zoomTo(tileset);
	// Mobilde performans ayarı — tile kalitesini düşür
	if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
		tileset.maximumScreenSpaceError = 6;
	}
	// Tileset hazır olduğunda splash screen event'lerini başlat
	initSplashProgress(tileset);
}).catch(function (err) {
	console.error('3D Tileset yüklenemedi:', err);
	// Splash screen'i hata ile kapat
	var statusText = document.getElementById('splashStatusText');
	if (statusText) statusText.textContent = window.AppMessages.SPLASH_LOAD_FAILED || 'Model yüklenemedi!';
	var splash = document.getElementById('splashScreen');
	if (splash) {
		setTimeout(function () {
			splash.style.opacity = '0';
			setTimeout(function () { splash.remove(); }, 1000);
		}, 2000);
	}
});

// ─── SPLASH SCREEN: Gerçek tileset yükleme progress'i ───
function initSplashProgress(ts) {
	var splash = document.getElementById('splashScreen');
	if (!splash) return;

	var progressBar = document.getElementById('splashProgressBar');
	var percentText = document.getElementById('splashPercent');
	var statusText = document.getElementById('splashStatusText');
	var startTime = Date.now();
	var MIN_SHOW = 3000;   // Min 3sn göster (fontlar + ikonlar yüklensin)
	var MAX_SHOW = 15000;  // Max 15sn (yüklenmese bile kapat)
	var dismissed = false;
	var modelReady = false;
	var fontsReady = false;
	var currentPercent = 5;

	function updateProgress(pct) {
		currentPercent = Math.min(Math.max(pct, currentPercent), 100);
		if (progressBar) progressBar.style.width = currentPercent + '%';
		if (percentText) percentText.textContent = Math.round(currentPercent) + '%';
	}

	function dismiss() {
		if (dismissed) return;
		dismissed = true;
		updateProgress(100);
		if (statusText) statusText.textContent = window.AppMessages.SPLASH_LOAD_READY || 'Hazır!';
		setTimeout(function () {
			splash.style.opacity = '0';
			setTimeout(function () {
				splash.remove();
				// Splash bitti — yardım modalı açılabilir
				document.dispatchEvent(new CustomEvent('splashDismissed'));
			}, 1000);
		}, 300);
	}

	function tryDismiss() {
		if (dismissed) return;
		var elapsed = Date.now() - startTime;
		if (modelReady && fontsReady && elapsed >= MIN_SHOW) dismiss();
	}

	// ─── Site tam hazırlık kontrolü (fontlar + ikonlar + CSS) ───
	var _windowLoaded = false;
	var _iconsRendered = false;

	// 1) window.onload → Tüm harici kaynaklar (CSS, fontlar, resimler) indirildi
	window.addEventListener('load', function () {
		_windowLoaded = true;
		checkAllReady();
	});

	// 2) Material Symbols ikonlarının gerçekten renderlanıp renderlanmadığını kontrol et
	function checkIconFont() {
		try {
			// 48px boyutunda ikon fontunun yüklenip yüklenmediğini sorgula
			return document.fonts.check('48px "Material Symbols Outlined"');
		} catch (e) { return false; }
	}

	function checkAllReady() {
		if (fontsReady) return; // Zaten hazır
		if (_windowLoaded && checkIconFont()) {
			fontsReady = true;
			if (statusText && !modelReady) statusText.textContent = window.AppMessages.SPLASH_LOAD_UI_READY || 'Arayüz hazır, model bekleniyor...';
			tryDismiss();
		}
	}

	// Her 200ms'de ikon fontunu kontrol et (window.load yetersiz kalabilir)
	var _fontPollTimer = setInterval(function () {
		checkAllReady();
		if (fontsReady) clearInterval(_fontPollTimer);
	}, 200);

	// Fallback: 8sn içinde yüklenmezse hazır say (takılmayı önle)
	setTimeout(function () {
		if (!fontsReady) {
			fontsReady = true;
			tryDismiss();
		}
		clearInterval(_fontPollTimer);
	}, 8000);

	// fromUrl ile yüklenen tileset zaten hazır — ilerlemeyi %50'ye al
	updateProgress(50);
	if (statusText) statusText.textContent = window.AppMessages.SPLASH_LOAD_DETAILS || 'Detaylar yükleniyor...';

	// Tileset yüklenme durumunu izle
	var tilesLoaded = 0;
	var tilesTotal = 0;

	ts.tileLoad.addEventListener(function () {
		tilesLoaded++;
		if (tilesTotal > 0) {
			updateProgress(50 + (tilesLoaded / tilesTotal) * 40); // %50-%90 arası
		} else {
			updateProgress(Math.min(50 + tilesLoaded * 5, 85));
		}
	});

	ts.loadProgress.addEventListener(function (pending, processing) {
		tilesTotal = Math.max(tilesTotal, tilesLoaded + pending + processing);
		if (pending === 0 && processing === 0 && tilesLoaded > 0) {
			modelReady = true;
			updateProgress(95);
			if (statusText) statusText.textContent = fontsReady ? (window.AppMessages.SPLASH_LOAD_MODEL_READY || 'Model hazır, açılıyor...') : (window.AppMessages.SPLASH_LOAD_MODEL_WAIT_UI || 'Model hazır, arayüz hazırlanıyor...');
			tryDismiss();
		}
	});

	// Min süre geçtikten sonra tekrar kontrol
	setTimeout(tryDismiss, MIN_SHOW);

	// Max fallback — ne olursa olsun kapat
	setTimeout(dismiss, MAX_SHOW);
}

// SPLASH: RASTGELE 3 KISAYOL İPUCU
document.addEventListener('DOMContentLoaded', function () {
	// (Global _isMob kullanılıyor)

	var container = document.getElementById('splashTips');
	if (!container) return;

	if (_isMob) {
		var tips = [];
		if (window.AppMessages && window.AppMessages.SPLASH_TIPS_MOBILE) {
			tips = window.AppMessages.SPLASH_TIPS_MOBILE.slice();
		}
		// Rastgele 3 tane seç (Fisher-Yates shuffle, ilk 3)
		for (var i = tips.length - 1; i > 0; i--) {
			var j = Math.floor(Math.random() * (i + 1));
			var tmp = tips[i]; tips[i] = tips[j]; tips[j] = tmp;
		}
		// Mobilde emoji badge stili
		for (var k = 0; k < Math.min(3, tips.length); k++) {
			var div = document.createElement('div');
			div.className = 'flex items-center gap-2';
			div.innerHTML = '<span style="background:rgba(30,41,59,0.8);border:1px solid #334155;color:#94a3b8;font-size:12px;padding:2px 8px;border-radius:9999px;white-space:nowrap;">' + tips[k].key + '</span><span style="color:#cbd5e1;">' + tips[k].text + '</span>';
			container.appendChild(div);
		}
	} else {
		// Masaüstünde kullanıcının istediği sabit, okunaklı, yatay çizgili stil
		container.className = 'flex flex-col items-start gap-3 mb-10 text-[15px] font-medium px-8';
		if (window.AppMessages && window.AppMessages.SPLASH_TIPS_DESKTOP) {
			container.innerHTML = window.AppMessages.SPLASH_TIPS_DESKTOP;
		}
	}
});
document.getElementById('btnHomeView').addEventListener('click', function () {
	if (tileset) viewer.flyTo(tileset);
});

// Cesium fullscreen butonunu gizle — kendi custom butonumuzu kullanıyoruz
var cesiumFsBtn = document.querySelector('.cesium-viewer-fullscreenContainer');
if (cesiumFsBtn) cesiumFsBtn.style.display = 'none';

// Custom Tam Ekran butonu
var btnFullscreen = document.getElementById('btnFullscreen');
if (btnFullscreen) {
	btnFullscreen.onclick = function () {
		if (!document.fullscreenElement) {
			document.documentElement.requestFullscreen().catch(function () { });
		} else {
			document.exitFullscreen();
		}
	};
	document.addEventListener('fullscreenchange', function () {
		btnFullscreen.innerHTML = document.fullscreenElement
			? '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M440-120v-320h80v184l504-504H840v80H656l504 504v-184h80v320H440Z"/></svg>'
			: '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M120-120v-320h80v184l504-504H520v-80h320v320h-80v-184L256-200h184v80H120Z"/></svg>';
		btnFullscreen.title = document.fullscreenElement ? 'Tam Ekrandan Çık' : 'Tam Ekran';
	});
	// Mobilde gizle
	if (_isMob) btnFullscreen.style.display = 'none';
}

// ─── THEME TOGGLE ──────────────────────────────────────────────
var btnThemeToggle = document.getElementById('btnThemeToggle');
var themeIcon = document.getElementById('themeIcon');
// Her zaman açık tema ile başla
document.documentElement.classList.remove('dark');
document.documentElement.classList.add('light');
if (themeIcon) themeIcon.textContent = 'light_mode';
if (btnThemeToggle) {
	btnThemeToggle.addEventListener('click', function () {
		var html = document.documentElement;
		if (html.classList.contains('dark')) {
			html.classList.remove('dark');
			html.classList.add('light');
			themeIcon.textContent = 'light_mode';
			localStorage.setItem('cbs-theme', 'light');
		} else {
			html.classList.remove('light');
			html.classList.add('dark');
			themeIcon.textContent = 'dark_mode';
			localStorage.setItem('cbs-theme', 'dark');
		}
	});
}

// ─── 1.5. PERFORMANS / KALİTE MODLARI ──────────────────────────
var btnPerformance = document.getElementById('btnPerformance');
var btnQuality = document.getElementById('btnQuality');

if (btnPerformance && btnQuality) {
	// Başlangıçta Kalite modu aktif
	btnQuality.className = "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors bg-primary/20 text-primary";

	btnPerformance.addEventListener('click', function () {
		btnPerformance.className = "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors bg-primary/20 text-primary";
		btnQuality.className = "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors text-slate-400 hover:text-slate-200";
		viewer.scene.postProcessStages.fxaa.enabled = false;
		viewer.scene.fog.enabled = false;
		if (tileset) tileset.maximumScreenSpaceError = 16;
		viewer.scene.requestRender();
	});

	btnQuality.addEventListener('click', function () {
		btnQuality.className = "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors bg-primary/20 text-primary";
		btnPerformance.className = "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors text-slate-400 hover:text-slate-200";
		viewer.scene.postProcessStages.fxaa.enabled = true;
		viewer.scene.fog.enabled = true;
		if (tileset) tileset.maximumScreenSpaceError = 1;
		viewer.scene.requestRender();
	});
}

// ═══ ARKA PLAN FPS İZLEME + AKILLI BİLDİRİM ═══
(function () {
	var frameTimes = [];
	var lastFrame = performance.now();
	var avgFPS = 60;
	var lowSince = 0;
	var toastShown = false; // Oturum başına 1 kez göster
	var FPS_THRESHOLD = 15;
	var LOW_DURATION = 5000; // 5 saniye düşük kalırsa uyar

	viewer.scene.postRender.addEventListener(function () {
		var now = performance.now();
		frameTimes.push(now - lastFrame);
		lastFrame = now;
		if (frameTimes.length > 60) frameTimes.shift();
	});

	setInterval(function () {
		if (frameTimes.length < 10 || toastShown) return;
		var sum = 0;
		for (var i = 0; i < frameTimes.length; i++) sum += frameTimes[i];
		avgFPS = Math.round(1000 / (sum / frameTimes.length));

		if (avgFPS < FPS_THRESHOLD) {
			if (lowSince === 0) lowSince = Date.now();
			if (Date.now() - lowSince >= LOW_DURATION) {
				toastShown = true;
				showPerfSuggestion();
			}
		} else {
			lowSince = 0;
		}
	}, 1000);

	function showPerfSuggestion() {
		var toast = document.createElement('div');
		toast.style.cssText = 'position:fixed;bottom:70px;left:60px;transform:translateY(20px);z-index:9999;opacity:0;transition:all 0.4s cubic-bezier(.4,0,.2,1);';
		toast.innerHTML =
			'<div style="display:flex;align-items:center;gap:12px;padding:14px 20px;background:rgba(17,24,39,0.92);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(6,182,212,0.15);border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,0.5);max-width:400px;">' +
			'<div style="width:36px;height:36px;border-radius:10px;background:rgba(6,182,212,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#06b6d4;">'
			+ '<span class="material-symbols-outlined" style="font-size:20px;">speed</span>' +
			'</div>' +
			'<div style="flex:1;">' +
			'<div style="font-family:Inter,sans-serif;font-size:12px;font-weight:600;color:#f1f5f9;margin-bottom:3px;">Performans d\u00fc\u015f\u00fc\u015f\u00fc tespit edildi</div>' +
			'<div style="font-family:Inter,sans-serif;font-size:11px;color:#94a3b8;line-height:1.4;">Daha ak\u0131c\u0131 bir deneyim i\u00e7in <strong style="color:#06b6d4;">Performans</strong> moduna ge\u00e7ebilirsiniz.</div>' +
			'</div>' +
			'<button id="__perfSwitchBtn" style="padding:7px 14px;border-radius:8px;border:1px solid rgba(6,182,212,0.25);background:rgba(6,182,212,0.12);color:#06b6d4;font-family:Inter,sans-serif;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s;">Ge\u00e7</button>' +
			'<button id="__perfDismissBtn" style="padding:4px;border:none;background:transparent;color:#64748b;cursor:pointer;font-size:16px;line-height:1;">\u00d7</button>' +
			'</div>';
		document.body.appendChild(toast);

		// Animate in
		requestAnimationFrame(function () {
			toast.style.opacity = '1';
			toast.style.transform = 'translateY(0)';
		});

		function dismiss() {
			toast.style.opacity = '0';
			toast.style.transform = 'translateY(20px)';
			setTimeout(function () { toast.remove(); }, 400);
		}

		// "Geç" butonu → performans moduna geçir
		document.getElementById('__perfSwitchBtn').addEventListener('click', function () {
			if (btnPerformance) btnPerformance.click();
			dismiss();
		});

		// "×" butonu → kapat
		document.getElementById('__perfDismissBtn').addEventListener('click', dismiss);

		// 30 saniye sonra otomatik kapat
		setTimeout(dismiss, 30000);
	}
})();

// ─── SAĞ PANEL DRAWER TOGGLE ───────────────────────────────────
var _drawerIsOpen = false;
(function () {
	var panel = document.getElementById('dataPanel');
	var btn = document.getElementById('btnDrawerToggle');
	var icon = document.getElementById('drawerToggleIcon');
	var label = document.getElementById('activeGroupLabel');
	if (!panel || !btn) return;

	// Label'ı toggle butonunun üstüne konumla
	function positionLabel(drawerRight) {
		if (!label) return;
		// Toggle butondan hesapla: top = toggle.top - label.height - 8px gap
		var btnRect = btn.getBoundingClientRect();
		label.style.right = drawerRight;
		label.style.bottom = (window.innerHeight - btnRect.top + 8) + 'px';
	}

	function openDrawer() {
		_drawerIsOpen = true;
		panel.style.transform = 'translateX(0)';
		icon.textContent = 'chevron_right';
		btn.style.right = 'calc(320px + 16px)'; // w-80 = 320px + right-4
		if (label) label.style.display = 'none';
		localStorage.setItem('cbs-drawer', 'open');
	}

	function closeDrawer() {
		_drawerIsOpen = false;
		panel.style.transform = 'translateX(calc(100% + 16px))';
		icon.textContent = 'chevron_left';
		btn.style.right = '0';
		if (label) { label.style.display = ''; positionLabel('0'); }
		localStorage.setItem('cbs-drawer', 'closed');
	}

	btn.addEventListener('click', function () {
		if (_drawerIsOpen) closeDrawer();
		else openDrawer();
	});

	// Label'a tıklayınca panel aç
	if (label) {
		label.addEventListener('click', function () {
			openDrawer();
		});
	}

	// Başlangıçta kapalı — label görünür
	positionLabel('0');

	// Pencere boyutu değişince label pozisyonunu güncelle
	window.addEventListener('resize', function () {
		if (!_drawerIsOpen) positionLabel('0');
	});
})();

// ─── SOL ARAÇLAR PANELİ TOGGLE ─────────────────────────────────
var _toolPanelIsOpen = false;
(function () {
	var panel = document.getElementById('toolPanel');
	var btn = document.getElementById('btnToolToggle');
	var icon = document.getElementById('toolToggleIcon');
	if (!panel || !btn) return;

	function openToolPanel() {
		_toolPanelIsOpen = true;
		panel.style.transform = 'translateX(0)';
		icon.textContent = 'chevron_left';
		localStorage.setItem('cbs-toolpanel', 'open');
	}

	function closeToolPanel() {
		_toolPanelIsOpen = false;
		panel.style.transform = 'translateX(calc(-100% + 28px))';
		icon.textContent = 'chevron_right';
		localStorage.setItem('cbs-toolpanel', 'closed');
	}
	// Global erişim (setActiveTool mobilde çağırır)
	window.closeToolPanel = closeToolPanel;
	window.openToolPanel = openToolPanel;

	btn.addEventListener('click', function () {
		if (_toolPanelIsOpen) closeToolPanel();
		else openToolPanel();
	});

	// Başlangıçta açık
	openToolPanel();
})();

// Klavye kısayolları: L → panel, F → tam ekran, H → ana görünüm, 1-4 → Ölçüm araçları
document.addEventListener('keydown', function (e) {
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
	if (e.key === 'l' || e.key === 'L') {
		var btn = document.getElementById('btnDrawerToggle');
		if (btn) btn.click();
	}

	if (e.key === 'h' || e.key === 'H') {
		var homeBtn = document.getElementById('btnHomeView');
		if (homeBtn) homeBtn.click();
	}

	// Sayısal Kısayollar (Ölçüm Araçları)
	if (e.key === '1') {
		var btnPoint = document.getElementById('btnCoord');
		if (btnPoint) btnPoint.click();
	}
	if (e.key === '2') {
		var btnDist = document.getElementById('btnDistance');
		if (btnDist) btnDist.click();
	}
	if (e.key === '3') {
		var btnArea = document.getElementById('btnArea');
		if (btnArea) btnArea.click();
	}
	if (e.key === '4') {
		var btnHeight = document.getElementById('btnHeight');
		if (btnHeight) btnHeight.click();
	}
});

// Aktif grup adını label'da güncelle (renderList ve grup değişikliklerinde çağırılır)
function updateActiveGroupLabel() {
	var labelText = document.getElementById('activeGroupLabelText');
	if (!labelText) return;
	var g = groups.find(function (gr) { return gr.id === activeGroupId; });
	labelText.textContent = g ? g.name : 'Genel';
}

// ─── 1.5.1. 3D DÜNYA (GLOBE TOGGLE) + YÜKSEKLİK OFSETİ ────────────────
var globeVisible = false;
var heightOffsetPanel = document.getElementById('heightOffsetPanel');
var heightSlider = document.getElementById('heightSlider');
var heightInput = document.getElementById('heightInput');
var currentHeightOffset = 0;

// Yükseklik ofsetini tileset'e uygula (modelMatrix ile)
function applyHeightOffset(offset) {
	if (!tileset) return;
	currentHeightOffset = offset;
	// Tileset'in merkez noktasını al
	var center = tileset.boundingSphere.center;
	var cartographic = Cesium.Cartographic.fromCartesian(center);

	// Aynı noktanın yüzey (0m) ve ofset versiyonunu hesapla
	var surface = Cesium.Cartesian3.fromRadians(
		cartographic.longitude, cartographic.latitude, 0.0
	);
	var offsetPos = Cesium.Cartesian3.fromRadians(
		cartographic.longitude, cartographic.latitude, offset
	);

	// İki nokta arasındaki fark = yukarı/aşağı öteleme vektörü
	var translation = Cesium.Cartesian3.subtract(offsetPos, surface, new Cesium.Cartesian3());
	tileset.modelMatrix = Cesium.Matrix4.fromTranslation(translation);
}

// Slider ↔ Input senkronizasyonu
heightSlider.addEventListener('input', function () {
	var val = parseFloat(this.value);
	heightInput.value = val;
	applyHeightOffset(val);
});

heightInput.addEventListener('change', function () {
	var val = parseFloat(this.value) || 0;
	// Slider sınırlarını aşarsa slider'ı güncelleme ama ofseti uygula
	heightSlider.value = Math.max(-500, Math.min(500, val));
	applyHeightOffset(val);
});

// Sıfırlama butonu
document.getElementById('btnHeightReset').addEventListener('click', function () {
	heightSlider.value = 0;
	heightInput.value = 0;
	applyHeightOffset(0);
});

// Katman toggle butonları (Uydu / Sokak)
var btnSatellite = document.getElementById('btnLayerSatellite');
var btnStreet = document.getElementById('btnLayerStreet');

function setLayerBtnActive(btn, isActive) {
	if (isActive) {
		btn.classList.add('border-primary', 'text-primary', 'bg-primary/10');
		btn.classList.remove('border-slate-600', 'text-slate-400');
	} else {
		btn.classList.remove('border-primary', 'text-primary', 'bg-primary/10');
		btn.classList.add('border-slate-600', 'text-slate-400');
	}
}

btnSatellite.addEventListener('click', function () {
	satelliteLayer.show = !satelliteLayer.show;
	setLayerBtnActive(this, satelliteLayer.show);
});

btnStreet.addEventListener('click', function () {
	streetLayer.show = !streetLayer.show;
	setLayerBtnActive(this, streetLayer.show);
});

// ─── NOKTA BULUTU (Point Cloud) KATMANI ─────────────────────────
// TODO: Nokta bulutu verisi hazır olduğunda aşağıdaki kodu aktifleştir
/*
var pointCloudTileset = null;
var pointCloudVisible = false;
var btnPointCloud = document.getElementById('btnLayerPointCloud');

// Nokta bulutu tileset'ini asenkron yükle (başlangıçta gizli)
Cesium.Cesium3DTileset.fromUrl("../pointcloud/gursu/tileset.json", {
	maximumScreenSpaceError: 4,
	dynamicScreenSpaceError: true,
	show: false // Başlangıçta gizli
}).then(function (loadedPCTileset) {
	pointCloudTileset = loadedPCTileset;
	pointCloudTileset.show = false;
	viewer.scene.primitives.add(pointCloudTileset);
	console.log('Nokta bulutu yüklendi (gizli).');
}).catch(function (err) {
	console.warn('Nokta bulutu yüklenemedi:', err);
	if (btnPointCloud) {
		btnPointCloud.disabled = true;
		btnPointCloud.style.opacity = '0.4';
		btnPointCloud.title = 'Nokta bulutu verisi bulunamadı';
	}
});

// Toggle butonu
if (btnPointCloud) {
	btnPointCloud.addEventListener('click', function () {
		if (!pointCloudTileset) return;
		pointCloudVisible = !pointCloudVisible;
		pointCloudTileset.show = pointCloudVisible;
		setLayerBtnActive(this, pointCloudVisible);
		viewer.scene.requestRender();
	});
}
*/

// Globe toggle butonu
document.getElementById('btnGlobeToggle').addEventListener('click', function () {
	globeVisible = !globeVisible;
	viewer.scene.globe.show = globeVisible;

	// Dropdown panelini göster/gizle
	if (globeVisible) {
		heightOffsetPanel.classList.remove('hidden');
	} else {
		heightOffsetPanel.classList.add('hidden');
	}

	// Buton görünümünü güncelle (yazı değişmez, sadece renk)
	if (globeVisible) {
		this.classList.add('border-primary', 'text-primary');
		this.classList.remove('border-slate-700', 'text-slate-300');
	} else {
		this.classList.remove('border-primary', 'text-primary');
		this.classList.add('border-slate-700', 'text-slate-300');
	}
});

// ─── 1.6. GELİŞMİŞ GÖRÜNÜM MODLARI (VIEW MODES) ────────────────
var viewModeBtns = document.querySelectorAll('.view-mode-option');
var currentViewModeIcon = document.getElementById('currentViewModeIcon');
var currentViewModeText = document.getElementById('currentViewModeText');

viewModeBtns.forEach(function (btn) {
	btn.addEventListener('click', function () {
		var mode = this.getAttribute('data-mode');
		var icon = this.querySelector('span').innerText;
		var text = this.innerText.replace(icon, '').trim();

		// Update Dropdown UI
		currentViewModeIcon.innerText = icon;
		currentViewModeText.innerText = text;

		// Reset all custom overrides first
		if (tileset) {
			tileset.customShader = undefined;
			tileset.style = undefined;
			tileset.debugWireframe = false;
		}
		if (viewer.scene.postProcessStages.ambientOcclusion) {
			viewer.scene.postProcessStages.ambientOcclusion.enabled = false;
		}

		// Sahne ortamını varsayılana döndür (Solid mod bunları değiştirir)
		if (viewer.scene.skyBox) viewer.scene.skyBox.show = true;
		if (viewer.scene.sun) viewer.scene.sun.show = true;
		if (viewer.scene.moon) viewer.scene.moon.show = true;
		// NOT: skyAtmosphere başlangıçta kapalı (satır 18), tekrar açmıyoruz
		// NOT: globe.show başlangıçta kapalı (satır 22), tekrar açmıyoruz
		viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 1); // Varsayılan siyah
		viewer.scene.highDynamicRange = true; // HDR varsayılan

		switch (mode) {
			case 'rgb':
				// Varsayılan fotogrametri (RGB) görünüm. Resetlemek yetti.
				break;

			case 'solid':
				// ═══ BLENDER SOLID VIEW YÖNTEMİ ═══
				// Fotogrametri modelleri ince kabuk (thin shell) yapısındadır.
				// Düz renkle boyandığında arka taraftaki koyu gökyüzü geometri arasından sızar.
				// Çözüm: Arka planı model rengiyle aynı yaparak sızmayı görünmez kılmak.

				// 1) Gökyüzü, güneş, ay ve atmosferi gizle — koyu uzay arkaplanını kaldır
				if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
				if (viewer.scene.sun) viewer.scene.sun.show = false;
				if (viewer.scene.moon) viewer.scene.moon.show = false;
				if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
				if (viewer.scene.globe) viewer.scene.globe.showGroundAtmosphere = false;

				// 2) Arka plan rengini modelin gri rengiyle eşle — sızma artık fark edilmez
				viewer.scene.backgroundColor = new Cesium.Color(0.85, 0.85, 0.85, 1.0);

				// 3) HDR tone mapping'i kapat — yoksa arka plan ve shader renkleri
				// farklı işlenir ve eşleşmez (renk kayması olur)
				viewer.scene.highDynamicRange = false;

				// 4) Temel stili %100 OPAK gri renkle sabitliyoruz:
				if (tileset) tileset.style = new Cesium.Cesium3DTileStyle({
					color: "color('#d9d9d9', 1.0)" // Açık gri renk (0.85 ≈ #d9d9d9)
				});

				// 5) UNLIT shader + normal-bazlı gölgeleme
				// SSAO yerine shader içi gölgeleme kullanıyoruz çünkü SSAO
				// derinlik buffer'ından ince geometri kenarlarında koyu gölge oluşturup
				// arka plan ile kontrast yaratıyordu (sızma görünmesine sebep oluyordu).
				if (tileset) tileset.customShader = new Cesium.CustomShader({
					lightingModel: Cesium.LightingModel.UNLIT,
					translucencyMode: Cesium.CustomShaderTranslucencyMode.OPAQUE,
					fragmentShaderText: `
                        void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                            // Yüzey normalini al ve kameraya göre basit gölgeleme yap
                            vec3 normal = fsInput.attributes.normalEC;
                            // Kamera yönü (ekran uzayında Z ekseni)
                            float shade = abs(dot(normalize(normal), vec3(0.0, 0.0, 1.0)));
                            // 0.35 (koyu - yandan bakan) → 0.85 (açık - kameraya bakan, arka planla aynı)
                            float brightness = mix(0.35, 0.85, shade);
                            material.diffuse = vec3(brightness);
                            material.alpha = 1.0;
                        }
                    `
				});

				// Hafif SSAO — düşük yoğunlukta (3) köşelere derinlik verir
				// (yüksek yoğunlukta (10) ince kenar artefaktları oluşturuyordu)
				if (viewer.scene.postProcessStages.ambientOcclusion) {
					viewer.scene.postProcessStages.ambientOcclusion.enabled = true;
					viewer.scene.postProcessStages.ambientOcclusion.uniforms.intensity = 3.0;
					viewer.scene.postProcessStages.ambientOcclusion.uniforms.bias = 0.1;
					viewer.scene.postProcessStages.ambientOcclusion.uniforms.lengthCap = 0.3;
					viewer.scene.postProcessStages.ambientOcclusion.uniforms.stepSize = 1.0;
				}
				break;

		}
	});
});

// Ekran merkezindeki (crosshair) odak noktasını döndürür.
function getCameraFocus() {
	var center = new Cesium.Cartesian2(viewer.canvas.clientWidth / 2, viewer.canvas.clientHeight / 2);
	var ray = viewer.camera.getPickRay(center);
	var target;
	try { target = viewer.scene.pickPosition(center); } catch (e) { /* depth render hatası */ }

	if (!Cesium.defined(target)) {
		target = viewer.scene.globe.pick(ray, viewer.scene);
	}

	if (!Cesium.defined(target)) {
		if (tileset && tileset.boundingSphere) return tileset.boundingSphere.center;
		return viewer.camera.position;
	}
	return target;
}

// Açılar
var cameraAngleBtns = document.querySelectorAll('.camera-angle-btn');
var currentCameraIcon = document.getElementById('currentCameraIcon');
cameraAngleBtns.forEach(function (btn) {
	btn.addEventListener('click', function () {
		var heading = Cesium.Math.toRadians(parseFloat(this.getAttribute('data-heading')));
		var pitch = Cesium.Math.toRadians(parseFloat(this.getAttribute('data-pitch')));

		var focus = getCameraFocus();
		var range = Cesium.Cartesian3.distance(viewer.camera.position, focus);
		if (range < 1 || range > 5000) range = 500; // Makul bir sınır

		var newIcon = this.getAttribute('data-icon');

		if (currentCameraIcon && newIcon) {
			currentCameraIcon.textContent = newIcon;
		}

		viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(focus, 0), {
			offset: new Cesium.HeadingPitchRange(heading, pitch, range),
			duration: 2.0
		});
	});
});

// Projeksiyon (Perspektif / Ortografik)
var isOrthographic = false;
var orthographicFrustum = new Cesium.OrthographicFrustum();
var perspectiveFrustum = new Cesium.PerspectiveFrustum({
	fov: Cesium.Math.toRadians(60.0),
	aspectRatio: viewer.canvas.clientWidth / viewer.canvas.clientHeight
});

var cameraProjBtns = document.querySelectorAll('.camera-proj-btn');
cameraProjBtns.forEach(function (btn) {
	btn.addEventListener('click', function () {
		var proj = this.getAttribute('data-proj');

		// UI Updates
		cameraProjBtns.forEach(b => {
			b.classList.remove('active-proj');
			b.querySelector('.check-icon').classList.add('hidden');
		});
		this.classList.add('active-proj');
		this.querySelector('.check-icon').classList.remove('hidden');

		if (proj === 'orthographic' && !isOrthographic) {
			// Switch to Orthographic
			var focus = getCameraFocus();
			var distance = Cesium.Cartesian3.distance(viewer.camera.position, focus);
			if (distance < 1 || distance > 5000) distance = 500;

			orthographicFrustum.width = distance;
			orthographicFrustum.aspectRatio = perspectiveFrustum.aspectRatio;

			// Mevcut odak noktasına uç ve üstten bakışa geç
			viewer.camera.flyTo({
				destination: focus,
				orientation: {
					heading: 0,
					pitch: Cesium.Math.toRadians(-90),
					roll: 0
				},
				offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), distance),
				duration: 1.0,
				complete: function () {
					viewer.camera.frustum = orthographicFrustum;
					isOrthographic = true;
					viewer.scene.screenSpaceCameraController.enableTilt = false;
				}
			});
		} else if (proj === 'perspective' && isOrthographic) {
			// Switch to Perspective
			viewer.camera.frustum = perspectiveFrustum;
			isOrthographic = false;
			viewer.scene.screenSpaceCameraController.enableTilt = true;
		}
	});
});

// Ortografik modda akıcı zoom için wheel düzeltmesi
viewer.scene.canvas.addEventListener('wheel', function (e) {
	if (isOrthographic) {
		var direction = e.deltaY > 0 ? 1 : -1;
		var zoomAmount = orthographicFrustum.width * 0.1 * direction * zoomSensitivity;
		orthographicFrustum.width += zoomAmount;
		// Zoom limitleri (çok uzaklaşma veya ters dönmeyi önle)
		if (orthographicFrustum.width < 10.0) orthographicFrustum.width = 10.0;
		if (orthographicFrustum.width > 10000.0) orthographicFrustum.width = 10000.0;
	}
}, { passive: true });


// ─── 2. KATMANLAR ──────────────────────────────────────────────
// (Katmanlar Kullanıcı İsteği İle Kaldırıldı)

// Dosya Yükleme Öncesi CRS ve Kapsam Kontrolü
function requireCrsSelection() {
	var crsSelect = document.getElementById('exportCrs');
	var scopeSelect = document.getElementById('exportScope');
	var missing = [];

	if (!crsSelect.value || crsSelect.value === "") missing.push(crsSelect);
	if (scopeSelect && (!scopeSelect.value || scopeSelect.value === "")) missing.push(scopeSelect);

	if (missing.length > 0) {
		missing.forEach(function (el) {
			el.classList.remove('animate-shake', 'border-red-500', 'text-red-500');
			void el.offsetWidth;
			el.classList.add('animate-shake', 'border-red-500', 'text-red-500');
			setTimeout(function () {
				el.classList.remove('animate-shake', 'border-red-500', 'text-red-500');
			}, 400);
		});

		var msg = missing.length === 2
			? 'Koordinat Sistemi ve Aktarım Kapsamı seçmelisiniz!'
			: (!crsSelect.value ? 'Koordinat Sistemi (EPSG) seçmelisiniz!' : 'Aktarım Kapsamı seçmelisiniz!');
		document.querySelector('#resultDisplay > div').innerHTML = '<span class="text-red-400 font-bold text-[11px]">' + msg + '</span>';
		return false;
	}
	return true;
}

// Aktarım kapsam filtreleme yardımcısı
function getExportMeasurements() {
	var scope = document.getElementById('exportScope').value;
	if (scope === 'active') {
		return measurements.filter(function (m) { return m.checked && m.groupId === activeGroupId; });
	}
	return measurements.filter(function (m) { return m.checked; });
}

// Ölçümün ait olduğu grup adını döndür
function getGroupName(groupId) {
	var group = groups.find(function (g) { return g.id === groupId; });
	return group ? group.name : 'Genel';
}

// Grup adından groupId bul (import sırasında kullanılır)
function findGroupByName(name) {
	if (!name) return activeGroupId;
	var normalized = name.trim().toUpperCase();
	var group = groups.find(function (g) { return g.name.trim().toUpperCase() === normalized; });
	return group ? group.id : activeGroupId;
}

function getClosestPointOnSegment(p, a, b) {
	var v = Cesium.Cartesian2.subtract(b, a, new Cesium.Cartesian2());
	var w = Cesium.Cartesian2.subtract(p, a, new Cesium.Cartesian2());
	var t = Cesium.Cartesian2.dot(w, v) / Cesium.Cartesian2.magnitudeSquared(v);
	t = Math.max(0, Math.min(1, t));
	return Cesium.Cartesian2.add(a, Cesium.Cartesian2.multiplyByScalar(v, t, new Cesium.Cartesian2()), new Cesium.Cartesian2());
}

// ─── 3. LABEL YARDIMCILARI ─────────────────────────────────────
// (Aktif tanımlar: loadFromStorage sonrası, satır ~985+)

// ─── 4. ÖLÇÜM VERİ YAPISI & YEREL DEPOLAMA (LOCALSTORAGE) ───
var measurements = [];
var groups = [{ id: 0, name: 'Genel', isOpen: false, checked: true, color: '#14B8A6' }];

// ─── 8 SABİT RENK PALETİ ───
var COLOR_PALETTE = [
	{ hex: '#EF4444', name: 'Kırmızı' },
	{ hex: '#3B82F6', name: 'Mavi' },
	{ hex: '#22C55E', name: 'Yeşil' },
	{ hex: '#F97316', name: 'Turuncu' },
	{ hex: '#A855F7', name: 'Mor' },
	{ hex: '#14B8A6', name: 'Teal' },
	{ hex: '#EC4899', name: 'Pembe' },
	{ hex: '#EAB308', name: 'Sarı' }
];
var measureCount = 0;
var groupCount = 0;
var activeGroupId = 0;
var activeHighlightId = null;

var STORAGE_KEY = "merinos_measurements";

function saveToStorage() {
	try {
		var dataToSave = {
			groups: groups.map(function (g) {
				return { id: g.id, name: g.name, isOpen: g.isOpen, checked: g.checked, color: g.color || '#14B8A6' };
			}),
			measurements: measurements.map(function (m) {
				return {
					id: m.id,
					groupId: m.groupId || 0,
					name: m.name,
					type: m.type,
					resultText: m.resultText,
					checked: m.checked,
					points: m.points.map(function (p) {
						var carto = Cesium.Cartographic.fromCartesian(p);
						return { lat: Cesium.Math.toDegrees(carto.latitude), lon: Cesium.Math.toDegrees(carto.longitude), height: carto.height };
					})
				};
			}),
			activeGroupId: activeGroupId
		};
		var json = JSON.stringify(dataToSave);
		var sizeBytes = json.length;
		var sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
		var pct = Math.min(100, Math.round((sizeBytes / (5 * 1024 * 1024)) * 100));

		// ─── 4MB UYARI (sarı toast) ───
		if (sizeBytes > 4 * 1024 * 1024 && !window._storageWarnShown) {
			window._storageWarnShown = true;
			showStorageToast(
				'⚠️ Depolama Alanı %' + pct + ' Dolu (' + sizeMB + ' MB)',
				'Verilerinizi kaybetmemek için dışa aktarın (GeoJSON/CSV/DXF).',
				'warning'
			);
		}

		localStorage.setItem(STORAGE_KEY, json);
	} catch (e) {
		console.error('localStorage kayıt hatası:', e);
		// ─── 5MB DOLU (kırmızı engelleme) ───
		if (e.name === 'QuotaExceededError' || e.code === 22) {
			showStorageToast(
				'🚨 Depolama Alanı Tamamen Dolu!',
				'Yeni veriler artık KAYDEDİLEMİYOR. Sayfayı yenilediğinizde son ölçümleriniz kaybolacak.\n\n→ Verilerinizi hemen dışa aktarın (GeoJSON/CSV/DXF)\n→ Ardından "Tümünü Sil" ile alanı temizleyin.',
				'critical'
			);
		}
	}
}

// ─── DEPOLAMA UYARI TOAST SİSTEMİ ───
function showStorageToast(title, message, level) {
	// Varsa önceki uyarıyı kaldır
	var existing = document.getElementById('storageWarningToast');
	if (existing) existing.remove();

	var isCritical = (level === 'critical');
	var bgColor = isCritical ? 'rgba(220,38,38,0.95)' : 'rgba(217,119,6,0.95)';
	var borderColor = isCritical ? '#fca5a5' : '#fbbf24';
	var icon = isCritical ? '🚨' : '⚠️';

	var overlay = document.createElement('div');
	overlay.id = 'storageWarningToast';
	overlay.style.cssText = [
		'position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999',
		'display:flex;align-items:center;justify-content:center',
		'background:rgba(0,0,0,' + (isCritical ? '0.7' : '0.4') + ')',
		'backdrop-filter:blur(4px);animation:fadeIn 0.3s ease'
	].join(';');

	var box = document.createElement('div');
	box.style.cssText = [
		'background:' + bgColor,
		'border:2px solid ' + borderColor,
		'border-radius:16px;padding:24px 28px;max-width:420px;width:90vw',
		'box-shadow:0 20px 60px rgba(0,0,0,0.5)',
		'text-align:center;color:white;font-family:system-ui,sans-serif'
	].join(';');

	var h = document.createElement('div');
	h.style.cssText = 'font-size:16px;font-weight:800;margin-bottom:12px;letter-spacing:0.3px;';
	h.textContent = title;

	var p = document.createElement('div');
	p.style.cssText = 'font-size:12px;line-height:1.6;opacity:0.95;white-space:pre-line;margin-bottom:16px;';
	p.textContent = message;

	var btn = document.createElement('button');
	btn.textContent = isCritical ? 'Anladım, Hemen Dışa Aktaracağım' : 'Tamam, Anladım';
	btn.style.cssText = [
		'padding:10px 24px;border-radius:8px;border:2px solid rgba(255,255,255,0.4)',
		'background:rgba(255,255,255,0.15);color:white',
		'font-size:12px;font-weight:700;cursor:pointer',
		'transition:all 0.2s'
	].join(';');
	btn.onmouseenter = function () { this.style.background = 'rgba(255,255,255,0.3)'; };
	btn.onmouseleave = function () { this.style.background = 'rgba(255,255,255,0.15)'; };
	btn.onclick = function () { overlay.remove(); };

	box.appendChild(h);
	box.appendChild(p);
	box.appendChild(btn);
	overlay.appendChild(box);
	document.body.appendChild(overlay);
}

// Debounced kayıt — 500ms içinde tekrar çağrılırsa öncekini iptal eder
var _saveTimer = null;
function debouncedSave() {
	if (_saveTimer) clearTimeout(_saveTimer);
	_saveTimer = setTimeout(saveToStorage, 500);
}

function loadFromStorage() {
	var saved = localStorage.getItem(STORAGE_KEY);
	if (!saved) return;
	try {
		var data = JSON.parse(saved);

		// Handle legacy format (array vs object)
		var savedGroups = Array.isArray(data) ? [] : (data.groups || []);
		var savedMeasures = Array.isArray(data) ? data : (data.measurements || []);
		activeGroupId = data.activeGroupId !== undefined ? data.activeGroupId : 0;

		if (savedGroups.length > 0) {
			groups = savedGroups;
			groups.forEach(function (g) {
				g.isOpen = false; // Always start collapsed
				if (g.id > groupCount) groupCount = g.id;
				if (!g.color) g.color = '#14B8A6'; // Eski kayıtlar için varsayılan renk
			});
		}

		savedMeasures.forEach(function (m) {
			try {
				var cartesianPoints = m.points.map(function (p) {
					return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height);
				});

				var restoredMeasurement = {
					id: m.id,
					groupId: m.groupId !== undefined ? m.groupId : 0,
					name: m.name,
					type: m.type,
					resultText: m.resultText,
					checked: m.checked,
					points: cartesianPoints,
					entities: []
				};

				if (m.type === 'line') restoreLine(restoredMeasurement);
				else if (m.type === 'polygon') restorePolygon(restoredMeasurement);
				else if (m.type === 'height') restoreHeight(restoredMeasurement);
				else if (m.type === 'coord') restoreCoord(restoredMeasurement);

				if (!m.checked) {
					restoredMeasurement.entities.forEach(function (e) { e.show = false; if (e.label) e.label.show = false; });
				}

				measurements.push(restoredMeasurement);
				if (m.id > measureCount) measureCount = m.id;
			} catch (restoreErr) {
				console.warn('Ölçüm geri yüklenemedi (id=' + m.id + ', tip=' + m.type + '):', restoreErr);
			}
		});
		renderList();
	} catch (e) {
		console.error("Ölçümler geri yüklenirken hata:", e);
	}
}

// ─── YARDIMCI ETİKET & GEOMETRİ FONKSİYONLARI ───────────────
// ─── ANTİ-JİTTER PİVOT PATTERN (GeoNexus Pattern 272) ───────
// GPU float32 hassasiyet sorunu: ECEF koordinatları (~4M metre) GPU'da titrer
// Çözüm: İlk noktayı pivot yapıp tüm vertex'leri lokal ofset olarak gönder
// modelMatrix ile mutlak pozisyon CPU'da hesaplanır (double precision)
var ENTITY_HEIGHT_OFFSET = 0.02; // metre — Z-fighting önleyici fakat YÜKSEK HASSASİYETLİ min. eşik (Hassasiyet 1. Öncelik)

// Global Primitive Koleksiyonları (Performans ve Stabilite için)
var globalPointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
var globalLabelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());

function liftPosition(cartesian) {
	if (!cartesian) return cartesian;
	var carto = Cesium.Cartographic.fromCartesian(cartesian);
	carto.height += ENTITY_HEIGHT_OFFSET;
	return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height);
}

// ── Stable Polyline: Primitive API + modelMatrix (ANTİ-JİTTER) ──
function createStablePolyline(positions, width, material, depthFailColor, isDash) {
	if (!positions || positions.length < 2) return null;
	var pivot = positions[0];
	// ENU (East-North-Up) dönüşüm matrisi — pivot noktasına göre yerel çerçeve
	var enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pivot);
	var invEnuMatrix = Cesium.Matrix4.inverse(enuMatrix, new Cesium.Matrix4());
	// Pozisyonları lokal koordinatlara çevir (küçük sayılar: -10 ~ +10m)
	var localPositions = positions.map(function (p) {
		var local = Cesium.Matrix4.multiplyByPoint(invEnuMatrix, p, new Cesium.Cartesian3());
		// Z-fighting ofseti yukarı
		local.z += ENTITY_HEIGHT_OFFSET;
		return local;
	});
	try {
		var geometryInstances = new Cesium.GeometryInstance({
			geometry: new Cesium.PolylineGeometry({
				positions: localPositions,
				width: width || 3,
				arcType: Cesium.ArcType.NONE, // Eğri hesaplaması kapalı — performans
				vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
			})
		});

		var appearance;
		if (isDash) {
			appearance = new Cesium.PolylineMaterialAppearance({
				material: Cesium.Material.fromType('PolylineDash', {
					color: material || Cesium.Color.YELLOW,
					dashLength: VEC_STYLE.height.dashLength,
					gapColor: Cesium.Color.TRANSPARENT
				})
			});
		} else {
			appearance = new Cesium.PolylineMaterialAppearance({
				material: Cesium.Material.fromType('Color', {
					color: material || Cesium.Color.YELLOW
				})
			});
		}

		var primitive = viewer.scene.primitives.add(new Cesium.Primitive({
			geometryInstances: geometryInstances,
			appearance: appearance,
			modelMatrix: enuMatrix, // CPU double-precision ile mutlak pozisyon
			asynchronous: false,
			allowPicking: false
		}));
		return primitive;
	} catch (e) {
		console.warn('Polyline oluşturulamadı (geçersiz geometri):', e);
		return null;
	}
}

// Stable polygon: yerel koordinatlarla (Anti-Jitter Pivot)
function createStablePolygon(positions, material) {
	if (!positions || positions.length < 3) return null;
	var pivot = positions[0];
	var enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pivot);
	var invEnuMatrix = Cesium.Matrix4.inverse(enuMatrix, new Cesium.Matrix4());
	var localPositions = positions.map(function (p) {
		var local = Cesium.Matrix4.multiplyByPoint(invEnuMatrix, p, new Cesium.Cartesian3());
		local.z += ENTITY_HEIGHT_OFFSET;
		return local;
	});

	try {
		var geometryInstances = new Cesium.GeometryInstance({
			geometry: new Cesium.CoplanarPolygonGeometry({
				polygonHierarchy: new Cesium.PolygonHierarchy(localPositions),
				vertexFormat: Cesium.MaterialAppearance.MaterialSupport.BASIC.vertexFormat
			})
		});
		var primitive = viewer.scene.primitives.add(new Cesium.Primitive({
			geometryInstances: geometryInstances,
			appearance: new Cesium.MaterialAppearance({
				material: Cesium.Material.fromType('Color', {
					color: material || Cesium.Color.AQUA.withAlpha(0.3)
				}),
				faceForward: true
			}),
			modelMatrix: enuMatrix,
			asynchronous: false,
			allowPicking: false
		}));
		primitive._isPolygonFill = true;
		return primitive;
	} catch (e) {
		console.warn('Poligon oluşturulamadı (geçersiz geometri):', e);
		return null;
	}
}

function createStablePoint(position, color) {
	var pivot = liftPosition(position);
	var enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pivot);
	var pointCollection = new Cesium.PointPrimitiveCollection({ modelMatrix: enuMatrix });
	var point = pointCollection.add({
		position: Cesium.Cartesian3.ZERO,
		pixelSize: VEC_STYLE.point.size,
		color: color || Cesium.Color.WHITE,
		outlineColor: VEC_STYLE.point.outlineColor,
		outlineWidth: VEC_STYLE.point.outline
	});
	var pointPrimitive = viewer.scene.primitives.add(pointCollection);
	pointPrimitive.id = pointPrimitive;
	point.id = pointPrimitive;
	return pointPrimitive;
}

// Evrensel silme: Entity VEYA Primitive VEYA Collection Item
function safeRemoveItem(item) {
	if (!item) return;
	try {
		// 1) Entity
		if (item.entityCollection) {
			if (drawLayer.entities.contains(item)) {
				drawLayer.entities.remove(item);
			}
			return;
		}

		// 2) Eğer içeride "label" objesi (bağlı olduğu primitive) varsa onu sil
		if (item.label) {
			safeRemoveItem(item.label);
		}

		// 3) Collection'ın Kendisini Silme (Jitter Fix v3: Her noktanın kendi koleksiyonu var)
		if (item.collection && item.collection._primitives) {
			if (viewer.scene.primitives.contains(item.collection)) {
				viewer.scene.primitives.remove(item.collection);
			}
			return;
		}

		// 4) Primitive (Collection)
		if (viewer.scene.primitives.contains(item)) {
			viewer.scene.primitives.remove(item);
		}
	} catch (e) {
		console.warn('safeRemoveItem hatası (görmezden geliniyor):', e);
	}
}

// Global koleksiyonlar mobil jitter sorunu yaratıyor (koordinatlar ECEF kaldığı için)
// Bu nedenle artık kullanılmıyor, yerine modelMatrix'li bireysel Primitive'ler eklendi

function addPointLabel(position, labelValue, colorStr) {
	var pivot = liftPosition(position);
	var enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pivot);

	var pointColor = colorStr ? Cesium.Color.fromCssColorString(colorStr) : Cesium.Color.WHITE;

	// Nokta koleksiyonu - Lokal orijin
	var pointCollection = new Cesium.PointPrimitiveCollection({ modelMatrix: enuMatrix });
	var point = pointCollection.add({
		position: Cesium.Cartesian3.ZERO,
		pixelSize: VEC_STYLE.point.size,
		color: pointColor,
		outlineColor: VEC_STYLE.point.outlineColor,
		outlineWidth: VEC_STYLE.point.outline
	});
	var pointPrimitive = viewer.scene.primitives.add(pointCollection);
	pointPrimitive.id = pointPrimitive;
	point.id = pointPrimitive;

	// Numara Etiketi (Primitive)
	if (labelValue !== undefined && labelValue !== null) {
		var labelCollection = new Cesium.LabelCollection({ modelMatrix: enuMatrix });
		var label = labelCollection.add({
			position: Cesium.Cartesian3.ZERO,
			text: labelValue.toString(),
			font: 'bold 12px sans-serif',
			fillColor: Cesium.Color.WHITE,
			outlineColor: Cesium.Color.BLACK,
			outlineWidth: 3,
			style: Cesium.LabelStyle.FILL_AND_OUTLINE,
			verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
			pixelOffset: new Cesium.Cartesian2(0, -10),
			distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 150.0), // Kullanıcı isteği: 150m'de kaybolsun
			showBackground: true,
			backgroundColor: new Cesium.Color(0, 0, 0, 0.6)
		});
		var labelPrimitive = viewer.scene.primitives.add(labelCollection);
		pointPrimitive.label = labelPrimitive; // safeRemoveItem için bağla
	}

	viewer.scene.requestRender();
	return pointPrimitive;
}

function addLabel(position, text, color) {
	var pivot = liftPosition(position);
	var enuMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pivot);

	var labelCollection = new Cesium.LabelCollection({ modelMatrix: enuMatrix });
	var label = labelCollection.add({
		position: Cesium.Cartesian3.ZERO,
		text: text,
		font: VEC_STYLE.label.font,
		fillColor: color || Cesium.Color.WHITE,
		outlineColor: VEC_STYLE.label.outlineColor,
		outlineWidth: VEC_STYLE.label.outlineWidth,
		style: Cesium.LabelStyle.FILL_AND_OUTLINE,
		verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
		pixelOffset: new Cesium.Cartesian2(0, VEC_STYLE.label.offsetY),
		distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 150.0), // Mesafe, Alan gibi genel etiketler de 150m'de kaybolsun
		showBackground: true,
		backgroundColor: new Cesium.Color(0, 0, 0, 0.6)
	});

	var labelPrimitive = viewer.scene.primitives.add(labelCollection);
	labelPrimitive.id = labelPrimitive;

	viewer.scene.requestRender();
	return labelPrimitive;
}

function midpoint(a, b) {
	return Cesium.Cartesian3.midpoint(a, b, new Cesium.Cartesian3());
}

function centroid(points) {
	var x = 0, y = 0, z = 0;
	for (var i = 0; i < points.length; i++) {
		x += points[i].x;
		y += points[i].y;
		z += points[i].z;
	}
	var n = points.length;
	return new Cesium.Cartesian3(x / n, y / n, z / n);
}

// Geri yükleme çizim yardımcıları
// Çizgi üzerindeki orta noktayı bul (toplam uzunluğun yarısındaki nokta)
function midpointAlongLine(pts) {
	if (pts.length < 2) return pts[0];
	var totalLen = 0;
	for (var i = 0; i < pts.length - 1; i++) {
		totalLen += Cesium.Cartesian3.distance(pts[i], pts[i + 1]);
	}
	var halfLen = totalLen / 2;
	var accumulated = 0;
	for (var j = 0; j < pts.length - 1; j++) {
		var segLen = Cesium.Cartesian3.distance(pts[j], pts[j + 1]);
		if (accumulated + segLen >= halfLen) {
			var t = (halfLen - accumulated) / segLen;
			return Cesium.Cartesian3.lerp(pts[j], pts[j + 1], t, new Cesium.Cartesian3());
		}
		accumulated += segLen;
	}
	return pts[pts.length - 1];
}

function restoreLine(m) {
	if (!m.points || m.points.length < 2) { console.warn('restoreLine: yetersiz nokta (id=' + m.id + ')'); return; }
	var grp = groups.find(function (g) { return g.id === m.groupId; });
	var lineColor = Cesium.Color.fromCssColorString(grp && grp.color ? grp.color : '#EAB308');
	var n = m.points.length;
	for (var i = 0; i < n; i++) {
		m.entities.push(addPointLabel(m.points[i], null, grp && grp.color ? grp.color : '#EAB308'));
		if (i < n - 1) {
			var seg = createStablePolyline([m.points[i], m.points[i + 1]], VEC_STYLE.line.width, lineColor);
			if (seg) m.entities.push(seg);
		}
	}
	// Toplam mesafe etiketi — çizgi üzerindeki orta noktaya
	if (!_isMob) {
		m.entities.push(addLabel(midpointAlongLine(m.points), m.resultText, lineColor));
	}
}

function restorePolygon(m) {
	if (!m.points || m.points.length < 3) { console.warn('restorePolygon: yetersiz nokta (id=' + m.id + ')'); return; }
	var grp = groups.find(function (g) { return g.id === m.groupId; });
	var polyColor = Cesium.Color.fromCssColorString(grp && grp.color ? grp.color : '#14B8A6');
	var n = m.points.length;
	for (var i = 0; i < n; i++) {
		m.entities.push(addPointLabel(m.points[i], null, grp && grp.color ? grp.color : '#14B8A6'));
		if (i < n - 1) {
			var seg = createStablePolyline([m.points[i], m.points[i + 1]], VEC_STYLE.polygon.edgeWidth, polyColor);
			if (seg) m.entities.push(seg);
		}
	}
	// Kapanış çizgisi
	var closeSeg = createStablePolyline([m.points[n - 1], m.points[0]], VEC_STYLE.polygon.edgeWidth, polyColor);
	if (closeSeg) m.entities.push(closeSeg);

	// Poligon alanı — Primitive API (anti-jitter)
	var polyPrim = createStablePolygon(m.points.slice(), polyColor.withAlpha(VEC_STYLE.polygon.fillAlpha));
	if (polyPrim) m.entities.push(polyPrim);

	// Etiket (haritada 2D m² göster)
	var labelText = m.resultText;
	var match2D = m.resultText.match(/2D:\s*([\d.]+)\s*m²/);
	if (match2D) labelText = '2D: ' + match2D[1] + ' m²';
	m.entities.push(addLabel(centroid(m.points), labelText, polyColor));
}

function restoreHeight(m) {
	if (!m.points || m.points.length < 2) { console.warn('restoreHeight: yetersiz nokta (id=' + m.id + ')'); return; }
	var grp = groups.find(function (g) { return g.id === m.groupId; });
	var hexColor = grp && grp.color ? grp.color : '#22C55E';
	var hColor = Cesium.Color.fromCssColorString(hexColor);

	// Geriye uyumluluk: eski 2 noktalı [P1, P2] veya yeni 3 noktalı [P1, pMid, P2]
	var p1 = m.points[0];
	var p2 = m.points.length === 3 ? m.points[2] : m.points[1];
	var pMid;
	if (m.points.length === 3) {
		pMid = m.points[1];
	} else {
		var c1 = Cesium.Cartographic.fromCartesian(p1);
		var c2 = Cesium.Cartographic.fromCartesian(p2);
		pMid = Cesium.Cartesian3.fromRadians(c2.longitude, c2.latitude, c1.height);
		// Eski formatı yeni formata güncelle (bir sonraki save'de kalıcı olur)
		m.points = [p1, pMid, p2];
	}

	m.entities.push(addPointLabel(p1, 1, hexColor));
	m.entities.push(addPointLabel(p2, 2, hexColor));

	// P_mid noktası (3. nokta)
	m.entities.push(drawLayer.entities.add({
		position: pMid,
		point: { pixelSize: VEC_STYLE.height.midPointSize, color: hColor, outlineColor: VEC_STYLE.point.outlineColor, outlineWidth: VEC_STYLE.point.outline, disableDepthTestDistance: Number.POSITIVE_INFINITY }
	}));

	// Yatay çizgi (P1 → P_mid)
	var hSegH = createStablePolyline([p1, pMid], VEC_STYLE.height.horizontalWidth, hColor);
	if (hSegH) m.entities.push(hSegH);

	// Dikey çizgi (P_mid → P2) — kesikli
	var vertColor = hColor.withAlpha(VEC_STYLE.height.verticalAlpha);
	var hSegV = createStablePolyline([pMid, p2], VEC_STYLE.height.verticalWidth, vertColor, null, true);
	if (hSegV) m.entities.push(hSegV);

	// Yatay mesafe etiketi
	var distH = Cesium.Cartesian3.distance(p1, pMid);
	m.entities.push(addLabel(midpoint(p1, pMid), '↔ ' + distH.toFixed(2) + ' m', hColor));

	// Etiket dikey çizginin ortasına
	m.entities.push(addLabel(midpoint(pMid, p2), m.resultText, hColor));
}

function restoreCoord(m) {
	var grp = groups.find(function (g) { return g.id === m.groupId; });
	var pName = m.name ? m.name.toString().replace('Nokta ', '') : '1';
	m.entities.push(addPointLabel(m.points[0], pName, grp && grp.color ? grp.color : '#14B8A6'));
}

// Başlangıçta kayıtlı verileri yükle
setTimeout(loadFromStorage, 1000);

// Sayfa açılışında CRS ve Kapsam seçicilerini boşa al (tarayıcı önbelleğini sıfırla)
setTimeout(function () {
	var crsEl = document.getElementById('exportCrs');
	var scopeEl = document.getElementById('exportScope');
	if (crsEl) crsEl.selectedIndex = 0;
	if (scopeEl) scopeEl.selectedIndex = 0;
}, 100);

// ─── RENK PALETİ POPUP & GRUP RENGİ UYGULAMA ──────────────────
var _colorPopup = null; // Açık popup referansı

function showColorPalette(group, anchorEl) {
	// Varsa önceki popup'u kapat
	if (_colorPopup) { _colorPopup.remove(); _colorPopup = null; }

	var popup = document.createElement('div');
	_colorPopup = popup;
	popup.style.cssText = 'position:fixed;z-index:10000;padding:12px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.5);min-width:180px;';
	popup.style.background = 'var(--surface-card, rgba(15,23,42,0.95))';
	popup.style.border = '1px solid var(--border-subtle, rgba(100,116,139,0.2))';
	popup.style.backdropFilter = 'blur(16px)';

	// Başlık
	var title = document.createElement('div');
	title.style.cssText = 'font-size:11px;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em;';
	title.style.color = 'var(--text-secondary, #94a3b8)';
	title.innerText = 'Katman Rengi';
	popup.appendChild(title);

	// Renk grid'i (2 satır × 4 sütun)
	var grid = document.createElement('div');
	grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;';

	var selectedColor = group.color || '#14B8A6';

	COLOR_PALETTE.forEach(function (c) {
		var swatch = document.createElement('button');
		var isSelected = c.hex.toUpperCase() === selectedColor.toUpperCase();
		swatch.style.cssText = 'width:32px;height:32px;border-radius:50%;border:2px solid ' + (isSelected ? '#fff' : 'transparent') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.15s;background:' + c.hex + ';';
		swatch.title = c.name;
		if (isSelected) {
			swatch.innerHTML = '<span style="color:#fff;font-size:14px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.5);">✓</span>';
		}
		swatch.onmouseenter = function () {
			this.style.transform = 'scale(1.15)';
			this.style.boxShadow = '0 0 12px ' + c.hex + '66';
		};
		swatch.onmouseleave = function () {
			this.style.transform = 'scale(1)';
			this.style.boxShadow = 'none';
		};
		swatch.onclick = function (e) {
			e.stopPropagation();
			selectedColor = c.hex;
			// Tüm swatch'ları güncelle
			var swatches = grid.querySelectorAll('button');
			swatches.forEach(function (s, idx) {
				var isSel = COLOR_PALETTE[idx].hex === selectedColor;
				s.style.border = '2px solid ' + (isSel ? '#fff' : 'transparent');
				s.innerHTML = isSel ? '<span style="color:#fff;font-size:14px;font-weight:bold;text-shadow:0 1px 3px rgba(0,0,0,0.5);">✓</span>' : '';
			});
		};
		grid.appendChild(swatch);
	});
	popup.appendChild(grid);

	// Onay butonu
	var confirmBtn = document.createElement('button');
	confirmBtn.style.cssText = 'width:100%;padding:6px 12px;border-radius:8px;border:none;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.15s;';
	confirmBtn.style.background = 'var(--primary, #06b6d4)';
	confirmBtn.style.color = '#fff';
	confirmBtn.innerText = '✓ Onayla';
	confirmBtn.onmouseenter = function () { this.style.opacity = '0.85'; };
	confirmBtn.onmouseleave = function () { this.style.opacity = '1'; };
	confirmBtn.onclick = function (e) {
		e.stopPropagation();
		group.color = selectedColor;
		applyGroupColor(group.id, selectedColor);
		saveToStorage();
		renderList();
		popup.remove();
		_colorPopup = null;
	};
	popup.appendChild(confirmBtn);

	document.body.appendChild(popup);

	// Popup'u butonun yanına konumla
	var rect = anchorEl.getBoundingClientRect();
	var popW = 204; // tahmini genişlik
	var popH = 140;
	var left = rect.left - popW - 8;
	if (left < 8) left = rect.right + 8;
	var top = rect.top - popH / 2 + rect.height / 2;
	if (top < 8) top = 8;
	if (top + popH > window.innerHeight - 8) top = window.innerHeight - popH - 8;
	popup.style.left = left + 'px';
	popup.style.top = top + 'px';

	// Popup animasyonu
	popup.style.opacity = '0';
	popup.style.transform = 'scale(0.9)';
	requestAnimationFrame(function () {
		popup.style.transition = 'opacity 0.15s, transform 0.15s';
		popup.style.opacity = '1';
		popup.style.transform = 'scale(1)';
	});

	// Dışına tıklayınca kapat
	setTimeout(function () {
		document.addEventListener('click', function closePopup(ev) {
			if (!popup.contains(ev.target)) {
				popup.remove();
				_colorPopup = null;
				document.removeEventListener('click', closePopup);
			}
		});
	}, 50);
}

// Bir gruptaki tüm ölçüm entity'lerini yeni renge boya (sil & yeniden oluştur)
function applyGroupColor(groupId, hexColor) {
	measurements.forEach(function (m) {
		if (m.groupId !== groupId) return;
		// Mevcut entity/primitive'leri kaldır
		m.entities.forEach(function (ent) { safeRemoveItem(ent); });
		m.entities = [];
		// Yeni renkle yeniden oluştur
		if (m.type === 'coord') restoreCoord(m);
		else if (m.type === 'line') restoreLine(m);
		else if (m.type === 'polygon') restorePolygon(m);
		else if (m.type === 'height') restoreHeight(m);
	});
	viewer.scene.requestRender();
}

// ─── 5. ÖLÇÜM LİSTESİ ─────────────────────────────────────────
function renderList() {
	var container = document.getElementById('measureList');
	container.innerHTML = '';

	// Referans grupları (📌) önce, standart gruplar sonra
	var refGroups = groups.filter(function (g) { return g.name.indexOf('📌') === 0; });
	var stdGroups = groups.filter(function (g) { return g.name.indexOf('📌') !== 0; });

	// Önce referans gruplarını render et
	refGroups.forEach(function (group) {
		renderGroupItem(container, group);
	});

	// Ayırıcı çizgi (referans varsa)
	if (refGroups.length > 0) {
		var sep = document.createElement('div');
		sep.className = 'flex items-center gap-2 my-3 px-1';
		sep.innerHTML = '<div class="flex-1 h-[1px]" style="background:var(--border-subtle)"></div>' +
			'<span class="text-[8px] font-bold uppercase tracking-widest" style="color:var(--text-muted)">Katmanlar</span>' +
			'<div class="flex-1 h-[1px]" style="background:var(--border-subtle)"></div>';
		container.appendChild(sep);
	}

	// Sonra standart grupları render et
	stdGroups.forEach(function (group) {
		renderGroupItem(container, group);
	});

	updateActiveGroupLabel();
}

function renderGroupItem(container, group) {
	var groupWrapper = document.createElement('div');
	groupWrapper.className = 'folder-item mb-2' + (group.isOpen ? '' : ' folder-collapsed');

	// ─── Group Header ───
	var header = document.createElement('div');
	header.className = 'folder-header' + (activeGroupId === group.id ? ' active' : '');
	header.onclick = function () {
		activeGroupId = group.id;
		renderList();
		updateActiveGroupLabel();
	};

	var arrow = document.createElement('span');
	arrow.className = 'material-symbols-outlined text-[16px] folder-arrow';
	arrow.innerText = 'expand_more';
	arrow.onclick = function (e) {
		e.stopPropagation();
		group.isOpen = !group.isOpen;
		renderList();
	};

	var folderIcon = document.createElement('span');
	folderIcon.className = 'material-symbols-outlined text-[16px] text-primary';
	folderIcon.innerText = group.isOpen ? 'folder_open' : 'folder';

	// Grup içindeki ölçüm sayısı badge'i
	var groupCount = measurements.filter(function (m) { return m.groupId === group.id; }).length;
	var countBadge = document.createElement('span');
	countBadge.innerText = groupCount;
	countBadge.style.cssText = 'font-size:9px;min-width:14px;height:14px;line-height:14px;text-align:center;border-radius:7px;padding:0 3px;display:inline-block;font-weight:700;opacity:' + (groupCount > 0 ? '0.9' : '0.4') + ';background:' + (group.color || '#14B8A6') + '22;color:' + (group.color || '#14B8A6') + ';border:1px solid ' + (group.color || '#14B8A6') + '44;';

	var groupName = document.createElement('span');
	groupName.className = 'text-[10px] font-bold text-slate-300 flex-1 truncate uppercase tracking-tight';
	groupName.innerText = group.name;
	groupName.title = "Seçmek için tıkla";

	var groupCheck = document.createElement('input');
	groupCheck.type = 'checkbox';
	groupCheck.checked = group.checked;
	groupCheck.className = 'rounded border-slate-600 bg-slate-800 text-primary size-3 cursor-pointer shrink-0';
	groupCheck.onclick = function (e) {
		e.stopPropagation();
		group.checked = groupCheck.checked;
		measurements.forEach(function (m) {
			if (m.groupId === group.id) {
				m.checked = group.checked;
				m.entities.forEach(function (ent) { ent.show = group.checked; if (ent.label) ent.label.show = group.checked; });
			}
		});
		viewer.scene.requestRender();
		renderList();
	};

	var btnDelGroup = document.createElement('button');
	btnDelGroup.className = 'text-slate-500 hover:text-red-400 p-0.5 transition-colors';
	btnDelGroup.innerHTML = '<span class="material-symbols-outlined text-[14px]">delete</span>';
	btnDelGroup.title = "Grubu ve İçindekileri Sil";
	btnDelGroup.onclick = function (e) {
		e.stopPropagation();
		if (confirm('"' + group.name + '" grubunu ve içindeki tüm ölçümleri silmek istediğinize emin misiniz?')) {
			deleteGroup(group.id);
		}
	};

	// Renk butonu
	var colorBtn = document.createElement('button');
	colorBtn.className = 'shrink-0 transition-all';
	colorBtn.style.cssText = 'width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,0.2);cursor:pointer;background:' + (group.color || '#14B8A6') + ';box-shadow:0 0 6px ' + (group.color || '#14B8A6') + '44;';
	colorBtn.title = 'Katman rengini değiştir';
	colorBtn.onmouseenter = function () {
		this.style.transform = 'scale(1.2)';
		this.style.boxShadow = '0 0 10px ' + (group.color || '#14B8A6') + '88';
	};
	colorBtn.onmouseleave = function () {
		this.style.transform = 'scale(1)';
		this.style.boxShadow = '0 0 6px ' + (group.color || '#14B8A6') + '44';
	};
	colorBtn.onclick = function (e) {
		e.stopPropagation();
		showColorPalette(group, colorBtn);
	};

	header.appendChild(arrow);
	header.appendChild(countBadge);
	header.appendChild(folderIcon);
	header.appendChild(groupName);
	header.appendChild(colorBtn);
	header.appendChild(groupCheck);

	// REFERANS grubuna ± Z kontrolleri ekle
	if (group.name.indexOf('📌') === 0) {
		var refControls = document.createElement('div');
		refControls.className = 'flex items-center gap-0.5 ml-1';
		refControls.onclick = function (e) { e.stopPropagation(); };

		// 🧲 Snap Toggle Butonu
		var btnSnap = document.createElement('button');
		var isSnapOn = !!group.snapEnabled;
		btnSnap.className = 'w-5 h-5 flex items-center justify-center rounded text-[11px] font-bold transition-colors ' + (isSnapOn ? 'bg-primary/20 text-primary' : 'bg-slate-700 text-slate-500 hover:text-slate-300');
		btnSnap.innerHTML = '<span class="material-symbols-outlined text-[13px]">' + (isSnapOn ? 'my_location' : 'location_disabled') + '</span>';
		btnSnap.title = isSnapOn ? 'Snap AÇIK — kapatmak için tıkla' : 'Snap KAPALI — açmak için tıkla';
		btnSnap.onclick = function () {
			group.snapEnabled = !group.snapEnabled;
			renderList();
		};
		refControls.appendChild(btnSnap);

		var btnZDown = document.createElement('button');
		btnZDown.className = 'w-5 h-5 flex items-center justify-center rounded bg-slate-700 hover:bg-red-600/80 text-slate-400 hover:text-white text-[10px] font-bold transition-colors';
		btnZDown.innerText = '−';
		btnZDown.title = 'Z −1m';
		btnZDown.onclick = function () { adjustGroupZ(group.id, -1); };

		var btnZUp = document.createElement('button');
		btnZUp.className = 'w-5 h-5 flex items-center justify-center rounded bg-slate-700 hover:bg-teal-600/80 text-slate-400 hover:text-white text-[10px] font-bold transition-colors';
		btnZUp.innerText = '+';
		btnZUp.title = 'Z +1m';
		btnZUp.onclick = function () { adjustGroupZ(group.id, 1); };

		var zLabel = document.createElement('span');
		zLabel.className = 'text-[8px] text-slate-600 font-mono px-0.5';
		zLabel.innerText = 'Z';

		refControls.appendChild(btnZDown);
		refControls.appendChild(zLabel);
		refControls.appendChild(btnZUp);
		header.appendChild(refControls);
	}

	if (group.id !== 0) header.appendChild(btnDelGroup);
	groupWrapper.appendChild(header);

	// ─── Group Content (Measurements) ───
	var content = document.createElement('div');
	content.className = 'folder-content';

	var groupMeasures = measurements.filter(function (m) { return m.groupId === group.id; });
	if (groupMeasures.length === 0) {
		var empty = document.createElement('div');
		empty.className = 'text-[9px] text-slate-600 italic py-1';
		empty.innerText = 'Ölçüm yok';
		content.appendChild(empty);
	}

	groupMeasures.forEach(function (m) {
		var row = document.createElement('div');
		var selectedClass = activeHighlightId === m.id ? ' border-primary bg-primary/10' : ' border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/50';
		row.className = 'flex items-center justify-between p-1.5 rounded border transition-colors mb-1' + selectedClass;

		var leftDiv = document.createElement('div');
		leftDiv.className = 'flex items-center gap-2 overflow-hidden';

		var chk = document.createElement('input');
		chk.type = 'checkbox';
		chk.checked = m.checked;
		chk.className = 'rounded border-slate-600 bg-slate-800 text-primary size-3 cursor-pointer shrink-0';
		chk.onclick = function (e) {
			e.stopPropagation();
			m.checked = chk.checked;
			m.entities.forEach(function (ent) { ent.show = chk.checked; if (ent.label) ent.label.show = chk.checked; });
			if (chk.checked) highlightMeasurement(m.id);
			else if (activeHighlightId === m.id) highlightMeasurement(m.id);
			viewer.scene.requestRender();
		};

		var name = document.createElement('span');
		name.className = 'text-[10px] text-slate-300 truncate w-[100px] cursor-pointer';
		name.innerText = m.name;
		name.onclick = function (e) { startEditing(e, m); };

		leftDiv.appendChild(chk);
		leftDiv.appendChild(name);

		var rightDiv = document.createElement('div');
		rightDiv.className = 'flex items-center gap-2 shrink-0';

		var result = document.createElement('span');
		result.className = 'text-[9px] font-mono text-primary';
		if (m.type === 'coord' && m.resultText) {
			// Koordinat: kompakt 2 satırlı düzen
			result.className = 'font-mono text-primary leading-tight';
			var parts = m.resultText.match(/Y:([\d.]+)\s+X:([\d.]+)\s+Z:([\d.]+)/);
			if (parts) {
				result.innerHTML = '<span class="text-[8px]">' + parts[1] + ', ' + parts[2] + '</span>' +
					'<span class="text-[7px] text-slate-400 ml-1">Z:' + parts[3] + '</span>';
			} else {
				result.innerText = m.resultText;
			}
		} else {
			result.innerText = m.resultText || '';
		}

		var del = document.createElement('button');
		del.className = 'text-slate-500 hover:text-red-400 p-0.5';
		del.innerHTML = '<span class="material-symbols-outlined text-[13px]">close</span>';
		del.onclick = function (e) {
			e.stopPropagation();
			deleteMeasurement(m.id);
		};

		rightDiv.appendChild(result);
		rightDiv.appendChild(del);
		row.appendChild(leftDiv);
		row.appendChild(rightDiv);
		content.appendChild(row);
	});

	groupWrapper.appendChild(content);
	container.appendChild(groupWrapper);
}

// Türkçe karakterleri ASCII'ye dönüştür + büyük harf yap
function normalizeGroupName(str) {
	var trMap = { 'ç': 'C', 'Ç': 'C', 'ğ': 'G', 'Ğ': 'G', 'ı': 'I', 'İ': 'I', 'ö': 'O', 'Ö': 'O', 'ş': 'S', 'Ş': 'S', 'ü': 'U', 'Ü': 'U' };
	return str.replace(/[çÇğĞıİöÖşŞüÜ]/g, function (c) { return trMap[c] || c; }).toUpperCase().replace(/\s+/g, '_');
}

function startEditing(e, m) {
	e.stopPropagation();
	var nameSpan = e.target;
	var oldName = m.name;
	var input = document.createElement('input');
	input.type = 'text';
	input.value = oldName;
	input.className = 'text-[10px] bg-slate-900 text-white border-b border-primary/50 px-1 py-0 h-[15px] w-[100px] outline-none';

	nameSpan.parentNode.replaceChild(input, nameSpan);
	input.focus();
	input.select();

	function finish() {
		var n = input.value.trim();
		if (n !== "") m.name = normalizeGroupName(n);
		// Harita entity'lerini yeni adla yeniden oluştur
		m.entities.forEach(function (ent) { safeRemoveItem(ent); });
		m.entities = [];
		if (m.type === 'coord') restoreCoord(m);
		else if (m.type === 'line') restoreLine(m);
		else if (m.type === 'polygon') restorePolygon(m);
		else if (m.type === 'height') restoreHeight(m);
		viewer.scene.requestRender();
		renderList();
		debouncedSave();
	}
	input.onblur = finish;
	input.onkeydown = function (ev) {
		if (ev.key === 'Enter') input.blur();
		else if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
	};
}

document.getElementById('btnNewFolder').onclick = function () {
	var n = prompt("Yeni klasör ismi:", "Yeni Grup");
	if (n) {
		groupCount++;
		var newGroup = { id: groupCount, name: normalizeGroupName(n), isOpen: true, checked: true };
		groups.push(newGroup);
		activeGroupId = newGroup.id;
		renderList();
		debouncedSave();
	}
};

function highlightMeasurement(id) {
	activeHighlightId = (activeHighlightId === id) ? null : id;
	renderList();
	measurements.forEach(function (item) {
		var isActive = item.id === activeHighlightId;
		// Grubun rengini bul (seçim kalktığında grup rengine dön)
		var grp = groups.find(function (g) { return g.id === item.groupId; });
		var groupHex = grp && grp.color ? grp.color : '#14B8A6';
		var groupCesColor = Cesium.Color.fromCssColorString(groupHex);

		item.entities.forEach(function (ent) {
			// Primitive Polyline / Polygon rengini güncelle
			if (ent.appearance && ent.appearance.material) {
				var targetColor = isActive ? Cesium.Color.CYAN : groupCesColor;
				// Polygon fill tespiti: _isPolygonFill flag (güvenilir)
				if (ent._isPolygonFill) {
					targetColor = isActive ? Cesium.Color.CYAN.withAlpha(VEC_STYLE.polygon.fillAlpha) : groupCesColor.withAlpha(VEC_STYLE.polygon.fillAlpha);
				}
				ent.appearance.material.uniforms.color = targetColor;
			}
			// Sadece PointPrimitiveCollection — LabelCollection hariç
			if (ent instanceof Cesium.PointPrimitiveCollection) {
				for (var pi = 0; pi < ent.length; pi++) {
					var pt = ent.get(pi);
					pt.color = isActive ? Cesium.Color.CYAN : groupCesColor;
					pt.pixelSize = isActive ? VEC_STYLE.point.size + 4 : VEC_STYLE.point.size;
					pt.outlineColor = isActive ? Cesium.Color.WHITE : VEC_STYLE.point.outlineColor;
				}
			}
		});
	});
	// Seçili ölçüm varsa ve mobil cihazdaysak Sil FAB göster
	var delFab = document.getElementById('deleteSelFab');
	if (delFab) {
		delFab.style.display = (_isMob && activeHighlightId !== null) ? 'flex' : 'none';
	}
	viewer.scene.requestRender();
}

function deleteMeasurement(id) {
	var idx = measurements.findIndex(function (m) { return m.id === id; });
	if (idx === -1) return;
	var m = measurements[idx];
	// Sahneneden entity/primitive'leri kaldır
	m.entities.forEach(function (item) { safeRemoveItem(item); });
	measurements.splice(idx, 1);
	if (activeHighlightId === id) activeHighlightId = null;
	var delFab = document.getElementById('deleteSelFab');
	if (delFab) delFab.style.display = 'none';
	viewer.scene.requestRender();
	renderList();
	debouncedSave();
}

function deleteGroup(id) {
	if (id === 0) return; // Varsayılan "Grup 1" silinemez

	// Gruba ait objeleri sahneden kaldır ve measurements listesinden ayır
	var remainingMeasurements = [];
	measurements.forEach(function (m) {
		if (m.groupId === id) {
			m.entities.forEach(function (ent) { safeRemoveItem(ent); });
			if (activeHighlightId === m.id) activeHighlightId = null;
		} else {
			remainingMeasurements.push(m); // Silinmeyecekleri tut
		}
	});
	measurements = remainingMeasurements;

	// Grubu listeden sil
	var gIdx = groups.findIndex(function (g) { return g.id === id; });
	if (gIdx !== -1) groups.splice(gIdx, 1);

	// Eğer silinen grup aktif grup id'sine denk geliyorsa "Grup 1"e (id:0) geri dön
	if (activeGroupId === id) activeGroupId = 0;

	viewer.scene.requestRender();
	renderList();
	debouncedSave();
}

// Seçili objeyi Delete tuşuyla silme
document.addEventListener('keydown', function (e) {
	if (e.target.tagName && (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea')) return;

	if (e.key === 'Delete' && activeHighlightId !== null) {
		deleteMeasurement(activeHighlightId);
	}
});

// Tümünü Sil
document.getElementById('btnDeleteAll').onclick = function () {
	var totalCount = measurements.length;
	if (totalCount === 0) return;
	if (!confirm('Tüm gruplardaki ' + totalCount + ' ölçüm haritadan ve listeden kalıcı olarak silinecek.\n\nBu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?')) return;
	measurements.forEach(function (m) {
		m.entities.forEach(function (ent) { safeRemoveItem(ent); });
	});
	measurements = [];
	activeHighlightId = null;
	// Varsayılan grup (id:0) hariç tüm grupları sil
	groups = groups.filter(function (g) { return g.id === 0; });
	activeGroupId = 0;
	viewer.scene.requestRender();
	renderList();
	debouncedSave();
};



// Tümünü Göster / Gizle (Toggle)
var _allVisible = true;
document.getElementById('selectAllToggle').addEventListener('click', function () {
	_allVisible = !_allVisible;
	this.querySelector('span').textContent = _allVisible ? 'visibility' : 'visibility_off';
	groups.forEach(function (g) { g.checked = _allVisible; });
	measurements.forEach(function (m) {
		m.checked = _allVisible;
		m.entities.forEach(function (ent) { ent.show = _allVisible; if (ent.label) ent.label.show = _allVisible; });
	});
	viewer.scene.requestRender();
	renderList();
	debouncedSave();
});

// ─── 6. ÇİZİM ARAÇLARI ───────────────────────────────────────
var handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
var activeTool = null;
var clickPoints = [];
var tempEntities = [];
var activeShape = null;
var pointCounter = 0;
var snappedCartesian = null;
var snapCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
var snapIndicator = snapCollection.add({
	pixelSize: VEC_STYLE.snap.vertexSize,
	color: Cesium.Color.fromCssColorString('#facc15').withAlpha(0.6),
	outlineColor: Cesium.Color.WHITE,
	outlineWidth: VEC_STYLE.point.outline,
	disableDepthTestDistance: Number.POSITIVE_INFINITY,
	show: false
});

function clearTempDrawing() {
	// Henüz kaydedilmemiş geçici çizimleri temizle
	tempEntities.forEach(function (item) { safeRemoveItem(item); });
	if (activeShape) { safeRemoveItem(activeShape); activeShape = null; }
	clickPoints = [];
	tempEntities = [];
	pointCounter = 0;
	if (snapIndicator) snapIndicator.show = false;
	snappedCartesian = null;
	clearZOverlays();
}

// ─── Z-AYAR SLIDER SİSTEMİ ────────────────────────────────────
var _zOverlayContainer = document.createElement('div');
_zOverlayContainer.id = 'zOverlayContainer';
_zOverlayContainer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;overflow:hidden;';
document.getElementById('cesiumContainer').appendChild(_zOverlayContainer);

var _zButtons = []; // { el, index, cartesian }
var _activeZSlider = null; // popup ref

function clearZOverlays() {
	_zButtons = [];
	_activeZSlider = null;
	_zOverlayContainer.innerHTML = '';
}

function createZButton(index) {
	// Sadece aktif noktada Z butonu göster — önce eskisini kaldır
	clearZOverlays();

	var wrapper = document.createElement('div');
	wrapper.style.cssText = 'position:absolute;pointer-events:auto;display:flex;flex-direction:column;align-items:flex-start;';
	wrapper.className = 'z-btn-wrapper';

	var btn = document.createElement('button');
	btn.textContent = 'Z';
	btn.setAttribute('aria-label', 'Yükseklik (Z) Ayarla');
	btn.style.cssText = [
		'width:22px;height:22px;font-size:11px;font-weight:700',
		'border:1px solid rgba(103,232,249,0.25);border-radius:6px',
		'background:rgba(15,23,42,0.75);color:#67e8f9',
		'cursor:pointer;padding:0;line-height:22px;text-align:center',
		'backdrop-filter:blur(8px);pointer-events:auto',
		'transition:all 0.2s ease;box-shadow:0 2px 8px rgba(0,0,0,0.3)'
	].join(';');
	btn.addEventListener('mouseenter', function () {
		this.style.borderColor = 'rgba(103,232,249,0.6)';
		this.style.boxShadow = '0 2px 12px rgba(103,232,249,0.25)';
	});
	btn.addEventListener('mouseleave', function () {
		this.style.borderColor = 'rgba(103,232,249,0.25)';
		this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
	});
	btn.addEventListener('click', function (e) {
		e.stopPropagation();
		if (_activeZSlider && _activeZSlider._zIndex === index) {
			closeZSlider();
		} else {
			openZSlider(index, wrapper);
		}
	});
	wrapper.appendChild(btn);

	_zOverlayContainer.appendChild(wrapper);
	_zButtons.push({ el: wrapper, index: index });
	updateSingleZPosition(0);
}

function removeLastZButton() {
	if (_zButtons.length === 0) return;
	closeZSlider();
	var last = _zButtons.pop();
	if (last.el.parentNode) last.el.parentNode.removeChild(last.el);
}

function openZSlider(index, wrapperEl) {
	closeZSlider();
	var carto = Cesium.Cartographic.fromCartesian(clickPoints[index]);
	var baseHeight = carto.height;

	// ─── Ana Panel ───
	var popup = document.createElement('div');
	popup.style.cssText = [
		'display:flex;flex-direction:column;align-items:stretch',
		'background:rgba(15,23,42,0.92)',
		'border:1px solid rgba(103,232,249,0.2)',
		'border-radius:10px;padding:8px 10px',
		'backdrop-filter:blur(12px);pointer-events:auto',
		'margin-bottom:6px;margin-left:8px;min-width:110px',
		'box-shadow:0 4px 20px rgba(0,0,0,0.45),0 0 1px rgba(103,232,249,0.15)'
	].join(';');
	popup._zIndex = index;

	var currentOffset = 0;

	// ─── Başlık ───
	var header = document.createElement('div');
	header.textContent = 'Z YÜKSEKLİK';
	header.style.cssText = 'font-size:8px;font-weight:600;color:rgba(148,163,184,0.6);letter-spacing:1px;text-align:center;margin-bottom:6px;';

	// ─── Değer Kontrol Satırı ───
	var controlRow = document.createElement('div');
	controlRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;margin-bottom:6px;';

	function applyOffset(offset) {
		currentOffset = Math.max(-20, Math.min(20, offset));
		var newHeight = baseHeight + currentOffset;
		var newCartesian = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, newHeight);
		clickPoints[index] = newCartesian;
		valLabel.textContent = (currentOffset >= 0 ? '+' : '') + currentOffset.toFixed(2) + 'm';
		redrawFromClickPoints();
	}

	// Ortak buton stili
	var _btnBase = [
		'width:22px;height:22px;font-size:13px;font-weight:700',
		'border:1px solid rgba(103,232,249,0.2);border-radius:5px',
		'background:rgba(30,41,59,0.8);color:#67e8f9',
		'cursor:pointer;padding:0;line-height:20px;text-align:center',
		'transition:all 0.15s ease'
	].join(';');

	// ▲ butonu
	var btnUp = document.createElement('button');
	btnUp.textContent = '▲';
	btnUp.setAttribute('aria-label', 'Yüksekliği 1cm artır');
	btnUp.style.cssText = _btnBase + ';font-size:10px;';
	btnUp.addEventListener('mouseenter', function () { this.style.background = 'rgba(103,232,249,0.15)'; });
	btnUp.addEventListener('mouseleave', function () { this.style.background = 'rgba(30,41,59,0.8)'; });
	btnUp.addEventListener('click', function (e) {
		e.stopPropagation();
		applyOffset(currentOffset + 0.01);
	});

	// Değer göstergesi
	var valLabel = document.createElement('div');
	valLabel.style.cssText = 'color:#67e8f9;font-size:12px;font-weight:700;white-space:nowrap;text-align:center;min-width:54px;font-family:monospace;';
	valLabel.textContent = '0.00m';

	// ▼ butonu
	var btnDown = document.createElement('button');
	btnDown.textContent = '▼';
	btnDown.setAttribute('aria-label', 'Yüksekliği 1cm azalt');
	btnDown.style.cssText = _btnBase + ';font-size:10px;';
	btnDown.addEventListener('mouseenter', function () { this.style.background = 'rgba(103,232,249,0.15)'; });
	btnDown.addEventListener('mouseleave', function () { this.style.background = 'rgba(30,41,59,0.8)'; });
	btnDown.addEventListener('click', function (e) {
		e.stopPropagation();
		applyOffset(currentOffset - 0.01);
	});

	controlRow.appendChild(btnUp);
	controlRow.appendChild(valLabel);
	controlRow.appendChild(btnDown);

	// ─── Sıfırla Satırı ───
	var resetRow = document.createElement('div');
	resetRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:4px;cursor:pointer;padding:3px 0;border-radius:5px;transition:background 0.15s;margin-bottom:4px;';
	resetRow.setAttribute('aria-label', 'Orijinal yüksekliğe sıfırla');
	resetRow.addEventListener('mouseenter', function () { this.style.background = 'rgba(251,191,36,0.08)'; });
	resetRow.addEventListener('mouseleave', function () { this.style.background = 'transparent'; });
	resetRow.addEventListener('click', function (e) {
		e.stopPropagation();
		applyOffset(0);
	});
	var resetIcon = document.createElement('span');
	resetIcon.textContent = '↺';
	resetIcon.style.cssText = 'font-size:11px;color:#fbbf24;';
	var resetText = document.createElement('span');
	resetText.textContent = 'Sıfırla';
	resetText.style.cssText = 'font-size:9px;color:#fbbf24;font-weight:500;';
	resetRow.appendChild(resetIcon);
	resetRow.appendChild(resetText);

	// ─── İpucu ───
	var hint = document.createElement('div');
	hint.textContent = '🖱 Tekerlek: ±3cm';
	hint.style.cssText = 'font-size:8px;color:rgba(148,163,184,0.45);text-align:center;pointer-events:none;';

	// ─── Mouse wheel desteği ───
	popup.addEventListener('wheel', function (e) {
		e.preventDefault();
		e.stopPropagation();
		var delta = e.deltaY < 0 ? 0.03 : -0.03;
		applyOffset(currentOffset + delta);
	});

	// ─── Montaj ───
	popup.appendChild(header);
	popup.appendChild(controlRow);
	popup.appendChild(resetRow);
	popup.appendChild(hint);

	wrapperEl.insertBefore(popup, wrapperEl.firstChild);
	_activeZSlider = popup;
}

// _closeZOnOutsideClick artık kullanılmıyor

function closeZSlider() {
	if (_activeZSlider && _activeZSlider.parentNode) {
		_activeZSlider.parentNode.removeChild(_activeZSlider);
	}
	_activeZSlider = null;
}

function updateSingleZPosition(arrIdx) {
	if (arrIdx >= _zButtons.length) return;
	// Popup açıkken pozisyonu sabitle — hareket etmesin
	if (_activeZSlider) return;
	var entry = _zButtons[arrIdx];
	var ptIndex = entry.index;
	if (ptIndex >= clickPoints.length) return;
	var screenPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, clickPoints[ptIndex]);
	if (screenPos) {
		entry.el.style.left = (screenPos.x + 14) + 'px';
		entry.el.style.bottom = (viewer.canvas.clientHeight - screenPos.y + 16) + 'px';
		entry.el.style.top = 'auto';
		entry.el.style.display = '';
	} else {
		entry.el.style.display = 'none';
	}
}

function updateZOverlayPositions() {
	for (var i = 0; i < _zButtons.length; i++) {
		updateSingleZPosition(i);
	}
}

// Her frame'de Z butonlarının ekran pozisyonunu güncelle
viewer.scene.preRender.addEventListener(function () {
	if (_zButtons.length > 0) updateZOverlayPositions();
});

// ─── REDRAW: clickPoints'ten TÜM GEÇİCİ ÇİZİMİ TEKRAR OLUŞTUR ───
function redrawFromClickPoints() {
	// Mevcut entity/primitive'leri temizle
	tempEntities.forEach(function (item) { safeRemoveItem(item); });
	tempEntities = [];
	if (activeShape) { safeRemoveItem(activeShape); activeShape = null; }

	var savedPoints = clickPoints.slice();
	clickPoints = [];
	pointCounter = 0;

	var _grp = groups.find(function (g) { return g.id === activeGroupId; });
	var hexColor = _grp && _grp.color ? _grp.color : '#14B8A6';

	var _gc = Cesium.Color.fromCssColorString(hexColor);

	savedPoints.forEach(function (pt) {
		clickPoints.push(pt);
		pointCounter++;
		var labelStr = (activeTool === 'btnPoint' || activeTool === 'btnHeight') ? pointCounter.toString() : null;
		var pnt = addPointLabel(pt, labelStr, hexColor);
		tempEntities.push(pnt);

		if (activeTool === 'btnDistance' && clickPoints.length > 1) {
			var a = clickPoints[clickPoints.length - 2];
			var b = clickPoints[clickPoints.length - 1];
			var segDist = Cesium.Cartesian3.distance(a, b);
			var seg = createStablePolyline([a, b], VEC_STYLE.line.width, _gc);
			if (seg) tempEntities.push(seg);
			if (!_isMob) {
				var segLabel = addLabel(midpoint(a, b), segDist.toFixed(2) + ' m', _gc);
				tempEntities.push(segLabel);
			}
		}
		else if (activeTool === 'btnArea' && clickPoints.length > 1) {
			var a2 = clickPoints[clickPoints.length - 2];
			var b2 = clickPoints[clickPoints.length - 1];
			var edgeSeg = createStablePolyline([a2, b2], VEC_STYLE.polygon.edgeWidth, _gc);
			if (edgeSeg) tempEntities.push(edgeSeg);
		}
	});

	// UI güncelleme
	if (activeTool === 'btnDistance') {
		var totalDist = 0;
		for (var i = 0; i < clickPoints.length - 1; i++) {
			totalDist += Cesium.Cartesian3.distance(clickPoints[i], clickPoints[i + 1]);
		}
		document.querySelector('#resultDisplay > div').innerHTML = window.AppMessages.DIST_RESULT(totalDist, Math.max(0, clickPoints.length - 1), isMobile);
	} else if (activeTool === 'btnArea') {
		// Undo sonrası fill önizleme oluşturma — fill sadece çizim tamamlandığında yapılır
		document.querySelector('#resultDisplay > div').innerHTML = window.AppMessages.AREA_RESULT(clickPoints.length, _isMob);
	}
}

// ─── MOBİL ALGILAMA SİLİNDİ (Üstte tek bir _isMob tanımlandı) ───

function setActiveTool(toolId) {
	// Önceki aracın tamamlanmamış çizimlerini temizle
	clearTempDrawing();

	activeTool = (activeTool === toolId) ? null : toolId;
	['btnDistance', 'btnArea', 'btnHeight', 'btnCoord'].forEach(function (id) {
		var el = document.getElementById(id);
		if (el) el.classList.remove('active');
	});
	if (activeTool) {
		var aEl = document.getElementById(activeTool);
		if (aEl) aEl.classList.add('active');

		// Mobilde: araç seçildiğinde sol paneli kapat (Alan modu hariç veya alt mod seçilince kapanacak şekilde)
		if (_isMob && window.closeToolPanel) {
			// Eğer Alan aracı seçildiyse hemen kapatma (alt mod seçilecek), diğerlerinde kapat
			if (activeTool !== 'btnArea') {
				window.closeToolPanel();
			}
		}
	}

	// Alan alt menü görünürlüğü
	var areaSub = document.getElementById('areaSubMenu');
	if (areaSub) {
		if (activeTool === 'btnArea') {
			areaSub.classList.add('visible');
		} else {
			areaSub.classList.remove('visible');
		}
	}

	// Alt mod butonlarının aktiflik durumu
	document.querySelectorAll('.area-mode-btn').forEach(function (b) {
		if (b.getAttribute('data-mode') === currentAreaMode) {
			b.classList.add('active');
		} else {
			b.classList.remove('active');
		}
	});

	// Toggle butonunda aktif araç ikonunu göster
	var toolIcons = { 'btnDistance': 'straighten', 'btnArea': 'pentagon', 'btnHeight': 'height', 'btnCoord': 'location_on' };
	var toggleIcon = document.getElementById('toolToggleIcon');
	if (toggleIcon) {
		if (activeTool && toolIcons[activeTool]) {
			toggleIcon.textContent = toolIcons[activeTool];
			toggleIcon.style.color = '#14B8A6';
			toggleIcon.style.fontSize = '20px';
		} else {
			toggleIcon.textContent = 'chevron_right';
			toggleIcon.style.color = '';
			toggleIcon.style.fontSize = '16px';
		}
	}

	var message = window.AppMessages.DEFAULT_IDLE;
	if (activeTool === 'btnDistance') {
		message = window.AppMessages.HINT_DISTANCE;
	} else if (activeTool === 'btnArea') {
		message = currentAreaMode === 'free' ? window.AppMessages.HINT_AREA_FREE : window.AppMessages.HINT_AREA_BOX3P;
	} else if (activeTool === 'btnHeight') {
		message = window.AppMessages.HINT_HEIGHT_1;
	} else if (activeTool === 'btnCoord') {
		message = window.AppMessages.HINT_POINT;
	} else if (activeTool === 'btnLineL') {
		message = window.AppMessages.HINT_LINE_L;
	}

	document.querySelector('#resultDisplay > div').innerHTML = message;

	// Mobil floating butonları göster/gizle
	updateMobileDrawButtons();
}

// ─── MOBİL ÇİZİM BUTONLARI KONTROL ─────────────────────────
function updateMobileDrawButtons() {
	var fab = document.getElementById('mobileFab');
	if (!fab) return;
	if (_isMob && activeTool && (activeTool === 'btnDistance' || activeTool === 'btnArea' || activeTool === 'btnCoord')) {
		fab.style.display = 'flex';
	} else {
		fab.style.display = 'none';
	}
}

// ─── MOBİLDEN ÇAĞRILABİLİR: ÇİZİM BİTİR ──────────────────
function finalizeMeasurement() {
	// Sağ tık handler'ını tetikle
	handler.getInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK)();
}

// ─── MOBİLDEN ÇAĞRILABİLİR: SON NOKTAYI GERİ AL ───────────
function undoLastPoint() {
	if (activeTool && clickPoints.length > 0 && activeTool !== 'btnCoord') {
		clickPoints.pop();
		removeLastZButton();
		redrawFromClickPoints();
		if (activeTool === 'btnHeight') {
			var msg = clickPoints.length === 0 ? window.AppMessages.HINT_HEIGHT_1 : window.AppMessages.HINT_HEIGHT_2;
			document.querySelector('#resultDisplay > div').innerHTML = msg;
		}
	}
}

['btnDistance', 'btnHeight', 'btnCoord'].forEach(function (id) {
	var el = document.getElementById(id);
	if (el) el.onclick = function () { setActiveTool(id); };
});

// Area butonuna özel click: sadece toggle yapar (mevcut modu kullanır)
var btnArea = document.getElementById('btnArea');
if (btnArea) {
	btnArea.onclick = function () { setActiveTool('btnArea'); };
}

// Dropdown alt-modları click handler
var areaModeBtns = document.querySelectorAll('.area-mode-btn');
areaModeBtns.forEach(function (btn) {
	btn.onclick = function (e) {
		e.stopPropagation(); // Parent click'i engelle
		currentAreaMode = this.getAttribute('data-mode');

		// Eğer zaten btnArea aktifse sadece mod değişsin, değilse aktif et
		if (activeTool !== 'btnArea') {
			setActiveTool('btnArea');
		} else {
			// Sadece buton stillerini güncelle (setActiveTool içindeki mantık)
			document.querySelectorAll('.area-mode-btn').forEach(function (b) {
				b.classList.toggle('active', b.getAttribute('data-mode') === currentAreaMode);
			});
			// Tooltip/Result display güncelle
			var msg = _isMob ? 'Alan (' + (currentAreaMode === 'free' ? 'Serbest' : '3 Nokta') + '): Köşelere dokunun. <i>(✓ = kapat)</i>'
				: 'Alan (' + (currentAreaMode === 'free' ? 'Serbest' : '3 Nokta') + '): Noktaları tıklayın. <i>(Sağ tık = kapat)</i>';
			document.querySelector('#resultDisplay > div').innerHTML = msg;
		}

		// Mobilde seçim sonrası paneli kapat
		if (_isMob && window.closeToolPanel) {
			window.closeToolPanel();
		}
	};
});


// ─── EKLENEN ÖZELLİK: FARE HAREKETİ İLE NOKTA YAKALAMA (SNAP) ───
// Optimizasyon: 1) 33ms throttle, 2) Vertex önceliği, 3) Globe pick yok, 4) Viewport clipping
var _lastSnapTime = 0;
handler.setInputAction(function (movement) {
	if (!activeTool) {
		if (snapIndicator && snapIndicator.show) {
			snapIndicator.show = false;
			viewer.scene.requestRender();
		}
		snappedCartesian = null;
		return;
	}

	// [OPT-1] Throttle: saniyede ~30 kez çalışsın (33ms aralık — CAD benzeri tepki)
	var now = performance.now();
	if (now - _lastSnapTime < 33) return;
	_lastSnapTime = now;

	var threshold = 15; // px (Yakalaşma mesafesi)
	var mousePos = movement.endPosition;

	// [OPT-4] Viewport sınırları — ekran dışı noktaları hızlıca elemek için
	var viewW = viewer.canvas.clientWidth;
	var viewH = viewer.canvas.clientHeight;
	var margin = 50; // px — ekran kenarı toleransı

	// ─── PASS 1: VERTEX SNAP (Köşe — en yüksek öncelik) ───
	var vertexDist = threshold + 1;
	var vertexCartesian = null;

	// Kayıtlı ölçüm noktaları
	measurements.forEach(function (m) {
		if (!m.checked) return;
		var mGroup = groups.find(function (g) { return g.id === m.groupId; });
		if (mGroup && mGroup.name.indexOf('📌') === 0 && !mGroup.snapEnabled) return;

		m.points.forEach(function (p) {
			var winPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p);
			// [OPT-4] Viewport clipping — ekran dışındaki noktaları atla
			if (!winPos) return;
			if (winPos.x < -margin || winPos.x > viewW + margin || winPos.y < -margin || winPos.y > viewH + margin) return;
			var dist = Cesium.Cartesian2.distance(winPos, mousePos);
			if (dist < vertexDist) { vertexDist = dist; vertexCartesian = p; }
		});
	});

	// Aktif çizim noktaları
	clickPoints.forEach(function (p) {
		var winPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p);
		if (!winPos) return;
		if (winPos.x < -margin || winPos.x > viewW + margin || winPos.y < -margin || winPos.y > viewH + margin) return;
		var dist = Cesium.Cartesian2.distance(winPos, mousePos);
		if (dist < vertexDist) { vertexDist = dist; vertexCartesian = p; }
	});

	// [OPT-2] Vertex bulunduysa edge aramayı ATLA — titreşim önlenir
	if (vertexCartesian) {
		snappedCartesian = vertexCartesian;
		snapIndicator.position = snappedCartesian;
		snapIndicator.color = Cesium.Color.fromCssColorString('#ef4444').withAlpha(VEC_STYLE.snap.vertexAlpha);
		snapIndicator.pixelSize = VEC_STYLE.snap.vertexSize;
		snapIndicator.show = true;
		viewer.scene.requestRender();
		return;
	}

	// ─── PASS 2: EDGE SNAP (Kenar — vertex yoksa) ───
	var edgeDist = threshold + 1;
	var edgeCartesian = null;

	function checkEdges(pts, isClosed) {
		var len = isClosed ? pts.length : pts.length - 1;
		for (var i = 0; i < len; i++) {
			var p1 = pts[i], p2 = pts[(i + 1) % pts.length];
			var w1 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p1);
			var w2 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p2);
			if (!w1 || !w2) continue;
			// [OPT-4] Her iki uç da ekran dışındaysa atla
			if ((w1.x < -margin && w2.x < -margin) || (w1.x > viewW + margin && w2.x > viewW + margin)) continue;
			if ((w1.y < -margin && w2.y < -margin) || (w1.y > viewH + margin && w2.y > viewH + margin)) continue;
			var closest2D = getClosestPointOnSegment(mousePos, w1, w2);
			var d = Cesium.Cartesian2.distance(mousePos, closest2D);
			if (d < edgeDist) {
				edgeDist = d;
				var segLen = Cesium.Cartesian2.distance(w1, w2);
				var t = segLen > 0 ? Cesium.Cartesian2.distance(w1, closest2D) / segLen : 0;
				edgeCartesian = Cesium.Cartesian3.lerp(p1, p2, t, new Cesium.Cartesian3());
			}
		}
	}

	// Kayıtlı ölçüm kenarları
	measurements.forEach(function (m) {
		if (!m.checked) return;
		var mGroup = groups.find(function (g) { return g.id === m.groupId; });
		if (mGroup && mGroup.name.indexOf('📌') === 0 && !mGroup.snapEnabled) return;
		if (m.type === 'line' || m.type === 'polygon' || m.type === 'height') {
			checkEdges(m.points, m.type === 'polygon');
		}
	});

	// Aktif çizim kenarları
	if (clickPoints.length > 1) {
		checkEdges(clickPoints, false);
	}

	if (edgeCartesian) {
		snappedCartesian = edgeCartesian;
		snapIndicator.position = snappedCartesian;
		snapIndicator.color = Cesium.Color.fromCssColorString('#3b82f6').withAlpha(VEC_STYLE.snap.edgeAlpha);
		snapIndicator.pixelSize = VEC_STYLE.snap.edgeSize;
		snapIndicator.show = true;
		viewer.scene.requestRender();
	} else {
		snappedCartesian = null;
		if (snapIndicator && snapIndicator.show) {
			snapIndicator.show = false;
			viewer.scene.requestRender();
		}
	}
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

// ─── 7. SOL TIK: ÇİZİM VEYA SEÇİM ───────────────────────────────
handler.setInputAction(function (click) {
	// Eğer aktif bir araç yoksa, haritadaki objeleri (ölçümleri) seçme işlemi yap
	if (!activeTool) {
		var pickedObject = viewer.scene.pick(click.position);
		if (Cesium.defined(pickedObject) && pickedObject.id) {
			var entity = pickedObject.id;
			if (entity.owner) entity = entity.owner; // Label tıklanırsa Point'e yönlendir

			// Ölçümlere ait bir entity ise IDsini bul
			var foundMeasurement = measurements.find(function (m) {
				return m.entities.includes(entity);
			});
			if (foundMeasurement) {
				highlightMeasurement(foundMeasurement.id);
			}
		} else {
			// Boş bir yere tıklandıysa seçimi kaldır
			if (activeHighlightId !== null) {
				highlightMeasurement(activeHighlightId); // Zaten seçiliyse null yapar
			}
		}
		return;
	}

	// Aktif grubun Cesium rengini al
	var _grp = groups.find(function (g) { return g.id === activeGroupId; });
	var _gc = Cesium.Color.fromCssColorString(_grp && _grp.color ? _grp.color : '#14B8A6');

	var cartesian;
	if (snappedCartesian !== null) {
		// Snap olduysa o noktayı kullan (Referans kopması için clone aldık)
		cartesian = Cesium.Cartesian3.clone(snappedCartesian);
	} else {
		// 3D Model Picking — sadece tile/vektör yüzeyine yapışır, zemine düşmez
		try { cartesian = viewer.scene.pickPosition(click.position); } catch (e) { /* depth render hatası */ }
	}
	if (!Cesium.defined(cartesian)) return;

	// Sol tıklamada kesişim engellemesi tamamen kaldırıldı. Kullanıcı özgürce çizebilir.

	clickPoints.push(cartesian);
	pointCounter++;

	var hexColor = _grp && _grp.color ? _grp.color : '#14B8A6';

	var labelStr = (activeTool === 'btnCoord' || activeTool === 'btnHeight') ? pointCounter.toString() : null;
	var pnt = addPointLabel(cartesian, labelStr, hexColor);
	tempEntities.push(pnt);

	// Mesafe ve Alan araçlarında Z ayar butonu ekle
	if (activeTool === 'btnDistance' || activeTool === 'btnArea') {
		closeZSlider();
		createZButton(clickPoints.length - 1);
	}

	// ── MESAFE ──
	if (activeTool === 'btnDistance' && clickPoints.length > 1) {
		var a = clickPoints[clickPoints.length - 2];
		var b = clickPoints[clickPoints.length - 1];
		var segDist = Cesium.Cartesian3.distance(a, b);

		var seg = createStablePolyline([a, b], VEC_STYLE.line.width, _gc);
		if (seg) tempEntities.push(seg);

		if (!_isMob) {
			var segLabel = addLabel(midpoint(a, b), segDist.toFixed(2) + ' m', _gc);
			tempEntities.push(segLabel);
		}

		// Mesafe aracı polyline olduğu için sol tıklada kaydetmiyoruz, sadece önizleme güncelliyoruz.
		// Kayıt işlemi sağ tıklada (RIGHT_CLICK) handler içerisinde yapılacak.
	}

	// ── ALAN ──
	else if (activeTool === 'btnArea') {
		if (currentAreaMode === 'free') {
			if (clickPoints.length > 1) {
				var a2 = clickPoints[clickPoints.length - 2];
				var b2 = clickPoints[clickPoints.length - 1];
				var edgeSeg = createStablePolyline([a2, b2], VEC_STYLE.polygon.edgeWidth, _gc);
				if (edgeSeg) tempEntities.push(edgeSeg);
			}

			// Anlık poligon dolgusu iptal edildi. Hesaplama sağ tıkta yapılacak.
			document.querySelector('#resultDisplay > div').innerHTML = window.AppMessages.AREA_FREE_RESULT(clickPoints.length, _isMob);
		} else if (currentAreaMode === 'box3p') {
			// 3 Noktalı Kutu Modu
			if (clickPoints.length > 1 && clickPoints.length < 3) {
				var a3 = clickPoints[clickPoints.length - 2];
				var b3 = clickPoints[clickPoints.length - 1];
				var edgeSeg3 = createStablePolyline([a3, b3], VEC_STYLE.polygon.edgeWidth, _gc);
				if (edgeSeg3) tempEntities.push(edgeSeg3);
			}

			if (clickPoints.length === 3) {
				// 3 Nokta girildi, kutuyu hesapla ve kapat
				var boxPts3 = calculateBox3P(clickPoints[0], clickPoints[1], clickPoints[2]);

				// 3. ve 4. noktaları görsel olarak sahneye ve tempEntities'e ekle
				// Not: İlk iki nokta zaten tıklandıkları anda eklendi ve tempEntities'te duruyorlar.
				// Orijinal 3. kullanıcı noktasını siliyoruz çünkü calculateBox3P onu bir dikdörtgen olmak üzere biraz düzeltti.
				// `clickPoints` listesinde son tıklanan noktayı gizle (pointPrimitive var)
				var lastPointPrimitive = tempEntities.pop();
				if (lastPointPrimitive) safeRemoveItem(lastPointPrimitive);

				// Yeni p3 (düzeltilmiş) ve p4 (yeni oluşturulan) noktalarını sahneye ekle
				var p3_entity = createStablePoint(boxPts3[2], _gc);
				if (p3_entity) tempEntities.push(p3_entity);

				var p4_entity = createStablePoint(boxPts3[3], _gc);
				if (p4_entity) tempEntities.push(p4_entity);

				// Noktaları Array'a yaz
				clickPoints = boxPts3.slice(); // 4 köşeye dönüştür

				// Eksik kenar çizgilerini ekle (P2→P3 ve P3→P4)
				var edgeP2P3 = createStablePolyline([boxPts3[1], boxPts3[2]], VEC_STYLE.polygon.edgeWidth, _gc);
				if (edgeP2P3) tempEntities.push(edgeP2P3);
				var edgeP3P4 = createStablePolyline([boxPts3[2], boxPts3[3]], VEC_STYLE.polygon.edgeWidth, _gc);
				if (edgeP3P4) tempEntities.push(edgeP3P4);

				// Çizimi bitirme işlemini tetikle (Sağ tık simülasyonu)
				handler.getInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK)();
			} else {
				document.querySelector('#resultDisplay > div').innerHTML = window.AppMessages.AREA_BOX3P_PROGRESS((3 - clickPoints.length), _isMob);
			}
		}
	} // btnArea BİTİŞİ
	// ── YÜKSEKLİK ──
	else if (activeTool === 'btnHeight') {
		if (clickPoints.length === 1) {
			document.querySelector('#resultDisplay > div').innerHTML = window.AppMessages.HINT_HEIGHT_2;
		} else if (clickPoints.length === 2) {
			var c1 = Cesium.Cartographic.fromCartesian(clickPoints[0]);
			var c2 = Cesium.Cartographic.fromCartesian(clickPoints[1]);
			var diff = Math.abs(c1.height - c2.height);

			// L-şeklinde çizgi: P1 → P_mid (yatay) → P2 (dikey)
			var pMid = Cesium.Cartesian3.fromRadians(c2.longitude, c2.latitude, c1.height);
			// P_mid noktası (3. nokta)
			var midPointEntity = drawLayer.entities.add({
				position: pMid,
				point: { pixelSize: VEC_STYLE.height.midPointSize, color: _gc, outlineColor: VEC_STYLE.point.outlineColor, outlineWidth: VEC_STYLE.point.outline, disableDepthTestDistance: Number.POSITIVE_INFINITY }
			});
			tempEntities.push(midPointEntity);

			var hSegH = createStablePolyline([clickPoints[0], pMid], VEC_STYLE.height.horizontalWidth, _gc);
			if (hSegH) tempEntities.push(hSegH);

			var vertColor = _gc.withAlpha(VEC_STYLE.height.verticalAlpha);
			// Dikey çizgi kesik kesik (dashed)
			var hSegV = createStablePolyline([pMid, clickPoints[1]], VEC_STYLE.height.verticalWidth, vertColor, null, true);
			if (hSegV) tempEntities.push(hSegV);

			// Yatay mesafe etiketi
			var distH = Cesium.Cartesian3.distance(clickPoints[0], pMid);
			var labelH = addLabel(midpoint(clickPoints[0], pMid), '↔ ' + distH.toFixed(2) + ' m', _gc);
			tempEntities.push(labelH);

			var hLabel = addLabel(midpoint(pMid, clickPoints[1]), '↕ ' + diff.toFixed(2) + ' m', _gc);
			tempEntities.push(hLabel);

			var resultText = '↕ ' + diff.toFixed(2) + ' m';
			var heightA = c1.height;
			var heightB = c2.height;
			document.querySelector('#resultDisplay > div').innerHTML =
				'<strong>Zemin:</strong> ' + heightA.toFixed(2) + ' m | ' +
				'<strong>Tepe:</strong> ' + heightB.toFixed(2) + ' m<br>' +
				'<span class="text-green-400 font-bold block mt-1 text-[11px]">Yükseklik Farkı: ' + diff.toFixed(2) + ' m</span>';

			measureCount++;
			measurements.push({
				id: measureCount,
				groupId: activeGroupId,
				name: 'Yükseklik ' + measureCount,
				type: 'height',
				resultText: resultText,
				points: [clickPoints[0], pMid, clickPoints[1]],
				entities: tempEntities.slice(),
				checked: true
			});
			tempEntities = []; clickPoints = []; pointCounter = 0;
			renderList(); setActiveTool(null);
			debouncedSave();
		}
	} // btnHeight BİTİŞİ
	// ── KOORDİNAT ──
	else if (activeTool === 'btnCoord') {
		var carto = Cesium.Cartographic.fromCartesian(cartesian);
		var lat = Cesium.Math.toDegrees(carto.latitude);
		var lon = Cesium.Math.toDegrees(carto.longitude);
		var z = carto.height;

		var tm30 = typeof proj4 !== 'undefined' ? proj4('EPSG:4326', 'EPSG:5254', [lon, lat]) : [0, 0];
		var resultText = 'Y:' + tm30[0].toFixed(2) + ' X:' + tm30[1].toFixed(2) + ' Z:' + z.toFixed(2);

		if (window.AppMessages && window.AppMessages.POINT_COORD) {
			document.querySelector('#resultDisplay > div').innerHTML = window.AppMessages.POINT_COORD(tm30[0], tm30[1], z);
		} else {
			document.querySelector('#resultDisplay > div').innerHTML = '<b>Y:</b> ' + tm30[0].toFixed(3) + '<br><b>X:</b> ' + tm30[1].toFixed(3) + '<br><b>Z:</b> ' + z.toFixed(3) + ' m';
		}

		measureCount++;
		measurements.push({
			id: measureCount,
			groupId: activeGroupId,
			name: 'Nokta ' + measureCount,
			type: 'coord',
			resultText: resultText,
			points: [cartesian],
			entities: tempEntities.slice(),
			checked: true
		});
		// SONRAKİ NOKTA İÇİN SIFIRLAMALAR
		tempEntities = [];
		clickPoints = [];
		// pointCounter SIFIRLANMIYOR Kİ 1, 2, 3 DİYE ARDIL ARTSIN
		renderList();
		debouncedSave();
		// setActiveTool(null); <-- ARTIK KALDIRILDI Kİ ARDIŞIK NOKTA ATILSIN
	}

	// Sadece Mesafe (Line) ekran uyarısı güncelleme
	if (activeTool === 'btnDistance') {
		var totalDist = 0;
		for (var i = 0; i < clickPoints.length - 1; i++) {
			totalDist += Cesium.Cartesian3.distance(clickPoints[i], clickPoints[i + 1]);
		}
		document.querySelector('#resultDisplay > div').innerHTML = '<b>Mesafe:</b> ' + totalDist.toFixed(2) + ' m (' + (clickPoints.length - 1) + ' segment). <i>(Geri: Ctrl+Z)</i>';
	}
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ─── 8. SAĞ TIK: BİTİR ───────────────────────────────────────
handler.setInputAction(function () {

	// Aktif grubun Cesium rengini al
	var _grp = groups.find(function (g) { return g.id === activeGroupId; });
	var _gc = Cesium.Color.fromCssColorString(_grp && _grp.color ? _grp.color : '#14B8A6');

	// MESAFE BİTİR
	if (activeTool === 'btnDistance' && clickPoints.length > 1) {
		var totalDist = 0;
		for (var i = 0; i < clickPoints.length - 1; i++) {
			totalDist += Cesium.Cartesian3.distance(clickPoints[i], clickPoints[i + 1]);
		}
		var resultText = totalDist.toFixed(2) + ' m';

		// Segment etiketlerini kaldır (Anti-jitter sonrası Primitive / LabelCollection sistemi)
		var cleanedEntities = [];
		tempEntities.forEach(function (ent) {
			if (ent instanceof Cesium.LabelCollection) {
				// Bu bir segment mesafe etiketi — sahneden tamamen sil
				safeRemoveItem(ent);
			} else {
				// Nokta (PointPrimitiveCollection) ve Çizgileri (Primitive) tut
				cleanedEntities.push(ent);
			}
		});
		tempEntities = cleanedEntities;

		// Toplam mesafe etiketi ekle — çizgi üzerindeki orta noktaya
		if (!_isMob) {
			var totalLabel = addLabel(midpointAlongLine(clickPoints), resultText, _gc);
			tempEntities.push(totalLabel);
		}

		measureCount++;
		measurements.push({
			id: measureCount,
			groupId: activeGroupId,
			name: 'Mesafe ' + measureCount,
			type: 'line',
			resultText: resultText,
			points: clickPoints.slice(),
			entities: tempEntities.slice(),
			checked: true
		});
		tempEntities = []; clickPoints = []; pointCounter = 0;
		renderList(); setActiveTool(null);
		debouncedSave();
	}

	// ALAN BİTİR
	else if (activeTool === 'btnArea' && clickPoints.length > 2) {
		// Kapatma esnasındaki kısıtlamalar kaldırıldı. Poligon her durumda kapatılır.

		// Kapatma çizgisi (Dış Sınır)
		var lastPt = clickPoints[clickPoints.length - 1];
		var firstPt = clickPoints[0];
		var closeLine = createStablePolyline([lastPt, firstPt], VEC_STYLE.polygon.edgeWidth, _gc);
		if (closeLine) tempEntities.push(closeLine);

		// İçi Dolu Sabit Poligonu Oluştur
		var staticPoly = createStablePolygon(clickPoints, _gc.withAlpha(VEC_STYLE.polygon.fillAlpha));
		if (staticPoly) tempEntities.push(staticPoly);

		// Merkezi AreaManager ile tüm hesaplamaları tek seferde yap
		var areaData = AreaManager.processArea(clickPoints);

		// Etiket Metni ve Uyarılar
		var warningPrefix = areaData.isIntersecting ? '⚠️ ' : '';
		var labelText = warningPrefix + '2D: ' + areaData.area2D.toFixed(2) + ' m²';  // Haritada 2D görünür
		var resultText = '3D: ' + areaData.area3D.toFixed(2) + 'm² / 2D: ' + areaData.area2D.toFixed(2) + 'm²';
		var areaLabel = addLabel(centroid(clickPoints), labelText, areaData.isIntersecting ? Cesium.Color.fromCssColorString('#ef4444') : _gc);
		tempEntities.push(areaLabel);

		var warningMsg = areaData.isIntersecting ? ' <b style="color:#ef4444">⚠️ Kendini kesen poligon — alan hesabı yanlış olabilir!</b>' : '';
		document.querySelector('#resultDisplay > div').innerHTML = '<b>Alan:</b> ' + resultText + ' (' + clickPoints.length + ' köşe)' + warningMsg;

		measureCount++;
		measurements.push({
			id: measureCount,
			groupId: activeGroupId,
			name: 'Alan ' + measureCount,
			type: 'polygon',
			resultText: resultText,
			points: clickPoints.slice(),
			entities: tempEntities.slice(),
			checked: true
		});
		tempEntities = []; clickPoints = []; pointCounter = 0;
		renderList(); setActiveTool(null);
		debouncedSave();

		// Self-intersection uyarısını setActiveTool(null) EZDİĞİ için TEKRAR yaz
		if (areaData.isIntersecting) {
			document.querySelector('#resultDisplay > div').innerHTML =
				'<b>Alan:</b> ' + resultText + ' (' + (measureCount) + '. ölçüm) <b style="color:#ef4444">⚠️ Kendini kesen poligon — alan hesabı yanlış olabilir!</b>';
		}
	}

	// KOORDİNAT (Nokta) BİTİR
	else if (activeTool === 'btnCoord') {
		// Nokta atmayı bitirip arayüzü sıfırlıyoruz.
		tempEntities = []; clickPoints = []; pointCounter = 0;
		renderList(); setActiveTool(null);
		document.querySelector('#resultDisplay > div').innerHTML = 'Nokta at işlemi tamamlandı.';
	}
}, Cesium.ScreenSpaceEventType.RIGHT_CLICK);

// ─── 9. ACİL ÇIKIŞ VE KLAVYE KISAYOLLARI (ESCAPE / UNDO) ─────────────────
document.addEventListener('keydown', function (e) {
	// PHASE 3: Defensive Escapes
	if (e.key === 'Escape' && activeTool) {
		clearTempDrawing();
		activeTool = null;
		['btnDistance', 'btnArea', 'btnHeight', 'btnCoord'].forEach(function (id) {
			var el = document.getElementById(id);
			if (el) el.classList.remove('active');
		});
		document.querySelector('#resultDisplay > div').innerHTML = 'Araç seçin ve haritaya tıklayın.';
		if (typeof updateMobileDrawButtons === 'function') updateMobileDrawButtons();
		return;
	}

	if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
		if (activeTool && clickPoints.length > 0) {
			e.preventDefault(); // Varsayılan geri alma işlemini durdur

			// Nokta label'ını (son eklenen entity) sil
			if (tempEntities.length > 0 && activeTool !== 'btnCoord') {
				clickPoints.pop(); // Son noktayı çıkar
				removeLastZButton(); // Z overlay'i de kaldır

				// redrawFromClickPoints tüm entity'leri silip baştan çizer (DRY)
				redrawFromClickPoints();

				if (activeTool === 'btnHeight') {
					document.querySelector('#resultDisplay > div').innerHTML = 'Yükseklik: 2 nokta tıklayın.';
				}
			}
		}
	}
});

// ─── 9. EPSG:5254 (TM30) DÖNÜŞÜMÜ ────────────────────────────
if (typeof proj4 !== 'undefined') {
	proj4.defs("EPSG:5254", "+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
} else {
	console.warn("proj4js kütüphanesi yüklenmedi, koordinat dönüşümleri hatalı olabilir.");
}

function wgs84ToTm30(lat, lon) {
	if (typeof proj4 !== 'undefined') {
		return proj4("EPSG:4326", "EPSG:5254", [lon, lat]);
	}
	return [lon, lat]; // Fallback
}

// ─── 10. DIŞA AKTARIM ─────────────────────────────────────────
document.getElementById('btnExportGeoJSON').onclick = function () {
	if (!requireCrsSelection()) return;
	var crs = document.getElementById('exportCrs').value;
	var selected = getExportMeasurements();
	if (selected.length === 0) { alert('Seçili kapsamda dışa aktarılacak ölçüm bulunamadı!'); return; }

	var features = [];
	selected.forEach(function (m) {
		var coords = [];
		m.points.forEach(function (p) {
			var carto = Cesium.Cartographic.fromCartesian(p);
			var lat = Cesium.Math.toDegrees(carto.latitude);
			var lon = Cesium.Math.toDegrees(carto.longitude);
			if (crs === '5254') { var tm = wgs84ToTm30(lat, lon); coords.push([tm[0], tm[1], carto.height]); }
			else { coords.push([lon, lat, carto.height]); }
		});

		var geoType = (m.type === 'line' || m.type === 'height') ? 'LineString' : (m.type === 'polygon' ? 'Polygon' : 'Point');
		if (m.type === 'polygon') { coords.push(coords[0]); coords = [coords]; }

		features.push({
			type: 'Feature',
			geometry: { type: geoType, coordinates: m.type === 'coord' ? coords[0] : coords },
			properties: { Grup: getGroupName(m.groupId), Name: m.name, Tip: m.type, Deger: m.resultText || '' }
		});
	});

	var geoJson = {
		type: 'FeatureCollection',
		crs: { type: 'name', properties: { name: crs === '5254' ? 'urn:ogc:def:crs:EPSG::5254' : 'urn:ogc:def:crs:EPSG::4326' } },
		features: features
	};
	var a = document.createElement('a');
	a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(geoJson));
	a.download = crs === '5254' ? 'CAD_Cizimler_TM30.geojson' : 'CAD_Cizimler_WGS84.geojson';
	document.body.appendChild(a); a.click(); a.remove();
};

document.getElementById('btnExportDXF').onclick = function () {
	if (!requireCrsSelection()) return;
	var crs = document.getElementById('exportCrs').value;
	var selected = getExportMeasurements();
	if (selected.length === 0) { alert('Seçili kapsamda dışa aktarılacak ölçüm bulunamadı!'); return; }

	var dxf = "0\nSECTION\n2\nENTITIES\n";

	selected.forEach(function (m) {
		var points = m.points.map(function (p) {
			var carto = Cesium.Cartographic.fromCartesian(p);
			var lat = Cesium.Math.toDegrees(carto.latitude);
			var lon = Cesium.Math.toDegrees(carto.longitude);
			if (crs === '5254') {
				var tm = wgs84ToTm30(lat, lon);
				return { x: tm[0], y: tm[1], z: carto.height };
			} else {
				return { x: lon, y: lat, z: carto.height };
			}
		});

		var layerName = getGroupName(m.groupId);

		if (m.type === 'coord') {
			// DXF POINT — Layer = Grup adı
			dxf += "0\nPOINT\n8\n" + layerName + "\n10\n" + points[0].x + "\n20\n" + points[0].y + "\n30\n" + points[0].z + "\n";
		} else if (m.type === 'height' && points.length === 2) {
			// DXF LINE — Layer = Grup adı
			dxf += "0\nLINE\n8\n" + layerName + "\n10\n" + points[0].x + "\n20\n" + points[0].y + "\n30\n" + points[0].z + "\n11\n" + points[1].x + "\n21\n" + points[1].y + "\n31\n" + points[1].z + "\n";
		} else if (m.type === 'line' || m.type === 'polygon') {
			// DXF 3D POLYLINE — Layer = Grup adı
			var isClosed = (m.type === 'polygon') ? 9 : 8;
			dxf += "0\nPOLYLINE\n8\n" + layerName + "\n66\n1\n70\n" + isClosed + "\n";
			points.forEach(function (p) {
				dxf += "0\nVERTEX\n8\n" + layerName + "\n10\n" + p.x + "\n20\n" + p.y + "\n30\n" + p.z + "\n70\n32\n";
			});
			dxf += "0\nSEQEND\n8\n" + layerName + "\n";
		}
	});

	dxf += "0\nENDSEC\n0\nEOF\n";

	var a = document.createElement('a');
	a.href = 'data:application/dxf;charset=utf-8,' + encodeURIComponent(dxf);
	a.download = crs === '5254' ? 'CAD_Cizimler_TM30.dxf' : 'CAD_Cizimler_WGS84.dxf';
	document.body.appendChild(a); a.click(); a.remove();
};

document.getElementById('btnExportCSV').onclick = function () {
	if (!requireCrsSelection()) return;
	var crs = document.getElementById('exportCrs').value;
	var selected = getExportMeasurements();
	if (selected.length === 0) { alert('Seçili kapsamda dışa aktarılacak ölçüm bulunamadı!'); return; }

	var csv = crs === '5254' ? 'NoktaAdi,Y_Saga,X_Yukari,Z_Kot,Grup\n' : 'NoktaAdi,Boylam,Enlem,Z_Kot,Grup\n';

	var pointCounter = 1;

	selected.forEach(function (m) {
		var grupAdi = getGroupName(m.groupId).replace(/,/g, '');
		m.points.forEach(function (p, index) {
			var carto = Cesium.Cartographic.fromCartesian(p);
			var lat = Cesium.Math.toDegrees(carto.latitude);
			var lon = Cesium.Math.toDegrees(carto.longitude);
			var z = carto.height.toFixed(3);

			var pointName = m.type === 'coord' ? (m.name || "Nokta " + pointCounter++) : (m.name.replace(/,/g, '') + "_N" + (index + 1));

			if (crs === '5254') {
				var tm = wgs84ToTm30(lat, lon);
				csv += pointName + ',' + tm[0].toFixed(3) + ',' + tm[1].toFixed(3) + ',' + z + ',' + grupAdi + '\n';
			} else {
				csv += pointName + ',' + lon.toFixed(6) + ',' + lat.toFixed(6) + ',' + z + ',' + grupAdi + '\n';
			}
		});
	});

	var a = document.createElement('a');
	a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
	a.download = crs === '5254' ? 'CAD_Noktalar_TM30.csv' : 'CAD_Noktalar_WGS84.csv';
	document.body.appendChild(a); a.click(); a.remove();
};

// ─── 11. İÇE AKTARIM (IMPORT) ───────────────────────────────────

// TM30 -> WGS84 Dönüşümü (Proj4js Tabancasına Eklendi)
function tm30ToWgs84(x, y) {
	if (typeof proj4 !== 'undefined') {
		var wgsCoords = proj4("EPSG:5254", "EPSG:4326", [x, y]);
		return [wgsCoords[1], wgsCoords[0]]; // Çıktı formatı [lat, lon] bekleniyor
	}
	return [y, x]; // Fallback
}

// İçe Aktarma: CRS kontrolü (kapsam import için geçerli değil)
function requireCrsOnly() {
	var crsSelect = document.getElementById('exportCrs');
	if (!crsSelect.value || crsSelect.value === "") {
		crsSelect.classList.remove('animate-shake', 'border-red-500', 'text-red-500');
		void crsSelect.offsetWidth;
		crsSelect.classList.add('animate-shake', 'border-red-500', 'text-red-500');
		setTimeout(function () {
			crsSelect.classList.remove('animate-shake', 'border-red-500', 'text-red-500');
		}, 400);
		document.querySelector('#resultDisplay > div').innerHTML = '<span class="text-red-400 font-bold text-[11px]">İçe aktarım için Koordinat Sistemi (EPSG) seçmelisiniz!</span>';
		return false;
	}
	return true;
}

// ─── 11.1. IMPORT YARDIMCILARI ───────────────────────────────────

// Tileset'in ortalama Z değerini hesapla
function getModelAverageZ() {
	if (!tileset || !tileset.boundingSphere) return 0;
	var center = tileset.boundingSphere.center;
	var carto = Cesium.Cartographic.fromCartesian(center);
	return carto.height;
}

// "📌 REFERANS" grubunu bul veya oluştur (dosya adına göre hiyerarşik)
function getOrCreateReferansGroup(fileName) {
	var groupName = '📌 ' + (fileName || 'REFERANS');
	var existing = groups.find(function (g) { return g.name === groupName; });
	if (existing) return existing.id;
	groupCount++;
	var refGroup = { id: groupCount, name: groupName, isOpen: true, checked: true };
	groups.push(refGroup);
	return refGroup.id;
}

// Bir gruptaki tüm ölçümlerin Z (yükseklik) değerini delta kadar kaydır
function adjustGroupZ(groupId, delta) {
	measurements.forEach(function (m) {
		if (m.groupId !== groupId) return;
		// 1. Eski entity'leri kaldır
		m.entities.forEach(function (ent) { safeRemoveItem(ent); });
		m.entities = [];
		// 2. Her noktanın yüksekliğine delta ekle
		m.points = m.points.map(function (p) {
			var carto = Cesium.Cartographic.fromCartesian(p);
			carto.height += delta;
			return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height);
		});
		// 3. Yeniden çiz
		if (m.type === 'coord') restoreCoord(m);
		else if (m.type === 'line') restoreLine(m);
		else if (m.type === 'polygon') restorePolygon(m);
		else if (m.type === 'height') restoreHeight(m);
	});
	saveToStorage();
	viewer.scene.requestRender(); // requestRenderMode=true iken anlık görsel güncelleme
}
// Z-Offset diyaloğunu göster ve callback ile sonucu döndür
function showImportZDialog(callback) {
	var dialog = document.getElementById('importZDialog');
	var avgZ = getModelAverageZ();
	document.getElementById('importZModelAvg').innerText = avgZ.toFixed(1) + ' m';
	document.getElementById('importZOffsetInput').value = '0';
	dialog.classList.remove('hidden');

	function cleanup() {
		dialog.classList.add('hidden');
		document.getElementById('importZApply').removeEventListener('click', onApply);
		document.getElementById('importZSkip').removeEventListener('click', onSkip);
		document.getElementById('importZBackdrop').removeEventListener('click', onSkip);
	}

	function onApply() {
		var offset = parseFloat(document.getElementById('importZOffsetInput').value) || 0;
		cleanup();
		callback(offset);
	}

	function onSkip() {
		cleanup();
		callback(0);
	}

	document.getElementById('importZApply').addEventListener('click', onApply);
	document.getElementById('importZSkip').addEventListener('click', onSkip);
	document.getElementById('importZBackdrop').addEventListener('click', onSkip);
}

// İçe Aktarma: Format kılavuz mesajları
var importGuides = {
	btnImportCSV: 'CSV formatı: <b>NoktaAdi, X, Y, Z</b> (virgül veya noktalı virgül ayraçlı). İlk satır başlık olabilir.',
	btnImportGeoJSON: 'GeoJSON formatı: Standart <b>FeatureCollection</b>. Point, LineString ve Polygon desteklenir.',
	btnImportDXF: 'DXF formatı: <b>POINT, LINE, POLYLINE</b> entity tipleri desteklenir.'
};

// Label'a tıklandığında CRS kontrolü yap, geçerliyse dosya seçiciyi aç
var _importing = false; // input.click() → label döngüsünü önlemek için bayrak
['btnImportCSV', 'btnImportGeoJSON', 'btnImportDXF'].forEach(function (id) {
	var input = document.getElementById(id);
	var label = input.closest('label');
	if (!label) return;

	label.addEventListener('click', function (e) {
		if (_importing) return; // Programatik tıklama — müdahale etme
		e.preventDefault();
		if (requireCrsOnly()) {
			var crsLabel = document.getElementById('exportCrs').value === '5254' ? 'TM30 (EPSG:5254)' : 'WGS84';
			document.querySelector('#resultDisplay > div').innerHTML =
				'<span class="text-slate-300 text-[10px]">📂 ' + importGuides[id] + ' Seçili sistem: <b class="text-primary">' + crsLabel + '</b></span>';
			_importing = true;
			input.click();
			_importing = false;
		}
	});
});

// CSV İçe Aktarma (Akıllı sütun algılama + Z-Offset diyaloğu)
document.getElementById('btnImportCSV').addEventListener('change', function (e) {
	var file = e.target.files[0]; if (!file) return;
	var crs = document.getElementById('exportCrs').value;
	var reader = new FileReader();
	reader.onload = function (ev) {
		try {
			var lines = ev.target.result.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
			if (lines.length === 0) return;

			var firstParts = lines[0].split(/[;,\t]/);
			var hasHeader = isNaN(parseFloat(firstParts[0].trim()));
			var startIndex = hasHeader ? 1 : 0;
			var colMap = { name: 0, x: 1, y: 2, z: 3, grup: -1 };

			if (hasHeader) {
				var headers = firstParts.map(function (h) { return h.trim().toLowerCase(); });
				headers.forEach(function (h, i) {
					if (h.includes('noktaadi') || h.includes('nokta') || h === 'name' || h === 'ad') colMap.name = i;
					else if (h.includes('y_saga') || h === 'x' || h === 'boylam' || h === 'lon' || h === 'longitude' || h === 'easting') colMap.x = i;
					else if (h.includes('x_yukari') || h === 'y' || h === 'enlem' || h === 'lat' || h === 'latitude' || h === 'northing') colMap.y = i;
					else if (h.includes('z_kot') || h === 'z' || h === 'kot' || h === 'altitude' || h === 'elevation' || h === 'height') colMap.z = i;
					else if (h === 'grup' || h === 'group' || h === 'layer' || h === 'katman') colMap.grup = i;
				});
			}

			// Parsed data → Z diyaloğu göster → sonra oluştur
			var parsedRows = [];
			for (var idx = startIndex; idx < lines.length; idx++) {
				var parts = lines[idx].split(/[;,\t]/);
				if (parts.length < 2) continue;
				var rawX = parseFloat(parts[colMap.x]);
				var rawY = parseFloat(parts[colMap.y]);
				var rawZ = parseFloat(parts[colMap.z] || 0) || 0;
				var name = (parts[colMap.name] || '').trim() || ('Nokta ' + (measurements.length + parsedRows.length + 1));
				if (isNaN(rawX) || isNaN(rawY)) continue;

				var lat, lon;
				if (crs === '5254') { var wgs = tm30ToWgs84(rawX, rawY); lat = wgs[0]; lon = wgs[1]; }
				else { lon = rawX; lat = rawY; }
				parsedRows.push({ lat: lat, lon: lon, z: rawZ, name: name });
			}

			if (parsedRows.length === 0) { alert('CSV dosyasında geçerli nokta bulunamadı.'); return; }

			showImportZDialog(function (zOffset) {
				var refGroupId = getOrCreateReferansGroup(file.name);
				parsedRows.forEach(function (row, i) {
					var pos = Cesium.Cartesian3.fromDegrees(row.lon, row.lat, row.z + zOffset);
					var m = {
						id: ++measureCount,
						groupId: refGroupId,
						name: row.name,
						type: 'coord',
						resultText: row.lat.toFixed(6) + ', ' + row.lon.toFixed(6),
						checked: true,
						points: [pos],
						entities: []
					};
					measurements.push(m);
					restoreCoord(m);
				});
				saveToStorage(); renderList();
				document.querySelector('#resultDisplay > div').innerHTML =
					'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedRows.length + ' nokta "' + file.name + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Z+' + zOffset + 'm)' : '') + '</span>';
			});
		} catch (csvErr) {
			console.error('CSV içe aktırma hatası:', csvErr);
			alert('CSV dosyası okunamadı: ' + csvErr.message);
		}
	};
	reader.readAsText(file);
	e.target.value = '';
});

// GeoJSON İçe Aktarma (Z-Offset diyaloğu + REFERANS grubu)
document.getElementById('btnImportGeoJSON').addEventListener('change', function (e) {
	var file = e.target.files[0]; if (!file) return;
	var crs = document.getElementById('exportCrs').value;
	var reader = new FileReader();
	reader.onload = function (ev) {
		try {
			var data = JSON.parse(ev.target.result);
		} catch (err) {
			alert('Geçersiz GeoJSON dosyası: ' + err.message);
			return;
		}
		var feats = data.features || (data.type === 'Feature' ? [data] : []);
		if (feats.length === 0) { alert('GeoJSON dosyasında öğe bulunamadı.'); return; }

		// Önce parse et
		var parsedFeats = [];
		feats.forEach(function (f) {
			if (!f.geometry) return;
			var coords = f.geometry.coordinates;
			var type = f.geometry.type;
			var props = f.properties || {};
			var name = props.Name || props.name || props.NAME || (type + ' ' + (measurements.length + parsedFeats.length + 1));
			var mType = type === 'Point' ? 'coord' : (type === 'Polygon' ? 'polygon' : 'line');

			var rawCoords = (type === 'Point') ? [coords] : (type === 'Polygon' ? coords[0] : coords);
			var converted = [];
			rawCoords.forEach(function (c) {
				var lon, lat, z = c[2] || 0;
				if (crs === '5254') { var wgs = tm30ToWgs84(c[0], c[1]); lat = wgs[0]; lon = wgs[1]; }
				else { lon = c[0]; lat = c[1]; }
				converted.push({ lon: lon, lat: lat, z: z });
			});

			// Polygon kapanış noktasını kaldır
			if (mType === 'polygon' && converted.length > 1) {
				var f2 = converted[0], l2 = converted[converted.length - 1];
				if (Math.abs(f2.lon - l2.lon) < 0.00001 && Math.abs(f2.lat - l2.lat) < 0.00001) converted.pop();
			}

			if (converted.length > 0) parsedFeats.push({ name: name, type: mType, coords: converted });
		});

		if (parsedFeats.length === 0) { alert('GeoJSON dosyasında geçerli öğe bulunamadı.'); return; }

		showImportZDialog(function (zOffset) {
			var refGroupId = getOrCreateReferansGroup(file.name);
			parsedFeats.forEach(function (feat, index) {
				var points = feat.coords.map(function (c) {
					return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + zOffset);
				});
				var m = {
					id: ++measureCount,
					groupId: refGroupId,
					name: feat.name,
					type: feat.type,
					checked: true,
					points: points,
					entities: []
				};
				measurements.push(m);
				if (feat.type === 'coord') restoreCoord(m);
				else if (feat.type === 'line') restoreLine(m);
				else if (feat.type === 'polygon') restorePolygon(m);
			});
			saveToStorage(); renderList();
			document.querySelector('#resultDisplay > div').innerHTML =
				'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedFeats.length + ' öğe "' + file.name + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Z+' + zOffset + 'm)' : '') + '</span>';
		});
	};
	reader.readAsText(file);
	e.target.value = '';
});

// DXF İçe Aktarma (Z-Offset diyaloğu + REFERANS grubu)
document.getElementById('btnImportDXF').addEventListener('change', function (e) {
	var file = e.target.files[0]; if (!file) return;
	var crs = document.getElementById('exportCrs').value;
	var reader = new FileReader();
	reader.onload = function (ev) {
		try {
			var content = ev.target.result;
			var lines = content.split(/\r?\n/);
			var inEntities = false;
			var currentEntity = null;
			var entityLayer = '';
			var entityPoints = [];
			var entityClosed = false;
			var inVertex = false;
			var vertexPoint = null;

			// Faz 1: Parse → parsedEntities dizisine topla
			var parsedEntities = [];

			function convertRawPoint(p) {
				var lon, lat;
				if (crs === '5254') { var wgs = tm30ToWgs84(p.x, p.y); lat = wgs[0]; lon = wgs[1]; }
				else { lon = p.x; lat = p.y; }
				return { lon: lon, lat: lat, z: p.z || 0 };
			}

			function finalizeEntity() {
				if (inVertex && vertexPoint) {
					entityPoints.push(vertexPoint);
					vertexPoint = null;
					inVertex = false;
				}
				if (!currentEntity || entityPoints.length === 0) return;

				var mType;
				if (currentEntity === 'POINT') mType = 'coord';
				else if (currentEntity === 'LINE') mType = 'line';
				else if (currentEntity === 'POLYLINE' || currentEntity === 'LWPOLYLINE') {
					mType = entityClosed ? 'polygon' : 'line';
				}
				else return;

				var coords = entityPoints.map(convertRawPoint);
				var name = entityLayer || (currentEntity + ' ' + (parsedEntities.length + 1));
				parsedEntities.push({ name: name, type: mType, coords: coords });
			}

			for (var i = 0; i < lines.length; i++) {
				var code = lines[i].trim();
				var val = (i + 1 < lines.length) ? lines[i + 1].trim() : '';

				if (code === '2' && val === 'ENTITIES') { inEntities = true; i++; continue; }
				if (code === '0' && val === 'ENDSEC') { finalizeEntity(); inEntities = false; i++; continue; }
				if (!inEntities) { continue; }

				if (code === '0') {
					if (val === 'SEQEND') {
						finalizeEntity();
						currentEntity = null; entityPoints = []; entityLayer = ''; inVertex = false;
						i++; continue;
					}
					if (val === 'VERTEX') {
						if (inVertex && vertexPoint) entityPoints.push(vertexPoint);
						inVertex = true; vertexPoint = { x: 0, y: 0, z: 0 };
						i++; continue;
					}
					if (currentEntity && !inVertex) finalizeEntity();

					if (val === 'POINT' || val === 'LINE' || val === 'POLYLINE' || val === 'LWPOLYLINE') {
						currentEntity = val; entityPoints = []; entityLayer = ''; entityClosed = false; inVertex = false; vertexPoint = null;
					} else {
						currentEntity = null;
					}
					i++; continue;
				}

				if (currentEntity) {
					var numVal = parseFloat(val);
					if (code === '8' && !inVertex) { entityLayer = val; i++; continue; }
					if (code === '70' && !inVertex && (currentEntity === 'POLYLINE' || currentEntity === 'LWPOLYLINE')) {
						entityClosed = (parseInt(val) & 1) === 1; i++; continue;
					}
					if (inVertex && vertexPoint) {
						if (code === '10') vertexPoint.x = numVal;
						else if (code === '20') vertexPoint.y = numVal;
						else if (code === '30') vertexPoint.z = numVal;
						i++; continue;
					}
					if (code === '10') {
						if (currentEntity === 'LWPOLYLINE') entityPoints.push({ x: numVal, y: 0, z: 0 });
						else if (!entityPoints[0]) entityPoints[0] = { x: numVal, y: 0, z: 0 };
						else entityPoints[0].x = numVal;
					} else if (code === '20') {
						var lp = currentEntity === 'LWPOLYLINE' ? entityPoints[entityPoints.length - 1] : entityPoints[0];
						if (lp) lp.y = numVal;
					} else if (code === '30') {
						var lpz = currentEntity === 'LWPOLYLINE' ? entityPoints[entityPoints.length - 1] : entityPoints[0];
						if (lpz) lpz.z = numVal;
					} else if (code === '11') {
						entityPoints[1] = { x: numVal, y: 0, z: 0 };
					} else if (code === '21') {
						if (entityPoints[1]) entityPoints[1].y = numVal;
					} else if (code === '31') {
						if (entityPoints[1]) entityPoints[1].z = numVal;
					}
					i++;
				}
			}

			if (parsedEntities.length === 0) { alert('DXF dosyasında geçerli öğe bulunamadı.'); return; }

			// Faz 2: Z diyaloğu → oluştur
			showImportZDialog(function (zOffset) {
				var refGroupId = getOrCreateReferansGroup(file.name);
				parsedEntities.forEach(function (ent, idx) {
					var points = ent.coords.map(function (c) {
						return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + zOffset);
					});
					var m = {
						id: ++measureCount,
						groupId: refGroupId,
						name: ent.name,
						type: ent.type,
						checked: true,
						points: points,
						entities: []
					};
					measurements.push(m);
					if (ent.type === 'coord') restoreCoord(m);
					else if (ent.type === 'line') restoreLine(m);
					else if (ent.type === 'polygon') restorePolygon(m);
				});
				saveToStorage(); renderList();
				document.querySelector('#resultDisplay > div').innerHTML =
					'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedEntities.length + ' öğe "' + file.name + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Z+' + zOffset + 'm)' : '') + '</span>';
			});
		} catch (dxfErr) {
			console.error('DXF içe aktarma hatası:', dxfErr);
			alert('DXF dosyası okunamadı: ' + dxfErr.message);
		}
	};
	reader.readAsText(file);
	e.target.value = '';
});

// ─── YAKINLAŞ / UZAKLAŞ KONTROLLERİ ─────────────────────────
document.getElementById('btnZoomIn').addEventListener('click', function () {
	if (viewer && viewer.camera) {
		var cameraHeight = viewer.camera.positionCartographic.height;
		var moveRate = cameraHeight / 2.0; // Yüksekliğe oranla yakınlaşma miktarı
		viewer.camera.zoomIn(moveRate);
	}
});

document.getElementById('btnZoomOut').addEventListener('click', function () {
	if (viewer && viewer.camera) {
		var cameraHeight = viewer.camera.positionCartographic.height;
		var moveRate = cameraHeight / 2.0; // Yüksekliğe oranla uzaklaşma miktarı
		viewer.camera.zoomOut(moveRate);
	}
});
