(function () {
    function asFn(value, fallback) {
        return (typeof value === 'function') ? value : fallback;
    }

    function byValue(value) {
        return value === undefined || value === null ? '' : String(value);
    }

    function parseBool(value) {
        if (value === true || value === false) return value;
        var text = String(value || '').trim().toLowerCase();
        return text === '1' || text === 'true' || text === 'yes' || text === 'evet';
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseLocaleNumber(value) {
        var text = byValue(value).trim();
        if (!text) return NaN;
        text = text.replace(/\s+/g, '');

        var hasComma = text.indexOf(',') >= 0;
        var hasDot = text.indexOf('.') >= 0;

        if (hasComma && hasDot) {
            if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
                text = text.replace(/\./g, '').replace(',', '.');
            } else {
                text = text.replace(/,/g, '');
            }
        } else if (hasComma) {
            text = text.replace(',', '.');
        }

        return parseFloat(text);
    }

    function createFloorWorkHook(deps) {
        deps = deps || {};

        var getGroups = asFn(deps.getGroups, function () { return []; });
        var getMeasurements = asFn(deps.getMeasurements, function () { return []; });
        var getInfoPanelState = asFn(deps.getInfoPanelState, function () { return { measureId: null }; });
        var getActiveHighlightId = asFn(deps.getActiveHighlightId, function () { return null; });
        var setActiveHighlightId = asFn(deps.setActiveHighlightId, function () { });
        var isRefGroup = asFn(deps.isRefGroup, function () { return false; });
        var getInfoPanelKadastroProps = asFn(deps.getInfoPanelKadastroProps, function () { return { ada_no: '', parsel_no: '' }; });
        var clearBatchedSelectionOverlay = asFn(deps.clearBatchedSelectionOverlay, function () { });
        var requestRender = asFn(deps.requestRender, function () { });
        var renderList = asFn(deps.renderList, function () { });
        var syncNote = asFn(deps.syncInfoPanelNoteToResultBar, function () { });
        var deleteMeasurementById = asFn(deps.deleteMeasurementById, function () { });
        var startEditById = asFn(deps.startEditById, function () { });
        var saveChanges = asFn(deps.saveChanges, function () { });

        function getGroupsSafe() {
            var list = getGroups();
            return Array.isArray(list) ? list : [];
        }

        function getMeasurementsSafe() {
            var list = getMeasurements();
            return Array.isArray(list) ? list : [];
        }

        var state = {
            featureEnabled: true,
            enabled: false,
            activeFloorKey: '',
            baseFloorKey: '0',
            buildingKey: '',
            uiView: 'simple',
            controlsBound: false,
            previewMeasureId: null,
            saveSummaryPendingResolve: null,
            saveSummaryMeasureId: null
        };

        var _previewModalEl = null;
        var _saveSummaryModalEl = null;

        function readFeatureFlag() {
            if (typeof window === 'undefined') return true;
            if (window.CBS_CONFIG && window.CBS_CONFIG.floorWorkEnabled === false) return false;
            if (window.__FLOOR_WORK_ENABLED__ === false) return false;
            return true;
        }

        function readUIViewPreference() {
            if (typeof window === 'undefined') return 'simple';
            try {
                var raw = String(window.localStorage.getItem('cbsFloorWorkUIViewV1') || '').toLowerCase();
                return raw === 'advanced' ? 'advanced' : 'simple';
            } catch (_err) {
                return 'simple';
            }
        }

        function persistUIViewPreference() {
            if (typeof window === 'undefined') return;
            try {
                window.localStorage.setItem('cbsFloorWorkUIViewV1', state.uiView === 'advanced' ? 'advanced' : 'simple');
            } catch (_err) {
                // ignore storage errors
            }
        }

        function isFeatureEnabled() {
            return state.featureEnabled !== false;
        }

        function isModeEnabled() {
            return isFeatureEnabled() && state.enabled === true;
        }

        function normalizeFloorKey(value) {
            var text = value == null ? '' : String(value).trim();
            if (!text) return '';
            if (/^-?\d+$/.test(text)) return String(parseInt(text, 10));
            return text;
        }

        function parseFloorKeyNumber(floorKey) {
            var normalized = normalizeFloorKey(floorKey);
            if (!normalized || !/^-?\d+$/.test(normalized)) return null;
            var parsed = parseInt(normalized, 10);
            return isNaN(parsed) ? null : parsed;
        }

        function compareFloorKeys(a, b) {
            var aNum = parseFloorKeyNumber(a);
            var bNum = parseFloorKeyNumber(b);
            if (aNum !== null && bNum !== null) return aNum - bNum;
            if (aNum !== null) return -1;
            if (bNum !== null) return 1;
            return String(a).localeCompare(String(b), 'tr', { sensitivity: 'base' });
        }

        function normalizeBuildingKey(value) {
            var text = byValue(value).trim();
            if (!text) return '';
            text = text.replace(/\\/g, '/');
            text = text.replace(/\s*\/\s*/g, '/');
            text = text.replace(/\/{2,}/g, '/');
            return text;
        }

        function splitBuildingKey(buildingKey) {
            var normalized = normalizeBuildingKey(buildingKey);
            if (!normalized) return { ada: '', parsel: '' };
            var splitIndex = normalized.indexOf('/');
            if (splitIndex < 0) return { ada: normalized, parsel: '' };
            return {
                ada: normalized.slice(0, splitIndex).trim(),
                parsel: normalized.slice(splitIndex + 1).trim()
            };
        }

        function makeBuildingKey(adaNo, parselNo) {
            var ada = byValue(adaNo).trim();
            var parsel = byValue(parselNo).trim();
            if (!ada && !parsel) return '';
            return normalizeBuildingKey(ada + '/' + parsel);
        }

        function getBuildingKeyFromKadastroProps(props) {
            var kadastro = getInfoPanelKadastroProps(props || {});
            return makeBuildingKey(kadastro.ada_no, kadastro.parsel_no);
        }

        function getMeasurementBuildingKey(measurement) {
            if (!measurement || !measurement.properties) return '';
            var props = measurement.properties;
            var kadastroKey = getBuildingKeyFromKadastroProps(props);
            if (kadastroKey) return kadastroKey;
            var explicitKey = normalizeBuildingKey(props.fw_building_key);
            if (explicitKey) return explicitKey;
            return '';
        }

        function getMeasurementFloorKey(measurement) {
            if (!measurement || !measurement.properties) return '';
            var props = measurement.properties;
            var explicitFloor = normalizeFloorKey(props.fw_floor_key);
            if (explicitFloor) return explicitFloor;
            var katAdi = props.kat_adi != null ? String(props.kat_adi).trim() : '';
            if (katAdi) return normalizeFloorKey(katAdi);
            if (props.kat == null) return '';
            return normalizeFloorKey(props.kat);
        }

        function isMeasurementInPool(measurement) {
            if (!measurement || !measurement.properties) return false;
            if (parseBool(measurement.properties.fw_pool)) return true;
            var buildingKey = getMeasurementBuildingKey(measurement);
            var floorKey = getMeasurementFloorKey(measurement);
            return !(buildingKey && floorKey);
        }

        function isFloorWorkManagedMeasurement(measurement) {
            if (!measurement || measurement.type !== 'polygon') return false;
            if (measurement.isImported) return false;
            var groups = getGroupsSafe();
            var grp = groups.find(function (g) { return g.id === measurement.groupId; });
            if (!grp || isRefGroup(grp)) return false;
            return true;
        }

        function isMeasurementVisibleInMode(measurement) {
            if (!isFeatureEnabled()) return true;
            if (!state.enabled) return true;
            if (!isFloorWorkManagedMeasurement(measurement)) return false;
            if (isMeasurementInPool(measurement)) return false;
            if (!state.activeFloorKey) return false;

            var measurementFloorKey = getMeasurementFloorKey(measurement);
            if (measurementFloorKey !== state.activeFloorKey) return false;

            if (state.buildingKey) {
                var measurementBuildingKey = getMeasurementBuildingKey(measurement);
                if (measurementBuildingKey !== state.buildingKey) return false;
            }

            return true;
        }

        function parseMeasurementArea2D(measurement) {
            if (!measurement || measurement.type !== 'polygon') return 0;
            var text = measurement.resultText || '';
            var match2D = text.match(/2D:\s*([\d.,]+)\s*m(?:\u00B2|\^2)/i);
            if (match2D) {
                var parsed2D = parseLocaleNumber(match2D[1]);
                return isFinite(parsed2D) ? parsed2D : 0;
            }
            var matchAny = text.match(/([\d.,]+)\s*m(?:\u00B2|\^2)/i);
            if (!matchAny) return 0;
            var parsedAny = parseLocaleNumber(matchAny[1]);
            return isFinite(parsedAny) ? parsedAny : 0;
        }

        function collectKnownFloorKeys() {
            var set = Object.create(null);
            var list = [];

            getMeasurementsSafe().forEach(function (m) {
                if (!isFloorWorkManagedMeasurement(m)) return;
                var key = getMeasurementFloorKey(m);
                if (!key || set[key]) return;
                set[key] = true;
                list.push(key);
            });

            if (state.baseFloorKey && !set[state.baseFloorKey]) {
                set[state.baseFloorKey] = true;
                list.push(state.baseFloorKey);
            }
            if (state.activeFloorKey && !set[state.activeFloorKey]) {
                set[state.activeFloorKey] = true;
                list.push(state.activeFloorKey);
            }

            list.sort(compareFloorKeys);
            return list;
        }

        function collectKnownBuildingKeys() {
            var set = Object.create(null);
            var list = [];
            getMeasurementsSafe().forEach(function (m) {
                if (!isFloorWorkManagedMeasurement(m)) return;
                var key = getMeasurementBuildingKey(m);
                if (!key || set[key]) return;
                set[key] = true;
                list.push(key);
            });
            if (state.buildingKey && !set[state.buildingKey]) list.push(state.buildingKey);
            list.sort(function (a, b) {
                return String(a).localeCompare(String(b), 'tr', { sensitivity: 'base' });
            });
            return list;
        }

        function collectPoolMeasurements(limit) {
            var max = Number(limit);
            if (!isFinite(max) || max <= 0) max = 9999;
            var pool = [];
            getMeasurementsSafe().forEach(function (m) {
                if (pool.length >= max) return;
                if (!isFloorWorkManagedMeasurement(m)) return;
                if (!isMeasurementInPool(m)) return;
                pool.push(m);
            });
            return pool;
        }

        function ensureFloorDatalist() {
            var list = document.getElementById('floorKeySuggestions');
            if (!list) {
                list = document.createElement('datalist');
                list.id = 'floorKeySuggestions';
                if (document.body) document.body.appendChild(list);
            }
            return list;
        }

        function ensureBuildingDatalist() {
            var list = document.getElementById('buildingKeySuggestions');
            if (!list) {
                list = document.createElement('datalist');
                list.id = 'buildingKeySuggestions';
                if (document.body) document.body.appendChild(list);
            }
            return list;
        }

        function syncInputListAttrs() {
            ['infoKat', 'infoWorkKat', 'infoBaseKat'].forEach(function (id) {
                var input = document.getElementById(id);
                if (!input) return;
                input.setAttribute('list', 'floorKeySuggestions');
            });
            var buildingInput = document.getElementById('infoWorkBuilding');
            if (buildingInput) buildingInput.setAttribute('list', 'buildingKeySuggestions');
        }

        function updateKnownFloorsUi() {
            var knownEl = document.getElementById('infoFloorKnownList');
            if (!knownEl) return;
            var floors = collectKnownFloorKeys();
            knownEl.textContent = floors.length ? ('Kayitli katlar: ' + floors.join(', ')) : 'Kayitli katlar: -';
        }

        function updateKnownBuildingsUi() {
            var knownEl = document.getElementById('infoFloorKnownBuildings');
            if (!knownEl) return;
            var buildings = collectKnownBuildingKeys();
            knownEl.textContent = buildings.length ? ('Kayitli binalar: ' + buildings.join(', ')) : 'Kayitli binalar: -';
        }

        function syncFloorDatalist() {
            if (typeof document === 'undefined') return;
            syncInputListAttrs();
            var list = ensureFloorDatalist();
            if (!list) return;
            var floors = collectKnownFloorKeys();
            list.innerHTML = floors.map(function (item) {
                return '<option value="' + escapeHtml(item) + '"></option>';
            }).join('');
            updateKnownFloorsUi();
        }

        function syncBuildingDatalist() {
            if (typeof document === 'undefined') return;
            syncInputListAttrs();
            var list = ensureBuildingDatalist();
            if (!list) return;
            var buildings = collectKnownBuildingKeys();
            list.innerHTML = buildings.map(function (item) {
                return '<option value="' + escapeHtml(item) + '"></option>';
            }).join('');
            updateKnownBuildingsUi();
        }

        function syncAllDatalists() {
            syncFloorDatalist();
            syncBuildingDatalist();
        }

        function computeBuildingSummary(targetBuildingKey) {
            var buildingKey = normalizeBuildingKey(targetBuildingKey);
            if (!buildingKey) return null;

            var byFloor = Object.create(null);
            var totalArea = 0;

            getMeasurementsSafe().forEach(function (m) {
                if (!isFloorWorkManagedMeasurement(m)) return;
                if (isMeasurementInPool(m)) return;
                if (getMeasurementBuildingKey(m) !== buildingKey) return;

                var floorKey = getMeasurementFloorKey(m);
                if (!floorKey) return;

                var area2D = parseMeasurementArea2D(m);
                if (!isFinite(area2D) || area2D <= 0) return;

                byFloor[floorKey] = (byFloor[floorKey] || 0) + area2D;
                totalArea += area2D;
            });

            var floors = Object.keys(byFloor).sort(compareFloorKeys);
            return {
                buildingKey: buildingKey,
                floors: floors,
                byFloor: byFloor,
                totalArea: totalArea
            };
        }

        function computeSummary() {
            if (!state.enabled || !state.activeFloorKey || !state.buildingKey) return null;

            var buildingSummary = computeBuildingSummary(state.buildingKey);
            if (!buildingSummary) return null;

            var baseArea = buildingSummary.byFloor[state.baseFloorKey] || 0;
            var activeArea = buildingSummary.byFloor[state.activeFloorKey] || 0;
            var extrasArea = state.activeFloorKey === state.baseFloorKey ? 0 : activeArea;
            var floorCount = buildingSummary.floors.length;
            var poolCount = collectPoolMeasurements(100000).length;

            return {
                buildingKey: state.buildingKey,
                baseArea: baseArea,
                activeArea: activeArea,
                extrasArea: extrasArea,
                floorCount: floorCount,
                buildingTotalArea: buildingSummary.totalArea,
                totalArea: baseArea + extrasArea,
                poolCount: poolCount,
                floors: buildingSummary.floors,
                byFloor: buildingSummary.byFloor
            };
        }

        function syncFeatureUiState() {
            var panelEl = document.getElementById('floorWorkPanel');
            if (!panelEl) return;
            panelEl.style.display = isFeatureEnabled() ? '' : 'none';
        }

        function syncUIView() {
            var advancedSection = document.getElementById('floorWorkAdvancedSection');
            var simpleBtn = document.getElementById('btnFloorViewSimple');
            var advancedBtn = document.getElementById('btnFloorViewAdvanced');

            if (advancedSection) {
                if (state.uiView === 'advanced') advancedSection.classList.remove('hidden');
                else advancedSection.classList.add('hidden');
            }

            if (simpleBtn) {
                var simpleActive = state.uiView !== 'advanced';
                simpleBtn.style.borderColor = simpleActive ? 'rgba(6,182,212,0.55)' : 'rgba(71,85,105,0.7)';
                simpleBtn.style.background = simpleActive ? 'rgba(6,182,212,0.16)' : 'rgba(15,23,42,0.8)';
                simpleBtn.style.color = simpleActive ? '#a5f3fc' : '#cbd5e1';
            }

            if (advancedBtn) {
                var advancedActive = state.uiView === 'advanced';
                advancedBtn.style.borderColor = advancedActive ? 'rgba(6,182,212,0.55)' : 'rgba(71,85,105,0.7)';
                advancedBtn.style.background = advancedActive ? 'rgba(6,182,212,0.16)' : 'rgba(15,23,42,0.8)';
                advancedBtn.style.color = advancedActive ? '#a5f3fc' : '#cbd5e1';
            }
        }

        function setUIView(nextView, silent) {
            state.uiView = nextView === 'advanced' ? 'advanced' : 'simple';
            persistUIViewPreference();
            syncUIView();
            updateSummaryUi();
            if (!silent) {
                syncNote(state.uiView === 'advanced'
                    ? 'Gelismis gorunum acildi. Havuz ve iliski yonetimi gorunur.'
                    : 'Basit akis acildi. Sadece temel adimlar gorunur.', 'info');
            }
        }

        function updateGuideUi() {
            var guideEl = document.getElementById('infoFloorGuide');
            if (!guideEl) return;

            if (!isFeatureEnabled()) {
                guideEl.textContent = 'Kat odak ozelligi kapali.';
                return;
            }

            var hasBuilding = !!normalizeBuildingKey(getBuildingKeyFromInputs());
            var activeFloor = normalizeFloorKey((document.getElementById('infoWorkKat') || {}).value || state.activeFloorKey);
            var scoped = getScopedMeasurement();

            if (!hasBuilding) {
                guideEl.textContent = '1) Ada/Parsel girin veya Bina Anahtari alanini doldurun.';
                return;
            }
            if (!activeFloor) {
                guideEl.textContent = '2) Islem Katini yazin (ornek: 0 veya 1) ve Kati Goster deyin.';
                return;
            }
            if (!state.enabled) {
                guideEl.textContent = '2) Kati Goster ile bu bina/kat icin sade cizim modunu aktif edin.';
                return;
            }
            if (!scoped) {
                guideEl.textContent = '3) Poligon cizin veya listeden bir olcum secin. Sonra Seçilini Aktif Kata Bagla kullanin.';
                return;
            }
            guideEl.textContent = '4) Kaydet ile kat/bina ozetini kontrol ederek devam edin. Gerekirse Gelismis sekmesinde havuz yonetimi yapin.';
        }

        function updatePoolUi() {
            var poolSummaryEl = document.getElementById('infoFloorPoolSummary');
            var poolSelectEl = document.getElementById('infoFloorPoolSelect');
            var bindPoolBtn = document.getElementById('btnFloorBindPoolSelected');

            var poolItems = collectPoolMeasurements(300);
            if (poolSummaryEl) {
                poolSummaryEl.textContent = 'Parca havuzu: ' + poolItems.length + (poolItems.length ? ' (bina/kat iliskisi eksik veya havuza alinmis)' : '');
            }

            if (poolSelectEl) {
                poolSelectEl.innerHTML = '';
                if (!poolItems.length) {
                    var emptyOpt = document.createElement('option');
                    emptyOpt.value = '';
                    emptyOpt.textContent = 'Havuz bos';
                    poolSelectEl.appendChild(emptyOpt);
                } else {
                    poolItems.forEach(function (m) {
                        var floorKey = getMeasurementFloorKey(m) || '-';
                        var buildingKey = getMeasurementBuildingKey(m) || '-';
                        var label = (m.name || ('No ' + m.id)) + ' | Kat ' + floorKey + ' | Bina ' + buildingKey;
                        var opt = document.createElement('option');
                        opt.value = String(m.id);
                        opt.textContent = label;
                        poolSelectEl.appendChild(opt);
                    });
                }
            }

            if (bindPoolBtn) bindPoolBtn.disabled = !poolItems.length;
        }

        function updateSummaryUi() {
            syncFeatureUiState();
            syncUIView();
            syncAllDatalists();
            updatePoolUi();
            updateGuideUi();

            var summaryEl = document.getElementById('infoFloorSummary');
            var badgeEl = document.getElementById('infoFloorModeBadge');
            if (!summaryEl || !badgeEl) return;

            if (!isFeatureEnabled()) {
                summaryEl.textContent = 'Kat odak modu devre disi.';
                badgeEl.textContent = 'Kapali';
                badgeEl.style.borderColor = '';
                badgeEl.style.background = '';
                badgeEl.style.color = '';
                return;
            }

            if (!state.enabled || !state.activeFloorKey || !state.buildingKey) {
                summaryEl.textContent = 'Kat odak modu kapali. Islem kati ve bina anahtari secildiginde ozet gorunur.';
                badgeEl.textContent = 'Pasif';
                badgeEl.style.borderColor = '';
                badgeEl.style.background = '';
                badgeEl.style.color = '';
                return;
            }

            var summary = computeSummary();
            if (!summary) {
                summaryEl.textContent = 'Kat ' + state.activeFloorKey + ' | Bina: ' + state.buildingKey + ' icin ozet hesaplanamadi.';
            } else {
                summaryEl.textContent =
                    'Bina ' + summary.buildingKey +
                    ' | Kat ' + state.activeFloorKey +
                    ' | Zemin (' + state.baseFloorKey + '): ' + summary.baseArea.toFixed(2) + ' m2' +
                    ' + Ek: ' + summary.extrasArea.toFixed(2) + ' m2' +
                    ' = Kat Toplam: ' + summary.totalArea.toFixed(2) + ' m2' +
                    ' | Bina Toplam: ' + summary.buildingTotalArea.toFixed(2) + ' m2' +
                    ' | Kat Sayisi: ' + summary.floorCount +
                    ' | Havuz: ' + summary.poolCount;
            }

            badgeEl.textContent = 'Aktif';
            badgeEl.style.borderColor = 'rgba(6,182,212,0.55)';
            badgeEl.style.background = 'rgba(6,182,212,0.15)';
            badgeEl.style.color = '#67e8f9';
        }

        function resetModeState(baseFloorKey) {
            state.enabled = false;
            state.activeFloorKey = '';
            state.baseFloorKey = normalizeFloorKey(baseFloorKey) || state.baseFloorKey || '0';
            state.buildingKey = '';
        }

        function applyVisibility(requestRenderFlag) {
            var measurements = getMeasurementsSafe();
            var groups = getGroupsSafe();

            if (state.enabled && getActiveHighlightId() !== null) {
                var activeId = getActiveHighlightId();
                var activeMeasurement = measurements.find(function (m) { return m.id === activeId; });
                if (activeMeasurement && !isMeasurementVisibleInMode(activeMeasurement)) {
                    setActiveHighlightId(null);
                    clearBatchedSelectionOverlay();
                }
            }

            measurements.forEach(function (m) {
                if (!m || m.isBatched || !Array.isArray(m.entities)) return;

                var grp = groups.find(function (g) { return g.id === m.groupId; });
                var groupVisible = !grp || grp.checked !== false;
                var itemVisible = m.checked !== false;
                var floorVisible = isMeasurementVisibleInMode(m);
                var visible = groupVisible && itemVisible && floorVisible;

                m.entities.forEach(function (ent) {
                    if (!ent) return;
                    ent.show = visible;
                    if (ent.label) ent.label.show = visible;
                });
            });

            updateSummaryUi();

            if (requestRenderFlag) requestRender();
        }

        function normalizeMeasurementLinkProperties(measurement) {
            if (!measurement) return;
            if (!measurement.properties) measurement.properties = {};
            var props = measurement.properties;
            if (parseBool(props.fw_pool)) return;

            var buildingKey = getBuildingKeyFromKadastroProps(props) || getMeasurementBuildingKey(measurement);
            var floorKey = getMeasurementFloorKey(measurement);

            if (buildingKey) props.fw_building_key = buildingKey;
            if (floorKey) {
                props.fw_floor_key = floorKey;
                props.kat_adi = floorKey;
                props.kat = parseFloorKeyNumber(floorKey);
            }
            props.fw_pool = false;
        }

        function applyLinkToMeasurement(measurement, buildingKey, floorKey) {
            if (!measurement) return false;
            if (!measurement.properties) measurement.properties = {};

            var normalizedBuilding = normalizeBuildingKey(buildingKey);
            var normalizedFloor = normalizeFloorKey(floorKey);
            if (!normalizedBuilding || !normalizedFloor) return false;

            var props = measurement.properties;
            var parts = splitBuildingKey(normalizedBuilding);

            props.fw_pool = false;
            props.fw_building_key = normalizedBuilding;
            props.fw_floor_key = normalizedFloor;
            props.kat_adi = normalizedFloor;
            props.kat = parseFloorKeyNumber(normalizedFloor);
            if (parts.ada) props.ada_no = parts.ada;
            if (parts.parsel) props.parsel_no = parts.parsel;

            return true;
        }

        function moveMeasurementToPool(measurement) {
            if (!measurement) return false;
            if (!measurement.properties) measurement.properties = {};
            measurement.properties.fw_pool = true;
            return true;
        }

        function getScopedMeasurement() {
            var scoped = null;
            var infoPanelState = getInfoPanelState();
            var measureId = infoPanelState && infoPanelState.measureId != null ? infoPanelState.measureId : null;

            if (measureId != null) {
                scoped = getMeasurementsSafe().find(function (m) { return m.id === measureId; }) || null;
            }

            if (!scoped && getActiveHighlightId() !== null) {
                var activeId = getActiveHighlightId();
                scoped = getMeasurementsSafe().find(function (m) { return m.id === activeId; }) || null;
            }

            return scoped;
        }

        function getBuildingKeyFromInputs() {
            var buildingInput = document.getElementById('infoWorkBuilding');
            var inputValue = buildingInput ? normalizeBuildingKey(buildingInput.value) : '';
            if (inputValue) return inputValue;

            var adaInput = document.getElementById('infoAda');
            var parselInput = document.getElementById('infoParsel');
            var kadastroValue = makeBuildingKey(adaInput ? adaInput.value : '', parselInput ? parselInput.value : '');
            if (kadastroValue) return kadastroValue;

            var scopedMeasurement = getScopedMeasurement();
            var scopedKey = scopedMeasurement ? getMeasurementBuildingKey(scopedMeasurement) : '';
            if (scopedKey) return scopedKey;
            return state.buildingKey;
        }

        function persistFloorWorkChanges(noteText, tone) {
            saveChanges();
            renderList();
            applyVisibility(true);
            if (noteText) syncNote(noteText, tone || 'info');
        }

        function buildNewPolygonProperties() {
            var props = {};
            if (!isFeatureEnabled()) return props;
            if (!state.enabled || !state.activeFloorKey) return props;

            props.kat_adi = state.activeFloorKey;
            props.kat = parseFloorKeyNumber(state.activeFloorKey);
            props.fw_pool = false;
            props.fw_floor_key = state.activeFloorKey;

            if (state.buildingKey) {
                var parts = splitBuildingKey(state.buildingKey);
                props.fw_building_key = state.buildingKey;
                if (parts.ada) props.ada_no = parts.ada;
                if (parts.parsel) props.parsel_no = parts.parsel;
            }

            return props;
        }

        function closePreviewModal() {
            if (!_previewModalEl) return;
            _previewModalEl.style.display = 'none';
            state.previewMeasureId = null;
        }

        function ensurePreviewModal() {
            if (_previewModalEl) return _previewModalEl;
            if (typeof document === 'undefined' || !document.body) return null;

            var modal = document.createElement('div');
            modal.id = 'floorWorkPreviewModal';
            modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:rgba(2,6,23,0.58);align-items:center;justify-content:center;padding:12px;';
            modal.innerHTML =
                '<div style="width:min(420px,95vw);background:#0f172a;border:1px solid rgba(148,163,184,0.24);border-radius:10px;box-shadow:0 24px 64px rgba(2,6,23,0.52);color:#e2e8f0;overflow:hidden;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(51,65,85,0.6);">' +
                '<div id="floorPreviewTitle" style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Kat Onizleme</div>' +
                '<button id="btnFloorPreviewClose" type="button" style="border:1px solid rgba(100,116,139,0.7);background:rgba(15,23,42,0.8);color:#cbd5e1;border-radius:6px;width:24px;height:24px;cursor:pointer;">x</button>' +
                '</div>' +
                '<div style="padding:12px;display:flex;flex-direction:column;gap:8px;">' +
                '<div id="floorPreviewMeta" style="font-size:11px;color:#cbd5e1;line-height:1.45;"></div>' +
                '<div id="floorPreviewArea" style="font-size:11px;color:#93c5fd;background:rgba(15,23,42,0.75);border:1px solid rgba(51,65,85,0.6);padding:8px;border-radius:6px;"></div>' +
                '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;">' +
                '<button id="btnFloorPreviewEdit2D" type="button" style="height:30px;border:1px solid rgba(6,182,212,0.5);background:rgba(6,182,212,0.15);color:#a5f3fc;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;">2D Duzenle</button>' +
                '<button id="btnFloorPreviewKeep" type="button" style="height:30px;border:1px solid rgba(34,197,94,0.55);background:rgba(34,197,94,0.14);color:#86efac;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;">Kaydet</button>' +
                '<button id="btnFloorPreviewDiscard" type="button" style="height:30px;border:1px solid rgba(239,68,68,0.55);background:rgba(239,68,68,0.12);color:#fca5a5;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;">Iptal/Sil</button>' +
                '</div>' +
                '</div>' +
                '</div>';

            modal.addEventListener('click', function (e) {
                if (e.target === modal) closePreviewModal();
            });

            document.body.appendChild(modal);
            _previewModalEl = modal;

            var closeBtn = document.getElementById('btnFloorPreviewClose');
            if (closeBtn) closeBtn.addEventListener('click', closePreviewModal);

            var keepBtn = document.getElementById('btnFloorPreviewKeep');
            if (keepBtn) {
                keepBtn.addEventListener('click', function () {
                    closePreviewModal();
                    syncNote('Kat onizlemesi kaydedildi.', 'ok');
                });
            }

            var editBtn = document.getElementById('btnFloorPreviewEdit2D');
            if (editBtn) {
                editBtn.addEventListener('click', function () {
                    var id = state.previewMeasureId;
                    closePreviewModal();
                    if (id != null) {
                        startEditById(id);
                        syncNote('2D duzenleme modu acildi.', 'info');
                    }
                });
            }

            var discardBtn = document.getElementById('btnFloorPreviewDiscard');
            if (discardBtn) {
                discardBtn.addEventListener('click', function () {
                    var id = state.previewMeasureId;
                    closePreviewModal();
                    if (id != null) {
                        deleteMeasurementById(id);
                        syncNote('Onizleme olcumu silindi.', 'warn');
                    }
                });
            }

            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape') return;
                if (_previewModalEl && _previewModalEl.style.display !== 'none') {
                    closePreviewModal();
                }
            });

            return _previewModalEl;
        }

        function openPolygonPreview(measurement) {
            if (!measurement || measurement.type !== 'polygon') return;
            var modal = ensurePreviewModal();
            if (!modal) return;

            state.previewMeasureId = measurement.id;

            var titleEl = document.getElementById('floorPreviewTitle');
            var metaEl = document.getElementById('floorPreviewMeta');
            var areaEl = document.getElementById('floorPreviewArea');

            var floorKey = getMeasurementFloorKey(measurement) || state.activeFloorKey || '-';
            var baseKey = state.baseFloorKey || '0';
            var buildingKey = getMeasurementBuildingKey(measurement) || state.buildingKey || '-';
            var area2D = parseMeasurementArea2D(measurement);
            var summary = computeSummary();

            if (titleEl) {
                titleEl.textContent = 'Kat Onizleme - ' + (measurement.name || ('No ' + measurement.id));
            }
            if (metaEl) {
                metaEl.textContent = 'Kat: ' + floorKey + ' | Zemin: ' + baseKey + ' | Bina: ' + buildingKey;
            }
            if (areaEl) {
                var text = 'Yeni alan (2D): ' + area2D.toFixed(2) + ' m2';
                if (summary) {
                    text += ' | Kat Toplam: ' + summary.totalArea.toFixed(2) + ' m2';
                    text += ' | Bina Toplam: ' + summary.buildingTotalArea.toFixed(2) + ' m2';
                }
                areaEl.textContent = text;
            }

            modal.style.display = 'flex';
        }

        function closeSaveSummaryModal(result) {
            if (_saveSummaryModalEl) _saveSummaryModalEl.style.display = 'none';
            if (typeof state.saveSummaryPendingResolve === 'function') {
                var resolve = state.saveSummaryPendingResolve;
                state.saveSummaryPendingResolve = null;
                state.saveSummaryMeasureId = null;
                resolve(result !== false);
            }
        }

        function ensureSaveSummaryModal() {
            if (_saveSummaryModalEl) return _saveSummaryModalEl;
            if (typeof document === 'undefined' || !document.body) return null;

            var modal = document.createElement('div');
            modal.id = 'floorWorkSaveSummaryModal';
            modal.style.cssText = 'display:none;position:fixed;inset:0;z-index:10060;background:rgba(2,6,23,0.7);align-items:center;justify-content:center;padding:12px;';
            modal.innerHTML =
                '<div style="width:min(560px,95vw);max-height:85vh;overflow:auto;background:#0f172a;border:1px solid rgba(148,163,184,0.26);border-radius:10px;box-shadow:0 26px 70px rgba(2,6,23,0.62);color:#e2e8f0;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(51,65,85,0.65);">' +
                '<div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Kaydet Oncesi Kat/Bina Ozeti</div>' +
                '<button id="btnFloorSaveSummaryClose" type="button" style="border:1px solid rgba(100,116,139,0.7);background:rgba(15,23,42,0.8);color:#cbd5e1;border-radius:6px;width:24px;height:24px;cursor:pointer;">x</button>' +
                '</div>' +
                '<div id="floorSaveSummaryBody" style="padding:12px;display:flex;flex-direction:column;gap:8px;font-size:11px;line-height:1.5;"></div>' +
                '<div style="display:flex;gap:8px;justify-content:flex-end;padding:10px 12px;border-top:1px solid rgba(51,65,85,0.65);">' +
                '<button id="btnFloorSaveSummaryCancel" type="button" style="height:30px;border:1px solid rgba(100,116,139,0.7);background:rgba(15,23,42,0.8);color:#cbd5e1;border-radius:6px;padding:0 12px;cursor:pointer;font-size:11px;font-weight:700;">Iptal</button>' +
                '<button id="btnFloorSaveSummaryApprove" type="button" style="height:30px;border:1px solid rgba(34,197,94,0.6);background:rgba(34,197,94,0.17);color:#86efac;border-radius:6px;padding:0 12px;cursor:pointer;font-size:11px;font-weight:700;">Kaydet ve Devam Et</button>' +
                '</div>' +
                '</div>';

            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeSaveSummaryModal(false);
            });

            document.body.appendChild(modal);
            _saveSummaryModalEl = modal;

            var closeBtn = document.getElementById('btnFloorSaveSummaryClose');
            if (closeBtn) closeBtn.addEventListener('click', function () { closeSaveSummaryModal(false); });

            var cancelBtn = document.getElementById('btnFloorSaveSummaryCancel');
            if (cancelBtn) cancelBtn.addEventListener('click', function () { closeSaveSummaryModal(false); });

            var approveBtn = document.getElementById('btnFloorSaveSummaryApprove');
            if (approveBtn) approveBtn.addEventListener('click', function () { closeSaveSummaryModal(true); });

            document.addEventListener('keydown', function (e) {
                if (e.key !== 'Escape') return;
                if (_saveSummaryModalEl && _saveSummaryModalEl.style.display !== 'none') {
                    closeSaveSummaryModal(false);
                }
            });

            return _saveSummaryModalEl;
        }

        function buildAggregateMapByBuilding(overridesById) {
            var map = Object.create(null);

            getMeasurementsSafe().forEach(function (measurement) {
                if (!isFloorWorkManagedMeasurement(measurement)) return;

                var props = measurement.properties || {};
                if (overridesById && Object.prototype.hasOwnProperty.call(overridesById, measurement.id)) {
                    props = overridesById[measurement.id] || {};
                }

                var pseudoMeasurement = { properties: props, type: measurement.type };
                if (parseBool(props.fw_pool) || isMeasurementInPool(pseudoMeasurement)) return;

                var buildingKey = getMeasurementBuildingKey(pseudoMeasurement);
                var floorKey = getMeasurementFloorKey(pseudoMeasurement);
                if (!buildingKey || !floorKey) return;

                var area2D = parseMeasurementArea2D(measurement);
                if (!isFinite(area2D) || area2D <= 0) return;

                if (!map[buildingKey]) {
                    map[buildingKey] = { total: 0, floors: Object.create(null) };
                }

                map[buildingKey].total += area2D;
                map[buildingKey].floors[floorKey] = (map[buildingKey].floors[floorKey] || 0) + area2D;
            });

            return map;
        }

        function buildSaveSummaryPreview(measurement, previousProperties) {
            if (!measurement || measurement.type !== 'polygon') return null;
            if (!isFloorWorkManagedMeasurement(measurement)) return null;

            var beforeProps = previousProperties || (measurement.properties || {});
            var afterProps = measurement.properties || {};

            var beforeOverrides = {};
            beforeOverrides[measurement.id] = beforeProps;
            var beforeMap = buildAggregateMapByBuilding(beforeOverrides);

            var afterOverrides = {};
            afterOverrides[measurement.id] = afterProps;
            var afterMap = buildAggregateMapByBuilding(afterOverrides);

            var pseudoAfter = { properties: afterProps, type: measurement.type };
            if (parseBool(afterProps.fw_pool) || isMeasurementInPool(pseudoAfter)) return null;

            var buildingKey = getMeasurementBuildingKey(pseudoAfter);
            var floorKey = getMeasurementFloorKey(pseudoAfter);
            if (!buildingKey || !floorKey) return null;

            var beforeBuilding = beforeMap[buildingKey] || { total: 0, floors: Object.create(null) };
            var afterBuilding = afterMap[buildingKey] || { total: 0, floors: Object.create(null) };

            var allFloors = Object.keys(afterBuilding.floors || {}).concat(Object.keys(beforeBuilding.floors || {}));
            var floorSet = Object.create(null);
            var floorRows = [];

            allFloors.forEach(function (floor) {
                if (floorSet[floor]) return;
                floorSet[floor] = true;
                var beforeArea = beforeBuilding.floors[floor] || 0;
                var afterArea = afterBuilding.floors[floor] || 0;
                floorRows.push({
                    floor: floor,
                    beforeArea: beforeArea,
                    afterArea: afterArea,
                    delta: afterArea - beforeArea
                });
            });

            floorRows.sort(function (a, b) { return compareFloorKeys(a.floor, b.floor); });

            var beforeFloorArea = beforeBuilding.floors[floorKey] || 0;
            var afterFloorArea = afterBuilding.floors[floorKey] || 0;
            var beforeTotal = beforeBuilding.total || 0;
            var afterTotal = afterBuilding.total || 0;

            return {
                measurementId: measurement.id,
                measurementName: measurement.name || ('No ' + measurement.id),
                buildingKey: buildingKey,
                floorKey: floorKey,
                beforeFloorArea: beforeFloorArea,
                afterFloorArea: afterFloorArea,
                floorDelta: afterFloorArea - beforeFloorArea,
                beforeTotal: beforeTotal,
                afterTotal: afterTotal,
                totalDelta: afterTotal - beforeTotal,
                floorRows: floorRows
            };
        }

        function formatDelta(value) {
            var num = Number(value) || 0;
            if (Math.abs(num) < 0.00001) return '0.00';
            return (num > 0 ? '+' : '') + num.toFixed(2);
        }

        function hasMeaningfulSaveDelta(preview) {
            if (!preview || !Array.isArray(preview.floorRows)) return false;
            for (var i = 0; i < preview.floorRows.length; i++) {
                if (Math.abs(Number(preview.floorRows[i].delta) || 0) >= 0.00001) return true;
            }
            return false;
        }

        function renderSaveSummaryPreview(preview) {
            var body = document.getElementById('floorSaveSummaryBody');
            if (!body || !preview) return;

            var rowsHtml = preview.floorRows.map(function (row) {
                var isTarget = row.floor === preview.floorKey;
                return '<tr style="' + (isTarget ? 'background:rgba(14,165,233,0.12);' : '') + '">' +
                    '<td style="padding:4px 6px;border-bottom:1px solid rgba(51,65,85,0.55);">' + escapeHtml(row.floor) + '</td>' +
                    '<td style="padding:4px 6px;text-align:right;border-bottom:1px solid rgba(51,65,85,0.55);">' + row.beforeArea.toFixed(2) + '</td>' +
                    '<td style="padding:4px 6px;text-align:right;border-bottom:1px solid rgba(51,65,85,0.55);">' + row.afterArea.toFixed(2) + '</td>' +
                    '<td style="padding:4px 6px;text-align:right;border-bottom:1px solid rgba(51,65,85,0.55);">' + formatDelta(row.delta) + '</td>' +
                    '</tr>';
            }).join('');

            body.innerHTML =
                '<div style="font-size:12px;font-weight:700;color:#e2e8f0;">Olcum: ' + escapeHtml(preview.measurementName) + '</div>' +
                '<div style="color:#cbd5e1;">Bina: <b>' + escapeHtml(preview.buildingKey) + '</b> | Kat: <b>' + escapeHtml(preview.floorKey) + '</b></div>' +
                '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;">' +
                '<div style="border:1px solid rgba(51,65,85,0.65);background:rgba(15,23,42,0.72);border-radius:8px;padding:8px;">' +
                '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Kat Toplami (m2)</div>' +
                '<div style="margin-top:4px;color:#e2e8f0;">Once: ' + preview.beforeFloorArea.toFixed(2) + '</div>' +
                '<div style="color:#e2e8f0;">Sonra: ' + preview.afterFloorArea.toFixed(2) + '</div>' +
                '<div style="color:#67e8f9;font-weight:700;">Delta: ' + formatDelta(preview.floorDelta) + '</div>' +
                '</div>' +
                '<div style="border:1px solid rgba(51,65,85,0.65);background:rgba(15,23,42,0.72);border-radius:8px;padding:8px;">' +
                '<div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;">Bina Toplami (m2)</div>' +
                '<div style="margin-top:4px;color:#e2e8f0;">Once: ' + preview.beforeTotal.toFixed(2) + '</div>' +
                '<div style="color:#e2e8f0;">Sonra: ' + preview.afterTotal.toFixed(2) + '</div>' +
                '<div style="color:#86efac;font-weight:700;">Delta: ' + formatDelta(preview.totalDelta) + '</div>' +
                '</div>' +
                '</div>' +
                '<div style="border:1px solid rgba(51,65,85,0.65);border-radius:8px;overflow:hidden;">' +
                '<table style="width:100%;border-collapse:collapse;font-size:10px;">' +
                '<thead>' +
                '<tr style="background:rgba(15,23,42,0.78);color:#93c5fd;">' +
                '<th style="text-align:left;padding:5px 6px;border-bottom:1px solid rgba(51,65,85,0.65);">Kat</th>' +
                '<th style="text-align:right;padding:5px 6px;border-bottom:1px solid rgba(51,65,85,0.65);">Once</th>' +
                '<th style="text-align:right;padding:5px 6px;border-bottom:1px solid rgba(51,65,85,0.65);">Sonra</th>' +
                '<th style="text-align:right;padding:5px 6px;border-bottom:1px solid rgba(51,65,85,0.65);">Delta</th>' +
                '</tr>' +
                '</thead>' +
                '<tbody>' + rowsHtml + '</tbody>' +
                '</table>' +
                '</div>' +
                '<div style="font-size:10px;color:#94a3b8;">Kaydet ile bu ozet bina/kat iliski modeline gore kesinlesir.</div>';
        }

        function confirmSaveSummary(measurement, previousProperties) {
            if (!isFeatureEnabled()) return Promise.resolve(true);

            if (typeof state.saveSummaryPendingResolve === 'function') {
                closeSaveSummaryModal(false);
            }

            var preview = buildSaveSummaryPreview(measurement, previousProperties);
            if (!preview) return Promise.resolve(true);
            if (!hasMeaningfulSaveDelta(preview)) return Promise.resolve(true);

            var modal = ensureSaveSummaryModal();
            if (!modal) return Promise.resolve(true);

            renderSaveSummaryPreview(preview);
            modal.style.display = 'flex';
            state.saveSummaryMeasureId = measurement.id;

            return new Promise(function (resolve) {
                state.saveSummaryPendingResolve = resolve;
            });
        }

        function applyModeFromInputs() {
            var workKatInput = document.getElementById('infoWorkKat');
            var baseKatInput = document.getElementById('infoBaseKat');
            var buildingInput = document.getElementById('infoWorkBuilding');
            if (!workKatInput || !baseKatInput) return;

            var activeKey = normalizeFloorKey(workKatInput.value);
            if (!activeKey) {
                syncNote('Kat odak modu icin islem kati bos birakilamaz.', 'warn');
                workKatInput.focus();
                return;
            }

            var baseKey = normalizeFloorKey(baseKatInput.value) || '0';
            var scopedMeasurement = getScopedMeasurement();

            var buildingKey = buildingInput ? normalizeBuildingKey(buildingInput.value) : '';
            if (!buildingKey && scopedMeasurement) buildingKey = getMeasurementBuildingKey(scopedMeasurement);
            if (!buildingKey && state.buildingKey) buildingKey = state.buildingKey;
            if (!buildingKey) {
                syncNote('Kat odak modu icin bina anahtari gerekli (Ada/Parsel).', 'warn');
                if (buildingInput) buildingInput.focus();
                return;
            }

            state.enabled = true;
            state.activeFloorKey = activeKey;
            state.baseFloorKey = baseKey;
            state.buildingKey = buildingKey;

            workKatInput.value = state.activeFloorKey;
            baseKatInput.value = state.baseFloorKey;
            if (buildingInput) buildingInput.value = state.buildingKey;

            renderList();
            applyVisibility(true);
            syncNote('Kat odak modu aktif: Kat ' + activeKey + ' | Bina ' + buildingKey + '.', 'ok');
        }

        function clearModeFromInputs() {
            var baseKatInput = document.getElementById('infoBaseKat');
            resetModeState(baseKatInput ? baseKatInput.value : null);
            renderList();
            applyVisibility(true);
            syncNote('Kat odak modu kapatildi. Tum katlar tekrar gorunur.', 'info');
        }

        function shiftFloor(delta) {
            var workKatInput = document.getElementById('infoWorkKat');
            var applyBtn = document.getElementById('btnApplyFloorWork');
            if (!workKatInput || !applyBtn) return;

            var currentKey = normalizeFloorKey(workKatInput.value || state.activeFloorKey || '');
            var currentNo = parseFloorKeyNumber(currentKey);
            if (currentNo === null) {
                syncNote('Kat gecis icin sayisal kat degeri gerekli.', 'warn');
                workKatInput.focus();
                return;
            }

            workKatInput.value = String(currentNo + delta);
            applyBtn.click();
        }

        function bindScopedMeasurementToActive() {
            var scoped = getScopedMeasurement();
            if (!scoped) {
                syncNote('Baglama icin once bir olcum secin.', 'warn');
                return;
            }
            if (!isFloorWorkManagedMeasurement(scoped)) {
                syncNote('Secili olcum kat odak baglamaya uygun degil.', 'warn');
                return;
            }

            var floorKey = normalizeFloorKey((document.getElementById('infoWorkKat') || {}).value || state.activeFloorKey);
            var buildingKey = normalizeBuildingKey(getBuildingKeyFromInputs() || state.buildingKey);
            if (!floorKey || !buildingKey) {
                syncNote('Aktif kat ve bina anahtari gerekli.', 'warn');
                return;
            }

            if (!applyLinkToMeasurement(scoped, buildingKey, floorKey)) {
                syncNote('Secili olcum aktif bina/kata baglanamadi.', 'warn');
                return;
            }

            state.activeFloorKey = floorKey;
            state.buildingKey = buildingKey;
            persistFloorWorkChanges('Secili olcum aktif bina/kata baglandi.', 'ok');
        }

        function moveScopedMeasurementToPool() {
            var scoped = getScopedMeasurement();
            if (!scoped) {
                syncNote('Havuza almak icin once bir olcum secin.', 'warn');
                return;
            }
            if (!isFloorWorkManagedMeasurement(scoped)) {
                syncNote('Secili olcum havuza alinmaya uygun degil.', 'warn');
                return;
            }
            if (!moveMeasurementToPool(scoped)) {
                syncNote('Secili olcum havuza alinamadi.', 'warn');
                return;
            }

            persistFloorWorkChanges('Secili olcum parca havuzuna alindi.', 'info');
        }

        function bindSelectedPoolToActive() {
            var selectEl = document.getElementById('infoFloorPoolSelect');
            if (!selectEl) return;

            var selectedId = parseInt(selectEl.value, 10);
            if (!isFinite(selectedId)) {
                syncNote('Havuzdan baglamak icin bir parca secin.', 'warn');
                return;
            }

            var measurement = getMeasurementsSafe().find(function (m) { return m.id === selectedId; }) || null;
            if (!measurement) {
                syncNote('Secilen havuz parcasi bulunamadi.', 'warn');
                return;
            }

            var floorKey = normalizeFloorKey((document.getElementById('infoWorkKat') || {}).value || state.activeFloorKey);
            var buildingKey = normalizeBuildingKey(getBuildingKeyFromInputs() || state.buildingKey);
            if (!floorKey || !buildingKey) {
                syncNote('Aktif kat ve bina anahtari gerekli.', 'warn');
                return;
            }

            if (!applyLinkToMeasurement(measurement, buildingKey, floorKey)) {
                syncNote('Havuz parcasi aktif bina/kata baglanamadi.', 'warn');
                return;
            }

            state.activeFloorKey = floorKey;
            state.buildingKey = buildingKey;
            persistFloorWorkChanges('Havuz parcasi aktif bina/kata baglandi.', 'ok');
        }

        function fillBuildingFromScopedMeasurement() {
            var buildingInput = document.getElementById('infoWorkBuilding');
            if (!buildingInput) return;
            var scoped = getScopedMeasurement();
            var scopedBuilding = scoped ? getMeasurementBuildingKey(scoped) : '';
            if (!scopedBuilding) {
                syncNote('Secili olcumde bina anahtari bulunamadi.', 'warn');
                return;
            }
            buildingInput.value = scopedBuilding;
            syncBuildingDatalist();
            syncNote('Bina anahtari secili olcumden dolduruldu.', 'info');
        }

        function bindControls() {
            syncFeatureUiState();
            syncUIView();
            syncAllDatalists();

            if (!isFeatureEnabled()) {
                updateSummaryUi();
                return;
            }

            if (state.controlsBound) {
                updateSummaryUi();
                return;
            }

            var workKatInput = document.getElementById('infoWorkKat');
            var baseKatInput = document.getElementById('infoBaseKat');
            var buildingInput = document.getElementById('infoWorkBuilding');
            var infoKatInput = document.getElementById('infoKat');
            var applyBtn = document.getElementById('btnApplyFloorWork');
            var clearBtn = document.getElementById('btnClearFloorWork');
            var prevBtn = document.getElementById('btnFloorPrev');
            var nextBtn = document.getElementById('btnFloorNext');
            var bindScopedBtn = document.getElementById('btnFloorBindScoped');
            var moveToPoolBtn = document.getElementById('btnFloorMoveToPool');
            var bindPoolBtn = document.getElementById('btnFloorBindPoolSelected');
            var fillBuildingBtn = document.getElementById('btnFloorFillBuildingFromSelection');
            var viewSimpleBtn = document.getElementById('btnFloorViewSimple');
            var viewAdvancedBtn = document.getElementById('btnFloorViewAdvanced');
            if (!workKatInput || !baseKatInput || !applyBtn || !clearBtn) return;

            function normalizeInputValue(inputEl, normalizer) {
                if (!inputEl) return;
                inputEl.value = normalizer(inputEl.value);
            }

            applyBtn.addEventListener('click', applyModeFromInputs);
            clearBtn.addEventListener('click', clearModeFromInputs);

            if (prevBtn) prevBtn.addEventListener('click', function () { shiftFloor(-1); });
            if (nextBtn) nextBtn.addEventListener('click', function () { shiftFloor(1); });
            if (bindScopedBtn) bindScopedBtn.addEventListener('click', bindScopedMeasurementToActive);
            if (moveToPoolBtn) moveToPoolBtn.addEventListener('click', moveScopedMeasurementToPool);
            if (bindPoolBtn) bindPoolBtn.addEventListener('click', bindSelectedPoolToActive);
            if (fillBuildingBtn) fillBuildingBtn.addEventListener('click', fillBuildingFromScopedMeasurement);
            if (viewSimpleBtn) viewSimpleBtn.addEventListener('click', function () { setUIView('simple', false); });
            if (viewAdvancedBtn) viewAdvancedBtn.addEventListener('click', function () { setUIView('advanced', false); });

            [workKatInput, baseKatInput].forEach(function (inputEl) {
                inputEl.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        applyBtn.click();
                        return;
                    }
                    if (!e.altKey) return;
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        shiftFloor(1);
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        shiftFloor(-1);
                    }
                });
                inputEl.addEventListener('blur', function () {
                    normalizeInputValue(inputEl, normalizeFloorKey);
                    syncFloorDatalist();
                });
            });

            if (buildingInput) {
                buildingInput.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        applyBtn.click();
                    }
                });
                buildingInput.addEventListener('blur', function () {
                    normalizeInputValue(buildingInput, normalizeBuildingKey);
                    syncBuildingDatalist();
                });
            }

            if (infoKatInput) {
                infoKatInput.addEventListener('blur', function () {
                    normalizeInputValue(infoKatInput, normalizeFloorKey);
                    syncFloorDatalist();
                });
            }

            updateSummaryUi();
            state.controlsBound = true;
        }

        function getStateSnapshot() {
            return {
                featureEnabled: isFeatureEnabled(),
                modeEnabled: isModeEnabled(),
                activeFloorKey: state.activeFloorKey,
                baseFloorKey: state.baseFloorKey,
                buildingKey: state.buildingKey,
                poolCount: collectPoolMeasurements(100000).length
            };
        }

        function setFeatureEnabled(nextEnabled, silent) {
            state.featureEnabled = nextEnabled !== false;
            if (!state.featureEnabled) {
                resetModeState();
                closePreviewModal();
                closeSaveSummaryModal(false);
            }

            bindControls();
            updateSummaryUi();

            if (typeof renderList === 'function') renderList();
            else applyVisibility(true);

            if (!silent) {
                syncNote(state.featureEnabled ? 'Kat odak ozelligi etkin.' : 'Kat odak ozelligi devre disi.', 'info');
            }

            return getStateSnapshot();
        }

        function onMeasurementSaved(measurement) {
            if (!measurement) return;
            normalizeMeasurementLinkProperties(measurement);
            syncAllDatalists();
            updateSummaryUi();
        }

        function onPolygonCreated(measurement) {
            syncAllDatalists();
            updateSummaryUi();

            if (!isFeatureEnabled()) return;
            if (!isModeEnabled()) return;
            if (!measurement || measurement.type !== 'polygon') return;
            if (!isFloorWorkManagedMeasurement(measurement)) return;
            if (!isMeasurementVisibleInMode(measurement)) return;

            openPolygonPreview(measurement);
        }

        state.featureEnabled = readFeatureFlag();
        state.uiView = readUIViewPreference();

        var publicApi = {
            getState: getStateSnapshot,
            setFeatureEnabled: function (enabled) { return setFeatureEnabled(enabled, false); },
            enableFeature: function () { return setFeatureEnabled(true, false); },
            disableFeature: function () { return setFeatureEnabled(false, false); },
            clearMode: function () {
                resetModeState();
                renderList();
                applyVisibility(true);
                return getStateSnapshot();
            },
            openPreviewByMeasurementId: function (id) {
                var m = getMeasurementsSafe().find(function (x) { return x.id === id; }) || null;
                if (m) openPolygonPreview(m);
            }
        };

        return {
            publicApi: publicApi,
            isFeatureEnabled: isFeatureEnabled,
            isModeEnabled: isModeEnabled,
            normalizeFloorKey: normalizeFloorKey,
            parseFloorKeyNumber: parseFloorKeyNumber,
            normalizeBuildingKey: normalizeBuildingKey,
            getMeasurementFloorKey: getMeasurementFloorKey,
            getMeasurementBuildingKey: getMeasurementBuildingKey,
            isMeasurementVisibleInMode: isMeasurementVisibleInMode,
            applyVisibility: applyVisibility,
            buildNewPolygonProperties: buildNewPolygonProperties,
            updateSummaryUi: updateSummaryUi,
            bindControls: bindControls,
            setFeatureEnabled: setFeatureEnabled,
            getStateSnapshot: getStateSnapshot,
            onPolygonCreated: onPolygonCreated,
            onMeasurementSaved: onMeasurementSaved,
            confirmSaveSummary: confirmSaveSummary
        };
    }

    if (typeof window !== 'undefined') {
        window.CBSFloorWorkHookFactory = createFloorWorkHook;
    }
})();
