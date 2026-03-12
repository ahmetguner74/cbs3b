// ═══════════════════════════════════════════════════════════════
// GELİŞTİRİCİ MODU PANELİ (Solid Model Dev Panel)
// Sadece localhost / file:// ortamında çalışır.
// Üretim sunucusunda otomatik gizlenir.
// Kısayol: Ctrl+Shift+D ile aç/kapat
// Not: Bu panel yalnızca solid model ayarlarını içerir.
// ═══════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── Üretim kontrolü: sadece dev ortamında çalış ──
    var host = window.location.hostname;
    var isDev = (host === 'localhost' || host === '127.0.0.1' || host === '' || window.location.protocol === 'file:');
    if (!isDev) return;

    // Cesium nesnelerine erişim (main.js global'leri)
    function getViewer() { return window.viewer; }
    function getTileset() { return window.tileset; }

    // ── Panel HTML ──
    var panelHTML = `
    <div id="devPanelBackdrop" style="display:none;position:fixed;inset:0;background:transparent;z-index:99998;pointer-events:none;"></div>
    <div id="devPanel" style="
        display:none; position:fixed; top:60px; left:12px; width:440px; max-height:calc(100vh - 80px);
        background:#0f172a; border:1px solid #334155; border-radius:10px;
        box-shadow:0 12px 40px rgba(0,0,0,0.5); z-index:99999;
        font-family:'Inter',sans-serif; font-size:11px; color:#e2e8f0;
        overflow-y:auto; scrollbar-width:thin;
    ">
        <div style="padding:10px 14px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#0f172a;z-index:1;">
            <span style="font-weight:700;font-size:12px;color:#f59e0b;">🧱 SOLID DEV PANEL</span>
            <div style="display:flex;align-items:center;gap:4px;">
                <button id="dp-apply" style="padding:3px 10px;background:#f59e0b;color:#0f172a;border:none;border-radius:4px;font-weight:700;font-size:10px;cursor:pointer;">⚡ UYGULA</button>
                <button id="dp-reset" style="padding:3px 10px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;font-weight:600;font-size:10px;cursor:pointer;">↺ SIFIRLA</button>
                <button onclick="document.getElementById('devPanel').style.display='none';document.getElementById('devPanelBackdrop').style.display='none';" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;margin-left:4px;">✕</button>
            </div>
        </div>
        <div style="padding:10px 14px;" id="devPanelContent">

            <!-- ═══ 1. SOLID STİL ═══ -->
            <div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:8px 0 6px;">1. SOLID STİL</div>
            <label class="dp-row"><span>styleOverride</span><span class="dp-desc">Açık değilse modelin orijinal görünümü korunur</span><input type="checkbox" id="dp-useTileStyle"></label>
            <div class="dp-row"><span>tileColor</span><span class="dp-desc">Solid görünüm ana rengi</span><input type="color" id="dp-tileColor" value="#d9d9d9" style="width:40px;height:20px;border:none;cursor:pointer;"></div>
            <div class="dp-row"><span>tileAlpha</span><span class="dp-desc">Solid görünüm opaklığı</span><input type="range" id="dp-tileAlpha" min="0" max="1" step="0.05" value="1" style="width:70px;"><span id="dp-tileAlphaVal" class="dp-val">1.00</span></div>

            <!-- ═══ 2. SOLID SHADER ═══ -->
            <div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:12px 0 6px;border-top:1px solid #1e293b;padding-top:8px;">2. SOLID SHADER</div>
            <label class="dp-row"><span>shaderOverride</span><span class="dp-desc">Açık değilse orijinal materyal/shader korunur</span><input type="checkbox" id="dp-useShader"></label>

            <div class="dp-row"><span>lightModel</span><span class="dp-desc">Aydınlatma hesaplama türü</span>
                <select id="dp-lightModel" class="dp-select">
                    <option value="UNLIT">UNLIT</option>
                    <option value="PBR">PBR</option>
                </select>
            </div>
            <div class="dp-row"><span>transMode</span><span class="dp-desc">Shader saydamlık modu</span>
                <select id="dp-transMode" class="dp-select">
                    <option value="OPAQUE">OPAQUE</option>
                    <option value="TRANSLUCENT">TRANSLUCENT</option>
                </select>
            </div>
            <div class="dp-row"><span>brightMin</span><span class="dp-desc">Yan yüz parlaklığı</span><input type="range" id="dp-brightMin" min="0" max="1" step="0.05" value="0.35" style="width:70px;"><span id="dp-brightMinVal" class="dp-val">0.35</span></div>
            <div class="dp-row"><span>brightMax</span><span class="dp-desc">Ön yüz parlaklığı</span><input type="range" id="dp-brightMax" min="0" max="1" step="0.05" value="0.85" style="width:70px;"><span id="dp-brightMaxVal" class="dp-val">0.85</span></div>
            <div class="dp-row"><span>matAlpha</span><span class="dp-desc">Shader çıktı opaklığı</span><input type="range" id="dp-matAlpha" min="0" max="1" step="0.05" value="1" style="width:70px;"><span id="dp-matAlphaVal" class="dp-val">1.00</span></div>
            <div class="dp-row"><span>shaderColor</span><span class="dp-desc">Shader çıktı rengi</span><input type="color" id="dp-shaderColor" value="#d9d9d9" style="width:40px;height:20px;border:none;cursor:pointer;"></div>

            <!-- ═══ 3. TILESET RENDER ═══ -->
            <div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:12px 0 6px;border-top:1px solid #1e293b;padding-top:8px;">3. TILESET RENDER</div>

            <div class="dp-row"><span>SSE (LOD)</span><span class="dp-desc">Detay seviyesi (düşük=kalite)</span><input type="range" id="dp-sse" min="1" max="16" step="1" value="2" style="width:70px;"><span id="dp-sseVal" class="dp-val">2</span></div>
            <label class="dp-row"><span>wireframe</span><span class="dp-desc">Tel kafes görünüm</span><input type="checkbox" id="dp-wireframe"></label>
            <label class="dp-row"><span>backFaceCull</span><span class="dp-desc">Arka yüzleri gizle</span><input type="checkbox" id="dp-backface" checked></label>
            <label class="dp-row"><span>shadows</span><span class="dp-desc">Tileset gölge alır/atar</span><input type="checkbox" id="dp-shadows"></label>
            <div class="dp-row"><span>blendMode</span><span class="dp-desc">Style rengi ile materyal karışımı</span>
                <select id="dp-blendMode" class="dp-select">
                    <option value="HIGHLIGHT">HIGHLIGHT</option>
                    <option value="REPLACE">REPLACE</option>
                    <option value="MIX">MIX</option>
                </select>
            </div>
            <div class="dp-row"><span>blendAmt</span><span class="dp-desc">Karışım oranı (MIX modu)</span><input type="range" id="dp-blendAmt" min="0" max="1" step="0.05" value="0.50" style="width:70px;"><span id="dp-blendAmtVal" class="dp-val">0.50</span></div>

            <div id="dp-log" style="color:#22c55e;font-size:10px;min-height:16px;margin:8px 0 4px;"></div>
        </div>
    </div>

    <style>
        .dp-row { display:flex; align-items:center; padding:3px 0; gap:4px; }
        .dp-row > span:first-child { width:90px; flex-shrink:0; color:#e2e8f0; font-size:10px; font-weight:600; }
        .dp-desc { flex:1; color:#64748b; font-size:9px; font-style:italic; }
        .dp-val { width:30px; text-align:right; font-size:10px; color:#94a3b8; flex-shrink:0; }
        .dp-select { background:#1e293b; border:1px solid #334155; color:#e2e8f0; border-radius:4px; padding:2px 4px; font-size:10px; flex-shrink:0; }
        .dp-row input[type="checkbox"] { width:16px; height:16px; accent-color:#f59e0b; cursor:pointer; flex-shrink:0; }
        .dp-row input[type="range"] { accent-color:#f59e0b; height:4px; cursor:pointer; width:70px; flex-shrink:0; }
        .dp-row input[type="color"] { flex-shrink:0; }
        #devPanel::-webkit-scrollbar { width:4px; }
        #devPanel::-webkit-scrollbar-track { background:transparent; }
        #devPanel::-webkit-scrollbar-thumb { background:#334155; border-radius:4px; }
    </style>
    `;

    // Panel'i DOM'a ekle
    var wrapper = document.createElement('div');
    wrapper.innerHTML = panelHTML;
    document.body.appendChild(wrapper);

    var panel = document.getElementById('devPanel');
    var backdrop = document.getElementById('devPanelBackdrop');
    var log = document.getElementById('dp-log');

    var originalTilesetStyle;
    var originalTilesetShader;
    var hasCapturedOriginalStyle = false;
    var hasCapturedOriginalShader = false;

    function dpLog(msg) {
        log.textContent = '✓ ' + msg;
        setTimeout(function () { log.textContent = ''; }, 2000);
    }

    function getDefaultSse() {
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 4 : 2;
    }

    function captureOriginalModelOverrides(tileset) {
        if (!tileset) return;
        if (!hasCapturedOriginalStyle) {
            originalTilesetStyle = tileset.style;
            hasCapturedOriginalStyle = true;
        }
        if (!hasCapturedOriginalShader) {
            originalTilesetShader = tileset.customShader;
            hasCapturedOriginalShader = true;
        }
    }

    function getBlendModeName(mode) {
        if (mode === Cesium.Cesium3DTileColorBlendMode.REPLACE) return 'REPLACE';
        if (mode === Cesium.Cesium3DTileColorBlendMode.MIX) return 'MIX';
        return 'HIGHLIGHT';
    }

    // ── Slider değer göstericileri ──
    ['dp-tileAlpha', 'dp-brightMin', 'dp-brightMax', 'dp-matAlpha', 'dp-blendAmt', 'dp-sse'].forEach(function (id) {
        var el = document.getElementById(id);
        var valEl = document.getElementById(id + 'Val');
        if (el && valEl) {
            el.addEventListener('input', function () {
                var val = parseFloat(this.value);
                valEl.textContent = id === 'dp-sse' ? String(parseInt(this.value, 10)) : val.toFixed(2);
            });
        }
    });

    function syncFromScene() {
        var v = getViewer();
        var t = getTileset();
        if (!v || !t) return;

        captureOriginalModelOverrides(t);

        document.getElementById('dp-useTileStyle').checked = false;
        document.getElementById('dp-useShader').checked = false;

        document.getElementById('dp-sse').value = t.maximumScreenSpaceError || getDefaultSse();
        document.getElementById('dp-wireframe').checked = !!t.debugWireframe;
        document.getElementById('dp-backface').checked = t.backFaceCulling !== false;
        document.getElementById('dp-shadows').checked = t.shadows === Cesium.ShadowMode.ENABLED;

        document.getElementById('dp-blendMode').value = getBlendModeName(t.colorBlendMode);
        document.getElementById('dp-blendAmt').value = typeof t.colorBlendAmount === 'number' ? t.colorBlendAmount : 0.5;

        ['dp-tileAlpha', 'dp-brightMin', 'dp-brightMax', 'dp-matAlpha', 'dp-blendAmt', 'dp-sse'].forEach(function (id) {
            var el = document.getElementById(id);
            var valEl = document.getElementById(id + 'Val');
            if (!el || !valEl) return;
            var val = parseFloat(el.value);
            valEl.textContent = id === 'dp-sse' ? String(parseInt(el.value, 10)) : val.toFixed(2);
        });
    }

    // ── UYGULA ──
    document.getElementById('dp-apply').addEventListener('click', function () {
        var v = getViewer();
        var t = getTileset();
        if (!v || !t) {
            dpLog('Tileset henüz hazır değil');
            return;
        }

        captureOriginalModelOverrides(t);

        // 1. Solid Stil
        var useTileStyleOverride = document.getElementById('dp-useTileStyle').checked;
        var tileColor = document.getElementById('dp-tileColor').value;
        var tileAlpha = parseFloat(document.getElementById('dp-tileAlpha').value);

        if (useTileStyleOverride) {
            t.style = new Cesium.Cesium3DTileStyle({
                color: "color('" + tileColor + "', " + tileAlpha + ')'
            });
        } else if (hasCapturedOriginalStyle) {
            t.style = originalTilesetStyle;
        }

        // 2. Solid Shader
        var useShaderOverride = document.getElementById('dp-useShader').checked;
        if (useShaderOverride) {
            var lightModel = document.getElementById('dp-lightModel').value;
            var transMode = document.getElementById('dp-transMode').value;
            var bMin = parseFloat(document.getElementById('dp-brightMin').value);
            var bMax = parseFloat(document.getElementById('dp-brightMax').value);
            var matAlpha = parseFloat(document.getElementById('dp-matAlpha').value);
            var shaderHex = document.getElementById('dp-shaderColor').value;

            var sr = parseInt(shaderHex.substr(1, 2), 16) / 255;
            var sg = parseInt(shaderHex.substr(3, 2), 16) / 255;
            var sb = parseInt(shaderHex.substr(5, 2), 16) / 255;

            t.customShader = new Cesium.CustomShader({
                lightingModel: Cesium.LightingModel[lightModel],
                translucencyMode: Cesium.CustomShaderTranslucencyMode[transMode],
                fragmentShaderText: '\n' +
                    'void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {\n' +
                    '    vec3 normal = fsInput.attributes.normalEC;\n' +
                    '    float shade = abs(dot(normalize(normal), vec3(0.0, 0.0, 1.0)));\n' +
                    '    float brightness = mix(' + bMin.toFixed(2) + ', ' + bMax.toFixed(2) + ', shade);\n' +
                    '    material.diffuse = vec3(' + sr.toFixed(3) + ', ' + sg.toFixed(3) + ', ' + sb.toFixed(3) + ') * brightness;\n' +
                    '    material.alpha = ' + matAlpha.toFixed(2) + ';\n' +
                    '}\n'
            });
        } else if (hasCapturedOriginalShader) {
            t.customShader = originalTilesetShader;
        }

        // 3. Tileset Render
        t.maximumScreenSpaceError = parseInt(document.getElementById('dp-sse').value, 10);
        t.debugWireframe = document.getElementById('dp-wireframe').checked;
        t.backFaceCulling = document.getElementById('dp-backface').checked;
        t.shadows = document.getElementById('dp-shadows').checked ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;

        var blendMode = document.getElementById('dp-blendMode').value;
        t.colorBlendMode = Cesium.Cesium3DTileColorBlendMode[blendMode];
        t.colorBlendAmount = parseFloat(document.getElementById('dp-blendAmt').value);

        v.scene.requestRender();
        dpLog('Solid model ayarları uygulandı');
    });

    // ── SIFIRLA ──
    document.getElementById('dp-reset').addEventListener('click', function () {
        var v = getViewer();
        var t = getTileset();
        if (!v || !t) return;

        captureOriginalModelOverrides(t);

        t.customShader = hasCapturedOriginalShader ? originalTilesetShader : undefined;
        t.style = hasCapturedOriginalStyle ? originalTilesetStyle : undefined;
        t.maximumScreenSpaceError = getDefaultSse();
        t.debugWireframe = false;
        t.backFaceCulling = true;
        t.shadows = Cesium.ShadowMode.DISABLED;
        t.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT;
        t.colorBlendAmount = 0.5;

        document.getElementById('dp-useTileStyle').checked = false;
        document.getElementById('dp-useShader').checked = false;

        v.scene.requestRender();
        syncFromScene();
        dpLog('Solid model ayarları sıfırlandı');
    });

    // ── Ctrl+Shift+D: Panel aç/kapat ──
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            var isVisible = panel.style.display !== 'none';
            if (isVisible) {
                panel.style.display = 'none';
                backdrop.style.display = 'none';
            } else {
                syncFromScene();
                panel.style.display = 'block';
                backdrop.style.display = 'none';
            }
        }
    });

    console.log('%c[SOLID DEV PANEL] Ctrl+Shift+D ile aç/kapat', 'color:#f59e0b;font-weight:bold;');
})();
