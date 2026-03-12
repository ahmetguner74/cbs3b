// Standalone volume hook module.
// This file can be removed from loader chain without touching core measurement logic.
(function () {
	if (typeof window === 'undefined' || window.__cbsVolumeHookLoaded) return;
	window.__cbsVolumeHookLoaded = true;

	var _panel = null;
	var _statusEl = null;
	var _progressFillEl = null;
	var _summaryEl = null;
	var _selectionEl = null;
	var _computeBtn = null;
	var _exportPdfBtn = null;
	var _exportXlsxBtn = null;
	var _exportCadBtn = null;
	var _refModeEl = null;
	var _refValueEl = null;
	var _gridEl = null;
	var _sectionEl = null;
	var _sectionDirectionEl = null;
	var _sourceEl = null;
	var _vizCutFillEl = null;
	var _vizSectionsEl = null;
	var _vizLabelEl = null;
	var _sectionSelectEl = null;
	var _sectionMetaEl = null;
	var _sectionProfileEl = null;
	var _sectionFocusBtn = null;
	var _isBusy = false;
	var _lastResult = null;
	var _selectedSectionIndex = -1;
	var _selectedMeasurementId = null;
	var _surfaceSourceUsed = 'tiles';
	var _surfaceSourceNote = '';
	var _tm30ToWgsCache = Object.create(null);
	var _vizState = {
		cutFillCollection: null,
		sectionPrimitives: [],
		summaryLabel: null,
		focusedSectionPrimitive: null
	};

	var MAX_GRID_NODES = 25000;
	var MAX_GRID_CELLS = 20000;
	var VOLUME_STANDARD_NOTE = 'Yontem: Prismoidal Grid + hucre ucgen entegrasyonu (RICS/ASTM yaklasimi), TM30 (EPSG:5254) ulusal koordinat uyumu.';

	function _showError(msg) {
		if (typeof showResultErrorMessage === 'function') {
			showResultErrorMessage(msg);
		} else {
			console.warn('[Volume] ' + msg);
		}
		_setStatus(msg, 'error');
	}

	function _showInfo(msg) {
		if (typeof setResultDisplayMessage === 'function') {
			setResultDisplayMessage('<span class="text-cyan-300 font-bold text-[11px]">' + _escapeHtml(msg) + '</span>');
		}
		_setStatus(msg, 'info');
	}

	function _escapeHtml(v) {
		return String(v || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function _formatNum(v, d) {
		if (!isFinite(v)) return '-';
		return Number(v).toFixed(typeof d === 'number' ? d : 2);
	}

	function _timestampTag() {
		var dt = new Date();
		var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
		return '' + dt.getFullYear() + pad(dt.getMonth() + 1) + pad(dt.getDate()) + '_' + pad(dt.getHours()) + pad(dt.getMinutes()) + pad(dt.getSeconds());
	}

	function _ensureStyles() {
		if (document.getElementById('volumePanelStyles')) return;
		var style = document.createElement('style');
		style.id = 'volumePanelStyles';
		style.textContent = [
			'#volumePanel{position:fixed;left:56px;top:88px;width:360px;max-width:calc(100vw - 72px);max-height:calc(100vh - 112px);z-index:85;display:none;background:rgba(8,12,20,.96);border:1px solid rgba(56,189,248,.35);border-radius:10px;backdrop-filter:blur(8px);box-shadow:0 16px 42px rgba(0,0,0,.45);overflow:hidden}',
			'#volumePanel .vp-h{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid rgba(51,65,85,.8)}',
			'#volumePanel .vp-t{font-size:13px;font-weight:700;color:#e2e8f0;letter-spacing:.02em}',
			'#volumePanel .vp-close{border:1px solid rgba(100,116,139,.6);background:rgba(15,23,42,.75);color:#e2e8f0;width:26px;height:26px;border-radius:6px;cursor:pointer}',
			'#volumePanel .vp-b{padding:10px 12px 12px 12px;overflow:auto;max-height:calc(100vh - 168px)}',
			'#volumePanel .vp-row{display:grid;grid-template-columns:132px 1fr;gap:8px;align-items:center;margin-bottom:8px}',
			'#volumePanel .vp-row label{font-size:11px;color:#94a3b8}',
			'#volumePanel select,#volumePanel input[type="number"]{width:100%;height:30px;border-radius:6px;border:1px solid rgba(71,85,105,.9);background:#0b1220;color:#e2e8f0;padding:0 8px;font-size:12px;outline:none}',
			'#volumePanel input[type="checkbox"]{width:14px;height:14px;accent-color:#06b6d4}',
			'#volumePanel .vp-note{font-size:10px;color:#94a3b8;line-height:1.35;background:rgba(15,23,42,.65);padding:8px;border:1px solid rgba(51,65,85,.65);border-radius:6px;margin-bottom:8px}',
			'#volumePanel .vp-btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
			'#volumePanel .vp-btn{border:1px solid rgba(56,189,248,.45);background:rgba(6,78,110,.28);color:#dbeafe;height:30px;padding:0 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700}',
			'#volumePanel .vp-btn[disabled]{opacity:.45;cursor:not-allowed}',
			'#volumePanel .vp-progress{height:7px;border-radius:999px;border:1px solid rgba(51,65,85,.8);background:rgba(15,23,42,.7);overflow:hidden;margin:8px 0}',
			'#volumePanel .vp-progress>span{display:block;height:100%;width:0;background:linear-gradient(90deg,#06b6d4,#0ea5e9,#3b82f6)}',
			'#volumePanel .vp-status{font-size:11px;color:#94a3b8;min-height:16px}',
			'#volumePanel .vp-status.vp-err{color:#fda4af}',
			'#volumePanel .vp-status.vp-ok{color:#86efac}',
			'#volumePanel .vp-summary{margin-top:8px;border:1px solid rgba(51,65,85,.8);border-radius:8px;background:rgba(2,6,23,.75);padding:8px;font-size:11px;color:#e2e8f0;line-height:1.42}',
			'#volumePanel .vp-summary table{width:100%;border-collapse:collapse;margin-top:6px}',
			'#volumePanel .vp-summary td,#volumePanel .vp-summary th{padding:4px 5px;border-bottom:1px solid rgba(51,65,85,.5);font-size:10px;text-align:left}',
			'#volumePanel .vp-mini-meta{font-size:10px;color:#cbd5e1;line-height:1.35;border:1px solid rgba(51,65,85,.65);background:rgba(15,23,42,.55);padding:6px;border-radius:6px;margin-bottom:6px}',
			'#volumePanel .vp-section-svg{display:block;width:100%;height:148px;border:1px solid rgba(51,65,85,.65);border-radius:6px;background:linear-gradient(180deg,rgba(30,41,59,.45),rgba(2,6,23,.75));overflow:hidden}',
			'#volumePanel .vp-section-empty{font-size:10px;fill:#94a3b8}',
			'@media (max-width: 720px){#volumePanel{left:8px;right:8px;top:72px;width:auto;max-width:none}}'
		].join('');
		document.head.appendChild(style);
	}

	function _createPanel() {
		if (_panel) return;
		_ensureStyles();
		var panel = document.createElement('div');
		panel.id = 'volumePanel';
		panel.innerHTML = [
			'<div class="vp-h">',
			'<div class="vp-t">Hacim Hesap Paneli</div>',
			'<button class="vp-close" id="vpCloseBtn" title="Kapat">x</button>',
			'</div>',
			'<div class="vp-b">',
			'<div id="vpSelection" class="vp-note">Secili alan bekleniyor.</div>',
			'<div class="vp-note">' + VOLUME_STANDARD_NOTE + '</div>',
			'<div class="vp-row"><label>Referans duzlem</label><select id="vpRefMode"><option value="fixed">Sabit kot</option><option value="min">Min zemin</option><option value="max">Maks zemin</option><option value="mean">Ortalama zemin</option></select></div>',
			'<div class="vp-row"><label>Sabit kot (m)</label><input id="vpRefValue" type="number" step="0.01" value="0" /></div>',
			'<div class="vp-row"><label>Grid araligi (m)</label><input id="vpGrid" type="number" min="0.25" step="0.25" value="1" /></div>',
			'<div class="vp-row"><label>Kesit araligi (m)</label><input id="vpSection" type="number" min="1" step="1" value="5" /></div>',
			'<div class="vp-row"><label>Kesit yonu</label><select id="vpSectionDirection"><option value="both" selected>X + Y (tam)</option><option value="dominant">Otomatik (baskin eksen)</option><option value="x">Yalniz X kesitleri</option><option value="y">Yalniz Y kesitleri</option></select></div>',
			'<div class="vp-row"><label>Yuzey kaynagi</label><select id="vpSource"><option value="auto" selected>Otomatik (onerilen)</option><option value="tiles">3D Tile (aktif model)</option><option value="dsm">DSM (yakinda)</option><option value="pointcloud">Nokta Bulutu (yakinda)</option></select></div>',
			'<div class="vp-row"><label>Ekranda goster</label><div style="display:flex;gap:8px;flex-wrap:wrap;font-size:11px;color:#cbd5e1"><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="vpVizCutFill" checked />Cut/Fill</label><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="vpVizSections" checked />Kesitler</label><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="vpVizLabel" checked />Ozet Etiket</label></div></div>',
			'<div class="vp-btns"><button id="vpComputeBtn" class="vp-btn">Hacim Hesapla</button></div>',
			'<div class="vp-progress"><span id="vpProgressFill"></span></div>',
			'<div id="vpStatus" class="vp-status"></div>',
			'<div id="vpSummary" class="vp-summary">Hesap sonucu burada gosterilecek.</div>',
			'<div class="vp-summary">',
			'<div style="font-weight:700;font-size:11px;margin-bottom:6px;color:#e2e8f0">Kesit Profili (Netcad/AutoCAD benzeri)</div>',
			'<div class="vp-row" style="grid-template-columns:96px 1fr;margin-bottom:6px"><label>Secili kesit</label><select id="vpSectionSelect" disabled><option value="">Hesap sonrasi secin</option></select></div>',
			'<div id="vpSectionMeta" class="vp-mini-meta">Kesit metrikleri burada gosterilecek.</div>',
			'<svg id="vpSectionProfile" class="vp-section-svg" viewBox="0 0 320 148" preserveAspectRatio="none"><text x="160" y="78" text-anchor="middle" class="vp-section-empty">Kesit profili hesap sonrasinda olusur.</text></svg>',
			'<div class="vp-btns" style="margin-top:6px"><button id="vpFocusSection" class="vp-btn" disabled>Kesiti Haritada Odakla</button></div>',
			'</div>',
			'<div class="vp-btns">',
			'<button id="vpExportPdf" class="vp-btn" disabled>PDF Rapor</button>',
			'<button id="vpExportXlsx" class="vp-btn" disabled>Excel Rapor</button>',
			'<button id="vpExportCad" class="vp-btn" disabled>CAD (DXF)</button>',
			'</div>',
			'</div>'
		].join('');

		document.body.appendChild(panel);
		_panel = panel;
		_statusEl = panel.querySelector('#vpStatus');
		_progressFillEl = panel.querySelector('#vpProgressFill');
		_summaryEl = panel.querySelector('#vpSummary');
		_selectionEl = panel.querySelector('#vpSelection');
		_computeBtn = panel.querySelector('#vpComputeBtn');
		_exportPdfBtn = panel.querySelector('#vpExportPdf');
		_exportXlsxBtn = panel.querySelector('#vpExportXlsx');
		_exportCadBtn = panel.querySelector('#vpExportCad');
		_refModeEl = panel.querySelector('#vpRefMode');
		_refValueEl = panel.querySelector('#vpRefValue');
		_gridEl = panel.querySelector('#vpGrid');
		_sectionEl = panel.querySelector('#vpSection');
		_sectionDirectionEl = panel.querySelector('#vpSectionDirection');
		_sourceEl = panel.querySelector('#vpSource');
		_vizCutFillEl = panel.querySelector('#vpVizCutFill');
		_vizSectionsEl = panel.querySelector('#vpVizSections');
		_vizLabelEl = panel.querySelector('#vpVizLabel');
		_sectionSelectEl = panel.querySelector('#vpSectionSelect');
		_sectionMetaEl = panel.querySelector('#vpSectionMeta');
		_sectionProfileEl = panel.querySelector('#vpSectionProfile');
		_sectionFocusBtn = panel.querySelector('#vpFocusSection');

		panel.querySelector('#vpCloseBtn').addEventListener('click', function () {
			_panel.style.display = 'none';
			_clearFocusedSection();
		});
		_refModeEl.addEventListener('change', function () {
			_refValueEl.disabled = _refModeEl.value !== 'fixed';
		});
		if (_sectionDirectionEl) {
			_sectionDirectionEl.addEventListener('change', function () {
				if (_lastResult) {
					_setStatus('Kesit yonu degisti. Yeni duzen icin yeniden hesap yapin.', 'info');
				}
			});
		}
		_computeBtn.addEventListener('click', _onComputeClick);
		_exportPdfBtn.addEventListener('click', function () {
			if (!_lastResult) return;
			_exportPdf(_lastResult);
		});
		_exportXlsxBtn.addEventListener('click', function () {
			if (!_lastResult) return;
			_exportExcel(_lastResult);
		});
		_exportCadBtn.addEventListener('click', function () {
			if (!_lastResult) return;
			_exportCadDxf(_lastResult);
		});

		[_vizCutFillEl, _vizSectionsEl, _vizLabelEl].forEach(function (el) {
			if (!el) return;
			el.addEventListener('change', function () {
				if (!_lastResult) return;
				_refreshVisualization();
			});
		});

		if (_sectionSelectEl) {
			_sectionSelectEl.addEventListener('change', function () {
				if (!_lastResult || !_lastResult.sections || _lastResult.sections.length === 0) return;
				var idx = parseInt(_sectionSelectEl.value, 10);
				if (!isFinite(idx)) idx = 0;
				_selectedSectionIndex = Math.max(0, Math.min(_lastResult.sections.length - 1, idx));
				_updateSectionInspector();
			});
		}

		if (_sectionFocusBtn) {
			_sectionFocusBtn.addEventListener('click', function () {
				_focusSelectedSection(true);
			});
		}

		_clearSectionInspector('Kesit profili hesap sonrasinda olusur.');
	}

	function _getVisualizationOptions() {
		return {
			showCutFill: !_vizCutFillEl || !!_vizCutFillEl.checked,
			showSections: !_vizSectionsEl || !!_vizSectionsEl.checked,
			showLabel: !_vizLabelEl || !!_vizLabelEl.checked
		};
	}

	function _refreshVisualization() {
		if (!_lastResult) return;
		_visualizeResult(_lastResult, _getVisualizationOptions());
		_focusSelectedSection(false);
	}

	function _setStatus(text, state) {
		if (!_statusEl) return;
		_statusEl.textContent = text || '';
		_statusEl.classList.remove('vp-err', 'vp-ok');
		if (state === 'error') _statusEl.classList.add('vp-err');
		if (state === 'ok') _statusEl.classList.add('vp-ok');
	}

	function _setProgress(pct) {
		if (!_progressFillEl) return;
		var v = Math.max(0, Math.min(100, pct || 0));
		_progressFillEl.style.width = v.toFixed(1) + '%';
	}

	function _setBusy(busy) {
		_isBusy = !!busy;
		if (_computeBtn) _computeBtn.disabled = _isBusy;
		if (_exportPdfBtn) _exportPdfBtn.disabled = _isBusy || !_lastResult;
		if (_exportXlsxBtn) _exportXlsxBtn.disabled = _isBusy || !_lastResult;
		if (_exportCadBtn) _exportCadBtn.disabled = _isBusy || !_lastResult;
		if (_sectionSelectEl) {
			var canUse = !_isBusy && !!(_lastResult && _lastResult.sections && _lastResult.sections.length > 0);
			_sectionSelectEl.disabled = !canUse;
		}
		if (_sectionFocusBtn) {
			var canFocus = !_isBusy && !!(_lastResult && _lastResult.sections && _lastResult.sections.length > 0 && _selectedSectionIndex >= 0);
			_sectionFocusBtn.disabled = !canFocus;
		}
	}

	function _safeRequestRender() {
		if (viewer && viewer.scene && typeof viewer.scene.requestRender === 'function') {
			viewer.scene.requestRender();
		}
	}

	function _clearVisualization() {
		if (_vizState.cutFillCollection) {
			try {
				if (viewer.scene.primitives.contains(_vizState.cutFillCollection)) {
					viewer.scene.primitives.remove(_vizState.cutFillCollection);
				}
			} catch (e1) { }
			_vizState.cutFillCollection = null;
		}
		if (Array.isArray(_vizState.sectionPrimitives) && _vizState.sectionPrimitives.length > 0) {
			for (var i = 0; i < _vizState.sectionPrimitives.length; i++) {
				try { if (typeof safeRemoveItem === 'function') safeRemoveItem(_vizState.sectionPrimitives[i]); } catch (e2) { }
			}
			_vizState.sectionPrimitives = [];
		}
		if (_vizState.summaryLabel) {
			try { if (typeof safeRemoveItem === 'function') safeRemoveItem(_vizState.summaryLabel); } catch (e3) { }
			_vizState.summaryLabel = null;
		}
		_clearFocusedSection();
		_safeRequestRender();
	}

	function _clearFocusedSection() {
		if (_vizState.focusedSectionPrimitive) {
			try {
				if (typeof safeRemoveItem === 'function') safeRemoveItem(_vizState.focusedSectionPrimitive);
			} catch (e4) { }
			_vizState.focusedSectionPrimitive = null;
		}
	}

	function _resolveSurfaceSource(mode) {
		_surfaceSourceNote = '';
		if (mode === 'tiles' || mode === 'auto') {
			_surfaceSourceUsed = 'tiles';
			return 'tiles';
		}
		if (mode === 'dsm' || mode === 'pointcloud') {
			_surfaceSourceUsed = 'tiles';
			_surfaceSourceNote = mode + ' adapteri henuz aktif degil, 3D Tile kaynagina dusuldu.';
			return 'tiles';
		}
		_surfaceSourceUsed = 'tiles';
		return 'tiles';
	}

	function _selectMeasurement() {
		if (typeof measurements === 'undefined' || !Array.isArray(measurements)) return null;
		if (typeof activeHighlightId === 'undefined' || activeHighlightId === null) return null;
		for (var i = 0; i < measurements.length; i++) {
			if (measurements[i].id === activeHighlightId) return measurements[i];
		}
		return null;
	}

	function _ensureSelectionForVolume() {
		var m = _selectMeasurement();
		if (!m) {
			_showError('Hacim icin once bir alan secmelisiniz.');
			return null;
		}
		if (m.type !== 'polygon') {
			_showError('Hacim hesabi sadece polygon/alan olcumlerinde calisir.');
			return null;
		}
		if (!m.points || m.points.length < 3) {
			_showError('Secili alanda yeterli kose noktasi yok.');
			return null;
		}
		return m;
	}

	function _tm30ToWgs(x, y) {
		if (typeof proj4 === 'undefined') return null;
		if (!isFinite(x) || !isFinite(y)) return null;
		var key = Number(x).toFixed(3) + '|' + Number(y).toFixed(3);
		if (Object.prototype.hasOwnProperty.call(_tm30ToWgsCache, key)) {
			return _tm30ToWgsCache[key];
		}
		var w = proj4('EPSG:5254', 'EPSG:4326', [x, y]);
		if (!w || w.length < 2) return null;
		_tm30ToWgsCache[key] = { lon: w[0], lat: w[1] };
		return _tm30ToWgsCache[key];
	}

	function _cartesianToTmNode(c) {
		var carto = Cesium.Cartographic.fromCartesian(c);
		var lat = Cesium.Math.toDegrees(carto.latitude);
		var lon = Cesium.Math.toDegrees(carto.longitude);
		var xy;
		if (typeof wgs84ToTm30 === 'function') {
			xy = wgs84ToTm30(lat, lon);
		} else if (typeof proj4 !== 'undefined') {
			xy = proj4('EPSG:4326', 'EPSG:5254', [lon, lat]);
		} else {
			xy = [lon, lat];
		}
		return {
			x: xy[0],
			y: xy[1],
			z: carto.height,
			lon: lon,
			lat: lat
		};
	}

	function _shoelaceArea(poly) {
		if (!poly || poly.length < 3) return 0;
		var s = 0;
		for (var i = 0; i < poly.length; i++) {
			var j = (i + 1) % poly.length;
			s += (poly[i].x * poly[j].y) - (poly[j].x * poly[i].y);
		}
		return Math.abs(s) / 2;
	}

	function _pointInPolygon(x, y, poly) {
		var inside = false;
		for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
			var xi = poly[i].x, yi = poly[i].y;
			var xj = poly[j].x, yj = poly[j].y;
			var intersect = ((yi > y) !== (yj > y)) &&
				(x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi);
			if (intersect) inside = !inside;
		}
		return inside;
	}

	function _estimateCellCoverage(centerX, centerY, gridSpacing, poly) {
		var half = gridSpacing * 0.5;
		var quarter = gridSpacing * 0.25;
		var samplePts = [
			{ x: centerX, y: centerY, w: 0.35 },
			{ x: centerX - quarter, y: centerY - quarter, w: 0.1625 },
			{ x: centerX + quarter, y: centerY - quarter, w: 0.1625 },
			{ x: centerX + quarter, y: centerY + quarter, w: 0.1625 },
			{ x: centerX - quarter, y: centerY + quarter, w: 0.1625 }
		];
		var score = 0;
		for (var i = 0; i < samplePts.length; i++) {
			if (_pointInPolygon(samplePts[i].x, samplePts[i].y, poly)) score += samplePts[i].w;
		}
		if (score > 0) return Math.min(1, Math.max(0, score));

		// Cok ince sinir temaslari icin kose kontrolu
		var corners = [
			{ x: centerX - half, y: centerY - half },
			{ x: centerX + half, y: centerY - half },
			{ x: centerX + half, y: centerY + half },
			{ x: centerX - half, y: centerY + half }
		];
		var hit = 0;
		for (var c = 0; c < corners.length; c++) {
			if (_pointInPolygon(corners[c].x, corners[c].y, poly)) hit++;
		}
		if (hit > 0) return Math.min(1, hit * 0.25);
		return 0;
	}

	function _weightedHeightFallback(x, y, polyTmNodes) {
		var eps = 1e-9;
		var accW = 0;
		var accZ = 0;
		for (var i = 0; i < polyTmNodes.length; i++) {
			var dx = polyTmNodes[i].x - x;
			var dy = polyTmNodes[i].y - y;
			var d2 = dx * dx + dy * dy;
			if (d2 < eps) return polyTmNodes[i].z;
			var w = 1 / Math.max(d2, eps);
			accW += w;
			accZ += polyTmNodes[i].z * w;
		}
		if (accW <= 0) return 0;
		return accZ / accW;
	}

	function _buildGrid(polyTm, gridSpacing) {
		var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (var i = 0; i < polyTm.length; i++) {
			minX = Math.min(minX, polyTm[i].x);
			maxX = Math.max(maxX, polyTm[i].x);
			minY = Math.min(minY, polyTm[i].y);
			maxY = Math.max(maxY, polyTm[i].y);
		}

		var width = Math.max(gridSpacing, maxX - minX);
		var height = Math.max(gridSpacing, maxY - minY);
		var nx = Math.max(1, Math.ceil(width / gridSpacing));
		var ny = Math.max(1, Math.ceil(height / gridSpacing));

		var cells = [];
		var nodeKeyMap = Object.create(null);
		var coverageAreaRaw = 0;
		for (var cy = 0; cy < ny; cy++) {
			for (var cx = 0; cx < nx; cx++) {
				var centerX = minX + (cx + 0.5) * gridSpacing;
				var centerY = minY + (cy + 0.5) * gridSpacing;
				var coverage = _estimateCellCoverage(centerX, centerY, gridSpacing, polyTm);
				if (coverage <= 0) continue;

				nodeKeyMap[cx + '_' + cy] = true;
				nodeKeyMap[(cx + 1) + '_' + cy] = true;
				nodeKeyMap[(cx + 1) + '_' + (cy + 1)] = true;
				nodeKeyMap[cx + '_' + (cy + 1)] = true;
				coverageAreaRaw += coverage * gridSpacing * gridSpacing;
				cells.push({
					ix: cx,
					iy: cy,
					x: centerX,
					y: centerY,
					coverage: coverage,
					n00: cx + '_' + cy,
					n10: (cx + 1) + '_' + cy,
					n11: (cx + 1) + '_' + (cy + 1),
					n01: cx + '_' + (cy + 1)
				});
			}
		}

		var nodes = [];
		for (var key in nodeKeyMap) {
			if (!Object.prototype.hasOwnProperty.call(nodeKeyMap, key)) continue;
			var parts = key.split('_');
			var ix = parseInt(parts[0], 10);
			var iy = parseInt(parts[1], 10);
			nodes.push({
				ix: ix,
				iy: iy,
				x: minX + ix * gridSpacing,
				y: minY + iy * gridSpacing
			});
		}

		return {
			minX: minX,
			maxX: maxX,
			minY: minY,
			maxY: maxY,
			nx: nx,
			ny: ny,
			nodes: nodes,
			cells: cells,
			coverageAreaRaw: coverageAreaRaw
		};
	}

	async function _sampleNodeHeights(nodes, polyTmNodes, onProgress, samplingMode) {
		var sampled = [];
		var chunkSize = nodes.length > 14000 ? 240 : (nodes.length > 7000 ? 180 : 140);
		var scene = viewer && viewer.scene ? viewer.scene : null;
		if (!scene) throw new Error('Cesium scene bulunamadi.');
		var llCache = Object.create(null);
		var allowTiles = (samplingMode === 'tiles' || samplingMode === 'auto' || !samplingMode);

		for (var i = 0; i < nodes.length; i += chunkSize) {
			var chunk = nodes.slice(i, i + chunkSize);
			var cartos = [];
			for (var j = 0; j < chunk.length; j++) {
				var cacheKey = chunk[j].x.toFixed(3) + '|' + chunk[j].y.toFixed(3);
				var ll = llCache[cacheKey];
				if (!ll) {
					ll = _tm30ToWgs(chunk[j].x, chunk[j].y);
					llCache[cacheKey] = ll || null;
				}
				if (!ll) {
					cartos.push(null);
					continue;
				}
				var c = new Cesium.Cartographic(Cesium.Math.toRadians(ll.lon), Cesium.Math.toRadians(ll.lat), 0);
				cartos.push(c);
			}

			var heights = new Array(chunk.length);
			var source = new Array(chunk.length);

			if (allowTiles && typeof scene.sampleHeightMostDetailed === 'function') {
				var validCartos = [];
				var validMap = [];
				for (var k = 0; k < cartos.length; k++) {
					if (cartos[k]) {
						validMap.push(k);
						validCartos.push(cartos[k]);
					}
				}
				if (validCartos.length > 0) {
					try {
						var sampledCartos = await scene.sampleHeightMostDetailed(validCartos);
						var used = sampledCartos || validCartos;
						for (var sk = 0; sk < used.length; sk++) {
							var idx = validMap[sk];
							var h = used[sk] && isFinite(used[sk].height) ? used[sk].height : undefined;
							if (isFinite(h)) {
								heights[idx] = h;
								source[idx] = 'sampleHeightMostDetailed';
							}
						}
					} catch (err1) {
						console.warn('[Volume] sampleHeightMostDetailed hatasi:', err1);
					}
				}
			}

			if (allowTiles && typeof scene.sampleHeight === 'function') {
				for (var k2 = 0; k2 < cartos.length; k2++) {
					if (!cartos[k2] || isFinite(heights[k2])) continue;
					try {
						var hs = scene.sampleHeight(cartos[k2]);
						if (isFinite(hs)) {
							heights[k2] = hs;
							source[k2] = 'sampleHeight';
						}
					} catch (err2) { }
				}
			}

			if (allowTiles && typeof scene.clampToHeightMostDetailed === 'function') {
				var probe = [];
				var probeMap = [];
				for (var k3 = 0; k3 < cartos.length; k3++) {
					if (!cartos[k3] || isFinite(heights[k3])) continue;
					probeMap.push(k3);
					probe.push(Cesium.Cartesian3.fromRadians(cartos[k3].longitude, cartos[k3].latitude, 12000));
				}
				if (probe.length > 0) {
					try {
						var clamped = await scene.clampToHeightMostDetailed(probe);
						for (var ck = 0; ck < clamped.length; ck++) {
							var idx2 = probeMap[ck];
							if (!clamped[ck]) continue;
							var cc = Cesium.Cartographic.fromCartesian(clamped[ck]);
							if (cc && isFinite(cc.height)) {
								heights[idx2] = cc.height;
								source[idx2] = 'clampToHeightMostDetailed';
							}
						}
					} catch (err3) {
						console.warn('[Volume] clampToHeightMostDetailed hatasi:', err3);
					}
				}
			}

			for (var n = 0; n < chunk.length; n++) {
				var hz = heights[n];
				if (!isFinite(hz)) {
					hz = _weightedHeightFallback(chunk[n].x, chunk[n].y, polyTmNodes);
					source[n] = 'vertexWeightedFallback';
				}
				sampled.push({
					ix: chunk[n].ix,
					iy: chunk[n].iy,
					x: chunk[n].x,
					y: chunk[n].y,
					z: hz,
					source: source[n] || 'unknown'
				});
			}

			if (typeof onProgress === 'function') {
				onProgress((Math.min(nodes.length, i + chunk.length) / nodes.length) * 100);
			}
		}

		return sampled;
	}

	function _computeReferenceElevation(mode, fixedVal, sampledNodes) {
		if (mode === 'fixed') {
			if (!isFinite(fixedVal)) throw new Error('Sabit kot degeri gecersiz.');
			return fixedVal;
		}
		var minZ = Infinity;
		var maxZ = -Infinity;
		var sum = 0;
		for (var i = 0; i < sampledNodes.length; i++) {
			minZ = Math.min(minZ, sampledNodes[i].z);
			maxZ = Math.max(maxZ, sampledNodes[i].z);
			sum += sampledNodes[i].z;
		}
		if (mode === 'min') return minZ;
		if (mode === 'max') return maxZ;
		return sum / Math.max(1, sampledNodes.length);
	}

	function _buildSections(cellRows, gridSpacing, sectionInterval, refElevation, sectionDirection, bounds) {
		var byRow = Object.create(null);
		var byCol = Object.create(null);
		for (var i = 0; i < cellRows.length; i++) {
			var r = cellRows[i];
			if (!byRow[r.iy]) byRow[r.iy] = [];
			if (!byCol[r.ix]) byCol[r.ix] = [];
			byRow[r.iy].push(r);
			byCol[r.ix].push(r);
		}

		var mode = String(sectionDirection || 'both').toLowerCase();
		if (mode !== 'both' && mode !== 'x' && mode !== 'y' && mode !== 'dominant') mode = 'both';
		if (mode === 'dominant') {
			var spanX = 0;
			var spanY = 0;
			if (bounds && isFinite(bounds.minX) && isFinite(bounds.maxX) && isFinite(bounds.minY) && isFinite(bounds.maxY)) {
				spanX = Math.max(0, bounds.maxX - bounds.minX);
				spanY = Math.max(0, bounds.maxY - bounds.minY);
			} else {
				var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
				for (var di = 0; di < cellRows.length; di++) {
					minX = Math.min(minX, cellRows[di].x);
					maxX = Math.max(maxX, cellRows[di].x);
					minY = Math.min(minY, cellRows[di].y);
					maxY = Math.max(maxY, cellRows[di].y);
				}
				spanX = Math.max(0, maxX - minX);
				spanY = Math.max(0, maxY - minY);
			}
			mode = spanX >= spanY ? 'x' : 'y';
		}

		var includeX = mode === 'both' || mode === 'x';
		var includeY = mode === 'both' || mode === 'y';

		var stepRows = Math.max(1, Math.round(sectionInterval / gridSpacing));
		var rowKeys = Object.keys(byRow).map(function (v) { return parseInt(v, 10); }).sort(function (a, b) { return a - b; });
		var colKeys = Object.keys(byCol).map(function (v) { return parseInt(v, 10); }).sort(function (a, b) { return a - b; });

		function calcOneSection(items, axis) {
			items.sort(function (a, b) { return axis === 'X' ? a.x - b.x : a.y - b.y; });
			var cutA = 0;
			var fillA = 0;
			var len = 0;
			var profile = [];
			for (var k = 0; k < items.length; k++) {
				profile.push({ station: axis === 'X' ? items[k].x : items[k].y, z: items[k].z });
				if (k === items.length - 1) continue;
				var curr = items[k];
				var next = items[k + 1];
				var contiguous = axis === 'X' ? (next.ix - curr.ix === 1 && next.iy === curr.iy) : (next.iy - curr.iy === 1 && next.ix === curr.ix);
				if (!contiguous) continue;
				var span = axis === 'X' ? (next.x - curr.x) : (next.y - curr.y);
				if (!isFinite(span) || span <= 0) span = gridSpacing;
				len += span;
				var c1 = Math.max(0, curr.z - refElevation);
				var c2 = Math.max(0, next.z - refElevation);
				var f1 = Math.max(0, refElevation - curr.z);
				var f2 = Math.max(0, refElevation - next.z);
				cutA += ((c1 + c2) * 0.5 * span);
				fillA += ((f1 + f2) * 0.5 * span);
			}
			return {
				cutArea: cutA,
				fillArea: fillA,
				netArea: fillA - cutA,
				length: len,
				profile: profile,
				start: items.length ? { x: items[0].x, y: items[0].y } : null,
				end: items.length ? { x: items[items.length - 1].x, y: items[items.length - 1].y } : null
			};
		}

		var sections = [];
		if (includeX) {
			for (var ri = 0; ri < rowKeys.length; ri += stepRows) {
				var rowKey = rowKeys[ri];
				var rowItems = byRow[rowKey];
				if (!rowItems || rowItems.length < 2) continue;
				var rowCalc = calcOneSection(rowItems, 'X');
				sections.push({
					axis: 'X',
					name: 'X-' + rowKey,
					station: rowItems[0].y,
					cutArea: rowCalc.cutArea,
					fillArea: rowCalc.fillArea,
					netArea: rowCalc.netArea,
					length: rowCalc.length,
					start: rowCalc.start,
					end: rowCalc.end,
					profile: rowCalc.profile
				});
			}
			if (rowKeys.length > 0 && (rowKeys.length - 1) % stepRows !== 0) {
				var lastRowItems = byRow[rowKeys[rowKeys.length - 1]];
				if (lastRowItems && lastRowItems.length >= 2) {
					var lastCalcX = calcOneSection(lastRowItems, 'X');
					sections.push({
						axis: 'X',
						name: 'X-' + rowKeys[rowKeys.length - 1],
						station: lastRowItems[0].y,
						cutArea: lastCalcX.cutArea,
						fillArea: lastCalcX.fillArea,
						netArea: lastCalcX.netArea,
						length: lastCalcX.length,
						start: lastCalcX.start,
						end: lastCalcX.end,
						profile: lastCalcX.profile
					});
				}
			}
		}

		if (includeY) {
			for (var ci = 0; ci < colKeys.length; ci += stepRows) {
				var colKey = colKeys[ci];
				var colItems = byCol[colKey];
				if (!colItems || colItems.length < 2) continue;
				var colCalc = calcOneSection(colItems, 'Y');
				sections.push({
					axis: 'Y',
					name: 'Y-' + colKey,
					station: colItems[0].x,
					cutArea: colCalc.cutArea,
					fillArea: colCalc.fillArea,
					netArea: colCalc.netArea,
					length: colCalc.length,
					start: colCalc.start,
					end: colCalc.end,
					profile: colCalc.profile
				});
			}
			if (colKeys.length > 0 && (colKeys.length - 1) % stepRows !== 0) {
				var lastColItems = byCol[colKeys[colKeys.length - 1]];
				if (lastColItems && lastColItems.length >= 2) {
					var lastCalcY = calcOneSection(lastColItems, 'Y');
					sections.push({
						axis: 'Y',
						name: 'Y-' + colKeys[colKeys.length - 1],
						station: lastColItems[0].x,
						cutArea: lastCalcY.cutArea,
						fillArea: lastCalcY.fillArea,
						netArea: lastCalcY.netArea,
						length: lastCalcY.length,
						start: lastCalcY.start,
						end: lastCalcY.end,
						profile: lastCalcY.profile
					});
				}
			}
		}

		return sections;
	}

	function _summarizeSources(sampledNodes) {
		var m = Object.create(null);
		for (var i = 0; i < sampledNodes.length; i++) {
			var s = sampledNodes[i].source || 'unknown';
			m[s] = (m[s] || 0) + 1;
		}
		return m;
	}

	function _formatSectionDirectionLabel(mode) {
		var m = String(mode || 'both').toLowerCase();
		if (m === 'x') return 'Yalniz X';
		if (m === 'y') return 'Yalniz Y';
		if (m === 'dominant') return 'Otomatik (baskin eksen)';
		return 'X + Y (tam)';
	}

	function _countSectionsByAxis(sections) {
		var xCount = 0;
		var yCount = 0;
		for (var i = 0; i < (sections || []).length; i++) {
			if (sections[i].axis === 'X') xCount++;
			else if (sections[i].axis === 'Y') yCount++;
		}
		return {
			x: xCount,
			y: yCount,
			total: xCount + yCount
		};
	}

	function _clearSectionInspector(message) {
		if (_sectionSelectEl) {
			_sectionSelectEl.innerHTML = '<option value="">Hesap sonrasi secin</option>';
			_sectionSelectEl.disabled = true;
		}
		if (_sectionFocusBtn) _sectionFocusBtn.disabled = true;
		if (_sectionMetaEl) _sectionMetaEl.textContent = message || 'Kesit metrikleri burada gosterilecek.';
		if (_sectionProfileEl) {
			_sectionProfileEl.innerHTML = '<text x="160" y="78" text-anchor="middle" class="vp-section-empty">' + _escapeHtml(message || 'Kesit profili hesap sonrasinda olusur.') + '</text>';
		}
		_clearFocusedSection();
	}

	function _pickDefaultSectionIndex(sections) {
		if (!Array.isArray(sections) || sections.length === 0) return -1;
		var bestIdx = 0;
		var bestScore = -Infinity;
		for (var i = 0; i < sections.length; i++) {
			var sec = sections[i] || {};
			var score = Math.abs(sec.netArea || 0) + (Math.abs(sec.cutArea || 0) * 0.15) + (Math.abs(sec.fillArea || 0) * 0.15);
			if (score > bestScore) {
				bestScore = score;
				bestIdx = i;
			}
		}
		return bestIdx;
	}

	function _renderSectionProfileSvg(section, refElevation) {
		if (!_sectionProfileEl) return;
		if (!section || !Array.isArray(section.profile) || section.profile.length < 2) {
			_sectionProfileEl.innerHTML = '<text x="160" y="78" text-anchor="middle" class="vp-section-empty">Yeterli kesit profili verisi yok.</text>';
			return;
		}

		var profile = section.profile;
		var width = 320;
		var height = 148;
		var padLeft = 36;
		var padRight = 10;
		var padTop = 10;
		var padBottom = 24;
		var minStation = Infinity;
		var maxStation = -Infinity;
		var minZ = Infinity;
		var maxZ = -Infinity;

		for (var i = 0; i < profile.length; i++) {
			var p = profile[i];
			if (!isFinite(p.station) || !isFinite(p.z)) continue;
			minStation = Math.min(minStation, p.station);
			maxStation = Math.max(maxStation, p.station);
			minZ = Math.min(minZ, p.z, refElevation);
			maxZ = Math.max(maxZ, p.z, refElevation);
		}

		if (!isFinite(minStation) || !isFinite(maxStation) || !isFinite(minZ) || !isFinite(maxZ)) {
			_sectionProfileEl.innerHTML = '<text x="160" y="78" text-anchor="middle" class="vp-section-empty">Kesit koordinatlari gecersiz.</text>';
			return;
		}

		if ((maxStation - minStation) < 1e-6) maxStation = minStation + 1;
		if ((maxZ - minZ) < 0.01) maxZ = minZ + 0.5;

		var plotW = width - padLeft - padRight;
		var plotH = height - padTop - padBottom;
		var xOf = function (station) {
			return padLeft + ((station - minStation) / (maxStation - minStation)) * plotW;
		};
		var yOf = function (zVal) {
			return padTop + ((maxZ - zVal) / (maxZ - minZ)) * plotH;
		};

		var hLines = '';
		for (var g = 0; g <= 4; g++) {
			var zg = minZ + ((maxZ - minZ) * (g / 4));
			var yg = yOf(zg);
			hLines += '<line x1="' + padLeft + '" y1="' + _formatNum(yg, 2) + '" x2="' + (width - padRight) + '" y2="' + _formatNum(yg, 2) + '" stroke="rgba(71,85,105,0.55)" stroke-width="1" />';
			hLines += '<text x="4" y="' + _formatNum(yg + 3, 2) + '" font-size="8" fill="#94a3b8">' + _escapeHtml(_formatNum(zg, 2)) + '</text>';
		}

		var refY = yOf(refElevation);
		var segs = '';
		var markers = '';
		for (var si = 1; si < profile.length; si++) {
			var p0 = profile[si - 1];
			var p1 = profile[si];
			var x0 = xOf(p0.station);
			var y0 = yOf(p0.z);
			var x1 = xOf(p1.station);
			var y1 = yOf(p1.z);
			var avgZ = (p0.z + p1.z) * 0.5;
			var segColor = avgZ >= refElevation ? '#ef4444' : '#3b82f6';
			segs += '<line x1="' + _formatNum(x0, 2) + '" y1="' + _formatNum(y0, 2) + '" x2="' + _formatNum(x1, 2) + '" y2="' + _formatNum(y1, 2) + '" stroke="' + segColor + '" stroke-width="2.3" stroke-linecap="round" />';
		}

		for (var mi = 0; mi < profile.length; mi++) {
			var mp = profile[mi];
			var mx = xOf(mp.station);
			var my = yOf(mp.z);
			var mColor = mp.z >= refElevation ? '#f87171' : '#60a5fa';
			markers += '<circle cx="' + _formatNum(mx, 2) + '" cy="' + _formatNum(my, 2) + '" r="2.1" fill="' + mColor + '" />';
		}

		_sectionProfileEl.innerHTML = [
			'<rect x="0" y="0" width="320" height="148" fill="transparent" />',
			hLines,
			'<line x1="' + padLeft + '" y1="' + _formatNum(refY, 2) + '" x2="' + (width - padRight) + '" y2="' + _formatNum(refY, 2) + '" stroke="#22d3ee" stroke-width="1.2" stroke-dasharray="4 3" />',
			'<text x="' + (width - padRight - 2) + '" y="' + _formatNum(refY - 3, 2) + '" font-size="8" fill="#67e8f9" text-anchor="end">Ref ' + _escapeHtml(_formatNum(refElevation, 2)) + ' m</text>',
			segs,
			markers,
			'<line x1="' + padLeft + '" y1="' + (height - padBottom) + '" x2="' + (width - padRight) + '" y2="' + (height - padBottom) + '" stroke="#64748b" stroke-width="1" />',
			'<text x="' + padLeft + '" y="' + (height - 6) + '" font-size="8" fill="#94a3b8">' + _escapeHtml(_formatNum(minStation, 2)) + ' m</text>',
			'<text x="' + (width - padRight) + '" y="' + (height - 6) + '" font-size="8" fill="#94a3b8" text-anchor="end">' + _escapeHtml(_formatNum(maxStation, 2)) + ' m</text>'
		].join('');
	}

	function _focusSelectedSection(shouldFly) {
		_clearFocusedSection();
		if (!_lastResult || !_lastResult.sections || _lastResult.sections.length === 0) return;
		if (_selectedSectionIndex < 0 || _selectedSectionIndex >= _lastResult.sections.length) return;
		if (_vizSectionsEl && !_vizSectionsEl.checked) return;

		var section = _lastResult.sections[_selectedSectionIndex];
		if (!section || !section.start || !section.end) return;

		var ll1 = section.startWgs || _tm30ToWgs(section.start.x, section.start.y);
		var ll2 = section.endWgs || _tm30ToWgs(section.end.x, section.end.y);
		if (!ll1 || !ll2) return;

		var p1 = Cesium.Cartesian3.fromDegrees(ll1.lon, ll1.lat, (_lastResult.referenceElevation || 0) + 0.35);
		var p2 = Cesium.Cartesian3.fromDegrees(ll2.lon, ll2.lat, (_lastResult.referenceElevation || 0) + 0.35);
		var focusColor = Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.95);
		var prim = null;
		if (typeof createStablePolyline === 'function') {
			prim = createStablePolyline([p1, p2], 5, focusColor);
		} else if (drawLayer && drawLayer.entities) {
			prim = drawLayer.entities.add({
				polyline: {
					positions: [p1, p2],
					width: 5,
					material: new Cesium.PolylineGlowMaterialProperty({
						glowPower: 0.22,
						color: focusColor
					}),
					depthFailMaterial: focusColor
				}
			});
		}
		if (prim) _vizState.focusedSectionPrimitive = prim;

		if (shouldFly && viewer && viewer.camera) {
			try {
				var range = Math.max(45, (section.length || 20) * 2.2);
				var bs = Cesium.BoundingSphere.fromPoints([p1, p2]);
				viewer.camera.flyToBoundingSphere(bs, {
					duration: 0.9,
					offset: new Cesium.HeadingPitchRange(0, -0.45, range)
				});
			} catch (e5) { }
		}

		_safeRequestRender();
	}

	function _updateSectionInspector() {
		if (!_lastResult || !_lastResult.sections || _lastResult.sections.length === 0) {
			_clearSectionInspector('Kesit uretilmedi.');
			return;
		}
		if (_selectedSectionIndex < 0 || _selectedSectionIndex >= _lastResult.sections.length) {
			_selectedSectionIndex = 0;
		}

		if (_sectionSelectEl) {
			_sectionSelectEl.value = String(_selectedSectionIndex);
			_sectionSelectEl.disabled = false;
		}
		if (_sectionFocusBtn) _sectionFocusBtn.disabled = false;

		var sec = _lastResult.sections[_selectedSectionIndex];
		if (!sec) return;
		var balanceLabel = sec.netArea >= 0 ? 'Dolgu agirlikli' : 'Kazi agirlikli';
		if (_sectionMetaEl) {
			_sectionMetaEl.innerHTML = '<b>' + _escapeHtml(sec.name) + '</b> | Eksen: ' + _escapeHtml(sec.axis) +
				' | Istasyon: ' + _formatNum(sec.station, 2) + ' m<br>' +
				'Uzunluk: ' + _formatNum(sec.length, 2) + ' m | Kazi: ' + _formatNum(sec.cutArea, 2) + ' m2 | Dolgu: ' + _formatNum(sec.fillArea, 2) + ' m2 | Net: ' + _formatNum(sec.netArea, 2) + ' m2 (' + balanceLabel + ')';
		}

		_renderSectionProfileSvg(sec, _lastResult.referenceElevation);
		_focusSelectedSection(false);
	}

	function _populateSectionInspector(result) {
		if (!result || !Array.isArray(result.sections) || result.sections.length === 0) {
			_clearSectionInspector('Kesit uretilmedi.');
			return;
		}

		if (_sectionSelectEl) {
			var html = [];
			for (var i = 0; i < result.sections.length; i++) {
				var sec = result.sections[i];
				html.push('<option value="' + i + '">' + _escapeHtml(sec.name + ' | ' + sec.axis + ' | Net ' + _formatNum(sec.netArea, 2) + ' m2') + '</option>');
			}
			_sectionSelectEl.innerHTML = html.join('');
		}

		_selectedSectionIndex = _pickDefaultSectionIndex(result.sections);
		if (_selectedSectionIndex < 0) _selectedSectionIndex = 0;
		_updateSectionInspector();
	}

	function _renderSummary(result) {
		if (!_summaryEl) return;
		var topSections = result.sections.slice(0, 8);
		var sectionCounts = _countSectionsByAxis(result.sections || []);
		var sourcePairs = [];
		for (var k in result.sourceStats) {
			if (!Object.prototype.hasOwnProperty.call(result.sourceStats, k)) continue;
			sourcePairs.push(k + ': ' + result.sourceStats[k]);
		}
		var sourceNote = result.surfaceSourceNote ? ('<div><b>Kaynak Notu:</b> ' + _escapeHtml(result.surfaceSourceNote) + '</div>') : '';
		_summaryEl.innerHTML = [
			'<div><b>Yontem:</b> Prismoidal Grid + hucre ucgen entegrasyon</div>',
			'<div><b>Standart Notu:</b> ' + _escapeHtml(result.standardNote || VOLUME_STANDARD_NOTE) + '</div>',
			'<div><b>Koordinat:</b> EPSG:5254 (TM30)</div>',
			'<div><b>Grid:</b> ' + _formatNum(result.gridSpacing, 2) + ' m | <b>Kesit:</b> ' + _formatNum(result.sectionInterval, 2) + ' m | <b>Sure:</b> ' + _formatNum((result.runTimeMs || 0) / 1000, 2) + ' sn</div>',
			'<div><b>Kesit Yonu:</b> ' + _escapeHtml(_formatSectionDirectionLabel(result.sectionDirection)) + ' | <b>Dagilim:</b> X=' + sectionCounts.x + ' | Y=' + sectionCounts.y + ' | Toplam=' + sectionCounts.total + '</div>',
			'<div><b>Referans:</b> ' + _formatNum(result.referenceElevation, 3) + ' m (' + _escapeHtml(result.referenceMode) + ')</div>',
			'<div><b>Alan:</b> ' + _formatNum(result.polygonArea, 2) + ' m² | <b>Hucre:</b> ' + result.cells.length + ' | <b>Dugum:</b> ' + result.sampledNodes.length + '</div>',
			'<div><b>Kazi:</b> ' + _formatNum(result.cutVolume, 2) + ' m³</div>',
			'<div><b>Dolgu:</b> ' + _formatNum(result.fillVolume, 2) + ' m³</div>',
			'<div><b>Net (Dolgu-Kazi):</b> ' + _formatNum(result.netVolume, 2) + ' m³</div>',
			'<div><b>Ortalama mutlak derinlik:</b> ' + _formatNum(result.meanAbsDepth, 3) + ' m</div>',
			'<div><b>Kalite Skoru:</b> ' + _formatNum(result.qualityScore, 1) + '/100 (' + _escapeHtml(result.qualityClass) + ')</div>',
			'<div><b>Fallback Orani:</b> %' + _formatNum((result.fallbackRate || 0) * 100, 2) + '</div>',
			'<div><b>Ornek kaynak dagilimi:</b> ' + _escapeHtml(sourcePairs.join(' | ')) + '</div>',
			sourceNote,
			'<table><thead><tr><th>Kesit</th><th>Eksen</th><th>Kazi Alan</th><th>Dolgu Alan</th><th>Net</th></tr></thead><tbody>' +
				topSections.map(function (s) {
					return '<tr><td>' + _escapeHtml(s.name) + '</td><td>' + _escapeHtml(s.axis) + '</td><td>' + _formatNum(s.cutArea, 2) + '</td><td>' + _formatNum(s.fillArea, 2) + '</td><td>' + _formatNum(s.netArea, 2) + '</td></tr>';
				}).join('') +
			'</tbody></table>'
		].join('');
	}

	function _visualizeResult(result, options) {
		_clearVisualization();
		if (!result || !viewer || !viewer.scene) return;

		var showCutFill = !options || options.showCutFill !== false;
		var showSections = !options || options.showSections !== false;
		var showLabel = !options || options.showLabel !== false;

		if (showCutFill) {
			try {
				var pointsCol = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
				var step = 1;
				if (result.cells.length > 12000) step = 3;
				else if (result.cells.length > 6000) step = 2;

				for (var i = 0; i < result.cells.length; i += step) {
					var c = result.cells[i];
					var color = c.dz > 0.005
						? Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.78)
						: (c.dz < -0.005
							? Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.78)
							: Cesium.Color.fromCssColorString('#cbd5e1').withAlpha(0.55));
					pointsCol.add({
						position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z + 0.2),
						pixelSize: 4,
						color: color,
						outlineColor: Cesium.Color.BLACK.withAlpha(0.35),
						outlineWidth: 1,
						disableDepthTestDistance: Number.POSITIVE_INFINITY
					});
				}
				_vizState.cutFillCollection = pointsCol;
			} catch (e1) {
				console.warn('[Volume] Cut/Fill gorsellestirme hatasi:', e1);
			}
		}

		if (showSections && Array.isArray(result.sections)) {
			var maxSections = Math.min(160, result.sections.length);
			var sectionStep = result.sections.length > 220 ? 2 : 1;
			for (var s = 0; s < maxSections; s += sectionStep) {
				var sec = result.sections[s];
				if (!sec.start || !sec.end) continue;
				var ll1 = sec.startWgs || _tm30ToWgs(sec.start.x, sec.start.y);
				var ll2 = sec.endWgs || _tm30ToWgs(sec.end.x, sec.end.y);
				if (!ll1 || !ll2) continue;
				var p1 = Cesium.Cartesian3.fromDegrees(ll1.lon, ll1.lat, result.referenceElevation + 0.1);
				var p2 = Cesium.Cartesian3.fromDegrees(ll2.lon, ll2.lat, result.referenceElevation + 0.1);
				var secColor = sec.axis === 'X'
					? Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.82)
					: Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.82);
				var prim = null;
				if (typeof createStablePolyline === 'function') {
					prim = createStablePolyline([p1, p2], 2, secColor);
				} else {
					prim = drawLayer && drawLayer.entities
						? drawLayer.entities.add({
							polyline: {
								positions: [p1, p2],
								width: 2,
								material: new Cesium.ColorMaterialProperty(secColor)
							}
						})
						: null;
				}
				if (prim) _vizState.sectionPrimitives.push(prim);
			}
		}

		if (showLabel && Array.isArray(result.boundary) && result.boundary.length > 0) {
			var cx = 0;
			var cy = 0;
			for (var bi = 0; bi < result.boundary.length; bi++) {
				cx += result.boundary[bi].x;
				cy += result.boundary[bi].y;
			}
			cx /= result.boundary.length;
			cy /= result.boundary.length;
			var llc = _tm30ToWgs(cx, cy);
			if (llc) {
				var labelPos = Cesium.Cartesian3.fromDegrees(llc.lon, llc.lat, result.referenceElevation + 1.2);
				var text = 'Net: ' + _formatNum(result.netVolume, 2) + ' m3 | Kazi: ' + _formatNum(result.cutVolume, 2) + ' | Dolgu: ' + _formatNum(result.fillVolume, 2);
				if (typeof addLabel === 'function') {
					_vizState.summaryLabel = addLabel(labelPos, text, Cesium.Color.fromCssColorString('#f8fafc'));
				} else if (drawLayer && drawLayer.entities) {
					_vizState.summaryLabel = drawLayer.entities.add({
						position: labelPos,
						label: {
							text: text,
							font: 'bold 13px sans-serif',
							fillColor: Cesium.Color.WHITE,
							outlineColor: Cesium.Color.BLACK,
							outlineWidth: 2,
							style: Cesium.LabelStyle.FILL_AND_OUTLINE,
							showBackground: true,
							backgroundColor: Cesium.Color.BLACK.withAlpha(0.6)
						}
					});
				}
			}
		}

		_safeRequestRender();
	}

	async function _calculateVolume(measurement, opts) {
		var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
		_setStatus('Grid olusturuluyor...', 'info');
		_setProgress(4);

		var polyTm = measurement.points.map(_cartesianToTmNode);
		var polygonArea = _shoelaceArea(polyTm);
		if (!(polygonArea > 0)) throw new Error('Polygon alani hesaplanamadi.');

		var framework = _buildGrid(polyTm, opts.gridSpacing);
		if (framework.nodes.length > MAX_GRID_NODES) {
			throw new Error('Grid dugum sayisi cok yuksek (' + framework.nodes.length + '). Grid araligini buyutun.');
		}
		if (framework.cells.length > MAX_GRID_CELLS) {
			throw new Error('Grid hucre sayisi cok yuksek (' + framework.cells.length + '). Grid araligini buyutun.');
		}
		if (framework.cells.length === 0) {
			throw new Error('Secili alanda grid hucre uretilmedi. Grid araligini kucultun.');
		}

		_setStatus('Yukseklik ornekleri aliniyor...', 'info');
		var sampledNodes = await _sampleNodeHeights(framework.nodes, polyTm, function (p) {
			_setProgress(6 + (p * 0.72));
		}, opts.surfaceSource);

		var nodeMap = Object.create(null);
		for (var i = 0; i < sampledNodes.length; i++) {
			nodeMap[sampledNodes[i].ix + '_' + sampledNodes[i].iy] = sampledNodes[i];
		}

		var refElevation = _computeReferenceElevation(opts.referenceMode, opts.fixedReference, sampledNodes);
		var rawCoverageArea = framework.coverageAreaRaw > 0 ? framework.coverageAreaRaw : (framework.cells.length * opts.gridSpacing * opts.gridSpacing);
		var areaCorrection = polygonArea / rawCoverageArea;

		_setStatus('Hacim entegrasyonu yapiliyor...', 'info');
		_setProgress(82);

		var cellRows = [];
		var cutVolume = 0;
		var fillVolume = 0;
		var absDepthAcc = 0;
		for (var ci = 0; ci < framework.cells.length; ci++) {
			var cell = framework.cells[ci];
			var n00 = nodeMap[cell.n00];
			var n10 = nodeMap[cell.n10];
			var n11 = nodeMap[cell.n11];
			var n01 = nodeMap[cell.n01];
			if (!n00 || !n10 || !n11 || !n01) continue;
			var cellArea = (cell.coverage || 1) * opts.gridSpacing * opts.gridSpacing * areaCorrection;
			var triArea = cellArea * 0.5;

			var tri1Avg = (n00.z + n10.z + n11.z) / 3;
			var tri2Avg = (n00.z + n11.z + n01.z) / 3;
			var tri1Dz = tri1Avg - refElevation;
			var tri2Dz = tri2Avg - refElevation;

			var tri1Cut = tri1Dz > 0 ? tri1Dz * triArea : 0;
			var tri1Fill = tri1Dz < 0 ? (-tri1Dz) * triArea : 0;
			var tri2Cut = tri2Dz > 0 ? tri2Dz * triArea : 0;
			var tri2Fill = tri2Dz < 0 ? (-tri2Dz) * triArea : 0;
			var cellCut = tri1Cut + tri2Cut;
			var cellFill = tri1Fill + tri2Fill;

			cutVolume += cellCut;
			fillVolume += cellFill;
			var zCenter = (n00.z + n10.z + n11.z + n01.z) / 4;
			var dzCenter = zCenter - refElevation;
			absDepthAcc += Math.abs(dzCenter);

			var ll = _tm30ToWgs(cell.x, cell.y) || { lon: 0, lat: 0 };
			cellRows.push({
				ix: cell.ix,
				iy: cell.iy,
				x: cell.x,
				y: cell.y,
				lon: ll.lon,
				lat: ll.lat,
				z: zCenter,
				dz: dzCenter,
				cutVolume: cellCut,
				fillVolume: cellFill,
				netVolume: cellFill - cellCut,
				refElevation: refElevation,
				nodeSources: [n00.source, n10.source, n11.source, n01.source].join('|')
			});
		}

		if (cellRows.length === 0) throw new Error('Gecerli hucre hacmi hesaplanamadi.');

		_setStatus('Kesitler olusturuluyor...', 'info');
		_setProgress(92);
		var sections = _buildSections(cellRows, opts.gridSpacing, opts.sectionInterval, refElevation, opts.sectionDirection, framework);
		if (!sections || sections.length === 0) {
			throw new Error('Secilen kesit yonunde kesit olusturulamadi. Kesit araligini buyutun veya yonu degistirin.');
		}
		for (var si = 0; si < sections.length; si++) {
			if (sections[si].start) sections[si].startWgs = _tm30ToWgs(sections[si].start.x, sections[si].start.y);
			if (sections[si].end) sections[si].endWgs = _tm30ToWgs(sections[si].end.x, sections[si].end.y);
		}
		var sourceStats = _summarizeSources(sampledNodes);
		var fallbackCount = sourceStats.vertexWeightedFallback || 0;
		var fallbackRate = sampledNodes.length > 0 ? (fallbackCount / sampledNodes.length) : 1;
		var qualityScore = Math.max(0, Math.min(100, 100 - (fallbackRate * 65)));
		var qualityClass = qualityScore >= 92 ? 'A' : (qualityScore >= 80 ? 'B' : (qualityScore >= 65 ? 'C' : 'D'));
		var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

		_setProgress(100);
		return {
			timestamp: _timestampTag(),
			measurementId: measurement.id,
			measurementName: measurement.name || ('' + measurement.id),
			referenceMode: opts.referenceMode,
			referenceElevation: refElevation,
			gridSpacing: opts.gridSpacing,
			sectionInterval: opts.sectionInterval,
			sectionDirection: opts.sectionDirection,
			surfaceSource: opts.surfaceSourceSelection || opts.surfaceSource,
			surfaceSourceUsed: _surfaceSourceUsed,
			surfaceSourceNote: _surfaceSourceNote,
			polygonArea: polygonArea,
			cells: cellRows,
			sampledNodes: sampledNodes,
			sourceStats: sourceStats,
			fallbackRate: fallbackRate,
			qualityScore: qualityScore,
			qualityClass: qualityClass,
			cutVolume: cutVolume,
			fillVolume: fillVolume,
			netVolume: fillVolume - cutVolume,
			meanAbsDepth: absDepthAcc / Math.max(1, cellRows.length),
			sections: sections,
			boundary: polyTm,
			runTimeMs: (t1 - t0),
			standardNote: VOLUME_STANDARD_NOTE
		};
	}

	function _downloadBlob(content, mimeType, fileName) {
		var blob = new Blob([content], { type: mimeType });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		a.click();
		setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
	}

	function _exportExcel(result) {
		if (typeof XLSX === 'undefined') {
			_showError('Excel raporu icin SheetJS (XLSX) bulunamadi.');
			return;
		}
		var wb = XLSX.utils.book_new();

		var summaryRows = [
			['Alan', 'Deger'],
			['Rapor Zamani', result.timestamp],
			['Olcum ID', result.measurementId],
			['Olcum Adi', result.measurementName],
			['Yontem', 'Prismoidal Grid + Ucgen Entegrasyon'],
			['Standart Notu', result.standardNote || VOLUME_STANDARD_NOTE],
			['Kesit Yonu', _formatSectionDirectionLabel(result.sectionDirection)],
			['Yuzey Kaynagi (secim)', result.surfaceSource],
			['Yuzey Kaynagi (kullanilan)', result.surfaceSourceUsed || result.surfaceSource],
			['Kaynak Notu', result.surfaceSourceNote || '-'],
			['Grid Araligi (m)', result.gridSpacing],
			['Kesit Araligi (m)', result.sectionInterval],
			['Hesaplama Suresi (sn)', _formatNum((result.runTimeMs || 0) / 1000, 3)],
			['Referans Modu', result.referenceMode],
			['Referans Kotu (m)', _formatNum(result.referenceElevation, 4)],
			['Alan (m2)', _formatNum(result.polygonArea, 3)],
			['Kazi Hacmi (m3)', _formatNum(result.cutVolume, 3)],
			['Dolgu Hacmi (m3)', _formatNum(result.fillVolume, 3)],
			['Net Hacim (Dolgu-Kazi) (m3)', _formatNum(result.netVolume, 3)],
			['Ortalama Mutlak Derinlik (m)', _formatNum(result.meanAbsDepth, 4)],
			['Kalite Skoru (0-100)', _formatNum(result.qualityScore, 2)],
			['Kalite Sinifi', result.qualityClass || '-'],
			['Fallback Orani (%)', _formatNum((result.fallbackRate || 0) * 100, 3)],
			['Hucre Sayisi', result.cells.length],
			['Dugum Sayisi', result.sampledNodes.length]
		];
		XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Ozet');

		var gridRows = result.cells.map(function (r) {
			return {
				ix: r.ix,
				iy: r.iy,
				x_tm30: r.x,
				y_tm30: r.y,
				lon_wgs84: r.lon,
				lat_wgs84: r.lat,
				z_surface_m: r.z,
				z_reference_m: r.refElevation,
				delta_h_m: r.dz,
				cut_m3: r.cutVolume,
				fill_m3: r.fillVolume,
				net_m3: r.netVolume,
				node_sources: r.nodeSources
			};
		});
		XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gridRows), 'Grid_Hucreleri');

		var sectionRows = result.sections.map(function (s) {
			return {
				axis: s.axis,
				name: s.name,
				station: s.station,
				length_m: s.length,
				cut_area_m2: s.cutArea,
				fill_area_m2: s.fillArea,
				net_area_m2: s.netArea
			};
		});
		XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sectionRows), 'Kesit_Ozet');

		var sectionProfileRows = [];
		result.sections.forEach(function (s) {
			s.profile.forEach(function (p, idx) {
				sectionProfileRows.push({
					axis: s.axis,
					section: s.name,
					point_no: idx + 1,
					station: p.station,
					z_surface_m: p.z,
					z_reference_m: result.referenceElevation,
					delta_h_m: p.z - result.referenceElevation
				});
			});
		});
		XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sectionProfileRows), 'Kesit_Profil');

		var boundaryRows = result.boundary.map(function (b, i) {
			return { order: i + 1, x_tm30: b.x, y_tm30: b.y, z_vertex: b.z };
		});
		XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(boundaryRows), 'Sinir_Poligon');

		XLSX.writeFile(wb, 'Hacim_Raporu_' + result.timestamp + '.xlsx');
		_showInfo('Excel raporu indirildi.');
	}

	function _sampleProfileRowsForPdf(profile, refElevation, maxRows) {
		if (!Array.isArray(profile) || profile.length === 0) return [];
		if (!isFinite(maxRows) || maxRows <= 0) maxRows = 16;
		if (profile.length <= maxRows) {
			return profile.map(function (p, idx) {
				return [
					'' + (idx + 1),
					_formatNum(p.station, 2),
					_formatNum(p.z, 3),
					_formatNum(p.z - refElevation, 3)
				];
			});
		}

		var rows = [];
		for (var i = 0; i < maxRows; i++) {
			var idx = Math.round((i * (profile.length - 1)) / (maxRows - 1));
			var p = profile[idx];
			rows.push([
				'' + (idx + 1),
				_formatNum(p.station, 2),
				_formatNum(p.z, 3),
				_formatNum(p.z - refElevation, 3)
			]);
		}
		return rows;
	}

	function _drawPdfSectionMiniProfile(doc, section, refElevation, left, top, width, height) {
		doc.setDrawColor(71, 85, 105);
		doc.setLineWidth(0.2);
		doc.rect(left, top, width, height);

		var profile = section && Array.isArray(section.profile) ? section.profile : [];
		if (profile.length < 2) {
			doc.setFontSize(8);
			doc.setTextColor(148, 163, 184);
			doc.text('Yeterli profil noktasi yok.', left + 4, top + 8);
			doc.setTextColor(0, 0, 0);
			return;
		}

		var minStation = Infinity;
		var maxStation = -Infinity;
		var minZ = Infinity;
		var maxZ = -Infinity;
		for (var i = 0; i < profile.length; i++) {
			if (!isFinite(profile[i].station) || !isFinite(profile[i].z)) continue;
			minStation = Math.min(minStation, profile[i].station);
			maxStation = Math.max(maxStation, profile[i].station);
			minZ = Math.min(minZ, profile[i].z, refElevation);
			maxZ = Math.max(maxZ, profile[i].z, refElevation);
		}

		if (!isFinite(minStation) || !isFinite(maxStation) || !isFinite(minZ) || !isFinite(maxZ)) {
			doc.setFontSize(8);
			doc.setTextColor(148, 163, 184);
			doc.text('Kesit olcegi olusturulamadi.', left + 4, top + 8);
			doc.setTextColor(0, 0, 0);
			return;
		}

		if ((maxStation - minStation) < 1e-6) maxStation = minStation + 1;
		if ((maxZ - minZ) < 0.01) maxZ = minZ + 0.5;

		var padL = 16;
		var padR = 6;
		var padT = 6;
		var padB = 12;
		var plotLeft = left + padL;
		var plotRight = left + width - padR;
		var plotTop = top + padT;
		var plotBottom = top + height - padB;
		var plotW = plotRight - plotLeft;
		var plotH = plotBottom - plotTop;

		var xOf = function (station) {
			return plotLeft + ((station - minStation) / (maxStation - minStation)) * plotW;
		};
		var yOf = function (zVal) {
			return plotTop + ((maxZ - zVal) / (maxZ - minZ)) * plotH;
		};

		doc.setFontSize(7);
		doc.setTextColor(148, 163, 184);
		for (var g = 0; g <= 4; g++) {
			var zg = minZ + ((maxZ - minZ) * (g / 4));
			var gy = yOf(zg);
			doc.setDrawColor(71, 85, 105);
			doc.setLineWidth(0.1);
			doc.line(plotLeft, gy, plotRight, gy);
			doc.text(_formatNum(zg, 2), left + 1, gy + 1.4);
		}

		var refY = yOf(refElevation);
		doc.setDrawColor(34, 211, 238);
		if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([1.2, 0.8], 0);
		doc.setLineWidth(0.25);
		doc.line(plotLeft, refY, plotRight, refY);
		if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([], 0);
		doc.setTextColor(34, 211, 238);
		doc.text('Ref ' + _formatNum(refElevation, 2), plotRight - 18, refY - 1.2);

		for (var si = 1; si < profile.length; si++) {
			var p0 = profile[si - 1];
			var p1 = profile[si];
			if (!isFinite(p0.station) || !isFinite(p0.z) || !isFinite(p1.station) || !isFinite(p1.z)) continue;
			var x0 = xOf(p0.station);
			var y0 = yOf(p0.z);
			var x1 = xOf(p1.station);
			var y1 = yOf(p1.z);
			var avg = (p0.z + p1.z) * 0.5;
			if (avg >= refElevation) {
				doc.setDrawColor(239, 68, 68);
				doc.setFillColor(239, 68, 68);
			} else {
				doc.setDrawColor(59, 130, 246);
				doc.setFillColor(59, 130, 246);
			}
			doc.setLineWidth(0.5);
			doc.line(x0, y0, x1, y1);
			doc.circle(x1, y1, 0.38, 'F');
		}

		doc.setDrawColor(100, 116, 139);
		doc.setLineWidth(0.2);
		doc.line(plotLeft, plotBottom, plotRight, plotBottom);
		doc.line(plotLeft, plotTop, plotLeft, plotBottom);
		doc.setTextColor(148, 163, 184);
		doc.text(_formatNum(minStation, 2) + ' m', plotLeft, plotBottom + 4);
		doc.text(_formatNum(maxStation, 2) + ' m', plotRight - 14, plotBottom + 4);
		doc.setTextColor(0, 0, 0);
	}

	function _exportPdf(result) {
		var JsPdfCtor = null;
		if (window.jspdf && window.jspdf.jsPDF) JsPdfCtor = window.jspdf.jsPDF;
		else if (window.jsPDF) JsPdfCtor = window.jsPDF;
		if (!JsPdfCtor) {
			_showError('PDF raporu icin jsPDF kutuphanesi bulunamadi.');
			return;
		}

		var doc = new JsPdfCtor({ orientation: 'p', unit: 'mm', format: 'a4' });
		var y = 14;
		var sectionCounts = _countSectionsByAxis(result.sections || []);
		doc.setFontSize(14);
		doc.text('HACIM HESAP RAPORU', 14, y);
		y += 7;
		doc.setFontSize(9);
		doc.text('Yontem: Prismoidal Grid + hucre icinde ucgen bazli entegrasyon', 14, y);
		y += 5;
		doc.text('Kaynak: 3D Tile modeli | Koordinat: EPSG:5254 TM30', 14, y);
		y += 7;

		var summaryPairs = [
			['Rapor Zamani', result.timestamp],
			['Olcum ID', result.measurementId],
			['Olcum Adi', result.measurementName],
			['Standart Notu', result.standardNote || VOLUME_STANDARD_NOTE],
			['Kesit Yonu', _formatSectionDirectionLabel(result.sectionDirection)],
			['Kesit Dagilimi', 'X=' + sectionCounts.x + ' | Y=' + sectionCounts.y + ' | Toplam=' + sectionCounts.total],
			['Kaynak (secim/kullanilan)', (result.surfaceSource || '-') + ' / ' + (result.surfaceSourceUsed || result.surfaceSource || '-')],
			['Kaynak Notu', result.surfaceSourceNote || '-'],
			['Grid Araligi (m)', _formatNum(result.gridSpacing, 3)],
			['Kesit Araligi (m)', _formatNum(result.sectionInterval, 3)],
			['Hesaplama Suresi (sn)', _formatNum((result.runTimeMs || 0) / 1000, 3)],
			['Referans Modu', result.referenceMode],
			['Referans Kotu (m)', _formatNum(result.referenceElevation, 4)],
			['Alan (m2)', _formatNum(result.polygonArea, 3)],
			['Kazi (m3)', _formatNum(result.cutVolume, 3)],
			['Dolgu (m3)', _formatNum(result.fillVolume, 3)],
			['Net (Dolgu-Kazi) (m3)', _formatNum(result.netVolume, 3)],
			['Ortalama Mutlak Derinlik (m)', _formatNum(result.meanAbsDepth, 4)],
			['Kalite Skoru', _formatNum(result.qualityScore, 2) + ' / 100 (' + (result.qualityClass || '-') + ')'],
			['Fallback Orani', '%' + _formatNum((result.fallbackRate || 0) * 100, 3)],
			['Hucre Sayisi', '' + result.cells.length],
			['Dugum Sayisi', '' + result.sampledNodes.length]
		];

		if (typeof doc.autoTable === 'function') {
			doc.autoTable({
				startY: y,
				head: [['Parametre', 'Deger']],
				body: summaryPairs,
				theme: 'grid',
				styles: { fontSize: 8, cellPadding: 1.8 },
				headStyles: { fillColor: [30, 41, 59] }
			});
			y = doc.lastAutoTable.finalY + 6;
		} else {
			doc.setFontSize(9);
			for (var i = 0; i < summaryPairs.length; i++) {
				doc.text(summaryPairs[i][0] + ': ' + summaryPairs[i][1], 14, y);
				y += 4.5;
				if (y > 280) { doc.addPage(); y = 14; }
			}
			y += 3;
		}

		var sectionRows = result.sections.slice(0, 24).map(function (s) {
			return [s.name, s.axis, _formatNum(s.station, 2), _formatNum(s.cutArea, 2), _formatNum(s.fillArea, 2), _formatNum(s.netArea, 2)];
		});

		if (sectionRows.length > 0) {
			if (typeof doc.autoTable === 'function') {
				doc.autoTable({
					startY: y,
					head: [['Kesit', 'Eksen', 'Istasyon', 'Kazi Alan', 'Dolgu Alan', 'Net Alan']],
					body: sectionRows,
					theme: 'grid',
					styles: { fontSize: 8, cellPadding: 1.5 },
					headStyles: { fillColor: [15, 118, 110] }
				});
				y = doc.lastAutoTable.finalY + 4;
			} else {
				doc.setFontSize(9);
				doc.text('Kesit Ozet (ilk 24):', 14, y);
				y += 4;
				for (var j = 0; j < sectionRows.length; j++) {
					doc.text(sectionRows[j].join(' | '), 14, y);
					y += 4;
					if (y > 280) { doc.addPage(); y = 14; }
				}
			}
		}

		doc.setFontSize(8);
		doc.text('Not: Hesap, secili alanda grid hucrelerinin ucgen bazli prismoidal entegrasyonu ile uretilmistir.', 14, Math.min(290, y + 6));

		for (var si = 0; si < result.sections.length; si++) {
			var sec = result.sections[si];
			doc.addPage();
			doc.setFontSize(12);
			doc.text('KESIT MINI PROFIL - ' + sec.name, 14, 14);
			doc.setFontSize(9);
			doc.text('Eksen: ' + sec.axis + ' | Istasyon: ' + _formatNum(sec.station, 2) + ' m', 14, 20);
			doc.text('Uzunluk: ' + _formatNum(sec.length, 2) + ' m | Kazi Alan: ' + _formatNum(sec.cutArea, 2) + ' m2 | Dolgu Alan: ' + _formatNum(sec.fillArea, 2) + ' m2 | Net: ' + _formatNum(sec.netArea, 2) + ' m2', 14, 25);

			_drawPdfSectionMiniProfile(doc, sec, result.referenceElevation, 14, 30, 182, 86);

			var detailRows = [
				['Kesit Adi', sec.name],
				['Eksen', sec.axis],
				['Istasyon (m)', _formatNum(sec.station, 3)],
				['Uzunluk (m)', _formatNum(sec.length, 3)],
				['Kazi Alani (m2)', _formatNum(sec.cutArea, 3)],
				['Dolgu Alani (m2)', _formatNum(sec.fillArea, 3)],
				['Net Alan (m2)', _formatNum(sec.netArea, 3)],
				['Referans Kotu (m)', _formatNum(result.referenceElevation, 3)]
			];

			if (typeof doc.autoTable === 'function') {
				doc.autoTable({
					startY: 121,
					head: [['Parametre', 'Deger']],
					body: detailRows,
					theme: 'grid',
					styles: { fontSize: 8, cellPadding: 1.5 },
					headStyles: { fillColor: [51, 65, 85] },
					margin: { left: 14, right: 14 }
				});

				var sampleRows = _sampleProfileRowsForPdf(sec.profile, result.referenceElevation, 14);
				doc.autoTable({
					startY: doc.lastAutoTable.finalY + 4,
					head: [['No', 'Istasyon (m)', 'Z Yuzey (m)', 'Delta h (m)']],
					body: sampleRows,
					theme: 'grid',
					styles: { fontSize: 7, cellPadding: 1.2 },
					headStyles: { fillColor: [15, 118, 110] },
					margin: { left: 14, right: 14 }
				});
			} else {
				doc.setFontSize(8);
				var yy = 122;
				for (var dr = 0; dr < detailRows.length; dr++) {
					doc.text(detailRows[dr][0] + ': ' + detailRows[dr][1], 14, yy);
					yy += 4;
				}
			}
		}

		doc.save('Hacim_Raporu_' + result.timestamp + '.pdf');
		_showInfo('PDF raporu indirildi. Her kesit icin mini profil sayfasi eklendi.');
	}

	function _exportCadDxf(result) {
		var refZ = result.referenceElevation;
		var dxf = '0\nSECTION\n2\nENTITIES\n';

		// Boundary polygon at reference elevation.
		dxf += '0\nPOLYLINE\n8\nVOLUME_BOUNDARY\n66\n1\n70\n1\n';
		for (var i = 0; i < result.boundary.length; i++) {
			var b = result.boundary[i];
			dxf += '0\nVERTEX\n8\nVOLUME_BOUNDARY\n10\n' + b.x + '\n20\n' + b.y + '\n30\n' + refZ + '\n70\n32\n';
		}
		dxf += '0\nSEQEND\n8\nVOLUME_BOUNDARY\n';

		for (var c = 0; c < result.cells.length; c++) {
			var cell = result.cells[c];
			var layer = cell.dz > 0 ? 'CUT_CELLS' : (cell.dz < 0 ? 'FILL_CELLS' : 'BALANCE_CELLS');
			dxf += '0\nPOINT\n8\n' + layer + '\n10\n' + cell.x + '\n20\n' + cell.y + '\n30\n' + cell.z + '\n';
		}

		for (var s = 0; s < result.sections.length; s++) {
			var sec = result.sections[s];
			if (!sec.start || !sec.end) continue;
			var secLayer = sec.axis === 'X' ? 'SECTION_X' : 'SECTION_Y';
			dxf += '0\nLINE\n8\n' + secLayer + '\n10\n' + sec.start.x + '\n20\n' + sec.start.y + '\n30\n' + refZ + '\n11\n' + sec.end.x + '\n21\n' + sec.end.y + '\n31\n' + refZ + '\n';
		}

		dxf += '0\nENDSEC\n0\nEOF\n';
		_downloadBlob(dxf, 'application/dxf;charset=utf-8', 'Hacim_Raporu_' + result.timestamp + '.dxf');
		_showInfo('CAD (DXF) raporu indirildi.');
	}

	async function _onComputeClick() {
		if (_isBusy) return;
		var measurement = _ensureSelectionForVolume();
		if (!measurement) return;

		if (typeof EditManager !== 'undefined' && EditManager && EditManager.activeMeasure) {
			EditManager.stopEdit();
		}

		var gridSpacing = parseFloat(_gridEl && _gridEl.value);
		var sectionInterval = parseFloat(_sectionEl && _sectionEl.value);
		var fixedRef = parseFloat(_refValueEl && _refValueEl.value);
		if (!isFinite(gridSpacing) || gridSpacing <= 0) {
			_showError('Grid araligi gecersiz.');
			return;
		}
		if (gridSpacing < 0.25) {
			_showError('Grid araligi en az 0.25 m olmalidir.');
			return;
		}
		if (!isFinite(sectionInterval) || sectionInterval <= 0) {
			_showError('Kesit araligi gecersiz.');
			return;
		}

		var opts = {
			referenceMode: _refModeEl ? _refModeEl.value : 'fixed',
			fixedReference: fixedRef,
			gridSpacing: gridSpacing,
			sectionInterval: sectionInterval,
			sectionDirection: _sectionDirectionEl ? _sectionDirectionEl.value : 'both',
			surfaceSourceSelection: _sourceEl ? _sourceEl.value : 'auto',
			surfaceSource: _resolveSurfaceSource(_sourceEl ? _sourceEl.value : 'auto')
		};

		try {
			_tm30ToWgsCache = Object.create(null);
			_selectedSectionIndex = -1;
			_clearSectionInspector('Hesap yapiliyor...');
			_setBusy(true);
			_lastResult = null;
			_setStatus('Hazirlaniyor...', 'info');
			_setProgress(0);
			_summaryEl.innerHTML = 'Hesap baslatildi...';

			var result = await _calculateVolume(measurement, opts);
			_lastResult = result;
			_renderSummary(result);
			_populateSectionInspector(result);
			_refreshVisualization();
			_setStatus('Hacim hesabi tamamlandi.', 'ok');
			_showInfo('Hacim hesabi tamamlandi. Raporlari indirebilirsiniz.');
			if (result.surfaceSourceNote) {
				_setStatus('Hacim hesabi tamamlandi. Not: ' + result.surfaceSourceNote, 'ok');
			}
			if ((result.fallbackRate || 0) > 0.15) {
				_setStatus('Hesap tamamlandi ancak fallback orani yuksek (%' + _formatNum((result.fallbackRate || 0) * 100, 2) + '). Nihai rapor oncesi daha ince grid ve daha net model onerilir.', 'error');
			}
		} catch (err) {
			console.error('[Volume] hesap hatasi:', err);
			_showError(err && err.message ? err.message : 'Hacim hesabi sirasinda hata olustu.');
			_clearSectionInspector('Hesap hatasi nedeniyle kesit profili olusturulamadi.');
		} finally {
			_setBusy(false);
		}
	}

	function _openPanel() {
		_createPanel();
		if (!_panel) return;
		_clearVisualization();
		_clearSectionInspector('Kesit profili hesap sonrasinda olusur.');

		var measurement = _ensureSelectionForVolume();
		if (!measurement) {
			_exportPdfBtn.disabled = true;
			_exportXlsxBtn.disabled = true;
			_exportCadBtn.disabled = true;
			_setBusy(false);
			return;
		}

		_selectedMeasurementId = measurement.id;
		if (typeof EditManager !== 'undefined' && EditManager && EditManager.activeMeasure) {
			EditManager.stopEdit();
		}

		var polyTm = measurement.points.map(_cartesianToTmNode);
		var minZ = Infinity;
		var maxZ = -Infinity;
		var sumZ = 0;
		for (var i = 0; i < polyTm.length; i++) {
			minZ = Math.min(minZ, polyTm[i].z);
			maxZ = Math.max(maxZ, polyTm[i].z);
			sumZ += polyTm[i].z;
		}
		var meanZ = sumZ / Math.max(1, polyTm.length);
		if (_refModeEl && _refModeEl.value === 'fixed' && _refValueEl) {
			_refValueEl.value = _formatNum(meanZ, 2);
		}

		if (_selectionEl) {
			var area = _shoelaceArea(polyTm);
			_selectionEl.innerHTML = 'Secili Alan: <b>#' + measurement.id + ' - ' + _escapeHtml(measurement.name || '') + '</b><br>' +
				'Kose: ' + measurement.points.length + ' | Alan: ' + _formatNum(area, 2) + ' m² | Z min/max: ' + _formatNum(minZ, 2) + ' / ' + _formatNum(maxZ, 2) + ' m';
		}

		_setProgress(0);
		_setStatus('Hazir. Parametreleri kontrol edip hesaplayin.', 'info');
		if (_summaryEl) _summaryEl.innerHTML = 'Hesap sonucu burada gosterilecek.';
		_lastResult = null;
		_selectedSectionIndex = -1;
		_setBusy(false);
		_panel.style.display = 'block';
	}

	function _bindButton() {
		var btn = document.getElementById('btnVolume');
		if (!btn || btn.__vpBound) return;
		btn.__vpBound = true;
		btn.addEventListener('click', function (e) {
			e.preventDefault();
			e.stopPropagation();
			_openPanel();
		});
	}

	function _init() {
		if (typeof viewer === 'undefined' || typeof Cesium === 'undefined') {
			console.warn('[Volume] Cesium bagimliliklari hazir degil.');
			return;
		}
		_bindButton();
		_createPanel();
		_setStatus('Hazir. Secili alanda hacim butonuna basin.', 'info');
		window.VolumeManager = {
			open: _openPanel,
			calculate: _onComputeClick,
			exportPdf: function () { if (_lastResult) _exportPdf(_lastResult); },
			exportExcel: function () { if (_lastResult) _exportExcel(_lastResult); },
			exportCad: function () { if (_lastResult) _exportCadDxf(_lastResult); },
			getLastResult: function () { return _lastResult; }
		};
		console.info('[Volume] Standalone volume hook loaded.');
	}

	if (window.__cbsMainReady) {
		_init();
	} else {
		window.addEventListener('cbs-main-ready', _init, { once: true });
	}
})();
