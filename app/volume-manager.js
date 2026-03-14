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
	var _refValueLabelEl = null;
	var _refValueEl = null;
	var _gridEl = null;
	var _sectionEl = null;
	var _sectionDirectionEl = null;
	var _sectionGuideRowEl = null;
	var _sectionGuideMetaEl = null;
	var _sectionGuideOptionsRowEl = null;
	var _sectionStationModeEl = null;
	var _sectionSpanModeEl = null;
	var _sectionHalfSpanEl = null;
	var _pickSectionGuideBtn = null;
	var _clearSectionGuideBtn = null;
	var _sourceEl = null;
	var _vizCutBtn = null;
	var _vizFillBtn = null;
	var _vizSectionsEl = null;
	var _vizLabelEl = null;
	var _sectionSelectEl = null;
	var _sectionMetaEl = null;
	var _sectionProfileEl = null;
	var _sectionFocusBtn = null;
	var _legendCutEl = null;
	var _legendFillEl = null;
	var _legendMixedEl = null;
	var _legendBalanceEl = null;
	var _fixedRefUserEdited = false;
	var _activeMeasurementStats = null;
	var _isBusy = false;
	var _lastResult = null;
	var _selectedSectionIndex = -1;
	var _selectedMeasurementId = null;
	var _showCutViz = true;
	var _showFillViz = true;
	var _sectionGuide = null;
	var _sectionGuideHandler = null;
	var _sectionGuidePickPoints = [];
	var _sectionGuidePickCurveMode = false;
	var _isSectionGuidePickMode = false;
	var _surfaceSourceUsed = 'tiles';
	var _surfaceSourceNote = '';
	var _tm30ToWgsCache = Object.create(null);
	var _vizState = {
		cutFillCollection: null,
		sectionPrimitives: [],
		summaryLabel: null,
		focusedSectionPrimitive: null,
		sectionGuidePrimitive: null
	};

	var MAX_GRID_NODES = 25000;
	var MAX_GRID_CELLS = 20000;
	var CUT_FILL_EPS = 1e-6;
	var VOLUME_STANDARD_NOTE = 'Yontem: Prismoidal Grid + kesin sinir kirpma + isaretli ucgen entegrasyonu (RICS/ASTM yaklasimi), TM30 (EPSG:5254) ulusal koordinat uyumu.';

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

	function _classifyCellCutFill(cell) {
		var cut = Math.max(0, Number(cell && cell.cutVolume) || 0);
		var fill = Math.max(0, Number(cell && cell.fillVolume) || 0);
		var hasCut = cut > CUT_FILL_EPS;
		var hasFill = fill > CUT_FILL_EPS;
		return {
			hasCut: hasCut,
			hasFill: hasFill,
			isMixed: hasCut && hasFill,
			isCutOnly: hasCut && !hasFill,
			isFillOnly: hasFill && !hasCut,
			isBalance: !hasCut && !hasFill
		};
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
			'#volumePanel .vp-step{border:1px solid rgba(51,65,85,.65);border-radius:8px;background:rgba(2,6,23,.48);padding:8px 8px 6px 8px;margin-bottom:8px}',
			'#volumePanel .vp-step-h{display:flex;align-items:center;gap:8px;margin-bottom:8px}',
			'#volumePanel .vp-step-no{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;background:rgba(14,116,144,.28);border:1px solid rgba(34,211,238,.45);color:#a5f3fc;font-size:10px;font-weight:800}',
			'#volumePanel .vp-step-title{font-size:11px;font-weight:700;color:#e2e8f0;letter-spacing:.02em}',
			'#volumePanel .vp-row{display:grid;grid-template-columns:132px 1fr;gap:8px;align-items:center;margin-bottom:8px}',
			'#volumePanel .vp-row label{font-size:11px;color:#94a3b8}',
			'#volumePanel select,#volumePanel input[type="number"]{width:100%;height:30px;border-radius:6px;border:1px solid rgba(71,85,105,.9);background:#0b1220;color:#e2e8f0;padding:0 8px;font-size:12px;outline:none}',
			'#volumePanel input[type="checkbox"]{width:14px;height:14px;accent-color:#06b6d4}',
			'#volumePanel .vp-note{font-size:10px;color:#94a3b8;line-height:1.35;background:rgba(15,23,42,.65);padding:8px;border:1px solid rgba(51,65,85,.65);border-radius:6px;margin-bottom:8px}',
			'#volumePanel .vp-btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
			'#volumePanel .vp-btn{border:1px solid rgba(56,189,248,.45);background:rgba(6,78,110,.28);color:#dbeafe;height:30px;padding:0 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700}',
			'#volumePanel .vp-btn.vp-btn-primary{border-color:rgba(14,165,233,.95);background:linear-gradient(180deg,#0ea5e9,#0284c7);color:#f8fafc;box-shadow:0 0 0 1px rgba(14,165,233,.25) inset}',
			'#volumePanel .vp-btn.vp-toggle-off{border-color:rgba(100,116,139,.55);background:rgba(15,23,42,.62);color:#94a3b8}',
			'#volumePanel .vp-btn[disabled]{opacity:.45;cursor:not-allowed}',
			'#volumePanel .vp-legend{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;margin-bottom:2px}',
			'#volumePanel .vp-legend-item{display:inline-flex;align-items:center;gap:5px;padding:3px 6px;border-radius:999px;border:1px solid rgba(71,85,105,.7);background:rgba(15,23,42,.72);font-size:10px;color:#cbd5e1}',
			'#volumePanel .vp-legend-item.vp-legend-off{opacity:.38}',
			'#volumePanel .vp-swatch{display:inline-block;width:9px;height:9px;border-radius:2px}',
			'#volumePanel .vp-swatch-cut{background:#ef4444}',
			'#volumePanel .vp-swatch-fill{background:#3b82f6}',
			'#volumePanel .vp-swatch-mixed{background:#f59e0b}',
			'#volumePanel .vp-swatch-balance{background:#cbd5e1}',
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
			'<div class="vp-step">',
			'<div class="vp-step-h"><span class="vp-step-no">1</span><span class="vp-step-title">Parametreler</span></div>',
			'<div id="vpSelection" class="vp-note">Secili alan bekleniyor.</div>',
			'<div class="vp-note">' + VOLUME_STANDARD_NOTE + '</div>',
			'<div class="vp-row"><label>Referans duzlem</label><select id="vpRefMode"><option value="fixed">Sabit kot</option><option value="min">Min zemin</option><option value="max">Maks zemin</option><option value="mean">Ortalama zemin</option></select></div>',
			'<div class="vp-row"><label id="vpRefValueLabel">Sabit kot (m)</label><input id="vpRefValue" type="number" step="0.01" value="" /></div>',
			'<div class="vp-row"><label>Grid araligi (m)</label><input id="vpGrid" type="number" min="0.25" step="0.25" value="1" /></div>',
			'<div class="vp-row"><label>Yuzey kaynagi</label><select id="vpSource"><option value="auto" selected>Otomatik (onerilen)</option><option value="tiles">3D Tile (aktif model)</option><option value="dsm">DSM (yakinda)</option><option value="pointcloud">Nokta Bulutu (yakinda)</option></select></div>',
			'</div>',
			'<div class="vp-step">',
			'<div class="vp-step-h"><span class="vp-step-no">2</span><span class="vp-step-title">Kesit</span></div>',
			'<div class="vp-row"><label>Kesit araligi (m)</label><input id="vpSection" type="number" min="1" step="1" value="5" /></div>',
			'<div class="vp-row"><label>Kesit yonu</label><select id="vpSectionDirection"><option value="both" selected>X + Y (tam)</option><option value="dominant">Otomatik (baskin eksen)</option><option value="x">Yalniz X kesitleri</option><option value="y">Yalniz Y kesitleri</option><option value="guide">Cizilen duz eksene dik</option><option value="guideCurve">Cizilen kurpa dik (standart)</option></select></div>',
			'<div class="vp-row" id="vpSectionGuideRow" style="display:none"><label>Kesit ekseni</label><div style="display:flex;gap:6px;flex-wrap:wrap"><button id="vpPickSectionGuide" type="button" class="vp-btn">Haritada Ciz (2 Nokta)</button><button id="vpClearSectionGuide" type="button" class="vp-btn">Ekseni Temizle</button></div></div>',
			'<div id="vpSectionGuideMeta" class="vp-note" style="display:none;margin-top:-2px">Kesit ekseni tanimli degil.</div>',
			'<div class="vp-row" id="vpSectionGuideOptionsRow" style="display:none"><label>Kesit standardi</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><select id="vpSectionStationMode"><option value="interval">Istasyon: Sabit aralik</option><option value="interval+vertices" selected>Istasyon: Aralik + Kirik noktalar</option></select><div style="display:flex;gap:6px"><select id="vpSectionSpanMode" style="flex:1 1 auto"><option value="auto" selected>Acilim: Sinira kadar</option><option value="fixed">Acilim: Sabit</option></select><input id="vpSectionHalfSpan" type="number" min="1" step="1" value="25" title="Sabit acilim yaricapi (m)" style="width:90px" /></div></div></div>',
			'</div>',
			'<div class="vp-step">',
			'<div class="vp-step-h"><span class="vp-step-no">3</span><span class="vp-step-title">Gorsellestirme ve Hesap</span></div>',
			'<div class="vp-row"><label>Ekranda goster</label><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11px;color:#cbd5e1"><button id="vpVizCut" type="button" class="vp-btn">Kazi</button><button id="vpVizFill" type="button" class="vp-btn">Dolgu</button><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="vpVizSections" checked />Kesitler</label><label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="vpVizLabel" checked />Ozet Etiket</label></div></div>',
			'<div class="vp-legend"><span id="vpLegendCut" class="vp-legend-item"><span class="vp-swatch vp-swatch-cut"></span>Kazi</span><span id="vpLegendFill" class="vp-legend-item"><span class="vp-swatch vp-swatch-fill"></span>Dolgu</span><span id="vpLegendMixed" class="vp-legend-item"><span class="vp-swatch vp-swatch-mixed"></span>Karisik hucre</span><span id="vpLegendBalance" class="vp-legend-item"><span class="vp-swatch vp-swatch-balance"></span>Denge hucre</span></div>',
			'<div class="vp-btns"><button id="vpComputeBtn" class="vp-btn vp-btn-primary">Hacim Hesapla</button></div>',
			'<div class="vp-progress"><span id="vpProgressFill"></span></div>',
			'<div id="vpStatus" class="vp-status"></div>',
			'</div>',
			'<div class="vp-step">',
			'<div class="vp-step-h"><span class="vp-step-no">4</span><span class="vp-step-title">Rapor ve Cikti</span></div>',
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
		_refValueLabelEl = panel.querySelector('#vpRefValueLabel');
		_refValueEl = panel.querySelector('#vpRefValue');
		_gridEl = panel.querySelector('#vpGrid');
		_sectionEl = panel.querySelector('#vpSection');
		_sectionDirectionEl = panel.querySelector('#vpSectionDirection');
		_sectionGuideRowEl = panel.querySelector('#vpSectionGuideRow');
		_sectionGuideMetaEl = panel.querySelector('#vpSectionGuideMeta');
		_sectionGuideOptionsRowEl = panel.querySelector('#vpSectionGuideOptionsRow');
		_sectionStationModeEl = panel.querySelector('#vpSectionStationMode');
		_sectionSpanModeEl = panel.querySelector('#vpSectionSpanMode');
		_sectionHalfSpanEl = panel.querySelector('#vpSectionHalfSpan');
		_pickSectionGuideBtn = panel.querySelector('#vpPickSectionGuide');
		_clearSectionGuideBtn = panel.querySelector('#vpClearSectionGuide');
		_sourceEl = panel.querySelector('#vpSource');
		_vizCutBtn = panel.querySelector('#vpVizCut');
		_vizFillBtn = panel.querySelector('#vpVizFill');
		_vizSectionsEl = panel.querySelector('#vpVizSections');
		_vizLabelEl = panel.querySelector('#vpVizLabel');
		_sectionSelectEl = panel.querySelector('#vpSectionSelect');
		_sectionMetaEl = panel.querySelector('#vpSectionMeta');
		_sectionProfileEl = panel.querySelector('#vpSectionProfile');
		_sectionFocusBtn = panel.querySelector('#vpFocusSection');
		_legendCutEl = panel.querySelector('#vpLegendCut');
		_legendFillEl = panel.querySelector('#vpLegendFill');
		_legendMixedEl = panel.querySelector('#vpLegendMixed');
		_legendBalanceEl = panel.querySelector('#vpLegendBalance');

		panel.querySelector('#vpCloseBtn').addEventListener('click', function () {
			_stopSectionGuidePickMode(true);
			_clearSectionGuidePrimitive();
			_panel.style.display = 'none';
			_clearFocusedSection();
		});
		_refModeEl.addEventListener('change', function () {
			_syncReferenceUi(_selectMeasurement(), null);
		});
		if (_refValueEl) {
			_refValueEl.addEventListener('input', function () {
				if (_refModeEl && String(_refModeEl.value || 'fixed').toLowerCase() === 'fixed') {
					_fixedRefUserEdited = true;
				}
			});
		}
		if (_sectionDirectionEl) {
			_sectionDirectionEl.addEventListener('change', function () {
				if (_isSectionGuidePickMode) _stopSectionGuidePickMode(true);
				_updateSectionGuideUi();
				if (_lastResult) {
					_setStatus('Kesit yonu degisti. Yeni duzen icin yeniden hesap yapin.', 'info');
				}
			});
		}
		if (_pickSectionGuideBtn) {
			_pickSectionGuideBtn.addEventListener('click', function () {
				_startSectionGuidePickMode();
			});
		}
		if (_clearSectionGuideBtn) {
			_clearSectionGuideBtn.addEventListener('click', function () {
				_clearSectionGuide(false);
			});
		}
		if (_sectionSpanModeEl) {
			_sectionSpanModeEl.addEventListener('change', function () {
				if (_sectionHalfSpanEl) {
					_sectionHalfSpanEl.disabled = String(_sectionSpanModeEl.value) !== 'fixed';
				}
				if (_lastResult) _setStatus('Kesit acilim modu degisti. Yeni duzen icin yeniden hesap yapin.', 'info');
			});
		}
		if (_sectionStationModeEl) {
			_sectionStationModeEl.addEventListener('change', function () {
				if (_lastResult) _setStatus('Istasyon standardi degisti. Yeni duzen icin yeniden hesap yapin.', 'info');
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

		if (_vizCutBtn) {
			_vizCutBtn.addEventListener('click', function () {
				_showCutViz = !_showCutViz;
				_syncCutFillToggleUi();
				if (_lastResult) _refreshVisualization();
			});
		}

		if (_vizFillBtn) {
			_vizFillBtn.addEventListener('click', function () {
				_showFillViz = !_showFillViz;
				_syncCutFillToggleUi();
				if (_lastResult) _refreshVisualization();
			});
		}

		[_vizSectionsEl, _vizLabelEl].forEach(function (el) {
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
		_updateSectionGuideUi();
		_syncReferenceUi(_selectMeasurement(), null);
		_syncCutFillToggleUi();
	}

	function _syncCutFillToggleUi() {
		var showBoth = _showCutViz && _showFillViz;
		if (_vizCutBtn) {
			_vizCutBtn.classList.toggle('vp-toggle-off', !_showCutViz);
			_vizCutBtn.textContent = _showCutViz ? 'Kazi: Acik' : 'Kazi: Kapali';
			_vizCutBtn.setAttribute('aria-pressed', _showCutViz ? 'true' : 'false');
		}
		if (_vizFillBtn) {
			_vizFillBtn.classList.toggle('vp-toggle-off', !_showFillViz);
			_vizFillBtn.textContent = _showFillViz ? 'Dolgu: Acik' : 'Dolgu: Kapali';
			_vizFillBtn.setAttribute('aria-pressed', _showFillViz ? 'true' : 'false');
		}
		if (_legendCutEl) _legendCutEl.classList.toggle('vp-legend-off', !_showCutViz);
		if (_legendFillEl) _legendFillEl.classList.toggle('vp-legend-off', !_showFillViz);
		if (_legendMixedEl) _legendMixedEl.classList.toggle('vp-legend-off', !showBoth);
		if (_legendBalanceEl) _legendBalanceEl.classList.toggle('vp-legend-off', !showBoth);
	}

	function _getVisualizationOptions() {
		var showCut = !!_showCutViz;
		var showFill = !!_showFillViz;
		return {
			showCutFill: showCut || showFill,
			showCut: showCut,
			showFill: showFill,
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
		if (_vizCutBtn) _vizCutBtn.disabled = _isBusy;
		if (_vizFillBtn) _vizFillBtn.disabled = _isBusy;
		if (_pickSectionGuideBtn) _pickSectionGuideBtn.disabled = _isBusy;
		if (_clearSectionGuideBtn) _clearSectionGuideBtn.disabled = _isBusy || !_sectionGuide;
		if (_sectionStationModeEl) _sectionStationModeEl.disabled = _isBusy;
		if (_sectionSpanModeEl) _sectionSpanModeEl.disabled = _isBusy;
		if (_sectionHalfSpanEl) _sectionHalfSpanEl.disabled = _isBusy || !_sectionSpanModeEl || String(_sectionSpanModeEl.value) !== 'fixed';
		if (_sectionSelectEl) {
			var canUse = !_isBusy && !!(_lastResult && _lastResult.sections && _lastResult.sections.length > 0);
			_sectionSelectEl.disabled = !canUse;
		}
		if (_sectionFocusBtn) {
			var canFocus = !_isBusy && !!(_lastResult && _lastResult.sections && _lastResult.sections.length > 0 && _selectedSectionIndex >= 0);
			_sectionFocusBtn.disabled = !canFocus;
		}
	}

	function _computeZStatsFromValues(zValues) {
		if (!Array.isArray(zValues) || zValues.length === 0) return null;
		var minZ = Infinity;
		var maxZ = -Infinity;
		var sumZ = 0;
		var count = 0;
		for (var i = 0; i < zValues.length; i++) {
			var z = zValues[i];
			if (!isFinite(z)) continue;
			minZ = Math.min(minZ, z);
			maxZ = Math.max(maxZ, z);
			sumZ += z;
			count++;
		}
		if (count <= 0) return null;
		return {
			min: minZ,
			max: maxZ,
			mean: sumZ / count
		};
	}

	function _computeMeasurementTmStats(measurement) {
		if (!measurement || !Array.isArray(measurement.points) || measurement.points.length === 0) return null;
		var zValues = [];
		for (var i = 0; i < measurement.points.length; i++) {
			try {
				var node = _cartesianToTmNode(measurement.points[i]);
				if (node && isFinite(node.z)) zValues.push(node.z);
			} catch (e0) { }
		}
		return _computeZStatsFromValues(zValues);
	}

	function _computeMeasurementVertexStats(measurement) {
		if (!measurement || !Array.isArray(measurement.points) || measurement.points.length === 0) return null;
		var zValues = [];
		for (var i = 0; i < measurement.points.length; i++) {
			var h = NaN;
			try {
				var node0 = _cartesianToTmNode(measurement.points[i]);
				if (node0 && isFinite(node0.z)) h = node0.z;
			} catch (e0) { }
			try {
				var c = Cesium.Cartographic.fromCartesian(measurement.points[i]);
				if (c && isFinite(c.height)) h = c.height;
			} catch (e1) { }
			if (!isFinite(h)) {
				var p = measurement.points[i];
				if (p && isFinite(p.z)) h = p.z;
			}
			if (!isFinite(h)) continue;
			zValues.push(h);
		}
		return _computeZStatsFromValues(zValues);
	}

	function _syncReferenceUi(measurement, exactRefElevation) {
		if (!_refModeEl || !_refValueEl) return;
		var mode = String(_refModeEl.value || 'fixed').toLowerCase();
		var stats = null;
		if (measurement && _activeMeasurementStats && _activeMeasurementStats.measurementId === measurement.id) {
			stats = {
				min: _activeMeasurementStats.min,
				max: _activeMeasurementStats.max,
				mean: _activeMeasurementStats.mean
			};
		}
		if (!stats || !isFinite(stats.mean)) stats = _computeMeasurementVertexStats(measurement);
		if (!stats || !isFinite(stats.mean)) stats = _computeMeasurementTmStats(measurement);
		var exactNum = Number(exactRefElevation);
		var hasExact = exactRefElevation !== null && exactRefElevation !== undefined && exactRefElevation !== '' && isFinite(exactNum);

		if (_refValueLabelEl) {
			if (mode === 'fixed') _refValueLabelEl.textContent = 'Sabit kot (m)';
			else if (mode === 'min') _refValueLabelEl.textContent = 'Referans kotu - Min zemin (m)';
			else if (mode === 'max') _refValueLabelEl.textContent = 'Referans kotu - Maks zemin (m)';
			else _refValueLabelEl.textContent = 'Referans kotu - Ortalama zemin (m)';
		}

		if (mode === 'fixed') {
			_refValueEl.disabled = false;
			if (hasExact) {
				_refValueEl.value = _formatNum(exactNum, 3);
			} else {
				var curr = parseFloat(_refValueEl.value);
				if (stats && isFinite(stats.mean) && (!isFinite(curr) || (!_fixedRefUserEdited && Math.abs(curr) < 1e-9))) {
					_refValueEl.value = _formatNum(stats.mean, 2);
				}
			}
			return;
		}

		_refValueEl.disabled = true;
		var preview = NaN;
		if (hasExact) preview = exactNum;
		else if (stats) {
			if (mode === 'min') preview = stats.min;
			else if (mode === 'max') preview = stats.max;
			else preview = stats.mean;
		}
		if (isFinite(preview)) {
			_refValueEl.value = _formatNum(preview, 3);
		} else {
			_refValueEl.value = '';
		}
	}

	function _copyGuideNode(node) {
		if (!node || !isFinite(node.x) || !isFinite(node.y)) return null;
		var out = {
			x: node.x,
			y: node.y,
			z: isFinite(node.z) ? node.z : 0
		};
		if (isFinite(node.lon) && isFinite(node.lat)) {
			out.lon = node.lon;
			out.lat = node.lat;
		} else {
			var ll = _tm30ToWgs(node.x, node.y);
			if (ll) {
				out.lon = ll.lon;
				out.lat = ll.lat;
			}
		}
		return out;
	}

	function _buildGuideSegments(points) {
		if (!Array.isArray(points) || points.length < 2) return null;
		var segments = [];
		var totalLen = 0;
		for (var i = 0; i < points.length - 1; i++) {
			var a = points[i];
			var b = points[i + 1];
			if (!a || !b) continue;
			var dx = b.x - a.x;
			var dy = b.y - a.y;
			var len = Math.sqrt((dx * dx) + (dy * dy));
			if (!(len > 0.25)) continue;
			var ux = dx / len;
			var uy = dy / len;
			segments.push({
				a: a,
				b: b,
				dx: dx,
				dy: dy,
				len: len,
				ux: ux,
				uy: uy,
				vx: -uy,
				vy: ux,
				startStation: totalLen,
				endStation: totalLen + len
			});
			totalLen += len;
		}
		if (!(totalLen > 0) || segments.length === 0) return null;
		return {
			segments: segments,
			length: totalLen
		};
	}

	function _buildLineGuideFromNodes(startNode, endNode, measurementId) {
		var a = _copyGuideNode(startNode);
		var b = _copyGuideNode(endNode);
		if (!a || !b) return null;
		var built = _buildGuideSegments([a, b]);
		if (!built) return null;
		var seg = built.segments[0];
		var azimuthDeg = (Math.atan2(seg.dx, seg.dy) * 180 / Math.PI + 360) % 360;
		return {
			type: 'line',
			measurementId: measurementId,
			points: [a, b],
			segments: built.segments,
			start: a,
			end: b,
			dx: seg.dx,
			dy: seg.dy,
			ux: seg.ux,
			uy: seg.uy,
			vx: seg.vx,
			vy: seg.vy,
			length: built.length,
			azimuthDeg: azimuthDeg
		};
	}

	function _buildCurveGuideFromNodes(nodes, measurementId) {
		if (!Array.isArray(nodes) || nodes.length < 2) return null;
		var clean = [];
		for (var i = 0; i < nodes.length; i++) {
			var cp = _copyGuideNode(nodes[i]);
			if (cp) clean.push(cp);
		}
		if (clean.length < 2) return null;
		var built = _buildGuideSegments(clean);
		if (!built) return null;
		var firstSeg = built.segments[0];
		var azimuthDeg = (Math.atan2(firstSeg.dx, firstSeg.dy) * 180 / Math.PI + 360) % 360;
		return {
			type: 'curve',
			measurementId: measurementId,
			points: clean,
			segments: built.segments,
			start: clean[0],
			end: clean[clean.length - 1],
			dx: clean[clean.length - 1].x - clean[0].x,
			dy: clean[clean.length - 1].y - clean[0].y,
			ux: firstSeg.ux,
			uy: firstSeg.uy,
			vx: firstSeg.vx,
			vy: firstSeg.vy,
			length: built.length,
			azimuthDeg: azimuthDeg
		};
	}

	function _normalizeSectionGuide(guide) {
		if (!guide) return null;

		if (guide.type === 'line' && guide.start && guide.end) {
			return _buildLineGuideFromNodes(guide.start, guide.end, guide.measurementId);
		}

		if (guide.type === 'curve' && Array.isArray(guide.points)) {
			return _buildCurveGuideFromNodes(guide.points, guide.measurementId);
		}

		if (Array.isArray(guide.points) && guide.points.length >= 2) {
			if (guide.points.length >= 3 || String(guide.type || '').toLowerCase() === 'guidecurve' || String(guide.type || '').toLowerCase() === 'polyline') {
				return _buildCurveGuideFromNodes(guide.points, guide.measurementId);
			}
			return _buildLineGuideFromNodes(guide.points[0], guide.points[guide.points.length - 1], guide.measurementId);
		}

		if (guide.start && guide.end) {
			return _buildLineGuideFromNodes(guide.start, guide.end, guide.measurementId);
		}

		return null;
	}

	function _serializeSectionGuide(guide) {
		if (!guide) return null;
		var normalized = _normalizeSectionGuide(guide);
		if (!normalized) return null;
		var serializePoint = function (p) {
			if (!p) return null;
			return {
				x: p.x,
				y: p.y,
				lon: p.lon,
				lat: p.lat,
				z: p.z
			};
		};
		return {
			type: normalized.type,
			measurementId: normalized.measurementId,
			length: normalized.length,
			azimuthDeg: normalized.azimuthDeg,
			start: serializePoint(normalized.start),
			end: serializePoint(normalized.end),
			points: (normalized.points || []).map(function (p) {
				return serializePoint(p);
			})
		};
	}

	function _getSectionGuideMode() {
		var m = String((_sectionDirectionEl && _sectionDirectionEl.value) || '').toLowerCase();
		if (m === 'guidecurve') return 'curve';
		if (m === 'guide') return 'line';
		return 'none';
	}

	function _clearSectionGuidePrimitive() {
		if (!_vizState.sectionGuidePrimitive) return;
		try {
			if (typeof safeRemoveItem === 'function') safeRemoveItem(_vizState.sectionGuidePrimitive);
		} catch (e2) { }
		_vizState.sectionGuidePrimitive = null;
		_safeRequestRender();
	}

	function _renderSectionGuidePrimitive() {
		_clearSectionGuidePrimitive();
		var guide = _normalizeSectionGuide(_sectionGuide);
		if (!guide || !Array.isArray(guide.points) || guide.points.length < 2) return;
		var positions = [];
		for (var i = 0; i < guide.points.length; i++) {
			var p = guide.points[i];
			if (!isFinite(p.lon) || !isFinite(p.lat)) continue;
			positions.push(Cesium.Cartesian3.fromDegrees(p.lon, p.lat, (p.z || 0) + 0.6));
		}
		if (positions.length < 2) return;
		var color = Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.95);
		var guidePrim = null;
		if (typeof createStablePolyline === 'function') {
			guidePrim = createStablePolyline(positions, 3, color);
		} else if (drawLayer && drawLayer.entities) {
			guidePrim = drawLayer.entities.add({
				polyline: {
					positions: positions,
					width: 3,
					material: color,
					depthFailMaterial: color
				}
			});
		}
		if (guidePrim) _vizState.sectionGuidePrimitive = guidePrim;
		_safeRequestRender();
	}

	function _updateSectionGuideUi() {
		var guideMode = _getSectionGuideMode();
		var isGuideMode = guideMode !== 'none';
		var isCurveMode = guideMode === 'curve';
		if (_sectionGuideRowEl) _sectionGuideRowEl.style.display = isGuideMode ? 'grid' : 'none';
		if (_sectionGuideMetaEl) _sectionGuideMetaEl.style.display = isGuideMode ? 'block' : 'none';
		if (_sectionGuideOptionsRowEl) _sectionGuideOptionsRowEl.style.display = isGuideMode ? 'grid' : 'none';
		if (_clearSectionGuideBtn) _clearSectionGuideBtn.disabled = _isBusy || !_sectionGuide;
		if (_pickSectionGuideBtn) _pickSectionGuideBtn.disabled = _isBusy;
		if (_sectionHalfSpanEl && _sectionSpanModeEl) {
			_sectionHalfSpanEl.disabled = _isBusy || String(_sectionSpanModeEl.value) !== 'fixed';
		}
		if (_pickSectionGuideBtn) {
			_pickSectionGuideBtn.textContent = isCurveMode ? 'Haritada Kurp Ciz' : 'Haritada Ciz (2 Nokta)';
		}

		if (!isGuideMode) {
			_clearSectionGuidePrimitive();
			return;
		}

		var guide = _normalizeSectionGuide(_sectionGuide);
		if (_sectionGuideMetaEl) {
			if (guide) {
				var typeLabel = guide.type === 'curve' ? 'Kurplu eksen' : 'Duz eksen';
				var pts = Array.isArray(guide.points) ? guide.points.length : 2;
				_sectionGuideMetaEl.innerHTML =
					'<b>' + typeLabel + '</b> tanimli. Uzunluk: <b>' + _formatNum(guide.length, 2) + ' m</b> | Azimut (kuzey=0): <b>' + _formatNum(guide.azimuthDeg, 2) + '°</b> | Nokta: <b>' + pts + '</b>';
			} else {
				_sectionGuideMetaEl.textContent = isCurveMode
					? 'Kurplu kesit ekseni tanimli degil. Haritada coklu nokta ile kurp cizin.'
					: 'Kesit ekseni tanimli degil. Haritada iki nokta secerek eksen cizin.';
			}
		}

		if (guide) {
			_sectionGuide = guide;
			_renderSectionGuidePrimitive();
		}
	}

	function _clearSectionGuide(silent) {
		if (_isSectionGuidePickMode) _stopSectionGuidePickMode(true);
		_sectionGuide = null;
		_clearSectionGuidePrimitive();
		_updateSectionGuideUi();
		if (!silent) _setStatus('Kesit ekseni temizlendi.', 'info');
	}

	function _getPickCartesian(position) {
		var cartesian;
		try {
			if (viewer.scene.pickPositionSupported) {
				cartesian = viewer.scene.pickPosition(position);
			}
		} catch (e3) { }

		if (!Cesium.defined(cartesian)) {
			var ray = viewer.camera.getPickRay(position);
			if (ray && viewer.scene.globe) {
				cartesian = viewer.scene.globe.pick(ray, viewer.scene);
			}
		}

		if (!Cesium.defined(cartesian)) {
			try {
				cartesian = viewer.camera.pickEllipsoid(position, Cesium.Ellipsoid.WGS84);
			} catch (e4) { }
		}

		return cartesian;
	}

	function _setSectionGuideFromNodes(nodes, measurementId, mode) {
		if (!Array.isArray(nodes) || nodes.length < 2) return false;
		var guide = null;
		if (mode === 'curve') {
			guide = _buildCurveGuideFromNodes(nodes, measurementId);
		} else {
			guide = _buildLineGuideFromNodes(nodes[0], nodes[nodes.length - 1], measurementId);
		}
		if (!guide) {
			_showError('Kesit ekseni gecersiz. Yeterli ve farkli nokta secin.');
			return false;
		}
		_sectionGuide = guide;
		_updateSectionGuideUi();
		var typeLabel = guide.type === 'curve' ? 'Kurplu eksen' : 'Duz eksen';
		_setStatus(typeLabel + ' kaydedildi. Uzunluk: ' + _formatNum(guide.length, 2) + ' m | Azimut: ' + _formatNum(guide.azimuthDeg, 2) + '°', 'ok');
		if (_lastResult) {
			_setStatus('Kesit ekseni degisti. Yeni kesit duzeni icin yeniden hesap yapin.', 'info');
		}
		return true;
	}

	function _stopSectionGuidePickMode(cancelled) {
		if (!_isSectionGuidePickMode) return;
		_isSectionGuidePickMode = false;
		_sectionGuidePickPoints = [];
		_sectionGuidePickCurveMode = false;
		document.removeEventListener('keydown', _onSectionGuidePickKeyDown);
		if (_sectionGuideHandler) {
			try { _sectionGuideHandler.destroy(); } catch (e5) { }
			_sectionGuideHandler = null;
		}
		if (viewer && viewer.scene && viewer.scene.canvas) {
			viewer.scene.canvas.style.cursor = '';
		}
		if (typeof window !== 'undefined') {
			window.__infoPickModeActive = false;
		}
		if (cancelled) _setStatus('Kesit ekseni secimi iptal edildi.', 'info');
	}

	function _startSectionGuidePickMode() {
		if (_isBusy) return;
		if (!viewer || !viewer.scene || !Cesium) return;
		var guideMode = _getSectionGuideMode();
		if (guideMode === 'none') return;
		var isCurveMode = guideMode === 'curve';
		var measurement = _ensureSelectionForVolume();
		if (!measurement) return;
		if (_isSectionGuidePickMode) {
			_stopSectionGuidePickMode(true);
			return;
		}

		if (typeof window !== 'undefined' && window.__infoPickModeActive && typeof window.__exitInfoPickMode === 'function') {
			try { window.__exitInfoPickMode(); } catch (e6) { }
		}
		if (typeof window !== 'undefined') {
			window.__infoPickModeActive = true;
		}

		_isSectionGuidePickMode = true;
		_sectionGuidePickCurveMode = isCurveMode;
		_sectionGuidePickPoints = [];
		if (viewer && viewer.scene && viewer.scene.canvas) {
			viewer.scene.canvas.style.cursor = 'crosshair';
		}
		_setStatus(isCurveMode
			? 'Kurplu kesit ekseni icin noktalar secin. Bitirmek icin cift tik / sag tik (ESC: iptal)'
			: 'Kesit ekseni icin haritada 2 nokta secin. (ESC: iptal)', 'info');

		document.addEventListener('keydown', _onSectionGuidePickKeyDown);
		_sectionGuideHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
		_sectionGuideHandler.setInputAction(function (click) {
			var pos = _getPickCartesian(click.position);
			if (!Cesium.defined(pos)) {
				_setStatus('Nokta okunamadi. Model uzerinde tekrar tiklayin.', 'error');
				return;
			}
			var node = _cartesianToTmNode(pos);
			if (!node || !isFinite(node.x) || !isFinite(node.y)) {
				_setStatus('Nokta koordinati okunamadi. Tekrar deneyin.', 'error');
				return;
			}
			if (_sectionGuidePickCurveMode) {
				_sectionGuidePickPoints.push(node);
				if (_sectionGuidePickPoints.length === 1) {
					_setStatus('Ilk nokta alindi. Devam noktalarini secin; bitis icin cift tik / sag tik.', 'info');
				} else {
					_setStatus('Kurp noktasi eklendi (' + _sectionGuidePickPoints.length + '). Bitirmek icin cift tik / sag tik.', 'info');
				}
				return;
			}

			if (_sectionGuidePickPoints.length === 0) {
				_sectionGuidePickPoints.push(node);
				_setStatus('Ilk nokta alindi. Simdi ikinci noktayi secin.', 'info');
				return;
			}

			_sectionGuidePickPoints.push(node);
			var okLine = _setSectionGuideFromNodes(_sectionGuidePickPoints, measurement.id, 'line');
			_stopSectionGuidePickMode(!okLine);
		}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

		if (_sectionGuidePickCurveMode) {
			var finalizeCurve = function () {
				if (_sectionGuidePickPoints.length < 2) {
					_setStatus('Kurplu eksen icin en az 2 nokta gerekli.', 'error');
					return;
				}
				var okCurve = _setSectionGuideFromNodes(_sectionGuidePickPoints, measurement.id, 'curve');
				_stopSectionGuidePickMode(!okCurve);
			};
			_sectionGuideHandler.setInputAction(function () {
				finalizeCurve();
			}, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
			_sectionGuideHandler.setInputAction(function () {
				finalizeCurve();
			}, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
		}
	}

	function _onSectionGuidePickKeyDown(e) {
		if (!_isSectionGuidePickMode) return;
		if (e.key !== 'Escape') return;
		e.preventDefault();
		document.removeEventListener('keydown', _onSectionGuidePickKeyDown);
		_stopSectionGuidePickMode(true);
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

	function _clipPolygonOnAxis(poly, axis, bound, keepGreater) {
		if (!poly || poly.length < 3) return [];
		var out = [];
		var eps = 1e-9;
		for (var i = 0; i < poly.length; i++) {
			var curr = poly[i];
			var next = poly[(i + 1) % poly.length];
			var cv = axis === 'x' ? curr.x : curr.y;
			var nv = axis === 'x' ? next.x : next.y;
			var currInside = keepGreater ? (cv >= bound - eps) : (cv <= bound + eps);
			var nextInside = keepGreater ? (nv >= bound - eps) : (nv <= bound + eps);

			if (currInside && nextInside) {
				out.push({ x: next.x, y: next.y });
			} else if (currInside && !nextInside) {
				var den1 = nv - cv;
				var t1 = Math.abs(den1) < eps ? 0.5 : ((bound - cv) / den1);
				t1 = Math.max(0, Math.min(1, t1));
				out.push({
					x: curr.x + (next.x - curr.x) * t1,
					y: curr.y + (next.y - curr.y) * t1
				});
			} else if (!currInside && nextInside) {
				var den2 = nv - cv;
				var t2 = Math.abs(den2) < eps ? 0.5 : ((bound - cv) / den2);
				t2 = Math.max(0, Math.min(1, t2));
				out.push({
					x: curr.x + (next.x - curr.x) * t2,
					y: curr.y + (next.y - curr.y) * t2
				});
				out.push({ x: next.x, y: next.y });
			}
		}
		return out;
	}

	function _clipPolygonToRect(poly, minX, maxX, minY, maxY) {
		var clipped = _clipPolygonOnAxis(poly, 'x', minX, true);
		clipped = _clipPolygonOnAxis(clipped, 'x', maxX, false);
		clipped = _clipPolygonOnAxis(clipped, 'y', minY, true);
		clipped = _clipPolygonOnAxis(clipped, 'y', maxY, false);
		return clipped;
	}

	function _edgeSide(ax, ay, bx, by, px, py) {
		return ((bx - ax) * (py - ay)) - ((by - ay) * (px - ax));
	}

	function _clipPolygonWithEdge(poly, ax, ay, bx, by) {
		if (!poly || poly.length < 3) return [];
		var out = [];
		var eps = 1e-9;
		for (var i = 0; i < poly.length; i++) {
			var curr = poly[i];
			var next = poly[(i + 1) % poly.length];
			var currSide = _edgeSide(ax, ay, bx, by, curr.x, curr.y);
			var nextSide = _edgeSide(ax, ay, bx, by, next.x, next.y);
			var currInside = currSide >= -eps;
			var nextInside = nextSide >= -eps;

			if (currInside && nextInside) {
				out.push({ x: next.x, y: next.y });
			} else if (currInside && !nextInside) {
				var den1 = currSide - nextSide;
				var t1 = Math.abs(den1) < eps ? 0.5 : (currSide / den1);
				t1 = Math.max(0, Math.min(1, t1));
				out.push({
					x: curr.x + (next.x - curr.x) * t1,
					y: curr.y + (next.y - curr.y) * t1
				});
			} else if (!currInside && nextInside) {
				var den2 = currSide - nextSide;
				var t2 = Math.abs(den2) < eps ? 0.5 : (currSide / den2);
				t2 = Math.max(0, Math.min(1, t2));
				out.push({
					x: curr.x + (next.x - curr.x) * t2,
					y: curr.y + (next.y - curr.y) * t2
				});
				out.push({ x: next.x, y: next.y });
			}
		}
		return out;
	}

	function _clipPolygonToTriangle(poly, t0, t1, t2) {
		if (!poly || poly.length < 3) return [];
		var a = t0;
		var b = t1;
		var c = t2;
		if (_edgeSide(a.x, a.y, b.x, b.y, c.x, c.y) < 0) {
			var tmp = b;
			b = c;
			c = tmp;
		}
		var clipped = _clipPolygonWithEdge(poly, a.x, a.y, b.x, b.y);
		clipped = _clipPolygonWithEdge(clipped, b.x, b.y, c.x, c.y);
		clipped = _clipPolygonWithEdge(clipped, c.x, c.y, a.x, a.y);
		return clipped;
	}

	function _buildPlaneFromTriangle(v0, v1, v2) {
		if (!v0 || !v1 || !v2) return null;
		var ox = v0.x;
		var oy = v0.y;
		var x1 = v1.x - ox;
		var y1 = v1.y - oy;
		var x2 = v2.x - ox;
		var y2 = v2.y - oy;
		var dh1 = v1.h - v0.h;
		var dh2 = v2.h - v0.h;
		var det = (x1 * y2) - (y1 * x2);
		if (Math.abs(det) < 1e-12) return null;
		var a = ((dh1 * y2) - (dh2 * y1)) / det;
		var b = ((x1 * dh2) - (x2 * dh1)) / det;
		return {
			ox: ox,
			oy: oy,
			a: a,
			b: b,
			c: v0.h
		};
	}

	function _evalPlaneHeight(plane, x, y) {
		if (!plane) return 0;
		var dx = x - (plane.ox || 0);
		var dy = y - (plane.oy || 0);
		return (plane.a * dx) + (plane.b * dy) + plane.c;
	}

	function _clipPolygonByHeight(polyH, keepPositive) {
		if (!polyH || polyH.length < 3) return [];
		var out = [];
		var eps = 1e-9;
		for (var i = 0; i < polyH.length; i++) {
			var curr = polyH[i];
			var next = polyH[(i + 1) % polyH.length];
			var currInside = keepPositive ? (curr.h >= -eps) : (curr.h <= eps);
			var nextInside = keepPositive ? (next.h >= -eps) : (next.h <= eps);

			if (currInside && nextInside) {
				out.push({ x: next.x, y: next.y, h: next.h });
			} else if (currInside && !nextInside) {
				var den1 = curr.h - next.h;
				var t1 = Math.abs(den1) < eps ? 0.5 : (curr.h / den1);
				t1 = Math.max(0, Math.min(1, t1));
				out.push({
					x: curr.x + (next.x - curr.x) * t1,
					y: curr.y + (next.y - curr.y) * t1,
					h: 0
				});
			} else if (!currInside && nextInside) {
				var den2 = curr.h - next.h;
				var t2 = Math.abs(den2) < eps ? 0.5 : (curr.h / den2);
				t2 = Math.max(0, Math.min(1, t2));
				out.push({
					x: curr.x + (next.x - curr.x) * t2,
					y: curr.y + (next.y - curr.y) * t2,
					h: 0
				});
				out.push({ x: next.x, y: next.y, h: next.h });
			}
		}
		return out;
	}

	function _integrateHeightPolygon(polyH, positiveMode) {
		if (!polyH || polyH.length < 3) return 0;
		var p0 = polyH[0];
		var vol = 0;
		for (var i = 1; i < polyH.length - 1; i++) {
			var p1 = polyH[i];
			var p2 = polyH[i + 1];
			var area = Math.abs(((p1.x - p0.x) * (p2.y - p0.y)) - ((p1.y - p0.y) * (p2.x - p0.x))) * 0.5;
			if (!(area > 1e-12)) continue;
			var avgH = (p0.h + p1.h + p2.h) / 3;
			if (positiveMode) {
				vol += Math.max(0, avgH) * area;
			} else {
				vol += Math.max(0, -avgH) * area;
			}
		}
		return vol;
	}

	function _integratePolygonCutFillOnPlane(polyXY, plane) {
		if (!polyXY || polyXY.length < 3 || !plane) {
			return { cut: 0, fill: 0, split: false };
		}
		var polyH = [];
		var minH = Infinity;
		var maxH = -Infinity;
		for (var i = 0; i < polyXY.length; i++) {
			var h = _evalPlaneHeight(plane, polyXY[i].x, polyXY[i].y);
			polyH.push({ x: polyXY[i].x, y: polyXY[i].y, h: h });
			minH = Math.min(minH, h);
			maxH = Math.max(maxH, h);
		}

		var cutPoly = _clipPolygonByHeight(polyH, true);
		var fillPoly = _clipPolygonByHeight(polyH, false);
		return {
			cut: _integrateHeightPolygon(cutPoly, true),
			fill: _integrateHeightPolygon(fillPoly, false),
			split: maxH > 1e-9 && minH < -1e-9
		};
	}

	function _fallbackCellCutFill(cellArea, n00, n10, n11, n01, refElevation) {
		var triArea = cellArea * 0.5;
		var tri1Avg = ((n00.z + n10.z + n11.z) / 3) - refElevation;
		var tri2Avg = ((n00.z + n11.z + n01.z) / 3) - refElevation;
		return {
			cut: (tri1Avg > 0 ? tri1Avg * triArea : 0) + (tri2Avg > 0 ? tri2Avg * triArea : 0),
			fill: (tri1Avg < 0 ? (-tri1Avg) * triArea : 0) + (tri2Avg < 0 ? (-tri2Avg) * triArea : 0),
			splitTriangles: 0,
			usedFallback: true
		};
	}

	function _integrateCellCutFill(cell, n00, n10, n11, n01, refElevation) {
		var defaultArea = (cell.coverage || 1) * Math.pow(Math.max(1e-9, (cell.gridSpacing || 0)), 2);
		var cellArea = isFinite(cell.overlapArea) && cell.overlapArea > 0 ? cell.overlapArea : defaultArea;
		if (!(cellArea > 0)) {
			return { cut: 0, fill: 0, splitTriangles: 0, usedFallback: false };
		}

		var v00 = { x: n00.x, y: n00.y, h: n00.z - refElevation };
		var v10 = { x: n10.x, y: n10.y, h: n10.z - refElevation };
		var v11 = { x: n11.x, y: n11.y, h: n11.z - refElevation };
		var v01 = { x: n01.x, y: n01.y, h: n01.z - refElevation };

		var triA = [
			{ x: v00.x, y: v00.y },
			{ x: v10.x, y: v10.y },
			{ x: v11.x, y: v11.y }
		];
		var triB = [
			{ x: v00.x, y: v00.y },
			{ x: v11.x, y: v11.y },
			{ x: v01.x, y: v01.y }
		];

		var planeA = _buildPlaneFromTriangle(v00, v10, v11);
		var planeB = _buildPlaneFromTriangle(v00, v11, v01);
		if (!planeA || !planeB) {
			return _fallbackCellCutFill(cellArea, n00, n10, n11, n01, refElevation);
		}

		var partA = triA;
		var partB = triB;
		if (Array.isArray(cell.overlapPoly) && cell.overlapPoly.length >= 3) {
			partA = _clipPolygonToTriangle(cell.overlapPoly, triA[0], triA[1], triA[2]);
			partB = _clipPolygonToTriangle(cell.overlapPoly, triB[0], triB[1], triB[2]);
		}

		var intA = _integratePolygonCutFillOnPlane(partA, planeA);
		var intB = _integratePolygonCutFillOnPlane(partB, planeB);
		var cut = intA.cut + intB.cut;
		var fill = intA.fill + intB.fill;
		if (!isFinite(cut) || !isFinite(fill)) {
			return _fallbackCellCutFill(cellArea, n00, n10, n11, n01, refElevation);
		}

		return {
			cut: cut,
			fill: fill,
			splitTriangles: (intA.split ? 1 : 0) + (intB.split ? 1 : 0),
			usedFallback: false
		};
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
		var nominalCellArea = gridSpacing * gridSpacing;
		for (var cy = 0; cy < ny; cy++) {
			for (var cx = 0; cx < nx; cx++) {
				var cellMinX = minX + (cx * gridSpacing);
				var cellMaxX = cellMinX + gridSpacing;
				var cellMinY = minY + (cy * gridSpacing);
				var cellMaxY = cellMinY + gridSpacing;
				var overlapPoly = _clipPolygonToRect(polyTm, cellMinX, cellMaxX, cellMinY, cellMaxY);
				var overlapArea = _shoelaceArea(overlapPoly);
				if (!(overlapArea > 1e-10)) continue;
				var coverage = Math.max(0, Math.min(1, overlapArea / nominalCellArea));
				if (!(coverage > 0)) continue;
				var centerX = minX + (cx + 0.5) * gridSpacing;
				var centerY = minY + (cy + 0.5) * gridSpacing;
				var isFullCell = coverage >= (1 - 1e-9);

				nodeKeyMap[cx + '_' + cy] = true;
				nodeKeyMap[(cx + 1) + '_' + cy] = true;
				nodeKeyMap[(cx + 1) + '_' + (cy + 1)] = true;
				nodeKeyMap[cx + '_' + (cy + 1)] = true;
				coverageAreaRaw += overlapArea;
				cells.push({
					ix: cx,
					iy: cy,
					x: centerX,
					y: centerY,
					coverage: isFullCell ? 1 : coverage,
					overlapArea: overlapArea,
					overlapPoly: isFullCell ? null : overlapPoly,
					gridSpacing: gridSpacing,
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

	function _buildGuideStations(startStation, endStation, stationStep, stationMode, segments) {
		var s0 = isFinite(startStation) ? startStation : 0;
		var s1 = isFinite(endStation) ? endStation : s0;
		if (s1 < s0) {
			var tmp = s0;
			s0 = s1;
			s1 = tmp;
		}
		var step = Math.max(0.5, stationStep || 1);
		var stations = [];
		for (var st = s0; st <= s1 + 1e-9; st += step) {
			stations.push(st);
			if (stations.length > 1800) break;
		}
		if (stations.length === 0 || Math.abs(stations[0] - s0) > 1e-9) stations.unshift(s0);
		if (Math.abs(stations[stations.length - 1] - s1) > 1e-6) stations.push(s1);

		if (stationMode === 'interval+vertices' && Array.isArray(segments) && segments.length > 0) {
			for (var i = 0; i < segments.length; i++) {
				if (isFinite(segments[i].startStation)) stations.push(segments[i].startStation);
				if (isFinite(segments[i].endStation)) stations.push(segments[i].endStation);
			}
		}

		stations.sort(function (a, b) { return a - b; });
		var dedup = [];
		for (var si = 0; si < stations.length; si++) {
			if (!isFinite(stations[si])) continue;
			if (dedup.length === 0 || Math.abs(stations[si] - dedup[dedup.length - 1]) > 1e-6) dedup.push(stations[si]);
		}
		return dedup;
	}

	function _buildSectionsAlongGuide(cellRows, gridSpacing, sectionInterval, refElevation, sectionGuide, sectionOptions) {
		var normalized = _normalizeSectionGuide(sectionGuide);
		if (!normalized || !normalized.start || !normalized.end) return [];
		var guide = _buildLineGuideFromNodes(normalized.start, normalized.end, normalized.measurementId);
		if (!guide) return [];

		var spanMode = sectionOptions && sectionOptions.sectionSpanMode ? String(sectionOptions.sectionSpanMode).toLowerCase() : 'auto';
		var halfSpan = sectionOptions && isFinite(sectionOptions.sectionHalfSpan) ? Number(sectionOptions.sectionHalfSpan) : 25;
		if (!(halfSpan > 0)) halfSpan = 25;
		var stationMode = sectionOptions && sectionOptions.sectionStationMode ? String(sectionOptions.sectionStationMode).toLowerCase() : 'interval+vertices';

		var projected = [];
		var minS = Infinity;
		var maxS = -Infinity;
		for (var i = 0; i < cellRows.length; i++) {
			var row = cellRows[i];
			var dx = row.x - guide.start.x;
			var dy = row.y - guide.start.y;
			var s = (dx * guide.ux) + (dy * guide.uy);
			var n = (dx * guide.vx) + (dy * guide.vy);
			if (!isFinite(s) || !isFinite(n)) continue;
			projected.push({ row: row, s: s, n: n });
			minS = Math.min(minS, s);
			maxS = Math.max(maxS, s);
		}

		if (projected.length < 3 || !isFinite(minS) || !isFinite(maxS)) return [];

		var stationStep = Math.max(0.5, sectionInterval || gridSpacing || 1);
		var bandHalf = Math.max(gridSpacing * 0.55, Math.min(stationStep * 0.45, gridSpacing * 1.8));
		var maxGap = Math.max(gridSpacing * 2.2, stationStep * 0.8);
		var stations = _buildGuideStations(minS, maxS, stationStep, stationMode, null);

		var sections = [];
		var seq = 0;
		for (var si = 0; si < stations.length; si++) {
			var targetS = stations[si];
			var items = [];
			for (var pi = 0; pi < projected.length; pi++) {
				if (Math.abs(projected[pi].s - targetS) > bandHalf) continue;
				if (spanMode === 'fixed' && Math.abs(projected[pi].n) > halfSpan) continue;
				items.push(projected[pi]);
			}
			if (items.length < 2) continue;

			items.sort(function (a, b) { return a.n - b.n; });
			var cutA = 0;
			var fillA = 0;
			var len = 0;
			var profile = [];
			var baseN = items[0].n;
			for (var k = 0; k < items.length; k++) {
				profile.push({ station: items[k].n - baseN, z: items[k].row.z });
				if (k === items.length - 1) continue;
				var curr = items[k];
				var next = items[k + 1];
				var span = next.n - curr.n;
				if (!isFinite(span) || span <= 0 || span > maxGap) continue;
				len += span;
				var c1 = Math.max(0, curr.row.z - refElevation);
				var c2 = Math.max(0, next.row.z - refElevation);
				var f1 = Math.max(0, refElevation - curr.row.z);
				var f2 = Math.max(0, refElevation - next.row.z);
				cutA += ((c1 + c2) * 0.5 * span);
				fillA += ((f1 + f2) * 0.5 * span);
			}

			if (!(len > 0)) continue;
			var startN = items[0].n;
			var endN = items[items.length - 1].n;
			var startX = guide.start.x + (targetS * guide.ux) + (startN * guide.vx);
			var startY = guide.start.y + (targetS * guide.uy) + (startN * guide.vy);
			var endX = guide.start.x + (targetS * guide.ux) + (endN * guide.vx);
			var endY = guide.start.y + (targetS * guide.uy) + (endN * guide.vy);
			seq++;
			sections.push({
				axis: 'G',
				name: 'G-' + seq,
				station: targetS,
				cutArea: cutA,
				fillArea: fillA,
				netArea: fillA - cutA,
				length: len,
				start: { x: startX, y: startY },
				end: { x: endX, y: endY },
				profile: profile
			});
		}

		return sections;
	}

	function _findSegmentForStation(segments, station) {
		if (!Array.isArray(segments) || segments.length === 0 || !isFinite(station)) return null;
		for (var i = 0; i < segments.length; i++) {
			if (station >= segments[i].startStation - 1e-9 && station <= segments[i].endStation + 1e-9) return segments[i];
		}
		if (station < segments[0].startStation) return segments[0];
		return segments[segments.length - 1];
	}

	function _buildSectionsAlongCurveGuide(cellRows, gridSpacing, sectionInterval, refElevation, sectionGuide, sectionOptions) {
		var guide = _normalizeSectionGuide(sectionGuide);
		if (!guide || guide.type !== 'curve' || !Array.isArray(guide.segments) || guide.segments.length === 0) return [];

		var spanMode = sectionOptions && sectionOptions.sectionSpanMode ? String(sectionOptions.sectionSpanMode).toLowerCase() : 'auto';
		var halfSpan = sectionOptions && isFinite(sectionOptions.sectionHalfSpan) ? Number(sectionOptions.sectionHalfSpan) : 25;
		if (!(halfSpan > 0)) halfSpan = 25;
		var stationMode = sectionOptions && sectionOptions.sectionStationMode ? String(sectionOptions.sectionStationMode).toLowerCase() : 'interval+vertices';

		var stationStep = Math.max(0.5, sectionInterval || gridSpacing || 1);
		var bandHalf = Math.max(gridSpacing * 0.55, Math.min(stationStep * 0.45, gridSpacing * 1.8));
		var maxGap = Math.max(gridSpacing * 2.2, stationStep * 0.8);
		var stations = _buildGuideStations(0, guide.length, stationStep, stationMode, guide.segments);

		var sections = [];
		var seq = 0;
		for (var si = 0; si < stations.length; si++) {
			var station = stations[si];
			var seg = _findSegmentForStation(guide.segments, station);
			if (!seg) continue;
			var local = Math.max(0, Math.min(seg.len, station - seg.startStation));
			var cx = seg.a.x + seg.ux * local;
			var cy = seg.a.y + seg.uy * local;

			var items = [];
			for (var ri = 0; ri < cellRows.length; ri++) {
				var row = cellRows[ri];
				var dx = row.x - cx;
				var dy = row.y - cy;
				var along = (dx * seg.ux) + (dy * seg.uy);
				var lateral = (dx * seg.vx) + (dy * seg.vy);
				if (Math.abs(along) > bandHalf) continue;
				if (spanMode === 'fixed' && Math.abs(lateral) > halfSpan) continue;
				items.push({ row: row, lateral: lateral });
			}
			if (items.length < 2) continue;

			items.sort(function (a, b) { return a.lateral - b.lateral; });
			var cutA = 0;
			var fillA = 0;
			var len = 0;
			var profile = [];
			var baseLat = items[0].lateral;
			for (var k = 0; k < items.length; k++) {
				profile.push({ station: items[k].lateral - baseLat, z: items[k].row.z });
				if (k === items.length - 1) continue;
				var curr = items[k];
				var next = items[k + 1];
				var span = next.lateral - curr.lateral;
				if (!isFinite(span) || span <= 0 || span > maxGap) continue;
				len += span;
				var c1 = Math.max(0, curr.row.z - refElevation);
				var c2 = Math.max(0, next.row.z - refElevation);
				var f1 = Math.max(0, refElevation - curr.row.z);
				var f2 = Math.max(0, refElevation - next.row.z);
				cutA += ((c1 + c2) * 0.5 * span);
				fillA += ((f1 + f2) * 0.5 * span);
			}

			if (!(len > 0)) continue;
			var startLat = items[0].lateral;
			var endLat = items[items.length - 1].lateral;
			var startX = cx + (startLat * seg.vx);
			var startY = cy + (startLat * seg.vy);
			var endX = cx + (endLat * seg.vx);
			var endY = cy + (endLat * seg.vy);
			seq++;
			sections.push({
				axis: 'C',
				name: 'C-' + seq,
				station: station,
				cutArea: cutA,
				fillArea: fillA,
				netArea: fillA - cutA,
				length: len,
				start: { x: startX, y: startY },
				end: { x: endX, y: endY },
				profile: profile
			});
		}

		return sections;
	}

	function _buildSections(cellRows, gridSpacing, sectionInterval, refElevation, sectionDirection, bounds, sectionGuide, sectionOptions) {
		var mode = String(sectionDirection || 'both').toLowerCase();
		if (mode === 'guide') {
			return _buildSectionsAlongGuide(cellRows, gridSpacing, sectionInterval, refElevation, sectionGuide, sectionOptions);
		}
		if (mode === 'guidecurve') {
			return _buildSectionsAlongCurveGuide(cellRows, gridSpacing, sectionInterval, refElevation, sectionGuide, sectionOptions);
		}

		var byRow = Object.create(null);
		var byCol = Object.create(null);
		for (var i = 0; i < cellRows.length; i++) {
			var r = cellRows[i];
			if (!byRow[r.iy]) byRow[r.iy] = [];
			if (!byCol[r.ix]) byCol[r.ix] = [];
			byRow[r.iy].push(r);
			byCol[r.ix].push(r);
		}

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

	function _computeSampleZRange(sampledNodes) {
		var minZ = Infinity;
		var maxZ = -Infinity;
		for (var i = 0; i < (sampledNodes || []).length; i++) {
			var z = sampledNodes[i] && sampledNodes[i].z;
			if (!isFinite(z)) continue;
			minZ = Math.min(minZ, z);
			maxZ = Math.max(maxZ, z);
		}
		if (!isFinite(minZ) || !isFinite(maxZ)) return 0;
		return maxZ - minZ;
	}

	function _formatSectionDirectionLabel(mode) {
		var m = String(mode || 'both').toLowerCase();
		if (m === 'x') return 'Yalniz X';
		if (m === 'y') return 'Yalniz Y';
		if (m === 'guide') return 'Cizilen duz eksene dik kesitler';
		if (m === 'guidecurve') return 'Cizilen kurpa dik kesitler';
		if (m === 'dominant') return 'Otomatik (baskin eksen)';
		return 'X + Y (tam)';
	}

	function _countSectionsByAxis(sections) {
		var xCount = 0;
		var yCount = 0;
		var gCount = 0;
		var cCount = 0;
		for (var i = 0; i < (sections || []).length; i++) {
			if (sections[i].axis === 'X') xCount++;
			else if (sections[i].axis === 'Y') yCount++;
			else if (sections[i].axis === 'G') gCount++;
			else if (sections[i].axis === 'C') cCount++;
		}
		return {
			x: xCount,
			y: yCount,
			g: gCount,
			c: cCount,
			total: xCount + yCount + gCount + cCount
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
		var secNetFillMinusCut = isFinite(sec.netArea) ? sec.netArea : ((sec.fillArea || 0) - (sec.cutArea || 0));
		var secNetCutMinusFill = isFinite(sec.netAreaCutMinusFill) ? sec.netAreaCutMinusFill : -secNetFillMinusCut;
		if (_sectionMetaEl) {
			_sectionMetaEl.innerHTML = '<b>' + _escapeHtml(sec.name) + '</b> | Eksen: ' + _escapeHtml(sec.axis) +
				' | Istasyon: ' + _formatNum(sec.station, 2) + ' m<br>' +
				'Uzunluk: ' + _formatNum(sec.length, 2) + ' m | Kazi: ' + _formatNum(sec.cutArea, 2) + ' m2 | Dolgu: ' + _formatNum(sec.fillArea, 2) + ' m2 | Net (D-K): ' + _formatNum(secNetFillMinusCut, 2) + ' m2 | Net (K-D): ' + _formatNum(secNetCutMinusFill, 2) + ' m2 (' + balanceLabel + ')';
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
				var secNet = isFinite(sec.netArea) ? sec.netArea : ((sec.fillArea || 0) - (sec.cutArea || 0));
				html.push('<option value="' + i + '">' + _escapeHtml(sec.name + ' | ' + sec.axis + ' | Net(D-K) ' + _formatNum(secNet, 2) + ' m2') + '</option>');
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
		var guideMeta = '';
		if (result.sectionGuide) {
			var guideTypeLabel = String(result.sectionGuide.type || 'line') === 'curve' ? 'Kurplu' : 'Duz';
			var pointCount = Array.isArray(result.sectionGuide.points) ? result.sectionGuide.points.length : (result.sectionGuide.start && result.sectionGuide.end ? 2 : 0);
			var guideLengthLabel = isFinite(result.sectionGuide.length) ? (_formatNum(result.sectionGuide.length, 2) + ' m') : '-';
			var guideAzimuthLabel = isFinite(result.sectionGuide.azimuthDeg) ? (_formatNum(result.sectionGuide.azimuthDeg, 2) + '°') : '-';
			var spanLabel = String(result.sectionSpanMode || 'auto') === 'fixed'
				? ('Sabit ±' + _formatNum(result.sectionHalfSpan || 0, 2) + ' m')
				: 'Sinira kadar (otomatik)';
			var stationLabel = String(result.sectionStationMode || 'interval+vertices') === 'interval'
				? 'Sabit aralik'
				: 'Aralik + kirik noktalar';
			guideMeta = '<div><b>Kesit Ekseni:</b> ' + guideTypeLabel + ' | Uzunluk ' + guideLengthLabel + ' | Azimut (kuzey=0) ' + guideAzimuthLabel + ' | Nokta ' + pointCount + '</div>' +
				'<div><b>Kesit Standardi:</b> Istasyon=' + stationLabel + ' | Acilim=' + spanLabel + '</div>';
		}
		var netFillMinusCut = isFinite(result.netVolume) ? result.netVolume : ((result.fillVolume || 0) - (result.cutVolume || 0));
		var netCutMinusFill = isFinite(result.netVolumeCutMinusFill) ? result.netVolumeCutMinusFill : -netFillMinusCut;
		var sourcePairs = [];
		for (var k in result.sourceStats) {
			if (!Object.prototype.hasOwnProperty.call(result.sourceStats, k)) continue;
			sourcePairs.push(k + ': ' + result.sourceStats[k]);
		}
		var sourceNote = result.surfaceSourceNote ? ('<div><b>Kaynak Notu:</b> ' + _escapeHtml(result.surfaceSourceNote) + '</div>') : '';
		_summaryEl.innerHTML = [
			'<div><b>Yontem:</b> Prismoidal Grid + kesin sinir kirpma + isaretli ucgen entegrasyon</div>',
			'<div><b>Standart Notu:</b> ' + _escapeHtml(result.standardNote || VOLUME_STANDARD_NOTE) + '</div>',
			'<div><b>Koordinat:</b> EPSG:5254 (TM30)</div>',
			'<div><b>Grid:</b> ' + _formatNum(result.gridSpacing, 2) + ' m | <b>Kesit:</b> ' + _formatNum(result.sectionInterval, 2) + ' m | <b>Sure:</b> ' + _formatNum((result.runTimeMs || 0) / 1000, 2) + ' sn</div>',
			'<div><b>Kesit Yonu:</b> ' + _escapeHtml(_formatSectionDirectionLabel(result.sectionDirection)) + ' | <b>Dagilim:</b> X=' + sectionCounts.x + ' | Y=' + sectionCounts.y + ' | G=' + (sectionCounts.g || 0) + ' | C=' + (sectionCounts.c || 0) + ' | Toplam=' + sectionCounts.total + '</div>',
			guideMeta,
			'<div><b>Referans:</b> ' + _formatNum(result.referenceElevation, 3) + ' m (' + _escapeHtml(result.referenceMode) + ')</div>',
			'<div><b>Alan:</b> ' + _formatNum(result.polygonArea, 2) + ' m² | <b>Hucre:</b> ' + result.cells.length + ' | <b>Dugum:</b> ' + result.sampledNodes.length + '</div>',
			'<div><b>Yuzey Z Araligi:</b> ' + _formatNum(result.sampleZRange || 0, 3) + ' m</div>',
			'<div><b>Kaplama Alan (grid):</b> ' + _formatNum(result.coverageArea || 0, 2) + ' m² | <b>Kapanim Hata:</b> ' + _formatNum(result.areaClosureError || 0, 4) + ' m² (%' + _formatNum((result.areaClosureRate || 0) * 100, 4) + ')</div>',
			'<div><b>Kazi:</b> ' + _formatNum(result.cutVolume, 2) + ' m³</div>',
			'<div><b>Dolgu:</b> ' + _formatNum(result.fillVolume, 2) + ' m³</div>',
			'<div><b>Net (Dolgu-Kazi):</b> ' + _formatNum(netFillMinusCut, 2) + ' m³</div>',
			'<div><b>Net (Kazi-Dolgu):</b> ' + _formatNum(netCutMinusFill, 2) + ' m³</div>',
			'<div><b>Net Konvansiyon:</b> + deger = dolgu agirlikli (D-K), - deger = kazi agirlikli</div>',
			'<div><b>Ortalama mutlak derinlik:</b> ' + _formatNum(result.meanAbsDepth, 3) + ' m</div>',
			'<div><b>Kalite Skoru:</b> ' + _formatNum(result.qualityScore, 1) + '/100 (' + _escapeHtml(result.qualityClass) + ')</div>',
			'<div><b>Fallback Orani:</b> %' + _formatNum((result.fallbackRate || 0) * 100, 2) + '</div>',
			'<div><b>Duzlem Kesisen Ucgen:</b> ' + (result.splitTriangles || 0) + ' | <b>Hucre Integrasyon Fallback:</b> ' + (result.integrationFallbackCells || 0) + '</div>',
			'<div><b>Ornek kaynak dagilimi:</b> ' + _escapeHtml(sourcePairs.join(' | ')) + '</div>',
			sourceNote,
			'<table><thead><tr><th>Kesit</th><th>Eksen</th><th>Kazi Alan</th><th>Dolgu Alan</th><th>Net (D-K)</th><th>Net (K-D)</th></tr></thead><tbody>' +
				topSections.map(function (s) {
					var secNetFillMinusCut = isFinite(s.netArea) ? s.netArea : ((s.fillArea || 0) - (s.cutArea || 0));
					var secNetCutMinusFill = isFinite(s.netAreaCutMinusFill) ? s.netAreaCutMinusFill : -secNetFillMinusCut;
					return '<tr><td>' + _escapeHtml(s.name) + '</td><td>' + _escapeHtml(s.axis) + '</td><td>' + _formatNum(s.cutArea, 2) + '</td><td>' + _formatNum(s.fillArea, 2) + '</td><td>' + _formatNum(secNetFillMinusCut, 2) + '</td><td>' + _formatNum(secNetCutMinusFill, 2) + '</td></tr>';
				}).join('') +
			'</tbody></table>'
		].join('');
	}

	function _visualizeResult(result, options) {
		_clearVisualization();
		if (!result || !viewer || !viewer.scene) return;

		var showCut = !options || options.showCut !== false;
		var showFill = !options || options.showFill !== false;
		var showSections = !options || options.showSections !== false;
		var showLabel = !options || options.showLabel !== false;

		if (showCut || showFill) {
			try {
				var pointsCol = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
				var step = 1;
				if (result.cells.length > 12000) step = 3;
				else if (result.cells.length > 6000) step = 2;

				for (var i = 0; i < result.cells.length; i += step) {
					var c = result.cells[i];
					var cls = _classifyCellCutFill(c);
					if (cls.isCutOnly && !showCut) continue;
					if (cls.isFillOnly && !showFill) continue;
					if ((cls.isMixed || cls.isBalance) && !(showCut && showFill)) continue;
					var color = cls.isCutOnly
						? Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.78)
						: (cls.isFillOnly
							? Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.78)
							: (cls.isMixed
								? Cesium.Color.fromCssColorString('#f59e0b').withAlpha(0.8)
								: Cesium.Color.fromCssColorString('#cbd5e1').withAlpha(0.55)));
					pointsCol.add({
						position: Cesium.Cartesian3.fromDegrees(c.lon, c.lat, c.z),
						pixelSize: 4,
						color: color,
						outlineColor: Cesium.Color.BLACK.withAlpha(0.35),
						outlineWidth: 1,
						disableDepthTestDistance: 0
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
					: (sec.axis === 'G'
						? Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.9)
						: (sec.axis === 'C'
							? Cesium.Color.fromCssColorString('#14b8a6').withAlpha(0.9)
							: Cesium.Color.fromCssColorString('#a855f7').withAlpha(0.82)));
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
				var netFillMinusCut = isFinite(result.netVolume) ? result.netVolume : ((result.fillVolume || 0) - (result.cutVolume || 0));
				var netCutMinusFill = isFinite(result.netVolumeCutMinusFill) ? result.netVolumeCutMinusFill : -netFillMinusCut;
				var text = 'Net(D-K): ' + _formatNum(netFillMinusCut, 2) + ' m3 | Net(K-D): ' + _formatNum(netCutMinusFill, 2) + ' m3 | Kazi: ' + _formatNum(result.cutVolume, 2) + ' | Dolgu: ' + _formatNum(result.fillVolume, 2);
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

		_setStatus('Hacim entegrasyonu yapiliyor...', 'info');
		_setProgress(82);

		var cellRows = [];
		var cutVolume = 0;
		var fillVolume = 0;
		var absDepthAcc = 0;
		var coverageArea = 0;
		var splitTriangles = 0;
		var integrationFallbackCells = 0;
		for (var ci = 0; ci < framework.cells.length; ci++) {
			var cell = framework.cells[ci];
			var n00 = nodeMap[cell.n00];
			var n10 = nodeMap[cell.n10];
			var n11 = nodeMap[cell.n11];
			var n01 = nodeMap[cell.n01];
			if (!n00 || !n10 || !n11 || !n01) continue;
			var cellArea = isFinite(cell.overlapArea) && cell.overlapArea > 0
				? cell.overlapArea
				: ((cell.coverage || 1) * opts.gridSpacing * opts.gridSpacing);
			if (!(cellArea > 0)) continue;

			var integration = _integrateCellCutFill(cell, n00, n10, n11, n01, refElevation);
			var cellCut = integration.cut;
			var cellFill = integration.fill;
			if (!isFinite(cellCut) || !isFinite(cellFill)) continue;

			coverageArea += cellArea;
			splitTriangles += integration.splitTriangles || 0;
			if (integration.usedFallback) integrationFallbackCells++;

			cutVolume += cellCut;
			fillVolume += cellFill;
			var zCenter = (n00.z + n10.z + n11.z + n01.z) * 0.25;
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
		var normalizedSectionGuide = _normalizeSectionGuide(opts.sectionGuide);

		_setStatus('Kesitler olusturuluyor...', 'info');
		_setProgress(92);
		var sections = _buildSections(cellRows, opts.gridSpacing, opts.sectionInterval, refElevation, opts.sectionDirection, framework, normalizedSectionGuide, opts);
		if (!sections || sections.length === 0) {
			throw new Error('Secilen kesit yonunde kesit olusturulamadi. Kesit araligini buyutun veya yonu degistirin.');
		}
		for (var si = 0; si < sections.length; si++) {
			sections[si].netAreaCutMinusFill = (sections[si].cutArea || 0) - (sections[si].fillArea || 0);
			if (sections[si].start) sections[si].startWgs = _tm30ToWgs(sections[si].start.x, sections[si].start.y);
			if (sections[si].end) sections[si].endWgs = _tm30ToWgs(sections[si].end.x, sections[si].end.y);
		}
		var sourceStats = _summarizeSources(sampledNodes);
		var sampleZRange = _computeSampleZRange(sampledNodes);
		var fallbackCount = sourceStats.vertexWeightedFallback || 0;
		var fallbackRate = sampledNodes.length > 0 ? (fallbackCount / sampledNodes.length) : 1;
		var areaClosureError = coverageArea - polygonArea;
		var areaClosureRate = polygonArea > 0 ? Math.abs(areaClosureError) / polygonArea : 1;
		var integrationFallbackRate = cellRows.length > 0 ? (integrationFallbackCells / cellRows.length) : 0;
		var qualityScore = Math.max(0, Math.min(100,
			100 -
			(fallbackRate * 60) -
			(areaClosureRate * 220) -
			(integrationFallbackRate * 25)
		));
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
			sectionStationMode: opts.sectionStationMode,
			sectionSpanMode: opts.sectionSpanMode,
			sectionHalfSpan: opts.sectionHalfSpan,
			sectionGuide: _serializeSectionGuide(normalizedSectionGuide),
			surfaceSource: opts.surfaceSourceSelection || opts.surfaceSource,
			surfaceSourceUsed: _surfaceSourceUsed,
			surfaceSourceNote: _surfaceSourceNote,
			polygonArea: polygonArea,
			cells: cellRows,
			sampledNodes: sampledNodes,
			sourceStats: sourceStats,
			sampleZRange: sampleZRange,
			fallbackRate: fallbackRate,
			coverageArea: coverageArea,
			areaClosureError: areaClosureError,
			areaClosureRate: areaClosureRate,
			splitTriangles: splitTriangles,
			integrationFallbackCells: integrationFallbackCells,
			integrationFallbackRate: integrationFallbackRate,
			qualityScore: qualityScore,
			qualityClass: qualityClass,
			cutVolume: cutVolume,
			fillVolume: fillVolume,
			netVolume: fillVolume - cutVolume,
			netVolumeCutMinusFill: cutVolume - fillVolume,
			netVolumeConvention: 'fill-minus-cut',
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
			['Yontem', 'Prismoidal Grid + Kesin Sinir Kirpma + Isaretli Ucgen Entegrasyon'],
			['Standart Notu', result.standardNote || VOLUME_STANDARD_NOTE],
			['Kesit Yonu', _formatSectionDirectionLabel(result.sectionDirection)],
			['Istasyon Standardi', (String(result.sectionStationMode || 'interval+vertices') === 'interval') ? 'Sabit aralik' : 'Aralik + kirik noktalar'],
			['Kesit Acilimi', (String(result.sectionSpanMode || 'auto') === 'fixed') ? ('Sabit ±' + _formatNum(result.sectionHalfSpan || 0, 2) + ' m') : 'Sinira kadar (otomatik)'],
			['Kesit Rehber Tipi', result.sectionGuide ? (String(result.sectionGuide.type || 'line') === 'curve' ? 'Kurplu' : 'Duz') : '-'],
			['Kesit Rehber Uzunlugu (m)', result.sectionGuide && isFinite(result.sectionGuide.length) ? _formatNum(result.sectionGuide.length, 3) : '-'],
			['Kesit Rehber Azimut (kuzey=0)', result.sectionGuide && isFinite(result.sectionGuide.azimuthDeg) ? _formatNum(result.sectionGuide.azimuthDeg, 3) : '-'],
			['Yuzey Kaynagi (secim)', result.surfaceSource],
			['Yuzey Kaynagi (kullanilan)', result.surfaceSourceUsed || result.surfaceSource],
			['Kaynak Notu', result.surfaceSourceNote || '-'],
			['Grid Araligi (m)', result.gridSpacing],
			['Kesit Araligi (m)', result.sectionInterval],
			['Hesaplama Suresi (sn)', _formatNum((result.runTimeMs || 0) / 1000, 3)],
			['Referans Modu', result.referenceMode],
			['Referans Kotu (m)', _formatNum(result.referenceElevation, 4)],
			['Alan (m2)', _formatNum(result.polygonArea, 3)],
			['Kaplama Alan (m2)', _formatNum(result.coverageArea, 3)],
			['Alan Kapanim Hatasi (m2)', _formatNum(result.areaClosureError, 6)],
			['Alan Kapanim Hatasi (%)', _formatNum((result.areaClosureRate || 0) * 100, 6)],
			['Kazi Hacmi (m3)', _formatNum(result.cutVolume, 3)],
			['Dolgu Hacmi (m3)', _formatNum(result.fillVolume, 3)],
			['Net Konvansiyon', '+ deger = dolgu agirlikli (Dolgu-Kazi)'],
			['Net Hacim (Dolgu-Kazi) (m3)', _formatNum(result.netVolume, 3)],
			['Net Hacim (Kazi-Dolgu) (m3)', _formatNum(result.netVolumeCutMinusFill, 3)],
			['Ortalama Mutlak Derinlik (m)', _formatNum(result.meanAbsDepth, 4)],
			['Duzlem Kesisen Ucgen Sayisi', result.splitTriangles || 0],
			['Integrasyon Fallback Hucre', result.integrationFallbackCells || 0],
			['Integrasyon Fallback Orani (%)', _formatNum((result.integrationFallbackRate || 0) * 100, 4)],
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
				net_cut_minus_fill_m3: r.cutVolume - r.fillVolume,
				node_sources: r.nodeSources
			};
		});
		XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gridRows), 'Grid_Hucreleri');

		var sectionRows = result.sections.map(function (s) {
			var secNetFillMinusCut = isFinite(s.netArea) ? s.netArea : ((s.fillArea || 0) - (s.cutArea || 0));
			var secNetCutMinusFill = isFinite(s.netAreaCutMinusFill) ? s.netAreaCutMinusFill : -secNetFillMinusCut;
			return {
				axis: s.axis,
				name: s.name,
				station: s.station,
				length_m: s.length,
				cut_area_m2: s.cutArea,
				fill_area_m2: s.fillArea,
				net_area_fill_minus_cut_m2: secNetFillMinusCut,
				net_area_cut_minus_fill_m2: secNetCutMinusFill
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
		doc.text('Yontem: Prismoidal Grid + kesin sinir kirpma + isaretli ucgen entegrasyon', 14, y);
		y += 5;
		doc.text('Kaynak: 3D Tile modeli | Koordinat: EPSG:5254 TM30', 14, y);
		y += 7;

		var summaryPairs = [
			['Rapor Zamani', result.timestamp],
			['Olcum ID', result.measurementId],
			['Olcum Adi', result.measurementName],
			['Standart Notu', result.standardNote || VOLUME_STANDARD_NOTE],
			['Kesit Yonu', _formatSectionDirectionLabel(result.sectionDirection)],
			['Istasyon Standardi', (String(result.sectionStationMode || 'interval+vertices') === 'interval') ? 'Sabit aralik' : 'Aralik + kirik noktalar'],
			['Kesit Acilimi', (String(result.sectionSpanMode || 'auto') === 'fixed') ? ('Sabit ±' + _formatNum(result.sectionHalfSpan || 0, 2) + ' m') : 'Sinira kadar (otomatik)'],
			['Kesit Rehber Tipi', result.sectionGuide ? (String(result.sectionGuide.type || 'line') === 'curve' ? 'Kurplu' : 'Duz') : '-'],
			['Kesit Rehber Uzunlugu (m)', result.sectionGuide && isFinite(result.sectionGuide.length) ? _formatNum(result.sectionGuide.length, 3) : '-'],
			['Kesit Rehber Azimut (kuzey=0)', result.sectionGuide && isFinite(result.sectionGuide.azimuthDeg) ? _formatNum(result.sectionGuide.azimuthDeg, 3) : '-'],
			['Kesit Dagilimi', 'X=' + sectionCounts.x + ' | Y=' + sectionCounts.y + ' | G=' + (sectionCounts.g || 0) + ' | C=' + (sectionCounts.c || 0) + ' | Toplam=' + sectionCounts.total],
			['Kaynak (secim/kullanilan)', (result.surfaceSource || '-') + ' / ' + (result.surfaceSourceUsed || result.surfaceSource || '-')],
			['Kaynak Notu', result.surfaceSourceNote || '-'],
			['Grid Araligi (m)', _formatNum(result.gridSpacing, 3)],
			['Kesit Araligi (m)', _formatNum(result.sectionInterval, 3)],
			['Hesaplama Suresi (sn)', _formatNum((result.runTimeMs || 0) / 1000, 3)],
			['Referans Modu', result.referenceMode],
			['Referans Kotu (m)', _formatNum(result.referenceElevation, 4)],
			['Alan (m2)', _formatNum(result.polygonArea, 3)],
			['Kaplama Alan (m2)', _formatNum(result.coverageArea, 3)],
			['Alan Kapanim Hatasi (m2)', _formatNum(result.areaClosureError, 6)],
			['Alan Kapanim Hatasi (%)', _formatNum((result.areaClosureRate || 0) * 100, 6)],
			['Kazi (m3)', _formatNum(result.cutVolume, 3)],
			['Dolgu (m3)', _formatNum(result.fillVolume, 3)],
			['Net Konvansiyon', '+ deger = dolgu agirlikli (Dolgu-Kazi)'],
			['Net (Dolgu-Kazi) (m3)', _formatNum(result.netVolume, 3)],
			['Net (Kazi-Dolgu) (m3)', _formatNum(result.netVolumeCutMinusFill, 3)],
			['Ortalama Mutlak Derinlik (m)', _formatNum(result.meanAbsDepth, 4)],
			['Duzlem Kesisen Ucgen', '' + (result.splitTriangles || 0)],
			['Integrasyon Fallback Hucre', '' + (result.integrationFallbackCells || 0)],
			['Integrasyon Fallback Orani', '%' + _formatNum((result.integrationFallbackRate || 0) * 100, 4)],
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
			var secNetFillMinusCut = isFinite(s.netArea) ? s.netArea : ((s.fillArea || 0) - (s.cutArea || 0));
			var secNetCutMinusFill = isFinite(s.netAreaCutMinusFill) ? s.netAreaCutMinusFill : -secNetFillMinusCut;
			return [s.name, s.axis, _formatNum(s.station, 2), _formatNum(s.cutArea, 2), _formatNum(s.fillArea, 2), _formatNum(secNetFillMinusCut, 2), _formatNum(secNetCutMinusFill, 2)];
		});

		if (sectionRows.length > 0) {
			if (typeof doc.autoTable === 'function') {
				doc.autoTable({
					startY: y,
					head: [['Kesit', 'Eksen', 'Istasyon', 'Kazi Alan', 'Dolgu Alan', 'Net (D-K)', 'Net (K-D)']],
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
		doc.text('Not: Hesap, secili alanda kesin sinir kirpma ve hucre-ucgen bazli isaretli prismoidal entegrasyon ile uretilmistir.', 14, Math.min(290, y + 6));

		for (var si = 0; si < result.sections.length; si++) {
			var sec = result.sections[si];
			doc.addPage();
			doc.setFontSize(12);
			doc.text('KESIT MINI PROFIL - ' + sec.name, 14, 14);
			doc.setFontSize(9);
			doc.text('Eksen: ' + sec.axis + ' | Istasyon: ' + _formatNum(sec.station, 2) + ' m', 14, 20);
			var secNetFillMinusCut = isFinite(sec.netArea) ? sec.netArea : ((sec.fillArea || 0) - (sec.cutArea || 0));
			var secNetCutMinusFill = isFinite(sec.netAreaCutMinusFill) ? sec.netAreaCutMinusFill : -secNetFillMinusCut;
			doc.text('Uzunluk: ' + _formatNum(sec.length, 2) + ' m | Kazi Alan: ' + _formatNum(sec.cutArea, 2) + ' m2 | Dolgu Alan: ' + _formatNum(sec.fillArea, 2) + ' m2 | Net(D-K): ' + _formatNum(secNetFillMinusCut, 2) + ' m2', 14, 25);

			_drawPdfSectionMiniProfile(doc, sec, result.referenceElevation, 14, 30, 182, 86);

			var detailRows = [
				['Kesit Adi', sec.name],
				['Eksen', sec.axis],
				['Istasyon (m)', _formatNum(sec.station, 3)],
				['Uzunluk (m)', _formatNum(sec.length, 3)],
				['Kazi Alani (m2)', _formatNum(sec.cutArea, 3)],
				['Dolgu Alani (m2)', _formatNum(sec.fillArea, 3)],
				['Net Alan (Dolgu-Kazi) (m2)', _formatNum(secNetFillMinusCut, 3)],
				['Net Alan (Kazi-Dolgu) (m2)', _formatNum(secNetCutMinusFill, 3)],
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
			var cls = _classifyCellCutFill(cell);
			var layer = cls.isCutOnly
				? 'CUT_CELLS'
				: (cls.isFillOnly
					? 'FILL_CELLS'
					: (cls.isMixed ? 'MIXED_CELLS' : 'BALANCE_CELLS'));
			dxf += '0\nPOINT\n8\n' + layer + '\n10\n' + cell.x + '\n20\n' + cell.y + '\n30\n' + cell.z + '\n';
		}

		for (var s = 0; s < result.sections.length; s++) {
			var sec = result.sections[s];
			if (!sec.start || !sec.end) continue;
			var secLayer = sec.axis === 'X'
				? 'SECTION_X'
				: (sec.axis === 'G'
					? 'SECTION_GUIDE'
					: (sec.axis === 'C' ? 'SECTION_CURVE' : 'SECTION_Y'));
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
			sectionGuide: _serializeSectionGuide(_sectionGuide),
			sectionStationMode: _sectionStationModeEl ? _sectionStationModeEl.value : 'interval+vertices',
			sectionSpanMode: _sectionSpanModeEl ? _sectionSpanModeEl.value : 'auto',
			sectionHalfSpan: parseFloat(_sectionHalfSpanEl && _sectionHalfSpanEl.value),
			surfaceSourceSelection: _sourceEl ? _sourceEl.value : 'auto',
			surfaceSource: _resolveSurfaceSource(_sourceEl ? _sourceEl.value : 'auto')
		};
		if (opts.sectionSpanMode === 'fixed' && (!isFinite(opts.sectionHalfSpan) || opts.sectionHalfSpan <= 0)) {
			_showError('Sabit kesit acilimi icin pozitif yaricap girin.');
			return;
		}
		if (opts.sectionDirection === 'guide' || opts.sectionDirection === 'guideCurve') {
			if (!opts.sectionGuide) {
				_showError('Secilen kesit modu icin once haritada kesit ekseni/kurpu cizin.');
				return;
			}
			if (opts.sectionGuide.measurementId && opts.sectionGuide.measurementId !== measurement.id) {
				_showError('Kesit ekseni farkli bir alana ait. Mevcut alan icin ekseni yeniden cizin.');
				return;
			}
			if (opts.sectionDirection === 'guide' && opts.sectionGuide.type !== 'line') {
				_showError('Duz eksene dik mod icin 2 nokta ile duz eksen cizin.');
				return;
			}
			if (opts.sectionDirection === 'guideCurve' && opts.sectionGuide.type !== 'curve') {
				_showError('Kurpa dik mod icin haritada kurplu eksen cizin.');
				return;
			}
		}

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
			_syncReferenceUi(measurement, result.referenceElevation);
			_setStatus('Hacim hesabi tamamlandi.', 'ok');
			_showInfo('Hacim hesabi tamamlandi. Raporlari indirebilirsiniz.');
			if (result.surfaceSourceNote) {
				_setStatus('Hacim hesabi tamamlandi. Not: ' + result.surfaceSourceNote, 'ok');
			}
			var qualityWarnings = [];
			if ((result.fallbackRate || 0) > 0.15) {
				qualityWarnings.push('ornek fallback orani yuksek (%' + _formatNum((result.fallbackRate || 0) * 100, 2) + ')');
			}
			if ((result.areaClosureRate || 0) > 0.0025) {
				qualityWarnings.push('alan kapanim hatasi yuksek (%' + _formatNum((result.areaClosureRate || 0) * 100, 4) + ')');
			}
			if ((result.integrationFallbackRate || 0) > 0.05) {
				qualityWarnings.push('hucre integrasyon fallback orani yuksek (%' + _formatNum((result.integrationFallbackRate || 0) * 100, 2) + ')');
			}
			if (qualityWarnings.length > 0) {
				_setStatus('Hesap tamamlandi ancak kalite uyarisi var: ' + qualityWarnings.join(' | ') + '. Nihai rapor oncesi daha ince grid/model onerilir.', 'error');
			}
			var totalAbsVolume = Math.abs(result.cutVolume || 0) + Math.abs(result.fillVolume || 0);
			if (qualityWarnings.length === 0 && totalAbsVolume < 1e-3) {
				var zeroHint = 'Hacim sonucu sifira yakin. Alan duz olabilir';
				if ((result.sampleZRange || 0) < 0.05) {
					zeroHint += ' (yuzey Z araligi: ' + _formatNum(result.sampleZRange || 0, 3) + ' m)';
				}
				if ((result.fallbackRate || 0) > 0.5) {
					zeroHint += ' | orneklerde fallback orani yuksek';
				}
				zeroHint += '. Test icin Sabit kot secip zeminden ±1 m farkli bir degerle tekrar hesaplayin.';
				_setStatus(zeroHint, 'info');
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
		_stopSectionGuidePickMode(true);
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

		var measurementChanged = (_selectedMeasurementId !== null && _selectedMeasurementId !== measurement.id);
		if (measurementChanged) {
			_clearSectionGuide(true);
			_fixedRefUserEdited = false;
			_activeMeasurementStats = null;
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
		_activeMeasurementStats = {
			measurementId: measurement.id,
			min: minZ,
			max: maxZ,
			mean: meanZ
		};
		if (_refModeEl && _refModeEl.value === 'fixed' && _refValueEl && !_fixedRefUserEdited) {
			var existingFixed = parseFloat(_refValueEl.value);
			if (!isFinite(existingFixed) || Math.abs(existingFixed) < 1e-9) _refValueEl.value = _formatNum(meanZ, 2);
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
		_syncReferenceUi(measurement, null);
		_updateSectionGuideUi();
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
