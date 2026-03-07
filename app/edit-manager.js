// ═══════════════════════════════════════════════════════════════
// CAD/GIS STANDARDI DİNAMİK EDİT YÖNETİCİSİ (edit-manager.js)
// ═══════════════════════════════════════════════════════════════
// Çizim seçildiğinde Primitive geometriler gizlenip yerine
// CallbackProperty-tabanlı hafif Entity geçirilir; işlem bitince
// tekrar Primitive'e dönülür. Böylece sürükleme sırasında
// saniyede 60 kez geometri sil/oluştur yapılmasına gerek kalmaz.
//
// Bağımlılıklar (main.js'den global):
//   viewer, measurements, groups, drawLayer, handler, activeTool,
//   snappedCartesian, activeHighlightId, highlightMeasurement,
//   restoreLine, restorePolygon, restoreCoord, restoreHeight,
//   safeRemoveItem, debouncedSave, AreaManager, VEC_STYLE,
//   _isMob, _xrayActive, applyXRayToPrimitive
// ═══════════════════════════════════════════════════════════════

var EditManager = {
    activeMeasure: null,   // Şu an düzenlenen ölçüm objesi
    editPoints: [],        // Düzenleme anındaki aktif noktalar (Cartesian3 klonları)
    tempEntities: [],      // Tutamaklar ve geçici çizgiler (Entity API)
    draggedIndex: -1,      // Sürüklenen noktanın index'i
    isDragging: false,     // Sürükleme durumu

    // ─── 1. EDİT MODUNU BAŞLAT ──────────────────────────────────
    startEdit: function (measureId) {
        this.stopEdit(); // Varsa öncekini kapat

        var m = measurements.find(function (x) { return x.id === measureId; });
        if (!m) return;
        // Toplu import verilerini editlemeyi atlıyoruz
        if (m.isBatched) return;
        // Koordinat tipi tek noktadır — basit sürükleme yeterli
        // (startEdit'e alıyoruz ama midpoint/silme devre dışı)

        this.activeMeasure = m;

        // Noktaların kopyasını al (orijinali bozmamak için)
        this.editPoints = m.points.map(function (p) {
            return Cesium.Cartesian3.clone(p);
        });

        // Orijinal sabit Primitive/Entity'leri gizle
        m.entities.forEach(function (ent) {
            ent.show = false;
            if (ent.label) ent.label.show = false;
        });

        // Geçici esnek çizimi ve tutamakları ekrana bas
        this.drawEditGrips();
        viewer.scene.requestRender();
    },

    // ─── 2. TUTAMAKLARI VE GEÇİCİ ÇİZGİYİ ÇİZ ─────────────────
    drawEditGrips: function () {
        var self = this;

        // Eski geçici tutamakları temizle
        this.tempEntities.forEach(function (ent) {
            drawLayer.entities.remove(ent);
        });
        this.tempEntities = [];

        if (!this.activeMeasure) return;

        var mType = this.activeMeasure.type;
        var isHeight = (mType === 'height');

        // ── A) ESNEK GEOMETRİ (CallbackProperty) ──
        if (mType === 'line' || mType === 'polygon') {
            // Polyline
            var dynPolyline = drawLayer.entities.add({
                polyline: {
                    positions: new Cesium.CallbackProperty(function () {
                        if (mType === 'polygon' && self.editPoints.length > 2) {
                            return self.editPoints.concat([self.editPoints[0]]);
                        }
                        return self.editPoints;
                    }, false),
                    width: 4,
                    material: Cesium.Color.CYAN.withAlpha(0.8),
                    clampToGround: false,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
            this.tempEntities.push(dynPolyline);

            // Polygon fill (sadece polygon için)
            if (mType === 'polygon') {
                var dynPolygon = drawLayer.entities.add({
                    polygon: {
                        hierarchy: new Cesium.CallbackProperty(function () {
                            return new Cesium.PolygonHierarchy(self.editPoints);
                        }, false),
                        material: Cesium.Color.CYAN.withAlpha(0.25),
                        perPositionHeight: true
                    }
                });
                this.tempEntities.push(dynPolygon);
            }
        } else if (isHeight) {
            // Height: L-şeklinde çizgi P1→pMid→P2
            var dynHeightLine = drawLayer.entities.add({
                polyline: {
                    positions: new Cesium.CallbackProperty(function () {
                        if (self.editPoints.length >= 3) {
                            return [self.editPoints[0], self.editPoints[1], self.editPoints[2]];
                        }
                        return self.editPoints;
                    }, false),
                    width: 3,
                    material: Cesium.Color.CYAN.withAlpha(0.8),
                    clampToGround: false,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
            this.tempEntities.push(dynHeightLine);
        }

        // ── B) KÖŞE TUTAMAKLARI (Vertex Grips) ──
        var vertexIndices = [];
        if (isHeight) {
            // Height: sadece P1 (index 0) ve P2 (index 2) sürüklenebilir, pMid (index 1) otomatik
            vertexIndices = [0, 2];
        } else {
            for (var vi = 0; vi < this.editPoints.length; vi++) {
                vertexIndices.push(vi);
            }
        }

        vertexIndices.forEach(function (index) {
            var grip = drawLayer.entities.add({
                position: new Cesium.CallbackProperty(function () {
                    return self.editPoints[index];
                }, false),
                point: {
                    pixelSize: 14,
                    color: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.CYAN,
                    outlineWidth: 3,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                properties: new Cesium.PropertyBag({
                    _editGrip: true,
                    _isVertex: true,
                    _index: index
                })
            });
            self.tempEntities.push(grip);
        });

        // ── C) ARA TUTAMAKLAR (Midpoint — Vertex Ekleme) ──
        // Sadece line ve polygon için
        if (mType === 'line' || mType === 'polygon') {
            var len = (mType === 'polygon')
                ? this.editPoints.length
                : this.editPoints.length - 1;

            for (var mi = 0; mi < len; mi++) {
                (function (i) {
                    var midGrip = drawLayer.entities.add({
                        position: new Cesium.CallbackProperty(function () {
                            var p1 = self.editPoints[i];
                            var p2 = self.editPoints[(i + 1) % self.editPoints.length];
                            return Cesium.Cartesian3.midpoint(p1, p2, new Cesium.Cartesian3());
                        }, false),
                        point: {
                            pixelSize: 10,
                            color: Cesium.Color.CYAN.withAlpha(0.4),
                            outlineColor: Cesium.Color.WHITE.withAlpha(0.5),
                            outlineWidth: 2,
                            disableDepthTestDistance: Number.POSITIVE_INFINITY
                        },
                        properties: new Cesium.PropertyBag({
                            _editGrip: true,
                            _isMidpoint: true,
                            _insertAfterIndex: i
                        })
                    });
                    self.tempEntities.push(midGrip);
                })(mi);
            }
        }

        // Height: pMid göstergesi (küçük, sürüklenemez)
        if (isHeight && this.editPoints.length >= 3) {
            var pMidIndicator = drawLayer.entities.add({
                position: new Cesium.CallbackProperty(function () {
                    return self.editPoints[1];
                }, false),
                point: {
                    pixelSize: 8,
                    color: Cesium.Color.YELLOW.withAlpha(0.6),
                    outlineColor: Cesium.Color.WHITE.withAlpha(0.4),
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
            this.tempEntities.push(pMidIndicator);
        }

        viewer.scene.requestRender();
    },

    // ─── 3. SONUÇ HESABINI YENİLE ───────────────────────────────
    recalcResult: function (m) {
        if (!m || !m.points || m.points.length === 0) return;

        if (m.type === 'line') {
            var totalDist = 0;
            for (var i = 0; i < m.points.length - 1; i++) {
                totalDist += Cesium.Cartesian3.distance(m.points[i], m.points[i + 1]);
            }
            m.resultText = totalDist.toFixed(2) + ' m';

        } else if (m.type === 'polygon') {
            if (typeof AreaManager !== 'undefined') {
                var areaData = AreaManager.processArea(m.points);
                m.resultText = '3D: ' + areaData.area3D.toFixed(2) + 'm² / 2D: ' + areaData.area2D.toFixed(2) + 'm²';
            }

        } else if (m.type === 'height') {
            if (m.points.length >= 3) {
                var c1 = Cesium.Cartographic.fromCartesian(m.points[0]);
                var c2 = Cesium.Cartographic.fromCartesian(m.points[2]);
                var diff = Math.abs(c1.height - c2.height);
                m.resultText = '↕ ' + diff.toFixed(2) + ' m';
            }

        } else if (m.type === 'coord') {
            var carto = Cesium.Cartographic.fromCartesian(m.points[0]);
            var lat = Cesium.Math.toDegrees(carto.latitude);
            var lon = Cesium.Math.toDegrees(carto.longitude);
            var z = carto.height;
            if (typeof proj4 !== 'undefined') {
                var tm30 = proj4('EPSG:4326', 'EPSG:5254', [lon, lat]);
                m.resultText = 'Y:' + tm30[0].toFixed(2) + ' X:' + tm30[1].toFixed(2) + ' Z:' + z.toFixed(2);
            }
        }
    },

    // ─── 4. HEIGHT TİPİNDE pMid OTOMATİK HESAPLA ────────────────
    _recalcHeightMidpoint: function () {
        if (!this.activeMeasure || this.activeMeasure.type !== 'height') return;
        if (this.editPoints.length < 3) return;
        // pMid = P2'nin lon/lat'i + P1'in yüksekliği
        var c1 = Cesium.Cartographic.fromCartesian(this.editPoints[0]);
        var c2 = Cesium.Cartographic.fromCartesian(this.editPoints[2]);
        this.editPoints[1] = Cesium.Cartesian3.fromRadians(c2.longitude, c2.latitude, c1.height);
    },

    // ─── 5. EDİT MODUNU BİTİR VE KAYDET ─────────────────────────
    stopEdit: function () {
        if (!this.activeMeasure) return;

        var m = this.activeMeasure;

        // Geçici tutamakları ve esnek şekli sil
        var self = this;
        this.tempEntities.forEach(function (ent) {
            drawLayer.entities.remove(ent);
        });
        this.tempEntities = [];

        // Yeni noktaları orijinal ölçüme aktar
        m.points = this.editPoints;

        // Sonuçları yeniden hesapla
        this.recalcResult(m);

        // Orijinal Primitive/Entity'leri sil
        m.entities.forEach(function (ent) {
            safeRemoveItem(ent);
        });
        m.entities = [];

        // Geri yükleme fonksiyonlarıyla sabit geometri oluştur
        if (m.type === 'coord') restoreCoord(m);
        else if (m.type === 'line') restoreLine(m);
        else if (m.type === 'polygon') restorePolygon(m);
        else if (m.type === 'height') restoreHeight(m);

        // X-Ray aktifse yeni entity'lere uygula
        if (typeof _xrayActive !== 'undefined' && _xrayActive) {
            m.entities.forEach(function (ent) {
                if (typeof applyXRayToPrimitive === 'function') {
                    applyXRayToPrimitive(ent, true);
                }
            });
        }

        // Orijinal çizimleri görünür yap
        m.entities.forEach(function (ent) {
            ent.show = m.checked;
        });

        this.activeMeasure = null;
        this.editPoints = [];
        this.draggedIndex = -1;
        this.isDragging = false;

        viewer.scene.requestRender();
        renderList();
        debouncedSave();
    }
};

// ═══════════════════════════════════════════════════════════════
// FARE ETKİLEŞİMLERİ — handler'a yeni action'lar ekleniyor
// ═══════════════════════════════════════════════════════════════

// ─── 1. LEFT_DOWN — Sürükleme Başlangıcı ────────────────────────
handler.setInputAction(function (click) {
    // Çizim modundayken edit yapılmaz
    if (activeTool) return;
    // Edit modu aktif değilse çık
    if (!EditManager.activeMeasure) return;

    var pickedObject = viewer.scene.pick(click.position);
    if (!Cesium.defined(pickedObject) || !pickedObject.id || !pickedObject.id.properties) return;

    var props = pickedObject.id.properties;

    // _editGrip kontrolü — sadece edit tutamaklarına tepki ver
    if (!props._editGrip || !props._editGrip.getValue()) return;

    if (props._isVertex && props._isVertex.getValue()) {
        // ── Gerçek köşe noktası sürükleme ──
        EditManager.draggedIndex = props._index.getValue();
        EditManager.isDragging = true;
        viewer.scene.screenSpaceCameraController.enableInputs = false;
    } else if (props._isMidpoint && props._isMidpoint.getValue()) {
        // ── Ara nokta (Midpoint) → yeni köşe ekle + sürükle ──
        var insertIdx = props._insertAfterIndex.getValue() + 1;
        // Mevcut midpoint pozisyonunu al
        var midPos = pickedObject.id.position.getValue(Cesium.JulianDate.now());
        var newPoint = Cesium.Cartesian3.clone(midPos);
        // Araya noktayı ekle
        EditManager.editPoints.splice(insertIdx, 0, newPoint);
        EditManager.draggedIndex = insertIdx;
        EditManager.isDragging = true;
        EditManager.drawEditGrips(); // Yeni sayıya göre tutamakları yenile
        viewer.scene.screenSpaceCameraController.enableInputs = false;
    }
}, Cesium.ScreenSpaceEventType.LEFT_DOWN);

// ─── 2. MOUSE_MOVE — Sürükleme İşlemi ──────────────────────────
// Mevcut MOUSE_MOVE handler'ını wrap ediyoruz
(function () {
    var _originalMouseMove = handler.getInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handler.setInputAction(function (movement) {
        // Önce mevcut snap/crosshair mantığını çalıştır
        if (_originalMouseMove) _originalMouseMove(movement);

        // Edit sürükleme
        if (EditManager.isDragging && EditManager.draggedIndex !== -1) {
            var cartesian = null;

            // Snap noktası varsa onu kullan
            if (typeof snappedCartesian !== 'undefined' && snappedCartesian) {
                cartesian = Cesium.Cartesian3.clone(snappedCartesian);
            } else {
                // 3D model yüzeyinde pozisyon al
                try {
                    cartesian = viewer.scene.pickPosition(movement.endPosition);
                } catch (e) { /* depth render hatası */ }

                // Fallback: globe pick
                if (!Cesium.defined(cartesian)) {
                    var ray = viewer.camera.getPickRay(movement.endPosition);
                    if (ray) {
                        cartesian = viewer.scene.globe.pick(ray, viewer.scene);
                    }
                }
            }

            if (Cesium.defined(cartesian)) {
                EditManager.editPoints[EditManager.draggedIndex] = cartesian;
                // Height tipinde pMid otomatik güncelle
                if (EditManager.activeMeasure && EditManager.activeMeasure.type === 'height') {
                    EditManager._recalcHeightMidpoint();
                }
                viewer.scene.requestRender();
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
})();

// ─── 3. LEFT_UP — Sürükleme Bitişi ─────────────────────────────
handler.setInputAction(function () {
    if (EditManager.isDragging) {
        EditManager.isDragging = false;
        EditManager.draggedIndex = -1;
        viewer.scene.screenSpaceCameraController.enableInputs = true;
        // Ara noktaları (midpoints) yeni konumlara göre yenile
        EditManager.drawEditGrips();
    }
}, Cesium.ScreenSpaceEventType.LEFT_UP);

// ─── 4. RIGHT_CLICK — Nokta Silme ──────────────────────────────
// Mevcut RIGHT_CLICK handler'ını wrap ediyoruz
(function () {
    var _originalRightClick = handler.getInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    handler.setInputAction(function (click) {
        // Çizim modundayken mevcut sağ tık davranışını koru
        if (activeTool) {
            if (_originalRightClick) _originalRightClick(click);
            return;
        }

        // Edit modunda vertex silme
        if (EditManager.activeMeasure && click) {
            var pickedObject = viewer.scene.pick(click.position);

            if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.properties) {
                var props = pickedObject.id.properties;

                if (props._editGrip && props._editGrip.getValue() &&
                    props._isVertex && props._isVertex.getValue()) {

                    var idx = props._index.getValue();
                    var mType = EditManager.activeMeasure.type;

                    // Height ve coord tiplerinde silme yok
                    if (mType === 'height' || mType === 'coord') return;

                    // Minimum nokta kontrolü
                    if ((mType === 'polygon' && EditManager.editPoints.length <= 3) ||
                        (mType === 'line' && EditManager.editPoints.length <= 2)) {
                        // Ses/vibrasyon uyarısı (basit alert yerine sessiz)
                        console.warn('EditManager: Minimum nokta sayısına ulaşıldı, daha fazla silinemez.');
                        return;
                    }

                    // Noktayı sil ve tutamakları yenile
                    EditManager.editPoints.splice(idx, 1);
                    EditManager.drawEditGrips();
                    viewer.scene.requestRender();
                    return; // Sağ tık menüsünü engelle
                }
            }
        }

        // Diğer durumlar: orijinal handler'ı çağır
        if (_originalRightClick) _originalRightClick(click);

    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
})();

// ─── 5. ESC İLE EDİT MODUNDAN ÇIK ──────────────────────────────
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && EditManager.activeMeasure && !activeTool) {
        // Değişiklikleri iptal et (orijinal noktaları geri yükle)
        var m = EditManager.activeMeasure;
        // Geçicileri sil
        EditManager.tempEntities.forEach(function (ent) {
            drawLayer.entities.remove(ent);
        });
        EditManager.tempEntities = [];

        // Orijinal entity'leri geri göster
        m.entities.forEach(function (ent) {
            ent.show = m.checked;
            if (ent.label) ent.label.show = m.checked;
        });

        EditManager.activeMeasure = null;
        EditManager.editPoints = [];
        EditManager.draggedIndex = -1;
        EditManager.isDragging = false;

        // Seçimi kaldır
        if (typeof highlightMeasurement === 'function' && typeof activeHighlightId !== 'undefined' && activeHighlightId !== null) {
            highlightMeasurement(activeHighlightId);
        }

        viewer.scene.requestRender();
    }
});

console.log('✏️ EditManager yüklendi — CAD/GIS düzenleme modülü aktif.');
