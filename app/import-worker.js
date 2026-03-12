// ═══════════════════════════════════════════════════════════════
// Import Worker — Off-Thread GeoJSON Parsing + CRS Dönüşümü
// Main thread'i BLOKLAMAZ — UI donması sıfır
// ═══════════════════════════════════════════════════════════════

// proj4 kütüphanesini worker'a yükle
var proj4Available = false;

function ensureTm30Def() {
    if (typeof proj4 === 'undefined') return false;
    if (!proj4.defs('EPSG:5254')) {
        proj4.defs("EPSG:5254", "+proj=tmerc +lat_0=0 +lon_0=30 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
    }
    return true;
}

function tryLoadProj4(url) {
    try {
        importScripts(url);
        if (ensureTm30Def()) {
            proj4Available = true;
            return true;
        }
    } catch (e) { }
    return false;
}

if (!tryLoadProj4('https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.15.0/proj4.js')) {
    tryLoadProj4('https://cdn.jsdelivr.net/npm/proj4@2.15.0/dist/proj4.js');
}

self.proj4Available = proj4Available;

function tm30ToWgs84(x, y) {
    if (proj4Available && typeof proj4 !== 'undefined') {
        var wgsCoords = proj4("EPSG:5254", "EPSG:4326", [x, y]);
        return [wgsCoords[1], wgsCoords[0]];
    }
    return [y, x];
}

function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
}

function isValidPosition(c) {
    return Array.isArray(c) && c.length >= 2 && isFiniteNumber(c[0]) && isFiniteNumber(c[1]);
}

// Akıllı İsimlendirme
function smartName(props, geomType, idx) {
    if (props.Name || props.name || props.NAME) return props.Name || props.name || props.NAME;
    if (props.adano && props.parselno) return props.adano + '/' + props.parselno;
    if (props.adano) return 'Ada ' + props.adano;
    if (props.fid !== undefined && props.fid !== null) return 'FID ' + props.fid;
    if (props.tapukimlikno) return 'Tapu ' + props.tapukimlikno;
    if (props.id !== undefined && props.id !== null) return geomType + ' ' + props.id;
    return geomType + ' ' + idx;
}

// Koordinat Dönüştürme
function convertCoord(c, effectiveCrs) {
    if (!isValidPosition(c)) return null;
    var lon, lat, z = c[2] || 0;
    if (effectiveCrs === '5254') { var wgs = tm30ToWgs84(c[0], c[1]); lat = wgs[0]; lon = wgs[1]; }
    else { lon = c[0]; lat = c[1]; }
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
    if (!isFiniteNumber(z)) z = 0;
    return { lon: lon, lat: lat, z: z };
}

// Kapanış Noktası Kaldırma
function removeClosingPoint(converted) {
    if (converted.length > 1) {
        var f2 = converted[0], l2 = converted[converted.length - 1];
        if (Math.abs(f2.lon - l2.lon) < 0.00001 && Math.abs(f2.lat - l2.lat) < 0.00001) converted.pop();
    }
    return converted;
}

self.onmessage = function (e) {
    var text = e.data.text;
    var userCrs = e.data.userCrs;

    // 1. JSON Parse
    var data;
    try {
        data = JSON.parse(text);
    } catch (err) {
        self.postMessage({ error: 'Geçersiz GeoJSON: ' + err.message });
        return;
    }

    // 2. CRS Algılama
    var fileCrs = null;
    if (data.crs && data.crs.properties && data.crs.properties.name) {
        var crsName = data.crs.properties.name.toString();
        if (crsName.indexOf('5254') !== -1 || crsName.indexOf('TM30') !== -1) fileCrs = '5254';
        else if (crsName.indexOf('4326') !== -1 || crsName.indexOf('WGS') !== -1) fileCrs = '4326';
        else if (crsName.indexOf('3857') !== -1) fileCrs = '4326';
    }
    var effectiveCrs = fileCrs || userCrs;
    var crsInfo = fileCrs ? ' (CRS otomatik algılandı: EPSG:' + fileCrs + ')' : '';

    if (effectiveCrs === '5254' && !proj4Available) {
        self.postMessage({ error: 'EPSG:5254 dönüşümü için proj4 yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.' });
        return;
    }

    // 3. Feature'ları İşle
    var feats = data.features || (data.type === 'Feature' ? [data] : []);
    if (feats.length === 0) {
        self.postMessage({ error: 'GeoJSON dosyasında öğe bulunamadı.' });
        return;
    }

    var parsedFeats = [];
    var globalIdx = 0;
    var skippedGeometryCount = 0;

    feats.forEach(function (f) {
        if (!f.geometry) return;
        var props = f.properties || {};

        function processGeometry(geom, propOverride) {
            if (!geom || !geom.type) {
                skippedGeometryCount++;
                return;
            }

            var type = geom.type;
            var coords = geom.coordinates;
            var pr = propOverride || props;

            if (type === 'Point') {
                var pointConverted = convertCoord(coords, effectiveCrs);
                if (pointConverted) {
                    parsedFeats.push({ name: smartName(pr, 'Nokta', ++globalIdx), type: 'coord', coords: [pointConverted], props: pr });
                } else {
                    skippedGeometryCount++;
                }
            } else if (type === 'LineString') {
                if (!Array.isArray(coords)) {
                    skippedGeometryCount++;
                    return;
                }
                var lineConverted = coords.map(function (c) { return convertCoord(c, effectiveCrs); }).filter(Boolean);
                if (lineConverted.length > 0) {
                    parsedFeats.push({ name: smartName(pr, 'Çizgi', ++globalIdx), type: 'line', coords: lineConverted, props: pr });
                } else {
                    skippedGeometryCount++;
                }
            } else if (type === 'Polygon') {
                if (!Array.isArray(coords) || !Array.isArray(coords[0])) {
                    skippedGeometryCount++;
                    return;
                }
                var polyConverted = removeClosingPoint(coords[0].map(function (c) { return convertCoord(c, effectiveCrs); }).filter(Boolean));
                if (polyConverted.length > 0) {
                    parsedFeats.push({ name: smartName(pr, 'Alan', ++globalIdx), type: 'polygon', coords: polyConverted, props: pr });
                } else {
                    skippedGeometryCount++;
                }
            } else if (type === 'MultiPoint') {
                if (!Array.isArray(coords)) {
                    skippedGeometryCount++;
                    return;
                }
                coords.forEach(function (pt) { processGeometry({ type: 'Point', coordinates: pt }, pr); });
            } else if (type === 'MultiLineString') {
                if (!Array.isArray(coords)) {
                    skippedGeometryCount++;
                    return;
                }
                coords.forEach(function (ls) { processGeometry({ type: 'LineString', coordinates: ls }, pr); });
            } else if (type === 'MultiPolygon') {
                if (!Array.isArray(coords)) {
                    skippedGeometryCount++;
                    return;
                }
                coords.forEach(function (poly) { processGeometry({ type: 'Polygon', coordinates: poly }, pr); });
            } else if (type === 'GeometryCollection') {
                if (!Array.isArray(geom.geometries)) {
                    skippedGeometryCount++;
                    return;
                }
                geom.geometries.forEach(function (g) { processGeometry(g, pr); });
            } else {
                skippedGeometryCount++;
            }
        }
        processGeometry(f.geometry);

        // Her 500 feature'da progress bildir
        if (parsedFeats.length > 0 && parsedFeats.length % 500 === 0) {
            self.postMessage({ progress: parsedFeats.length, total: feats.length });
        }
    });

    if (parsedFeats.length === 0) {
        self.postMessage({ error: 'GeoJSON içindeki geometri verileri geçersiz veya desteklenmiyor.' });
        return;
    }

    // 4. Sonucu gönder
    self.postMessage({
        features: parsedFeats,
        crsInfo: crsInfo,
        totalRaw: feats.length,
        skipped: skippedGeometryCount,
        proj4Available: proj4Available
    });
};
