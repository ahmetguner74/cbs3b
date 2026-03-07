// ═══════════════════════════════════════════════════════════════
// Bursa Büyükşehir Belediyesi — 3D Ölçüm ve Dijitalleştirme
// ═══════════════════════════════════════════════════════════════

// 1. CESIUM ION TOKEN (her zaman gerekli — CesiumJS dahili olarak kullanır)
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyYmExYjdkYS03YjFkLTRkMDMtYjFkMS1kNjJiYzA1ZGIyNWQiLCJpZCI6NDE3MTMsImlhdCI6MTc2NjEzMjI3OH0.OGK7rOk1E5pLcZ_Wauyz8hiUlSPb9zmMWuRW2lhp-7c';
var _isMunicipality = true;

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
window.addEventListener('error', function (e) {
	TelemetryManager.addLog('CRITICAL_ERROR', { message: e.message, stack: e.error ? e.error.stack : null }, true);
});
window.addEventListener('unhandledrejection', function (e) {
	TelemetryManager.addLog('PROMISE_REJECTION', { reason: e.reason }, true);
});

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

// Monitoring Service Entegrasyonu
if (window.MonitoringService) {
	window.MonitoringService.setViewer(viewer);
}

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

	// Kutu boyutları (metre)
	_halfSize: { x: 15, y: 15, z: 15 },

	// Clipping planes modelMatrix
	_clipModelMatrix: null,
	// Tıklanan world pozisyonu
	_worldCenter: null,
	// ENU matrisi (vektör kırpma için)
	_enuAtClick: null,
	// Wireframe entity'leri
	_wireframeEntities: [],
	// Gizlenen entity'ler (vektör kırpma)
	_hiddenEntities: [],
	// Gizlenen primitives (referans + ölçüm)
	_hiddenPrimitives: [],

	// ── AKTİVASYON: YERLEŞTİRME MODUNA GİR ─────────────────
	activate: function () {
		if (!tileset) {
			console.warn('ClipBox: Tileset henüz yüklenmedi.');
			return;
		}

		// Zaten aktifse veya placement modundaysa → kapat
		if (this.active || this._placementMode) {
			this.deactivate();
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
			if (rdDiv) rdDiv.textContent = '✂️ Kırpma noktası seçmek için haritaya tıklayın';
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
		this._clipModelMatrix = Cesium.Matrix4.multiply(
			inverseOrigin, enuAtClick, new Cesium.Matrix4()
		);

		// Tıklanan world pozisyonunu sakla (wireframe + flyTo için)
		this._worldCenter = Cesium.Cartesian3.clone(worldPos);

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

		// ENU matrisi sakla (vektör kırpma için)
		this._enuAtClick = enuAtClick;

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

		// Plane'ler orijin merkezli — modelMatrix zaten doğru noktaya taşıyor
		// Her plane: normal dışarı bakıyor, distance = halfSize
		// unionClippingRegions=true → herhangi bir plane'in dışındaki her şey kesilir
		// Sonuç: sadece kutu İÇİ görünür
		var planes = [
			new Cesium.ClippingPlane(new Cesium.Cartesian3(1, 0, 0), hx),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(-1, 0, 0), hx),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 1, 0), hy),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(0, -1, 0), hy),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, 1), hz),
			new Cesium.ClippingPlane(new Cesium.Cartesian3(0, 0, -1), hz),
		];

		// Önceki collection'ı güvenli şekilde temizle
		try {
			if (tileset.clippingPlanes && !tileset.clippingPlanes.isDestroyed()) {
				tileset.clippingPlanes.enabled = false;
			}
		} catch (e) { /* ignore */ }

		// Yeni collection oluştur
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
		this._clearWireframe();

		var hx = this._halfSize.x, hy = this._halfSize.y, hz = this._halfSize.z;
		var enu = Cesium.Transforms.eastNorthUpToFixedFrame(worldCenter);

		// 8 köşe noktası (lokal ENU → world)
		var corners = [
			[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], // alt
			[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], // üst
		];

		var worldCorners = [];
		for (var i = 0; i < corners.length; i++) {
			var local = new Cesium.Cartesian3(corners[i][0], corners[i][1], corners[i][2]);
			worldCorners.push(Cesium.Matrix4.multiplyByPoint(enu, local, new Cesium.Cartesian3()));
		}

		// 12 kenar çizgisi
		var edges = [
			// Alt yüz
			[0, 1], [1, 2], [2, 3], [3, 0],
			// Üst yüz
			[4, 5], [5, 6], [6, 7], [7, 4],
			// Dikey kenarlar
			[0, 4], [1, 5], [2, 6], [3, 7]
		];

		var edgeColor = Cesium.Color.CYAN.withAlpha(0.85);

		for (var e = 0; e < edges.length; e++) {
			var a = worldCorners[edges[e][0]];
			var b = worldCorners[edges[e][1]];
			var ent = viewer.entities.add({
				polyline: {
					positions: [a, b],
					width: 2,
					material: edgeColor,
					clampToGround: false,
					arcType: Cesium.ArcType.NONE
				}
			});
			this._wireframeEntities.push(ent);
		}
	},

	// ── WİREFRAME TEMİZLE ────────────────────────────────────
	_clearWireframe: function () {
		for (var i = 0; i < this._wireframeEntities.length; i++) {
			viewer.entities.remove(this._wireframeEntities[i]);
		}
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
			for (var gi = 0; gi < groups.length; gi++) {
				var grp = groups[gi];
				if (!grp._batchPrimitives || !grp.checked) continue;

				// Gruptaki ölçümlerin noktalarından herhangi biri kutu içinde mi?
				var grpInside = false;
				for (var gmi = 0; gmi < measurements.length; gmi++) {
					var gm = measurements[gmi];
					if (gm.groupId !== grp.id || !gm.points) continue;
					for (var gpi = 0; gpi < gm.points.length; gpi++) {
						var glp = new Cesium.Cartesian3();
						Cesium.Matrix4.multiplyByPoint(invEnu, gm.points[gpi], glp);
						if (Math.abs(glp.x) <= hx && Math.abs(glp.y) <= hy && Math.abs(glp.z) <= hz) {
							grpInside = true;
							break;
						}
					}
					if (grpInside) break;
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

	// ── GİZLENEN ENTITY'LERİ GERİ GÖSTER ───────────────────
	_restoreEntities: function () {
		for (var i = 0; i < this._hiddenEntities.length; i++) {
			this._hiddenEntities[i].show = true;
		}
		this._hiddenEntities = [];

		// Primitives geri göster
		for (var j = 0; j < this._hiddenPrimitives.length; j++) {
			var p = this._hiddenPrimitives[j];
			if (p && !p.isDestroyed || (p && typeof p.isDestroyed === 'function' && !p.isDestroyed())) {
				p.show = true;
				if (p.label) p.label.show = true;
			}
		}
		this._hiddenPrimitives = [];
	},

	// ── MİNİ PANEL GÖSTER/GİZLE ────────────────────────────
	_showMiniPanel: function () {
		var panel = document.getElementById('clipMiniPanel');
		if (!panel) return;
		// Slider değerlerini sync et
		var sx = document.getElementById('clipMiniX');
		var sy = document.getElementById('clipMiniY');
		var sz = document.getElementById('clipMiniZ');
		if (sx) { sx.value = this._halfSize.x * 2; document.getElementById('clipMiniXVal').textContent = (this._halfSize.x * 2) + 'm'; }
		if (sy) { sy.value = this._halfSize.y * 2; document.getElementById('clipMiniYVal').textContent = (this._halfSize.y * 2) + 'm'; }
		if (sz) { sz.value = this._halfSize.z * 2; document.getElementById('clipMiniZVal').textContent = (this._halfSize.z * 2) + 'm'; }
		panel.classList.add('show');
	},

	_hideMiniPanel: function () {
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
			this._clipEntities();
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

	// ── KAPAT ───────────────────────────────────────────────
	deactivate: function () {
		this.active = false;
		this._placementMode = false;

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
		this._enuAtClick = null;
		this._hiddenPrimitives = [];

		viewer.scene.requestRender();
		TelemetryManager.addLog('ClipBox kapatıldı');
	}
};

// ── CLIPBOX EVENT BAĞLANTILARI ──────────────────────────────
(function () {
	// ── Mini Panel Slider Handler'ları ──
	var sliderThrottleId = null;
	['X', 'Y', 'Z'].forEach(function (axis) {
		var slider = document.getElementById('clipMini' + axis);
		var valLabel = document.getElementById('clipMini' + axis + 'Val');
		if (!slider || !valLabel) return;

		// input: sürüklerken — sadece tileset + wireframe güncelle (hızlı)
		slider.addEventListener('input', function () {
			var val = parseInt(slider.value);
			valLabel.textContent = val + 'm';
			if (sliderThrottleId) return;
			sliderThrottleId = requestAnimationFrame(function () {
				sliderThrottleId = null;
				ClipBoxManager._updateSize(axis.toLowerCase(), val, false);
			});
		});

		// change: slider bırakıldığında — entity kırpmayı da güncelle
		slider.addEventListener('change', function () {
			var val = parseInt(slider.value);
			ClipBoxManager._updateSize(axis.toLowerCase(), val, true);
		});
	});

	// ── ± Buton Handler'ları ──
	var pmBtns = document.querySelectorAll('.clip-pm-btn');
	pmBtns.forEach(function (btn) {
		btn.addEventListener('click', function () {
			var axis = btn.getAttribute('data-axis');
			var dir = parseInt(btn.getAttribute('data-dir'));
			var slider = document.getElementById('clipMini' + axis);
			var valLabel = document.getElementById('clipMini' + axis + 'Val');
			if (!slider || !valLabel) return;

			var newVal = Math.max(5, Math.min(100, parseInt(slider.value) + dir * 5));
			slider.value = newVal;
			valLabel.textContent = newVal + 'm';
			ClipBoxManager._updateSize(axis.toLowerCase(), newVal, true);
		});
	});

	// Sıfırla butonu
	var resetBtn = document.getElementById('clipMiniReset');
	if (resetBtn) {
		resetBtn.addEventListener('click', function () {
			['X', 'Y', 'Z'].forEach(function (a) {
				var s = document.getElementById('clipMini' + a);
				var v = document.getElementById('clipMini' + a + 'Val');
				if (s) { s.value = 30; }
				if (v) { v.textContent = '30m'; }
			});
			ClipBoxManager._halfSize = { x: 15, y: 15, z: 15 };
			ClipBoxManager._applyClipping();
			if (ClipBoxManager._worldCenter) {
				ClipBoxManager._drawWireframe(ClipBoxManager._worldCenter);
			}
			ClipBoxManager._clipEntities();
			viewer.scene.requestRender();
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
})();

// ─── SPLASH SCREEN: Gerçek tileset yükleme progress'i ───
function initSplashProgress(ts) {
	var splash = document.getElementById('splashScreen');
	if (!splash) return;

	var progressBar = document.getElementById('splashProgressBar');
	var percentText = document.getElementById('splashPercent');
	var statusText = document.getElementById('splashStatusText');
	var startTime = Date.now();
	var MIN_SHOW = 3000;   // Min 3sn göster (fontlar + ikonlar yüklensin)
	var MAX_SHOW = 20000;  // Max 20sn (yüklenmese bile kapat)
	var dismissed = false;
	var modelReady = false;
	var fontsReady = false;
	var zoomReady = false;  // zoomTo tamamlandı mı?
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
		// Tüm 3 koşul: model hazır + fontlar hazır + kamera uçuşu bitti
		if (modelReady && fontsReady && zoomReady && elapsed >= MIN_SHOW) dismiss();
	}

	// ─── Site tam hazırlık kontrolü (fontlar + ikonlar + CSS) ───
	var _windowLoaded = false;

	// 1) window.onload → Tüm harici kaynaklar (CSS, fontlar, resimler) indirildi
	window.addEventListener('load', function () {
		_windowLoaded = true;
		checkAllReady();
	});

	// 2) Material Symbols ikonlarının gerçekten renderlanıp renderlanmadığını kontrol et
	function checkIconFont() {
		try {
			return document.fonts.check('48px "Material Symbols Outlined"');
		} catch (e) { return false; }
	}

	function checkAllReady() {
		if (fontsReady) return;
		if (_windowLoaded && checkIconFont()) {
			fontsReady = true;
			if (statusText && !modelReady) statusText.textContent = window.AppMessages.SPLASH_LOAD_UI_READY || 'Arayüz hazır, model bekleniyor...';
			tryDismiss();
		}
	}

	// Her 200ms'de ikon fontunu kontrol et
	var _fontPollTimer = setInterval(function () {
		checkAllReady();
		if (fontsReady) clearInterval(_fontPollTimer);
	}, 200);

	// Fallback: 8sn içinde yüklenmezse hazır say
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

	// ─── Tileset yüklenme durumunu izle ───
	var tilesLoaded = 0;
	var tilesTotal = 0;

	ts.tileLoad.addEventListener(function () {
		tilesLoaded++;
		if (tilesTotal > 0) {
			updateProgress(50 + (tilesLoaded / tilesTotal) * 35); // %50-%85 arası
		} else {
			updateProgress(Math.min(50 + tilesLoaded * 3, 80));
		}
	});

	// loadProgress: tile indirme/işleme takibi
	ts.loadProgress.addEventListener(function (pending, processing) {
		tilesTotal = Math.max(tilesTotal, tilesLoaded + pending + processing);
		if (statusText && !modelReady) {
			if (pending > 0 || processing > 0) {
				statusText.textContent = (window.AppMessages.SPLASH_LOAD_DETAILS || 'Detaylar yükleniyor...') + ' (' + tilesLoaded + '/' + tilesTotal + ')';
			}
		}
	});

	// ─── initialTilesLoaded: Görünür tüm tile'lar yüklendi ───
	// loadProgress pending=0'dan daha güvenilir — kamera uçuşu sonrası
	// yeni tile'ların da yüklenmesini bekler
	ts.initialTilesLoaded.addEventListener(function () {
		if (!modelReady) {
			modelReady = true;
			updateProgress(90);
			if (statusText) statusText.textContent = fontsReady
				? (window.AppMessages.SPLASH_LOAD_MODEL_READY || 'Model hazır, açılıyor...')
				: (window.AppMessages.SPLASH_LOAD_MODEL_WAIT_UI || 'Model hazır, arayüz hazırlanıyor...');
			tryDismiss();
		}
	});

	// ─── zoomTo tamamlanmasını bekle ───
	// Bu sayede kamera hedef konumuna ulaşmadan splash kapanmaz
	viewer.zoomTo(ts).then(function () {
		zoomReady = true;
		updateProgress(Math.max(currentPercent, 85));
		if (statusText && !modelReady) statusText.textContent = window.AppMessages.SPLASH_LOAD_DETAILS || 'Detaylar yükleniyor...';
		tryDismiss();
	}).catch(function () {
		// zoomTo başarısız olursa bile devam et
		zoomReady = true;
		tryDismiss();
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
			CbsStorage.setSetting('cbs-theme', 'light');
		} else {
			html.classList.remove('light');
			html.classList.add('dark');
			themeIcon.textContent = 'dark_mode';
			CbsStorage.setSetting('cbs-theme', 'dark');
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
		CbsStorage.setSetting('cbs-toolpanel', 'open');
	}

	function closeToolPanel() {
		_toolPanelIsOpen = false;
		panel.style.transform = 'translateX(calc(-100% + 28px))';
		icon.textContent = 'chevron_right';
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

	// X tuşu: X-Ray toggle
	if (e.key === 'x' || e.key === 'X') {
		var xrayBtn = document.getElementById('btnXRayToggle');
		if (xrayBtn) xrayBtn.click();
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

	viewer.scene.requestRender();
}

// Tek bir primitive/collection/entity'ye X-Ray uygula veya kaldır
function applyXRayToPrimitive(prim, enable) {
	if (!prim) return;
	// Yıkılmış (destroyed) primitive'lere dokunma
	if (typeof prim.isDestroyed === 'function' && prim.isDestroyed()) return;
	try {
		// A) PointPrimitiveCollection — her point'e disableDepthTestDistance
		//    + bağlı .label (LabelCollection) varsa onu da X-Ray'le
		if (prim instanceof Cesium.PointPrimitiveCollection) {
			for (var i = 0; i < prim.length; i++) {
				prim.get(i).disableDepthTestDistance = enable ? Number.POSITIVE_INFINITY : 0;
			}
			// addPointLabel() fonksiyonu label'ı .label olarak bağlar — onu da işle
			if (prim.label) {
				applyXRayToPrimitive(prim.label, enable);
			}
			return;
		}

		// B) LabelCollection — her label'a disableDepthTestDistance
		if (prim instanceof Cesium.LabelCollection) {
			for (var j = 0; j < prim.length; j++) {
				prim.get(j).disableDepthTestDistance = enable ? Number.POSITIVE_INFINITY : 0;
			}
			return;
		}

		// C) Cesium.Primitive (Polyline veya Polygon) — depthFailAppearance
		if (prim instanceof Cesium.Primitive) {
			if (enable) {
				if (prim.appearance && !prim.depthFailAppearance) {
					prim.depthFailAppearance = prim.appearance;
				}
			} else {
				prim.depthFailAppearance = undefined;
			}
			return;
		}

		// D) Cesium.Entity (restoreHeight'teki P_mid noktası gibi)
		if (prim instanceof Cesium.Entity) {
			var ddt = enable ? Number.POSITIVE_INFINITY : 0;
			if (prim.point) prim.point.disableDepthTestDistance = ddt;
			if (prim.label) prim.label.disableDepthTestDistance = ddt;
			if (prim.billboard) prim.billboard.disableDepthTestDistance = ddt;
			return;
		}
	} catch (e) {
		// Sessizce geç — bazı primitive tipleri desteklemeyebilir
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

// STORAGE_KEY artık cbs-storage.js'de tanımlı (CbsStorage modülü)

// Cartesian3 → {lat, lon, height} dönüştürücü (DAL'a parametre olarak geçilir)
function _serializePoint(p) {
	var carto = Cesium.Cartographic.fromCartesian(p);
	return { lat: Cesium.Math.toDegrees(carto.latitude), lon: Cesium.Math.toDegrees(carto.longitude), height: carto.height };
}

function saveToStorage() {
	CbsStorage.saveAll(
		{ groups: groups, measurements: measurements, activeGroupId: activeGroupId },
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
	}).catch(function (e) {
		console.error("Ölçümler geri yüklenirken hata:", e);
	});
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
		if (!importRecords || importRecords.length === 0) return;
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
			}

			var hexColor = existingGroup.color || '#14B8A6';
			var cesColor = Cesium.Color.fromCssColorString(hexColor);
			var zOffset = rec.zOffset || 0;
			var features = rec.features || [];

			// Geometri akümülatörleri (batch rendering)
			var polyFillInstances = [];
			var polyLineInstances = [];
			var labelEntries = [];
			var batchPrimitives = [];

			features.forEach(function (feat) {
				var points = feat.coords.map(function (c) {
					return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + zOffset);
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
					entities: []
				};
				measurements.push(m);

				if (feat.type === 'polygon' && points.length >= 3) {
					try {
						polyFillInstances.push(new Cesium.GeometryInstance({
							geometry: new Cesium.CoplanarPolygonGeometry({
								polygonHierarchy: new Cesium.PolygonHierarchy(points),
								vertexFormat: Cesium.MaterialAppearance.MaterialSupport.BASIC.vertexFormat
							})
						}));
					} catch (e) { }
					try {
						var closedPts = points.concat([points[0]]);
						polyLineInstances.push(new Cesium.GeometryInstance({
							geometry: new Cesium.PolylineGeometry({
								positions: closedPts,
								width: VEC_STYLE.polygon.edgeWidth || 2,
								arcType: Cesium.ArcType.NONE,
								vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
							})
						}));
					} catch (e) { }
					var labelText = m.resultText || m.name || '';
					labelEntries.push({ position: centroid(points), text: labelText });
				} else if (feat.type === 'line' && points.length >= 2) {
					try {
						polyLineInstances.push(new Cesium.GeometryInstance({
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
						allowPicking: false
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
						allowPicking: false
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
			}
		});

		renderList();
		viewer.scene.requestRender();
		console.info('CbsStorage: ' + importRecords.length + ' import grubu geri yüklendi');
	}).catch(function (e) {
		console.error('Import geri yükleme hatası:', e);
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
function rebuildBatchPrimitives(group) {
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
		var points = m.points;

		if (m.type === 'polygon' && points.length >= 3) {
			try {
				polyFillInstances.push(new Cesium.GeometryInstance({
					geometry: new Cesium.CoplanarPolygonGeometry({
						polygonHierarchy: new Cesium.PolygonHierarchy(points),
						vertexFormat: Cesium.MaterialAppearance.MaterialSupport.BASIC.vertexFormat
					})
				}));
			} catch (e) { }
			try {
				var closedPts = points.concat([points[0]]);
				polyLineInstances.push(new Cesium.GeometryInstance({
					geometry: new Cesium.PolylineGeometry({
						positions: closedPts,
						width: VEC_STYLE.polygon.edgeWidth || 2,
						arcType: Cesium.ArcType.NONE,
						vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
					})
				}));
			} catch (e) { }
			var labelText = m.resultText || m.name || '';
			labelEntries.push({ position: centroid(points), text: labelText });
		} else if (m.type === 'line' && points.length >= 2) {
			try {
				polyLineInstances.push(new Cesium.GeometryInstance({
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
				allowPicking: false
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
				allowPicking: false
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

	// X-Ray aktifse yeni batch primitiflere de uygula
	if (_xrayActive) {
		batchPrimitives.forEach(function (p) {
			applyXRayToPrimitive(p, true);
		});
	}
}

// ─── 5. ÖLÇÜM LİSTESİ ─────────────────────────────────────────
function renderList() {
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
	var refGroups = groups.filter(function (g) { return g.isReferans; });
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
		pinIcon.innerText = 'push_pin';
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

		// Z kontrolleri — gerçek kot değeri
		var currentZOffset = group._zOffset || 0;
		var zBtnStyle = 'width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;border:1px solid var(--border-subtle, rgba(71,85,105,0.3));background:var(--bg-elevated, #1e293b);color:var(--text-muted, #94a3b8);transition:all 0.15s;';

		var btnZDown = document.createElement('button');
		btnZDown.style.cssText = zBtnStyle;
		btnZDown.innerText = '−';
		btnZDown.title = 'Kot −1m';
		btnZDown.onmouseenter = function () { this.style.background = 'rgba(239,68,68,0.7)'; this.style.color = '#fff'; };
		btnZDown.onmouseleave = function () { this.style.background = 'var(--bg-elevated, #1e293b)'; this.style.color = 'var(--text-muted, #94a3b8)'; };

		var zInput = document.createElement('input');
		zInput.type = 'number';
		zInput.value = currentZOffset;
		zInput.step = '1';
		zInput.style.cssText = 'width:40px;padding:1px 2px;font-size:9px;text-align:center;background:var(--bg-surface, #111827);border:1px solid var(--border-subtle, rgba(71,85,105,0.25));border-radius:3px;color:var(--text-primary, #cbd5e1);font-family:monospace;';
		zInput.title = 'Gerçek kot ofseti (metre)';

		var btnZUp = document.createElement('button');
		btnZUp.style.cssText = zBtnStyle;
		btnZUp.innerText = '+';
		btnZUp.title = 'Kot +1m';
		btnZUp.onmouseenter = function () { this.style.background = 'rgba(20,184,166,0.7)'; this.style.color = '#fff'; };
		btnZUp.onmouseleave = function () { this.style.background = 'var(--bg-elevated, #1e293b)'; this.style.color = 'var(--text-muted, #94a3b8)'; };

		var zUnit = document.createElement('span');
		zUnit.style.cssText = 'font-size:8px;color:var(--text-muted, #64748b);font-family:monospace;';
		zUnit.textContent = 'm';

		btnZDown.onclick = function () {
			adjustGroupZ(group.id, -1);
			group._zOffset = (group._zOffset || 0) - 1;
			zInput.value = group._zOffset;
		};
		btnZUp.onclick = function () {
			adjustGroupZ(group.id, 1);
			group._zOffset = (group._zOffset || 0) + 1;
			zInput.value = group._zOffset;
		};
		zInput.onchange = function () {
			var newVal = parseFloat(zInput.value) || 0;
			var oldVal = group._zOffset || 0;
			var delta = newVal - oldVal;
			if (delta !== 0) {
				adjustGroupZ(group.id, delta);
				group._zOffset = newVal;
			}
		};

		controlBar.appendChild(btnZDown);
		controlBar.appendChild(zInput);
		controlBar.appendChild(btnZUp);
		controlBar.appendChild(zUnit);

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

		rightDiv.appendChild(result);
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
	// ── EditManager Entegrasyonu ──
	if (typeof EditManager !== 'undefined') {
		if (activeHighlightId === null) {
			EditManager.stopEdit();
		} else {
			EditManager.startEdit(activeHighlightId);
		}
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

	// Batch primitifleri varsa sahneden kaldır
	var grp = groups.find(function (g) { return g.id === id; });
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
	// EditManager sürükleme sırasında snap aktif kalmalı
	var _editDragging = (typeof EditManager !== 'undefined' && EditManager.isDragging);
	if (!activeTool && !_editDragging) {
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
	// EditManager sürükleme sırasında LEFT_CLICK'i engelle
	if (typeof EditManager !== 'undefined' && EditManager.isDragging) return;

	// Eğer aktif bir araç yoksa, haritadaki objeleri (ölçümleri) seçme işlemi yap
	if (!activeTool) {
		// Edit grip tıklanmışsa seçim/seçimi kaldırma mantığını atla
		var _pickCheck = viewer.scene.pick(click.position);
		if (Cesium.defined(_pickCheck) && _pickCheck.id && _pickCheck.id.properties &&
			_pickCheck.id.properties._editGrip && _pickCheck.id.properties._editGrip.getValue()) {
			return; // EditManager LEFT_DOWN handler'ı bununla ilgilenecek
		}
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
			var groupSeq = measurements.filter(function (x) { return x.groupId === activeGroupId; }).length + 1;
			measurements.push({
				id: measureCount,
				groupId: activeGroupId,
				name: '' + groupSeq,
				type: 'height',
				resultText: resultText,
				points: [clickPoints[0], pMid, clickPoints[1]],
				entities: tempEntities.slice(),
				checked: true
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
			checked: true
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
			checked: true
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
			checked: true
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
	if (existing) {
		// Aynı dosya tekrar import ediliyor — üzerine yaz
		if (!confirm('"' + fileName + '" zaten içe aktarılmış.\nÜzerine yazmak ister misiniz?')) {
			return null; // İptal
		}
		// Eski grubu temizle
		deleteGroup(existing.id);
	}
	groupCount++;
	var refGroup = { id: groupCount, name: groupName, isOpen: true, checked: true, isReferans: true };
	groups.push(refGroup);
	return refGroup.id;
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
	alert('İçe aktarma hatası: ' + message);
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

			updateImportLoading('Z ayarı bekleniyor…');
			showImportZDialog(function (zOffset) {
				if (zOffset === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				updateImportLoading('Veriler oluşturuluyor…');
				var refGroupId = getOrCreateReferansGroup(file.name);
				if (refGroupId === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				parsedRows.forEach(function (row, i) {
					var pos = Cesium.Cartesian3.fromDegrees(row.lon, row.lat, row.z + zOffset);
					var m = {
						id: ++measureCount,
						groupId: refGroupId,
						name: row.name,
						type: 'coord',
						resultText: row.lat.toFixed(6) + ', ' + row.lon.toFixed(6),
						checked: true,
						isImported: true,
						points: [pos],
						entities: []
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
				var csvGroup = groups.find(function (g) { return g.id === refGroupId; });
				CbsStorage.saveImport(refGroupId, file.name, csvGroup && csvGroup.color || '#14B8A6', csvFeats, zOffset)
					.catch(function (e) { console.warn('CSV import kayıt hatası:', e); });

				hideImportLoading();
				document.querySelector('#resultDisplay > div').innerHTML =
					'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedRows.length + ' nokta "' + file.name + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Z+' + zOffset + 'm)' : '') + '</span>';
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

			updateImportLoading('Z ayarı bekleniyor…');
			showImportZDialog(function (zOffset) {
				if (zOffset === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				updateImportLoading('Geometriler hazırlanıyor…');
				var refGroupId = getOrCreateReferansGroup(fileName);
				if (refGroupId === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				var refGroup = groups.find(function (g) { return g.id === refGroupId; });
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
							return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + zOffset);
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
							entities: []
						};
						measurements.push(m);

						if (feat.type === 'polygon' && points.length >= 3) {
							// Polygon dolgu instance'ı
							try {
								polyFillInstances.push(new Cesium.GeometryInstance({
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
							labelEntries.push({ position: cx, text: labelText });
						} else if (feat.type === 'line' && points.length >= 2) {
							try {
								polyLineInstances.push(new Cesium.GeometryInstance({
									geometry: new Cesium.PolylineGeometry({
										positions: points,
										width: VEC_STYLE.line.width || 3,
										arcType: Cesium.ArcType.NONE,
										vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT
									})
								}));
							} catch (e) { /* geçersiz geometri */ }
							if (!_isMob) {
								labelEntries.push({ position: midpointAlongLine(points), text: m.resultText || m.name || '' });
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
										allowPicking: false
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
										allowPicking: false
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
								'<span class="text-green-400 font-bold text-[11px]">✓ ' + total + ' öğe "' + fileName + '" grubuna aktarıldı.' + crsInfo + (zOffset !== 0 ? ' (Z+' + zOffset + 'm)' : '') + ' [' + (polyFillInstances.length + polyLineInstances.length) + ' geometri → 3 draw call]</span>';
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
				if (d.error) { importError(d.error); return; }
				if (d.progress) {
					resultBar.innerHTML = '<span class="text-cyan-400 font-bold text-[11px]">⏳ ' + d.progress + ' öğe parse edildi…</span>';
					updateImportLoading(d.progress + ' öğe parse edildi…');
					return;
				}
				if (d.features) {
					worker.terminate();
					startBatchRendering(d.features, d.crsInfo || '');
				}
			};

			worker.onerror = function (err) {
				console.warn('Worker başarısız, inline fallback:', err.message);
				worker.terminate();
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
				if (type === 'Point') { parsedFeats.push({ name: smartName(props, 'Nokta', ++globalIdx), type: 'coord', coords: [convertCoord(coords)] }); }
				else if (type === 'LineString') { var c = coords.map(convertCoord); if (c.length > 0) parsedFeats.push({ name: smartName(props, 'Çizgi', ++globalIdx), type: 'line', coords: c }); }
				else if (type === 'Polygon') { var c = removeClosingPoint(coords[0].map(convertCoord)); if (c.length > 0) parsedFeats.push({ name: smartName(props, 'Alan', ++globalIdx), type: 'polygon', coords: c }); }
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
			updateImportLoading('Z ayarı bekleniyor…');
			showImportZDialog(function (zOffset) {
				if (zOffset === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				updateImportLoading('Veriler oluşturuluyor…');
				var refGroupId = getOrCreateReferansGroup(file.name);
				if (refGroupId === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
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
				var dxfGroup = groups.find(function (g) { return g.id === refGroupId; });
				CbsStorage.saveImport(refGroupId, file.name, dxfGroup && dxfGroup.color || '#14B8A6', parsedEntities, zOffset)
					.catch(function (e) { console.warn('DXF import kayıt hatası:', e); });

				hideImportLoading();
				document.querySelector('#resultDisplay > div').innerHTML =
					'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedEntities.length + ' öğe "' + file.name + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Z+' + zOffset + 'm)' : '') + '</span>';
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

			updateImportLoading('Z ayarı bekleniyor…');
			showImportZDialog(function (zOffset) {
				if (zOffset === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				updateImportLoading('Veriler oluşturuluyor…');
				var refGroupId = getOrCreateReferansGroup(fileName);
				if (refGroupId === null) { hideImportLoading(); resultBar.innerHTML = '<span class="text-slate-400 text-[11px]">İçe aktarma iptal edildi.</span>'; return; }
				parsedFeats.forEach(function (feat) {
					var points = feat.coords.map(function (c) {
						return Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + zOffset);
					});
					var m = {
						id: ++measureCount,
						groupId: refGroupId,
						name: feat.name,
						type: feat.type,
						checked: true,
						isImported: true,
						points: points,
						entities: []
					};
					measurements.push(m);
					if (feat.type === 'coord') restoreCoord(m);
					else if (feat.type === 'line') restoreLineLight(m);
					else if (feat.type === 'polygon') restorePolygonLight(m);
				});
				renderList();
				viewer.scene.requestRender();

				// ─── Import verisini IndexedDB'ye kaydet ───
				var kmlGroup = groups.find(function (g) { return g.id === refGroupId; });
				CbsStorage.saveImport(refGroupId, fileName, kmlGroup && kmlGroup.color || '#14B8A6', parsedFeats, zOffset)
					.catch(function (e) { console.warn('KML import kayıt hatası:', e); });

				hideImportLoading();
				document.querySelector('#resultDisplay > div').innerHTML =
					'<span class="text-green-400 font-bold text-[11px]">✓ ' + parsedFeats.length + ' öğe "' + fileName + '" grubuna aktarıldı.' + (zOffset !== 0 ? ' (Z+' + zOffset + 'm)' : '') + '</span>';
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
	if (exportMeasurements.length === 0) { alert('Dışa aktarılacak ölçüm bulunamadı.'); return; }

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

// ─── YAKINLAŞ / UZAKLAŞ KONTROLLERİ ─────────────────────────
function doZoom(direction, factor) {
	if (!viewer || !viewer.camera) return;
	var cameraHeight = viewer.camera.positionCartographic.height;
	var moveRate = cameraHeight / (factor || 2.0);
	if (direction === 'in') viewer.camera.zoomIn(moveRate);
	else viewer.camera.zoomOut(moveRate);
}

document.getElementById('btnZoomIn').addEventListener('click', function () { doZoom('in', 2.0); });
document.getElementById('btnZoomOut').addEventListener('click', function () { doZoom('out', 2.0); });

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
		if (e.key >= '1' && e.key <= '4') {
			var tools = { '1': 'Nokta', '2': 'Mesafe', '3': 'Alan', '4': 'Yükseklik' };
			TelemetryManager.addLog('Kısayol: ' + (tools[e.key] || e.key) + ' aracı');
		}
		if (e.key === 'Delete') TelemetryManager.addLog('Kısayol: Seçili silme (Delete)');
		if (e.key === 'Escape') TelemetryManager.addLog('Kısayol: İptal (ESC)');
		if (e.ctrlKey && e.key === 'z') TelemetryManager.addLog('Kısayol: Geri al (Ctrl+Z)');
	});

	// Import/Export butonları
	['btnImportGeoJSON', 'btnImportCSV', 'btnImportDXF', 'btnExportGeoJSON', 'btnExportCSV', 'btnExportDXF',
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

	// Global hata yakalayıcı
	window.addEventListener('error', function (e) {
		TelemetryManager.addLog('HATA: ' + (e.message || 'Bilinmeyen hata') + ' (' + (e.filename || '') + ':' + (e.lineno || '') + ')');
	});

	// Promise rejection yakalayıcı
	window.addEventListener('unhandledrejection', function (e) {
		TelemetryManager.addLog('PROMISE HATA: ' + (e.reason || 'Bilinmeyen'));
	});

	// CesiumJS render hatası
	if (typeof viewer !== 'undefined' && viewer.scene) {
		viewer.scene.renderError.addEventListener(function (scene, error) {
			TelemetryManager.addLog('RENDER HATA: ' + (error.message || error));
		});
	}
})();
