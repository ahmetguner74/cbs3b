// ═══════════════════════════════════════════════════════════════
// GELİŞTİRİCİ MODU PANELİ (Dev Panel)
// Sadece localhost / file:// ortamında çalışır.
// Üretim sunucusunda (cbsuygulamari.bursa.bel.tr) otomatik gizlenir.
// Kısayol: Ctrl+Shift+D ile aç/kapat
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
	<div id="devPanelBackdrop" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:99998;"></div>
	<div id="devPanel" style="
		display:none; position:fixed; top:60px; left:12px; width:440px; max-height:calc(100vh - 80px);
		background:#0f172a; border:1px solid #334155; border-radius:10px;
		box-shadow:0 12px 40px rgba(0,0,0,0.5); z-index:99999;
		font-family:'Inter',sans-serif; font-size:11px; color:#e2e8f0;
		overflow-y:auto; scrollbar-width:thin;
	">
		<div style="padding:10px 14px;border-bottom:1px solid #1e293b;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#0f172a;z-index:1;">
			<span style="font-weight:700;font-size:12px;color:#f59e0b;">🛠 DEV PANEL</span>
			<div style="display:flex;align-items:center;gap:4px;">
				<button id="dp-apply" style="padding:3px 10px;background:#f59e0b;color:#0f172a;border:none;border-radius:4px;font-weight:700;font-size:10px;cursor:pointer;">⚡ UYGULA</button>
				<button id="dp-reset" style="padding:3px 10px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;font-weight:600;font-size:10px;cursor:pointer;">↺ SIFIRLA</button>
				<button onclick="document.getElementById('devPanel').style.display='none';document.getElementById('devPanelBackdrop').style.display='none';" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:16px;margin-left:4px;">✕</button>
			</div>
		</div>
		<div style="padding:10px 14px;" id="devPanelContent">

			<!-- ═══ 1. SAHNE ORTAMI ═══ -->
			<div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:8px 0 6px;">1. SAHNE ORTAMI</div>

			<label class="dp-row"><span>skyBox</span><span class="dp-desc">Yıldızlı gökyüzü kutusu</span><input type="checkbox" id="dp-skyBox"></label>
			<label class="dp-row"><span>sun</span><span class="dp-desc">Güneş görünürlüğü</span><input type="checkbox" id="dp-sun"></label>
			<label class="dp-row"><span>moon</span><span class="dp-desc">Ay görünürlüğü</span><input type="checkbox" id="dp-moon"></label>
			<label class="dp-row"><span>skyAtmosphere</span><span class="dp-desc">Atmosferik saçılma efekti</span><input type="checkbox" id="dp-skyAtmo"></label>
			<label class="dp-row"><span>groundAtmo</span><span class="dp-desc">Yer seviyesi sis</span><input type="checkbox" id="dp-groundAtmo"></label>
			<label class="dp-row"><span>HDR</span><span class="dp-desc">Tone mapping — kontrast artırır</span><input type="checkbox" id="dp-hdr"></label>
			<label class="dp-row"><span>fog</span><span class="dp-desc">Uzak mesafe sis efekti</span><input type="checkbox" id="dp-fog"></label>
			<div class="dp-row"><span>bgColor</span><span class="dp-desc">Sahne arka plan rengi</span><input type="color" id="dp-bgColor" value="#d9d9d9" style="width:40px;height:20px;border:none;cursor:pointer;"></div>

			<!-- ═══ 2. TILESET STİL ═══ -->
			<div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:12px 0 6px;border-top:1px solid #1e293b;padding-top:8px;">2. TILESET STİL</div>

			<div class="dp-row"><span>tileColor</span><span class="dp-desc">Tüm yüzeyleri tek renkle boyar</span><input type="color" id="dp-tileColor" value="#d9d9d9" style="width:40px;height:20px;border:none;cursor:pointer;"></div>
			<div class="dp-row"><span>tileAlpha</span><span class="dp-desc">Yüzey saydamlığı</span><input type="range" id="dp-tileAlpha" min="0" max="1" step="0.05" value="1" style="width:70px;"><span id="dp-tileAlphaVal" class="dp-val">1.0</span></div>

			<!-- ═══ 3. CUSTOM SHADER ═══ -->
			<div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:12px 0 6px;border-top:1px solid #1e293b;padding-top:8px;">3. CUSTOM SHADER</div>

			<div class="dp-row"><span>lightModel</span><span class="dp-desc">Aydınlatma hesaplama türü</span>
				<select id="dp-lightModel" class="dp-select">
					<option value="UNLIT">UNLIT</option>
					<option value="PBR">PBR</option>
				</select>
			</div>
			<div class="dp-row"><span>transMode</span><span class="dp-desc">Saydamlık desteği aç/kapa</span>
				<select id="dp-transMode" class="dp-select">
					<option value="OPAQUE">OPAQUE</option>
					<option value="TRANSLUCENT">TRANSLUCENT</option>
				</select>
			</div>
			<div class="dp-row"><span>brightMin</span><span class="dp-desc">Yan yüzlerin karanlık seviyesi</span><input type="range" id="dp-brightMin" min="0" max="1" step="0.05" value="0.35" style="width:70px;"><span id="dp-brightMinVal" class="dp-val">0.35</span></div>
			<div class="dp-row"><span>brightMax</span><span class="dp-desc">Ön yüzlerin açıklık seviyesi</span><input type="range" id="dp-brightMax" min="0" max="1" step="0.05" value="0.85" style="width:70px;"><span id="dp-brightMaxVal" class="dp-val">0.85</span></div>
			<div class="dp-row"><span>matAlpha</span><span class="dp-desc">Shader çıktı saydamlığı</span><input type="range" id="dp-matAlpha" min="0" max="1" step="0.05" value="1" style="width:70px;"><span id="dp-matAlphaVal" class="dp-val">1.0</span></div>
			<div class="dp-row"><span>shaderColor</span><span class="dp-desc">Shader çıktı rengi</span><input type="color" id="dp-shaderColor" value="#d9d9d9" style="width:40px;height:20px;border:none;cursor:pointer;"></div>

			<!-- ═══ 4. POST PROCESSING ═══ -->
			<div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:12px 0 6px;border-top:1px solid #1e293b;padding-top:8px;">4. POST PROCESSING</div>

			<label class="dp-row"><span>SSAO</span><span class="dp-desc">Köşe/girinti derinlik gölgesi</span><input type="checkbox" id="dp-ssao" checked></label>
			<div class="dp-row"><span>intensity</span><span class="dp-desc">Gölge koyuluğu</span><input type="range" id="dp-ssaoInt" min="1" max="10" step="0.5" value="3" style="width:70px;"><span id="dp-ssaoIntVal" class="dp-val">3.0</span></div>
			<div class="dp-row"><span>bias</span><span class="dp-desc">Düz yüzeyde gölge filtresi</span><input type="range" id="dp-ssaoBias" min="0.01" max="0.5" step="0.01" value="0.1" style="width:70px;"><span id="dp-ssaoBiasVal" class="dp-val">0.10</span></div>
			<div class="dp-row"><span>lengthCap</span><span class="dp-desc">Gölge yayılma yarıçapı</span><input type="range" id="dp-ssaoLen" min="0.1" max="1" step="0.05" value="0.3" style="width:70px;"><span id="dp-ssaoLenVal" class="dp-val">0.30</span></div>
			<div class="dp-row"><span>stepSize</span><span class="dp-desc">Örnekleme aralığı (düşük=kalite)</span><input type="range" id="dp-ssaoStep" min="0.5" max="4" step="0.25" value="1" style="width:70px;"><span id="dp-ssaoStepVal" class="dp-val">1.0</span></div>
			<label class="dp-row"><span>FXAA</span><span class="dp-desc">Kenar yumuşatma (anti-alias)</span><input type="checkbox" id="dp-fxaa"></label>

			<!-- ═══ 5. TILESET RENDER ═══ -->
			<div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:12px 0 6px;border-top:1px solid #1e293b;padding-top:8px;">5. TILESET RENDER</div>

			<label class="dp-row"><span>wireframe</span><span class="dp-desc">Tel kafes görünüm</span><input type="checkbox" id="dp-wireframe"></label>
			<label class="dp-row"><span>backFaceCull</span><span class="dp-desc">Arka yüzleri gizle</span><input type="checkbox" id="dp-backface" checked></label>
			<label class="dp-row"><span>shadows</span><span class="dp-desc">Tileset gölge alır/atar</span><input type="checkbox" id="dp-shadows"></label>
			<div class="dp-row"><span>blendMode</span><span class="dp-desc">Renk karışım yöntemi</span>
				<select id="dp-blendMode" class="dp-select">
					<option value="HIGHLIGHT">HIGHLIGHT</option>
					<option value="REPLACE">REPLACE</option>
					<option value="MIX">MIX</option>
				</select>
			</div>
			<div class="dp-row"><span>blendAmt</span><span class="dp-desc">Karışım oranı (MIX modu)</span><input type="range" id="dp-blendAmt" min="0" max="1" step="0.05" value="0.5" style="width:70px;"><span id="dp-blendAmtVal" class="dp-val">0.50</span></div>

			<!-- ═══ 6. SAHNE AYDINLATMA ═══ -->
			<div style="color:#f59e0b;font-weight:700;font-size:10px;letter-spacing:1px;margin:12px 0 6px;border-top:1px solid #1e293b;padding-top:8px;">6. SAHNE AYDINLATMA</div>

			<div class="dp-row"><span>intensity</span><span class="dp-desc">Işık parlaklığı</span><input type="range" id="dp-lightInt" min="0.5" max="5" step="0.1" value="2" style="width:70px;"><span id="dp-lightIntVal" class="dp-val">2.0</span></div>
			<div class="dp-row"><span>lightColor</span><span class="dp-desc">Işık rengi (sıcak/soğuk ton)</span><input type="color" id="dp-lightColor" value="#ffffff" style="width:40px;height:20px;border:none;cursor:pointer;"></div>
			<label class="dp-row"><span>viewerShadows</span><span class="dp-desc">Sahne geneli gölge sistemi</span><input type="checkbox" id="dp-viewerShadows"></label>
			<label class="dp-row"><span>softShadows</span><span class="dp-desc">Yumuşak gölge kenarları</span><input type="checkbox" id="dp-softShadows"></label>
			<div class="dp-row"><span>darkness</span><span class="dp-desc">Gölge koyuluk seviyesi</span><input type="range" id="dp-shadowDark" min="0" max="1" step="0.05" value="0.3" style="width:70px;"><span id="dp-shadowDarkVal" class="dp-val">0.30</span></div>
			<div class="dp-row"><span>shadowSize</span><span class="dp-desc">Gölge haritası çözünürlüğü</span>
				<select id="dp-shadowSize" class="dp-select">
					<option value="512">512</option>
					<option value="1024" selected>1024</option>
					<option value="2048">2048</option>
					<option value="4096">4096</option>
				</select>
			</div>

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

    function dpLog(msg) { log.textContent = '✓ ' + msg; setTimeout(function () { log.textContent = ''; }, 2000); }

    // Yardımcı: hex → Cesium.Color
    function hexToColor(hex) {
        var r = parseInt(hex.substr(1, 2), 16) / 255;
        var g = parseInt(hex.substr(3, 2), 16) / 255;
        var b = parseInt(hex.substr(5, 2), 16) / 255;
        return new Cesium.Color(r, g, b, 1.0);
    }

    function colorToHex(c) {
        var r = Math.round(c.red * 255).toString(16).padStart(2, '0');
        var g = Math.round(c.green * 255).toString(16).padStart(2, '0');
        var b = Math.round(c.blue * 255).toString(16).padStart(2, '0');
        return '#' + r + g + b;
    }

    // ── Slider değer göstericileri ──
    ['dp-tileAlpha', 'dp-brightMin', 'dp-brightMax', 'dp-matAlpha',
        'dp-ssaoInt', 'dp-ssaoBias', 'dp-ssaoLen', 'dp-ssaoStep',
        'dp-blendAmt', 'dp-lightInt', 'dp-shadowDark'].forEach(function (id) {
            var el = document.getElementById(id);
            var valEl = document.getElementById(id + 'Val');
            if (el && valEl) {
                el.addEventListener('input', function () {
                    valEl.textContent = parseFloat(this.value).toFixed(2);
                });
            }
        });

    // ── Mevcut sahne durumunu panele yükle ──
    function syncFromScene() {
        var v = getViewer(); var t = getTileset();
        if (!v) return;
        var s = v.scene;

        document.getElementById('dp-skyBox').checked = s.skyBox ? s.skyBox.show : false;
        document.getElementById('dp-sun').checked = s.sun ? s.sun.show : false;
        document.getElementById('dp-moon').checked = s.moon ? s.moon.show : false;
        document.getElementById('dp-skyAtmo').checked = s.skyAtmosphere ? s.skyAtmosphere.show : false;
        document.getElementById('dp-groundAtmo').checked = s.globe ? s.globe.showGroundAtmosphere : false;
        document.getElementById('dp-hdr').checked = s.highDynamicRange;
        document.getElementById('dp-fog').checked = s.fog ? s.fog.enabled : false;
        document.getElementById('dp-bgColor').value = colorToHex(s.backgroundColor);

        document.getElementById('dp-fxaa').checked = s.postProcessStages.fxaa.enabled;

        if (s.postProcessStages.ambientOcclusion) {
            var ao = s.postProcessStages.ambientOcclusion;
            document.getElementById('dp-ssao').checked = ao.enabled;
            document.getElementById('dp-ssaoInt').value = ao.uniforms.intensity || 3;
            document.getElementById('dp-ssaoBias').value = ao.uniforms.bias || 0.1;
            document.getElementById('dp-ssaoLen').value = ao.uniforms.lengthCap || 0.3;
            document.getElementById('dp-ssaoStep').value = ao.uniforms.stepSize || 1;
        }

        if (t) {
            document.getElementById('dp-wireframe').checked = t.debugWireframe || false;
            document.getElementById('dp-backface').checked = t.backFaceCulling !== false;
            document.getElementById('dp-shadows').checked = t.shadows === Cesium.ShadowMode.ENABLED;
        }

        document.getElementById('dp-viewerShadows').checked = v.shadows || false;
        if (s.shadowMap) {
            document.getElementById('dp-softShadows').checked = s.shadowMap.softShadows || false;
            document.getElementById('dp-shadowDark').value = s.shadowMap.darkness || 0.3;
        }

        // Değer göstericilerini güncelle
        ['dp-tileAlpha', 'dp-brightMin', 'dp-brightMax', 'dp-matAlpha',
            'dp-ssaoInt', 'dp-ssaoBias', 'dp-ssaoLen', 'dp-ssaoStep',
            'dp-blendAmt', 'dp-lightInt', 'dp-shadowDark'].forEach(function (id) {
                var el = document.getElementById(id);
                var valEl = document.getElementById(id + 'Val');
                if (el && valEl) valEl.textContent = parseFloat(el.value).toFixed(2);
            });
    }

    // ── UYGULA ──
    document.getElementById('dp-apply').addEventListener('click', function () {
        var v = getViewer(); var t = getTileset();
        if (!v) { dpLog('Viewer bulunamadı!'); return; }
        var s = v.scene;

        // 1. Sahne Ortamı
        if (s.skyBox) s.skyBox.show = document.getElementById('dp-skyBox').checked;
        if (s.sun) s.sun.show = document.getElementById('dp-sun').checked;
        if (s.moon) s.moon.show = document.getElementById('dp-moon').checked;
        if (s.skyAtmosphere) s.skyAtmosphere.show = document.getElementById('dp-skyAtmo').checked;
        if (s.globe) s.globe.showGroundAtmosphere = document.getElementById('dp-groundAtmo').checked;
        s.highDynamicRange = document.getElementById('dp-hdr').checked;
        if (s.fog) s.fog.enabled = document.getElementById('dp-fog').checked;
        s.backgroundColor = hexToColor(document.getElementById('dp-bgColor').value);

        // 2. Tileset Stil
        var tileColor = document.getElementById('dp-tileColor').value;
        var tileAlpha = parseFloat(document.getElementById('dp-tileAlpha').value);
        if (t) {
            t.style = new Cesium.Cesium3DTileStyle({
                color: "color('" + tileColor + "', " + tileAlpha + ")"
            });
        }

        // 3. Custom Shader
        var lightModel = document.getElementById('dp-lightModel').value;
        var transMode = document.getElementById('dp-transMode').value;
        var bMin = parseFloat(document.getElementById('dp-brightMin').value);
        var bMax = parseFloat(document.getElementById('dp-brightMax').value);
        var matAlpha = parseFloat(document.getElementById('dp-matAlpha').value);
        var shaderHex = document.getElementById('dp-shaderColor').value;
        var sr = parseInt(shaderHex.substr(1, 2), 16) / 255;
        var sg = parseInt(shaderHex.substr(3, 2), 16) / 255;
        var sb = parseInt(shaderHex.substr(5, 2), 16) / 255;

        if (t) {
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
        }

        // 4. Post Processing
        if (s.postProcessStages.ambientOcclusion) {
            var ao = s.postProcessStages.ambientOcclusion;
            ao.enabled = document.getElementById('dp-ssao').checked;
            ao.uniforms.intensity = parseFloat(document.getElementById('dp-ssaoInt').value);
            ao.uniforms.bias = parseFloat(document.getElementById('dp-ssaoBias').value);
            ao.uniforms.lengthCap = parseFloat(document.getElementById('dp-ssaoLen').value);
            ao.uniforms.stepSize = parseFloat(document.getElementById('dp-ssaoStep').value);
        }
        s.postProcessStages.fxaa.enabled = document.getElementById('dp-fxaa').checked;

        // 5. Tileset Render
        if (t) {
            t.debugWireframe = document.getElementById('dp-wireframe').checked;
            t.backFaceCulling = document.getElementById('dp-backface').checked;
            t.shadows = document.getElementById('dp-shadows').checked ? Cesium.ShadowMode.ENABLED : Cesium.ShadowMode.DISABLED;

            var blendMode = document.getElementById('dp-blendMode').value;
            t.colorBlendMode = Cesium.Cesium3DTileColorBlendMode[blendMode];
            t.colorBlendAmount = parseFloat(document.getElementById('dp-blendAmt').value);
        }

        // 6. Sahne Aydınlatma
        v.shadows = document.getElementById('dp-viewerShadows').checked;
        if (s.shadowMap) {
            s.shadowMap.softShadows = document.getElementById('dp-softShadows').checked;
            s.shadowMap.darkness = parseFloat(document.getElementById('dp-shadowDark').value);
            s.shadowMap.size = parseInt(document.getElementById('dp-shadowSize').value);
        }

        var lightInt = parseFloat(document.getElementById('dp-lightInt').value);
        var lightHex = document.getElementById('dp-lightColor').value;
        if (s.light && s.light instanceof Cesium.DirectionalLight) {
            s.light.intensity = lightInt;
            s.light.color = hexToColor(lightHex);
        } else {
            s.light = new Cesium.DirectionalLight({
                direction: s.camera.directionWC,
                intensity: lightInt,
                color: hexToColor(lightHex)
            });
        }

        s.requestRender();
        dpLog('Tüm ayarlar uygulandı');
    });

    // ── SIFIRLA ──
    document.getElementById('dp-reset').addEventListener('click', function () {
        var v = getViewer(); var t = getTileset();
        if (!v) return;
        var s = v.scene;

        // Solid mod custom overrides temizle
        if (t) {
            t.customShader = undefined;
            t.style = undefined;
            t.debugWireframe = false;
            t.shadows = Cesium.ShadowMode.DISABLED;
            t.backFaceCulling = true;
            t.colorBlendMode = Cesium.Cesium3DTileColorBlendMode.HIGHLIGHT;
            t.colorBlendAmount = 0.5;
        }

        // Sahne ortamı başlangıç durumu
        if (s.skyBox) s.skyBox.show = (window.location.protocol !== 'file:');
        if (s.sun) s.sun.show = true;
        if (s.moon) s.moon.show = true;
        if (s.skyAtmosphere) s.skyAtmosphere.show = false;
        if (s.globe) s.globe.showGroundAtmosphere = false;
        s.backgroundColor = new Cesium.Color(0, 0, 0, 1);
        s.highDynamicRange = false;

        // Post processing
        if (s.postProcessStages.ambientOcclusion) {
            s.postProcessStages.ambientOcclusion.enabled = false;
        }

        v.shadows = false;
        s.light = new Cesium.SunLight();

        s.requestRender();
        syncFromScene();
        dpLog('Başlangıç durumuna döndürüldü');
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
                backdrop.style.display = 'block';
            }
        }
    });

    console.log('%c[DEV PANEL] Ctrl+Shift+D ile aç/kapat', 'color:#f59e0b;font-weight:bold;');
})();
