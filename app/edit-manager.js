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
    _gripCols: [],         // ENU PointPrimitiveCollection'lar (jitter-free grip noktaları)
    _preRender: null,      // preRender listener referansı (cleanup için)
    _editLinePrim: null,   // Stabil edit çizgisi Primitive (createStablePolyline pattern)

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
    // Çizgi → Entity API (CallbackProperty, görsel esneklik)
    // Tutamak noktaları → ENU PointPrimitiveCollection (Float32 jitter yok)
    drawEditGrips: function () {
        var self = this;

        // ── Eski Entity çizgilerini temizle ──
        this.tempEntities.forEach(function (ent) {
            drawLayer.entities.remove(ent);
        });
        this.tempEntities = [];

        // ── Eski ENU grip primitiflerini temizle ──
        if (this._preRender) {
            viewer.scene.preRender.removeEventListener(this._preRender);
            this._preRender = null;
        }
        this._gripCols.forEach(function (g) {
            if (viewer.scene.primitives.contains(g.col)) {
                viewer.scene.primitives.remove(g.col);
            }
        });
        this._gripCols = [];

        if (!this.activeMeasure) return;

        var mType = this.activeMeasure.type;
        var isHeight = (mType === 'height');

        // ── A) ESNEK GEOMETRİ — createStablePolyline (ENU Primitive, jitter yok) ──
        // Her editPoints değişiminde _rebuildEditLine() çağrılır.
        // Polygon fill: Entity API CallbackProperty (sadece dolgu, az kritik)
        this._rebuildEditLine();

        if (mType === 'polygon') {
            var dynPolygon = drawLayer.entities.add({
                polygon: {
                    hierarchy: new Cesium.CallbackProperty(function () {
                        return new Cesium.PolygonHierarchy(self.editPoints);
                    }, false),
                    material: Cesium.Color.CYAN.withAlpha(0.15),
                    perPositionHeight: true
                }
            });
            this.tempEntities.push(dynPolygon);
        }


        // ── B) KÖŞE TUTAMAKLARI — ENU PointPrimitiveCollection ──
        // Entity API'de ECEF Float32 → jitter. ENU modelMatrix → yerel (0,0,0) → jitter yok.
        var vertexIndices = [];
        if (isHeight) {
            vertexIndices = [0, 2]; // pMid (index 1) sürüklenemez
        } else {
            for (var vi = 0; vi < this.editPoints.length; vi++) {
                vertexIndices.push(vi);
            }
        }

        vertexIndices.forEach(function (index) {
            var pos = self.editPoints[index];
            var enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
            var col = new Cesium.PointPrimitiveCollection({ modelMatrix: enuMat });
            var pt = col.add({
                position: Cesium.Cartesian3.ZERO,
                pixelSize: 14,
                color: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.CYAN,
                outlineWidth: 3,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            });
            // Picking için düz obje id (LEFT_DOWN + RIGHT_CLICK tarafından okunur)
            pt.id = { _editGrip: true, _isVertex: true, _index: index };
            viewer.scene.primitives.add(col);
            self._gripCols.push({ col: col, pt: pt, type: 'vertex', index: index });
        });

        // ── C) ARA TUTAMAKLAR (Midpoint) — ENU PointPrimitiveCollection ──
        if (mType === 'line' || mType === 'polygon') {
            var len = (mType === 'polygon')
                ? this.editPoints.length
                : this.editPoints.length - 1;

            for (var mi = 0; mi < len; mi++) {
                (function (i) {
                    var p1 = self.editPoints[i];
                    var p2 = self.editPoints[(i + 1) % self.editPoints.length];
                    var midPt = Cesium.Cartesian3.midpoint(p1, p2, new Cesium.Cartesian3());
                    var enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(midPt);
                    var col = new Cesium.PointPrimitiveCollection({ modelMatrix: enuMat });
                    var pt = col.add({
                        position: Cesium.Cartesian3.ZERO,
                        pixelSize: 10,
                        color: Cesium.Color.CYAN.withAlpha(0.4),
                        outlineColor: Cesium.Color.WHITE.withAlpha(0.5),
                        outlineWidth: 2,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    });
                    pt.id = { _editGrip: true, _isMidpoint: true, _insertAfterIndex: i };
                    viewer.scene.primitives.add(col);
                    self._gripCols.push({ col: col, pt: pt, type: 'midpoint', segStart: i });
                })(mi);
            }
        }

        // ── D) pMid GÖSTERGESİ — ENU PointPrimitiveCollection ──
        if (isHeight && this.editPoints.length >= 3) {
            var pMidPos = this.editPoints[1];
            var enuMat = Cesium.Transforms.eastNorthUpToFixedFrame(pMidPos);
            var col = new Cesium.PointPrimitiveCollection({ modelMatrix: enuMat });
            col.add({
                position: Cesium.Cartesian3.ZERO,
                pixelSize: 8,
                color: Cesium.Color.YELLOW.withAlpha(0.6),
                outlineColor: Cesium.Color.WHITE.withAlpha(0.4),
                outlineWidth: 1
                // disableDepthTestDistance YOK — bina arkasında gizlensin
            });
            viewer.scene.primitives.add(col);
            self._gripCols.push({ col: col, pt: null, type: 'pmid', index: 1 });
        }

        // ── E) preRender: Sadece nokta grip konumlarını güncelle ──
        // (Çizgi _rebuildEditLine() ile MOUSE_MOVE'da rebuild edilir — positions= crash riski yok)
        this._preRender = function () {
            self._gripCols.forEach(function (g) {
                // ── Nokta grip'leri (vertex, pmid, midpoint) ──
                if (g.type === 'vertex' || g.type === 'pmid') {
                    var pos = self.editPoints[g.index];
                    if (pos) g.col.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(pos);
                } else if (g.type === 'midpoint') {
                    var ePts = self.editPoints;
                    var i = g.segStart;
                    if (ePts.length >= 2) {
                        var mp = Cesium.Cartesian3.midpoint(
                            ePts[i], ePts[(i + 1) % ePts.length], new Cesium.Cartesian3()
                        );
                        g.col.modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(mp);
                    }
                }
            });
        };
        viewer.scene.preRender.addEventListener(this._preRender);

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

    // ─── 4b. EDİT ÇİZGİSİNİ STABİL PRİMİTİF OLARAK YENİDEN OLUŞTUR ─────────
    // createStablePolyline (ENU pivot) kullanır — Float32 jitter yok.
    // positions= setter (PolylineCollection) yerine tam Primitive rebuild — crash riski sıfır.
    _rebuildEditLine: function () {
        // Eskiyi kaldır
        if (this._editLinePrim) {
            safeRemoveItem(this._editLinePrim);
            this._editLinePrim = null;
        }
        if (!this.activeMeasure || !this.editPoints || this.editPoints.length < 2) return;

        var mType = this.activeMeasure.type;
        var pts = this.editPoints;

        if (mType === 'line' || mType === 'polygon') {
            var drawPts = (mType === 'polygon' && pts.length > 2)
                ? pts.concat([pts[0]]) : pts;
            this._editLinePrim = createStablePolyline(
                drawPts, 4, Cesium.Color.CYAN.withAlpha(0.8)
            );
        } else if (mType === 'height' && pts.length >= 3) {
            this._editLinePrim = createStablePolyline(
                [pts[0], pts[1], pts[2]], 3, Cesium.Color.CYAN.withAlpha(0.8)
            );
        }
    },

    // ─── 5. EDİT MODUNU BİTİR VE KAYDET ─────────────────────────
    stopEdit: function () {
        if (!this.activeMeasure) return;

        var m = this.activeMeasure;

        // Geçici Entity çizgilerini temizle
        var self = this;
        this.tempEntities.forEach(function (ent) {
            drawLayer.entities.remove(ent);
        });
        this.tempEntities = [];

        // Stabil edit çizgisini temizle
        if (this._editLinePrim) {
            safeRemoveItem(this._editLinePrim);
            this._editLinePrim = null;
        }

        // ENU grip primitiflerini ve preRender listener'ı temizle
        if (this._preRender) {
            viewer.scene.preRender.removeEventListener(this._preRender);
            this._preRender = null;
        }
        this._gripCols.forEach(function (g) {
            if (viewer.scene.primitives.contains(g.col)) {
                viewer.scene.primitives.remove(g.col);
            }
        });
        this._gripCols = [];

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

// Module-scope drag state
var _dragSmooth = null;    // Lerp için önceki düzleştirilmiş pozisyon (sürüklenen vertex)
var _dragSmoothMid = null; // pMid için ayrı lerp geçmişi (height ölçümü)

// ─── Yardımcı: Picked objeyi edit grip olarak çöz ───────────────
// Entity API (PropertyBag) ve Primitive API (düz obje) her ikisini destekler.
function _resolveGrip(pickedObject) {
    if (!Cesium.defined(pickedObject)) return null;
    // ── Primitive API pick (ENU PointPrimitiveCollection) ──
    // scene.pick → {id: point.id, primitive: thePoint}
    var rawId = pickedObject.id;
    if (rawId && rawId._editGrip) {
        return {
            isVertex: !!rawId._isVertex,
            isMidpoint: !!rawId._isMidpoint,
            index: rawId._index !== undefined ? rawId._index : -1,
            insertAfterIndex: rawId._insertAfterIndex !== undefined ? rawId._insertAfterIndex : -1
        };
    }
    // ── Entity API pick (PropertyBag — eski mod, kullanılmıyor ama korunuyor) ──
    if (rawId && rawId.properties) {
        var props = rawId.properties;
        if (!props._editGrip || !props._editGrip.getValue()) return null;
        return {
            isVertex: !!(props._isVertex && props._isVertex.getValue()),
            isMidpoint: !!(props._isMidpoint && props._isMidpoint.getValue()),
            index: props._index ? props._index.getValue() : -1,
            insertAfterIndex: props._insertAfterIndex ? props._insertAfterIndex.getValue() : -1
        };
    }
    return null;
}

// ─── 1. LEFT_DOWN — Sürükleme Başlangıcı ────────────────────────
handler.setInputAction(function (click) {
    // Çizim modundayken edit yapılmaz
    if (activeTool) return;
    // Edit modu aktif değilse çık
    if (!EditManager.activeMeasure) return;

    var pickedObject = viewer.scene.pick(click.position);
    var grip = _resolveGrip(pickedObject);
    if (!grip) return;

    var startDrag = function (index) {
        EditManager.draggedIndex = index;
        EditManager.isDragging = true;
        _dragSmooth = null;
        _dragSmoothMid = null;
        viewer.scene.screenSpaceCameraController.enableInputs = false;
    };

    if (grip.isVertex) {
        startDrag(grip.index);

    } else if (grip.isMidpoint) {
        var insertIdx = grip.insertAfterIndex + 1;
        var segI = grip.insertAfterIndex;
        var ePts = EditManager.editPoints;
        // Midpoint pozisyonunu editPoints'dan hesapla (Primitive API'de .position.getValue() yok)
        var newPoint = Cesium.Cartesian3.midpoint(
            ePts[segI],
            ePts[(segI + 1) % ePts.length],
            new Cesium.Cartesian3()
        );
        ePts.splice(insertIdx, 0, newPoint);
        EditManager.drawEditGrips();
        startDrag(insertIdx);
    }
}, Cesium.ScreenSpaceEventType.LEFT_DOWN);


// ─── 2. MOUSE_MOVE — Sürükleme İşlemi ──────────────────────────
// Anti-Jitter: Ray-Plane Intersection tekniği
//  • Drag başında kameraya dik düzlem kurulur (LEFT_DOWN'da _dragPlane)
//  • Her harekette kamera ışını bu düzlemi keser → depth buffer YOK
//  • Kamera döndürülse bile koordinat değişmez → jitter YOK
//  • Fallback: pickPosition → globe.pick (snap veya düzlem kurulamadıysa)
(function () {
    var _originalMouseMove = handler.getInputAction(Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    var LERP_ALPHA = 0.6;    // 0=çok yumuşak, 1=anlık. 0.6 iyi denge
    var DEAD_ZONE_SQ = 9;    // 3px dead-zone (kare) — sadece çok küçük titremeler

    handler.setInputAction(function (movement) {
        // Önce mevcut snap/crosshair mantığını çalıştır
        if (_originalMouseMove) _originalMouseMove(movement);

        if (!EditManager.isDragging || EditManager.draggedIndex === -1) {
            _dragSmooth = null;
            return;
        }

        var endPos = movement.endPosition;
        var startPos = movement.startPosition;

        // ── Dead-zone: 3px ──
        if (startPos && endPos) {
            var dx = endPos.x - startPos.x;
            var dy = endPos.y - startPos.y;
            if ((dx * dx + dy * dy) < DEAD_ZONE_SQ) return;
        }

        var cartesian = null;

        // ── 1. Snap öncelikli (’vektör’ snap) ──
        if (typeof snappedCartesian !== 'undefined' && snappedCartesian) {
            cartesian = Cesium.Cartesian3.clone(snappedCartesian);
            _dragSmooth = null;

            // ── 2. pickPosition: derinlik buffer → 3D tile + terrain ──
            // Boş gökyüzüne denk gelirse undefined döner → vertex taşınmaz (doğru davranış)
        } else {
            try { cartesian = viewer.scene.pickPosition(endPos); } catch (e) { }
        }

        // ── Lerp smooth (sadece mobilde, snap yokken) ──
        if (Cesium.defined(cartesian) && typeof _isMob !== 'undefined' && _isMob) {
            if (_dragSmooth) {
                cartesian = Cesium.Cartesian3.lerp(
                    _dragSmooth, cartesian, LERP_ALPHA, new Cesium.Cartesian3()
                );
            }
            _dragSmooth = Cesium.Cartesian3.clone(cartesian);
        }

        if (Cesium.defined(cartesian)) {
            EditManager.editPoints[EditManager.draggedIndex] = cartesian;
            if (EditManager.activeMeasure && EditManager.activeMeasure.type === 'height') {
                EditManager._recalcHeightMidpoint();
                if (typeof _isMob !== 'undefined' && _isMob) {
                    var rawMid = EditManager.editPoints[1];
                    if (Cesium.defined(rawMid)) {
                        if (_dragSmoothMid) {
                            EditManager.editPoints[1] = Cesium.Cartesian3.lerp(
                                _dragSmoothMid, rawMid, LERP_ALPHA, new Cesium.Cartesian3()
                            );
                        }
                        _dragSmoothMid = Cesium.Cartesian3.clone(EditManager.editPoints[1]);
                    }
                }
            }
            // Çizgiyi yeniden oluştur (ENU stabil Primitive — jitter yok)
            EditManager._rebuildEditLine();
            viewer.scene.requestRender();
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
(function () {
    var _originalRightClick = handler.getInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    handler.setInputAction(function (click) {
        if (activeTool) {
            if (_originalRightClick) _originalRightClick(click);
            return;
        }

        if (EditManager.activeMeasure && click) {
            var pickedObject = viewer.scene.pick(click.position);
            var grip = _resolveGrip(pickedObject);

            if (grip && grip.isVertex) {
                var idx = grip.index;
                var mType = EditManager.activeMeasure.type;

                if (mType === 'height' || mType === 'coord') return;

                if ((mType === 'polygon' && EditManager.editPoints.length <= 3) ||
                    (mType === 'line' && EditManager.editPoints.length <= 2)) {
                    console.warn('EditManager: Minimum nokta sayısına ulaşıldı.');
                    return;
                }

                EditManager.editPoints.splice(idx, 1);
                EditManager.drawEditGrips();
                viewer.scene.requestRender();
                return;
            }
        }

        if (_originalRightClick) _originalRightClick(click);
    }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
})();

// ─── 5. ESC İLE EDİT MODUNDAN ÇIK ──────────────────────────────
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && EditManager.activeMeasure && !activeTool) {
        var m = EditManager.activeMeasure;

        // Entity çizgilerini sil
        EditManager.tempEntities.forEach(function (ent) {
            drawLayer.entities.remove(ent);
        });
        EditManager.tempEntities = [];

        // ENU grip primitiflerini ve preRender listener'ı sil
        if (EditManager._preRender) {
            viewer.scene.preRender.removeEventListener(EditManager._preRender);
            EditManager._preRender = null;
        }
        EditManager._gripCols.forEach(function (g) {
            if (viewer.scene.primitives.contains(g.col)) {
                viewer.scene.primitives.remove(g.col);
            }
        });
        EditManager._gripCols = [];

        // Stabil edit çizgisini temizle
        if (EditManager._editLinePrim) {
            safeRemoveItem(EditManager._editLinePrim);
            EditManager._editLinePrim = null;
        }

        // Orijinal entity'leri geri göster
        m.entities.forEach(function (ent) {
            ent.show = m.checked;
            if (ent.label) ent.label.show = m.checked;
        });

        EditManager.activeMeasure = null;
        EditManager.editPoints = [];
        EditManager.draggedIndex = -1;
        EditManager.isDragging = false;

        if (typeof highlightMeasurement === 'function' && typeof activeHighlightId !== 'undefined' && activeHighlightId !== null) {
            highlightMeasurement(activeHighlightId);
        }

        viewer.scene.requestRender();
    }
});

console.log('✏️ EditManager yüklendi — CAD/GIS düzenleme modülü aktif.');

