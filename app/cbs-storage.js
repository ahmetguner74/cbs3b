/**
 * CBS Storage — Data Access Layer (DAL)
 * 
 * Backend: IndexedDB (asenkron, GB kapasiteli)
 * Eski localStorage verisi ilk açılışta otomatik taşınır (migration).
 * PostgreSQL'e geçişte sadece bu dosya güncellenir.
 */
var CbsStorage = (function () {
    'use strict';

    var DB_NAME = 'cbs_merinos';
    var DB_VERSION = 1;
    var STORE_DATA = 'appdata';      // groups + measurements + meta
    var STORE_IMPORTS = 'imports';    // import verileri (Adım 3)
    var LS_KEY = 'merinos_measurements'; // migration için eski anahtar

    var _db = null; // IDBDatabase referansı

    // ─── IndexedDB Bağlantısı ───

    function openDB() {
        if (_db) return Promise.resolve(_db);
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function (e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_DATA)) {
                    db.createObjectStore(STORE_DATA, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORE_IMPORTS)) {
                    db.createObjectStore(STORE_IMPORTS, { keyPath: 'groupId' });
                }
            };
            req.onsuccess = function (e) {
                _db = e.target.result;
                _db.onclose = function () { _db = null; };
                resolve(_db);
            };
            req.onerror = function (e) {
                console.error('CbsStorage: IndexedDB açılamadı:', e.target.error);
                reject(e.target.error);
            };
        });
    }

    // ─── Basit key-value yardımcıları ───

    function _put(storeName, value) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).put(value);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    function _get(storeName, key) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var req = tx.objectStore(storeName).get(key);
                req.onsuccess = function () { resolve(req.result || null); };
                req.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    function _clearStore(storeName) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).clear();
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    // ─── Migration: localStorage → IndexedDB ───

    function _migrateFromLocalStorage() {
        var saved = null;
        try { saved = localStorage.getItem(LS_KEY); } catch (e) { /* chrome file:// */ }
        if (!saved) return Promise.resolve(false);

        try {
            var raw = JSON.parse(saved);
            // Legacy format desteği
            var data = {
                groups: Array.isArray(raw) ? [] : (raw.groups || []),
                measurements: Array.isArray(raw) ? raw : (raw.measurements || []),
                activeGroupId: raw.activeGroupId !== undefined ? raw.activeGroupId : 0
            };

            return _put(STORE_DATA, { key: 'main', groups: data.groups, measurements: data.measurements, activeGroupId: data.activeGroupId })
                .then(function () {
                    // Başarılı taşıma — localStorage'ı temizle
                    try { localStorage.removeItem(LS_KEY); } catch (e) { }
                    console.info('CbsStorage: localStorage → IndexedDB migration tamamlandı (' + data.measurements.length + ' ölçüm taşındı)');
                    return true;
                });
        } catch (e) {
            console.error('CbsStorage: Migration başarısız:', e);
            return Promise.resolve(false);
        }
    }

    // ─── PUBLIC API ───

    /**
     * Çizilen veya yüklenen her vektör verinin özelliklerini (properties)
     * resmi standartlara ve veritabanı şemasına uygun hale getirir (Sanitization).
     * Eski çizimlerde bu alanlar yoksa, hata vermemesi için varsayılan (boş) değerler atar.
     */
    function normalizeFeatureProperties(rawData) {
        var data = rawData || {};
        // Backward-compat aliases: eski kayıtlarda ref_ada/ref_parsel/ref_cins/tasiyici/kullanim
        // kullanılmış olabilir; yeni canonical isimler ada_no/parsel_no/cins/tasiyici_sistem/kullanim_amaci
        var ada_no      = data.ada_no      || data.ref_ada    || data.adano    || "";
        var parsel_no   = data.parsel_no   || data.ref_parsel || data.parselno || "";
        var cins        = data.cins        || data.ref_cins   || data.tapucinsaciklama || "";
        var tasiyici    = data.tasiyici_sistem || data.tasiyici || "";
        var kullanim    = data.kullanim_amaci  || data.kullanim  || "";
        return {
            area_m2:      typeof data.area_m2   === 'number' ? data.area_m2   : null,
            length_m:     typeof data.length_m  === 'number' ? data.length_m  : null,
            height_m:     typeof data.height_m  === 'number' ? data.height_m  : null,
            vertex_count: typeof data.vertex_count === 'number' ? data.vertex_count : 0,
            // Kadastro (canonical names = UI field names)
            ada_no:    String(ada_no).trim(),
            parsel_no: String(parsel_no).trim(),
            cins:      String(cins).trim(),
            // Kullanıcı verileri
            kat:              !isNaN(parseInt(data.kat))         ? parseInt(data.kat)         : null,
            yapim_yili:       !isNaN(parseInt(data.yapim_yili))  ? parseInt(data.yapim_yili)  : null,
            cikma_tipi:       data.cikma_tipi      ? String(data.cikma_tipi).trim()      : "",
            tasiyici_sistem:  tasiyici              ? String(tasiyici).trim()             : "",
            yapi_durumu:      data.yapi_durumu      ? String(data.yapi_durumu).trim()     : "",
            kullanim_amaci:   kullanim              ? String(kullanim).trim()             : "",
            notlar:           data.notlar           ? String(data.notlar).trim()          : ""
        };
    }

    /**
     * Tüm verileri kaydet (gruplar + ölçümler + aktif grup)
     * @param {Object} data - { groups, measurements, activeGroupId }
     * @param {Function} serializePoint - Cartesian3 → {lat,lon,height}
     * @returns {Promise<{sizeBytes: number}>}
     */
    function saveAll(data, serializePoint) {
        var record = {
            key: 'main',
            groups: data.groups.map(function (g) {
                return {
                    id: g.id,
                    name: g.name,
                    isOpen: g.isOpen,
                    checked: g.checked,
                    color: g.color || '#14B8A6',
                    isReferans: g.isReferans || false,
                    isClipBoxRoot: g.isClipBoxRoot || false
                };
            }),
            measurements: data.measurements.filter(function (m) { return !m.isImported; }).map(function (m) {
                return {
                    id: m.id,
                    groupId: m.groupId || 0,
                    name: m.name,
                    type: m.type,
                    resultText: m.resultText,
                    checked: m.checked,
                    points: m.points.map(serializePoint),
                    properties: normalizeFeatureProperties(m.properties)
                };
            }),
            clipBoxes: (data.clipBoxes || []).map(function (clip) {
                return {
                    id: clip.id,
                    groupId: clip.groupId || 0,
                    name: clip.name,
                    checked: clip.checked !== false,
                    center: clip.center ? serializePoint(clip.center) : null,
                    halfSize: {
                        x: clip.halfSize && clip.halfSize.x || 15,
                        y: clip.halfSize && clip.halfSize.y || 15,
                        z: clip.halfSize && clip.halfSize.z || 15
                    },
                    rotationDeg: clip.rotationDeg || 0
                };
            }),
            activeGroupId: data.activeGroupId
        };

        // Boyut tahmini (uyarı sistemi için)
        var estimatedSize = JSON.stringify(record).length;

        return _put(STORE_DATA, record).then(function () {
            return { sizeBytes: estimatedSize };
        });
    }

    /**
     * Tüm verileri yükle
     * @returns {Promise<{groups, measurements, activeGroupId} | null>}
     */
    function loadAll() {
        return openDB()
            .then(function () {
                return _migrateFromLocalStorage(); // İlk açılışta otomatik taşıma
            })
            .then(function () {
                return _get(STORE_DATA, 'main');
            })
            .then(function (record) {
                if (!record) return null;
                
                // Normalizasyon koruması: Her okunan veriyi şemaya uygun hale getir
                var safeMeasurements = (record.measurements || []).map(function(m) {
                    m.properties = normalizeFeatureProperties(m.properties);
                    return m;
                });
                
                return {
                    groups: record.groups || [],
                    measurements: safeMeasurements,
                    clipBoxes: record.clipBoxes || [],
                    activeGroupId: record.activeGroupId !== undefined ? record.activeGroupId : 0
                };
            });
    }

    /**
     * Depolama bilgisi
     * @returns {Promise<{sizeMB: string, pct: number, backend: string}>}
     */
    function getStorageInfo() {
        return _get(STORE_DATA, 'main').then(function (record) {
            var sizeBytes = record ? JSON.stringify(record).length : 0;
            return {
                sizeBytes: sizeBytes,
                sizeMB: (sizeBytes / (1024 * 1024)).toFixed(2),
                pct: 0, // IndexedDB'de % anlamsız — GB'larca alan var
                backend: 'IndexedDB'
            };
        });
    }

    /**
     * Tüm ölçüm verisini sil (gruplar + ölçümler)
     * @returns {Promise<void>}
     */
    function clearAll() {
        return _clearStore(STORE_DATA).then(function () {
            return _clearStore(STORE_IMPORTS);
        }).then(function () {
            // Eski localStorage'ı da temizle
            try { localStorage.removeItem(LS_KEY); } catch (e) { }
        });
    }

    // ─── UI Ayarları (localStorage — senkron erişim) ───

    function getSetting(key) {
        return localStorage.getItem(key);
    }

    function setSetting(key, value) {
        localStorage.setItem(key, value);
    }

    // ─── Import Verisi Kalıcılığı ───

    function _getAll(storeName) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(storeName, 'readonly');
                var req = tx.objectStore(storeName).getAll();
                req.onsuccess = function () { resolve(req.result || []); };
                req.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    function _delete(storeName, key) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction(storeName, 'readwrite');
                tx.objectStore(storeName).delete(key);
                tx.oncomplete = function () { resolve(); };
                tx.onerror = function (e) { reject(e.target.error); };
            });
        });
    }

    /**
     * Import verisini kaydet
     * @param {number} groupId - Import grubunun ID'si
     * @param {string} groupName - Grup adı
     * @param {string} groupColor - Grup rengi
     * @param {Array} features - [{name, type, resultText, coords:[{lat,lon,z}]}]
     * @param {number} zOffset - Uygulanan Z offset
     * @returns {Promise<void>}
     */
    function saveImport(groupId, groupName, groupColor, features, zOffset) {
        return _put(STORE_IMPORTS, {
            groupId: groupId,
            groupName: groupName,
            groupColor: groupColor,
            zOffset: zOffset,
            features: features,
            savedAt: Date.now()
        });
    }

    /**
     * Tüm kaydedilmiş import verilerini yükle
     * @returns {Promise<Array>}
     */
    function loadImports() {
        return _getAll(STORE_IMPORTS);
    }

    /**
     * Bir import grubunun verisini sil
     * @param {number} groupId
     * @returns {Promise<void>}
     */
    function deleteImport(groupId) {
        return _delete(STORE_IMPORTS, groupId);
    }

    // ─── Public Interface ───
    return {
        saveAll: saveAll,
        loadAll: loadAll,
        getStorageInfo: getStorageInfo,
        clearAll: clearAll,
        getSetting: getSetting,
        setSetting: setSetting,
        saveImport: saveImport,
        loadImports: loadImports,
        deleteImport: deleteImport,
        normalizeFeatureProperties: normalizeFeatureProperties, // Dışa aç
        // Dahili erişim (clear.html ve debug için)
        openDB: openDB,
        backend: 'IndexedDB'
    };
})();
