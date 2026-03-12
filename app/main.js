// ═══════════════════════════════════════════════════════════════
// Bursa Büyükşehir Belediyesi — 3D Ölçüm ve Dijitalleştirme
// ═══════════════════════════════════════════════════════════════

main_boot: {

if (window.__CBS_BOOTED__) {
	console.warn('[CBS] main.js tekrar yüklendi (çift include olasılığı).');
	break main_boot;
}
window.__CBS_BOOTED__ = true;

// 1. CESIUM ION TOKEN (app/config.js üzerinden okunur)
var _appConfig = window.CBS_CONFIG || {};
var _ionToken = (_appConfig.cesiumIonToken || '').trim();
if (_ionToken) {
	Cesium.Ion.defaultAccessToken = _ionToken;
} else {
	console.warn('[CBS] Cesium Ion token tanımlı değil (CBS_CONFIG.cesiumIonToken).');
}
var _isMunicipality = true;

function _readRenderBufferMode() {
	var modeFromConfig = ((_appConfig.preserveDrawingBufferMode || 'precision') + '').toLowerCase();
	var modeFromStorage = null;
	try {
		if (typeof CbsStorage !== 'undefined' && CbsStorage.getSetting) {
			modeFromStorage = CbsStorage.getSetting('cbs-render-buffer-mode');
		} else {
			modeFromStorage = localStorage.getItem('cbs-render-buffer-mode');
		}
	} catch (e) { }

	var mode = ((modeFromStorage || modeFromConfig || 'precision') + '').toLowerCase();
	if (mode !== 'performance' && mode !== 'precision') mode = 'precision';
	return mode;
}

var _renderBufferMode = _readRenderBufferMode();
var _preserveDrawingBufferEnabled = _renderBufferMode !== 'performance';

// ═══ TELEMETRİ VE LOG YÖNETİMİ (Geri Bildirim Kara Kutusu) ═══
var TelemetryManager = {
	logs: [],
	maxLogs: 100,
	addLog: function (action, details, isError) {
		var t = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
		var logEntry = '[' + t + '] ' + action;
		this.logs.push(logEntry);
		if (this.logs.length > this.maxLogs) this.logs.shift();

		// Cloud Logging Bridge (monitoring-service.js tarafından doldurulur)
		if (window.MonitoringService && window.MonitoringService.log) {
			window.MonitoringService.log(action, details, isError);
		}
	},
	getSystemInfo: function () {
		var gl = null;
		try {
			var c = document.createElement('canvas');
			gl = c.getContext('webgl') || c.getContext('experimental-webgl');
		} catch (e) { }
		var gpu = 'Bilinmiyor';
		if (gl) {
			var ext = gl.getExtension('WEBGL_debug_renderer_info');
			if (ext) gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
		}
		return {
			ua: navigator.userAgent,
			platform: navigator.platform,
			screen: screen.width + 'x' + screen.height + ' (' + (window.devicePixelRatio || 1) + 'x)',
			gpu: gpu,
			memory: navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'Bilinmiyor',
			language: navigator.language
		};
	},
	getSystemInfoString: function () {
		var info = this.getSystemInfo();
		return [
			'Tarayıcı: ' + info.ua,
			'Platform: ' + info.platform,
			'Ekran: ' + info.screen,
			'GPU: ' + info.gpu,
			'Bellek: ' + info.memory,
			'Dil: ' + info.language
		].join('\n');
	},
	takeScreenshot: function () {
		try {
			if (typeof viewer !== 'undefined' && viewer.scene) {
				viewer.render();
				return viewer.canvas.toDataURL('image/jpeg', 0.6);
			}
		} catch (e) { }
		return null;
	}
};

// Global Hata Yakalayıcılar
if (!window.__CBS_GLOBAL_ERROR_LISTENER_BOUND__) {
	window.addEventListener('error', function (e) {
		TelemetryManager.addLog('CRITICAL_ERROR', { message: e.message, stack: e.error ? e.error.stack : null }, true);
	});
	window.__CBS_GLOBAL_ERROR_LISTENER_BOUND__ = true;
}
if (!window.__CBS_GLOBAL_REJECTION_LISTENER_BOUND__) {
	window.addEventListener('unhandledrejection', function (e) {
		TelemetryManager.addLog('PROMISE_REJECTION', { reason: e.reason }, true);
	});
	window.__CBS_GLOBAL_REJECTION_LISTENER_BOUND__ = true;
}

// 2. Protokol tespiti: file:// → Ion/terrain kullanma (CORS hatası verir)
var isLocalFile = window.location.protocol === 'file:';

// 3. VIEWER
var viewer = new Cesium.Viewer('cesiumContainer', {
	animation: false, timeline: false, vrButton: false, infoBox: false,
	sceneModePicker: false, baseLayerPicker: false, geocoder: false,
	homeButton: false,
	navigationHelpButton: false,
	preserveDrawingBuffer: _preserveDrawingBufferEnabled,
	imageryProvider: (isLocalFile || _isMunicipality || !_ionToken) ? false : undefined, // belediye modu veya token yoksa Ion default imagery devre dışı
	terrainProvider: new Cesium.EllipsoidTerrainProvider()  // Başlangıçta düz elipsoid
});

window.CBSRender = {
	getBufferMode: function () { return _renderBufferMode; },
	setBufferMode: function (mode) {
		var normalized = ((mode || '') + '').toLowerCase();
		if (normalized !== 'performance' && normalized !== 'precision') {
			console.warn('[CBSRender] Geçersiz buffer modu. Geçerli değerler: performance | precision');
			return false;
		}
		try {
			if (typeof CbsStorage !== 'undefined' && CbsStorage.setSetting) {
				CbsStorage.setSetting('cbs-render-buffer-mode', normalized);
			} else {
				localStorage.setItem('cbs-render-buffer-mode', normalized);
			}
			console.info('[CBSRender] Buffer modu kaydedildi:', normalized, '• Uygulamak için sayfayı yenileyin.');
			return true;
		} catch (e) {
			console.warn('[CBSRender] Buffer modu kaydedilemedi:', e);
			return false;
		}
	}
};

// Monitoring Service Entegrasyonu
if (window.MonitoringService) {
	window.MonitoringService.setViewer(viewer);
}

// Mobil tespiti (tarayıcı tabanlı — Cesium API'ye bağımlı değil)
var _isMob = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1);
var isMobile = _isMob; // Geriye dönük uyumluluk için

// ── iOS uzun basış: metin seçim balonu + callout menü engeli (YALNIZCA MOBİL) ──
(function () {
	if (!_isMob) return; // Desktop'ta sağ tık menüsü ve metin seçimi korunur
	document.addEventListener('selectstart', function (e) { e.preventDefault(); });
	document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
	document.body && (document.body.style.webkitUserSelect = 'none');
	document.body && (document.body.style.webkitTouchCallout = 'none');
})();

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
// CesiumJS renderError sonrası render döngüsünü durdurur.
// Bu listener: hata panelini kaldırır + render döngüsünü yeniden başlatır.
viewer.scene.renderError.addEventListener(function (scene, error) {
	console.warn('[CBS] Cesium render hatası (otomatik kurtarma):', error && error.message || error);
	TelemetryManager.addLog('RENDER_ERROR', { message: error && error.message ? error.message : String(error || '') }, true);
	// Hata panelini DOM'dan kaldır (Cesium bunu 200ms sonra ekler)
	setTimeout(function () {
		var panel = document.querySelector('.cesium-widget-errorPanel');
		if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
		// Render döngüsünü yeniden başlat
		try {
			viewer.useDefaultRenderLoop = false;
			viewer.useDefaultRenderLoop = true;
			viewer.scene.requestRender();
		} catch (restartErr) {
			console.warn('[CBS] Render yeniden başlatılamadı:', restartErr);
		}
	}, 250);
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
	// Ortografik mod kendi wheel akışını aşağıda yönetiyor.
	if (isOrthographic) return;
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
}, { capture: true, passive: false }); // Capture phase; passive:false zorunlu (içinde stopPropagation var)

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

// Görsel render ofseti (metre) — sadece Z-fighting azaltmak için kullanılır.
var ENTITY_HEIGHT_OFFSET = 0.02;

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
	if (isOrthographic) {
		applyOrthographicTilesetStability(true);
	}
	// zoomTo artık initSplashProgress içinde yönetiliyor (splash kapanma kontrolü için)
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

// ═══════════════════════════════════════════════════════════════
// CLIPBOX — KIRPMA KUTUSU (Faz 1)
// Cesium ClippingPlaneCollection — 6 düzlemli kutu kırpma
// ✂️ tıkla → haritaya tıkla → 30×30×30 kutu anında oluşur
// Koordinat sistemi: tileset boundingSphere merkezi ENU
// ═══════════════════════════════════════════════════════════════
var ClipBoxManager = {
	active: false,
	_placementMode: false,
	_clickHandler: null,
	_escHandler: null,
	_preserveTransformOnNextPlacement: false,

	// Kutu boyutları (metre)
	_halfSize: { x: 15, y: 15, z: 15 },
	// Z ekseni etrafında dönüş (derece)
	_rotationDeg: 0,

	// Clipping planes modelMatrix
	_clipModelMatrix: null,
	// Tıklanan world pozisyonu
	_worldCenter: null,
	// Tıklanan noktadaki temel ENU matrisi
	_baseEnuAtClick: null,
	// ENU matrisi (vektör kırpma için)
	_enuAtClick: null,
	// Tileset clipping origin inverse matrisi
	_inverseOriginMatrix: null,
	// Wireframe entity'leri
	_wireframeEntities: [],
	// Gizlenen entity'ler (vektör kırpma)
	_hiddenEntities: [],
	// Gizlenen primitives (referans + ölçüm)
	_hiddenPrimitives: [],
	// Clip sırasında geçici daraltılmış batch grupları
	_clippedBatchGroupIds: [],
	// _clipEntities çağrılarını frame bazında birleştir
	_clipEntitiesFrame: null,

	_rebuildClipTransforms: function () {
		if (!tileset || !this._baseEnuAtClick || !this._inverseOriginMatrix) return;

		var rotationTransform = buildClipRotationTransform(this._rotationDeg || 0);

		this._enuAtClick = Cesium.Matrix4.multiply(
			this._baseEnuAtClick,
			rotationTransform,
			new Cesium.Matrix4()
		);

		this._clipModelMatrix = Cesium.Matrix4.multiply(
			this._inverseOriginMatrix,
			this._enuAtClick,
			new Cesium.Matrix4()
		);
	},

	_enterPlacementMode: function () {
		if (!tileset) {
			console.warn('ClipBox: Tileset henüz yüklenmedi.');
			return;
		}

		if (this._placementMode) {
			return;
		}

		this._placementMode = true;

		// Cursor crosshair + buton aktif
		viewer.canvas.style.cursor = 'crosshair';
		var btn = document.getElementById('btnClipBox');
		if (btn) btn.classList.add('active');

		// İpucu mesajı
		var rd = document.getElementById('resultDisplay');
		if (rd) {
			rd.style.display = '';
			var rdDiv = rd.querySelector('div');
			if (rdDiv) {
				rdDiv.textContent = this._preserveTransformOnNextPlacement
					? '✂️ Yeni merkez seçin — mevcut boyut ve rotasyon korunacak'
					: '✂️ Kırpma noktası seçmek için haritaya tıklayın';
			}
		}

		// Harita tıklama handler
		var self = this;
		if (this._clickHandler) {
			this._clickHandler.destroy();
			this._clickHandler = null;
		}
		this._clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
		this._clickHandler.setInputAction(function (click) {
			self._onMapClick(click);
		}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

		// ESC ile iptal
		this._escHandler = function (e) {
			if (e.key === 'Escape') self.deactivate();
		};
		document.addEventListener('keydown', this._escHandler);

		TelemetryManager.addLog('ClipBox: Yerleştirme modu');
	},

	// ── AKTİVASYON: YERLEŞTİRME MODUNA GİR ─────────────────
	activate: function () {
		if (!tileset) {
			console.warn('ClipBox: Tileset henüz yüklenmedi.');
			return;
		}

		if (this.active || this._placementMode) {
			this.deactivate();
			return;
		}

		this._preserveTransformOnNextPlacement = false;
		this._enterPlacementMode();
	},

	reposition: function () {
		if (!tileset || this._placementMode) return;

		var preservedHalfSize = {
			x: this._halfSize.x,
			y: this._halfSize.y,
			z: this._halfSize.z
		};
		var preservedRotation = this._rotationDeg || 0;

		this._preserveTransformOnNextPlacement = true;
		if (this.active) {
			this.deactivate();
		}

		this._halfSize = preservedHalfSize;
		this._rotationDeg = preservedRotation;
		this._enterPlacementMode();
	},

	// ── HARİTAYA TIKLANDIĞINDA ──────────────────────────────
	_onMapClick: function (click) {
		if (!this._placementMode) return;

		// pickPosition için depth test geçici olarak aç
		var prevDepth = viewer.scene.globe.depthTestAgainstTerrain;
		viewer.scene.globe.depthTestAgainstTerrain = true;

		// 3D pozisyon al
		var worldPos = viewer.scene.pickPosition(click.position);
		if (!Cesium.defined(worldPos) || Cesium.Cartesian3.equals(worldPos, Cesium.Cartesian3.ZERO)) {
			var ray = viewer.camera.getPickRay(click.position);
			if (ray) worldPos = viewer.scene.globe.pick(ray, viewer.scene);
		}
		viewer.scene.globe.depthTestAgainstTerrain = prevDepth;

		if (!Cesium.defined(worldPos)) {
			console.warn('ClipBox: Pozisyon alınamadı, tekrar deneyin.');
			return;
		}

		// ─── KOORDİNAT HESAPLAMA ─────────────────────────────
		// Cesium resmi yöntemi: clippingPlanesOriginMatrix kullan
		// modelMatrix = inverse(tileset.clippingPlanesOriginMatrix) * ENU(clickedPoint)
		// Bu sayede plane'ler tıklanan noktada merkezlenir
		var enuAtClick = Cesium.Transforms.eastNorthUpToFixedFrame(worldPos);
		var inverseOrigin = Cesium.Matrix4.inverse(
			tileset.clippingPlanesOriginMatrix, new Cesium.Matrix4()
		);

		// Tıklanan world pozisyonunu sakla (wireframe + flyTo için)
		this._worldCenter = Cesium.Cartesian3.clone(worldPos);
		this._baseEnuAtClick = enuAtClick;
		this._inverseOriginMatrix = inverseOrigin;
		this._rotationDeg = this._preserveTransformOnNextPlacement ? (this._rotationDeg || 0) : 0;
		this._preserveTransformOnNextPlacement = false;
		this._rebuildClipTransforms();

		console.log('ClipBox: Yerleştirildi, modelMatrix hesaplandı');

		// Yerleştirme bitir
		this._placementMode = false;
		this.active = true;
		viewer.canvas.style.cursor = '';

		// Click handler temizle
		if (this._clickHandler) {
			this._clickHandler.destroy();
			this._clickHandler = null;
		}

		// Kırpma uygula
		this._applyClipping();

		// Wireframe kutu çiz (vektör kırpmadan ÖNCE, böylece wireframe hariç tutulur)
		this._drawWireframe(worldPos);

		// Vektör verileri de kırp (wireframe'den SONRA çağır)
		this._clipEntities();

		// Mini panel göster
		this._showMiniPanel();

		// resultDisplay güncelle
		var rd = document.getElementById('resultDisplay');
		if (rd) {
			rd.style.display = '';
			var rdDiv = rd.querySelector('div');
			if (rdDiv) rdDiv.textContent = '✂️ Kırpma aktif — kapatmak için ✂️ butonuna veya ESC\'e basın';
		}

		// Kamera kırpma bölgesine uçur
		this._flyToBox(worldPos);

		viewer.scene.requestRender();
		TelemetryManager.addLog('ClipBox yerleştirildi');
	},

	// ── KIRPMA DÜZLEMLERİNİ UYGULA ──────────────────────────
	_applyClipping: function () {
		if (!tileset || !this._clipModelMatrix) return;

		var hx = this._halfSize.x, hy = this._halfSize.y, hz = this._halfSize.z;

		// Mevcut collection varsa — plane distance'ları IN-PLACE güncelle (GPU yeniden tahsis YOK)
		// Bu sayede +/- butonları render döngüsünü bozmadan çalışır
		try {
			var existing = tileset.clippingPlanes;
			if (existing && !existing.isDestroyed() && existing.length === 6) {
				// Sıra: +X, -X, +Y, -Y, +Z, -Z
				existing.modelMatrix = Cesium.Matrix4.clone(
					this._clipModelMatrix,
					existing.modelMatrix || new Cesium.Matrix4()
				);
				existing.get(0).distance = hx;
				existing.get(1).distance = hx;
				existing.get(2).distance = hy;
				existing.get(3).distance = hy;
				existing.get(4).distance = hz;
				existing.get(5).distance = hz;
				existing.enabled = true;
				return; // Erken çık — yeni collection oluşturma
			}
		} catch (e) { /* collection bozuksa, aşağıda yeniden oluştur */ }

		// İlk yerleştirme veya collection yoksa — bir kez oluştur
		var planes = [
			new Cesium.ClippingPlane(new Cesium.Cartesian3(1, 0, 0), hx),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(-1, 0, 0), hx),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 1, 0), hy),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(0, -1, 0), hy),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, 1), hz),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, -1), hz),
		];

		tileset.clippingPlanes = new Cesium.ClippingPlaneCollection({
			planes: planes,
			unionClippingRegions: true,
			edgeColor: Cesium.Color.CYAN,
			edgeWidth: 2.0,
			modelMatrix: this._clipModelMatrix,
			enabled: true
		});
	},

	// ── WİREFRAME KUTU ÇİZ ──────────────────────────────────
	_drawWireframe: function (worldCenter) {
		drawClipOverlayEntities(
			this._wireframeEntities,
			worldCenter,
			this._halfSize,
			this._rotationDeg,
			'#06B6D4',
			0.85,
			2,
			null
		);
	},

	// ── WİREFRAME TEMİZLE ────────────────────────────────────
	_clearWireframe: function () {
		clearClipOverlayEntities(this._wireframeEntities);
		this._wireframeEntities = [];
	},

	// ── VEKTÖR VERİLERİ KIRP ───────────────────────────────
	_clipEntities: function () {
		this._restoreEntities();

		if (!this._enuAtClick) return;

		var invEnu = Cesium.Matrix4.inverse(this._enuAtClick, new Cesium.Matrix4());
		var hx = this._halfSize.x, hy = this._halfSize.y, hz = this._halfSize.z;
		var self = this;

		// Helper: tek entity'yi kontrol et
		function checkAndHide(ent) {
			// Wireframe entity'leri atla
			if (self._wireframeEntities.indexOf(ent) >= 0) return;
			if (ent && ent._clipOverlay) return;
			// Zaten gizli ise atla
			if (!ent.show) return;

			var isInside = false;
			var localPos = new Cesium.Cartesian3();
			var time = viewer.clock.currentTime;

			// Point/Billboard/Label — tek pozisyon
			if (ent.position) {
				var pos = ent.position.getValue ? ent.position.getValue(time) : ent.position;
				if (Cesium.defined(pos)) {
					Cesium.Matrix4.multiplyByPoint(invEnu, pos, localPos);
					if (Math.abs(localPos.x) <= hx && Math.abs(localPos.y) <= hy && Math.abs(localPos.z) <= hz) {
						isInside = true;
					}
				}
			}

			// Polyline — herhangi bir vertex kutu içindeyse göster
			if (!isInside && ent.polyline && ent.polyline.positions) {
				var positions = ent.polyline.positions.getValue ? ent.polyline.positions.getValue(time) : ent.polyline.positions;
				if (positions) {
					for (var j = 0; j < positions.length; j++) {
						Cesium.Matrix4.multiplyByPoint(invEnu, positions[j], localPos);
						if (Math.abs(localPos.x) <= hx && Math.abs(localPos.y) <= hy && Math.abs(localPos.z) <= hz) {
							isInside = true;
							break;
						}
					}
				}
			}

			// Polygon — herhangi bir vertex kutu içindeyse göster
			if (!isInside && ent.polygon && ent.polygon.hierarchy) {
				var hierarchy = ent.polygon.hierarchy.getValue ? ent.polygon.hierarchy.getValue(time) : ent.polygon.hierarchy;
				if (hierarchy && hierarchy.positions) {
					for (var k = 0; k < hierarchy.positions.length; k++) {
						Cesium.Matrix4.multiplyByPoint(invEnu, hierarchy.positions[k], localPos);
						if (Math.abs(localPos.x) <= hx && Math.abs(localPos.y) <= hy && Math.abs(localPos.z) <= hz) {
							isInside = true;
							break;
						}
					}
				}
			}

			// Kutu dışındaysa gizle
			if (!isInside) {
				ent.show = false;
				self._hiddenEntities.push(ent);
			}
		}

		// 1) viewer.entities tara
		var entities = viewer.entities.values;
		for (var i = 0; i < entities.length; i++) {
			checkAndHide(entities[i]);
		}

		// 2) Tüm DataSource'ları tara (drawLayer / Ölçümler dahil)
		for (var d = 0; d < viewer.dataSources.length; d++) {
			var ds = viewer.dataSources.get(d);
			var dsEntities = ds.entities.values;
			for (var e = 0; e < dsEntities.length; e++) {
				checkAndHide(dsEntities[e]);
			}
		}

		// 3) Measurements tara — Entity+Primitive karışık
		if (typeof measurements !== 'undefined') {
			for (var mi = 0; mi < measurements.length; mi++) {
				var m = measurements[mi];
				if (!m.entities || !m.checked) continue;

				// Ölçümün noktalarından herhangi biri kutu içinde mi?
				var mInside = false;
				if (m.points && m.points.length > 0) {
					for (var pi = 0; pi < m.points.length; pi++) {
						var lp = new Cesium.Cartesian3();
						Cesium.Matrix4.multiplyByPoint(invEnu, m.points[pi], lp);
						if (Math.abs(lp.x) <= hx && Math.abs(lp.y) <= hy && Math.abs(lp.z) <= hz) {
							mInside = true;
							break;
						}
					}
				}

				if (!mInside) {
					for (var ei = 0; ei < m.entities.length; ei++) {
						var ent2 = m.entities[ei];
						if (ent2 && ent2.show !== undefined && ent2.show !== false) {
							ent2.show = false;
							self._hiddenPrimitives.push(ent2);
						}
						if (ent2 && ent2.label) ent2.label.show = false;
					}
				}
			}
		}

		// 4) Referans gruplarının _batchPrimitives'ini tara
		if (typeof groups !== 'undefined') {
			var clippedGroupIds = this._clippedBatchGroupIds;

			function markGroupClipped(groupId) {
				if (clippedGroupIds.indexOf(groupId) < 0) {
					clippedGroupIds.push(groupId);
				}
			}

			function unmarkGroupClipped(groupId) {
				var idx = clippedGroupIds.indexOf(groupId);
				if (idx >= 0) {
					clippedGroupIds.splice(idx, 1);
				}
			}

			function measurementHasInsidePoint(measurementPoints) {
				if (!measurementPoints || measurementPoints.length === 0) return false;
				for (var pi = 0; pi < measurementPoints.length; pi++) {
					var glp = new Cesium.Cartesian3();
					Cesium.Matrix4.multiplyByPoint(invEnu, measurementPoints[pi], glp);
					if (Math.abs(glp.x) <= hx && Math.abs(glp.y) <= hy && Math.abs(glp.z) <= hz) {
						return true;
					}
				}
				return false;
			}

			for (var gi = 0; gi < groups.length; gi++) {
				var grp = groups[gi];
				if (!grp._batchPrimitives || !grp.checked) continue;
				var grpInside = false;

				var groupMeasurements = [];
				if (typeof measurements !== 'undefined') {
					for (var gmi = 0; gmi < measurements.length; gmi++) {
						var gm = measurements[gmi];
						if (gm.groupId !== grp.id || !gm.points || gm.points.length === 0) continue;
						if (!gm.isBatched) continue;
						if (gm.checked === false) continue;
						groupMeasurements.push(gm);
					}
				}

				if (groupMeasurements.length > 0) {
					var insideMeasurementIds = {};
					var insideCount = 0;

					for (var gmi2 = 0; gmi2 < groupMeasurements.length; gmi2++) {
						var gm2 = groupMeasurements[gmi2];
						if (measurementHasInsidePoint(gm2.points)) {
							insideMeasurementIds[gm2.id] = true;
							insideCount++;
						}
					}

					grpInside = insideCount > 0;

					// Referans batch gruplarında kısmi kırpma: sadece kutu içindeki öğelerle geçici rebuild
					if (typeof rebuildBatchPrimitives === 'function' && typeof isRefGroup === 'function' && isRefGroup(grp)) {
						if (insideCount > 0 && insideCount < groupMeasurements.length) {
							rebuildBatchPrimitives(grp, function (m) {
								return !!insideMeasurementIds[m.id];
							});
							markGroupClipped(grp.id);
						} else if (clippedGroupIds.indexOf(grp.id) >= 0) {
							// Önceki geçici clip durumu varsa tam batch'i geri kur
							rebuildBatchPrimitives(grp);
							unmarkGroupClipped(grp.id);
						}
					}
				}

				if (!grpInside) {
					for (var bp = 0; bp < grp._batchPrimitives.length; bp++) {
						var prim = grp._batchPrimitives[bp];
						if (prim && prim.show !== false) {
							prim.show = false;
							self._hiddenPrimitives.push(prim);
						}
					}
				}
			}
		}

		console.log('ClipBox: ' + this._hiddenEntities.length + ' entity + ' + this._hiddenPrimitives.length + ' primitive gizlendi');
	},

	_scheduleClipEntities: function () {
		var self = this;
		if (this._clipEntitiesFrame) return;
		this._clipEntitiesFrame = requestAnimationFrame(function () {
			self._clipEntitiesFrame = null;
			self._clipEntities();
			viewer.scene.requestRender();
		});
	},

	// ── GİZLENEN ENTITY'LERİ GERİ GÖSTER ───────────────────
	_restoreEntities: function () {
		for (var i = 0; i < this._hiddenEntities.length; i++) {
			this._hiddenEntities[i].show = true;
		}
		this._hiddenEntities = [];

		// Primitives geri göster
		for (var j = 0; j < this._hiddenPrimitives.length; j++) {
			var p = this._hiddenPrimitives[j];
			if (!p) continue;
			if (typeof p.isDestroyed === 'function' && p.isDestroyed()) continue;
			p.show = true;
			if (p.label) p.label.show = true;
		}
		this._hiddenPrimitives = [];
	},

	_restoreClippedBatchGroups: function () {
		if (!this._clippedBatchGroupIds || this._clippedBatchGroupIds.length === 0) return;
		if (typeof rebuildBatchPrimitives !== 'function' || typeof groups === 'undefined') {
			this._clippedBatchGroupIds = [];
			return;
		}

		for (var i = 0; i < this._clippedBatchGroupIds.length; i++) {
			var groupId = this._clippedBatchGroupIds[i];
			var grp = groups.find(function (g) { return g.id === groupId; });
			if (!grp) continue;
			rebuildBatchPrimitives(grp);
		}

		this._clippedBatchGroupIds = [];
	},

	// ── MİNİ PANEL GÖSTER/GİZLE ────────────────────────────
	_showMiniPanel: function () {
		var panel = document.getElementById('clipMiniPanel');
		if (!panel) return;
		updateClipMiniSliderUi('X', this._halfSize.x * 2);
		updateClipMiniSliderUi('Y', this._halfSize.y * 2);
		updateClipMiniSliderUi('Z', this._halfSize.z * 2);
		updateClipMiniSliderUi('R', this._rotationDeg || 0);
		panel.classList.add('show');
		syncClipMiniActionButtons();
	},

	_hideMiniPanel: function () {
		flushClipMiniPreview(false);
		var panel = document.getElementById('clipMiniPanel');
		if (panel) panel.classList.remove('show');
	},

	// ── BOYUT GÜNCELLE (performanslı) ───────────────────────
	_updateSize: function (axis, fullSize, updateEntities) {
		this._halfSize[axis] = fullSize / 2;

		// Tileset clipping güncelle (çok hızlı — sadece distance değişiyor)
		this._applyClipping();

		// Wireframe yeniden çiz
		if (this._worldCenter) {
			this._drawWireframe(this._worldCenter);
		}

		// Entity kırpma — sadece slider bırakıldığında (change event)
		if (updateEntities) {
			this._scheduleClipEntities();
		}

		viewer.scene.requestRender();
	},

	_updateRotation: function (degrees, updateEntities) {
		this._rotationDeg = degrees;

		if (!this._worldCenter) return;

		this._rebuildClipTransforms();
		this._applyClipping();
		this._drawWireframe(this._worldCenter);

		if (updateEntities) {
			this._scheduleClipEntities();
		}

		viewer.scene.requestRender();
	},

	// ── KAMERA KIRPMA BÖLGESİNE UÇUR ────────────────────────
	_flyToBox: function (worldCenter) {
		var maxDim = Math.max(this._halfSize.x, this._halfSize.y, this._halfSize.z) * 2;
		viewer.camera.flyToBoundingSphere(
			new Cesium.BoundingSphere(worldCenter, maxDim / 2),
			{
				offset: new Cesium.HeadingPitchRange(
					Cesium.Math.toRadians(30),
					Cesium.Math.toRadians(-35),
					maxDim * 2.5
				),
				duration: 1.2
			}
		);
	},

	loadSavedClip: function (clip) {
		if (!clip || !clip.center || !tileset) return;

		this.deactivate();
		this.active = true;
		this._placementMode = false;
		this._worldCenter = Cesium.Cartesian3.clone(clip.center);
		this._baseEnuAtClick = Cesium.Transforms.eastNorthUpToFixedFrame(this._worldCenter);
		this._inverseOriginMatrix = Cesium.Matrix4.inverse(
			tileset.clippingPlanesOriginMatrix,
			new Cesium.Matrix4()
		);
		this._halfSize = {
			x: clip.halfSize.x,
			y: clip.halfSize.y,
			z: clip.halfSize.z
		};
		this._rotationDeg = clip.rotationDeg || 0;
		this._rebuildClipTransforms();
		this._applyClipping();
		this._drawWireframe(this._worldCenter);
		this._clipEntities();
		this._showMiniPanel();
		this._flyToBox(this._worldCenter);

		var btn = document.getElementById('btnClipBox');
		if (btn) btn.classList.add('active');
		viewer.canvas.style.cursor = '';
		viewer.scene.requestRender();
		TelemetryManager.addLog('ClipBox kaydı uygulandı: ' + (clip.name || 'İsimsiz'));
	},

	// ── KAPAT ───────────────────────────────────────────────
	deactivate: function () {
		this.active = false;
		this._placementMode = false;

		if (this._clipEntitiesFrame) {
			cancelAnimationFrame(this._clipEntitiesFrame);
			this._clipEntitiesFrame = null;
		}

		// Click handler temizle
		if (this._clickHandler) {
			this._clickHandler.destroy();
			this._clickHandler = null;
		}

		// ESC handler temizle
		if (this._escHandler) {
			document.removeEventListener('keydown', this._escHandler);
			this._escHandler = null;
		}

		viewer.canvas.style.cursor = '';

		// Kırpma → SADECE enabled=false (asla undefined atama!)
		try {
			if (tileset && tileset.clippingPlanes && !tileset.clippingPlanes.isDestroyed()) {
				tileset.clippingPlanes.enabled = false;
			}
		} catch (e) {
			console.warn('ClipBox cleanup:', e);
		}

		// Wireframe kaldır
		this._clearWireframe();

		// Referans batch gruplarını normal haline döndür
		this._restoreClippedBatchGroups();

		// Gizlenen entity'leri geri göster
		this._restoreEntities();

		// Mini panel gizle
		this._hideMiniPanel();

		// UI sıfırla
		var rd = document.getElementById('resultDisplay');
		if (rd) {
			rd.style.display = '';
			var rdDiv = rd.querySelector('div');
			if (rdDiv) rdDiv.textContent = 'Araç seçin ve haritaya tıklayın.';
		}

		var btn = document.getElementById('btnClipBox');
		if (btn) btn.classList.remove('active');

		this._clipModelMatrix = null;
		this._worldCenter = null;
		this._baseEnuAtClick = null;
		this._enuAtClick = null;
		this._inverseOriginMatrix = null;
		this._hiddenPrimitives = [];
		this._clippedBatchGroupIds = [];
		this._rotationDeg = 0;

		viewer.scene.requestRender();
		TelemetryManager.addLog('ClipBox kapatıldı');
	}
};

// ── CLIPBOX EVENT BAĞLANTILARI ──────────────────────────────
(function () {
	// ── Slider canlı önizleme: rAF ile sınırlı, entity clip commit'i sadece bırakınca

	// ── ± Buton Handler'ları ──
	var pmBtns = document.querySelectorAll('.clip-pm-btn-lg');
	pmBtns.forEach(function (btn) {
		btn.addEventListener('click', function () {
			flushClipMiniPreview(false);
			var axis = btn.getAttribute('data-axis');
			var dir = parseInt(btn.getAttribute('data-dir'), 10);
			var slider = document.getElementById('clipMini' + axis);
			if (!slider) return;

			var currentVal = parseInt(slider.value, 10) || 0;
			var newVal = axis === 'R'
				? Math.max(-180, Math.min(180, currentVal + dir * 5))
				: Math.max(5, Math.min(100, currentVal + dir * 5));
			applyClipMiniAxisValue(axis, newVal, true);
		});
	});

	var sliders = document.querySelectorAll('.clip-mini-slider');
	sliders.forEach(function (slider) {
		slider.addEventListener('input', function () {
			var axis = slider.getAttribute('data-axis');
			var newVal = parseInt(slider.value, 10) || 0;
			scheduleClipMiniPreview(axis, newVal);
		});

		slider.addEventListener('change', function () {
			var axis = slider.getAttribute('data-axis');
			var newVal = parseInt(slider.value, 10) || 0;
			flushClipMiniPreview(false);
			applyClipMiniAxisValue(axis, newVal, true);
		});
	});

	// Sıfırla butonu
	var resetBtn = document.getElementById('clipMiniReset');
	if (resetBtn) {
		resetBtn.addEventListener('click', function () {
			flushClipMiniPreview(false);
			['X', 'Y', 'Z'].forEach(function (a) {
				updateClipMiniSliderUi(a, 30);
			});
			updateClipMiniSliderUi('R', 0);
			ClipBoxManager._halfSize = { x: 15, y: 15, z: 15 };
			ClipBoxManager._rotationDeg = 0;
			ClipBoxManager._rebuildClipTransforms();
			ClipBoxManager._applyClipping();
			if (ClipBoxManager._worldCenter) {
				ClipBoxManager._drawWireframe(ClipBoxManager._worldCenter);
			}
			ClipBoxManager._scheduleClipEntities();
			viewer.scene.requestRender();
		});
	}

	var repositionBtn = document.getElementById('clipMiniReposition');
	if (repositionBtn) {
		repositionBtn.addEventListener('click', function () {
			flushClipMiniPreview(false);
			ClipBoxManager.reposition();
		});
	}

	// Odakla butonu
	var flyBtn = document.getElementById('clipMiniFlyTo');
	if (flyBtn) {
		flyBtn.addEventListener('click', function () {
			if (ClipBoxManager._worldCenter) {
				ClipBoxManager._flyToBox(ClipBoxManager._worldCenter);
			}
		});
	}

	var saveBtn = document.getElementById('clipMiniSave');
	if (saveBtn) {
		saveBtn.addEventListener('click', function () {
			saveCurrentClipBox();
		});
	}

	var updateBtn = document.getElementById('clipMiniUpdate');
	if (updateBtn) {
		updateBtn.addEventListener('click', function () {
			updateSelectedSavedClipBox();
		});
	}

	// Küçült butonu
	var minimizeBtn = document.getElementById('clipMiniMinimize');
	if (minimizeBtn) {
		minimizeBtn.addEventListener('click', function () {
			var panel = document.getElementById('clipMiniPanel');
			var icon = minimizeBtn.querySelector('.material-symbols-outlined');
			if (panel.classList.toggle('minimized')) {
				if (icon) icon.textContent = 'add';
			} else {
				if (icon) icon.textContent = 'remove';
			}
		});
	}

	// Kapat butonu
	var closeBtn = document.getElementById('clipMiniClose');
	if (closeBtn) {
		closeBtn.addEventListener('click', function () {
			ClipBoxManager.deactivate();
		});
	}

	var btnClipBox = document.getElementById('btnClipBox');
	if (btnClipBox) {
		btnClipBox.addEventListener('click', function () {
			ClipBoxManager.activate();
		});
	}

	updateClipMiniSliderUi('X', 30);
	updateClipMiniSliderUi('Y', 30);
	updateClipMiniSliderUi('Z', 30);
	updateClipMiniSliderUi('R', 0);
	if (!Array.isArray(savedClipBoxes)) savedClipBoxes = [];
	if (typeof selectedSavedClipBoxId === 'undefined') selectedSavedClipBoxId = null;
	syncClipMiniActionButtons();
})();

// ─── SPLASH SCREEN: Gerçek tileset yükleme progress'i ───
function initSplashProgress(ts) {
	var splash = document.getElementById('splashScreen');
	if (!splash) return;

	var percentText = document.getElementById('splashPercent');
	var progressBar = document.getElementById('splashProgressBar');
	var statusText = document.getElementById('splashStatusText');

	var startTime = Date.now();
	var MIN_SHOW = 3500;
	var MAX_SHOW = 22000;
	var dismissed = false;
	var modelReady = false;
	var fontsReady = false;
	var zoomReady = false;
	var currentPercent = 5;

	function setStatus(msg) {
		if (statusText) statusText.textContent = msg;
	}

	function updateProgress(pct) {
		currentPercent = Math.min(Math.max(pct, currentPercent), 100);
		var rounded = Math.round(currentPercent);
		if (percentText) percentText.textContent = rounded + '%';
		if (progressBar) progressBar.style.width = rounded + '%';
	}

	function dismiss() {
		if (dismissed) return;
		dismissed = true;
		// Cesium listener'larını temizle — memory leak önleme
		if (typeof removeTileLoad === 'function') removeTileLoad();
		if (typeof removeLoadProgress === 'function') removeLoadProgress();
		if (typeof removeInitialTiles === 'function') removeInitialTiles();
		if (typeof _fontPollTimer !== 'undefined' && _fontPollTimer) {
			clearInterval(_fontPollTimer);
			_fontPollTimer = null;
		}
		// %100 ve "Hazır!" mesajını göster, sonra kapat
		updateProgress(100);
		setStatus('✓ Sistem hazır!');
		if (statusText) {
			statusText.style.cssText = 'background:#4ade80;color:#fff;font-weight:700;padding:2px 10px;border-radius:999px;font-size:12px;';
		}
		// Tema geçişini splash opakken yap — kullanıcı görmez
		document.documentElement.classList.remove('dark');
		document.documentElement.classList.add('light');
		// 1000ms "Hazır!" göster, sonra kapat
		setTimeout(function () {
			splash.style.opacity = '0';
			setTimeout(function () {
				splash.remove();
				document.dispatchEvent(new CustomEvent('splashDismissed'));
			}, 1000);
		}, 2000);
	}

	function tryDismiss() {
		if (dismissed) return;
		var elapsed = Date.now() - startTime;
		var storageOK = window._splashMeasuresReady && window._splashImportsReady;
		if (modelReady && fontsReady && zoomReady && storageOK && elapsed >= MIN_SHOW) dismiss();
	}

	// ── Başlangıç mesajı ──
	setStatus(window.AppMessages && window.AppMessages.SPLASH_LOAD_3D || '3D model yükleniyor...');

	// ── Font / pencere hazırlık kontrolü ──
	var _windowLoaded = false;
	window.addEventListener('load', function () { _windowLoaded = true; checkAllReady(); });

	function checkIconFont() {
		try { return document.fonts.check('48px "Material Symbols Outlined"'); } catch (e) { return false; }
	}

	function checkAllReady() {
		if (fontsReady) return;
		if (_windowLoaded && checkIconFont()) {
			fontsReady = true;
			tryDismiss();
		}
	}

	var _fontPollTimer = setInterval(function () {
		checkAllReady();
		if (fontsReady) clearInterval(_fontPollTimer);
	}, 200);

	setTimeout(function () {
		if (!fontsReady) { fontsReady = true; tryDismiss(); }
		clearInterval(_fontPollTimer);
	}, 8000);

	// ── Başlangıç ilerleme: 5 → 45  (model parse edilirken) ──
	var _rampTimer = setInterval(function () {
		if (dismissed || currentPercent >= 45) { clearInterval(_rampTimer); return; }
		updateProgress(currentPercent + 1);
	}, 120);

	// ── Tile yükleme: 45 → 88 ──
	var tilesLoaded = 0;
	var tilesTotal = 0;

	var removeTileLoad = ts.tileLoad.addEventListener(function () {
		tilesLoaded++;
		if (currentPercent < 46) setStatus('3D veriler yükleniyor...');
		if (tilesTotal > 0) {
			updateProgress(45 + (tilesLoaded / tilesTotal) * 43);
		} else {
			updateProgress(Math.min(45 + tilesLoaded * 2, 80));
		}
	});

	var removeLoadProgress = ts.loadProgress.addEventListener(function (pending, processing) {
		tilesTotal = Math.max(tilesTotal, tilesLoaded + pending + processing);
	});

	// ── initialTilesLoaded: 88 → 90 ──
	var removeInitialTiles = ts.initialTilesLoaded.addEventListener(function () {
		if (!modelReady) {
			modelReady = true;
			setStatus(window.AppMessages && window.AppMessages.SPLASH_LOAD_MODEL_READY || 'Model hazır, açılıyor...');
			updateProgress(90);
			tryDismiss();
		}
	});

	// ── zoomTo: 90 → 95 ──
	viewer.zoomTo(ts).then(function () {
		zoomReady = true;
		setStatus('Harita konumlandırılıyor...');
		updateProgress(Math.max(currentPercent, 93));
		tryDismiss();
	}).catch(function () {
		zoomReady = true;
		tryDismiss();
	});

	// ── Storage: 95 → 99 ──
	document.addEventListener('splashStorageReady', function () {
		setStatus('Kayıtlı veriler geri yükleniyor...');
		updateProgress(Math.max(currentPercent, 97));
		tryDismiss();
	});

	setTimeout(tryDismiss, MIN_SHOW);
	setTimeout(dismiss, MAX_SHOW);
}

// SPLASH: RASTGELE KISAYOL İPUÇLARI
document.addEventListener('DOMContentLoaded', function () {
	var container = document.getElementById('splashTips');
	if (!container) return;

	// Önce placeholder'ları temizle
	container.innerHTML = '';

	var tips = [];
	if (window.AppMessages && window.AppMessages.SPLASH_TIPS_MOBILE) {
		tips = window.AppMessages.SPLASH_TIPS_MOBILE.slice();
	}

	// Fisher-Yates shuffle → ilk 3 tane
	for (var i = tips.length - 1; i > 0; i--) {
		var j = Math.floor(Math.random() * (i + 1));
		var tmp = tips[i]; tips[i] = tips[j]; tips[j] = tmp;
	}

	for (var k = 0; k < Math.min(3, tips.length); k++) {
		var row = document.createElement('div');
		row.className = 'flex items-center justify-between';
		row.innerHTML =
			'<span style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);'
			+ 'color:#4ade80;font-size:10px;padding:1px 7px;border-radius:4px;white-space:nowrap;letter-spacing:0.05em">'
			+ tips[k].key + '</span>'
			+ '<span style="color:#94a3b8;font-size:11px">' + tips[k].text + '</span>';
		container.appendChild(row);
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
// themeIcon metnini güncelle (tema geçişi dismiss() içinde yapılıyor)
if (themeIcon) themeIcon.textContent = 'light_mode';
// Splash yoksa (yeniden yüklemede zaten kapanmışsa) hemen light moda geç
if (!document.getElementById('splashScreen')) {
	document.documentElement.classList.remove('dark');
	document.documentElement.classList.add('light');
}
if (btnThemeToggle) {
	btnThemeToggle.addEventListener('click', function () {
		var html = document.documentElement;
		if (html.classList.contains('dark')) {
			html.classList.remove('dark');
			html.classList.add('light');
			themeIcon.textContent = 'light_mode';
			CbsStorage.setSetting('cbs-theme', 'light');
		} else {
			html.classList.remove('light');
			html.classList.add('dark');
			themeIcon.textContent = 'dark_mode';
			CbsStorage.setSetting('cbs-theme', 'dark');
		}
		applyInfoPanelTheme(document.getElementById('infoPanel'));
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

// ─── INFO MODE BUTONU (Araçlar Panelinde) ──────────────────────
var btnInfoMode = document.getElementById('btnInfoMode');
if (btnInfoMode) {
	btnInfoMode.addEventListener('click', function () {
		toggleInfoMode();
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

	// [FIX-3] Sekme görünmezken FPS izlemeyi durdur — mobil pil tüketimini azaltır
	var _fpsInterval = null;
	function _startFpsInterval() {
		if (_fpsInterval) return;
		_fpsInterval = setInterval(function () {
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
	}
	_startFpsInterval();
	document.addEventListener('visibilitychange', function () {
		if (document.hidden) {
			clearInterval(_fpsInterval);
			_fpsInterval = null;
		} else {
			_startFpsInterval();
		}
	});

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

// ═══ PERFORMANS BENCHMARK (JANK / LONG TASK / TILE QUEUE) ═══
// CBSPerf.sample(15000) çağrısı ile 15sn ölçüm alır.
// Rapor: ortalama FPS, %1 low FPS, p95 frame time, jank oranı, long task ve tile kuyruğu.
(function () {
	var _isSampling = false;
	var _sampleStartMs = 0;
	var _sampleTimer = null;
	var _sampleLastFrame = 0;
	var _frameTimes = [];
	var _longTaskDurations = [];
	var _longTaskObserver = null;
	var _tilesPendingPeak = 0;
	var _tilesProcessingPeak = 0;
	var _tilesSelectedPeak = 0;
	var _startHeapMB = null;
	var _lastReport = null;

	function _readHeapMB() {
		if (performance && performance.memory && typeof performance.memory.usedJSHeapSize === 'number') {
			return performance.memory.usedJSHeapSize / (1024 * 1024);
		}
		return null;
	}

	function _round(value, digits) {
		var d = typeof digits === 'number' ? digits : 2;
		if (typeof value !== 'number' || !isFinite(value)) return null;
		var k = Math.pow(10, d);
		return Math.round(value * k) / k;
	}

	function _percentile(sorted, q) {
		if (!sorted || sorted.length === 0) return null;
		var idx = (sorted.length - 1) * q;
		var low = Math.floor(idx);
		var high = Math.ceil(idx);
		if (low === high) return sorted[low];
		return sorted[low] + (sorted[high] - sorted[low]) * (idx - low);
	}

	function _toast(message, kind) {
		var el = document.createElement('div');
		var isWarn = kind === 'warn';
		el.style.cssText =
			'position:fixed;bottom:22px;left:22px;z-index:9999;padding:10px 14px;border-radius:10px;' +
			'background:' + (isWarn ? 'rgba(127,29,29,0.92)' : 'rgba(15,23,42,0.92)') + ';' +
			'color:#e2e8f0;border:1px solid ' + (isWarn ? 'rgba(248,113,113,0.35)' : 'rgba(56,189,248,0.3)') + ';' +
			'font:600 11px/1.45 Inter, sans-serif;max-width:420px;box-shadow:0 8px 28px rgba(0,0,0,.45);';
		el.textContent = message;
		document.body.appendChild(el);
		setTimeout(function () {
			if (el && el.parentNode) el.parentNode.removeChild(el);
		}, 4500);
	}

	function _startLongTaskObserver() {
		if (!window.PerformanceObserver) return;
		if (!PerformanceObserver.supportedEntryTypes || PerformanceObserver.supportedEntryTypes.indexOf('longtask') === -1) return;
		try {
			_longTaskObserver = new PerformanceObserver(function (list) {
				var entries = list.getEntries();
				for (var i = 0; i < entries.length; i++) {
					var dur = entries[i].duration;
					if (typeof dur === 'number' && isFinite(dur)) _longTaskDurations.push(dur);
				}
			});
			_longTaskObserver.observe({ entryTypes: ['longtask'] });
		} catch (e) {
			_longTaskObserver = null;
		}
	}

	function _stopLongTaskObserver() {
		if (_longTaskObserver) {
			try { _longTaskObserver.disconnect(); } catch (e) { }
			_longTaskObserver = null;
		}
	}

	function _onSampleFrame() {
		var now = performance.now();
		if (_sampleLastFrame > 0) {
			_frameTimes.push(now - _sampleLastFrame);
		}
		_sampleLastFrame = now;

		if (tileset && tileset.statistics) {
			var s = tileset.statistics;
			_tilesPendingPeak = Math.max(_tilesPendingPeak, s.numberOfPendingRequests || 0);
			_tilesProcessingPeak = Math.max(_tilesProcessingPeak, s.numberOfTilesProcessing || 0);
			_tilesSelectedPeak = Math.max(_tilesSelectedPeak, s.numberOfTilesSelected || 0);
		}
	}

	function _buildReport(durationMs, label) {
		var sorted = _frameTimes.slice().sort(function (a, b) { return a - b; });
		var count = sorted.length;
		var sum = 0;
		for (var i = 0; i < sorted.length; i++) sum += sorted[i];

		var avgFrameMs = count > 0 ? sum / count : null;
		var p95FrameMs = _percentile(sorted, 0.95);
		var p99FrameMs = _percentile(sorted, 0.99);
		var worstFrameMs = count > 0 ? sorted[sorted.length - 1] : null;

		var jankCount = 0;
		var severeJankCount = 0;
		for (var j = 0; j < sorted.length; j++) {
			if (sorted[j] > 33.3) jankCount++;
			if (sorted[j] > 50.0) severeJankCount++;
		}

		var longTaskTotal = 0;
		var longTaskMax = 0;
		for (var k = 0; k < _longTaskDurations.length; k++) {
			longTaskTotal += _longTaskDurations[k];
			if (_longTaskDurations[k] > longTaskMax) longTaskMax = _longTaskDurations[k];
		}

		var endHeapMB = _readHeapMB();

		return {
			label: label || 'manual',
			durationMs: _round(durationMs, 0),
			frames: count,
			avgFps: avgFrameMs ? _round(1000 / avgFrameMs, 1) : null,
			onePercentLowFps: p99FrameMs ? _round(1000 / p99FrameMs, 1) : null,
			avgFrameMs: _round(avgFrameMs, 2),
			p95FrameMs: _round(p95FrameMs, 2),
			worstFrameMs: _round(worstFrameMs, 2),
			jankRatioPct: count > 0 ? _round((jankCount / count) * 100, 1) : null,
			severeJankRatioPct: count > 0 ? _round((severeJankCount / count) * 100, 1) : null,
			longTaskCount: _longTaskDurations.length,
			longTaskTotalMs: _round(longTaskTotal, 1),
			longTaskMaxMs: _round(longTaskMax, 1),
			tilePendingPeak: _tilesPendingPeak,
			tileProcessingPeak: _tilesProcessingPeak,
			tileSelectedPeak: _tilesSelectedPeak,
			heapStartMB: _round(_startHeapMB, 1),
			heapEndMB: _round(endHeapMB, 1),
			heapDeltaMB: (_startHeapMB !== null && endHeapMB !== null) ? _round(endHeapMB - _startHeapMB, 1) : null,
			timestamp: new Date().toISOString()
		};
	}

	function _stopSample(label) {
		if (!_isSampling) return _lastReport;

		_isSampling = false;
		if (_sampleTimer) {
			clearTimeout(_sampleTimer);
			_sampleTimer = null;
		}
		viewer.scene.postRender.removeEventListener(_onSampleFrame);
		_stopLongTaskObserver();

		var durationMs = performance.now() - _sampleStartMs;
		_lastReport = _buildReport(durationMs, label);

		try {
			TelemetryManager.addLog('PERF_BENCHMARK', _lastReport, false);
		} catch (e) { }

		if (_lastReport && _lastReport.avgFps !== null) {
			var summary =
				'Benchmark bitti • Avg FPS: ' + _lastReport.avgFps +
				' • %1 low: ' + (_lastReport.onePercentLowFps !== null ? _lastReport.onePercentLowFps : '-') +
				' • Jank: ' + (_lastReport.jankRatioPct !== null ? _lastReport.jankRatioPct + '%' : '-');
			_toast(summary, (_lastReport.jankRatioPct !== null && _lastReport.jankRatioPct > 8) ? 'warn' : 'info');
			console.table(_lastReport);
			console.log('[CBSPerf] Detaylı rapor:', _lastReport);
		}

		return _lastReport;
	}

	function _startSample(durationMs, label) {
		if (_isSampling) {
			return Promise.resolve(_lastReport);
		}

		var ms = Math.max(3000, Number(durationMs) || 15000);
		_isSampling = true;
		_sampleStartMs = performance.now();
		_sampleLastFrame = 0;
		_frameTimes = [];
		_longTaskDurations = [];
		_tilesPendingPeak = 0;
		_tilesProcessingPeak = 0;
		_tilesSelectedPeak = 0;
		_startHeapMB = _readHeapMB();

		viewer.scene.postRender.addEventListener(_onSampleFrame);
		_startLongTaskObserver();

		_toast('Performans benchmark başladı (' + Math.round(ms / 1000) + 's). Bu sırada normal kullanım senaryonu uygula.', 'info');

		return new Promise(function (resolve) {
			_sampleTimer = setTimeout(function () {
				resolve(_stopSample(label));
			}, ms);
		});
	}

	window.CBSPerf = {
		sample: function (durationMs, label) { return _startSample(durationMs, label); },
		stop: function (label) { return _stopSample(label); },
		isSampling: function () { return _isSampling; },
		lastReport: function () { return _lastReport; }
	};
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

	function getDrawerButtonRight() {
		var panelWidth = panel.getBoundingClientRect().width || 320;
		return (Math.round(panelWidth) + 16) + 'px';
	}

	function syncDrawerButtonOffset() {
		btn.style.right = getDrawerButtonRight();
	}

	function openDrawer() {
		_drawerIsOpen = true;
		panel.style.transform = 'translateX(0)';
		icon.textContent = 'chevron_right';
		syncDrawerButtonOffset();
		if (label) label.style.display = 'none';
		CbsStorage.setSetting('cbs-drawer', 'open');
	}

	function closeDrawer() {
		_drawerIsOpen = false;
		panel.style.transform = 'translateX(calc(100% + 16px))';
		icon.textContent = 'chevron_left';
		btn.style.right = '0';
		if (label) { label.style.display = ''; positionLabel('0'); }
		CbsStorage.setSetting('cbs-drawer', 'closed');
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

	// Başlangıçta: son kullanıcı tercihini uygula (yoksa açık başlat)
	var savedDrawerState = null;
	try {
		savedDrawerState = CbsStorage.getSetting('cbs-drawer');
	} catch (e) { }
	if (savedDrawerState === 'closed') {
		closeDrawer();
	} else {
		openDrawer();
	}

	// Pencere boyutu değişince panel açıkken toggle offsetini, kapalıyken label pozisyonunu güncelle
	window.addEventListener('resize', function () {
		if (_drawerIsOpen) syncDrawerButtonOffset();
		else positionLabel('0');
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
		if (isInfoPanelVisible()) scheduleInfoPanelDockSync();
		CbsStorage.setSetting('cbs-toolpanel', 'open');
	}

	function closeToolPanel() {
		_toolPanelIsOpen = false;
		panel.style.transform = 'translateX(calc(-100% + 28px))';
		icon.textContent = 'chevron_right';
		if (isInfoPanelVisible()) scheduleInfoPanelDockSync();
		CbsStorage.setSetting('cbs-toolpanel', 'closed');
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

	// T tuşu: Üstten görünüm
	if (e.key === 't' || e.key === 'T') {
		var topBtn = document.querySelector('.camera-angle-btn[data-pitch="-90"]');
		if (topBtn) topBtn.click();
	}

	// O tuşu: Ortografik projeksiyon
	if (e.key === 'o' || e.key === 'O') {
		var orthoBtn = document.querySelector('.camera-proj-btn[data-proj="orthographic"]');
		if (orthoBtn) orthoBtn.click();
	}

	// P tuşu: Perspektif projeksiyon
	if (e.key === 'p' || e.key === 'P') {
		var perspectiveBtn = document.querySelector('.camera-proj-btn[data-proj="perspective"]');
		if (perspectiveBtn) perspectiveBtn.click();
	}

	// X tuşu: X-Ray toggle
	if (e.key === 'x' || e.key === 'X') {
		var xrayBtn = document.getElementById('btnXRayToggle');
		if (xrayBtn) xrayBtn.click();
	}

	// K tuşu: 15sn performans benchmark başlat
	if (e.key === 'k' || e.key === 'K') {
		if (window.CBSPerf && !window.CBSPerf.isSampling()) {
			window.CBSPerf.sample(15000, 'keyboard');
		}
	}
});

// ─── X-RAY MODU: Tüm vektör verileri 3B modelin önünde göster ───
var _xrayActive = false;
var _xrayIconOff = '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor" style="opacity:0.8;"><path d="m880-194-80-80v-286H514l-80-80h366q33 0 56.5 23.5T880-560v366ZM560-720v-80H274l-80-80h366q33 0 56.5 23.5T640-800v80h-80Zm97 303ZM400-160h286L400-446v286ZM823-23l-57-57H400q-34 0-57-23t-23-57v-366L160-686v286h80v80h-80q-34 0-57-23t-23-57v-366l-57-57 57-57L880-80l-57 57ZM543-303Z"/></svg>';
var _xrayIconOn = '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M240-400v80h-80q-33 0-56.5-23.5T80-400v-400q0-33 23.5-56.5T160-880h400q33 0 56.5 23.5T640-800v80h-80v-80H160v400h80ZM400-80q-33 0-56.5-23.5T320-160v-400q0-33 23.5-56.5T400-640h400q33 0 56.5 23.5T880-560v400q0 33-23.5 56.5T800-80H400Z"/></svg>';

function toggleXRay() {
	_xrayActive = !_xrayActive;
	var btn = document.getElementById('btnXRayToggle');

	// Buton görsel durumu + ikon güncelle
	if (btn) {
		var svgSpan = btn.querySelector('.xray-icon');
		if (_xrayActive) {
			btn.style.background = 'rgba(59, 130, 246, 0.15)';
			btn.style.borderColor = 'rgba(59, 130, 246, 0.5)';
			btn.style.opacity = '1';
			btn.style.color = '#3B82F6';
			if (svgSpan) svgSpan.innerHTML = _xrayIconOn;
		} else {
			btn.style.background = 'transparent';
			btn.style.borderColor = 'transparent';
			btn.style.opacity = '0.5';
			btn.style.color = '';
			if (svgSpan) svgSpan.innerHTML = _xrayIconOff;
		}
	}

	// 1. Manuel ölçüm entity'leri — measurements dizisinden
	measurements.forEach(function (m) {
		if (m.isBatched) return; // Batch olanlar aşağıda ayrı işlenir
		m.entities.forEach(function (ent) {
			applyXRayToPrimitive(ent, _xrayActive);
		});
	});

	// 2. Batch import primitifleri — grupların _batchPrimitives'inden
	groups.forEach(function (g) {
		if (!g._batchPrimitives) return;
		g._batchPrimitives.forEach(function (p) {
			applyXRayToPrimitive(p, _xrayActive);
		});
	});

	// 3. Batch seçim overlay primitifleri (aktif seçili import vurgusu)
	if (Array.isArray(_batchedSelectionOverlay) && _batchedSelectionOverlay.length > 0) {
		_batchedSelectionOverlay.forEach(function (item) {
			applyXRayToPrimitive(item, _xrayActive);
		});
	}

	// 4. Edit modu geçici primitifleri (aktif edit varsa anında senkron)
	if (typeof EditManager !== 'undefined' && EditManager) {
		if (EditManager._editLinePrim) applyXRayToPrimitive(EditManager._editLinePrim, _xrayActive);
		if (EditManager._editPolyPrim) applyXRayToPrimitive(EditManager._editPolyPrim, _xrayActive);
		if (Array.isArray(EditManager._gripCols)) {
			EditManager._gripCols.forEach(function (g) {
				if (!g || !g.col || typeof g.col.get !== 'function') return;
				var p = g.pt || (g.col.length > 0 ? g.col.get(0) : null);
				if (p) p.disableDepthTestDistance = _xrayActive ? Number.POSITIVE_INFINITY : 0;
			});
		}
	}

	viewer.scene.requestRender();
}

// Tek bir primitive/collection/entity'ye X-Ray uygula veya kaldır
// X-Ray stratejisi:
//   A) PointPrimitiveCollection → disableDepthTestDistance = Infinity
//   B) LabelCollection          → disableDepthTestDistance = Infinity
//   C) Cesium.Primitive         → renderState.depthTest (polyline: tek draw-call)
//                                 depthFailAppearance    (polygon: standart yol)
//   D) Cesium.Entity            → ConstantProperty ile disableDepthTestDistance
function applyXRayToPrimitive(prim, enable) {
	if (!prim) return;
	if (typeof prim.isDestroyed === 'function' && prim.isDestroyed()) return;
	try {
		// ── A) PointPrimitiveCollection ──────────────────────────────────────
		if (prim instanceof Cesium.PointPrimitiveCollection) {
			for (var i = 0; i < prim.length; i++) {
				prim.get(i).disableDepthTestDistance = enable ? Number.POSITIVE_INFINITY : 0;
			}
			// addPointLabel() fonksiyonu label'ı .label olarak bağlar
			if (prim.label) applyXRayToPrimitive(prim.label, enable);
			return;
		}

		// ── B) LabelCollection ───────────────────────────────────────────────
		if (prim instanceof Cesium.LabelCollection) {
			for (var j = 0; j < prim.length; j++) {
				prim.get(j).disableDepthTestDistance = enable ? Number.POSITIVE_INFINITY : 0;
			}
			return;
		}

		// ── C) Cesium.Primitive ──────────────────────────────────────────────
		if (prim instanceof Cesium.Primitive) {
			if (!prim.appearance) return;

			// Polygon fill tespiti: Manuel → _isPolygonFill, Batch import → _isFillBatch
			var isPolygonType = prim._isPolygonFill || prim._isFillBatch;

			if (isPolygonType) {
				// Polygon (MaterialAppearance): depthFailAppearance yolu
				// Aynı appearance obje referansı: CesiumJS tek-pass shader, temiz ON/OFF
				if (enable) {
					if (!prim.depthFailAppearance) {
						prim.depthFailAppearance = prim.appearance;
					}
				} else {
					prim.depthFailAppearance = null;
				}
			} else {
				// Polyline (PolylineMaterialAppearance): renderState.depthTest yolu
				// async batch primitive'lerde .material henüz null olabilir
				if (!prim.appearance.material) return;
				var currentMaterial = prim.appearance.material;
				prim.appearance = new Cesium.PolylineMaterialAppearance({
					material: currentMaterial,
					translucent: false,
					renderState: {
						depthTest: { enabled: !enable }
					}
				});
				if (!enable) prim.depthFailAppearance = null;
			}
			return;
		}

		// ── D) Cesium.Entity (P_mid gibi entity API ile oluşturulanlar) ──────
		// Entity property'leri için düz sayı değil ConstantProperty kullan
		if (prim instanceof Cesium.Entity) {
			var ddt = new Cesium.ConstantProperty(enable ? Number.POSITIVE_INFINITY : 0);
			if (prim.point) prim.point.disableDepthTestDistance = ddt;
			if (prim.label) prim.label.disableDepthTestDistance = ddt;
			if (prim.billboard) prim.billboard.disableDepthTestDistance = ddt;
			return;
		}

	} catch (e) {
		console.warn('[XRay] applyXRayToPrimitive hata:', e, prim);
	}
}

// X-Ray butonunu bağla
(function () {
	var btn = document.getElementById('btnXRayToggle');
	if (btn) btn.addEventListener('click', toggleXRay);
})();

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
	if (satelliteLayer) satelliteLayer.show = true;
	streetLayer.show = false;
	setLayerBtnActive(btnSatellite, true);
	setLayerBtnActive(btnStreet, false);
	viewer.scene.requestRender();
});

btnStreet.addEventListener('click', function () {
	streetLayer.show = true;
	if (satelliteLayer) satelliteLayer.show = false;
	setLayerBtnActive(btnStreet, true);
	setLayerBtnActive(btnSatellite, false);
	viewer.scene.requestRender();
});

// Başlangıç durumu: Sokak aktif
setLayerBtnActive(btnStreet, true);
setLayerBtnActive(btnSatellite, false);

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
		if (this.disabled) return;

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
			tileset.shadows = Cesium.ShadowMode.DISABLED;
		}
		viewer.shadows = false;
		if (viewer.scene.postProcessStages.ambientOcclusion) {
			viewer.scene.postProcessStages.ambientOcclusion.enabled = false;
		}

		// Sahne ortamını başlangıç durumuna döndür (Solid mod bunları değiştirir)
		// NOT: skyAtmosphere başlangıçta kapalı (satır 138), tekrar açmıyoruz
		// NOT: globe.show başlangıçta kapalı (satır 143), tekrar açmıyoruz
		// NOT: skyBox file:// modunda başlangıçta kapalı (satır 141)
		if (viewer.scene.skyBox) viewer.scene.skyBox.show = !isLocalFile;
		if (viewer.scene.sun) viewer.scene.sun.show = true;
		if (viewer.scene.moon) viewer.scene.moon.show = true;
		viewer.scene.backgroundColor = new Cesium.Color(0, 0, 0, 1); // Varsayılan siyah
		viewer.scene.highDynamicRange = false; // Başlangıçta kapalı — açık olursa kontrast artar

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
					translucencyMode: Cesium.CustomShaderTranslucencyMode.TRANSLUCENT,
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
		// requestRenderMode açık — mod geçişini anında yansıt
		viewer.scene.requestRender();
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
	aspectRatio: viewer.canvas.clientWidth / viewer.canvas.clientHeight,
	near: _isMob ? 1.0 : 0.1
});
var ORTHOGRAPHIC_MIN_CLEARANCE = 80.0; // Resmi ortofoto bakış için model üstünde güvenli minimum yükseklik
var ORTHOGRAPHIC_NADIR_PITCH = Cesium.Math.toRadians(-90.0);
var ORTHOGRAPHIC_FRUSTUM_NEAR = 0.01;
var ORTHOGRAPHIC_FRUSTUM_FAR = 50000000.0;
var _savedDynamicScreenSpaceError = null;
var _savedCullWithChildrenBounds = null;

function updateProjectionAspectRatios() {
	var aspect = viewer.canvas.clientWidth / Math.max(1, viewer.canvas.clientHeight);
	perspectiveFrustum.aspectRatio = aspect;
	orthographicFrustum.aspectRatio = aspect;
}

function applyOrthographicFrustumPrecision() {
	updateProjectionAspectRatios();
	orthographicFrustum.near = ORTHOGRAPHIC_FRUSTUM_NEAR;
	orthographicFrustum.far = ORTHOGRAPHIC_FRUSTUM_FAR;
}

function applyOrthographicTilesetStability(enable) {
	if (!tileset) return;

	if (enable) {
		if (_savedDynamicScreenSpaceError === null) {
			_savedDynamicScreenSpaceError = !!tileset.dynamicScreenSpaceError;
		}
		if (_savedCullWithChildrenBounds === null) {
			_savedCullWithChildrenBounds = !!tileset.cullWithChildrenBounds;
		}
		tileset.dynamicScreenSpaceError = false;
		tileset.cullWithChildrenBounds = false;
		return;
	}

	if (_savedDynamicScreenSpaceError !== null) {
		tileset.dynamicScreenSpaceError = _savedDynamicScreenSpaceError;
		_savedDynamicScreenSpaceError = null;
	}
	if (_savedCullWithChildrenBounds !== null) {
		tileset.cullWithChildrenBounds = _savedCullWithChildrenBounds;
		_savedCullWithChildrenBounds = null;
	}
}

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
			var focusCarto = Cesium.Cartographic.fromCartesian(focus);
			if (!focusCarto || !isFinite(focusCarto.longitude) || !isFinite(focusCarto.latitude)) {
				return;
			}
			var cameraCarto = viewer.camera.positionCartographic;
			var focusHeight = focusCarto && isFinite(focusCarto.height) ? focusCarto.height : 0;
			var currentHeight = cameraCarto && isFinite(cameraCarto.height)
				? cameraCarto.height
				: (focusHeight + 150.0);
			var targetHeight = Math.max(currentHeight, focusHeight + ORTHOGRAPHIC_MIN_CLEARANCE);
			var orthoDestination = Cesium.Cartesian3.fromRadians(
				focusCarto.longitude,
				focusCarto.latitude,
				targetHeight
			);
			var clearHeight = Math.max(ORTHOGRAPHIC_MIN_CLEARANCE, targetHeight - focusHeight);

			// Frustum genişliği mevcut kotu koruyan clearHeight'ten türetilir.
			orthographicFrustum.width = Cesium.Math.clamp(clearHeight * 2.0, 30.0, 10000.0);
			applyOrthographicFrustumPrecision();

			// Mevcut kotu koruyarak üstten bakışa geç
			viewer.camera.flyTo({
				destination: orthoDestination,
				orientation: {
					heading: viewer.camera.heading,
					pitch: ORTHOGRAPHIC_NADIR_PITCH,
					roll: 0
				},
				duration: 1.0,
				complete: function () {
					applyOrthographicFrustumPrecision();
					viewer.camera.frustum = orthographicFrustum;
					isOrthographic = true;
					applyOrthographicTilesetStability(true);
					viewer.scene.screenSpaceCameraController.enableTilt = false;
					viewer.scene.requestRender();
				}
			});
		} else if (proj === 'perspective' && isOrthographic) {
			// Switch to Perspective
			updateProjectionAspectRatios();
			viewer.camera.frustum = perspectiveFrustum;
			isOrthographic = false;
			applyOrthographicTilesetStability(false);
			viewer.scene.screenSpaceCameraController.enableTilt = true;
			viewer.scene.requestRender();
		}
	});
});

window.addEventListener('resize', function () {
	updateProjectionAspectRatios();
	if (isOrthographic) {
		applyOrthographicFrustumPrecision();
		viewer.scene.requestRender();
	}
});

// Ortografik modda akıcı zoom için wheel düzeltmesi
viewer.scene.canvas.addEventListener('wheel', function (e) {
	if (isOrthographic) {
		e.preventDefault();
		e.stopPropagation();
		var direction = e.deltaY > 0 ? 1 : -1;
		var zoomAmount = orthographicFrustum.width * 0.1 * direction * zoomSensitivity;
		orthographicFrustum.width += zoomAmount;
		// Zoom limitleri (çok uzaklaşma veya ters dönmeyi önle)
		if (orthographicFrustum.width < 10.0) orthographicFrustum.width = 10.0;
		if (orthographicFrustum.width > 10000.0) orthographicFrustum.width = 10000.0;
		applyOrthographicFrustumPrecision();
		viewer.scene.requestRender();
	}
}, { passive: false, capture: true });


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
var savedClipBoxes = [];
var savedClipBoxCount = 0;
var selectedSavedClipBoxId = null;
var _batchedSelectionOverlay = [];

function clearBatchedSelectionOverlay() {
	if (!_batchedSelectionOverlay || _batchedSelectionOverlay.length === 0) return;
	_batchedSelectionOverlay.forEach(function (item) {
		safeRemoveItem(item);
	});
	_batchedSelectionOverlay = [];
}

function renderBatchedSelectionOverlay(measurement) {
	clearBatchedSelectionOverlay();
	if (!measurement || !measurement.isBatched || !measurement.checked) return;
	if (!measurement.points || measurement.points.length < 2) return;

	var overlayColor = Cesium.Color.CYAN.withAlpha(0.95);

	if (measurement.type === 'polygon' && measurement.points.length >= 3) {
		var fillAlpha = Math.min(0.40, Math.max(0.18, (VEC_STYLE.polygon.fillAlpha || 0.25) + 0.12));
		var fillOverlay = createStablePolygon(measurement.points, Cesium.Color.CYAN.withAlpha(fillAlpha));
		if (fillOverlay) _batchedSelectionOverlay.push(fillOverlay);

		var edgeWidth = Math.max(3, (VEC_STYLE.polygon.edgeWidth || 2) + 1);
		var edgeOverlay = createStablePolyline(measurement.points.concat([measurement.points[0]]), edgeWidth, overlayColor);
		if (edgeOverlay) _batchedSelectionOverlay.push(edgeOverlay);
	} else if ((measurement.type === 'line' || measurement.type === 'height') && measurement.points.length >= 2) {
		var lineWidth = Math.max(4, (VEC_STYLE.line.width || 3) + 1);
		var lineOverlay = createStablePolyline(measurement.points, lineWidth, overlayColor);
		if (lineOverlay) _batchedSelectionOverlay.push(lineOverlay);
	}

	if (_xrayActive) {
		_batchedSelectionOverlay.forEach(function (item) {
			applyXRayToPrimitive(item, true);
		});
	}
}

// STORAGE_KEY artık cbs-storage.js'de tanımlı (CbsStorage modülü)

// Cartesian3 → {lat, lon, height} dönüştürücü (DAL'a parametre olarak geçilir)
function _serializePoint(p) {
	var carto = Cesium.Cartographic.fromCartesian(p);
	return { lat: Cesium.Math.toDegrees(carto.latitude), lon: Cesium.Math.toDegrees(carto.longitude), height: carto.height };
}

function _deserializePoint(p) {
	if (!p) return null;
	return Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.height || 0);
}

function setResultDisplayMessage(messageHtml) {
	var resultEl = document.querySelector('#resultDisplay > div');
	if (resultEl) resultEl.innerHTML = messageHtml;
}

function escapeHtmlText(raw) {
	return String(raw || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function showResultErrorMessage(message) {
	var colorClass = document.documentElement.classList.contains('light') ? 'text-rose-600' : 'text-rose-300';
	setResultDisplayMessage('<span class="' + colorClass + ' font-bold text-[11px]">⚠️ ' + escapeHtmlText(message) + '</span>');
}

function getDialogThemeTokens() {
	var isLight = document.documentElement.classList.contains('light');
	return {
		isLight: isLight,
		overlayBg: isLight ? 'rgba(15,23,42,0.36)' : 'rgba(2,6,23,0.62)',
		cardBg: isLight ? '#ffffff' : '#0f172a',
		cardBorder: isLight ? 'rgba(148,163,184,0.42)' : 'rgba(148,163,184,0.25)',
		cardShadow: isLight ? '0 18px 44px rgba(15,23,42,0.18)' : '0 24px 64px rgba(2,6,23,0.52)',
		title: isLight ? '#0f172a' : '#f8fafc',
		body: isLight ? '#334155' : '#cbd5e1',
		muted: isLight ? '#64748b' : '#94a3b8',
		secondaryBg: isLight ? '#f8fafc' : '#1e293b',
		secondaryBorder: isLight ? 'rgba(148,163,184,0.6)' : 'rgba(148,163,184,0.35)',
		secondaryText: isLight ? '#334155' : '#e2e8f0',
		dangerBg: isLight ? '#ef4444' : '#dc2626',
		accentBg: isLight ? '#0f766e' : '#0d9488'
	};
}

function buildDialogShell(dialogId, widthPx, zIndex) {
	var theme = getDialogThemeTokens();
	var overlay = document.createElement('div');
	overlay.id = dialogId;
	overlay.style.cssText = [
		'position:fixed;inset:0;z-index:' + (zIndex || 10020),
		'display:flex;align-items:center;justify-content:center',
		'background:' + theme.overlayBg,
		'backdrop-filter:blur(4px)'
	].join(';');

	var card = document.createElement('div');
	card.style.cssText = [
		'width:min(92vw,' + widthPx + 'px)',
		'border-radius:16px',
		'padding:16px',
		'font-family:Inter,system-ui,sans-serif',
		'background:' + theme.cardBg,
		'border:1px solid ' + theme.cardBorder,
		'box-shadow:' + theme.cardShadow
	].join(';');

	return { theme: theme, overlay: overlay, card: card };
}

function showResultConfirmDialog(message, onConfirm) {
	var existing = document.getElementById('cbsConfirmDialog');
	if (existing) existing.remove();

	var shell = buildDialogShell('cbsConfirmDialog', 420, 10020);
	var theme = shell.theme;
	var overlay = shell.overlay;
	var card = shell.card;

	var title = document.createElement('div');
	title.textContent = 'Onay Gerekli';
	title.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:8px;color:' + theme.title + ';';

	var body = document.createElement('div');
	body.textContent = message;
	body.style.cssText = 'font-size:12px;line-height:1.6;white-space:pre-line;color:' + theme.body + ';';

	var actions = document.createElement('div');
	actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;';

	var cancelBtn = document.createElement('button');
	cancelBtn.textContent = 'Vazgeç';
	cancelBtn.style.cssText = [
		'border:1px solid ' + theme.secondaryBorder,
		'background:' + theme.secondaryBg,
		'color:' + theme.secondaryText,
		'padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer'
	].join(';');

	var okBtn = document.createElement('button');
	okBtn.textContent = 'Devam Et';
	okBtn.style.cssText = [
		'border:1px solid rgba(248,113,113,0.45)',
		'background:' + theme.dangerBg,
		'color:white',
		'padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer'
	].join(';');

	function closeDialog() {
		overlay.remove();
	}

	cancelBtn.addEventListener('click', closeDialog);
	okBtn.addEventListener('click', function () {
		closeDialog();
		if (typeof onConfirm === 'function') onConfirm();
	});
	overlay.addEventListener('click', function (e) {
		if (e.target === overlay) closeDialog();
	});

	actions.appendChild(cancelBtn);
	actions.appendChild(okBtn);
	card.appendChild(title);
	card.appendChild(body);
	card.appendChild(actions);
	overlay.appendChild(card);
	document.body.appendChild(overlay);
}

function applyInfoPanelTheme(panel) {
	if (!panel) return;

	var isLight = document.documentElement.classList.contains('light');
	var header = document.getElementById('infoPanelHeader');
	var summary = document.getElementById('infoSummaryBlock');
	var closeBtn = document.getElementById('btnCloseInfo');
	var content = panel.querySelector('.p-3');
	var labels = panel.querySelectorAll('label');
	var sectionTitles = panel.querySelectorAll('.font-semibold');
	var fields = panel.querySelectorAll('input, select, textarea');
	var divider = panel.querySelector('hr');
	var pickStatus = document.getElementById('infoPickStatus');
	var saveBtn = document.getElementById('btnSaveInfo');
	var readonlyBadge = document.getElementById('infoReadonlyBadge');

	if (isLight) {
		panel.style.background = 'rgba(255,255,255,0.97)';
		panel.style.border = '1px solid rgba(148,163,184,0.5)';
		panel.style.boxShadow = '0 18px 36px rgba(15,23,42,0.18)';
		if (header) {
			header.style.background = 'rgba(241,245,249,0.9)';
			header.style.borderBottom = '1px solid rgba(148,163,184,0.35)';
		}
		if (summary) {
			summary.style.background = 'rgba(248,250,252,0.9)';
			summary.style.border = '1px solid rgba(148,163,184,0.35)';
			summary.style.color = '#0f766e';
		}
		if (content) content.style.color = '#334155';
		if (closeBtn) closeBtn.style.color = '#64748b';
		if (divider) divider.style.borderColor = 'rgba(148,163,184,0.35)';
		if (saveBtn) {
			saveBtn.style.background = 'rgba(241,245,249,0.92)';
			saveBtn.style.borderColor = 'rgba(148,163,184,0.65)';
			saveBtn.style.color = '#0f172a';
		}
		if (readonlyBadge) {
			readonlyBadge.style.background = 'rgba(245,158,11,0.15)';
			readonlyBadge.style.borderColor = 'rgba(217,119,6,0.45)';
			readonlyBadge.style.color = '#b45309';
		}

		labels.forEach(function (label) {
			label.style.color = '#64748b';
		});
		sectionTitles.forEach(function (title) {
			title.style.color = '#475569';
		});
		fields.forEach(function (field) {
			field.style.background = 'rgba(255,255,255,0.95)';
			field.style.borderColor = 'rgba(148,163,184,0.6)';
			field.style.color = '#0f172a';
		});
		setInfoPickButtonState(typeof window !== 'undefined' && !!window.__infoPickModeActive);
		if (pickStatus) {
			setInfoPickStatus(pickStatus.textContent || '', pickStatus.getAttribute('data-tone') || 'idle');
		}
		return;
	}

	panel.style.background = 'rgba(11,15,25,0.98)';
	panel.style.border = '1px solid rgba(71,85,105,0.7)';
	panel.style.boxShadow = '0 18px 36px rgba(0,0,0,0.5)';
	if (header) {
		header.style.background = 'rgba(15,23,42,0.9)';
		header.style.borderBottom = '1px solid rgba(71,85,105,0.7)';
	}
	if (summary) {
		summary.style.background = 'rgba(2,6,23,0.7)';
		summary.style.border = '1px solid rgba(71,85,105,0.7)';
		summary.style.color = '#94a3b8';
	}
	if (content) content.style.color = '#cbd5e1';
	if (closeBtn) closeBtn.style.color = '#64748b';
	if (divider) divider.style.borderColor = 'rgba(71,85,105,0.7)';
	if (saveBtn) {
		saveBtn.style.background = 'rgba(15,23,42,0.92)';
		saveBtn.style.borderColor = 'rgba(71,85,105,0.65)';
		saveBtn.style.color = '#f8fafc';
	}
	if (readonlyBadge) {
		readonlyBadge.style.background = 'rgba(251,191,36,0.1)';
		readonlyBadge.style.borderColor = 'rgba(251,191,36,0.4)';
		readonlyBadge.style.color = '#fbbf24';
	}

	labels.forEach(function (label) {
		label.style.color = '#64748b';
	});
	sectionTitles.forEach(function (title) {
		title.style.color = '#94a3b8';
	});
	fields.forEach(function (field) {
		field.style.background = 'rgba(15,23,42,1)';
		field.style.borderColor = 'rgba(71,85,105,0.7)';
		field.style.color = '#e2e8f0';
	});
	setInfoPickButtonState(typeof window !== 'undefined' && !!window.__infoPickModeActive);
	if (pickStatus) {
		setInfoPickStatus(pickStatus.textContent || '', pickStatus.getAttribute('data-tone') || 'idle');
	}
}

function normalizeClipBoxName(str) {
	return String(str || '').trim().replace(/\s+/g, ' ');
}

function buildClipRotationTransform(rotationDeg) {
	var angleRad = Cesium.Math.toRadians(rotationDeg || 0);
	var rotationMatrix = Cesium.Matrix3.fromRotationZ(angleRad, new Cesium.Matrix3());
	return Cesium.Matrix4.fromRotationTranslation(rotationMatrix, Cesium.Cartesian3.ZERO, new Cesium.Matrix4());
}

function buildClipEnuMatrix(worldCenter, rotationDeg) {
	var baseEnu = Cesium.Transforms.eastNorthUpToFixedFrame(worldCenter);
	if (!rotationDeg) return baseEnu;
	return Cesium.Matrix4.multiply(baseEnu, buildClipRotationTransform(rotationDeg), new Cesium.Matrix4());
}

function clearClipOverlayEntities(entityArray) {
	if (!entityArray || !entityArray.length) return;
	for (var i = 0; i < entityArray.length; i++) {
		viewer.entities.remove(entityArray[i]);
	}
	entityArray.length = 0;
}

function drawClipOverlayEntities(targetArray, worldCenter, halfSize, rotationDeg, cssColor, alpha, width, savedClipId) {
	clearClipOverlayEntities(targetArray);
	if (!worldCenter || !halfSize) return;

	var hx = halfSize.x, hy = halfSize.y, hz = halfSize.z;
	var enu = buildClipEnuMatrix(worldCenter, rotationDeg);
	var corners = [
		[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
		[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]
	];
	var worldCorners = [];
	for (var i = 0; i < corners.length; i++) {
		var local = new Cesium.Cartesian3(corners[i][0], corners[i][1], corners[i][2]);
		worldCorners.push(Cesium.Matrix4.multiplyByPoint(enu, local, new Cesium.Cartesian3()));
	}

	var edges = [
		[0, 1], [1, 2], [2, 3], [3, 0],
		[4, 5], [5, 6], [6, 7], [7, 4],
		[0, 4], [1, 5], [2, 6], [3, 7]
	];
	var edgeColor = Cesium.Color.fromCssColorString(cssColor || '#06B6D4').withAlpha(alpha == null ? 0.75 : alpha);

	for (var e = 0; e < edges.length; e++) {
		var a = worldCorners[edges[e][0]];
		var b = worldCorners[edges[e][1]];
		var ent = viewer.entities.add({
			polyline: {
				positions: [a, b],
				width: width || 2,
				material: edgeColor,
				clampToGround: false,
				arcType: Cesium.ArcType.NONE
			}
		});
		ent._clipOverlay = true;
		ent._savedClipBoxId = savedClipId || null;
		targetArray.push(ent);
	}

	viewer.scene.requestRender();
}

function getOrCreateClipBoxGroup() {
	var existing = groups.find(function (g) { return g.isClipBoxRoot; });
	if (existing) return existing;

	groupCount++;
	var clipGroup = {
		id: groupCount,
		name: '📌 ClipBox',
		isOpen: true,
		checked: true,
		color: '#F59E0B',
		isReferans: true,
		isClipBoxRoot: true
	};
	groups.push(clipGroup);
	return clipGroup;
}

function getGroupItemCount(group) {
	if (group && group.isClipBoxRoot) {
		return savedClipBoxes.filter(function (clip) { return clip.groupId === group.id; }).length;
	}
	return measurements.filter(function (m) { return m.groupId === group.id; }).length;
}

function getClipBoxSummary(clip) {
	return Math.round((clip.halfSize.x || 0) * 2) + '×' +
		Math.round((clip.halfSize.y || 0) * 2) + '×' +
		Math.round((clip.halfSize.z || 0) * 2) + ' · R' + Math.round(clip.rotationDeg || 0) + '°';
}

function findSavedClipBox(id) {
	if (!Array.isArray(savedClipBoxes) || savedClipBoxes.length === 0) return null;
	for (var i = 0; i < savedClipBoxes.length; i++) {
		if (savedClipBoxes[i].id === id) return savedClipBoxes[i];
	}
	return null;
}

var clipMiniPreviewFrame = null;
var clipMiniPendingPreview = null;

function updateClipMiniSliderUi(axis, rawValue) {
	axis = String(axis || '').toUpperCase();
	var slider = document.getElementById('clipMini' + axis);
	if (!slider) return;
	var safeValue = Number(rawValue || 0);
	var min = Number(slider.min || 0);
	var max = Number(slider.max || 100);
	var progress = max === min ? 0 : ((safeValue - min) / (max - min)) * 100;
	slider.value = safeValue;
	slider.style.setProperty('--clip-progress', Math.max(0, Math.min(100, progress)) + '%');
	var label = document.getElementById('clipMini' + axis + 'Val');
	if (label) {
		label.textContent = axis === 'R' ? (safeValue + '°') : (safeValue + 'm');
	}
}

function applyClipMiniAxisValue(axis, rawValue, commitEntities) {
	axis = String(axis || '').toUpperCase();
	var safeValue = Number(rawValue || 0);
	updateClipMiniSliderUi(axis, safeValue);
	if (!window.ClipBoxManager || !ClipBoxManager.active) return;
	if (axis === 'R') {
		ClipBoxManager._updateRotation(safeValue, !!commitEntities);
		return;
	}
	ClipBoxManager._updateSize(axis.toLowerCase(), safeValue, !!commitEntities);
}

function scheduleClipMiniPreview(axis, rawValue) {
	clipMiniPendingPreview = {
		axis: String(axis || '').toUpperCase(),
		value: Number(rawValue || 0)
	};
	updateClipMiniSliderUi(clipMiniPendingPreview.axis, clipMiniPendingPreview.value);
	if (clipMiniPreviewFrame) return;
	clipMiniPreviewFrame = requestAnimationFrame(function () {
		clipMiniPreviewFrame = null;
		if (!clipMiniPendingPreview) return;
		var preview = clipMiniPendingPreview;
		clipMiniPendingPreview = null;
		applyClipMiniAxisValue(preview.axis, preview.value, false);
	});
}

function flushClipMiniPreview(commitEntities) {
	if (clipMiniPreviewFrame) {
		cancelAnimationFrame(clipMiniPreviewFrame);
		clipMiniPreviewFrame = null;
	}
	if (!clipMiniPendingPreview) return;
	var preview = clipMiniPendingPreview;
	clipMiniPendingPreview = null;
	applyClipMiniAxisValue(preview.axis, preview.value, !!commitEntities);
}

function syncClipMiniPanelMeta() {
	var stateEl = document.getElementById('clipMiniState');
	if (stateEl) {
		var tone = 'idle';
		var text = 'Kapalı';
		if (window.ClipBoxManager && ClipBoxManager._placementMode) {
			tone = 'warn';
			text = 'Haritada merkez seçin';
		} else if (window.ClipBoxManager && ClipBoxManager.active && ClipBoxManager._worldCenter) {
			tone = 'active';
			text = 'Aktif kırpma';
		}
		stateEl.dataset.tone = tone;
		stateEl.textContent = text;
	}

	var selectionInfo = document.getElementById('clipMiniSelectionInfo');
	if (selectionInfo) {
		var selectedClip = findSavedClipBox(selectedSavedClipBoxId);
		if (selectedClip) {
			selectionInfo.innerHTML = '<strong>Seçili kayıt:</strong> ' + escapeHtmlText(selectedClip.name);
		} else {
			selectionInfo.innerHTML = '<strong>Kaydedilmemiş kırpma.</strong> Yeni kayıt oluşturmak için Kaydet kullan.';
		}
	}
}

function syncClipMiniActionButtons() {
	var isLiveClip = !!(window.ClipBoxManager && ClipBoxManager.active && ClipBoxManager._worldCenter);
	var saveBtn = document.getElementById('clipMiniSave');
	var flyBtn = document.getElementById('clipMiniFlyTo');
	var repositionBtn = document.getElementById('clipMiniReposition');
	var updateBtn = document.getElementById('clipMiniUpdate');
	var hasSelected = !!findSavedClipBox(selectedSavedClipBoxId);

	if (saveBtn) {
		saveBtn.disabled = !isLiveClip;
		saveBtn.title = isLiveClip ? 'Geçerli ClipBox ayarlarıyla yeni kayıt oluştur' : 'Önce aktif bir ClipBox yerleştirin';
	}

	if (flyBtn) {
		flyBtn.disabled = !isLiveClip;
		flyBtn.title = isLiveClip ? 'Aktif ClipBox alanına odaklan' : 'Önce aktif bir ClipBox yerleştirin';
	}

	if (repositionBtn) {
		repositionBtn.disabled = !isLiveClip;
		repositionBtn.title = isLiveClip ? 'Mevcut boyut ve rotasyonu koruyup merkezi yeniden seç' : 'Önce aktif bir ClipBox yerleştirin';
	}

	if (updateBtn) {
		updateBtn.disabled = !(hasSelected && isLiveClip);
		updateBtn.title = hasSelected
			? (isLiveClip ? 'Seçili ClipBox kaydını güncelle' : 'Önce güncellenecek ClipBox sahnede aktif olmalı')
			: 'Önce listeden bir ClipBox kaydı seçin';
	}

	syncClipMiniPanelMeta();
}

function syncSavedClipBoxOverlay(clip) {
	if (!clip) return;
	if (!clip._overlayEntities) clip._overlayEntities = [];
	clearClipOverlayEntities(clip._overlayEntities);

	var group = groups.find(function (g) { return g.id === clip.groupId; });
	if (!clip.checked || (group && group.checked === false)) return;

	drawClipOverlayEntities(
		clip._overlayEntities,
		clip.center,
		clip.halfSize,
		clip.rotationDeg,
		(group && group.color) || '#F59E0B',
		0.65,
		2,
		clip.id
	);
}

function saveCurrentClipBox() {
	if (!ClipBoxManager.active || !ClipBoxManager._worldCenter) {
		setResultDisplayMessage('<span class="text-amber-400 font-bold text-[11px]">Önce aktif bir ClipBox yerleştirin.</span>');
		return;
	}

	var clipGroup = getOrCreateClipBoxGroup();
	var seq = savedClipBoxes.filter(function (clip) { return clip.groupId === clipGroup.id; }).length + 1;
	var clip = {
		id: ++savedClipBoxCount,
		groupId: clipGroup.id,
		name: 'Clip ' + seq,
		checked: true,
		center: Cesium.Cartesian3.clone(ClipBoxManager._worldCenter),
		halfSize: {
			x: ClipBoxManager._halfSize.x,
			y: ClipBoxManager._halfSize.y,
			z: ClipBoxManager._halfSize.z
		},
		rotationDeg: ClipBoxManager._rotationDeg || 0,
		_overlayEntities: []
	};

	savedClipBoxes.push(clip);
	selectedSavedClipBoxId = clip.id;
	clipGroup.isOpen = true;
	syncSavedClipBoxOverlay(clip);
	renderList();
	syncClipMiniActionButtons();
	debouncedSave();
	setResultDisplayMessage('<span class="text-green-400 font-bold text-[11px]">✓ ClipBox kaydedildi: ' + clip.name + '</span>');
	TelemetryManager.addLog('ClipBox kaydedildi: ' + clip.name);
	return clip;
}

function updateSelectedSavedClipBox() {
	var clip = findSavedClipBox(selectedSavedClipBoxId);
	if (!clip) {
		setResultDisplayMessage('<span class="text-amber-400 font-bold text-[11px]">Önce listeden güncellenecek ClipBox kaydını seçin.</span>');
		return;
	}
	if (!ClipBoxManager.active || !ClipBoxManager._worldCenter) {
		setResultDisplayMessage('<span class="text-amber-400 font-bold text-[11px]">Önce güncellenecek ClipBox sahnede aktif olmalı.</span>');
		return;
	}

	clip.center = Cesium.Cartesian3.clone(ClipBoxManager._worldCenter);
	clip.halfSize = {
		x: ClipBoxManager._halfSize.x,
		y: ClipBoxManager._halfSize.y,
		z: ClipBoxManager._halfSize.z
	};
	clip.rotationDeg = ClipBoxManager._rotationDeg || 0;
	syncSavedClipBoxOverlay(clip);
	renderList();
	syncClipMiniActionButtons();
	debouncedSave();
	setResultDisplayMessage('<span class="text-green-400 font-bold text-[11px]">✓ ClipBox güncellendi: ' + clip.name + '</span>');
	TelemetryManager.addLog('ClipBox güncellendi: ' + clip.name);
}

function deleteSavedClipBox(id) {
	var idx = savedClipBoxes.findIndex(function (clip) { return clip.id === id; });
	if (idx === -1) return;
	clearClipOverlayEntities(savedClipBoxes[idx]._overlayEntities || []);
	savedClipBoxes.splice(idx, 1);
	if (selectedSavedClipBoxId === id) selectedSavedClipBoxId = null;
	renderList();
	syncClipMiniActionButtons();
	debouncedSave();
	setResultDisplayMessage('<span class="text-slate-300 font-bold text-[11px]">ClipBox kaydı silindi.</span>');
	viewer.scene.requestRender();
}

function startEditingSavedClipBox(e, clip, targetEl) {
	if (e && e.stopPropagation) e.stopPropagation();
	var nameSpan = targetEl || (e && e.currentTarget) || (e && e.target);
	if (!nameSpan || !nameSpan.parentNode) return;
	var oldName = clip.name;
	var input = document.createElement('input');
	input.type = 'text';
	input.value = oldName;
	input.className = 'text-[10px] border-b border-primary/50 px-1 py-0 w-[132px] outline-none';
	input.style.cssText = 'background:#0f172a;color:#fff;caret-color:#fff;height:18px;line-height:18px;';

	nameSpan.parentNode.replaceChild(input, nameSpan);
	input.focus();
	input.select();

	function finish() {
		var newName = normalizeClipBoxName(input.value);
		if (newName) clip.name = newName;
		renderList();
		syncClipMiniActionButtons();
		debouncedSave();
	}

	input.onblur = finish;
	input.onkeydown = function (ev) {
		if (ev.key === 'Enter') input.blur();
		else if (ev.key === 'Escape') { input.value = oldName; input.blur(); }
	};
}

function applySavedClipBox(id) {
	var clip = findSavedClipBox(id);
	if (!clip) return;
	selectedSavedClipBoxId = clip.id;
	ClipBoxManager.loadSavedClip(clip);
	renderList();
	syncClipMiniActionButtons();
	setResultDisplayMessage('<span class="text-cyan-400 font-bold text-[11px]">✂️ ClipBox uygulandı: ' + clip.name + '</span>');
}

function saveToStorage() {
	CbsStorage.saveAll(
		{ groups: groups, measurements: measurements, activeGroupId: activeGroupId, clipBoxes: savedClipBoxes },
		_serializePoint
	).then(function (result) {
		var sizeBytes = result.sizeBytes;
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
	}).catch(function (e) {
		console.error('Kayıt hatası:', e);
		// ─── 5MB DOLU (kırmızı engelleme) ───
		if (e.name === 'QuotaExceededError' || e.code === 22) {
			showStorageToast(
				'🚨 Depolama Alanı Tamamen Dolu!',
				'Yeni veriler artık KAYDEDİLEMİYOR. Sayfayı yenilediğinizde son ölçümleriniz kaybolacak.\n\n→ Verilerinizi hemen dışa aktarın (GeoJSON/CSV/DXF)\n→ Ardından "Tümünü Sil" ile alanı temizleyin.',
				'critical'
			);
		}
	});
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
	CbsStorage.loadAll().then(function (data) {
		if (!data) return;

		var savedGroups = data.groups;
		var savedMeasures = data.measurements;
		var savedClipBoxRecords = data.clipBoxes || [];
		activeGroupId = data.activeGroupId;

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
					entities: [],
					properties: m.properties || {}
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

		savedClipBoxes = [];
		savedClipBoxRecords.forEach(function (clipRec) {
			try {
				var restoredClip = {
					id: clipRec.id,
					groupId: clipRec.groupId,
					name: clipRec.name || ('Clip ' + clipRec.id),
					checked: clipRec.checked !== false,
					center: _deserializePoint(clipRec.center),
					halfSize: {
						x: clipRec.halfSize && clipRec.halfSize.x || 15,
						y: clipRec.halfSize && clipRec.halfSize.y || 15,
						z: clipRec.halfSize && clipRec.halfSize.z || 15
					},
					rotationDeg: clipRec.rotationDeg || 0,
					_overlayEntities: []
				};
				savedClipBoxes.push(restoredClip);
				if (restoredClip.id > savedClipBoxCount) savedClipBoxCount = restoredClip.id;
				if (!groups.find(function (g) { return g.id === restoredClip.groupId; })) {
					var clipGroup = getOrCreateClipBoxGroup();
					restoredClip.groupId = clipGroup.id;
				}
				syncSavedClipBoxOverlay(restoredClip);
			} catch (clipErr) {
				console.warn('ClipBox kaydı geri yüklenemedi (id=' + clipRec.id + '):', clipErr);
			}
		});
		renderList();
		syncClipMiniActionButtons();
		// Splash: ölçümler+gruplar yüklendi
		window._splashMeasuresReady = true;
		document.dispatchEvent(new CustomEvent('splashStorageReady'));
	}).catch(function (e) {
		console.error("Ölçümler geri yüklenirken hata:", e);
		// Hata olsa da splash'i takılı bırakma
		window._splashMeasuresReady = true;
		document.dispatchEvent(new CustomEvent('splashStorageReady'));
	});
}

// ─── YARDIMCI ETİKET & GEOMETRİ FONKSİYONLARI ───────────────
// ─── ANTİ-JİTTER PİVOT PATTERN (GeoNexus Pattern 272) ───────
// GPU float32 hassasiyet sorunu: ECEF koordinatları (~4M metre) GPU'da titrer
// Çözüm: İlk noktayı pivot yapıp tüm vertex'leri lokal ofset olarak gönder
// modelMatrix ile mutlak pozisyon CPU'da hesaplanır (double precision)
// ENTITY_HEIGHT_OFFSET yukarıda tek bir yerden tanımlanır.

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
				}),
				translucent: false
			});
		} else {
			appearance = new Cesium.PolylineMaterialAppearance({
				material: Cesium.Material.fromType('Color', {
					color: material || Cesium.Color.YELLOW
				}),
				translucent: false
			});
		}

		var primitive = viewer.scene.primitives.add(new Cesium.Primitive({
			geometryInstances: geometryInstances,
			appearance: appearance,
			modelMatrix: enuMatrix, // CPU double-precision ile mutlak pozisyon
			asynchronous: false,
			allowPicking: true   // Çizgiye tıklayınca ölçüm seçilebilsin
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
			allowPicking: true   // Alan dolgusu tıklanınca ölçüm seçilebilsin
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

var _pendingPrimitiveRemovals = [];
var _primitiveRemovalScheduled = false;

function _queuePrimitiveRemoval(primitive) {
	if (!primitive) return;
	if (primitive.show !== undefined) primitive.show = false;
	if (_pendingPrimitiveRemovals.indexOf(primitive) === -1) {
		_pendingPrimitiveRemovals.push(primitive);
	}
	viewer.scene.requestRender();
}

function _flushPrimitiveRemovals() {
	_primitiveRemovalScheduled = false;
	if (_pendingPrimitiveRemovals.length === 0) return;

	var toRemove = _pendingPrimitiveRemovals.splice(0);
	toRemove.forEach(function (primitive) {
		if (!primitive) return;
		try {
			if (viewer.scene.primitives.contains(primitive)) {
				viewer.scene.primitives.remove(primitive);
			}
		} catch (e) {
			console.warn('Primitive remove kuyruğu hatası (görmezden geliniyor):', e);
		}
	});
}

viewer.scene.postRender.addEventListener(function () {
	if (_pendingPrimitiveRemovals.length === 0 || _primitiveRemovalScheduled) return;
	_primitiveRemovalScheduled = true;
	requestAnimationFrame(_flushPrimitiveRemovals);
});

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
			// [FIX-6] GC'nin referansı serbest bırakabilmesi için null'la
			item.label = null;
		}

		// 3) Collection'ın Kendisini Silme (Jitter Fix v3: Her noktanın kendi koleksiyonu var)
		if (item.collection && item.collection._primitives) {
			if (viewer.scene.primitives.contains(item.collection)) {
				_queuePrimitiveRemoval(item.collection);
			}
			return;
		}

		// 4) Primitive (Collection)
		if (viewer.scene.primitives.contains(item)) {
			_queuePrimitiveRemoval(item);
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
		m.entities.push(addLabel(midpointAlongLine(m.points), m.resultText || m.name || '', lineColor));
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
	var labelText = m.resultText || m.name || '';
	if (m.resultText) {
		var match2D = m.resultText.match(/2D:\s*([\d.]+)\s*m²/);
		if (match2D) labelText = '2D: ' + match2D[1] + ' m²';
	}
	m.entities.push(addLabel(centroid(m.points), labelText, polyColor));
}

// ─── HAFİF RESTORE (Import Verisi İçin — %85 Daha Az Entity) ────────────────
// Köşe noktalarını ATLAR, tek kapalı polyline + dolgu + etiket = 3 entity
function restorePolygonLight(m) {
	if (!m.points || m.points.length < 3) return;
	var grp = groups.find(function (g) { return g.id === m.groupId; });
	var hexColor = grp && grp.color ? grp.color : '#14B8A6';
	var polyColor = Cesium.Color.fromCssColorString(hexColor);
	var isLabelsOn = !grp || grp.labelsVisible !== false;

	// 1. Tek kapalı polyline (tüm kenarlar bir seferde)
	var closedPoints = m.points.concat([m.points[0]]); // Kapanış noktası ekle
	var edgePrim = createStablePolyline(closedPoints, VEC_STYLE.polygon.edgeWidth, polyColor);
	if (edgePrim) m.entities.push(edgePrim);

	// 2. Dolgu polygon 
	var polyPrim = createStablePolygon(m.points.slice(), polyColor.withAlpha(VEC_STYLE.polygon.fillAlpha));
	if (polyPrim) m.entities.push(polyPrim);

	// 3. Etiket (opsiyonel — label toggle kontrolü)
	var labelText = m.resultText || m.name || '';
	if (m.resultText) {
		var match2D = m.resultText.match(/2D:\s*([\d.]+)\s*m²/);
		if (match2D) labelText = '2D: ' + match2D[1] + ' m²';
	}
	var lbl = addLabel(centroid(m.points), labelText, polyColor);
	if (lbl && lbl.label) lbl.label.show = isLabelsOn && m.checked;
	m.entities.push(lbl);
}

// Hafif çizgi restore — köşe noktası yok, sadece polyline + etiket = 2 entity
function restoreLineLight(m) {
	if (!m.points || m.points.length < 2) return;
	var grp = groups.find(function (g) { return g.id === m.groupId; });
	var hexColor = grp && grp.color ? grp.color : '#EAB308';
	var lineColor = Cesium.Color.fromCssColorString(hexColor);
	var isLabelsOn = !grp || grp.labelsVisible !== false;

	// 1. Tek polyline (tüm segmentler)
	var linePrim = createStablePolyline(m.points, VEC_STYLE.line.width, lineColor);
	if (linePrim) m.entities.push(linePrim);

	// 2. Etiket
	if (!_isMob) {
		var lbl = addLabel(midpointAlongLine(m.points), m.resultText || m.name || '', lineColor);
		if (lbl && lbl.label) lbl.label.show = isLabelsOn && m.checked;
		m.entities.push(lbl);
	}
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

	// P_mid noktası — ENU pivot ile render (Float32 jitter yok, derinlik testi çalışır)
	m.entities.push(addPointLabel(pMid, null, hexColor));


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
	m.entities.push(addLabel(midpoint(pMid, p2), m.resultText || m.name || '', hColor));
}

function restoreCoord(m) {
	var grp = groups.find(function (g) { return g.id === m.groupId; });
	var pName = m.name ? m.name.toString().replace('Nokta ', '') : '1';
	m.entities.push(addPointLabel(m.points[0], pName, grp && grp.color ? grp.color : '#14B8A6'));
}

// Başlangıçta kayıtlı verileri yükle + kaydedilmiş import'ları geri yükle
setTimeout(function () {
	loadFromStorage();
	// Import restore — loadFromStorage'dan ~500ms sonra (IndexedDB async)
	setTimeout(restoreImports, 500);
}, 1000);

// ─── KAYDEDILMIŞ IMPORT'LARI GERİ YÜKLE ───
function restoreImports() {
	CbsStorage.loadImports().then(function (importRecords) {
		if (!importRecords || importRecords.length === 0) {
			// Kaydedilmiş import yok — splash'i bekletme
			window._splashImportsReady = true;
			document.dispatchEvent(new CustomEvent('splashStorageReady'));
			return;
		}
		console.info('CbsStorage: ' + importRecords.length + ' kaydedilmiş import geri yükleniyor...');

		importRecords.forEach(function (rec) {
			// Grup oluştur (yoksa)
			var existingGroup = groups.find(function (g) { return g.id === rec.groupId; });
			if (!existingGroup) {
				var newGroup = {
					id: rec.groupId,
					name: rec.groupName || 'İçe Aktırma',
					isOpen: false,
					checked: true,
					color: rec.groupColor || '#14B8A6',
					isReferans: true
				};
				groups.push(newGroup);
				if (rec.groupId > groupCount) groupCount = rec.groupId;
				existingGroup = newGroup;
			} else {
				// ID çakışması önlemi: mevcut grup bulunsa bile import grubuna ait olduğunu işaretle.
				// isReferans eksik veya false ise snap mantığı grubu kendi ölçümü gibi görür.
				existingGroup.isReferans = true;
			}

			var hexColor = existingGroup.color || '#14B8A6';
			var cesColor = Cesium.Color.fromCssColorString(hexColor);
			var zOffset = rec.zOffset || 0;
			applyImportZOffsetToGroup(existingGroup, zOffset);
			var effectiveGroupZ = existingGroup ? existingGroup._zOffset : zOffset;
			var features = rec.features || [];

			// Geometri akümülatörleri (batch rendering)
			var polyFillInstances = [];
			var polyLineInstances = [];
			var labelEntries = [];
			var batchPrimitives = [];

			features.forEach(function (feat) {
				var points = feat.coords.map(function (c) {
					return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + effectiveGroupZ);
				});

				var m = {
					id: ++measureCount,
					groupId: rec.groupId,
					name: feat.name,
					type: feat.type,
					resultText: feat.resultText || '',
					checked: true,
					isImported: true,
					isBatched: (feat.type === 'polygon' || feat.type === 'line'),
					points: points,
					entities: [],
					properties: feat.props || {}
				};
				measurements.push(m);

				if (feat.type === 'polygon' && points.length >= 3) {
					try {
						polyFillInstances.push(new Cesium.GeometryInstance({
							id: m.id,
							geometry: new Cesium.CoplanarPolygonGeometry({
								polygonHierarchy: new Cesium.PolygonHierarchy(points),
								vertexFormat: Cesium.MaterialAppearance.MaterialSupport.BASIC.vertexFormat
							})
						}));
					} catch (e) { }
					try {
						var closedPts = points.concat([points[0]]);
						polyLineInstances.push(new Cesium.GeometryInstance({
							id: m.id,
							geometry: new Cesium.PolylineGeometry({
								positions: closedPts,
								width: VEC_STYLE.polygon.edgeWidth || 2,
								arcType: Cesium.ArcType.NONE,
								vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
							})
						}));
					} catch (e) { }
					var labelText = m.resultText || m.name || '';
					labelEntries.push({ position: centroid(points), text: labelText, measurementId: m.id });
				} else if (feat.type === 'line' && points.length >= 2) {
					try {
						polyLineInstances.push(new Cesium.GeometryInstance({
							id: m.id,
							geometry: new Cesium.PolylineGeometry({
								positions: points,
								width: VEC_STYLE.line.width || 3,
								arcType: Cesium.ArcType.NONE,
								vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
							})
						}));
					} catch (e) { }
				} else if (feat.type === 'coord') {
					restoreCoord(m);
				}
			});

			// Bulk primitive oluştur
			if (polyFillInstances.length > 0) {
				try {
					var fillPrim = viewer.scene.primitives.add(new Cesium.Primitive({
						geometryInstances: polyFillInstances,
						appearance: new Cesium.MaterialAppearance({
							material: Cesium.Material.fromType('Color', {
								color: cesColor.withAlpha(VEC_STYLE.polygon.fillAlpha || 0.25)
							}),
							faceForward: true
						}),
						asynchronous: true,
						allowPicking: true
					}));
					fillPrim._isImportBatch = true;
					fillPrim._isFillBatch = true;
					batchPrimitives.push(fillPrim);
				} catch (e) { console.warn('Import restore fill hatası:', e); }
			}

			if (polyLineInstances.length > 0) {
				try {
					var linePrim = viewer.scene.primitives.add(new Cesium.Primitive({
						geometryInstances: polyLineInstances,
						appearance: new Cesium.PolylineMaterialAppearance({
							material: Cesium.Material.fromType('Color', {
								color: cesColor
							}),
							translucent: false
						}),
						asynchronous: true,
						allowPicking: true
					}));
					linePrim._isImportBatch = true;
					linePrim._isPolylineBatch = true;
					batchPrimitives.push(linePrim);
				} catch (e) { console.warn('Import restore line hatası:', e); }
			}

			if (labelEntries.length > 0) {
				var labelCol = viewer.scene.primitives.add(new Cesium.LabelCollection());
				labelEntries.forEach(function (le) {
					var lifted = liftPosition(le.position);
					labelCol.add({
						id: le.measurementId,
						position: lifted,
						text: le.text,
						font: VEC_STYLE.label.font,
						fillColor: cesColor,
						outlineColor: VEC_STYLE.label.outlineColor,
						outlineWidth: VEC_STYLE.label.outlineWidth,
						style: Cesium.LabelStyle.FILL_AND_OUTLINE,
						verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
						pixelOffset: new Cesium.Cartesian2(0, VEC_STYLE.label.offsetY),
						distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 150.0),
						showBackground: true,
						backgroundColor: new Cesium.Color(0, 0, 0, 0.6)
					});
				});
				labelCol._isImportBatch = true;
				batchPrimitives.push(labelCol);
			}

			if (existingGroup) {
				existingGroup._batchPrimitives = batchPrimitives;
				// Sayfa yenilendiğinde grup kapalıysa (checked:false) primitive'leri gizle
				if (existingGroup.checked === false) {
					batchPrimitives.forEach(function (p) { p.show = false; });
					measurements.forEach(function (m) {
						if (m.groupId === existingGroup.id && m.isImported && !m.isBatched) {
							m.entities.forEach(function (ent) { ent.show = false; if (ent.label) ent.label.show = false; });
						}
					});
				}
			}
		});

		renderList();
		viewer.scene.requestRender();
		console.info('CbsStorage: ' + importRecords.length + ' import grubu geri yüklendi');
		// Splash: import referansları yüklendi
		window._splashImportsReady = true;
		document.dispatchEvent(new CustomEvent('splashStorageReady'));
	}).catch(function (e) {
		console.error('Import geri yükleme hatası:', e);
		// Hata olsa da splash'i takılı bırakma
		window._splashImportsReady = true;
		document.dispatchEvent(new CustomEvent('splashStorageReady'));
	});
}

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
	var group = groups.find(function (g) { return g.id === groupId; });

	if (group && group.isClipBoxRoot) {
		savedClipBoxes.forEach(function (clip) {
			if (clip.groupId === groupId) syncSavedClipBoxOverlay(clip);
		});
		viewer.scene.requestRender();
		return;
	}

	// Batch primitifli grup — batch'i yeniden oluştur (GPU performansı korunur)
	if (group && group._batchPrimitives) {
		rebuildBatchPrimitives(group);
	}

	// Non-batched (bireysel) measurement'ları yeniden çiz
	measurements.forEach(function (m) {
		if (m.groupId !== groupId || m.isBatched) return;
		m.entities.forEach(function (ent) { safeRemoveItem(ent); });
		m.entities = [];
		if (m.type === 'coord') restoreCoord(m);
		else if (m.type === 'line') restoreLine(m);
		else if (m.type === 'polygon') restorePolygon(m);
		else if (m.type === 'height') restoreHeight(m);

		// X-Ray aktifse yeniden oluşturulan entity'lere uygula
		if (_xrayActive) {
			m.entities.forEach(function (ent) {
				applyXRayToPrimitive(ent, true);
			});
		}
	});
	viewer.scene.requestRender();
}

// ─── BATCH PRİMİTİFLERİ YENİDEN OLUŞTUR (renk/KOT değişikliğinde) ───
function rebuildBatchPrimitives(group, includeMeasurementFn) {
	// 1. Eski batch primitifleri kaldır
	if (group._batchPrimitives) {
		group._batchPrimitives.forEach(function (p) {
			try { viewer.scene.primitives.remove(p); } catch (e) { }
		});
		group._batchPrimitives = null;
	}

	var hexColor = group.color || '#14B8A6';
	var cesColor = Cesium.Color.fromCssColorString(hexColor);
	var polyFillInstances = [];
	var polyLineInstances = [];
	var labelEntries = [];
	var batchPrimitives = [];

	// 2. Mevcut measurement point'lerinden geometri instance'ları oluştur
	measurements.forEach(function (m) {
		if (m.groupId !== group.id || !m.isBatched) return;
		if (includeMeasurementFn && !includeMeasurementFn(m)) return;
		var points = m.points;

		if (m.type === 'polygon' && points.length >= 3) {
			try {
				polyFillInstances.push(new Cesium.GeometryInstance({
					id: m.id,
					geometry: new Cesium.CoplanarPolygonGeometry({
						polygonHierarchy: new Cesium.PolygonHierarchy(points),
						vertexFormat: Cesium.MaterialAppearance.MaterialSupport.BASIC.vertexFormat
					})
				}));
			} catch (e) { }
			try {
				var closedPts = points.concat([points[0]]);
				polyLineInstances.push(new Cesium.GeometryInstance({
					id: m.id,
					geometry: new Cesium.PolylineGeometry({
						positions: closedPts,
						width: VEC_STYLE.polygon.edgeWidth || 2,
						arcType: Cesium.ArcType.NONE,
						vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
					})
				}));
			} catch (e) { }
			var labelText = m.resultText || m.name || '';
			labelEntries.push({ position: centroid(points), text: labelText, measurementId: m.id });
		} else if (m.type === 'line' && points.length >= 2) {
			try {
				polyLineInstances.push(new Cesium.GeometryInstance({
					id: m.id,
					geometry: new Cesium.PolylineGeometry({
						positions: points,
						width: VEC_STYLE.line.width || 3,
						arcType: Cesium.ArcType.NONE,
						vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
					})
				}));
			} catch (e) { }
		}
	});

	// 3. Yeni batch primitifler oluştur
	if (polyFillInstances.length > 0) {
		try {
			var fillPrim = viewer.scene.primitives.add(new Cesium.Primitive({
				geometryInstances: polyFillInstances,
				appearance: new Cesium.MaterialAppearance({
					material: Cesium.Material.fromType('Color', {
						color: cesColor.withAlpha(VEC_STYLE.polygon.fillAlpha || 0.25)
					}),
					faceForward: true
				}),
				asynchronous: true,
				allowPicking: true
			}));
			fillPrim._isImportBatch = true;
			fillPrim._isFillBatch = true;
			batchPrimitives.push(fillPrim);
		} catch (e) { console.warn('Batch rebuild fill hatası:', e); }
	}

	if (polyLineInstances.length > 0) {
		try {
			var linePrim = viewer.scene.primitives.add(new Cesium.Primitive({
				geometryInstances: polyLineInstances,
				appearance: new Cesium.PolylineMaterialAppearance({
					material: Cesium.Material.fromType('Color', {
						color: cesColor
					}),
					translucent: false
				}),
				asynchronous: true,
				allowPicking: true
			}));
			linePrim._isImportBatch = true;
			linePrim._isPolylineBatch = true;
			batchPrimitives.push(linePrim);
		} catch (e) { console.warn('Batch rebuild line hatası:', e); }
	}

	if (labelEntries.length > 0) {
		var labelCol = viewer.scene.primitives.add(new Cesium.LabelCollection());
		labelEntries.forEach(function (le) {
			var lifted = liftPosition(le.position);
			labelCol.add({
				id: le.measurementId,
				position: lifted,
				text: le.text,
				font: VEC_STYLE.label.font,
				fillColor: cesColor,
				outlineColor: VEC_STYLE.label.outlineColor,
				outlineWidth: VEC_STYLE.label.outlineWidth,
				style: Cesium.LabelStyle.FILL_AND_OUTLINE,
				verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
				pixelOffset: new Cesium.Cartesian2(0, VEC_STYLE.label.offsetY),
				distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 150.0),
				showBackground: true,
				backgroundColor: new Cesium.Color(0, 0, 0, 0.6)
			});
		});
		labelCol._isImportBatch = true;
		batchPrimitives.push(labelCol);
	}

	group._batchPrimitives = batchPrimitives;

	// ─── Görünürlük state'ini geri yükle ───────────────────────────────────────
	// rebuildBatchPrimitives yeni primitive'ler oluşturur (show=true).
	// Kullanıcı daha önce etiket/alan/çizgiyi kapattıysa bunu hatırlaması gerekir.
	// group.checked, group.labelsVisible, group.fillVisible, group.linesVisible
	// flag'lerini okuyarak her primitife doğru show değerini ata.
	batchPrimitives.forEach(function (p) {
		if (!group.checked) {
			// Grup tamamen kapalı — hepsini gizle
			p.show = false;
		} else if (p._isImportBatch && p instanceof Cesium.LabelCollection) {
			p.show = group.labelsVisible !== false;
		} else if (p._isImportBatch && p._isPolylineBatch) {
			p.show = group.linesVisible !== false;
		} else if (p._isImportBatch && p._isFillBatch) {
			p.show = group.fillVisible !== false;
		}
		// else: diğer tipler default show=true kalır
	});

	// X-Ray aktifse yeni batch primitiflere de uygula (visibility hesabının üstüne)
	if (_xrayActive) {
		batchPrimitives.forEach(function (p) {
			if (p.show !== false) applyXRayToPrimitive(p, true);
		});
	}
}

function renderSavedClipBoxGroupContent(groupWrapper, group) {
	var content = document.createElement('div');
	content.className = 'folder-content';

	var clipItems = savedClipBoxes.filter(function (clip) { return clip.groupId === group.id; }).slice().reverse();
	if (clipItems.length === 0) {
		var empty = document.createElement('div');
		empty.className = 'text-[9px] text-slate-600 italic py-1';
		empty.innerText = 'Kayıtlı ClipBox yok';
		content.appendChild(empty);
	}

	clipItems.forEach(function (clip) {
		var selectedClass = selectedSavedClipBoxId === clip.id ? ' border-amber-400 bg-amber-400/10' : ' border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/50';
		var row = document.createElement('div');
		row.className = 'flex items-center justify-between gap-2 py-1 px-2 rounded-md border transition-colors mb-1 cursor-pointer' + selectedClass;
		row.style.minHeight = '38px';
		row.title = 'ClipBox uygula ve odakla';
		row.onclick = function () {
			applySavedClipBox(clip.id);
		};

		var leftDiv = document.createElement('div');
		leftDiv.className = 'flex items-center gap-2 overflow-hidden flex-1 min-w-0';

		var chk = document.createElement('input');
		chk.type = 'checkbox';
		chk.checked = clip.checked;
		chk.className = 'rounded border-slate-600 bg-slate-800 text-primary size-3 cursor-pointer shrink-0';
		chk.title = clip.checked ? 'Kayıt görünür' : 'Kayıt gizli';
		chk.onclick = function (e) {
			e.stopPropagation();
			clip.checked = chk.checked;
			syncSavedClipBoxOverlay(clip);
			debouncedSave();
		};

		var name = document.createElement('span');
		name.className = 'text-[10px] text-slate-200 font-medium truncate max-w-[132px] cursor-pointer';
		name.innerText = clip.name;
		name.title = 'Adı düzenle';
		name.onclick = function (e) { startEditingSavedClipBox(e, clip); };

		leftDiv.appendChild(chk);
		leftDiv.appendChild(name);

		var rightDiv = document.createElement('div');
		rightDiv.className = 'flex items-center gap-0.5 shrink-0';

		var result = document.createElement('span');
		result.className = 'text-[9px] font-mono text-amber-300 px-1.5 py-0.5 rounded bg-slate-900/60 border border-slate-700/40';
		result.innerText = getClipBoxSummary(clip);
		result.title = 'Boyut özeti';

		var applyBtn = document.createElement('button');
		applyBtn.className = 'text-slate-400 hover:text-cyan-300 p-1 rounded hover:bg-slate-700/40';
		applyBtn.title = 'ClipBox uygula ve odakla';
		applyBtn.innerHTML = '<span class="material-symbols-outlined text-[13px]">play_arrow</span>';
		applyBtn.onclick = function (e) {
			e.stopPropagation();
			applySavedClipBox(clip.id);
		};

		var editBtn = document.createElement('button');
		editBtn.className = 'text-slate-400 hover:text-amber-300 p-1 rounded hover:bg-slate-700/40';
		editBtn.title = 'Adı düzenle';
		editBtn.innerHTML = '<span class="material-symbols-outlined text-[13px]">edit</span>';
		editBtn.onclick = function (e) {
			startEditingSavedClipBox(e, clip, name);
		};

		var del = document.createElement('button');
		del.className = 'text-slate-400 hover:text-red-300 p-1 rounded hover:bg-slate-700/40';
		del.innerHTML = '<span class="material-symbols-outlined text-[13px]">delete</span>';
		del.title = 'ClipBox kaydını sil';
		del.onclick = function (e) {
			e.stopPropagation();
			deleteSavedClipBox(clip.id);
		};

		rightDiv.appendChild(result);
		rightDiv.appendChild(applyBtn);
		rightDiv.appendChild(editBtn);
		rightDiv.appendChild(del);
		row.appendChild(leftDiv);
		row.appendChild(rightDiv);
		content.appendChild(row);
	});

	groupWrapper.appendChild(content);
}

// ─── 5. ÖLÇÜM LİSTESİ ─────────────────────────────────────────
var _renderListScheduled = false;
var _renderListLastTs = 0;
function renderList(forceNow) {
	if (!forceNow) {
		var now = performance.now();
		if (now - _renderListLastTs < 14) {
			if (_renderListScheduled) return;
			_renderListScheduled = true;
			requestAnimationFrame(function () {
				_renderListScheduled = false;
				renderList(true);
			});
			return;
		}
		_renderListLastTs = now;
	}

	var container = document.getElementById('measureList');
	container.innerHTML = '';

	// ─── Sabit 3D Model Katman Satırı (salt okunur, ince) ───
	if (typeof tileset !== 'undefined' && tileset) {
		var modelRow = document.createElement('div');
		modelRow.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-md cursor-default select-none';
		modelRow.style.cssText = 'min-height:22px;background:var(--bg-surface, rgba(30,41,59,0.35));border:1px solid var(--border-subtle, rgba(71,85,105,0.25));margin-bottom:6px;';

		var modelIcon = document.createElement('span');
		modelIcon.className = 'material-symbols-outlined';
		modelIcon.style.cssText = 'font-size:13px;color:var(--text-muted, #64748b);';
		modelIcon.innerText = 'location_city';

		var modelName = document.createElement('span');
		modelName.style.cssText = 'font-size:9px;color:var(--text-primary, #cbd5e1);font-weight:600;flex:1;letter-spacing:0.3px;';
		modelName.innerText = '3D Model \u2014 Merinos 1. Etap';

		var modelCheck = document.createElement('input');
		modelCheck.type = 'checkbox';
		modelCheck.checked = tileset.show !== false;
		modelCheck.className = 'rounded border-slate-600 bg-slate-800 text-primary cursor-pointer shrink-0';
		modelCheck.style.cssText = 'width:11px;height:11px;';
		modelCheck.title = tileset.show !== false ? 'Modeli gizle' : 'Modeli göster';
		modelCheck.onclick = function (e) {
			e.stopPropagation();
			tileset.show = modelCheck.checked;
			modelCheck.title = modelCheck.checked ? 'Modeli gizle' : 'Modeli göster';
			viewer.scene.requestRender();
		};

		// Hiyerarşik açma/kapama oku
		var modelExpand = document.createElement('span');
		modelExpand.style.cssText = 'font-size:10px;color:var(--text-muted, #64748b);cursor:pointer;user-select:none;width:12px;text-align:center;flex-shrink:0;transition:transform 0.2s;';
		modelExpand.textContent = '▸';
		modelExpand.title = 'Kot kontrolünü aç/kapat';

		modelRow.appendChild(modelExpand);
		modelRow.appendChild(modelIcon);
		modelRow.appendChild(modelName);
		modelRow.appendChild(modelCheck);
		container.appendChild(modelRow);

		// ─── KOT Kontrolü (gizli, tıkla aç) ───
		var kotRow = document.createElement('div');
		kotRow.className = 'flex items-center gap-1 px-2 py-1';
		kotRow.style.cssText = 'margin-top:-4px;margin-bottom:6px;padding-left:26px;display:none;';

		var kotMinus = document.createElement('button');
		kotMinus.style.cssText = 'width:18px;height:18px;font-size:12px;font-weight:700;color:var(--text-primary, #cbd5e1);background:var(--bg-surface, rgba(30,41,59,0.6));border:1px solid var(--border, rgba(71,85,105,0.4));border-radius:4px;cursor:pointer;padding:0;line-height:16px;text-align:center;flex-shrink:0;';
		kotMinus.textContent = '−';
		kotMinus.title = 'Kotu düşür';

		var kotSlider = document.createElement('input');
		kotSlider.type = 'range';
		kotSlider.min = '-500';
		kotSlider.max = '500';
		kotSlider.value = currentHeightOffset;
		kotSlider.step = '1';
		kotSlider.className = 'h-1 accent-primary cursor-pointer';
		kotSlider.style.cssText = 'flex:1;min-width:0;';
		kotSlider.title = 'Yükseklik Ofseti (metre)';

		var kotPlus = document.createElement('button');
		kotPlus.style.cssText = 'width:18px;height:18px;font-size:12px;font-weight:700;color:var(--text-primary, #cbd5e1);background:var(--bg-surface, rgba(30,41,59,0.6));border:1px solid var(--border, rgba(71,85,105,0.4));border-radius:4px;cursor:pointer;padding:0;line-height:16px;text-align:center;flex-shrink:0;';
		kotPlus.textContent = '+';
		kotPlus.title = 'Kotu yükselt';

		var kotInput = document.createElement('input');
		kotInput.type = 'number';
		kotInput.value = currentHeightOffset;
		kotInput.step = '1';
		kotInput.style.cssText = 'width:40px;padding:1px 3px;font-size:10px;text-align:center;background:var(--bg-base, #0f172a);border:1px solid var(--border-subtle, rgba(71,85,105,0.25));border-radius:4px;color:var(--text-primary, #cbd5e1);';
		kotInput.title = 'Metre cinsinden yükseklik ofseti';

		var kotUnit = document.createElement('span');
		kotUnit.style.cssText = 'font-size:9px;color:var(--text-muted, #64748b);';
		kotUnit.textContent = 'm';

		var kotReset = document.createElement('button');
		kotReset.style.cssText = 'color:var(--text-muted, #64748b);cursor:pointer;padding:0;background:none;border:none;line-height:1;';
		kotReset.title = 'Sıfırla';
		kotReset.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px;">restart_alt</span>';

		// Accordion toggle
		modelExpand.addEventListener('click', function (e) {
			e.stopPropagation();
			var isOpen = kotRow.style.display !== 'none';
			kotRow.style.display = isOpen ? 'none' : 'flex';
			modelExpand.textContent = isOpen ? '▸' : '▾';
		});

		// Event listeners
		kotSlider.addEventListener('input', function () {
			var val = parseFloat(this.value);
			kotInput.value = val;
			applyHeightOffset(val);
		});
		kotMinus.addEventListener('click', function () {
			var val = (parseFloat(kotInput.value) || 0) - 1;
			kotInput.value = val;
			kotSlider.value = Math.max(-500, Math.min(500, val));
			applyHeightOffset(val);
		});
		kotPlus.addEventListener('click', function () {
			var val = (parseFloat(kotInput.value) || 0) + 1;
			kotInput.value = val;
			kotSlider.value = Math.max(-500, Math.min(500, val));
			applyHeightOffset(val);
		});
		kotInput.addEventListener('change', function () {
			var val = parseFloat(this.value) || 0;
			kotSlider.value = Math.max(-500, Math.min(500, val));
			applyHeightOffset(val);
		});
		kotReset.addEventListener('click', function () {
			kotSlider.value = 0;
			kotInput.value = 0;
			applyHeightOffset(0);
		});

		kotRow.appendChild(kotMinus);
		kotRow.appendChild(kotSlider);
		kotRow.appendChild(kotPlus);
		kotRow.appendChild(kotInput);
		kotRow.appendChild(kotUnit);
		kotRow.appendChild(kotReset);
		container.appendChild(kotRow);
	}

	// Referans grupları (isReferans) önce, standart gruplar sonra
	var refGroups = groups.filter(function (g) { return g.isReferans; }).sort(function (a, b) {
		if (a.isClipBoxRoot && !b.isClipBoxRoot) return -1;
		if (!a.isClipBoxRoot && b.isClipBoxRoot) return 1;
		return 0;
	});
	var stdGroups = groups.filter(function (g) { return !g.isReferans; });

	// Referans bölüm başlığı
	if (refGroups.length > 0) {
		var refHeader = document.createElement('div');
		refHeader.className = 'flex items-center gap-2 mb-2 px-1';
		refHeader.innerHTML = '<div class="flex-1 h-[1px]" style="background:var(--border-subtle)"></div>' +
			'<span class="text-[8px] font-bold uppercase tracking-widest" style="color:var(--text-muted)">📌 Referans Veriler</span>' +
			'<div class="flex-1 h-[1px]" style="background:var(--border-subtle)"></div>';
		container.appendChild(refHeader);
	}

	// Önce referans gruplarını render et
	refGroups.forEach(function (group) {
		renderGroupItem(container, group);
	});

	// Ayırıcı çizgi (referans varsa)
	if (refGroups.length > 0) {
		var sep = document.createElement('div');
		sep.className = 'flex items-center gap-2 my-3 px-1';
		sep.innerHTML = '<div class="flex-1 h-[1px]" style="background:var(--border-subtle)"></div>' +
			'<span class="text-[8px] font-bold uppercase tracking-widest" style="color:var(--text-muted)">Ölçümler</span>' +
			'<div class="flex-1 h-[1px]" style="background:var(--border-subtle)"></div>';
		container.appendChild(sep);
	}

	// Sonra standart grupları render et
	stdGroups.forEach(function (group) {
		renderGroupItem(container, group);
	});

	updateActiveGroupLabel();
	syncClipMiniActionButtons();
}

function renderGroupItem(container, group) {
	var groupWrapper = document.createElement('div');
	groupWrapper.className = 'folder-item mb-2' + (group.isOpen ? '' : ' folder-collapsed');

	// ─── Group Header ───
	var header = document.createElement('div');
	header.className = 'folder-header' + (activeGroupId === group.id ? ' active' : '');
	header.onclick = function () {
		if (group.isReferans) return; // Referans gruplar aktif grup olamaz
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
	var itemCount = getGroupItemCount(group);
	var countBadge = document.createElement('span');
	countBadge.innerText = itemCount;
	countBadge.style.cssText = 'font-size:9px;min-width:14px;height:14px;line-height:14px;text-align:center;border-radius:7px;padding:0 3px;display:inline-block;font-weight:700;opacity:' + (itemCount > 0 ? '0.9' : '0.4') + ';background:' + (group.color || '#14B8A6') + '22;color:' + (group.color || '#14B8A6') + ';border:1px solid ' + (group.color || '#14B8A6') + '44;';

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
		if (group.isClipBoxRoot) {
			savedClipBoxes.forEach(function (clip) {
				if (clip.groupId === group.id) syncSavedClipBoxOverlay(clip);
			});
			viewer.scene.requestRender();
			renderList();
			debouncedSave();
			return;
		}
		// Batch primitifleri varsa alt-toggle durumlarını dikkate alarak toggle et
		if (group._batchPrimitives) {
			group._batchPrimitives.forEach(function (p) {
				if (p._isImportBatch && p instanceof Cesium.LabelCollection) {
					p.show = group.checked && (group.labelsVisible !== false);
				} else if (p._isImportBatch && p._isPolylineBatch) {
					p.show = group.checked && (group.linesVisible !== false);
				} else if (p._isImportBatch && p._isFillBatch) {
					p.show = group.checked && (group.fillVisible !== false);
				} else {
					p.show = group.checked;
				}
			});
		}
		measurements.forEach(function (m) {
			if (m.groupId === group.id) {
				m.checked = group.checked;
				if (!m.isBatched) {
					m.entities.forEach(function (ent) { ent.show = group.checked; if (ent.label) ent.label.show = group.checked; });
				}
			}
		});
		if (!group.checked && activeHighlightId !== null) {
			var activeMeasurement = measurements.find(function (m) { return m.id === activeHighlightId; });
			if (activeMeasurement && activeMeasurement.groupId === group.id) {
				activeHighlightId = null;
				clearBatchedSelectionOverlay();
			}
		}
		viewer.scene.requestRender();
		renderList();
	};

	var btnDelGroup = document.createElement('button');
	btnDelGroup.className = 'text-slate-500 hover:text-red-400 p-0.5 transition-colors';
	btnDelGroup.innerHTML = '<span class="material-symbols-outlined text-[14px]">delete</span>';
	btnDelGroup.title = "Grubu ve İçindekileri Sil";
	btnDelGroup.onclick = function (e) {
		e.stopPropagation();
		showResultConfirmDialog('"' + group.name + '" grubunu ve içindeki tüm ölçümleri silmek istediğinize emin misiniz?', function () {
			deleteGroup(group.id);
		});
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

	// ─── REFERANS GRUP: İki satırlı header ───
	if (group.isReferans) {
		// Dosya adından 📌 prefix'ini temizle
		var displayName = group.name.replace(/^📌\s*/, '');

		header.appendChild(arrow);
		header.appendChild(colorBtn);

		// Referans ikonu
		var pinIcon = document.createElement('span');
		pinIcon.className = 'material-symbols-outlined shrink-0';
		pinIcon.style.cssText = 'font-size:13px;color:' + (group.color || '#14B8A6') + ';';
		pinIcon.innerText = group.isClipBoxRoot ? 'content_cut' : 'push_pin';
		header.appendChild(pinIcon);

		// Dosya adı — tam okunabilir
		groupName.className = 'text-[10px] font-bold text-slate-300 flex-1 truncate tracking-tight';
		groupName.innerText = displayName;
		groupName.title = displayName;
		groupName.style.cssText = 'max-width:140px;';
		header.appendChild(groupName);

		header.appendChild(countBadge);
		header.appendChild(groupCheck);

		groupWrapper.appendChild(header);

		if (group.isClipBoxRoot) {
			renderSavedClipBoxGroupContent(groupWrapper, group);
			container.appendChild(groupWrapper);
			return;
		}

		// ─── Satır 2: Kontrol çubuğu (sadece açıkken görünür) ───
		var controlBar = document.createElement('div');
		controlBar.className = group.isOpen ? 'flex items-center gap-1 px-2 py-1' : 'items-center gap-1 px-2 py-1';
		controlBar.style.cssText = 'padding-left:28px;background:var(--ref-control-bg, rgba(15,23,42,0.4));border-top:1px solid var(--border-subtle, rgba(71,85,105,0.15));' + (group.isOpen ? 'display:flex;' : 'display:none;');
		controlBar.onclick = function (e) { e.stopPropagation(); };

		// Toggle buton stili helper (tema uyumlu)
		var btnOnStyle = 'width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;border:none;background:rgba(20,184,166,0.2);color:#14B8A6;transition:all 0.15s;';
		var btnOffStyle = 'width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;border:1px solid var(--border-subtle, rgba(71,85,105,0.3));background:var(--bg-elevated, #1e293b);color:var(--text-muted, #94a3b8);transition:all 0.15s;';

		// 🧲 Snap Toggle
		var btnSnap = document.createElement('button');
		var isSnapOn = !!group.snapEnabled;
		btnSnap.style.cssText = isSnapOn ? btnOnStyle : btnOffStyle;
		btnSnap.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px">' + (isSnapOn ? 'my_location' : 'location_disabled') + '</span>';
		btnSnap.title = isSnapOn ? 'Snap AÇIK' : 'Snap KAPALI';
		btnSnap.onclick = function () {
			group.snapEnabled = !group.snapEnabled;
			var newSnap = group.snapEnabled;
			btnSnap.style.cssText = newSnap ? btnOnStyle : btnOffStyle;
			btnSnap.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px">' + (newSnap ? 'my_location' : 'location_disabled') + '</span>';
			btnSnap.title = newSnap ? 'Snap AÇIK' : 'Snap KAPALI';
		};
		controlBar.appendChild(btnSnap);

		// 🏷️ Etiket Toggle
		var isLabelsOn = group.labelsVisible !== false;
		var btnLabel = document.createElement('button');
		btnLabel.style.cssText = isLabelsOn ? btnOnStyle : btnOffStyle;
		btnLabel.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px">' + (isLabelsOn ? 'label' : 'label_off') + '</span>';
		btnLabel.title = isLabelsOn ? 'Etiketler AÇIK' : 'Etiketler KAPALI';
		btnLabel.onclick = function () {
			var wasOn = group.labelsVisible !== false;
			group.labelsVisible = !wasOn;
			var nowOn = group.labelsVisible;
			if (group._batchPrimitives) {
				group._batchPrimitives.forEach(function (p) {
					if (p._isImportBatch && p instanceof Cesium.LabelCollection) {
						p.show = nowOn && group.checked;
					}
				});
			}
			measurements.forEach(function (m) {
				if (m.groupId === group.id && !m.isBatched) {
					m.entities.forEach(function (ent) {
						if (ent.label) ent.label.show = nowOn && m.checked;
					});
				}
			});
			btnLabel.style.cssText = nowOn ? btnOnStyle : btnOffStyle;
			btnLabel.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px">' + (nowOn ? 'label' : 'label_off') + '</span>';
			btnLabel.title = nowOn ? 'Etiketler AÇIK' : 'Etiketler KAPALI';
			viewer.scene.requestRender();
		};
		controlBar.appendChild(btnLabel);

		// 🔲 Alan (Fill) Gizle/Göster Toggle
		var isFillOn = group.fillVisible !== false;
		var btnFill = document.createElement('button');
		btnFill.style.cssText = isFillOn ? btnOnStyle : btnOffStyle;
		btnFill.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px">' + (isFillOn ? 'format_color_fill' : 'format_color_reset') + '</span>';
		btnFill.title = isFillOn ? 'Alanlar AÇIK' : 'Alanlar KAPALI';
		btnFill.onclick = function () {
			var wasFill = group.fillVisible !== false;
			group.fillVisible = !wasFill;
			var nowFill = group.fillVisible;
			if (group._batchPrimitives) {
				group._batchPrimitives.forEach(function (p) {
					if (p._isImportBatch && p instanceof Cesium.Primitive && !(p._isPolylineBatch)) {
						p.show = nowFill && group.checked;
					}
				});
			}
			btnFill.style.cssText = nowFill ? btnOnStyle : btnOffStyle;
			btnFill.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px">' + (nowFill ? 'format_color_fill' : 'format_color_reset') + '</span>';
			btnFill.title = nowFill ? 'Alanlar AÇIK' : 'Alanlar KAPALI';
			viewer.scene.requestRender();
		};
		controlBar.appendChild(btnFill);

		// 📏 Çizgi (Line) Gizle/Göster Toggle
		var isLinesOn = group.linesVisible !== false;
		var btnLine = document.createElement('button');
		btnLine.style.cssText = isLinesOn ? btnOnStyle : btnOffStyle;
		btnLine.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px">' + (isLinesOn ? 'timeline' : 'remove') + '</span>';
		btnLine.title = isLinesOn ? 'Çizgiler AÇIK' : 'Çizgiler KAPALI';
		btnLine.onclick = function () {
			var wasLines = group.linesVisible !== false;
			group.linesVisible = !wasLines;
			var nowLines = group.linesVisible;
			if (group._batchPrimitives) {
				group._batchPrimitives.forEach(function (p) {
					if (p._isImportBatch && p._isPolylineBatch) {
						p.show = nowLines && group.checked;
					}
				});
			}
			btnLine.style.cssText = nowLines ? btnOnStyle : btnOffStyle;
			btnLine.innerHTML = '<span class="material-symbols-outlined" style="font-size:13px">' + (nowLines ? 'timeline' : 'remove') + '</span>';
			btnLine.title = nowLines ? 'Çizgiler AÇIK' : 'Çizgiler KAPALI';
			viewer.scene.requestRender();
		};
		controlBar.appendChild(btnLine);

		// Ayırıcı
		var sep1 = document.createElement('div');
		sep1.style.cssText = 'width:1px;height:12px;background:var(--border, rgba(71,85,105,0.3));margin:0 2px;';
		controlBar.appendChild(sep1);

		// Z kontrolleri — gerçek kot toplamı (import + manuel)
		var zState = ensureGroupZState(group);
		var zBtnStyle = 'width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;border:1px solid var(--border-subtle, rgba(71,85,105,0.3));background:var(--bg-elevated, #1e293b);color:var(--text-muted, #94a3b8);transition:all 0.15s;';

		var btnZDown = document.createElement('button');
		btnZDown.style.cssText = zBtnStyle;
		btnZDown.innerText = '−';
		btnZDown.title = 'Kot −1m';
		btnZDown.onmouseenter = function () { this.style.background = 'rgba(239,68,68,0.7)'; this.style.color = '#fff'; };
		btnZDown.onmouseleave = function () { this.style.background = 'var(--bg-elevated, #1e293b)'; this.style.color = 'var(--text-muted, #94a3b8)'; };

		var zInput = document.createElement('input');
		zInput.type = 'number';
		zInput.value = zState.totalZ.toFixed(2);
		zInput.step = '0.1';
		zInput.style.cssText = 'width:40px;padding:1px 2px;font-size:9px;text-align:center;background:var(--bg-surface, #111827);border:1px solid var(--border-subtle, rgba(71,85,105,0.25));border-radius:3px;color:var(--text-primary, #cbd5e1);font-family:monospace;';
		zInput.title = 'Gerçek kot toplamı (import + manuel, metre)';

		var btnZUp = document.createElement('button');
		btnZUp.style.cssText = zBtnStyle;
		btnZUp.innerText = '+';
		btnZUp.title = 'Kot +1m';
		btnZUp.onmouseenter = function () { this.style.background = 'rgba(20,184,166,0.7)'; this.style.color = '#fff'; };
		btnZUp.onmouseleave = function () { this.style.background = 'var(--bg-elevated, #1e293b)'; this.style.color = 'var(--text-muted, #94a3b8)'; };

		var zUnit = document.createElement('span');
		zUnit.style.cssText = 'font-size:8px;color:var(--text-muted, #64748b);font-family:monospace;';
		zUnit.textContent = 'm';

		var zSummary = document.createElement('span');
		zSummary.style.cssText = 'font-size:8px;color:var(--text-secondary, #94a3b8);font-family:monospace;margin-left:4px;max-width:92px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

		function formatSignedZ(v) {
			var n = Math.abs(v) < 0.0005 ? 0 : v;
			return (n >= 0 ? '+' : '') + n.toFixed(2);
		}

		function refreshZUi() {
			var state = ensureGroupZState(group);
			zInput.value = (Math.abs(state.totalZ) < 0.0005 ? 0 : state.totalZ).toFixed(2);
			zSummary.textContent = 'Toplam ' + formatSignedZ(state.totalZ) + 'm';
			zSummary.title = 'Gerçek kot toplamı = Import ' + formatSignedZ(state.importZ) + 'm + Manuel ' + formatSignedZ(state.manualZ) + 'm';
		}

		function applyTotalZ(newTotal) {
			var state = ensureGroupZState(group);
			var delta = newTotal - state.totalZ;
			if (Math.abs(delta) < 0.000001) {
				refreshZUi();
				return;
			}
			group._manualZOffset = state.manualZ + delta;
			group._zOffset = group._importZOffset + group._manualZOffset;
			adjustGroupZ(group.id, delta);
			refreshZUi();
		}

		btnZDown.onclick = function () {
			applyTotalZ(ensureGroupZState(group).totalZ - 1);
		};
		btnZUp.onclick = function () {
			applyTotalZ(ensureGroupZState(group).totalZ + 1);
		};
		zInput.onchange = function () {
			var newVal = parseFloat(zInput.value);
			if (!isFinite(newVal)) {
				refreshZUi();
				return;
			}
			applyTotalZ(newVal);
		};

		controlBar.appendChild(btnZDown);
		controlBar.appendChild(zInput);
		controlBar.appendChild(btnZUp);
		controlBar.appendChild(zUnit);
		controlBar.appendChild(zSummary);
		refreshZUi();

		// Spacer
		var spacer = document.createElement('div');
		spacer.style.cssText = 'flex:1;';
		controlBar.appendChild(spacer);

		// 🗑️ Sil
		controlBar.appendChild(btnDelGroup);

		groupWrapper.appendChild(controlBar);
	} else {
		// ─── STANDART GRUP: Tek satırlı header (değişiklik yok) ───
		header.appendChild(arrow);
		header.appendChild(countBadge);
		header.appendChild(folderIcon);
		header.appendChild(groupName);
		header.appendChild(colorBtn);
		header.appendChild(groupCheck);
		if (group.id !== 0) header.appendChild(btnDelGroup);
		groupWrapper.appendChild(header);
	}

	// ─── Group Content (Measurements) — Paginated Rendering ───
	var content = document.createElement('div');
	content.className = 'folder-content';

	var groupMeasures = measurements.filter(function (m) { return m.groupId === group.id; }).reverse();
	if (groupMeasures.length === 0) {
		var empty = document.createElement('div');
		empty.className = 'text-[9px] text-slate-600 italic py-1';
		empty.innerText = 'Ölçüm yok';
		content.appendChild(empty);
	}

	// Büyük grupları otomatik kapat (200+ öğe, ilk render)
	var PAGE_SIZE = 50;
	if (groupMeasures.length > 200 && group._visibleCount === undefined && group.isOpen) {
		group.isOpen = false;
		groupWrapper.className = 'folder-item mb-2 folder-collapsed';
	}

	// Sayfalama: sadece görünür kadar render et
	var visibleCount = group._visibleCount || PAGE_SIZE;
	var itemsToRender = groupMeasures.slice(0, visibleCount);

	itemsToRender.forEach(function (m) {
		var row = document.createElement('div');
		var selectedClass = activeHighlightId === m.id ? ' border-primary bg-primary/10' : ' border-slate-700/50 bg-slate-800/50 hover:bg-slate-700/50';
		row.className = 'flex items-center justify-between py-0.5 px-1.5 rounded border transition-colors mb-1' + selectedClass;
		row.style.minHeight = '28px';

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

		var infoBtn = document.createElement('button');
		infoBtn.className = 'text-slate-500 hover:text-cyan-400 p-0.5 transition-colors';
		infoBtn.title = 'Özellikler';
		infoBtn.innerHTML = '<span class="material-symbols-outlined text-[13px]">info</span>';
		infoBtn.onclick = (function (measure) {
			return function (e) {
				e.stopPropagation();
				// Highlight et (EditManager tetiklenmeden)
				var wasInfoMode = isInfoModeActive;
				isInfoModeActive = true;
				// Aynı obje zaten seçiliyse önce sıfırla ki toggle-deselect hatası olmasın
				if (activeHighlightId === measure.id) activeHighlightId = null;
				highlightMeasurement(measure.id);
				isInfoModeActive = wasInfoMode;
			};
		})(m);

		rightDiv.appendChild(result);
		rightDiv.appendChild(infoBtn);
		rightDiv.appendChild(del);
		row.appendChild(leftDiv);
		row.appendChild(rightDiv);
		content.appendChild(row);
	});

	// "Daha Fazla Göster" butonu (kalan öğe varsa)
	var remaining = groupMeasures.length - visibleCount;
	if (remaining > 0) {
		var showMore = document.createElement('button');
		showMore.className = 'w-full text-center text-[9px] font-bold py-1.5 my-1 rounded transition-colors';
		showMore.style.cssText = 'background:rgba(20,184,166,0.08);color:#14B8A6;border:1px dashed rgba(20,184,166,0.3);cursor:pointer;';
		showMore.innerText = '▼ ' + Math.min(remaining, PAGE_SIZE) + ' daha göster (' + remaining + ' kalan)';
		showMore.onmouseenter = function () { this.style.background = 'rgba(20,184,166,0.15)'; };
		showMore.onmouseleave = function () { this.style.background = 'rgba(20,184,166,0.08)'; };
		showMore.onclick = function (e) {
			e.stopPropagation();
			group._visibleCount = (group._visibleCount || PAGE_SIZE) + PAGE_SIZE;
			renderList();
		};
		content.appendChild(showMore);
	}

	groupWrapper.appendChild(content);
	container.appendChild(groupWrapper);
}

// Türkçe karakterleri ASCII'ye dönüştür + büyük harf yap
function normalizeGroupName(str) {
	var trMap = { 'ç': 'C', 'Ç': 'C', 'ğ': 'G', 'Ğ': 'G', 'ı': 'I', 'İ': 'I', 'ö': 'O', 'Ö': 'O', 'ş': 'S', 'Ş': 'S', 'ü': 'U', 'Ü': 'U' };
	return str.replace(/[çÇğĞıİöÖşŞüÜ]/g, function (c) { return trMap[c] || c; }).toUpperCase().replace(/\s+/g, '_');
}

function showCreateLayerDialog(onCreate) {
	var existing = document.getElementById('cbsCreateLayerDialog');
	if (existing) existing.remove();

	var shell = buildDialogShell('cbsCreateLayerDialog', 460, 10021);
	var theme = shell.theme;
	var overlay = shell.overlay;
	var card = shell.card;

	var title = document.createElement('div');
	title.textContent = 'Yeni Katman Oluştur';
	title.style.cssText = 'font-size:14px;font-weight:700;margin-bottom:8px;color:' + theme.title + ';';

	var body = document.createElement('div');
	body.textContent = 'Bu işlem sadece Ölçümler paneline katman ekler. Bilgisayarınızda klasör oluşturulmaz.';
	body.style.cssText = 'font-size:12px;line-height:1.6;color:' + theme.body + ';margin-bottom:12px;';

	var label = document.createElement('label');
	label.textContent = 'Katman Adı';
	label.style.cssText = 'display:block;font-size:11px;font-weight:700;letter-spacing:0.2px;color:' + theme.body + ';margin-bottom:6px;';

	var input = document.createElement('input');
	input.type = 'text';
	input.value = 'Yeni Katman';
	input.maxLength = 64;
	input.style.cssText = [
		'width:100%',
		'padding:9px 10px',
		'border-radius:8px',
		'outline:none',
		'font-size:12px',
		'font-weight:600',
		'background:' + theme.secondaryBg,
		'color:' + theme.secondaryText,
		'border:1px solid ' + theme.secondaryBorder
	].join(';');

	var helper = document.createElement('div');
	helper.textContent = 'Katman adı otomatik olarak sistem formatına (BUYUK_HARF) çevrilir.';
	helper.style.cssText = 'font-size:10px;line-height:1.5;color:' + theme.muted + ';margin-top:6px;';

	var actions = document.createElement('div');
	actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;';

	var cancelBtn = document.createElement('button');
	cancelBtn.textContent = 'Vazgeç';
	cancelBtn.style.cssText = [
		'border:1px solid ' + theme.secondaryBorder,
		'background:' + theme.secondaryBg,
		'color:' + theme.secondaryText,
		'padding:7px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer'
	].join(';');

	var createBtn = document.createElement('button');
	createBtn.textContent = 'Katman Ekle';
	createBtn.style.cssText = [
		'border:1px solid rgba(20,184,166,0.45)',
		'background:' + theme.accentBg,
		'color:white',
		'padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer'
	].join(';');

	function closeDialog() {
		document.removeEventListener('keydown', onKeyDown);
		overlay.remove();
	}

	function submitDialog() {
		var n = input.value.trim();
		if (!n) {
			input.style.borderColor = '#ef4444';
			input.focus();
			return;
		}
		closeDialog();
		if (typeof onCreate === 'function') onCreate(n);
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') closeDialog();
		else if (e.key === 'Enter') submitDialog();
	}

	input.addEventListener('input', function () {
		input.style.borderColor = theme.secondaryBorder;
	});
	cancelBtn.addEventListener('click', closeDialog);
	createBtn.addEventListener('click', submitDialog);
	overlay.addEventListener('click', function (e) {
		if (e.target === overlay) closeDialog();
	});
	document.addEventListener('keydown', onKeyDown);

	actions.appendChild(cancelBtn);
	actions.appendChild(createBtn);
	card.appendChild(title);
	card.appendChild(body);
	card.appendChild(label);
	card.appendChild(input);
	card.appendChild(helper);
	card.appendChild(actions);
	overlay.appendChild(card);
	document.body.appendChild(overlay);

	setTimeout(function () {
		input.focus();
		input.select();
	}, 0);
}

function startEditing(e, m) {
	e.stopPropagation();
	var nameSpan = e.target;
	var oldName = m.name;
	var input = document.createElement('input');
	input.type = 'text';
	input.value = oldName;
	input.className = 'text-[10px] border-b border-primary/50 px-1 py-0 w-[100px] outline-none';
	input.style.cssText = 'background:#0f172a;color:#fff;caret-color:#fff;height:18px;line-height:18px;';

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
	showCreateLayerDialog(function (layerName) {
		groupCount++;
		var newGroup = { id: groupCount, name: normalizeGroupName(layerName), isOpen: true, checked: true };
		groups.push(newGroup);
		activeGroupId = newGroup.id;
		renderList();
		debouncedSave();
	});
};

function findMeasurementFromPickedObject(pickedObject) {
	if (!Cesium.defined(pickedObject)) return null;

	function findById(value) {
		if (typeof value !== 'number' || !isFinite(value)) return null;
		return measurements.find(function (m) { return m.id === value; }) || null;
	}

	var direct = findById(pickedObject.id);
	if (direct) return direct;

	if (pickedObject.id && typeof pickedObject.id._measurementId === 'number') {
		var tagged = findById(pickedObject.id._measurementId);
		if (tagged) return tagged;
	}

	var obj = pickedObject.id || pickedObject.primitive;
	if (obj && obj.owner) obj = obj.owner;

	var fromObjId = findById(obj);
	if (fromObjId) return fromObjId;

	if (obj && typeof obj._measurementId === 'number') {
		var fromObjTag = findById(obj._measurementId);
		if (fromObjTag) return fromObjTag;
	}

	return measurements.find(function (m) {
		return m.entities && m.entities.includes(obj);
	}) || null;
}

function highlightMeasurement(id) {
	activeHighlightId = (activeHighlightId === id) ? null : id;
	renderList();
	clearBatchedSelectionOverlay();
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
	if (activeHighlightId !== null) {
		var activeMeasurement = measurements.find(function (m) { return m.id === activeHighlightId; });
		if (activeMeasurement && activeMeasurement.isBatched) {
			renderBatchedSelectionOverlay(activeMeasurement);
		}
	}
	// Seçili ölçüm varsa ve mobil cihazdaysak Sil FAB göster
	var delFab = document.getElementById('deleteSelFab');
	if (delFab) {
		delFab.style.display = (_isMob && activeHighlightId !== null) ? 'flex' : 'none';
	}
	// ── EditManager Entegrasyonu (info modunda devre dışı) ──
	if (!isInfoModeActive && typeof EditManager !== 'undefined') {
		if (activeHighlightId === null) {
			EditManager.stopEdit();
		} else {
			EditManager.startEdit(activeHighlightId);
		}
	}
	// Info modunda panel aç
	if (isInfoModeActive && activeHighlightId !== null) {
		var infoM = measurements.find(function (m) { return m.id === activeHighlightId; });
		if (infoM) openInfoPanel(infoM);
	}
	viewer.scene.requestRender();
}

// ═══════════════════════════════════════════════════════════════
// INFO PANEL — Seçili ölçümün özelliklerini Properties panelinde gösterir
// ═══════════════════════════════════════════════════════════════
function getInfoPanelKadastroProps(rawProps) {
	var props = rawProps || {};

	function pickFirst(keys) {
		for (var i = 0; i < keys.length; i++) {
			var value = props[keys[i]];
			if (value === undefined || value === null) continue;
			var text = String(value).trim();
			if (text) return text;
		}
		return '';
	}

	return {
		ada_no: pickFirst(['ada_no', 'adano', 'ref_ada']),
		parsel_no: pickFirst(['parsel_no', 'parselno', 'ref_parsel']),
		cins: pickFirst(['cins', 'tapucinsaciklama', 'ref_cins'])
	};
}

var infoPanelState = {
	measureId: null,
	baselineHash: '',
	isDirty: false
};

var infoPanelDockSyncTimer = null;

function isInfoPanelVisible() {
	var panel = document.getElementById('infoPanel');
	if (!panel) return false;
	return panel.classList.contains('translate-x-0') && !panel.classList.contains('pointer-events-none');
}

function isInfoPanelReadOnlyMeasurement(measurement) {
	if (!measurement) return false;
	if (measurement.isImported) return true;
	var grp = groups.find(function (g) { return g.id === measurement.groupId; });
	return !!(grp && isRefGroup(grp));
}

function syncInfoPanelNoteToResultBar(noteText, tone) {
	if (!noteText) return;
	var colorClass = 'text-cyan-300';
	if (tone === 'warn') colorClass = 'text-amber-300';
	if (tone === 'ok') colorClass = 'text-emerald-300';
	setResultDisplayMessage('<span class="' + colorClass + ' font-bold text-[11px]">ℹ️ ' + escapeHtmlText(noteText) + '</span>');
}

function setInfoPickButtonState(isActive) {
	var pickBtn = document.getElementById('btnPickReference');
	if (!pickBtn) return;

	var isLight = document.documentElement.classList.contains('light');
	if (isActive) {
		pickBtn.style.background = isLight ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.3)';
		pickBtn.style.color = isLight ? '#b45309' : '#fbbf24';
		pickBtn.style.borderColor = isLight ? 'rgba(180,83,9,0.45)' : 'rgba(251,191,36,0.45)';
		return;
	}

	if (isLight) {
		pickBtn.style.background = 'rgba(248,250,252,0.9)';
		pickBtn.style.color = '#334155';
		pickBtn.style.borderColor = 'rgba(148,163,184,0.6)';
		return;
	}

	pickBtn.style.background = '';
	pickBtn.style.color = '';
	pickBtn.style.borderColor = '';
}

function setInfoPickStatus(text, tone) {
	var statusEl = document.getElementById('infoPickStatus');
	if (!statusEl) return;

	var toneKey = tone || 'idle';
	var isLight = document.documentElement.classList.contains('light');
	var palette;

	if (isLight) {
		switch (toneKey) {
			case 'active':
				palette = { color: '#b45309', background: 'rgba(251,191,36,0.14)', border: 'rgba(217,119,6,0.35)' };
				break;
			case 'ok':
				palette = { color: '#166534', background: 'rgba(34,197,94,0.14)', border: 'rgba(22,163,74,0.35)' };
				break;
			case 'warn':
				palette = { color: '#92400e', background: 'rgba(245,158,11,0.14)', border: 'rgba(217,119,6,0.35)' };
				break;
			case 'error':
				palette = { color: '#b91c1c', background: 'rgba(239,68,68,0.12)', border: 'rgba(220,38,38,0.35)' };
				break;
			default:
				palette = { color: '#475569', background: 'rgba(241,245,249,0.82)', border: 'rgba(148,163,184,0.5)' };
				break;
		}
	} else {
		switch (toneKey) {
			case 'active':
				palette = { color: '#fcd34d', background: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' };
				break;
			case 'ok':
				palette = { color: '#6ee7b7', background: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.28)' };
				break;
			case 'warn':
				palette = { color: '#fcd34d', background: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' };
				break;
			case 'error':
				palette = { color: '#fda4af', background: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)' };
				break;
			default:
				palette = { color: '#94a3b8', background: 'rgba(15,23,42,0.4)', border: 'rgba(51,65,85,0.5)' };
				break;
		}
	}

	statusEl.className = 'text-[10px] rounded px-2 py-1 border leading-snug';
	statusEl.style.color = palette.color;
	statusEl.style.background = palette.background;
	statusEl.style.borderColor = palette.border;
	statusEl.setAttribute('data-tone', toneKey);
	statusEl.textContent = text || '';
}

function resetInfoPickStatusForMeasurement(measurement) {
	if (isInfoPanelReadOnlyMeasurement(measurement)) {
		setInfoPickStatus('Referans veri salt okunur. Düzenleme yapılamaz.', 'warn');
		return;
	}

	setInfoPickStatus('Haritadan ada/parsel almak için Ekranda Seç butonunu kullanın. Yalnız referans veriler okunur.', 'idle');
}

function setInfoPanelReadOnlyState(measurement) {
	var isReadOnly = isInfoPanelReadOnlyMeasurement(measurement);
	var editIds = [
		'infoAda', 'infoParsel', 'infoCins',
		'infoKat', 'infoYil', 'infoCikma',
		'infoTasiyici', 'infoDurum', 'infoKullanim', 'infoNotlar'
	];

	for (var i = 0; i < editIds.length; i++) {
		var field = document.getElementById(editIds[i]);
		if (!field) continue;
		var tag = (field.tagName || '').toUpperCase();
		if (tag === 'SELECT') {
			field.disabled = isReadOnly;
		} else {
			if (isReadOnly) field.setAttribute('readonly', 'readonly');
			else field.removeAttribute('readonly');
			if (tag === 'TEXTAREA' || tag === 'INPUT') field.disabled = false;
		}
		if (isReadOnly) field.classList.add('opacity-80');
		else field.classList.remove('opacity-80');
	}

	var saveBtn = document.getElementById('btnSaveInfo');
	if (saveBtn) {
		saveBtn.setAttribute('data-readonly', isReadOnly ? 'true' : 'false');
		saveBtn.disabled = isReadOnly;
		saveBtn.classList.toggle('opacity-50', isReadOnly);
		saveBtn.classList.toggle('cursor-not-allowed', isReadOnly);
		saveBtn.title = isReadOnly ? 'Referans veri salt okunur' : 'Kaydet (Ctrl+S)';
	}

	var pickBtn = document.getElementById('btnPickReference');
	if (pickBtn) {
		pickBtn.disabled = isReadOnly;
		pickBtn.classList.toggle('opacity-50', isReadOnly);
		pickBtn.classList.toggle('cursor-not-allowed', isReadOnly);
		pickBtn.title = isReadOnly ? 'Referans veride kadastro seçimi kapalı' : 'Haritadan Referans Ada/Parsel Seç';
	}

	var badge = document.getElementById('infoReadonlyBadge');
	if (badge) badge.style.display = isReadOnly ? 'inline-flex' : 'none';

	if (isReadOnly && typeof window !== 'undefined' && window.__infoPickModeActive && typeof window.__exitInfoPickMode === 'function') {
		window.__exitInfoPickMode();
	}

	setInfoPickButtonState(typeof window !== 'undefined' && !!window.__infoPickModeActive);
}

function getInfoPanelDockLeftPx() {
	var minLeft = 8;
	var gapFromToolPanel = 12;
	var left = minLeft;
	var toolPanel = document.getElementById('toolPanel');

	if (toolPanel && _toolPanelIsOpen) {
		var toolRect = toolPanel.getBoundingClientRect();
		if (isFinite(toolRect.right)) left = Math.round(toolRect.right + gapFromToolPanel);
	}

	var panel = document.getElementById('infoPanel');
	if (panel) {
		var panelWidth = panel.offsetWidth || Math.min(416, Math.max(220, window.innerWidth - (minLeft * 2)));
		var maxLeft = Math.max(minLeft, window.innerWidth - panelWidth - minLeft);
		left = Math.min(Math.max(minLeft, left), maxLeft);
	}

	return left;
}

function dockInfoPanelLeft() {
	var panel = document.getElementById('infoPanel');
	if (!panel) return;
	panel.style.left = getInfoPanelDockLeftPx() + 'px';
	panel.style.right = 'auto';
	panel.style.top = '';
}

function scheduleInfoPanelDockSync() {
	if (!isInfoPanelVisible()) return;
	dockInfoPanelLeft();
	if (infoPanelDockSyncTimer) clearTimeout(infoPanelDockSyncTimer);
	infoPanelDockSyncTimer = setTimeout(function () {
		if (isInfoPanelVisible()) dockInfoPanelLeft();
	}, 230);
}

(function bindInfoPanelDockSync() {
	if (typeof window !== 'undefined' && window.__infoPanelDockSyncBound) return;
	window.addEventListener('resize', function () {
		if (isInfoPanelVisible()) scheduleInfoPanelDockSync();
	});
	if (typeof window !== 'undefined') window.__infoPanelDockSyncBound = true;
})();

function getInfoPanelFormValues() {
	function read(id) {
		var el = document.getElementById(id);
		if (!el) return '';
		return (el.value || '').toString().trim();
	}

	return {
		ada: read('infoAda'),
		parsel: read('infoParsel'),
		cins: read('infoCins'),
		kat: read('infoKat'),
		yil: read('infoYil'),
		cikma: read('infoCikma'),
		tasiyici: read('infoTasiyici'),
		durum: read('infoDurum'),
		kullanim: read('infoKullanim'),
		notlar: read('infoNotlar')
	};
}

function setInfoPanelDirtyState(isDirty) {
	infoPanelState.isDirty = !!isDirty;
	var saveBtn = document.getElementById('btnSaveInfo');
	if (!saveBtn) return;

	if (infoPanelState.isDirty) {
		saveBtn.classList.add('ring-2', 'ring-amber-400/60', 'shadow-amber-400/20');
		saveBtn.setAttribute('aria-label', 'Kaydet (değişiklik var)');
	} else {
		saveBtn.classList.remove('ring-2', 'ring-amber-400/60', 'shadow-amber-400/20');
		saveBtn.setAttribute('aria-label', 'Kaydet');
	}
}

function updateInfoPanelDirtyState(setAsBaseline) {
	if (!infoPanelState.measureId) {
		setInfoPanelDirtyState(false);
		return;
	}

	var hash = JSON.stringify(getInfoPanelFormValues());
	if (setAsBaseline) {
		infoPanelState.baselineHash = hash;
		setInfoPanelDirtyState(false);
		return;
	}

	setInfoPanelDirtyState(hash !== infoPanelState.baselineHash);
}

function closeInfoPanel() {
	if (typeof window !== 'undefined' && window.__infoPickModeActive && typeof window.__exitInfoPickMode === 'function') {
		window.__exitInfoPickMode();
	}

	var panel = document.getElementById('infoPanel');
	if (panel) {
		panel.classList.add('-translate-x-[120%]', 'opacity-0', 'pointer-events-none');
		panel.classList.remove('translate-x-0', 'opacity-100');
		panel.setAttribute('aria-hidden', 'true');
		panel.style.willChange = '';
		panel.style.transition = '';
	}

	var badge = document.getElementById('infoReadonlyBadge');
	if (badge) badge.style.display = 'none';

	infoPanelState.measureId = null;
	infoPanelState.baselineHash = '';
	setInfoPanelDirtyState(false);
}

(function bindInfoPanelDirtyTracking() {
	if (typeof window !== 'undefined' && window.__infoPanelDirtyBound) return;

	var fields = ['infoAda', 'infoParsel', 'infoCins', 'infoKat', 'infoYil', 'infoCikma', 'infoTasiyici', 'infoDurum', 'infoKullanim', 'infoNotlar'];
	function handleDirtyChange() {
		updateInfoPanelDirtyState(false);
	}

	fields.forEach(function (id) {
		var el = document.getElementById(id);
		if (!el) return;
		el.addEventListener('input', handleDirtyChange);
		el.addEventListener('change', handleDirtyChange);
	});

	if (typeof window !== 'undefined') window.__infoPanelDirtyBound = true;
})();

function openInfoPanel(m) {
	var panel = document.getElementById('infoPanel');
	if (!panel) return;
	applyInfoPanelTheme(panel);

	// Normalize edilmiş properties
	var props = m.properties || {};
	var kadastroProps = getInfoPanelKadastroProps(props);

	// ── Başlık: Vektör tipine göre özet ──
	var summaryEl = document.getElementById('infoSummaryBlock');
	var summary = '';
	if (summaryEl) {
		if (m.type === 'polygon') {
			summary = '🔷 Polygon · ' + (m.resultText || '—') + ' · ' + (m.points ? m.points.length : 0) + ' köşe';
		} else if (m.type === 'line') {
			summary = '📏 Çizgi · ' + (m.resultText || '—');
		} else if (m.type === 'height') {
			summary = '📐 Yükseklik · ' + (m.resultText || '—');
		} else if (m.type === 'coord') {
			summary = '📍 Nokta · ' + (m.resultText || '—');
		} else {
			summary = '📋 ' + (m.type || 'Bilinmiyor') + ' · ' + (m.resultText || '—');
		}
		summaryEl.textContent = summary;
	}
	if (summary) syncInfoPanelNoteToResultBar(summary, 'info');

	// ── Kadastro alanları ──
	var adaInput = document.getElementById('infoAda');
	var parselInput = document.getElementById('infoParsel');
	var cinsInput = document.getElementById('infoCins');
	if (adaInput) adaInput.value = kadastroProps.ada_no;
	if (parselInput) parselInput.value = kadastroProps.parsel_no;
	if (cinsInput) cinsInput.value = kadastroProps.cins;

	// ── Kullanıcı giriş alanları ──
	var katInput = document.getElementById('infoKat');
	var yilInput = document.getElementById('infoYil');
	var cikmaTipInput = document.getElementById('infoCikma');
	var tasiyiciSelect = document.getElementById('infoTasiyici');
	var durumSelect = document.getElementById('infoDurum');
	var kullanimSelect = document.getElementById('infoKullanim');
	var notlarInput = document.getElementById('infoNotlar');

	if (katInput) katInput.value = props.kat != null ? props.kat : '';
	if (yilInput) yilInput.value = props.yapim_yili != null ? props.yapim_yili : '';
	if (cikmaTipInput) cikmaTipInput.value = props.cikma_tipi || '';
	if (tasiyiciSelect) tasiyiciSelect.value = props.tasiyici_sistem || '';
	if (durumSelect) durumSelect.value = props.yapi_durumu || '';
	if (kullanimSelect) kullanimSelect.value = props.kullanim_amaci || '';
	if (notlarInput) notlarInput.value = props.notlar || '';

	// ── Kaydet butonu: measurement ID'yi data attribute olarak sakla ──
	var saveBtn = document.getElementById('btnSaveInfo');
	if (saveBtn) {
		saveBtn.setAttribute('data-measure-id', m.id);
		if (!saveBtn.getAttribute('data-default-html')) {
			saveBtn.setAttribute('data-default-html', saveBtn.innerHTML);
		}
	}

	setInfoPanelReadOnlyState(m);
	resetInfoPickStatusForMeasurement(m);

	// Her açılışta paneli sol dock konumuna sıfırla
	panel.style.left = '';
	panel.style.top = '';
	panel.style.right = 'auto';
	panel.style.willChange = '';
	panel.style.transition = '';
	dockInfoPanelLeft();

	// Paneli göster — CSS class'larını kaldır
	panel.classList.remove('-translate-x-[120%]', 'opacity-0', 'pointer-events-none');
	panel.classList.add('translate-x-0', 'opacity-100');
	panel.setAttribute('aria-hidden', 'false');
	scheduleInfoPanelDockSync();

	infoPanelState.measureId = m.id;
	updateInfoPanelDirtyState(true);

	if (!_isMob) {
		setTimeout(function () {
			if (!isInfoPanelVisible()) return;
			var focusTarget = document.getElementById('infoAda') || document.getElementById('infoParsel');
			if (focusTarget && typeof focusTarget.focus === 'function') {
				try { focusTarget.focus({ preventScroll: true }); }
				catch (e) { focusTarget.focus(); }
			}
		}, 20);
	}
}

// ═══════════════════════════════════════════════════════════════
// INFO PANEL KAYDET — Form verilerini measurement.properties'e yazar
// ═══════════════════════════════════════════════════════════════
(function () {
	var saveBtn = document.getElementById('btnSaveInfo');
	if (!saveBtn) return;
	if (!saveBtn.getAttribute('data-default-html')) {
		saveBtn.setAttribute('data-default-html', saveBtn.innerHTML);
	}

	saveBtn.addEventListener('click', function () {
		if (saveBtn.getAttribute('data-readonly') === 'true') {
			syncInfoPanelNoteToResultBar('Referans veriler salt okunur, kaydetme kapalıdır.', 'warn');
			return;
		}

		var mid = parseInt(saveBtn.getAttribute('data-measure-id'), 10);
		if (isNaN(mid)) return;

		var m = measurements.find(function (x) { return x.id === mid; });
		if (!m) return;

		// Properties nesnesini oku — yoksa oluştur
		if (!m.properties) m.properties = {};

		// Kadastro
		var adaInput = document.getElementById('infoAda');
		var parselInput = document.getElementById('infoParsel');
		var cinsInput = document.getElementById('infoCins');
		if (adaInput) m.properties.ada_no = adaInput.value.trim();
		if (parselInput) m.properties.parsel_no = parselInput.value.trim();
		if (cinsInput) m.properties.cins = cinsInput.value.trim();

		// Kullanıcı giriş alanları
		var katInput = document.getElementById('infoKat');
		var yilInput = document.getElementById('infoYil');
		var cikmaTipInput = document.getElementById('infoCikma');
		var tasiyiciSelect = document.getElementById('infoTasiyici');
		var durumSelect = document.getElementById('infoDurum');
		var kullanimSelect = document.getElementById('infoKullanim');
		var notlarInput = document.getElementById('infoNotlar');

		if (katInput) m.properties.kat = katInput.value.trim() === '' ? null : parseInt(katInput.value, 10);
		if (yilInput) m.properties.yapim_yili = yilInput.value.trim() === '' ? null : parseInt(yilInput.value, 10);
		if (cikmaTipInput) m.properties.cikma_tipi = cikmaTipInput.value.trim();
		if (tasiyiciSelect) m.properties.tasiyici_sistem = tasiyiciSelect.value;
		if (durumSelect) m.properties.yapi_durumu = durumSelect.value;
		if (kullanimSelect) m.properties.kullanim_amaci = kullanimSelect.value;
		if (notlarInput) m.properties.notlar = notlarInput.value.trim();

		// Kaydet
		debouncedSave();
		updateInfoPanelDirtyState(true);

		// Görsel geri bildirim
		var defaultHtml = saveBtn.getAttribute('data-default-html') || saveBtn.innerHTML;
		saveBtn.innerHTML = '<span class="material-symbols-outlined text-[16px]">check_circle</span><span>Kaydedildi</span>';
		saveBtn.disabled = true;
		setTimeout(function () {
			saveBtn.innerHTML = defaultHtml;
			saveBtn.disabled = false;
			updateInfoPanelDirtyState(true);
		}, 1500);
		syncInfoPanelNoteToResultBar('Bilgi kartı güncellendi ve kaydedildi.', 'ok');
	});

	document.addEventListener('keydown', function (e) {
		if (!isInfoPanelVisible()) return;
		if (!(e.ctrlKey || e.metaKey)) return;
		if (e.key.toLowerCase() !== 's') return;
		e.preventDefault();
		if (!saveBtn.disabled) saveBtn.click();
	});

	// ── Panel kapatma butonu ──
	var closeBtn = document.getElementById('btnCloseInfo');
	if (closeBtn) {
		closeBtn.addEventListener('click', function () {
			closeInfoPanel();
		});
	}

	// ── Panel sürükleme (drag) desteği ──
	var header = document.getElementById('infoPanelHeader');
	if (header) {
		var isDragging = false;
		var dragOffsetX = 0;
		var dragOffsetY = 0;
		var activePointerId = null;
		var pendingClientX = 0;
		var pendingClientY = 0;
		var dragFrameId = 0;
		var dragPanel = null;

		function applyDragFrame() {
			dragFrameId = 0;
			if (!isDragging || !dragPanel) return;

			var panelWidth = dragPanel.offsetWidth;
			var panelHeight = dragPanel.offsetHeight;
			var rawLeft = pendingClientX - dragOffsetX;
			var rawTop = pendingClientY - dragOffsetY;
			var maxLeft = Math.max(8, window.innerWidth - panelWidth - 8);
			var maxTop = Math.max(8, window.innerHeight - panelHeight - 8);
			var nextLeft = Math.min(Math.max(8, rawLeft), maxLeft);
			var nextTop = Math.min(Math.max(8, rawTop), maxTop);

			dragPanel.style.position = 'fixed';
			dragPanel.style.left = nextLeft + 'px';
			dragPanel.style.top = nextTop + 'px';
			dragPanel.style.right = 'auto';
		}

		function stopDragging(e) {
			if (!isDragging) return;
			if (e && activePointerId !== null && typeof e.pointerId === 'number' && e.pointerId !== activePointerId) return;

			isDragging = false;
			activePointerId = null;
			if (dragFrameId) {
				cancelAnimationFrame(dragFrameId);
				dragFrameId = 0;
			}

			var panelRef = dragPanel;
			dragPanel = null;
			if (panelRef) {
				panelRef.style.willChange = '';
				requestAnimationFrame(function () {
					panelRef.style.transition = '';
				});
			}

			if (header.releasePointerCapture && e && typeof e.pointerId === 'number') {
				try { header.releasePointerCapture(e.pointerId); } catch (err) { }
			}
		}

		header.addEventListener('pointerdown', function (e) {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
				if (e.target && e.target.closest('button, input, select, textarea, a, [data-no-drag]')) return;
			var panel = document.getElementById('infoPanel');
			if (!panel || !isInfoPanelVisible()) return;

			isDragging = true;
			activePointerId = e.pointerId;
			dragPanel = panel;
			pendingClientX = e.clientX;
			pendingClientY = e.clientY;

			var rect = panel.getBoundingClientRect();
			dragOffsetX = e.clientX - rect.left;
			dragOffsetY = e.clientY - rect.top;
			panel.style.transition = 'none';
			panel.style.willChange = 'left, top';
			if (header.setPointerCapture) {
				try { header.setPointerCapture(e.pointerId); } catch (err) { }
			}
			e.preventDefault();
		});
		document.addEventListener('pointermove', function (e) {
			if (!isDragging) return;
			if (activePointerId !== null && e.pointerId !== activePointerId) return;
			pendingClientX = e.clientX;
			pendingClientY = e.clientY;
			if (!dragFrameId) dragFrameId = requestAnimationFrame(applyDragFrame);
		});
		document.addEventListener('pointerup', stopDragging);
		document.addEventListener('pointercancel', stopDragging);
	}
})();

// ═══════════════════════════════════════════════════════════════
// EKRANDA SEÇ — Haritadan Ada/Parsel referans verisi atama
// ═══════════════════════════════════════════════════════════════
(function () {
	var pickBtn = document.getElementById('btnPickReference');
	if (!pickBtn) return;

	var isPickMode = false;
	var pickHandler = null;
	var cadastrePickCache = [];
	if (typeof window !== 'undefined' && typeof window.__infoPickModeActive === 'undefined') {
		window.__infoPickModeActive = false;
	}

	function getPickCartesian(position) {
		var cartesian;

		try {
			if (viewer.scene.pickPositionSupported) {
				cartesian = viewer.scene.pickPosition(position);
			}
		} catch (e) { /* depth render hatası */ }

		if (!Cesium.defined(cartesian)) {
			var ray = viewer.camera.getPickRay(position);
			if (ray && viewer.scene.globe) {
				cartesian = viewer.scene.globe.pick(ray, viewer.scene);
			}
		}

		if (!Cesium.defined(cartesian)) {
			try {
				cartesian = viewer.camera.pickEllipsoid(position, Cesium.Ellipsoid.WGS84);
			} catch (e) { /* pickEllipsoid desteklenmiyor olabilir */ }
		}

		return cartesian;
	}

	function pickMeasurementFromScene(position) {
		var picked;
		try {
			picked = viewer.scene.pick(position);
		} catch (e) { /* picking hatası */ }
		if (!Cesium.defined(picked)) return null;

		var pickedMeasurement = findMeasurementFromPickedObject(picked);

		if (!pickedMeasurement) return null;
		var pickedGroup = groups.find(function (g) { return g.id === pickedMeasurement.groupId; });
		if (!(pickedMeasurement.isImported || isRefGroup(pickedGroup))) return null;
		var kadastro = getInfoPanelKadastroProps(pickedMeasurement.properties);
		if (!kadastro.ada_no && !kadastro.parsel_no && !kadastro.cins) return null;

		return {
			measurement: pickedMeasurement,
			kadastro: kadastro
		};
	}

	function buildCadastrePickCache() {
		var cache = [];
		var groupsById = {};
		for (var gi = 0; gi < groups.length; gi++) {
			groupsById[groups[gi].id] = groups[gi];
		}

		for (var i = 0; i < measurements.length; i++) {
			var m = measurements[i];
			if (!m.checked) continue;
			if (m.type !== 'polygon' || !m.points || m.points.length < 3) continue;
			var grp = groupsById[m.groupId];
			if (!(m.isImported || isRefGroup(grp))) continue;
			if (grp && grp.checked === false) continue;

			var kadastroProps = getInfoPanelKadastroProps(m.properties);
			if (!kadastroProps.ada_no && !kadastroProps.parsel_no) continue;

			var ring = [];
			var minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
			for (var p = 0; p < m.points.length; p++) {
				var c = Cesium.Cartographic.fromCartesian(m.points[p]);
				var lon = Cesium.Math.toDegrees(c.longitude);
				var lat = Cesium.Math.toDegrees(c.latitude);
				ring.push([lon, lat]);
				if (lon < minLon) minLon = lon;
				if (lon > maxLon) maxLon = lon;
				if (lat < minLat) minLat = lat;
				if (lat > maxLat) maxLat = lat;
			}

			if (ring.length < 3) continue;
			var bboxArea = Math.max(0, (maxLon - minLon) * (maxLat - minLat));

			cache.push({
				measurement: m,
				kadastro: kadastroProps,
				ring: ring,
				minLon: minLon,
				maxLon: maxLon,
				minLat: minLat,
				maxLat: maxLat,
				bboxArea: bboxArea
			});
		}

		cache.sort(function (a, b) {
			return a.bboxArea - b.bboxArea;
		});

		cadastrePickCache = cache;
		return cadastrePickCache.length;
	}

	// 2D Point-in-Polygon (Ray Casting algoritması)
	function pointSegmentDistanceMeters(px, py, x1, y1, x2, y2) {
		var latRad = Cesium.Math.toRadians(py);
		var metersPerLon = 111320 * Math.max(0.2, Math.cos(latRad));
		var metersPerLat = 110540;

		var ax = (x1 - px) * metersPerLon;
		var ay = (y1 - py) * metersPerLat;
		var bx = (x2 - px) * metersPerLon;
		var by = (y2 - py) * metersPerLat;

		var abx = bx - ax;
		var aby = by - ay;
		var denom = abx * abx + aby * aby;
		if (denom <= 1e-12) return Math.sqrt(ax * ax + ay * ay);

		var t = -(ax * abx + ay * aby) / denom;
		if (t < 0) t = 0;
		else if (t > 1) t = 1;

		var cx = ax + t * abx;
		var cy = ay + t * aby;
		return Math.sqrt(cx * cx + cy * cy);
	}

	function pointInPolygon(testX, testY, polygon, edgeTolMeters) {
		var inside = false;
		var len = polygon.length;
		for (var i = 0, j = len - 1; i < len; j = i++) {
			var xi = polygon[i][0], yi = polygon[i][1];
			var xj = polygon[j][0], yj = polygon[j][1];
			var denom = (yj - yi);
			if (((yi > testY) !== (yj > testY)) &&
				(testX < (xj - xi) * (testY - yi) / (Math.abs(denom) < 1e-12 ? 1e-12 : denom) + xi)) {
				inside = !inside;
			}
		}
		if (inside) return true;

		if (!edgeTolMeters || edgeTolMeters <= 0) return false;
		for (var a = 0, b = len - 1; a < len; b = a++) {
			var x1 = polygon[a][0], y1 = polygon[a][1];
			var x2 = polygon[b][0], y2 = polygon[b][1];
			if (pointSegmentDistanceMeters(testX, testY, x1, y1, x2, y2) <= edgeTolMeters) {
				return true;
			}
		}

		return inside;
	}

	function exitPickMode() {
		isPickMode = false;
		cadastrePickCache = [];
		if (typeof window !== 'undefined') window.__infoPickModeActive = false;
		viewer.scene.canvas.style.cursor = isInfoModeActive ? 'help' : '';
		setInfoPickButtonState(false);
		pickBtn.textContent = '';
		pickBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">ads_click</span> Ekranda Seç';
		var activeMeasurement = measurements.find(function (m) { return m.id === infoPanelState.measureId; });
		resetInfoPickStatusForMeasurement(activeMeasurement || null);
		if (pickHandler) {
			pickHandler.destroy();
			pickHandler = null;
		}
	}
	if (typeof window !== 'undefined') window.__exitInfoPickMode = exitPickMode;

	document.addEventListener('keydown', function (e) {
		if (e.key !== 'Escape') return;
		if (!isPickMode) return;
		e.preventDefault();
		exitPickMode();
	});

	pickBtn.addEventListener('click', function () {
		if (pickBtn.disabled) return;
		if (isPickMode) {
			exitPickMode();
			return;
		}
		var candidateCount = buildCadastrePickCache();
		pickBtn.title = 'Haritadan Referans Ada/Parsel Seç (' + candidateCount + ' aday)';
		isPickMode = true;
		if (typeof window !== 'undefined') window.__infoPickModeActive = true;
		viewer.scene.canvas.style.cursor = 'crosshair';
		setInfoPickButtonState(true);
		pickBtn.innerHTML = '<span class="material-symbols-outlined text-[14px]">close</span> Bitir';

		if (candidateCount > 0) {
			setInfoPickStatus('Seçim modu açık. Haritada sadece referans parsellerden seçim yapılır.', 'active');
			syncInfoPanelNoteToResultBar('Kadastro seçim modu aktif. Sadece referans parsellerden seçim yapılır.', 'info');
		} else {
			setInfoPickStatus('Referans aday bulunamadı. Referans katman görünürlüğünü kontrol edin.', 'warn');
			syncInfoPanelNoteToResultBar('Referans aday bulunamadı. Referans katmanı görünür değil veya boş olabilir.', 'warn');
		}

		pickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
		pickHandler.setInputAction(function (click) {
			// Önce doğrudan pick ile ölçüm yakalamayı dene (bireysel ölçümler için hızlı yol)
			var found = pickMeasurementFromScene(click.position);

			if (!found) {
				// Tıklanan noktayı WGS84'e çevir
				var cartesian = getPickCartesian(click.position);
				if (!Cesium.defined(cartesian)) {
					setInfoPickStatus('Konum alınamadı. Başka bir noktaya tıklayın.', 'error');
					syncInfoPanelNoteToResultBar('Konum alınamadı. Farklı bir noktaya tıklayın.', 'warn');
					return;
				}

				var carto = Cesium.Cartographic.fromCartesian(cartesian);
				var clickLon = Cesium.Math.toDegrees(carto.longitude);
				var clickLat = Cesium.Math.toDegrees(carto.latitude);
				var edgeToleranceMeters = 2.0;
				if (cadastrePickCache.length === 0) {
					buildCadastrePickCache();
				}

				// Polygon measurements arasında Point-in-Polygon kontrolü
				var latTol = edgeToleranceMeters / 110540;
				var lonTol = edgeToleranceMeters /
					(111320 * Math.max(0.2, Math.cos(Cesium.Math.toRadians(clickLat))));

				for (var i = 0; i < cadastrePickCache.length; i++) {
					var candidate = cadastrePickCache[i];
					if (clickLon < candidate.minLon - lonTol || clickLon > candidate.maxLon + lonTol ||
						clickLat < candidate.minLat - latTol || clickLat > candidate.maxLat + latTol) {
						continue;
					}

					if (pointInPolygon(clickLon, clickLat, candidate.ring, edgeToleranceMeters)) {
						found = {
							measurement: candidate.measurement,
							kadastro: candidate.kadastro
						};
						break;
					}
				}
			}

			if (found && found.measurement) {
				var selectedKadastro = found.kadastro;
				var selectedLabel = (selectedKadastro.ada_no || selectedKadastro.parsel_no)
					? (selectedKadastro.ada_no || '?') + '/' + (selectedKadastro.parsel_no || '?')
					: (selectedKadastro.cins || 'Seçildi');

				// Paneldeki Kadastro alanlarına yaz
				var adaInput = document.getElementById('infoAda');
				var parselInput = document.getElementById('infoParsel');
				var cinsInput = document.getElementById('infoCins');
				if (adaInput) adaInput.value = selectedKadastro.ada_no;
				if (parselInput) parselInput.value = selectedKadastro.parsel_no;
				if (cinsInput) cinsInput.value = selectedKadastro.cins;
				updateInfoPanelDirtyState(false);

				setInfoPickStatus('Seçilen referans parsel: ' + selectedLabel + ' · İsterseniz farklı parsel için tekrar tıklayın.', 'ok');
				syncInfoPanelNoteToResultBar('Seçilen referans parsel: ' + selectedLabel + '. Alınacak ada/parsel güncellendi.', 'ok');
			} else {
				// Parsel bulunamadı — seçim modu kapanmaz
				setInfoPickStatus('Referans parsel bulunamadı. Başka bir noktaya tıklayarak devam edin.', 'warn');
				syncInfoPanelNoteToResultBar('Tıklanan noktada referans parsel bulunamadı. Seçim modu açık, tekrar tıklayın.', 'warn');
			}
		}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
	});
})();

function deleteMeasurement(id) {
	var idx = measurements.findIndex(function (m) { return m.id === id; });
	if (idx === -1) return;
	var m = measurements[idx];

	// ── Edit modundaysa önce temiz çık ──
	if (typeof EditManager !== 'undefined' && EditManager.activeMeasure && EditManager.activeMeasure.id === id) {
		EditManager.stopEdit(); // tüm grip/primitive/listener temizliği burada
	}


	// Sahneden entity/primitive'leri kaldır
	m.entities.forEach(function (item) { safeRemoveItem(item); });
	measurements.splice(idx, 1);
	if (activeHighlightId === id) {
		activeHighlightId = null;
		clearBatchedSelectionOverlay();
	}
	var delFab = document.getElementById('deleteSelFab');
	if (delFab) delFab.style.display = 'none';
	viewer.scene.requestRender();
	renderList();
	debouncedSave();
}

function deleteGroup(id) {
	if (id === 0) return; // Varsayılan "Grup 1" silinemez

	// Batch primitifleri varsa sahneden kaldır
	var grp = groups.find(function (g) { return g.id === id; });
	if (grp && grp.isClipBoxRoot) {
		savedClipBoxes.forEach(function (clip) {
			if (clip.groupId === id) clearClipOverlayEntities(clip._overlayEntities || []);
		});
		savedClipBoxes = savedClipBoxes.filter(function (clip) { return clip.groupId !== id; });
		if (!savedClipBoxes.length) selectedSavedClipBoxId = null;
	}
	if (grp && grp._batchPrimitives) {
		grp._batchPrimitives.forEach(function (prim) {
			try { viewer.scene.primitives.remove(prim); } catch (e) { }
		});
		grp._batchPrimitives = null;
	}

	// Gruba ait objeleri sahneden kaldır ve measurements listesinden ayır
	var remainingMeasurements = [];
	measurements.forEach(function (m) {
		if (m.groupId === id) {
			if (!m.isBatched) {
				m.entities.forEach(function (ent) { safeRemoveItem(ent); });
			}
			if (activeHighlightId === m.id) {
				activeHighlightId = null;
				clearBatchedSelectionOverlay();
			}
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

	// İmport verisini de IndexedDB'den sil
	CbsStorage.deleteImport(id).catch(function (e) { console.warn('Import silme hatası:', e); });
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
	var hasReferenceLayer = groups.some(function (g) {
		return g.id !== 0 && (g.isReferans || (g._batchPrimitives && g._batchPrimitives.length > 0));
	});
	var hasSavedClip = !!(savedClipBoxes && savedClipBoxes.length > 0);
	if (totalCount === 0 && !hasReferenceLayer && !hasSavedClip) return;

	var refLayerCount = groups.filter(function (g) { return g.id !== 0 && g.isReferans; }).length;
	var confirmText = 'Tüm gruplardaki ' + totalCount + ' ölçüm';
	if (refLayerCount > 0) confirmText += ' ve ' + refLayerCount + ' referans katman';
	confirmText += ' haritadan ve listeden kalıcı olarak silinecek.\n\nBu işlem geri alınamaz. Devam etmek istediğinize emin misiniz?';

	showResultConfirmDialog(confirmText, function () {
		// Bekleyen gecikmeli kayıt varsa iptal et; temizleme adımıyla yarışmasın
		if (_saveTimer) {
			clearTimeout(_saveTimer);
			_saveTimer = null;
		}

		// Aktif kırpma varsa kapatıp geçici gizlemeleri geri yükle
		if (typeof ClipBoxManager !== 'undefined' && (ClipBoxManager.active || ClipBoxManager._placementMode)) {
			ClipBoxManager.deactivate();
		}

		// Referans/import batch primitiflerini sahneden kaldır
		groups.forEach(function (g) {
			if (!g || !g._batchPrimitives) return;
			g._batchPrimitives.forEach(function (prim) {
				try { viewer.scene.primitives.remove(prim); } catch (e) { }
			});
			g._batchPrimitives = null;
		});

		measurements.forEach(function (m) {
			m.entities.forEach(function (ent) { safeRemoveItem(ent); });
		});
		savedClipBoxes.forEach(function (clip) {
			clearClipOverlayEntities(clip._overlayEntities || []);
		});
		measurements = [];
		savedClipBoxes = [];
		selectedSavedClipBoxId = null;
		activeHighlightId = null;
		clearBatchedSelectionOverlay();
		// Varsayılan grup (id:0) hariç tüm grupları sil
		groups = groups.filter(function (g) { return g.id === 0; });
		if (groups.length === 0) {
			groups = [{ id: 0, name: 'Genel', isOpen: false, checked: true, color: '#14B8A6' }];
		} else {
			groups[0].name = groups[0].name || 'Genel';
			groups[0].isOpen = false;
			groups[0].checked = true;
			groups[0].color = groups[0].color || '#14B8A6';
			groups[0].isReferans = false;
			groups[0].isClipBoxRoot = false;
			groups[0]._batchPrimitives = null;
		}
		measureCount = 0;
		groupCount = 0;
		savedClipBoxCount = 0;
		activeGroupId = 0;
		viewer.scene.requestRender();
		renderList();

		// IndexedDB'deki import kayıtlarını da temizle; ardından temiz durumu kaydet
		if (typeof CbsStorage !== 'undefined' && typeof CbsStorage.clearAll === 'function') {
			CbsStorage.clearAll().then(function () {
				saveToStorage();
			}).catch(function (e) {
				console.warn('Toplu temizleme depolama hatası:', e);
				saveToStorage();
			});
		} else {
			saveToStorage();
		}
	});
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
	if (!_allVisible) {
		activeHighlightId = null;
		clearBatchedSelectionOverlay();
	}
	viewer.scene.requestRender();
	renderList();
	debouncedSave();
});

// ─── 6. ÇİZİM ARAÇLARI ───────────────────────────────────────
var handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
// main.js çekirdek bağımlılıkları hazır: edit-manager gibi modüller güvenle bağlanabilir.
window.__cbsMainReady = true;
window.dispatchEvent(new CustomEvent('cbs-main-ready'));
var activeTool = null;
var isInfoModeActive = false; // "i" tuşu ile aktifleşen salt-okunur inceleme modu
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

// ─── RUBBER-BAND (Kauçuk İp) ÖNİZLEME ────────────────────────
// Startup'ta bir kez oluşturulur, ASLA yeniden yaratılmaz (sıfır allocation).
// ÖNEMLİ: PolylineDashMaterialProperty + iç içe CallbackProperty kombinasyonu
// Cesium'da GPU shader uniform bağlama hatası (_target undefined) üretiyor.
// Bu nedenle: sade ColorMaterialProperty + _rubberColor değişkeni kullanıyoruz.
// Renk MOUSE_MOVE'da (zaten çalışan kod) tek satırda güncellenir.
var _rubberEnd = null;   // Son fare konumu (Cartesian3)
var _rubberColor = Cesium.Color.fromCssColorString('#14B8A6').withAlpha(0.65);
var _rubberBandLine = drawLayer.entities.add({
	show: false,
	polyline: {
		positions: new Cesium.CallbackProperty(function () {
			if (!clickPoints.length || !_rubberEnd) return [];
			return [clickPoints[clickPoints.length - 1], _rubberEnd];
		}, false),

		width: VEC_STYLE.line.width,
		material: new Cesium.ColorMaterialProperty(
			new Cesium.CallbackProperty(function () { return _rubberColor; }, false)
		),
		clampToGround: false
	}
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
	// Rubber-band temizle
	_rubberBandLine.show = false;
	_rubberEnd = null;
	clearZOverlays();
}

// ─── Z-AYAR SLIDER SİSTEMİ ────────────────────────────────────
// Z butonu artık resultDisplay barının sağında sabit konumda beliriyor
var _zBtnWrapper = null;  // Z buton wrapper'ı
var _activeZSlider = null; // popup ref
var _activeZIndex = -1;    // hangi clickPoints index'i

function clearZOverlays() {
	closeZSlider();
	if (_zBtnWrapper && _zBtnWrapper.parentNode) {
		_zBtnWrapper.parentNode.removeChild(_zBtnWrapper);
	}
	_zBtnWrapper = null;
	_activeZIndex = -1;
}

function createZButton(index) {
	// Önce eskisini kaldır
	clearZOverlays();
	_activeZIndex = index;

	var resultBar = document.getElementById('resultDisplay');
	if (!resultBar) return;

	// Wrapper — resultDisplay'in sağında konumlanır
	var wrapper = document.createElement('div');
	wrapper.style.cssText = 'position:absolute;right:-52px;top:50%;transform:translateY(-50%);pointer-events:auto;display:flex;flex-direction:column;align-items:center;';
	wrapper.className = 'z-btn-wrapper';

	var btn = document.createElement('button');
	btn.textContent = 'Z ±';
	btn.setAttribute('aria-label', 'Yükseklik (Z) Ayarla');
	btn.title = 'Kot (Z) Ayarla';
	btn.style.cssText = [
		'padding:6px 14px;font-size:14px;font-weight:600;font-family:inherit',
		'border:1px solid rgba(0,0,0,0.15);border-radius:9999px',
		'background:#ffffff;color:#0f172a',
		'cursor:pointer;white-space:nowrap',
		'transition:all 0.2s ease'
	].join(';');
	btn.addEventListener('mouseenter', function () {
		this.style.background = '#e2e8f0';
	});
	btn.addEventListener('mouseleave', function () {
		this.style.background = '#ffffff';
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

	// resultDisplay'e relative pozisyon ekle (bir kez)
	if (getComputedStyle(resultBar).position === 'static') {
		resultBar.style.position = 'relative';
	}
	resultBar.appendChild(wrapper);
	_zBtnWrapper = wrapper;
}

function removeLastZButton() {
	clearZOverlays();
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
		'position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%)',
		'min-width:110px',
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

	wrapperEl.appendChild(popup);
	_activeZSlider = popup;
}

function closeZSlider() {
	if (_activeZSlider && _activeZSlider.parentNode) {
		_activeZSlider.parentNode.removeChild(_activeZSlider);
	}
	_activeZSlider = null;
}

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
	// Edit modu açıksa otomatik commit et — iki overlay aynı anda aktif olamaz.
	// Standart CAD/GIS: yeni araç açılınca mevcut edit kayıt edilir.
	if (typeof EditManager !== 'undefined' && EditManager.activeMeasure) {
		EditManager.stopEdit();
	}

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

	// Rubber-band rengini araç aktif edildiğinde bir kez güncelle (MOUSE_MOVE'da değil)
	if (typeof _rubberColor !== 'undefined') {
		var _rbGrp = groups.find(function (g) { return g.id === activeGroupId; });
		var _rbHex = _rbGrp && _rbGrp.color ? _rbGrp.color : '#14B8A6';
		_rubberColor = Cesium.Color.fromCssColorString(_rbHex).withAlpha(0.65);
	}

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

// ─── MOBİL LONG-PRESS SNAP ─────────────────────────────────────────────────
(function () {
	var LONG_MS = 500;
	var SNAP_PX = 80;
	var LOUPE_OFFSET = 145;

	// ── Web Audio haptic (iOS Safari navigator.vibrate desteklemiyor) ──
	function _tick(freq, durMs, gain) {
		try {
			var ac = new (window.AudioContext || window.webkitAudioContext)();
			var o = ac.createOscillator();
			var g = ac.createGain();
			o.connect(g); g.connect(ac.destination);
			o.type = 'sine';
			o.frequency.value = freq;
			g.gain.setValueAtTime(gain, ac.currentTime);
			g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + durMs / 1000);
			o.start(); o.stop(ac.currentTime + durMs / 1000);
			setTimeout(function () { ac.close(); }, durMs + 50);
		} catch (e) { }
	}
	function _hapticActivate() { _tick(320, 40, 0.18); }              // long-press: orta buzz
	function _hapticSnapFound() { _tick(800, 28, 0.22); }             // vertex snap: güçlü TINK
	function _hapticSnapLost() { _tick(380, 20, 0.10); }             // snap kayboldu: hafif tik
	function _hapticPlace() {                                          // nokta eklendi: tink-tink
		_tick(800, 22, 0.22);
		setTimeout(function () { _tick(1050, 20, 0.18); }, 55);
	}

	var _pressTimer = null;
	var _inSnap = false;
	var _snapCand = null;
	var _touchX = 0, _touchY = 0;
	var _scanTimer = null;

	function _toScreen(cart) {
		try { return Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, cart); }
		catch (e) { return null; }
	}

	function _positionLoupe(tx, ty) {
		var loupe = document.getElementById('snapLoupe');
		if (!loupe) return;
		loupe.style.left = (tx - 60) + 'px';
		loupe.style.top = Math.max(4, ty - LOUPE_OFFSET - 120) + 'px';
	}

	function _scan() {
		var label = document.getElementById('snapLoupeLabel');
		var coord = document.getElementById('snapLoupeCoord');
		var ring = document.getElementById('snapLoupeRing');
		var dot = document.getElementById('snapLoupeDot');
		var lc = document.getElementById('snapLoupeCanvas');
		if (!label) return;

		// ── Parmak altını 2× büyüterek loupe canvas'ına çiz ──
		// Cesium canvas size = CSS size * devicePixelRatio (DPR)
		// Touch koordinatları CSS piksel → DPR ile fiziksel piksele çevir
		if (lc) {
			try {
				var dpr = window.devicePixelRatio || 1;
				var src = viewer.scene.canvas;
				var ctx = lc.getContext('2d');
				var SRC_CSS = 70; // CSS piksel cinsinden yakalama yarıçapı
				var SRC = SRC_CSS * dpr; // Fiziksel piksel
				var sx = (_touchX * dpr) - SRC;
				var sy = (_touchY * dpr) - SRC;
				ctx.clearRect(0, 0, 140, 140);
				ctx.drawImage(src, sx, sy, SRC * 2, SRC * 2, 0, 0, 140, 140);
			} catch (e) { /* WebGL context kaybı gibi uç durumlar */ }
		}

		var prevHad = !!_snapCand;
		_snapCand = null;
		var snapPx2 = SNAP_PX * SNAP_PX;
		var bestD2 = Number.POSITIVE_INFINITY, bestPt = null;

		var groupById = Object.create(null);
		for (var gi = 0; gi < groups.length; gi++) {
			groupById[groups[gi].id] = groups[gi];
		}

		// [P2a] Geçiş 1: KENDİ ölçümler + aktif çizim (referans gruplar bu geçişte atlanır)
		measurements.forEach(function (m) {
			if (!m.points || m.checked === false) return;
			var mGroup = groupById[m.groupId];
			if (isRefGroup(mGroup) || m.isImported) return; // Referans bu geçişte atla
			m.points.forEach(function (cp) {
				var sp = _toScreen(cp);
				if (!sp) return;
				var dx = sp.x - _touchX;
				var dy = sp.y - _touchY;
				var d2 = dx * dx + dy * dy;
				if (d2 < bestD2) { bestD2 = d2; bestPt = { pos: cp, sp: sp }; }
			});
		});
		clickPoints.forEach(function (cp) {
			var sp = _toScreen(cp);
			if (!sp) return;
			var dx = sp.x - _touchX;
			var dy = sp.y - _touchY;
			var d2 = dx * dx + dy * dy;
			if (d2 < bestD2) { bestD2 = d2; bestPt = { pos: cp, sp: sp }; }
		});

		// [P2a] Geçiş 2: Geçiş 1'de snap bulunamazsa snapEnabled referans gruplar
		if (!bestPt || bestD2 >= snapPx2) {
			measurements.forEach(function (m) {
				if (!m.points || m.checked === false) return;
				var mGroup = groupById[m.groupId];
				if (!mGroup || !isRefGroup(mGroup) || !mGroup.snapEnabled) return;
				m.points.forEach(function (cp) {
					var sp = _toScreen(cp);
					if (!sp) return;
					var dx = sp.x - _touchX;
					var dy = sp.y - _touchY;
					var d2 = dx * dx + dy * dy;
					if (d2 < bestD2) { bestD2 = d2; bestPt = { pos: cp, sp: sp }; }
				});
			});
		}

		if (bestPt && bestD2 < snapPx2) {
			_snapCand = bestPt;
			var carto = Cesium.Cartographic.fromCartesian(bestPt.pos);
			label.textContent = '⚡ SNAP';
			label.style.color = '#22d3ee';
			label.style.borderColor = 'rgba(6,182,212,0.4)';
			coord.textContent = Cesium.Math.toDegrees(carto.longitude).toFixed(5) +
				' / ' + Cesium.Math.toDegrees(carto.latitude).toFixed(5);
			if (ring) { ring.style.borderColor = 'rgba(6,182,212,1)'; ring.style.boxShadow = '0 0 0 6px rgba(6,182,212,0.28),0 8px 28px rgba(0,0,0,0.6)'; }
			if (dot) { dot.style.background = '#22d3ee'; dot.style.boxShadow = '0 0 8px rgba(6,182,212,0.9)'; }
			if (!prevHad) _hapticSnapFound();
		} else {
			label.textContent = 'Snap Yok';
			label.style.color = '#f87171';
			label.style.borderColor = 'rgba(239,68,68,0.3)';
			coord.textContent = '—';
			if (ring) { ring.style.borderColor = 'rgba(239,68,68,0.7)'; ring.style.boxShadow = '0 0 0 5px rgba(239,68,68,0.1),0 8px 28px rgba(0,0,0,0.55)'; }
			if (dot) { dot.style.background = '#f87171'; dot.style.boxShadow = '0 0 6px rgba(239,68,68,0.6)'; }
			if (prevHad) _hapticSnapLost();
		}
		viewer.scene.requestRender();
	}

	function _enterSnap() {
		_inSnap = true;
		var loupe = document.getElementById('snapLoupe');
		if (loupe) { loupe.style.display = 'flex'; _positionLoupe(_touchX, _touchY); }
		_hapticActivate();
		_scan();
		_scanTimer = setInterval(_scan, 150);
	}

	function _exitSnap(place) {
		clearInterval(_scanTimer); _scanTimer = null;
		_inSnap = false;
		var loupe = document.getElementById('snapLoupe');
		if (loupe) loupe.style.display = 'none';
		if (!place || !activeTool) { _snapCand = null; return; }
		var leftClick = handler.getInputAction(Cesium.ScreenSpaceEventType.LEFT_CLICK);
		if (!leftClick) { _snapCand = null; return; }
		if (_snapCand) {
			var sp = _snapCand.sp || _toScreen(_snapCand.pos);
			if (sp) {
				leftClick({ position: new Cesium.Cartesian2(sp.x, sp.y) });
				_hapticPlace(); // Snap ile nokta eklendi: tink-tink
			}
		} else {
			leftClick({ position: new Cesium.Cartesian2(_touchX, _touchY) });
			_hapticSnapLost(); // Normal ekleme: hafif tik
		}
		_snapCand = null;
	}

	window.addEventListener('load', function () {
		var canvas = document.getElementById('cesiumContainer');
		if (!canvas) return;
		canvas.addEventListener('touchstart', function (e) {
			if (!_isMob || !activeTool) return;
			var t = e.touches[0];
			_touchX = t.clientX; _touchY = t.clientY;
			_inSnap = false; _snapCand = null;
			clearTimeout(_pressTimer);
			_pressTimer = setTimeout(_enterSnap, LONG_MS);
		}, { passive: true });
		canvas.addEventListener('touchmove', function (e) {
			if (!_isMob) return;
			var t = e.touches[0];
			_touchX = t.clientX; _touchY = t.clientY;
			if (!_inSnap) { clearTimeout(_pressTimer); _pressTimer = null; return; }
			_positionLoupe(_touchX, _touchY);
		}, { passive: true });
		canvas.addEventListener('touchend', function (e) {
			if (!_isMob) return;
			clearTimeout(_pressTimer); _pressTimer = null;
			if (_inSnap) { e.preventDefault(); _exitSnap(true); }
		}, { passive: false });
		canvas.addEventListener('touchcancel', function () {
			clearTimeout(_pressTimer); _pressTimer = null;
			if (_inSnap) _exitSnap(false);
		}, { passive: true });
	});
})();

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


// ─── Referans grup tespiti (çift kontrol: flag + isim prefix) ─────────────
// 'isReferans' flag'i olmayan eski IndexedDB kayıtları için 📌 prefix fallback
function isRefGroup(grp) {
	if (!grp) return false;
	return grp.isReferans === true || grp.name.indexOf('📌') === 0;
}

var SNAP_INDEX_MAX_RESULTS = _isMob ? 260 : 900;
var SNAP_INDEX_WINDOW_SCALE = _isMob ? 10 : 8;
var SNAP_INDEX_FALLBACK_WINDOW_SCALE_MULT = _isMob ? 2.0 : 1.7;
var _refSnapSpatialIndex = {
	vertexTree: null,
	edgeTree: null,
	builtAt: 0,
	signature: '',
	vertexCount: 0,
	edgeCount: 0
};

function _snapHashMix(seed, value) {
	var v = (value | 0) >>> 0;
	var h = (seed ^ v) >>> 0;
	h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
	return h;
}

function _buildSnapKdTree(items, depth) {
	if (!items || items.length === 0) return null;
	var axis = (depth & 1) === 0 ? 'x' : 'y';
	items.sort(function (a, b) { return a[axis] - b[axis]; });
	var mid = (items.length / 2) | 0;
	var item = items[mid];
	var node = {
		item: item,
		left: null,
		right: null,
		minX: item.x,
		maxX: item.x,
		minY: item.y,
		maxY: item.y,
		maxReachX: item.reachX || 0,
		maxReachY: item.reachY || 0
	};

	if (mid > 0) node.left = _buildSnapKdTree(items.slice(0, mid), depth + 1);
	if (mid + 1 < items.length) node.right = _buildSnapKdTree(items.slice(mid + 1), depth + 1);

	var kids = [node.left, node.right];
	for (var k = 0; k < kids.length; k++) {
		var child = kids[k];
		if (!child) continue;
		if (child.minX < node.minX) node.minX = child.minX;
		if (child.maxX > node.maxX) node.maxX = child.maxX;
		if (child.minY < node.minY) node.minY = child.minY;
		if (child.maxY > node.maxY) node.maxY = child.maxY;
		if (child.maxReachX > node.maxReachX) node.maxReachX = child.maxReachX;
		if (child.maxReachY > node.maxReachY) node.maxReachY = child.maxReachY;
	}

	return node;
}

function _querySnapPointTree(node, minX, minY, maxX, maxY, out, maxOut) {
	if (!node || out.length >= maxOut) return;
	if (node.maxX < minX || node.minX > maxX || node.maxY < minY || node.minY > maxY) return;

	var item = node.item;
	if (item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY) {
		out.push(item);
		if (out.length >= maxOut) return;
	}

	_querySnapPointTree(node.left, minX, minY, maxX, maxY, out, maxOut);
	if (out.length >= maxOut) return;
	_querySnapPointTree(node.right, minX, minY, maxX, maxY, out, maxOut);
}

function _querySnapEdgeTree(node, minX, minY, maxX, maxY, out, maxOut) {
	if (!node || out.length >= maxOut) return;
	if ((node.maxX + node.maxReachX) < minX || (node.minX - node.maxReachX) > maxX) return;
	if ((node.maxY + node.maxReachY) < minY || (node.minY - node.maxReachY) > maxY) return;

	var item = node.item;
	if (item.minX <= maxX && item.maxX >= minX && item.minY <= maxY && item.maxY >= minY) {
		out.push(item);
		if (out.length >= maxOut) return;
	}

	_querySnapEdgeTree(node.left, minX, minY, maxX, maxY, out, maxOut);
	if (out.length >= maxOut) return;
	_querySnapEdgeTree(node.right, minX, minY, maxX, maxY, out, maxOut);
}

function _estimateSnapMetersPerPixel() {
	var viewH = Math.max(1, viewer.canvas.clientHeight || viewer.canvas.height || 1);
	if (isOrthographic && viewer.camera && viewer.camera.frustum) {
		var fr = viewer.camera.frustum;
		var frWidth = (typeof fr.width === 'number' && isFinite(fr.width)) ? fr.width : null;
		if (frWidth && frWidth > 0) {
			var aspect = (typeof fr.aspectRatio === 'number' && fr.aspectRatio > 0)
				? fr.aspectRatio
				: (viewer.canvas.clientWidth / viewH);
			var frHeight = frWidth / Math.max(0.01, aspect);
			return frHeight / viewH;
		}
	}

	var camCarto = viewer.camera.positionCartographic;
	var camHeight = (camCarto && isFinite(camCarto.height)) ? Math.max(1, camCarto.height) : 150;
	var fovy = (viewer.camera.frustum && typeof viewer.camera.frustum.fovy === 'number' && viewer.camera.frustum.fovy > 0)
		? viewer.camera.frustum.fovy
		: Cesium.Math.toRadians(60);
	return (2 * camHeight * Math.tan(fovy * 0.5)) / viewH;
}

function _getSnapMouseCartographic(mousePos) {
	if (!mousePos) return null;
	var c3 = null;
	try {
		var ray = viewer.camera.getPickRay(mousePos);
		if (ray) c3 = viewer.scene.globe.pick(ray, viewer.scene);
	} catch (e) { }
	if (!Cesium.defined(c3)) {
		try { c3 = viewer.camera.pickEllipsoid(mousePos, viewer.scene.globe.ellipsoid); } catch (e2) { }
	}
	if (Cesium.defined(c3)) {
		try { return Cesium.Cartographic.fromCartesian(c3); } catch (e3) { }
	}
	if (viewer.camera.positionCartographic) return viewer.camera.positionCartographic;
	return null;
}

function _getSnapGeoQueryWindow(mousePos, thresholdPx, windowScaleMultiplier) {
	var center = _getSnapMouseCartographic(mousePos);
	if (!center) return null;

	var mpp = _estimateSnapMetersPerPixel();
	if (!isFinite(mpp) || mpp <= 0) mpp = 0.5;
	var scale = (typeof windowScaleMultiplier === 'number' && isFinite(windowScaleMultiplier) && windowScaleMultiplier > 0)
		? windowScaleMultiplier
		: 1;
	var meters = Math.max(1.5, mpp * Math.max(8, thresholdPx * SNAP_INDEX_WINDOW_SCALE * scale));

	var earthR = 6378137.0;
	var latPad = Cesium.Math.toDegrees(meters / earthR);
	var cosLat = Math.abs(Math.cos(center.latitude));
	if (cosLat < 0.12) cosLat = 0.12;
	var lonPad = latPad / cosLat;

	var lonDeg = Cesium.Math.toDegrees(center.longitude);
	var latDeg = Cesium.Math.toDegrees(center.latitude);
	return {
		minX: lonDeg - lonPad,
		maxX: lonDeg + lonPad,
		minY: latDeg - latPad,
		maxY: latDeg + latPad
	};
}

function _buildReferenceSnapSignature(groupById) {
	var refCount = 0;
	var refPointCount = 0;
	var refEdgeCount = 0;
	var hash = 2166136261;

	for (var i = 0; i < measurements.length; i++) {
		var m = measurements[i];
		if (!m || !m.checked || !m.points || m.points.length === 0) continue;
		var mGroup = groupById[m.groupId];
		if (!mGroup || !isRefGroup(mGroup) || !mGroup.snapEnabled) continue;

		refCount++;
		var len = m.points.length;
		refPointCount += len;
		var edgeAdd = 0;
		if (m.type === 'line' || m.type === 'polygon' || m.type === 'height') {
			edgeAdd = m.type === 'polygon' ? len : Math.max(0, len - 1);
			refEdgeCount += edgeAdd;
		}

		hash = _snapHashMix(hash, len + (edgeAdd << 1) + i);
		var p0 = m.points[0];
		var pN = m.points[len - 1];
		if (p0) {
			hash = _snapHashMix(hash, Math.round((p0.x || 0) * 0.01));
			hash = _snapHashMix(hash, Math.round((p0.y || 0) * 0.01));
			hash = _snapHashMix(hash, Math.round((p0.z || 0) * 0.01));
		}
		if (pN) {
			hash = _snapHashMix(hash, Math.round((pN.x || 0) * 0.01));
			hash = _snapHashMix(hash, Math.round((pN.y || 0) * 0.01));
			hash = _snapHashMix(hash, Math.round((pN.z || 0) * 0.01));
		}
	}

	return {
		signature: refCount + '|' + refPointCount + '|' + refEdgeCount + '|' + (hash >>> 0),
		refCount: refCount,
		refPointCount: refPointCount,
		refEdgeCount: refEdgeCount
	};
}

function _rebuildReferenceSnapSpatialIndex(groupById, now, sigInfo) {
	var vertexItems = [];
	var edgeItems = [];

	for (var mi = 0; mi < measurements.length; mi++) {
		var m = measurements[mi];
		if (!m || !m.checked || !m.points || m.points.length === 0) continue;
		var mGroup = groupById[m.groupId];
		if (!mGroup || !isRefGroup(mGroup) || !mGroup.snapEnabled) continue;

		var pts = m.points;
		var geoPts = new Array(pts.length);
		for (var pi = 0; pi < pts.length; pi++) {
			var p = pts[pi];
			if (!p) continue;
			var carto;
			try { carto = Cesium.Cartographic.fromCartesian(p); } catch (e) { carto = null; }
			if (!carto) continue;

			var lon = Cesium.Math.toDegrees(carto.longitude);
			var lat = Cesium.Math.toDegrees(carto.latitude);
			var vertexItem = { x: lon, y: lat, point: p };
			vertexItems.push(vertexItem);
			geoPts[pi] = vertexItem;
		}

		if (m.type === 'line' || m.type === 'polygon' || m.type === 'height') {
			var edgeLen = m.type === 'polygon' ? pts.length : pts.length - 1;
			for (var ei = 0; ei < edgeLen; ei++) {
				var gp1 = geoPts[ei];
				var gp2 = geoPts[(ei + 1) % pts.length];
				if (!gp1 || !gp2) continue;

				var minX = Math.min(gp1.x, gp2.x);
				var maxX = Math.max(gp1.x, gp2.x);
				var minY = Math.min(gp1.y, gp2.y);
				var maxY = Math.max(gp1.y, gp2.y);
				edgeItems.push({
					x: (minX + maxX) * 0.5,
					y: (minY + maxY) * 0.5,
					minX: minX,
					maxX: maxX,
					minY: minY,
					maxY: maxY,
					reachX: (maxX - minX) * 0.5,
					reachY: (maxY - minY) * 0.5,
					p1: pts[ei],
					p2: pts[(ei + 1) % pts.length]
				});
			}
		}
	}

	_refSnapSpatialIndex.vertexTree = vertexItems.length ? _buildSnapKdTree(vertexItems, 0) : null;
	_refSnapSpatialIndex.edgeTree = edgeItems.length ? _buildSnapKdTree(edgeItems, 0) : null;
	_refSnapSpatialIndex.vertexCount = vertexItems.length;
	_refSnapSpatialIndex.edgeCount = edgeItems.length;
	_refSnapSpatialIndex.signature = sigInfo.signature;
	_refSnapSpatialIndex.builtAt = now;
}

function _ensureReferenceSnapSpatialIndex(groupById, now) {
	var sigInfo = _buildReferenceSnapSignature(groupById);
	if (_refSnapSpatialIndex.signature === sigInfo.signature) {
		return _refSnapSpatialIndex;
	}
	_rebuildReferenceSnapSpatialIndex(groupById, now, sigInfo);
	return _refSnapSpatialIndex;
}

function _queryReferenceVertexCandidates(mousePos, thresholdPx, groupById, now) {
	var idx = _ensureReferenceSnapSpatialIndex(groupById, now);
	if (!idx || !idx.vertexTree || idx.vertexCount === 0) return [];
	var win = _getSnapGeoQueryWindow(mousePos, thresholdPx, 1);
	if (!win) return [];
	var out = [];
	_querySnapPointTree(idx.vertexTree, win.minX, win.minY, win.maxX, win.maxY, out, SNAP_INDEX_MAX_RESULTS);
	if (out.length === 0) {
		var fallbackWin = _getSnapGeoQueryWindow(mousePos, thresholdPx, SNAP_INDEX_FALLBACK_WINDOW_SCALE_MULT);
		if (fallbackWin) {
			_querySnapPointTree(idx.vertexTree, fallbackWin.minX, fallbackWin.minY, fallbackWin.maxX, fallbackWin.maxY, out, SNAP_INDEX_MAX_RESULTS);
		}
	}
	return out;
}

function _queryReferenceEdgeCandidates(mousePos, thresholdPx, groupById, now) {
	var idx = _ensureReferenceSnapSpatialIndex(groupById, now);
	if (!idx || !idx.edgeTree || idx.edgeCount === 0) return [];
	var win = _getSnapGeoQueryWindow(mousePos, thresholdPx, 1);
	if (!win) return [];
	var out = [];
	_querySnapEdgeTree(idx.edgeTree, win.minX, win.minY, win.maxX, win.maxY, out, SNAP_INDEX_MAX_RESULTS);
	if (out.length === 0) {
		var fallbackWin = _getSnapGeoQueryWindow(mousePos, thresholdPx, SNAP_INDEX_FALLBACK_WINDOW_SCALE_MULT);
		if (fallbackWin) {
			_querySnapEdgeTree(idx.edgeTree, fallbackWin.minX, fallbackWin.minY, fallbackWin.maxX, fallbackWin.maxY, out, SNAP_INDEX_MAX_RESULTS);
		}
	}
	return out;
}

// ─── EKLENEN ÖZELLİK: FARE HAREKETİ İLE NOKTA YAKALAMA (SNAP) ───
// Optimizasyon: 1) 33ms throttle, 2) Vertex önceliği, 3) Globe pick yok, 4) Viewport+kutu clipping
var _lastSnapTime = 0;
var _snapThrottleMs = 33;
var _snapCostAvgMs = 0;
var _snapHeavyModeNotified = false;
var SNAP_REF_MEASUREMENT_LIMIT = _isMob ? 120 : 320;
var RUBBER_PICK_FALLBACK_INTERVAL_MS = _isMob ? 90 : 55;
var _lastRubberPickFallbackAt = 0;
var _prevSnapState = null; // [P3] 'vertex' | 'edge' | null — gereksiz requestRender'ı önler
handler.setInputAction(function (movement) {
	// EditManager sürükleme sırasında snap aktif kalmalı
	var _editDragging = (typeof EditManager !== 'undefined' && EditManager.isDragging);
	if (!activeTool && !_editDragging) {
		if (snapIndicator && snapIndicator.show) {
			snapIndicator.show = false;
			viewer.scene.requestRender();
		}
		snappedCartesian = null;
		if (_rubberBandLine.show) { _rubberBandLine.show = false; viewer.scene.requestRender(); }
		return;
	}

	// ─── RUBBER-BAND: THROTTLE'DAN BAĞIMSIZ — HER MOUSE_MOVE'DA GÜNCELLE ───
	var _rbActiveEarly = (activeTool === 'btnDistance' ||
		activeTool === 'btnArea' ||
		activeTool === 'btnHeight') &&
		clickPoints.length > 0;
	if (_rbActiveEarly) {
		var _rbEarlyCartesian = null;
		try {
			var _rbRayE = viewer.camera.getPickRay(movement.endPosition);
			if (_rbRayE) {
				var _globePtE = viewer.scene.globe.pick(_rbRayE, viewer.scene);
				if (Cesium.defined(_globePtE)) {
					_rbEarlyCartesian = _globePtE;
				} else {
					// Globe miss (3D model üzerinde) — pickPosition GPU fallback
					var _scenePtE = viewer.scene.pickPosition(movement.endPosition);
					if (Cesium.defined(_scenePtE)) _rbEarlyCartesian = _scenePtE;
				}
			}
		} catch (e) { /* sessiz */ }
		if (Cesium.defined(_rbEarlyCartesian)) {
			_rubberEnd = _rbEarlyCartesian;
			_rubberBandLine.show = true;
			viewer.scene.requestRender();
		}
	} else if (_rubberBandLine.show) {
		_rubberBandLine.show = false;
		viewer.scene.requestRender();
	}

	// [OPT-1] Throttle: saniyede ~30 kez çalışsın (33ms aralık — CAD benzeri tepki)
	var now = performance.now();
	if (now - _lastSnapTime < _snapThrottleMs) return;
	_lastSnapTime = now;
	var _snapPassStart = now;
	function _finishSnapPass() {
		var _cost = performance.now() - _snapPassStart;
		if (!isFinite(_cost)) return;
		_snapCostAvgMs = (_snapCostAvgMs * 0.85) + (_cost * 0.15);
		if (_snapCostAvgMs > 14) _snapThrottleMs = 100;
		else if (_snapCostAvgMs > 10) _snapThrottleMs = 66;
		else if (_snapCostAvgMs > 7) _snapThrottleMs = 50;
		else _snapThrottleMs = 33;
	}

	var threshold = 15; // px (Yakalaşma mesafesi)
	var threshold2 = threshold * threshold;
	var mousePos = movement.endPosition;

	// [OPT-4] Viewport sınırları — ekran dışı noktaları hızlıca elemek için
	var viewW = viewer.canvas.clientWidth;
	var viewH = viewer.canvas.clientHeight;
	var margin = 50; // px — ekran kenarı toleransı
	var groupById = Object.create(null);
	for (var gi = 0; gi < groups.length; gi++) {
		groupById[groups[gi].id] = groups[gi];
	}

	// Çok yoğun referans veri varken tam tarama fallback pointermove'u kilitleyebilir.
	// KD-tree aday araması her zaman çalışır; bu guard sadece tam taramayı kapatır.
	var _refSnapMeasurementCount = 0;
	for (var mi = 0; mi < measurements.length; mi++) {
		var _m = measurements[mi];
		if (!_m.checked) continue;
		var _g = groupById[_m.groupId];
		if (_g && isRefGroup(_g) && _g.snapEnabled) {
			_refSnapMeasurementCount++;
			if (_refSnapMeasurementCount > SNAP_REF_MEASUREMENT_LIMIT) break;
		}
	}
	var _skipReferenceSnap = _refSnapMeasurementCount > SNAP_REF_MEASUREMENT_LIMIT;
	if (_skipReferenceSnap && !_snapHeavyModeNotified) {
		_snapHeavyModeNotified = true;
		console.info('[CBS] Snap guard aktif: referans tam taraması yoğunluk nedeniyle devre dışı, KD-tree aday araması kullanılacak.', {
			refMeasurements: _refSnapMeasurementCount,
			limit: SNAP_REF_MEASUREMENT_LIMIT
		});
		TelemetryManager.addLog('SNAP_GUARD_ENABLED', { refMeasurements: _refSnapMeasurementCount, limit: SNAP_REF_MEASUREMENT_LIMIT }, false);
	}

	// ─── PASS 1: VERTEX SNAP — Öncelik: Kendi Vektör > Referans > Snap Yok ─────
	var vertexDist = threshold2 + 1;
	var vertexCartesian = null;

	// 1a. KENDİ ölçüm noktaları (referans olmayan — en yüksek öncelik)
	measurements.forEach(function (m) {
		if (!m.checked) return;
		var mGroup = groupById[m.groupId];
		if (isRefGroup(mGroup) || m.isImported) return; // Referans grupları bu geçişte atla
		m.points.forEach(function (p) {
			var winPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p);
			if (!winPos) return;
			if (winPos.x < -margin || winPos.x > viewW + margin || winPos.y < -margin || winPos.y > viewH + margin) return;
			// [P1] 2D kutu filtresi: threshold dışındakiler distance hesabına girmez
			if (Math.abs(winPos.x - mousePos.x) > threshold || Math.abs(winPos.y - mousePos.y) > threshold) return;
			var dx = winPos.x - mousePos.x;
			var dy = winPos.y - mousePos.y;
			var dist2 = dx * dx + dy * dy;
			if (dist2 < vertexDist) { vertexDist = dist2; vertexCartesian = p; }
		});
	});

	// 1b. Aktif çizim noktaları (kendi verisi)
	clickPoints.forEach(function (p) {
		var winPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p);
		if (!winPos) return;
		if (winPos.x < -margin || winPos.x > viewW + margin || winPos.y < -margin || winPos.y > viewH + margin) return;
		// [P1] 2D kutu filtresi
		if (Math.abs(winPos.x - mousePos.x) > threshold || Math.abs(winPos.y - mousePos.y) > threshold) return;
		var dx = winPos.x - mousePos.x;
		var dy = winPos.y - mousePos.y;
		var dist2 = dx * dx + dy * dy;
		if (dist2 < vertexDist) { vertexDist = dist2; vertexCartesian = p; }
	});

	// 1c. REFERANS ölçüm noktaları — önce KD-tree adayları, gerekirse tam tarama fallback
	if (!vertexCartesian && _refSnapMeasurementCount > 0) {
		var _refVertexCandidates = _queryReferenceVertexCandidates(mousePos, threshold, groupById, now);
		for (var rvi = 0; rvi < _refVertexCandidates.length; rvi++) {
			var _rv = _refVertexCandidates[rvi];
			var p = _rv.point;
			if (!p) continue;
			var winPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p);
			if (!winPos) continue;
			if (winPos.x < -margin || winPos.x > viewW + margin || winPos.y < -margin || winPos.y > viewH + margin) continue;
			if (Math.abs(winPos.x - mousePos.x) > threshold || Math.abs(winPos.y - mousePos.y) > threshold) continue;
			var dx = winPos.x - mousePos.x;
			var dy = winPos.y - mousePos.y;
			var dist2 = dx * dx + dy * dy;
			if (dist2 < vertexDist) { vertexDist = dist2; vertexCartesian = p; }
		}

		if (!vertexCartesian && !_skipReferenceSnap) {
			measurements.forEach(function (m) {
				if (!m.checked) return;
				var mGroup = groupById[m.groupId];
				if (!mGroup || !isRefGroup(mGroup) || !mGroup.snapEnabled) return;
				m.points.forEach(function (p) {
					var winPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p);
					if (!winPos) return;
					if (winPos.x < -margin || winPos.x > viewW + margin || winPos.y < -margin || winPos.y > viewH + margin) return;
					if (Math.abs(winPos.x - mousePos.x) > threshold || Math.abs(winPos.y - mousePos.y) > threshold) return;
					var dx = winPos.x - mousePos.x;
					var dy = winPos.y - mousePos.y;
					var dist2 = dx * dx + dy * dy;
					if (dist2 < vertexDist) { vertexDist = dist2; vertexCartesian = p; }
				});
			});
		}
	}

	// [OPT-2] Vertex bulunduysa edge aramayı ATLA — titreşim önlenir
	if (vertexCartesian) {
		snappedCartesian = vertexCartesian;
		snapIndicator.position = snappedCartesian;
		snapIndicator.color = Cesium.Color.fromCssColorString('#ef4444').withAlpha(VEC_STYLE.snap.vertexAlpha);
		snapIndicator.pixelSize = VEC_STYLE.snap.vertexSize;
		snapIndicator.show = true;
		_prevSnapState = 'vertex';
		viewer.scene.requestRender();
		_finishSnapPass();
		return;
	}

	// ─── PASS 2: EDGE SNAP (Kenar — vertex yoksa) ───
	var edgeDist = threshold2 + 1;
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
			// [P1] Edge 2D kutu filtresi: closest point fare kutusunda değilse atla
			if (Math.abs(closest2D.x - mousePos.x) > threshold || Math.abs(closest2D.y - mousePos.y) > threshold) continue;
			var dx = mousePos.x - closest2D.x;
			var dy = mousePos.y - closest2D.y;
			var d2 = dx * dx + dy * dy;
			if (d2 < edgeDist) {
				edgeDist = d2;
				var segDx = w2.x - w1.x;
				var segDy = w2.y - w1.y;
				var segLen2 = segDx * segDx + segDy * segDy;
				var t = segLen2 > 0
					? ((closest2D.x - w1.x) * segDx + (closest2D.y - w1.y) * segDy) / segLen2
					: 0;
				if (t < 0) t = 0;
				if (t > 1) t = 1;
				edgeCartesian = Cesium.Cartesian3.lerp(p1, p2, t, new Cesium.Cartesian3());
			}
		}
	}

	// 2a. KENDİ ölçüm kenarları (önce)
	measurements.forEach(function (m) {
		if (!m.checked) return;
		var mGroup = groupById[m.groupId];
		if (isRefGroup(mGroup) || m.isImported) return; // Referans bu geçişte atla
		if (m.type === 'line' || m.type === 'polygon' || m.type === 'height') {
			checkEdges(m.points, m.type === 'polygon');
		}
	});

	// 2b. Aktif çizim kenarları (kendi verisi)
	if (clickPoints.length > 1) {
		checkEdges(clickPoints, false);
	}

	// 2c. REFERANS kenarları — önce KD-tree adayları, gerekirse tam tarama fallback
	if (!edgeCartesian && _refSnapMeasurementCount > 0) {
		var _refEdgeCandidates = _queryReferenceEdgeCandidates(mousePos, threshold, groupById, now);
		for (var rei = 0; rei < _refEdgeCandidates.length; rei++) {
			var _seg = _refEdgeCandidates[rei];
			var p1 = _seg.p1;
			var p2 = _seg.p2;
			if (!p1 || !p2) continue;

			var w1 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p1);
			var w2 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p2);
			if (!w1 || !w2) continue;
			if ((w1.x < -margin && w2.x < -margin) || (w1.x > viewW + margin && w2.x > viewW + margin)) continue;
			if ((w1.y < -margin && w2.y < -margin) || (w1.y > viewH + margin && w2.y > viewH + margin)) continue;

			var closest2D = getClosestPointOnSegment(mousePos, w1, w2);
			if (Math.abs(closest2D.x - mousePos.x) > threshold || Math.abs(closest2D.y - mousePos.y) > threshold) continue;
			var dx = mousePos.x - closest2D.x;
			var dy = mousePos.y - closest2D.y;
			var d2 = dx * dx + dy * dy;
			if (d2 < edgeDist) {
				edgeDist = d2;
				var segDx = w2.x - w1.x;
				var segDy = w2.y - w1.y;
				var segLen2 = segDx * segDx + segDy * segDy;
				var t = segLen2 > 0
					? ((closest2D.x - w1.x) * segDx + (closest2D.y - w1.y) * segDy) / segLen2
					: 0;
				if (t < 0) t = 0;
				if (t > 1) t = 1;
				edgeCartesian = Cesium.Cartesian3.lerp(p1, p2, t, new Cesium.Cartesian3());
			}
		}
	}

	if (!edgeCartesian && !_skipReferenceSnap && _refSnapMeasurementCount > 0) {
		measurements.forEach(function (m) {
			if (!m.checked) return;
			var mGroup = groupById[m.groupId];
			if (!mGroup || !isRefGroup(mGroup) || !mGroup.snapEnabled) return;
			if (m.type === 'line' || m.type === 'polygon' || m.type === 'height') {
				checkEdges(m.points, m.type === 'polygon');
			}
		});
	}

	if (edgeCartesian) {
		snappedCartesian = edgeCartesian;
		snapIndicator.position = snappedCartesian;
		snapIndicator.color = Cesium.Color.fromCssColorString('#3b82f6').withAlpha(VEC_STYLE.snap.edgeAlpha);
		snapIndicator.pixelSize = VEC_STYLE.snap.edgeSize;
		snapIndicator.show = true;
		_prevSnapState = 'edge';
		viewer.scene.requestRender();
	} else {
		snappedCartesian = null;
		if (snapIndicator && snapIndicator.show) {
			snapIndicator.show = false;
		}
		if (_prevSnapState !== null) { _prevSnapState = null; viewer.scene.requestRender(); }
	}

	// ─── RUBBER-BAND: Snap sonrası snap pozisyonuyla hassaslaştır ────────
	// Ana rubber-band güncellemesi throttle öncesinde çalışıyor.
	// Snap bulunduysa rubber-band ucunu snap noktasına kilitle (daha hassas).
	if (_rbActiveEarly && Cesium.defined(snappedCartesian)) {
		_rubberEnd = snappedCartesian;
		viewer.scene.requestRender();
	}

	_finishSnapPass();
}, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

var CLICK_SNAP_THRESHOLD_PX = _isMob ? 18 : 15;

function _resolvePreciseClickSnap(clickPos, thresholdPx) {
	if (!clickPos) return null;

	var threshold = Math.max(4, thresholdPx || 15);
	var threshold2 = threshold * threshold;
	var viewW = viewer.canvas.clientWidth;
	var viewH = viewer.canvas.clientHeight;
	var margin = 50;
	var groupById = Object.create(null);
	for (var gi = 0; gi < groups.length; gi++) {
		groupById[groups[gi].id] = groups[gi];
	}

	var vertexDist = threshold2 + 1;
	var vertexCartesian = null;

	function _tryVertexCandidate(p) {
		if (!p) return;
		var winPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p);
		if (!winPos) return;
		if (winPos.x < -margin || winPos.x > viewW + margin || winPos.y < -margin || winPos.y > viewH + margin) return;
		if (Math.abs(winPos.x - clickPos.x) > threshold || Math.abs(winPos.y - clickPos.y) > threshold) return;
		var dx = winPos.x - clickPos.x;
		var dy = winPos.y - clickPos.y;
		var dist2 = dx * dx + dy * dy;
		if (dist2 < vertexDist) {
			vertexDist = dist2;
			vertexCartesian = p;
		}
	}

	// Hali hazirda gorunen snap varsa once onu dogrula.
	if (snappedCartesian) {
		_tryVertexCandidate(snappedCartesian);
		if (vertexCartesian) return vertexCartesian;
	}

	measurements.forEach(function (m) {
		if (!m.checked || !m.points || m.points.length === 0) return;
		var mGroup = groupById[m.groupId];
		if (isRefGroup(mGroup) || m.isImported) return;
		m.points.forEach(_tryVertexCandidate);
	});

	clickPoints.forEach(_tryVertexCandidate);

	var now = performance.now();
	var _refVertexCandidates = _queryReferenceVertexCandidates(clickPos, threshold, groupById, now);
	for (var rvi = 0; rvi < _refVertexCandidates.length; rvi++) {
		var _rv = _refVertexCandidates[rvi];
		_tryVertexCandidate(_rv && _rv.point);
	}

	if (!vertexCartesian) {
		measurements.forEach(function (m) {
			if (!m.checked || !m.points || m.points.length === 0) return;
			var mGroup = groupById[m.groupId];
			if (!mGroup || !isRefGroup(mGroup) || !mGroup.snapEnabled) return;
			m.points.forEach(_tryVertexCandidate);
		});
	}

	if (vertexCartesian) return vertexCartesian;

	var edgeDist = threshold2 + 1;
	var edgeCartesian = null;

	function _tryEdgeCandidate(p1, p2) {
		if (!p1 || !p2) return;
		var w1 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p1);
		var w2 = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, p2);
		if (!w1 || !w2) return;
		if ((w1.x < -margin && w2.x < -margin) || (w1.x > viewW + margin && w2.x > viewW + margin)) return;
		if ((w1.y < -margin && w2.y < -margin) || (w1.y > viewH + margin && w2.y > viewH + margin)) return;

		var closest2D = getClosestPointOnSegment(clickPos, w1, w2);
		if (Math.abs(closest2D.x - clickPos.x) > threshold || Math.abs(closest2D.y - clickPos.y) > threshold) return;
		var dx = clickPos.x - closest2D.x;
		var dy = clickPos.y - closest2D.y;
		var d2 = dx * dx + dy * dy;
		if (d2 < edgeDist) {
			edgeDist = d2;
			var segDx = w2.x - w1.x;
			var segDy = w2.y - w1.y;
			var segLen2 = segDx * segDx + segDy * segDy;
			var t = segLen2 > 0
				? ((closest2D.x - w1.x) * segDx + (closest2D.y - w1.y) * segDy) / segLen2
				: 0;
			if (t < 0) t = 0;
			if (t > 1) t = 1;
			edgeCartesian = Cesium.Cartesian3.lerp(p1, p2, t, new Cesium.Cartesian3());
		}
	}

	function _checkEdges(pts, isClosed) {
		if (!pts || pts.length < 2) return;
		var len = isClosed ? pts.length : pts.length - 1;
		for (var i = 0; i < len; i++) {
			_tryEdgeCandidate(pts[i], pts[(i + 1) % pts.length]);
		}
	}

	measurements.forEach(function (m) {
		if (!m.checked || !m.points || m.points.length < 2) return;
		var mGroup = groupById[m.groupId];
		if (isRefGroup(mGroup) || m.isImported) return;
		if (m.type === 'line' || m.type === 'polygon' || m.type === 'height') {
			_checkEdges(m.points, m.type === 'polygon');
		}
	});

	if (clickPoints.length > 1) {
		_checkEdges(clickPoints, false);
	}

	var _refEdgeCandidates = _queryReferenceEdgeCandidates(clickPos, threshold, groupById, now);
	for (var rei = 0; rei < _refEdgeCandidates.length; rei++) {
		var _seg = _refEdgeCandidates[rei];
		_tryEdgeCandidate(_seg && _seg.p1, _seg && _seg.p2);
	}

	if (!edgeCartesian) {
		measurements.forEach(function (m) {
			if (!m.checked || !m.points || m.points.length < 2) return;
			var mGroup = groupById[m.groupId];
			if (!mGroup || !isRefGroup(mGroup) || !mGroup.snapEnabled) return;
			if (m.type === 'line' || m.type === 'polygon' || m.type === 'height') {
				_checkEdges(m.points, m.type === 'polygon');
			}
		});
	}

	return edgeCartesian;
}

// ─── 7. SOL TIK: ÇİZİM VEYA SEÇİM ───────────────────────────────
handler.setInputAction(function (click) {
	// EditManager sürükleme sırasında LEFT_CLICK'i engelle
	if (typeof EditManager !== 'undefined' && EditManager.isDragging) return;
	if (typeof window !== 'undefined' && window.__infoPickModeActive) return;

	// Eğer aktif bir araç yoksa, haritadaki objeleri (ölçümleri) seçme işlemi yap
	if (!activeTool) {
		var _pickCheck = viewer.scene.pick(click.position);

		// ── Edit grip tıklanmışsa seçim mantığını atla ──
		// Primitive API grip: pickedObject.id._editGrip === true
		// Entity API grip (eski): pickedObject.id.properties._editGrip
		if (Cesium.defined(_pickCheck)) {
			var _gid = _pickCheck.id;
			if (_gid && (_gid._editGrip ||
				(_gid.properties && _gid.properties._editGrip && _gid.properties._editGrip.getValue()))) {
				return; // EditManager LEFT_DOWN handler'ı bununla ilgilenecek
			}
		}

		// ── Ölçüm seçimi: Entity API (id) + Primitive API (primitive) ──
		// addPointLabel → pickedObject.id = PointPrimitiveCollection (m.entities'te)
		// createStablePolyline/Polygon → pickedObject.primitive = Primitive (m.entities'te)
		if (Cesium.defined(_pickCheck)) {
			var foundMeasurement = findMeasurementFromPickedObject(_pickCheck);
			if (foundMeasurement) {
				highlightMeasurement(foundMeasurement.id);
				return;
			}
		}

		// Boş yere tıklandıysa seçimi kaldır
		if (activeHighlightId !== null) {
			highlightMeasurement(activeHighlightId);
		}
		return;
	}

	// Aktif grubun Cesium rengini al
	var _grp = groups.find(function (g) { return g.id === activeGroupId; });
	var _gc = Cesium.Color.fromCssColorString(_grp && _grp.color ? _grp.color : '#14B8A6');

	var cartesian;
	var _preciseSnap = _resolvePreciseClickSnap(click.position, CLICK_SNAP_THRESHOLD_PX);
	if (Cesium.defined(_preciseSnap)) {
		// Click aninda snap karari yeniden dogrulanir.
		cartesian = Cesium.Cartesian3.clone(_preciseSnap);
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
			var groupSeq = measurements.filter(function (x) { return x.groupId === activeGroupId; }).length + 1;
			measurements.push({
				id: measureCount,
				groupId: activeGroupId,
				name: '' + groupSeq,
				type: 'height',
				resultText: resultText,
				points: [clickPoints[0], pMid, clickPoints[1]],
				entities: tempEntities.slice(),
				checked: true,
				properties: {}
			});
			// X-Ray aktifse yeni ölçüme uygula
			if (_xrayActive) {
				measurements[measurements.length - 1].entities.forEach(function (ent) {
					applyXRayToPrimitive(ent, true);
				});
			}
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
		var groupSeq = measurements.filter(function (x) { return x.groupId === activeGroupId; }).length + 1;
		measurements.push({
			id: measureCount,
			groupId: activeGroupId,
			name: '' + groupSeq,
			type: 'coord',
			resultText: resultText,
			points: [cartesian],
			entities: tempEntities.slice(),
			checked: true,
			properties: {}
		});
		// SONRAKİ NOKTA İÇİN SIFIRLAMALAR
		// X-Ray aktifse yeni ölçüme uygula
		if (_xrayActive) {
			measurements[measurements.length - 1].entities.forEach(function (ent) {
				applyXRayToPrimitive(ent, true);
			});
		}
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
		var groupSeq = measurements.filter(function (x) { return x.groupId === activeGroupId; }).length + 1;
		measurements.push({
			id: measureCount,
			groupId: activeGroupId,
			name: '' + groupSeq,
			type: 'line',
			resultText: resultText,
			points: clickPoints.slice(),
			entities: tempEntities.slice(),
			checked: true,
			properties: {}
		});
		// X-Ray aktifse yeni ölçüme uygula
		if (_xrayActive) {
			measurements[measurements.length - 1].entities.forEach(function (ent) {
				applyXRayToPrimitive(ent, true);
			});
		}
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
		var groupSeq = measurements.filter(function (x) { return x.groupId === activeGroupId; }).length + 1;
		measurements.push({
			id: measureCount,
			groupId: activeGroupId,
			name: '' + groupSeq,
			type: 'polygon',
			resultText: resultText,
			points: clickPoints.slice(),
			entities: tempEntities.slice(),
			checked: true,
			properties: {}
		});
		// X-Ray aktifse yeni ölçüme uygula
		if (_xrayActive) {
			measurements[measurements.length - 1].entities.forEach(function (ent) {
				applyXRayToPrimitive(ent, true);
			});
		}
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

// ─── 9. ACİL ÇIKIŞ VE KLAVYE KISAYOLLARI (ESCAPE / UNDO / INFO) ─────────────────

// ── toggleInfoMode: Bilgi modunu aç/kapat ──
// Hem "i" tuşu hem de toolbar butonu tarafından çağrılır
function toggleInfoMode() {
	// Çizim aracı aktifken info moduna geçme
	if (activeTool) return;
	
	isInfoModeActive = !isInfoModeActive;
	var legacyInfoToast = document.getElementById('infoModeToast');
	if (legacyInfoToast) legacyInfoToast.remove();
	var btnInfoMode = document.getElementById('btnInfoMode');
	
	if (isInfoModeActive) {
		// Info modunu aç — cursor'ı değiştir
		viewer.scene.canvas.style.cursor = 'help';
		
		// Button'u aktif yap
		if (btnInfoMode) {
			btnInfoMode.classList.add('active');
			btnInfoMode.style.backgroundColor = 'rgba(6, 182, 212, 0.2)';
			btnInfoMode.style.color = '#06b6d4';
		}
	} else {
		// Info modunu kapat
		viewer.scene.canvas.style.cursor = '';
		
		// Button'u pasif yap
		if (btnInfoMode) {
			btnInfoMode.classList.remove('active');
			btnInfoMode.style.backgroundColor = '';
			btnInfoMode.style.color = '';
		}
		
		closeInfoPanel();
	}
}

document.addEventListener('keydown', function (e) {
	// Input/Textarea içindeyken klavye kısayollarını atla
	var tag = (e.target.tagName || '').toLowerCase();
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

	// ── INFO MODU TOGGLE (i tuşu) ──
	if (e.key === 'i' || e.key === 'I') {
		toggleInfoMode();
		return;
	}

	// PHASE 3: Defensive Escapes
	if (e.key === 'Escape') {
		if (typeof window !== 'undefined' && window.__infoPickModeActive && typeof window.__exitInfoPickMode === 'function') {
			window.__exitInfoPickMode();
			return;
		}

		// Info modu açıkken Escape: info modunu kapat
		if (isInfoModeActive) {
			toggleInfoMode();
			return;
		}

		if (isInfoPanelVisible()) {
			closeInfoPanel();
			return;
		}
		if (activeTool) {
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
	if (selected.length === 0) { showResultErrorMessage('Seçili kapsamda dışa aktarılacak ölçüm bulunamadı!'); return; }

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
	if (selected.length === 0) { showResultErrorMessage('Seçili kapsamda dışa aktarılacak ölçüm bulunamadı!'); return; }

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
	if (selected.length === 0) { showResultErrorMessage('Seçili kapsamda dışa aktarılacak ölçüm bulunamadı!'); return; }

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
	if (existing) {
		// Aynı dosya tekrar import ediliyor — üzerine yaz
		if (!confirm('"' + fileName + '" zaten içe aktarılmış.\nÜzerine yazmak ister misiniz?')) {
			return null; // İptal
		}
		// Eski grubu temizle
		deleteGroup(existing.id);
	}
	groupCount++;
	var refGroup = { id: groupCount, name: groupName, isOpen: true, checked: true, isReferans: true, _importZOffset: 0, _manualZOffset: 0, _zOffset: 0 };
	groups.push(refGroup);
	return refGroup.id;
}

function _toFiniteNumber(value, fallback) {
	var n = typeof value === 'number' ? value : parseFloat(value);
	return isFinite(n) ? n : fallback;
}

function ensureGroupZState(group) {
	if (!group) return { importZ: 0, manualZ: 0, totalZ: 0 };

	var importZ = _toFiniteNumber(group._importZOffset, 0);
	var manualZ;

	if (isFinite(group._manualZOffset)) {
		manualZ = _toFiniteNumber(group._manualZOffset, 0);
	} else if (isFinite(group._zOffset)) {
		manualZ = _toFiniteNumber(group._zOffset, 0);
	} else {
		manualZ = 0;
	}

	group._importZOffset = importZ;
	group._manualZOffset = manualZ;
	group._zOffset = importZ + manualZ;

	return {
		importZ: group._importZOffset,
		manualZ: group._manualZOffset,
		totalZ: group._zOffset
	};
}

function applyImportZOffsetToGroup(group, importZOffset) {
	if (!group) return;
	var state = ensureGroupZState(group);
	group._importZOffset = _toFiniteNumber(importZOffset, 0);
	group._manualZOffset = state.manualZ;
	group._zOffset = group._importZOffset + group._manualZOffset;
}

// Bir gruptaki tüm ölçümlerin Z (yükseklik) değerini delta kadar kaydır
function adjustGroupZ(groupId, delta) {
	var group = groups.find(function (g) { return g.id === groupId; });
	var hasBatched = false;

	measurements.forEach(function (m) {
		if (m.groupId !== groupId) return;

		// Non-batched: eski entity'leri kaldır
		if (!m.isBatched) {
			m.entities.forEach(function (ent) { safeRemoveItem(ent); });
			m.entities = [];
		} else {
			hasBatched = true;
		}

		// Her noktanın yüksekliğine delta ekle
		m.points = m.points.map(function (p) {
			var carto = Cesium.Cartographic.fromCartesian(p);
			carto.height += delta;
			return Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height);
		});

		// Non-batched: yeniden çiz
		if (!m.isBatched) {
			if (m.type === 'coord') restoreCoord(m);
			else if (m.type === 'line') restoreLine(m);
			else if (m.type === 'polygon') restorePolygon(m);
			else if (m.type === 'height') restoreHeight(m);

			// X-Ray aktifse yeniden oluşturulan entity'lere uygula
			if (_xrayActive) {
				m.entities.forEach(function (ent) {
					applyXRayToPrimitive(ent, true);
				});
			}
		}
	});

	// Batch primitifleri yeniden oluştur (güncel point'lerle)
	if (hasBatched && group) {
		rebuildBatchPrimitives(group);
	}

	saveToStorage();
	viewer.scene.requestRender();
}
// ─── IMPORT LOADING OVERLAY YÖNETİMİ ───────────────────────────
var _importCurrentFileName = '';
function showImportLoading(fileName) {
	var overlay = document.getElementById('importLoadingOverlay');
	if (fileName) _importCurrentFileName = fileName;
	document.getElementById('importLoadingFileName').textContent = '📂 ' + (_importCurrentFileName || 'Dosya');
	document.getElementById('importLoadingStatus').textContent = 'Dosya okunuyor…';
	overlay.classList.remove('hidden');
}

function updateImportLoading(message) {
	var el = document.getElementById('importLoadingStatus');
	if (el) el.textContent = message;
}

function hideImportLoading() {
	var overlay = document.getElementById('importLoadingOverlay');
	if (overlay) overlay.classList.add('hidden');
}

function importError(message) {
	hideImportLoading();
	showResultErrorMessage('İçe aktarma hatası: ' + message);
}

// ─── FORMAT BİLGİ MESAJLARI (Z Dialog İçin) ─────────────────────
var importFormatMessages = {
	csv: '💡 <b>CSV formatı:</b> NoktaAdi, X, Y, Z (virgül veya noktalı virgül ayraçlı). İlk satır başlık olabilir.',
	geojson: '💡 <b>GeoJSON:</b> Standart FeatureCollection. Point, LineString ve Polygon desteklenir. Koordinatlar [lon, lat, z] sırasında olmalıdır.',
	dxf: '💡 <b>DXF:</b> POINT, LINE, POLYLINE, CIRCLE, ARC, ELLIPSE, 3DFACE entity tipleri desteklenir. AutoCAD uyumlu.',
	kml: '💡 <b>KML/KMZ:</b> Google Earth uyumlu Placemark verileri. KMZ arşivi otomatik çözülür. Z değerleri WGS84 absolute altitude olarak okunur.'
};

// Z-Offset diyaloğunu göster ve callback ile sonucu döndür
function showImportZDialog(callback, formatType) {
	var dialog = document.getElementById('importZDialog');
	var avgZ = getModelAverageZ();
	document.getElementById('importZModelAvg').innerText = avgZ.toFixed(1) + ' m';
	document.getElementById('importZOffsetInput').value = '0';

	// Format bilgisini göster/gizle
	var formatInfoEl = document.getElementById('importFormatInfo');
	if (formatInfoEl) {
		if (formatType && importFormatMessages[formatType]) {
			formatInfoEl.innerHTML = importFormatMessages[formatType];
			formatInfoEl.style.display = '';
		} else {
			formatInfoEl.style.display = 'none';
		}
	}

	dialog.classList.remove('hidden');
	// Loading overlay'ı gizle — Z Dialog kullanıcı etkileşimi gerektirir
	hideImportLoading();

	function cleanup() {
		dialog.classList.add('hidden');
		document.getElementById('importZApply').removeEventListener('click', onApply);
		document.getElementById('importZSkip').removeEventListener('click', onSkip);
		document.getElementById('importZCancel').removeEventListener('click', onCancel);
		document.getElementById('importZBackdrop').removeEventListener('click', onCancel);
		document.removeEventListener('keydown', onKeyDown);
	}

	function onApply() {
		var offset = parseFloat(document.getElementById('importZOffsetInput').value) || 0;
		cleanup();
		// Loading'i yeniden aç — veriler oluşturulacak
		showImportLoading();
		updateImportLoading('Veriler oluşturuluyor…');
		// setTimeout ile browser'a repaint fırsatı ver — yoksa loading görünmez
		setTimeout(function () { callback(offset); }, 50);
	}

	function onSkip() {
		cleanup();
		// Loading'i yeniden aç — veriler oluşturulacak
		showImportLoading();
		updateImportLoading('Veriler oluşturuluyor…');
		// setTimeout ile browser'a repaint fırsatı ver — yoksa loading görünmez
		setTimeout(function () { callback(0); }, 50);
	}

	function onCancel() {
		cleanup();
		// null = iptal edildi — import gerçekleşmez
		callback(null);
	}

	function onKeyDown(e) {
		if (e.key === 'Escape') { onCancel(); }
		else if (e.key === 'Enter') { onApply(); }
	}

	document.getElementById('importZApply').addEventListener('click', onApply);
	document.getElementById('importZSkip').addEventListener('click', onSkip);
	document.getElementById('importZCancel').addEventListener('click', onCancel);
	document.getElementById('importZBackdrop').addEventListener('click', onCancel);
	document.addEventListener('keydown', onKeyDown);
}

// İçe Aktarma: Format kılavuz mesajları
var importGuides = {
	btnImportCSV: 'CSV formatı: <b>NoktaAdi, X, Y, Z</b> (virgül veya noktalı virgül ayraçlı). İlk satır başlık olabilir.',
	btnImportGeoJSON: 'GeoJSON formatı: Standart <b>FeatureCollection</b>. Point, LineString ve Polygon desteklenir.',
	btnImportDXF: 'DXF formatı: <b>POINT, LINE, POLYLINE, CIRCLE, ARC, ELLIPSE, 3DFACE</b> entity tipleri desteklenir.',
	btnImportKML: 'KML/KMZ formatı: Google Earth uyumlu <b>Placemark</b> verileri. KMZ ZIP arşivi otomatik açılır.'
};

// Label'a tıklandığında CRS kontrolü yap, geçerliyse dosya seçiciyi aç
var _importing = false; // input.click() → label döngüsünü önlemek için bayrak
['btnImportCSV', 'btnImportGeoJSON', 'btnImportDXF', 'btnImportKML'].forEach(function (id) {
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
	showImportLoading(file.name);
	var crs = document.getElementById('exportCrs').value;
	var reader = new FileReader();
	reader.onload = function (ev) {
		var resultBar = document.querySelector('#resultDisplay > div');
		try {
			var lines = ev.target.result.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
			if (lines.length === 0) { hideImportLoading(); return; }

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

			if (parsedRows.length === 0) { importError('CSV dosyasında geçerli nokta bulunamadı.'); return; }

			updateImportLoading('Gerçek kot ayarı bekleniyor…');
			showImportZDialog(function (zOffset) {
				if (zOffset === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				updateImportLoading('Veriler oluşturuluyor…');
				var refGroupId = getOrCreateReferansGroup(file.name);
				if (refGroupId === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				var refGroup = groups.find(function (g) { return g.id === refGroupId; });
				applyImportZOffsetToGroup(refGroup, zOffset);
				var effectiveGroupZ = refGroup ? refGroup._zOffset : zOffset;
				parsedRows.forEach(function (row, i) {
					var pos = Cesium.Cartesian3.fromDegrees(row.lon, row.lat, row.z + effectiveGroupZ);
					var m = {
						id: ++measureCount,
						groupId: refGroupId,
						name: row.name,
						type: 'coord',
						resultText: row.lat.toFixed(6) + ', ' + row.lon.toFixed(6),
						checked: true,
						isImported: true,
						points: [pos],
						entities: [],
						properties: {}
					};
					measurements.push(m);
					restoreCoord(m);
				});
				renderList();
				viewer.scene.requestRender();
				// ─── Import verisini IndexedDB'ye kaydet ───
				var csvFeats = parsedRows.map(function (row) {
					return { name: row.name, type: 'coord', resultText: row.lat.toFixed(6) + ', ' + row.lon.toFixed(6), coords: [{ lat: row.lat, lon: row.lon, z: row.z }] };
				});
				CbsStorage.saveImport(refGroupId, file.name, refGroup && refGroup.color || '#14B8A6', csvFeats, zOffset)
					.catch(function (e) { console.warn('CSV import kayıt hatası:', e); });

				hideImportLoading();
				document.querySelector('#resultDisplay > div').innerHTML =
					'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedRows.length + ' nokta "' + file.name + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Gerçek Z +' + zOffset + 'm)' : '') + '</span>';
			}, 'csv');
		} catch (csvErr) {
			console.error('CSV içe aktırma hatası:', csvErr);
			importError('CSV dosyası okunamadı: ' + csvErr.message);
		}
	};
	reader.onerror = function () { importError('CSV dosyası okunamadı.'); };
	reader.readAsText(file);
	e.target.value = '';
});

// GeoJSON İçe Aktarma — Web Worker ile Off-Thread Parsing
document.getElementById('btnImportGeoJSON').addEventListener('change', function (e) {
	var file = e.target.files[0]; if (!file) return;
	showImportLoading(file.name);
	var userCrs = document.getElementById('exportCrs').value;
	var resultBar = document.querySelector('#resultDisplay > div');

	var reader = new FileReader();
	reader.onload = function (ev) {
		var fileText = ev.target.result;
		var fileName = file.name;

		// Entity oluşturma — İKİ FAZLI BATCH (GPU Draw Call Azaltma)
		// Faz 1: Measurement objelerini oluştur (entity yok)
		// Faz 2: Tüm geometrileri 2 Primitive + 1 LabelCollection'a topla
		function startBatchRendering(parsedFeats, crsInfo) {
			if (parsedFeats.length === 0) { importError('GeoJSON dosyasında geçerli öğe bulunamadı.'); return; }

			updateImportLoading('Gerçek kot ayarı bekleniyor…');
			showImportZDialog(function (zOffset) {
				if (zOffset === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				updateImportLoading('Geometriler hazırlanıyor…');
				var refGroupId = getOrCreateReferansGroup(fileName);
				if (refGroupId === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				var refGroup = groups.find(function (g) { return g.id === refGroupId; });
				applyImportZOffsetToGroup(refGroup, zOffset);
				var effectiveGroupZ = refGroup ? refGroup._zOffset : zOffset;
				var hexColor = refGroup && refGroup.color ? refGroup.color : '#14B8A6';
				var cesColor = Cesium.Color.fromCssColorString(hexColor);
				var total = parsedFeats.length;
				var BATCH_SIZE = 200; // Faz 1 daha hızlı — entity oluşturma yok

				// Geometri akümülatörleri
				var polyFillInstances = [];
				var polyLineInstances = [];
				var coordPoints = [];
				var labelEntries = [];
				var sharedPivot = null;

				function processBatch(startIdx) {
					var frameStart = performance.now();
					var end = Math.min(startIdx + BATCH_SIZE, total);
					for (var i = startIdx; i < end; i++) {
						var feat = parsedFeats[i];
						var points = feat.coords.map(function (c) {
							return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + effectiveGroupZ);
						});

						// İlk noktayı pivot olarak kullan (anti-jitter)
						if (!sharedPivot && points.length > 0) sharedPivot = points[0];

						var m = {
							id: ++measureCount,
							groupId: refGroupId,
							name: feat.name,
							type: feat.type,
							checked: true,
							isImported: true,
							isBatched: true, // Batch primitif — bireysel entity yok
							points: points,
							entities: [],
							properties: feat.props || {}
						};
						measurements.push(m);

						if (feat.type === 'polygon' && points.length >= 3) {
							// Polygon dolgu instance'ı
							try {
								polyFillInstances.push(new Cesium.GeometryInstance({
									id: m.id,
									geometry: new Cesium.CoplanarPolygonGeometry({
										polygonHierarchy: new Cesium.PolygonHierarchy(points),
										vertexFormat: Cesium.MaterialAppearance.MaterialSupport.BASIC.vertexFormat
									})
								}));
							} catch (e) { /* geçersiz geometri */ }

							// Polygon kenar instance'ı (kapalı polyline)
							try {
								var closedPts = points.concat([points[0]]);
								polyLineInstances.push(new Cesium.GeometryInstance({
									id: m.id,
									geometry: new Cesium.PolylineGeometry({
										positions: closedPts,
										width: VEC_STYLE.polygon.edgeWidth || 2,
										arcType: Cesium.ArcType.NONE,
										vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
									})
								}));
							} catch (e) { /* geçersiz geometri */ }

							// Etiket verisi
							var labelText = m.resultText || m.name || '';
							var cx = centroid(points);
							labelEntries.push({ position: cx, text: labelText, measurementId: m.id });
						} else if (feat.type === 'line' && points.length >= 2) {
							try {
								polyLineInstances.push(new Cesium.GeometryInstance({
									id: m.id,
									geometry: new Cesium.PolylineGeometry({
										positions: points,
										width: VEC_STYLE.line.width || 3,
										arcType: Cesium.ArcType.NONE,
										vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
									})
								}));
							} catch (e) { /* geçersiz geometri */ }
							if (!_isMob) {
								labelEntries.push({ position: midpointAlongLine(points), text: m.resultText || m.name || '', measurementId: m.id });
							}
						} else if (feat.type === 'coord') {
							// Noktalar bireysel kalır (az sayıda)
							restoreCoord(m);
						}
					}

					var elapsed = performance.now() - frameStart;
					if (elapsed < 8) BATCH_SIZE = Math.min(BATCH_SIZE + 50, 500);
					else if (elapsed > 14) BATCH_SIZE = Math.max(BATCH_SIZE - 50, 50);

					if (end < total) {
						if (total > 200) {
							var pct = Math.round((end / total) * 100);
							resultBar.innerHTML = '<span class="text-cyan-400 font-bold text-[11px]">⏳ ' + end + '/' + total + ' (%' + pct + ') geometri hazırlanıyor…</span>';
							updateImportLoading(end + '/' + total + ' (%' + pct + ') geometri hazırlanıyor…');
						}
						requestAnimationFrame(function () { processBatch(end); });
					} else {
						// ═══ FAZ 2: BULK PRIMITIVE OLUŞTURMA ═══
						resultBar.innerHTML = '<span class="text-cyan-400 font-bold text-[11px]">⏳ GPU primitifleri oluşturuluyor…</span>';

						requestAnimationFrame(function () {
							var batchPrimitives = [];

							// 1. Tek Polygon Fill Primitive
							if (polyFillInstances.length > 0) {
								try {
									var fillPrim = viewer.scene.primitives.add(new Cesium.Primitive({
										geometryInstances: polyFillInstances,
										appearance: new Cesium.MaterialAppearance({
											material: Cesium.Material.fromType('Color', {
												color: cesColor.withAlpha(VEC_STYLE.polygon.fillAlpha || 0.25)
											}),
											faceForward: true
										}),
										asynchronous: true, // GPU'da async derle
											allowPicking: true
									}));
									fillPrim._isImportBatch = true;
									fillPrim._isFillBatch = true;
									batchPrimitives.push(fillPrim);
								} catch (e) { console.warn('Batch fill hatası:', e); }
							}

							// 2. Tek Polyline Primitive (kenarlar + çizgiler)
							if (polyLineInstances.length > 0) {
								try {
									var linePrim = viewer.scene.primitives.add(new Cesium.Primitive({
										geometryInstances: polyLineInstances,
										appearance: new Cesium.PolylineMaterialAppearance({
											material: Cesium.Material.fromType('Color', {
												color: cesColor
											}),
											translucent: false
										}),
										asynchronous: true,
											allowPicking: true
									}));
									linePrim._isImportBatch = true;
									linePrim._isPolylineBatch = true;
									batchPrimitives.push(linePrim);
								} catch (e) { console.warn('Batch line hatası:', e); }
							}

							// 3. Tek LabelCollection (tüm etiketler)
							if (labelEntries.length > 0) {
								var labelCol = viewer.scene.primitives.add(new Cesium.LabelCollection());
								labelEntries.forEach(function (le) {
									var lifted = liftPosition(le.position);
									labelCol.add({
										id: le.measurementId,
										position: lifted,
										text: le.text,
										font: VEC_STYLE.label.font,
										fillColor: cesColor,
										outlineColor: VEC_STYLE.label.outlineColor,
										outlineWidth: VEC_STYLE.label.outlineWidth,
										style: Cesium.LabelStyle.FILL_AND_OUTLINE,
										verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
										pixelOffset: new Cesium.Cartesian2(0, VEC_STYLE.label.offsetY),
										distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0.0, 150.0),
										showBackground: true,
										backgroundColor: new Cesium.Color(0, 0, 0, 0.6)
									});
								});
								labelCol._isImportBatch = true;
								batchPrimitives.push(labelCol);
							}

							// Batch primitifleri gruba kaydet (toggle + silme için)
							if (refGroup) {
								refGroup._batchPrimitives = batchPrimitives;
							}

							renderList();
							viewer.scene.requestRender();

							// ─── Import verisini IndexedDB'ye kaydet (kalıcılık) ───
							CbsStorage.saveImport(refGroupId, fileName, hexColor, parsedFeats, zOffset)
								.then(function () { console.info('CbsStorage: Import kaydedildi (' + total + ' öğe, grup ' + refGroupId + ')'); })
								.catch(function (e) { console.warn('Import kayıt hatası:', e); });

							hideImportLoading();
							resultBar.innerHTML =
								'<span class="text-green-400 font-bold text-[11px]">✓ ' + total + ' öğe "' + fileName + '" grubuna aktarıldı.' + crsInfo + (zOffset !== 0 ? ' (Gerçek Z +' + zOffset + 'm)' : '') + ' [' + (polyFillInstances.length + polyLineInstances.length) + ' geometri → 3 draw call]</span>';
						});
					}
				}
				processBatch(0);
			}, 'geojson');
		}

		// Web Worker ile off-thread parsing dene
		try {
			var worker = new Worker('import-worker.js');
			resultBar.innerHTML = '<span class="text-cyan-400 font-bold text-[11px]">⏳ Dosya arka planda işleniyor…</span>';

			worker.onmessage = function (msg) {
				var d = msg.data;
				if (d.error) {
					if (worker) {
						try { worker.terminate(); } catch (terminateErr) { }
						worker = null;
					}
					importError(d.error);
					return;
				}
				if (d.progress) {
					resultBar.innerHTML = '<span class="text-cyan-400 font-bold text-[11px]">⏳ ' + d.progress + ' öğe parse edildi…</span>';
					updateImportLoading(d.progress + ' öğe parse edildi…');
					return;
				}
				if (d.features) {
					if (worker) {
						worker.terminate();
						worker = null;
					}
					startBatchRendering(d.features, d.crsInfo || '');
				}
			};

			worker.onerror = function (err) {
				console.warn('Worker başarısız, inline fallback:', err.message);
				if (worker) {
					try { worker.terminate(); } catch (terminateErr) { }
					worker = null;
				}
				inlineParse();
			};

			worker.postMessage({ text: fileText, userCrs: userCrs });
		} catch (workerErr) {
			console.warn('Worker oluşturulamadı, inline fallback:', workerErr.message);
			inlineParse();
		}

		// Fallback: Worker çalışmazsa main thread'de parse et
		function inlineParse() {
			try {
				var data = JSON.parse(fileText);
			} catch (err) {
				importError('Geçersiz GeoJSON dosyası: ' + err.message);
				return;
			}
			var fileCrs = null;
			if (data.crs && data.crs.properties && data.crs.properties.name) {
				var crsName = data.crs.properties.name.toString();
				if (crsName.indexOf('5254') !== -1 || crsName.indexOf('TM30') !== -1) fileCrs = '5254';
				else if (crsName.indexOf('4326') !== -1 || crsName.indexOf('WGS') !== -1) fileCrs = '4326';
				else if (crsName.indexOf('3857') !== -1) fileCrs = '4326';
			}
			var effectiveCrs = fileCrs || userCrs;
			var crsInfo = fileCrs ? ' (CRS otomatik algılandı: EPSG:' + fileCrs + ')' : '';
			if (effectiveCrs === '5254' && typeof proj4 === 'undefined') {
				importError('EPSG:5254 dönüşümü için proj4 yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.');
				return;
			}
			var feats = data.features || (data.type === 'Feature' ? [data] : []);
			var parsedFeats = [];
			var globalIdx = measurements.length;

			function convertCoord(c) {
				var lon, lat, z = c[2] || 0;
				if (effectiveCrs === '5254') { var wgs = tm30ToWgs84(c[0], c[1]); lat = wgs[0]; lon = wgs[1]; }
				else { lon = c[0]; lat = c[1]; }
				return { lon: lon, lat: lat, z: z };
			}
			function removeClosingPoint(converted) {
				if (converted.length > 1) {
					var f2 = converted[0], l2 = converted[converted.length - 1];
					if (Math.abs(f2.lon - l2.lon) < 0.00001 && Math.abs(f2.lat - l2.lat) < 0.00001) converted.pop();
				}
				return converted;
			}
			function smartName(props, geomType, idx) {
				if (props.Name || props.name || props.NAME) return props.Name || props.name || props.NAME;
				if (props.adano && props.parselno) return props.adano + '/' + props.parselno;
				if (props.adano) return 'Ada ' + props.adano;
				if (props.fid !== undefined && props.fid !== null) return 'FID ' + props.fid;
				if (props.tapukimlikno) return 'Tapu ' + props.tapukimlikno;
				if (props.id !== undefined && props.id !== null) return geomType + ' ' + props.id;
				return geomType + ' ' + idx;
			}
			function processGeometry(geom, props) {
				var type = geom.type, coords = geom.coordinates;
				if (type === 'Point') { parsedFeats.push({ name: smartName(props, 'Nokta', ++globalIdx), type: 'coord', coords: [convertCoord(coords)], props: props }); }
				else if (type === 'LineString') { var c = coords.map(convertCoord); if (c.length > 0) parsedFeats.push({ name: smartName(props, 'Çizgi', ++globalIdx), type: 'line', coords: c, props: props }); }
				else if (type === 'Polygon') { var c = removeClosingPoint(coords[0].map(convertCoord)); if (c.length > 0) parsedFeats.push({ name: smartName(props, 'Alan', ++globalIdx), type: 'polygon', coords: c, props: props }); }
				else if (type === 'MultiPoint') { coords.forEach(function (pt) { processGeometry({ type: 'Point', coordinates: pt }, props); }); }
				else if (type === 'MultiLineString') { coords.forEach(function (ls) { processGeometry({ type: 'LineString', coordinates: ls }, props); }); }
				else if (type === 'MultiPolygon') { coords.forEach(function (p) { processGeometry({ type: 'Polygon', coordinates: p }, props); }); }
				else if (type === 'GeometryCollection') { (geom.geometries || []).forEach(function (g) { processGeometry(g, props); }); }
			}
			feats.forEach(function (f) { if (f.geometry) processGeometry(f.geometry, f.properties || {}); });
			startBatchRendering(parsedFeats, crsInfo);
		}
	};
	reader.onerror = function () { importError('GeoJSON dosyası okunamadı.'); };
	reader.readAsText(file);
	e.target.value = '';
});

// DXF İçe Aktarma (Z-Offset diyaloğu + REFERANS grubu)
document.getElementById('btnImportDXF').addEventListener('change', function (e) {
	var file = e.target.files[0]; if (!file) return;
	showImportLoading(file.name);
	var crs = document.getElementById('exportCrs').value;
	var reader = new FileReader();
	reader.onload = function (ev) {
		var resultBar = document.querySelector('#resultDisplay > div');
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
			// Genişletilmiş DXF özellik depolama (CIRCLE/ARC/ELLIPSE için)
			var entityRadius = 0;
			var entityStartAngle = 0;
			var entityEndAngle = 360;
			var entityMajorX = 0;
			var entityMajorY = 0;
			var entityMajorZ = 0;
			var entityRatio = 1;
			var entityBulges = []; // LWPOLYLINE bulge değerleri

			// Faz 1: Parse → parsedEntities dizisine topla
			var parsedEntities = [];

			function convertRawPoint(p) {
				var lon, lat;
				if (crs === '5254') { var wgs = tm30ToWgs84(p.x, p.y); lat = wgs[0]; lon = wgs[1]; }
				else { lon = p.x; lat = p.y; }
				return { lon: lon, lat: lat, z: p.z || 0 };
			}

			// CIRCLE/ARC → polyline dönüşüm (36 segment)
			function arcToPolyline(cx, cy, cz, radius, startDeg, endDeg) {
				var pts = [];
				var segments = 36;
				var sRad = startDeg * Math.PI / 180;
				var eRad = endDeg * Math.PI / 180;
				if (eRad <= sRad) eRad += 2 * Math.PI;
				var step = (eRad - sRad) / segments;
				for (var s = 0; s <= segments; s++) {
					var a = sRad + s * step;
					pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), z: cz });
				}
				return pts;
			}

			// ELLIPSE → polyline dönüşüm (36 segment)
			function ellipseToPolyline(cx, cy, cz, majX, majY, ratio, startParam, endParam) {
				var pts = [];
				var segments = 36;
				var majorLen = Math.sqrt(majX * majX + majY * majY);
				var rotation = Math.atan2(majY, majX);
				var minorLen = majorLen * ratio;
				if (endParam <= startParam) endParam += 2 * Math.PI;
				var step = (endParam - startParam) / segments;
				for (var s = 0; s <= segments; s++) {
					var t = startParam + s * step;
					var px = majorLen * Math.cos(t);
					var py = minorLen * Math.sin(t);
					var rx = px * Math.cos(rotation) - py * Math.sin(rotation);
					var ry = px * Math.sin(rotation) + py * Math.cos(rotation);
					pts.push({ x: cx + rx, y: cy + ry, z: cz });
				}
				return pts;
			}

			function finalizeEntity() {
				if (inVertex && vertexPoint) {
					entityPoints.push(vertexPoint);
					vertexPoint = null;
					inVertex = false;
				}
				if (!currentEntity) return;

				var mType = null;
				var coordSource = entityPoints;

				if (currentEntity === 'POINT') {
					if (entityPoints.length > 0) mType = 'coord';
				} else if (currentEntity === 'LINE') {
					if (entityPoints.length >= 2) mType = 'line';
				} else if (currentEntity === 'POLYLINE' || currentEntity === 'LWPOLYLINE') {
					if (entityPoints.length > 0) mType = entityClosed ? 'polygon' : 'line';
				} else if (currentEntity === 'CIRCLE') {
					if (entityPoints.length > 0 && entityRadius > 0) {
						var c = entityPoints[0];
						coordSource = arcToPolyline(c.x, c.y, c.z || 0, entityRadius, 0, 360);
						mType = 'polygon';
					}
				} else if (currentEntity === 'ARC') {
					if (entityPoints.length > 0 && entityRadius > 0) {
						var c = entityPoints[0];
						coordSource = arcToPolyline(c.x, c.y, c.z || 0, entityRadius, entityStartAngle, entityEndAngle);
						mType = 'line';
					}
				} else if (currentEntity === 'ELLIPSE') {
					if (entityPoints.length > 0) {
						var c = entityPoints[0];
						coordSource = ellipseToPolyline(c.x, c.y, c.z || 0, entityMajorX, entityMajorY, entityRatio, entityStartAngle, entityEndAngle);
						var isFullEllipse = Math.abs(entityEndAngle - entityStartAngle - 2 * Math.PI) < 0.01 || (entityStartAngle === 0 && entityEndAngle === 0);
						mType = isFullEllipse ? 'polygon' : 'line';
					}
				} else if (currentEntity === '3DFACE') {
					if (entityPoints.length >= 3) {
						mType = 'polygon';
					}
				}

				if (mType === null || coordSource.length === 0) return;
				var coords = coordSource.map(convertRawPoint);
				var name = entityLayer || (currentEntity + ' ' + (parsedEntities.length + 1));
				parsedEntities.push({ name: name, type: mType, coords: coords });
			}

			var SUPPORTED_ENTITIES = ['POINT', 'LINE', 'POLYLINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', '3DFACE'];

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

					if (SUPPORTED_ENTITIES.indexOf(val) !== -1) {
						currentEntity = val; entityPoints = []; entityLayer = ''; entityClosed = false;
						inVertex = false; vertexPoint = null;
						entityRadius = 0; entityStartAngle = 0; entityEndAngle = 360;
						entityMajorX = 0; entityMajorY = 0; entityMajorZ = 0; entityRatio = 1;
						entityBulges = [];
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
					// Radius (CIRCLE, ARC)
					if (code === '40' && (currentEntity === 'CIRCLE' || currentEntity === 'ARC')) {
						entityRadius = numVal; i++; continue;
					}
					// ELLIPSE ratio (kod 40 = ratio, farklı entitylerde farklı anlam)
					if (code === '40' && currentEntity === 'ELLIPSE') {
						entityRatio = numVal; i++; continue;
					}
					// Start angle (ARC derece, ELLIPSE radian)
					if (code === '50') {
						entityStartAngle = numVal; i++; continue;
					}
					// End angle (ARC derece, ELLIPSE radian)
					if (code === '51') {
						entityEndAngle = numVal; i++; continue;
					}
					// ELLIPSE start/end parametreleri (code 41, 42)
					if (code === '41' && currentEntity === 'ELLIPSE') {
						entityStartAngle = numVal; i++; continue;
					}
					if (code === '42' && currentEntity === 'ELLIPSE') {
						entityEndAngle = numVal; i++; continue;
					}
					// ELLIPSE major axis endpoint (codes 11, 21, 31)
					if (currentEntity === 'ELLIPSE') {
						if (code === '11') { entityMajorX = numVal; i++; continue; }
						if (code === '21') { entityMajorY = numVal; i++; continue; }
						if (code === '31') { entityMajorZ = numVal; i++; continue; }
					}

					if (inVertex && vertexPoint) {
						if (code === '10') vertexPoint.x = numVal;
						else if (code === '20') vertexPoint.y = numVal;
						else if (code === '30') vertexPoint.z = numVal;
						i++; continue;
					}
					if (code === '10') {
						if (currentEntity === 'LWPOLYLINE') entityPoints.push({ x: numVal, y: 0, z: 0 });
						else if (currentEntity === '3DFACE') {
							entityPoints[0] = entityPoints[0] || { x: 0, y: 0, z: 0 };
							entityPoints[0].x = numVal;
						}
						else if (!entityPoints[0]) entityPoints[0] = { x: numVal, y: 0, z: 0 };
						else entityPoints[0].x = numVal;
					} else if (code === '20') {
						var lp = currentEntity === 'LWPOLYLINE' ? entityPoints[entityPoints.length - 1] : (currentEntity === '3DFACE' ? entityPoints[0] : entityPoints[0]);
						if (lp) lp.y = numVal;
						else if (currentEntity === '3DFACE') { entityPoints[0] = { x: 0, y: numVal, z: 0 }; }
					} else if (code === '30') {
						var lpz = currentEntity === 'LWPOLYLINE' ? entityPoints[entityPoints.length - 1] : (currentEntity === '3DFACE' ? entityPoints[0] : entityPoints[0]);
						if (lpz) lpz.z = numVal;
					} else if (code === '11') {
						if (currentEntity === '3DFACE') { entityPoints[1] = entityPoints[1] || { x: 0, y: 0, z: 0 }; entityPoints[1].x = numVal; }
						else { entityPoints[1] = { x: numVal, y: 0, z: 0 }; }
					} else if (code === '21') {
						if (currentEntity === '3DFACE') { entityPoints[1] = entityPoints[1] || { x: 0, y: 0, z: 0 }; entityPoints[1].y = numVal; }
						else if (entityPoints[1]) entityPoints[1].y = numVal;
					} else if (code === '31') {
						if (currentEntity === '3DFACE') { entityPoints[1] = entityPoints[1] || { x: 0, y: 0, z: 0 }; entityPoints[1].z = numVal; }
						else if (entityPoints[1]) entityPoints[1].z = numVal;
					} else if (code === '12') {
						if (currentEntity === '3DFACE') { entityPoints[2] = entityPoints[2] || { x: 0, y: 0, z: 0 }; entityPoints[2].x = numVal; }
					} else if (code === '22') {
						if (currentEntity === '3DFACE') { entityPoints[2] = entityPoints[2] || { x: 0, y: 0, z: 0 }; entityPoints[2].y = numVal; }
					} else if (code === '32') {
						if (currentEntity === '3DFACE') { entityPoints[2] = entityPoints[2] || { x: 0, y: 0, z: 0 }; entityPoints[2].z = numVal; }
					} else if (code === '13') {
						if (currentEntity === '3DFACE') { entityPoints[3] = entityPoints[3] || { x: 0, y: 0, z: 0 }; entityPoints[3].x = numVal; }
					} else if (code === '23') {
						if (currentEntity === '3DFACE') { entityPoints[3] = entityPoints[3] || { x: 0, y: 0, z: 0 }; entityPoints[3].y = numVal; }
					} else if (code === '33') {
						if (currentEntity === '3DFACE') { entityPoints[3] = entityPoints[3] || { x: 0, y: 0, z: 0 }; entityPoints[3].z = numVal; }
					}
					i++;
				}
			}

			if (parsedEntities.length === 0) { importError('DXF dosyasında geçerli öğe bulunamadı.'); return; }

			// Faz 2: Z diyaloğu → oluştur
			updateImportLoading('Gerçek kot ayarı bekleniyor…');
			showImportZDialog(function (zOffset) {
				if (zOffset === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				updateImportLoading('Veriler oluşturuluyor…');
				var refGroupId = getOrCreateReferansGroup(file.name);
				if (refGroupId === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				var dxfGroup = groups.find(function (g) { return g.id === refGroupId; });
				applyImportZOffsetToGroup(dxfGroup, zOffset);
				var effectiveGroupZ = dxfGroup ? dxfGroup._zOffset : zOffset;
				parsedEntities.forEach(function (ent, idx) {
					var points = ent.coords.map(function (c) {
						return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + effectiveGroupZ);
					});
					var m = {
						id: ++measureCount,
						groupId: refGroupId,
						name: ent.name,
						type: ent.type,
						checked: true,
						isImported: true,
						points: points,
						entities: []
					};
					measurements.push(m);
					if (ent.type === 'coord') restoreCoord(m);
					else if (ent.type === 'line') restoreLineLight(m);
					else if (ent.type === 'polygon') restorePolygonLight(m);
				});
				renderList();
				viewer.scene.requestRender();
				// ─── Import verisini IndexedDB'ye kaydet ───
				CbsStorage.saveImport(refGroupId, file.name, dxfGroup && dxfGroup.color || '#14B8A6', parsedEntities, zOffset)
					.catch(function (e) { console.warn('DXF import kayıt hatası:', e); });

				hideImportLoading();
				document.querySelector('#resultDisplay > div').innerHTML =
					'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedEntities.length + ' öğe "' + file.name + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Gerçek Z +' + zOffset + 'm)' : '') + '</span>';
			}, 'dxf');
		} catch (dxfErr) {
			console.error('DXF içe aktarma hatası:', dxfErr);
			importError('DXF dosyası okunamadı: ' + dxfErr.message);
		}
	};
	reader.onerror = function () { importError('DXF dosyası okunamadı.'); };
	reader.readAsText(file);
	e.target.value = '';
});

// ─── KML/KMZ İçe Aktarma (Endüstri Standardı — DOMParser + JSZip) ─────────
document.getElementById('btnImportKML').addEventListener('change', function (e) {
	var file = e.target.files[0]; if (!file) return;
	showImportLoading(file.name);
	var isKmz = file.name.toLowerCase().endsWith('.kmz');

	function processKmlText(kmlText, fileName) {
		var resultBar = document.querySelector('#resultDisplay > div');
		try {
			var parser = new DOMParser();
			var doc = parser.parseFromString(kmlText, 'text/xml');
			var placemarks = doc.getElementsByTagName('Placemark');
			if (placemarks.length === 0) { importError('KML dosyasında Placemark bulunamadı.'); return; }

			var parsedFeats = [];
			for (var p = 0; p < placemarks.length; p++) {
				var pm = placemarks[p];
				var nameEl = pm.getElementsByTagName('name')[0];
				var descEl = pm.getElementsByTagName('description')[0];
				var pmName = nameEl ? nameEl.textContent.trim() : (descEl ? descEl.textContent.trim().substring(0, 50) : 'Placemark ' + (p + 1));

				// Point
				var pointEl = pm.getElementsByTagName('Point')[0];
				if (pointEl) {
					var coordText = (pointEl.getElementsByTagName('coordinates')[0] || {}).textContent;
					if (coordText) {
						var parts = coordText.trim().split(',');
						var lon = parseFloat(parts[0]), lat = parseFloat(parts[1]), z = parseFloat(parts[2]) || 0;
						if (!isNaN(lon) && !isNaN(lat)) {
							parsedFeats.push({ name: pmName, type: 'coord', coords: [{ lon: lon, lat: lat, z: z }] });
						}
					}
				}

				// LineString
				var lineEl = pm.getElementsByTagName('LineString')[0];
				if (lineEl) {
					var coordText = (lineEl.getElementsByTagName('coordinates')[0] || {}).textContent;
					if (coordText) {
						var converted = [];
						coordText.trim().split(/\s+/).forEach(function (tuple) {
							var parts = tuple.split(',');
							if (parts.length >= 2) {
								converted.push({ lon: parseFloat(parts[0]), lat: parseFloat(parts[1]), z: parseFloat(parts[2]) || 0 });
							}
						});
						if (converted.length > 0) parsedFeats.push({ name: pmName, type: 'line', coords: converted });
					}
				}

				// Polygon (outer boundary only)
				var polyEl = pm.getElementsByTagName('Polygon')[0];
				if (polyEl) {
					var outerBoundary = polyEl.getElementsByTagName('outerBoundaryIs')[0];
					var linearRing = outerBoundary ? outerBoundary.getElementsByTagName('LinearRing')[0] : null;
					var coordEl = linearRing ? linearRing.getElementsByTagName('coordinates')[0] : null;
					if (coordEl) {
						var converted = [];
						coordEl.textContent.trim().split(/\s+/).forEach(function (tuple) {
							var parts = tuple.split(',');
							if (parts.length >= 2) {
								converted.push({ lon: parseFloat(parts[0]), lat: parseFloat(parts[1]), z: parseFloat(parts[2]) || 0 });
							}
						});
						// Kapanış noktasını kaldır
						if (converted.length > 1) {
							var f2 = converted[0], l2 = converted[converted.length - 1];
							if (Math.abs(f2.lon - l2.lon) < 0.00001 && Math.abs(f2.lat - l2.lat) < 0.00001) converted.pop();
						}
						if (converted.length > 0) parsedFeats.push({ name: pmName, type: 'polygon', coords: converted });
					}
				}
			}

			if (parsedFeats.length === 0) { importError('KML dosyasında geçerli öğe bulunamadı.'); return; }

			updateImportLoading('Gerçek kot ayarı bekleniyor…');
			showImportZDialog(function (zOffset) {
				if (zOffset === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				updateImportLoading('Veriler oluşturuluyor…');
				var refGroupId = getOrCreateReferansGroup(fileName);
				if (refGroupId === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				var kmlGroup = groups.find(function (g) { return g.id === refGroupId; });
				applyImportZOffsetToGroup(kmlGroup, zOffset);
				var effectiveGroupZ = kmlGroup ? kmlGroup._zOffset : zOffset;
				parsedFeats.forEach(function (feat) {
					var points = feat.coords.map(function (c) {
						return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + effectiveGroupZ);
					});
					var m = {
						id: ++measureCount,
						groupId: refGroupId,
						name: feat.name,
						type: feat.type,
						checked: true,
						isImported: true,
						points: points,
						entities: [],
						properties: feat.props || {}
					};
					measurements.push(m);
					if (feat.type === 'coord') restoreCoord(m);
					else if (feat.type === 'line') restoreLineLight(m);
					else if (feat.type === 'polygon') restorePolygonLight(m);
				});
				renderList();
				viewer.scene.requestRender();

				// ─── Import verisini IndexedDB'ye kaydet ───
				CbsStorage.saveImport(refGroupId, fileName, kmlGroup && kmlGroup.color || '#14B8A6', parsedFeats, zOffset)
					.catch(function (e) { console.warn('KML import kayıt hatası:', e); });

				hideImportLoading();
				document.querySelector('#resultDisplay > div').innerHTML =
					'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedFeats.length + ' öğe "' + fileName + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Gerçek Z +' + zOffset + 'm)' : '') + '</span>';
			}, 'kml');
		} catch (kmlErr) {
			console.error('KML içe aktarma hatası:', kmlErr);
			importError('KML dosyası okunamadı: ' + kmlErr.message);
		}
	}

	if (isKmz) {
		// KMZ = ZIP → JSZip ile aç → .kml dosyasını bul
		var reader = new FileReader();
		reader.onload = function (ev) {
			if (typeof JSZip === 'undefined') { importError('JSZip kütüphanesi yüklenemedi. KMZ desteği için internet bağlantısı gereklidir.'); return; }
			JSZip.loadAsync(ev.target.result).then(function (zip) {
				var kmlFile = null;
				zip.forEach(function (path, entry) {
					if (!kmlFile && path.toLowerCase().endsWith('.kml')) kmlFile = entry;
				});
				if (!kmlFile) { importError('KMZ arşivinde .kml dosyası bulunamadı.'); return; }
				return kmlFile.async('string');
			}).then(function (kmlText) {
				if (kmlText) processKmlText(kmlText, file.name);
			}).catch(function (err) {
				console.error('KMZ açma hatası:', err);
				importError('KMZ dosyası açılamadı: ' + err.message);
			});
		};
		reader.onerror = function () { importError('KMZ dosyası okunamadı.'); };
		reader.readAsArrayBuffer(file);
	} else {
		// Düz KML dosyası
		var reader = new FileReader();
		reader.onload = function (ev) {
			processKmlText(ev.target.result, file.name);
		};
		reader.onerror = function () { importError('KML dosyası okunamadı.'); };
		reader.readAsText(file);
	}
	e.target.value = '';
});

// ─── KML/KMZ Dışa Aktarma ──────────────────────────────────────
document.getElementById('btnExportKML').addEventListener('click', function () {
	if (!requireCrsSelection()) return;
	var exportMeasurements = getExportMeasurements();
	if (exportMeasurements.length === 0) { showResultErrorMessage('Dışa aktarılacak ölçüm bulunamadı.'); return; }

	// WGS84'e dönüştür (KML spec her zaman WGS84)
	function cartesianToWgs84(cart) {
		var carto = Cesium.Cartographic.fromCartesian(cart);
		return {
			lon: Cesium.Math.toDegrees(carto.longitude),
			lat: Cesium.Math.toDegrees(carto.latitude),
			alt: carto.height
		};
	}

	// KML oluştur
	var kmlParts = [];
	kmlParts.push('<?xml version="1.0" encoding="UTF-8"?>');
	kmlParts.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
	kmlParts.push('<Document>');
	kmlParts.push('<name>CBS 3D Export</name>');

	// Grupları topla
	var groupMap = {};
	exportMeasurements.forEach(function (m) {
		var gId = m.groupId || 0;
		if (!groupMap[gId]) groupMap[gId] = [];
		groupMap[gId].push(m);
	});

	Object.keys(groupMap).forEach(function (gId) {
		var grp = groups.find(function (g) { return g.id == gId; });
		var folderName = grp ? grp.name : 'Grup ' + gId;
		kmlParts.push('<Folder><name>' + folderName + '</name>');

		groupMap[gId].forEach(function (m) {
			kmlParts.push('<Placemark>');
			kmlParts.push('<name>' + (m.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</name>');

			if (m.type === 'coord' && m.points.length > 0) {
				var w = cartesianToWgs84(m.points[0]);
				kmlParts.push('<Point><coordinates>' + w.lon + ',' + w.lat + ',' + w.alt + '</coordinates></Point>');
			} else if (m.type === 'line' && m.points.length > 1) {
				var coords = m.points.map(function (p) {
					var w = cartesianToWgs84(p);
					return w.lon + ',' + w.lat + ',' + w.alt;
				}).join(' ');
				kmlParts.push('<LineString><altitudeMode>absolute</altitudeMode><coordinates>' + coords + '</coordinates></LineString>');
			} else if (m.type === 'polygon' && m.points.length > 2) {
				var coords = m.points.map(function (p) {
					var w = cartesianToWgs84(p);
					return w.lon + ',' + w.lat + ',' + w.alt;
				});
				// Kapanış noktası ekle
				var first = cartesianToWgs84(m.points[0]);
				coords.push(first.lon + ',' + first.lat + ',' + first.alt);
				kmlParts.push('<Polygon><outerBoundaryIs><LinearRing><altitudeMode>absolute</altitudeMode><coordinates>' + coords.join(' ') + '</coordinates></LinearRing></outerBoundaryIs></Polygon>');
			}
			kmlParts.push('</Placemark>');
		});
		kmlParts.push('</Folder>');
	});

	kmlParts.push('</Document></kml>');
	var kmlContent = kmlParts.join('\n');

	// İndirme
	var blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
	var a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'export.kml';
	a.click();
	URL.revokeObjectURL(a.href);
	TelemetryManager.addLog('KML dışa aktarma: ' + exportMeasurements.length + ' öğe');
});

// ─── EXCEL METADATA RAPORU ────────────────────────────────────
document.getElementById('btnExportExcel').addEventListener('click', function () {
	var selected = getExportMeasurements();
	if (selected.length === 0) { showResultErrorMessage('Dışa aktarılacak ölçüm bulunamadı.'); return; }

	if (typeof XLSX === 'undefined') {
		showResultErrorMessage('SheetJS kütüphanesi yüklenemedi. Lütfen internet bağlantısını kontrol edin.');
		return;
	}

	// ── Satır oluşturma yardımcısı ──
	function makeRow(m) {
		var p   = m.properties || {};
		var grp = getGroupName(m.groupId);
		var tipMap = { polygon: 'Polygon (Alan)', line: 'Çizgi (Mesafe)', height: 'Yükseklik', coord: 'Nokta (Koordinat)' };

		// WGS84 merkez koordinatı
		var centLon = '', centLat = '';
		if (m.points && m.points.length > 0) {
			var sumLon = 0, sumLat = 0;
			m.points.forEach(function (pt) {
				var c = Cesium.Cartographic.fromCartesian(pt);
				sumLon += Cesium.Math.toDegrees(c.longitude);
				sumLat += Cesium.Math.toDegrees(c.latitude);
			});
			centLon = (sumLon / m.points.length).toFixed(6);
			centLat = (sumLat / m.points.length).toFixed(6);
		}

		return {
			'Grup':             grp,
			'Ad':               m.name || '',
			'Tip':              tipMap[m.type] || m.type || '',
			'Sonuç / Ölçüm':    m.resultText || '',
			'Merkez Boylam':    centLon,
			'Merkez Enlem':     centLat,
			// Kadastro
			'Ada No':           p.ada_no    || '',
			'Parsel No':        p.parsel_no || '',
			'Tip / Cins':       p.cins      || '',
			// Kullanıcı verileri
			'Kat':              p.kat       != null ? p.kat       : '',
			'Yapım Yılı':       p.yapim_yili != null ? p.yapim_yili : '',
			'Çıkma Tipi':       p.cikma_tipi    || '',
			'Taşıyıcı Sistem':  p.tasiyici_sistem || '',
			'Yapı Durumu':      p.yapi_durumu   || '',
			'Kullanım Amacı':   p.kullanim_amaci || '',
			'Notlar':           p.notlar        || ''
		};
	}

	// ── 1. Sayfa: Tam Liste ──
	var allRows = selected.map(makeRow);

	// ── 2. Sayfa: Ada–Parsel Özeti (sadece kadastro verisi olanlar) ──
	var adaMap = {};
	selected.forEach(function (m) {
		var p   = m.properties || {};
		var key = (p.ada_no || '—') + '/' + (p.parsel_no || '—');
		if (!adaMap[key]) {
			adaMap[key] = {
				'Ada No':    p.ada_no    || '—',
				'Parsel No': p.parsel_no || '—',
				'Cins':      p.cins      || '',
				'Polygon Sayısı': 0,
				'Toplam Alan (m²)': 0,
				'Çizgi Sayısı': 0,
				'Toplam Mesafe (m)': 0
			};
		}
		var entry = adaMap[key];
		if (m.type === 'polygon') {
			entry['Polygon Sayısı']++;
			var areaMatch = (m.resultText || '').match(/([\d.]+)\s*m²/);
			if (areaMatch) entry['Toplam Alan (m²)'] += parseFloat(areaMatch[1]);
		} else if (m.type === 'line') {
			entry['Çizgi Sayısı']++;
			var distMatch = (m.resultText || '').match(/([\d.]+)\s*m/);
			if (distMatch) entry['Toplam Mesafe (m)'] += parseFloat(distMatch[1]);
		}
	});
	var summaryRows = Object.values(adaMap).sort(function (a, b) {
		if (a['Ada No'] < b['Ada No']) return -1;
		if (a['Ada No'] > b['Ada No']) return 1;
		return (a['Parsel No'] < b['Parsel No']) ? -1 : 1;
	});

	// ── Workbook oluştur ──
	var wb = XLSX.utils.book_new();

	var ws1 = XLSX.utils.json_to_sheet(allRows);
	// Sütun genişlikleri
	ws1['!cols'] = [
		{wch:14},{wch:10},{wch:18},{wch:22},{wch:14},{wch:14},
		{wch:8},{wch:10},{wch:22},{wch:6},{wch:10},{wch:16},{wch:18},{wch:12},{wch:16},{wch:28}
	];
	XLSX.utils.book_append_sheet(wb, ws1, 'Tüm Ölçümler');

	var ws2 = XLSX.utils.json_to_sheet(summaryRows);
	ws2['!cols'] = [{wch:8},{wch:10},{wch:22},{wch:14},{wch:18},{wch:12},{wch:20}];
	XLSX.utils.book_append_sheet(wb, ws2, 'Ada-Parsel Özeti');

	// ── İndir ──
	var ts = new Date().toISOString().slice(0, 10);
	XLSX.writeFile(wb, 'CBS_Rapor_' + ts + '.xlsx');
	TelemetryManager.addLog('Excel rapor dışa aktarma: ' + selected.length + ' öğe');
});

// ─── YAKINLAŞ / UZAKLAŞ KONTROLLERİ ─────────────────────────
// factor: büyük değer = küçük adım (daha hassas)
function doZoom(direction, factor) {
	if (!viewer || !viewer.camera) return;
	var cameraHeight = viewer.camera.positionCartographic.height;
	var moveRate = cameraHeight / (factor || 20.0);
	if (direction === 'in') viewer.camera.zoomIn(moveRate);
	else viewer.camera.zoomOut(moveRate);
	viewer.scene.requestRender();
}

// ─── PRESS-AND-HOLD: SİNEMATİK ZOOM ─────────────────────────
// Tek tık: çok hassas küçük adım (factor 20)
// 2 saniye basılı tutunca: yavaş başlayan sinematik döngü
(function () {
	var _zoomRaf = null;
	var _zoomDir = null;
	var _holdTimer = null;       // 2s bekleme timer
	var _holdStartTime = null;   // döngü başlama zamanı
	var HOLD_DELAY = 2000;       // ms — kaç ms sonra döngü başlar
	var FACTOR_START = 15.0;     // hold başlangıç hızı (yavaş)
	var FACTOR_MAX = 5.0;        // hold max hız (3s sonra)

	function zoomLoop() {
		if (!_zoomDir) return;
		// Döngü başladıktan bu yana geçen süre → giderek hızlan (0→3s)
		var elapsed = Date.now() - _holdStartTime;
		var t = Math.min(elapsed / 3000, 1.0);
		var factor = FACTOR_START - (FACTOR_START - FACTOR_MAX) * t;
		doZoom(_zoomDir, factor);
		_zoomRaf = requestAnimationFrame(zoomLoop);
	}

	function cancelHold() {
		if (_holdTimer) { clearTimeout(_holdTimer); _holdTimer = null; }
		if (_zoomRaf) { cancelAnimationFrame(_zoomRaf); _zoomRaf = null; }
		_zoomDir = null;
	}

	function attachZoomBtn(btnId, dir) {
		var btn = document.getElementById(btnId);
		if (!btn) return;
		var _pressStart = 0;

		// ── TOUCH ──
		btn.addEventListener('touchstart', function (e) {
			e.preventDefault();
			_pressStart = Date.now();
			_zoomDir = dir;
			// 2 saniye sonra sinematik döngüyü başlat
			_holdTimer = setTimeout(function () {
				_holdStartTime = Date.now();
				_zoomRaf = requestAnimationFrame(zoomLoop);
			}, HOLD_DELAY);
		}, { passive: false });

		btn.addEventListener('touchend', function (e) {
			e.preventDefault();
			var elapsed = Date.now() - _pressStart;
			var wasTap = elapsed < HOLD_DELAY; // 2s dolmadıysa tek tık
			cancelHold();
			if (wasTap) doZoom(dir, 20.0); // tek tık: hassas adım
		}, { passive: false });

		btn.addEventListener('touchcancel', function () { cancelHold(); });

		// ── MOUSE (masaüstü) ──
		btn.addEventListener('mousedown', function (e) {
			if (e.button !== 0) return;
			_pressStart = Date.now();
			_zoomDir = dir;
			_holdTimer = setTimeout(function () {
				_holdStartTime = Date.now();
				_zoomRaf = requestAnimationFrame(zoomLoop);
			}, HOLD_DELAY);
		});

		btn.addEventListener('mouseup', function (e) {
			if (e.button !== 0) return;
			var elapsed = Date.now() - _pressStart;
			var wasClick = elapsed < HOLD_DELAY;
			cancelHold();
			if (wasClick) doZoom(dir, 20.0);
		});

		btn.addEventListener('mouseleave', function () { cancelHold(); });

		// click'i devre dışı bırak (mousedown/up yönetiyor)
		btn.addEventListener('click', function (e) { e.stopImmediatePropagation(); });
	}

	attachZoomBtn('btnZoomIn', 'in');
	attachZoomBtn('btnZoomOut', 'out');
})();





// Klavye +/- tuşları (biraz daha az hassas: /3 oranı)
document.addEventListener('keydown', function (e) {
	// Input/textarea odaklıyken çalışmasın
	var tag = (e.target.tagName || '').toLowerCase();
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
	if (e.key === '+' || e.key === '=' || (e.key === '+' && e.shiftKey)) {
		e.preventDefault();
		doZoom('in', 5.0);
		document.getElementById('btnZoomIn').classList.add('bg-slate-700');
		setTimeout(function () { document.getElementById('btnZoomIn').classList.remove('bg-slate-700'); }, 150);
	} else if (e.key === '-' || e.key === '_') {
		e.preventDefault();
		doZoom('out', 5.0);
		document.getElementById('btnZoomOut').classList.add('bg-slate-700');
		setTimeout(function () { document.getElementById('btnZoomOut').classList.remove('bg-slate-700'); }, 150);
	}
});

// ═══ TELEMETRİ LOG HOOKS (Otomatik İşlem Kaydı) ═══
(function () {
	if (typeof TelemetryManager === 'undefined') return;

	// Sayfa yüklendiğinde
	TelemetryManager.addLog('Uygulama başlatıldı');

	// Araç paneli tıklamaları (event delegation)
	var toolsPanel = document.getElementById('toolsPanel');
	if (toolsPanel) {
		toolsPanel.addEventListener('click', function (e) {
			var btn = e.target.closest('button');
			if (btn) {
				var title = btn.title || btn.textContent.trim().substring(0, 30);
				TelemetryManager.addLog('Araç tıklandı: ' + title);
			}
		});
	}

	// Ölçüm paneli tıklamaları
	var measurePanel = document.getElementById('measurePanel');
	if (measurePanel) {
		measurePanel.addEventListener('click', function (e) {
			var btn = e.target.closest('button');
			if (btn) {
				var title = btn.title || btn.id || btn.textContent.trim().substring(0, 20);
				TelemetryManager.addLog('Ölçüm paneli: ' + title);
			}
		});
	}

	// Klavye kısayolları log
	document.addEventListener('keydown', function (e) {
		if (e.repeat) return;
		var target = e.target;
		var tag = target && target.tagName ? target.tagName.toUpperCase() : '';
		if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) return;

		if (e.key >= '1' && e.key <= '4') {
			var tools = { '1': 'Nokta', '2': 'Mesafe', '3': 'Alan', '4': 'Yükseklik' };
			TelemetryManager.addLog('Kısayol: ' + (tools[e.key] || e.key) + ' aracı');
		}
		if (e.key === 'Delete') TelemetryManager.addLog('Kısayol: Seçili silme (Delete)');
		if (e.key === 'Escape') TelemetryManager.addLog('Kısayol: İptal (ESC)');
		if (e.ctrlKey && e.key === 'z') TelemetryManager.addLog('Kısayol: Geri al (Ctrl+Z)');
	});

	// Import/Export butonları
	['btnImportGeoJSON', 'btnImportCSV', 'btnImportDXF', 'btnExportGeoJSON', 'btnExportCSV', 'btnExportDXF', 'btnExportExcel',
		'ImportGeoJSON', 'ImportCSV', 'ImportDXF', 'ExportGeoJSON', 'ExportCSV', 'ExportDXF'].forEach(function (id) {
			var el = document.getElementById(id);
			if (el) {
				el.addEventListener('click', function () {
					TelemetryManager.addLog('İçe/Dışa aktarım: ' + id);
				});
			}
		});

	// Tema değişikliği
	var themeBtn = document.getElementById('btnToggleTheme');
	if (themeBtn) {
		themeBtn.addEventListener('click', function () {
			var theme = document.documentElement.classList.contains('light') ? 'Koyu' : 'Açık';
			TelemetryManager.addLog('Tema değiştirildi: ' + theme);
		});
	}

	// ── Tüm araç/header init tamamlandı ──
	window._appReady = true;
	document.dispatchEvent(new CustomEvent('appReady'));
})();

}
