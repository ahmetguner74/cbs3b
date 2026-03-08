// ═══ CBS MOBİL — TAM İNTERAKTİVİTE ═══
(function () {
    'use strict';

    // ─── TELEMETRY ───
    var TelemetryManager = {
        addLog: function (action, details, isError) {
            if (window.MonitoringService && window.MonitoringService.log) {
                window.MonitoringService.log(action, details, isError);
            }
        },
        getSystemInfo: function () {
            return {
                ua: navigator.userAgent,
                platform: navigator.platform,
                screen: screen.width + 'x' + screen.height + ' (Mobile)',
                gpu: 'Mobile GPU',
                memory: navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'N/A',
                language: navigator.language
            };
        }
    };
    window.TelemetryManager = TelemetryManager;

    // Global Hata Yakalayıcılar
    window.addEventListener('error', function (e) {
        TelemetryManager.addLog('MOBILE_CRITICAL_ERROR', { message: e.message, stack: e.error ? e.error.stack : null }, true);
    });
    window.addEventListener('unhandledrejection', function (e) {
        TelemetryManager.addLog('MOBILE_PROMISE_REJECTION', { reason: e.reason }, true);
    });

    // ─── UTILS ───
    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    // ─── SPLASH SCREEN ───
    var splash = document.getElementById('splash');
    var splashBar = document.getElementById('splashBar');
    var splashPct = document.getElementById('splashPct');
    var splashStatus = document.getElementById('splashStatus');
    var splashTips = document.getElementById('splashTips');

    var tips = [
        { key: 'Dokunma', text: 'Nokta Koy' },
        { key: 'Uzun Bas', text: 'Ölçümü Bitir' },
        { key: 'Pinch', text: 'Yakınlaş / Uzaklaş' },
        { key: '2 Parmak', text: 'Haritayı Döndür' },
        { key: 'Kaydır', text: 'Panel Aç/Kapat' },
        { key: 'Çift Tık', text: 'Ana Görünüm' }
    ];
    tips.sort(function () { return Math.random() - 0.5; });
    for (var i = 0; i < 3; i++) {
        var tip = document.createElement('div');
        tip.className = 'splash-tip';
        tip.innerHTML = '<kbd>' + tips[i].key + '</kbd> ' + tips[i].text;
        splashTips.appendChild(tip);
    }

    var progress = 0;
    var loadInterval = setInterval(function () {
        progress += Math.random() * 15 + 5;
        if (progress > 100) progress = 100;
        splashBar.style.width = progress + '%';
        splashPct.textContent = Math.round(progress) + '%';
        if (progress < 40) splashStatus.textContent = '3D model yükleniyor...';
        else if (progress < 70) splashStatus.textContent = 'Detaylar yükleniyor...';
        else if (progress < 95) splashStatus.textContent = 'Arayüz hazırlanıyor...';
        else splashStatus.textContent = 'Hazır!';
        if (progress >= 100) {
            clearInterval(loadInterval);
            setTimeout(function () {
                splash.classList.add('hide');
                setTimeout(function () { splash.style.display = 'none'; }, 800);
            }, 400);
        }
    }, 300);

    // ─── DOM ELEMENTS ───
    var toolPanel = document.getElementById('toolPanel');
    var btnToolToggle = document.getElementById('btnToolToggle');
    var toolToggleIcon = document.getElementById('toolToggleIcon');
    var toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
    var measOverlay = document.getElementById('measOverlay');
    var resultBar = document.getElementById('resultBar');
    var activeGroupLabel = document.getElementById('activeGroupLabel');
    var drawer = document.getElementById('drawer');
    var drawerBackdrop = document.getElementById('drawerBackdrop');
    var btnDrawerToggle = document.getElementById('btnDrawerToggle');
    var btnCloseDrawer = document.getElementById('btnCloseDrawer');
    var drawerToggleIcon = document.getElementById('drawerToggleIcon');
    var settingsScreen = document.getElementById('settingsScreen');
    var btnSettingsBack = document.getElementById('btnSettingsBack');
    var navItems = document.querySelectorAll('.nav-item');
    var mainArea = document.querySelector('.main-area');

    // ─── STATE ───
    var state = {
        toolPanelOpen: false,
        drawerOpen: false,
        settingsOpen: false,
        activeTool: null,
        activeNav: 'map'
    };

    // Haptic feedback (Android Chrome)
    function haptic(ms) {
        if (navigator.vibrate) navigator.vibrate(ms || 10);
    }

    // ─── TOOL PANEL ───
    function openToolPanel() {
        state.toolPanelOpen = true;
        toolPanel.classList.add('open');
        toolToggleIcon.textContent = 'chevron_left';
        setActiveNav('tools');
        haptic(8);
    }
    function closeToolPanel(animated) {
        state.toolPanelOpen = false;
        toolPanel.style.transition = animated === false ? 'none' : '';
        toolPanel.classList.remove('open');
        toolPanel.style.transform = '';
        toolToggleIcon.textContent = 'chevron_right';
        requestAnimationFrame(function () { toolPanel.style.transition = ''; });
    }

    btnToolToggle.addEventListener('click', function () {
        if (state.toolPanelOpen) closeToolPanel(); else openToolPanel();
    });

    var submenuArea = document.getElementById('submenuArea');

    toolBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            haptic(12);
            var toolId = this.dataset.tool;
            TelemetryManager.addLog('MOBILE_TOOL_SELECT', { tool: toolId });
            var isSub = this.classList.contains('sub');
            var wasActive = this.classList.contains('active');

            // ── Alan butonu: sadece alt menüyü aç/kapat, paneli kapatma ──
            if (toolId === 'area') {
                submenuArea.classList.toggle('show');
                if (!wasActive) {
                    toolBtns.forEach(function (b) { if (!b.classList.contains('sub')) b.classList.remove('active'); });
                    this.classList.add('active');
                }
                return;
            }

            // ── Tüm aktif durumları temizle ──
            toolBtns.forEach(function (b) { b.classList.remove('active'); });

            if (isSub) {
                // Alt araç: üst (alan) butonu aktif kalsın
                document.getElementById('btnToolArea').classList.add('active');
                submenuArea.classList.remove('show');
            } else {
                submenuArea.classList.remove('show');
            }

            if (!wasActive) {
                this.classList.add('active');
                state.activeTool = toolId;
                measOverlay.style.display = 'block';

                var toolNames = {
                    coord: window.AppMessages ? window.AppMessages.HINT_POINT : 'Haritaya dokunarak nokta koyun.',
                    distance: window.AppMessages ? window.AppMessages.HINT_DISTANCE : 'Haritaya dokunarak mesafe ölçün.',
                    area_free: window.AppMessages ? window.AppMessages.HINT_AREA_FREE : 'Serbest alan çizin.',
                    area_box3p: window.AppMessages ? window.AppMessages.HINT_AREA_BOX3P : '3 nokta ile alan ölçün.',
                    height: window.AppMessages ? window.AppMessages.HINT_HEIGHT : 'Yükseklik ölçün.',
                    line_l: window.AppMessages ? window.AppMessages.HINT_LINE_L : 'L-mesafe ölçün.',
                    clipbox: '✂️ Kırpma Kutusu aktif.'
                };
                resultBar.textContent = toolNames[toolId] || 'Araç seçildi';
                resultBar.style.borderColor = 'rgba(59,130,246,0.3)';

                // L-Line overlay
                var isLineL = toolId === 'line_l';
                measOverlay.querySelectorAll('.meas-point, .meas-line, .meas-label-float').forEach(function (el) {
                    el.style.display = isLineL ? 'none' : '';
                });
                if (isLineL) {
                    measOverlay.querySelector('.p1').style.display = 'block';
                    measOverlay.querySelector('.p2').style.display = 'block';
                    measOverlay.querySelector('.p-mid').style.display = 'block';
                    measOverlay.querySelector('.l-horiz').style.display = 'block';
                    measOverlay.querySelector('.l-vert').style.display = 'block';
                    measOverlay.querySelector('.lbl-horiz').style.display = 'block';
                    measOverlay.querySelector('.lbl-vert').style.display = 'block';
                }

                // ── Panel kapat, harita moduna geç ──
                closeToolPanel();
                setActiveNav('map');

            } else {
                // Aynı araca tekrar basıldı → kapat
                state.activeTool = null;
                measOverlay.style.display = 'none';
                resultBar.textContent = 'Araç seçin ve haritaya tıklayın.';
                resultBar.style.borderColor = '';
                if (isSub) document.getElementById('btnToolArea').classList.remove('active');
            }
        });
    });

    // ─── DRAWER ───
    function openDrawer() {
        state.drawerOpen = true;
        drawer.classList.add('open');
        drawerBackdrop.classList.add('show');
        btnDrawerToggle.style.display = 'none';
        activeGroupLabel.style.display = 'none';
        setActiveNav('measurements');
        haptic(8);
    }
    function closeDrawer(animated) {
        state.drawerOpen = false;
        drawer.style.transition = animated === false ? 'none' : '';
        drawer.classList.remove('open');
        drawer.style.transform = '';
        drawerBackdrop.classList.remove('show');
        btnDrawerToggle.style.display = '';
        activeGroupLabel.style.display = '';
        requestAnimationFrame(function () { drawer.style.transition = ''; });
    }

    btnDrawerToggle.addEventListener('click', openDrawer);
    activeGroupLabel.addEventListener('click', openDrawer);
    drawerBackdrop.addEventListener('click', function () { closeDrawer(); haptic(5); });
    btnCloseDrawer.addEventListener('click', function () { closeDrawer(); haptic(5); });

    // Folder toggle
    document.querySelectorAll('.folder-head').forEach(function (head) {
        head.addEventListener('click', function (e) {
            if (e.target.tagName === 'INPUT') return;
            this.classList.toggle('collapsed');
            haptic(5);
        });
    });

    // ─── SETTINGS ───
    function openSettings() {
        state.settingsOpen = true;
        settingsScreen.classList.add('open');
        setActiveNav('settings');
        haptic(8);
    }
    function closeSettings(animated) {
        state.settingsOpen = false;
        settingsScreen.style.transition = animated === false ? 'none' : '';
        settingsScreen.classList.remove('open');
        settingsScreen.style.transform = '';
        requestAnimationFrame(function () { settingsScreen.style.transition = ''; });
    }

    btnSettingsBack.addEventListener('click', function () { closeSettings(); haptic(5); });

    // Globe toggle
    var toggleGlobe = document.getElementById('toggleGlobe');
    var layerCard = document.getElementById('layerCard');
    toggleGlobe.addEventListener('click', function () {
        this.classList.toggle('on');
        layerCard.style.display = this.classList.contains('on') ? 'block' : 'none';
        haptic(10);
    });

    // Generic toggles
    document.querySelectorAll('.toggle').forEach(function (t) {
        if (t.id === 'toggleGlobe') return;
        t.addEventListener('click', function () { this.classList.toggle('on'); haptic(10); });
    });

    // Pill selectors
    document.querySelectorAll('.pill-group').forEach(function (group) {
        group.querySelectorAll('.pill').forEach(function (pill) {
            pill.addEventListener('click', function () {
                group.querySelectorAll('.pill').forEach(function (p) { p.classList.remove('active'); });
                this.classList.add('active');
                haptic(8);
            });
        });
    });

    // Performance mode toggle in tool panel
    document.querySelectorAll('.tool-btn[data-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.tool-btn[data-mode]').forEach(function (b) { b.classList.remove('active'); });
            this.classList.add('active');
            haptic(10);
        });
    });

    // ─── BOTTOM NAV ───
    function setActiveNav(nav) {
        state.activeNav = nav;
        navItems.forEach(function (n) {
            n.classList.toggle('active', n.dataset.nav === nav);
        });
    }

    navItems.forEach(function (item) {
        item.addEventListener('click', function () {
            haptic(12);
            var nav = this.dataset.nav;
            closeToolPanel();
            closeDrawer();
            closeSettings();
            switch (nav) {
                case 'tools': openToolPanel(); break;
                case 'measurements': openDrawer(); break;
                case 'settings': openSettings(); break;
                case 'map': setActiveNav('map'); break;
            }
        });
    });

    // ═══════════════════════════════════════
    //  PARMAK (TOUCH) GESTÜRLERİ — TAM SET
    // ═══════════════════════════════════════

    var SWIPE_THRESHOLD = 50;   // Minimum px for swipe recognition
    var EDGE_ZONE = 36;         // Edge zone width for edge-swipe
    var VELOCITY_THRESHOLD = 0.3; // px/ms for flick detection

    // --- Touch state ---
    var touch = {
        startX: 0, startY: 0,
        currentX: 0, currentY: 0,
        startTime: 0,
        target: null,  // 'tool-panel' | 'drawer' | 'settings' | null
        dragging: false,
        moved: false
    };

    // Determine which panel the touch should control
    function identifyTouchTarget(x, y) {
        // Settings screen is on top
        if (state.settingsOpen) return 'settings';
        // Drawer is open → drag to close
        if (state.drawerOpen) return 'drawer';
        // Tool panel is open → drag to close
        if (state.toolPanelOpen) return 'tool-panel';
        // Edge swipe detection
        if (x < EDGE_ZONE) return 'tool-panel-open';
        if (x > window.innerWidth - EDGE_ZONE) return 'drawer-open';
        return null;
    }

    mainArea.addEventListener('touchstart', function (e) {
        var t = e.touches[0];
        touch.startX = touch.currentX = t.clientX;
        touch.startY = touch.currentY = t.clientY;
        touch.startTime = Date.now();
        touch.moved = false;
        touch.dragging = false;

        // Don't intercept touches on interactive elements
        var el = e.target;
        while (el && el !== mainArea) {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT' ||
                el.classList.contains('nav-item') || el.classList.contains('tool-btn') ||
                el.classList.contains('drawer-toolbar-btn') || el.classList.contains('transfer-btn') ||
                el.classList.contains('pill') || el.classList.contains('angle-btn') ||
                el.classList.contains('toggle') || el.classList.contains('m-row') ||
                el.classList.contains('folder-head') || el.classList.contains('settings-back') ||
                el.classList.contains('slider-reset') || el.classList.contains('m-row-delete') ||
                el.classList.contains('header-btn') || el.classList.contains('drawer-list') ||
                el.classList.contains('settings-body')) {
                touch.target = null;
                return;
            }
            el = el.parentElement;
        }

        touch.target = identifyTouchTarget(t.clientX, t.clientY);
    }, { passive: true });

    mainArea.addEventListener('touchmove', function (e) {
        if (!touch.target) return;

        var t = e.touches[0];
        touch.currentX = t.clientX;
        touch.currentY = t.clientY;
        var dx = touch.currentX - touch.startX;
        var dy = touch.currentY - touch.startY;

        // Only start dragging after minimum movement and mostly horizontal
        if (!touch.dragging) {
            if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                touch.dragging = true;
                touch.moved = true;
            } else if (touch.target === 'settings' && dy > 10 && Math.abs(dy) > Math.abs(dx) * 1.2) {
                touch.dragging = true;
                touch.moved = true;
            } else {
                return;
            }
        }

        // Prevent scroll while dragging panel
        e.preventDefault();

        // ── TOOL PANEL: drag to close (swipe left) ──
        if (touch.target === 'tool-panel') {
            var panelW = toolPanel.querySelector('.tool-panel-glass').offsetWidth + 32;
            var offset = clamp(dx, -panelW, 0);
            toolPanel.style.transition = 'none';
            toolPanel.style.transform = 'translateX(' + offset + 'px)';
        }
        // ── TOOL PANEL: edge-swipe open (swipe right from left edge) ──
        else if (touch.target === 'tool-panel-open') {
            var panelW2 = 88; // approx panel width
            var offset2 = clamp(dx, 0, panelW2);
            var pct = offset2 / panelW2;
            toolPanel.style.transition = 'none';
            // Start from closed position (-100% + 32px) and move toward open (0)
            var closedOffset = -panelW2 + 32;
            toolPanel.style.transform = 'translateX(' + (closedOffset + offset2) + 'px)';
        }
        // ── DRAWER: drag to close (swipe right) ──
        else if (touch.target === 'drawer') {
            var offset3 = clamp(dx, 0, window.innerWidth);
            drawer.style.transition = 'none';
            drawer.style.transform = 'translateX(' + offset3 + 'px)';
            // Fade backdrop
            var pct3 = 1 - (offset3 / 200);
            drawerBackdrop.style.opacity = clamp(pct3, 0, 1);
        }
        // ── DRAWER: edge-swipe open (swipe left from right edge) ──
        else if (touch.target === 'drawer-open') {
            var drawerW = Math.min(window.innerWidth - 48, 320);
            var offset4 = clamp(-dx, 0, drawerW);
            drawer.style.transition = 'none';
            drawer.style.transform = 'translateX(' + (drawerW - offset4) + 'px)';
            drawer.classList.add('open');
            drawerBackdrop.classList.add('show');
            drawerBackdrop.style.opacity = clamp(offset4 / drawerW, 0, 1);
            btnDrawerToggle.style.display = 'none';
            activeGroupLabel.style.display = 'none';
        }
        // ── SETTINGS: swipe down to close ──
        else if (touch.target === 'settings') {
            var offsetY = clamp(dy, 0, window.innerHeight);
            settingsScreen.style.transition = 'none';
            settingsScreen.style.transform = 'translateY(' + offsetY + 'px)';
        }
    }, { passive: false });

    mainArea.addEventListener('touchend', function (e) {
        if (!touch.target || !touch.dragging) {
            touch.target = null;
            return;
        }

        var dx = touch.currentX - touch.startX;
        var dy = touch.currentY - touch.startY;
        var dt = Date.now() - touch.startTime;
        var velocityX = Math.abs(dx) / dt;
        var velocityY = Math.abs(dy) / dt;
        var isFlick = velocityX > VELOCITY_THRESHOLD || velocityY > VELOCITY_THRESHOLD;

        // ── TOOL PANEL: close if swiped left enough ──
        if (touch.target === 'tool-panel') {
            toolPanel.style.transition = '';
            if (dx < -SWIPE_THRESHOLD || (isFlick && dx < -20)) {
                closeToolPanel();
                haptic(10);
            } else {
                toolPanel.style.transform = '';
            }
        }
        // ── TOOL PANEL: open if swiped right enough ──
        else if (touch.target === 'tool-panel-open') {
            toolPanel.style.transition = '';
            if (dx > SWIPE_THRESHOLD || (isFlick && dx > 20)) {
                openToolPanel();
            } else {
                toolPanel.style.transform = '';
            }
        }
        // ── DRAWER: close if swiped right enough ──
        else if (touch.target === 'drawer') {
            drawer.style.transition = '';
            drawerBackdrop.style.opacity = '';
            if (dx > SWIPE_THRESHOLD || (isFlick && dx > 20)) {
                closeDrawer();
                haptic(10);
            } else {
                drawer.style.transform = '';
            }
        }
        // ── DRAWER: open if swiped left enough ──
        else if (touch.target === 'drawer-open') {
            drawer.style.transition = '';
            drawerBackdrop.style.opacity = '';
            if (-dx > SWIPE_THRESHOLD || (isFlick && dx < -20)) {
                openDrawer();
            } else {
                closeDrawer();
            }
        }
        // ── SETTINGS: close if swiped down enough ──
        else if (touch.target === 'settings') {
            settingsScreen.style.transition = '';
            if (dy > 80 || (isFlick && dy > 30)) {
                closeSettings();
                setActiveNav('map');
                haptic(10);
            } else {
                settingsScreen.style.transform = '';
            }
        }

        touch.target = null;
        touch.dragging = false;
    }, { passive: true });

    // ═══ SCROLL IN DRAWER & SETTINGS ═══
    // Allow vertical scrolling inside drawer-list and settings-body
    // by not intercepting those touches
    var scrollAreas = document.querySelectorAll('.drawer-list, .settings-body, .angle-scroll');
    scrollAreas.forEach(function (area) {
        area.addEventListener('touchstart', function (e) {
            touch.target = null; // Don't intercept
        }, { passive: true });
    });

    // ─── THEME TOGGLE ───
    var btnTheme = document.getElementById('btnTheme');
    btnTheme.addEventListener('click', function () {
        haptic(12);
        var icon = this.querySelector('.material-symbols-outlined');
        document.documentElement.classList.toggle('light-theme');
        var theme = document.documentElement.classList.contains('light-theme') ? 'light' : 'dark';
        TelemetryManager.addLog('MOBILE_THEME_CHANGE', { theme: theme });
        icon.textContent = theme === 'light' ? 'dark_mode' : 'light_mode';
    });

    // ─── DOUBLE TAP → HOME VIEW (on map area) ───
    var lastTap = 0;
    document.querySelector('.map-view').addEventListener('touchend', function (e) {
        var now = Date.now();
        if (now - lastTap < 300 && !touch.moved) {
            // Double tap detected
            closeToolPanel();
            closeDrawer();
            closeSettings();
            setActiveNav('map');
            resultBar.textContent = '🏠 Ana görünüme dönüldü';
            setTimeout(function () { resultBar.textContent = 'Araç seçin ve haritaya tıklayın.'; }, 1500);
            haptic(15);
        }
        lastTap = now;
    }, { passive: true });

    // ═══════════════════════════════════════
    //  CLIPBOX MOBİL PANEL (v0.9.2+)
    // ═══════════════════════════════════════

    var clipMobilePanel = document.getElementById('clipMiniPanelMobile');
    var clipBtnMobile = document.getElementById('btnClipBoxMobile');
    var clipMobileClose = document.getElementById('clipMobileClose');
    var clipMobileReset = document.getElementById('clipMobileReset');
    var clipMobileFlyTo = document.getElementById('clipMobileFlyTo');

    // Eksen state'i (standalone mod — ClipBoxManager yoksa)
    var clipMobileState = { X: 30, Y: 30, Z: 30 };
    var CLIP_MIN = 5, CLIP_MAX = 100, CLIP_STEP = 5;

    function updateClipAxisUI(axis) {
        var val = clipMobileState[axis];
        var fill = document.getElementById('clipMobileFill' + axis);
        var label = document.getElementById('clipMobileVal' + axis);
        if (fill) fill.style.width = ((val - CLIP_MIN) / (CLIP_MAX - CLIP_MIN) * 100) + '%';
        if (label) label.textContent = val + 'm';
    }

    function openClipPanel() {
        if (!clipMobilePanel) return;
        clipMobilePanel.classList.add('show');
        clipMobilePanel.setAttribute('aria-hidden', 'false');
        haptic(12);
        TelemetryManager.addLog('MOBILE_CLIPBOX_OPEN', {});
    }

    function closeClipPanel() {
        if (!clipMobilePanel) return;
        clipMobilePanel.classList.remove('show');
        clipMobilePanel.setAttribute('aria-hidden', 'true');
        // ClipBoxManager varsa kapat
        if (window.ClipBoxManager && window.ClipBoxManager.deactivate) {
            window.ClipBoxManager.deactivate();
        }
        // Araç butonunu pasifleştir
        if (clipBtnMobile) clipBtnMobile.classList.remove('active');
        haptic(8);
    }

    // ClipBox butonuna tıklama
    if (clipBtnMobile) {
        clipBtnMobile.addEventListener('click', function () {
            haptic(12);
            var isActive = this.classList.contains('active');

            // Diğer araçları kapat
            toolBtns.forEach(function (b) { b.classList.remove('active'); });

            if (!isActive) {
                this.classList.add('active');
                state.activeTool = 'clipbox';
                // Ana ClipBoxManager varsa kullan
                if (window.ClipBoxManager && window.ClipBoxManager.activate) {
                    window.ClipBoxManager.activate();
                    resultBar.textContent = 'Haritaya tıklayarak kırpma kutusunu yerleştirin.';
                } else {
                    resultBar.textContent = '✂️ Kırpma Kutusu aktif (masaüstünde tam destek).';
                }
                openClipPanel();
                // Axisleri güncelle
                ['X', 'Y', 'Z'].forEach(updateClipAxisUI);
            } else {
                state.activeTool = null;
                closeClipPanel();
                resultBar.textContent = 'Araç seçin ve haritaya tıklayın.';
            }
        });
    }

    // Kapat butonu
    if (clipMobileClose) {
        clipMobileClose.addEventListener('click', function () {
            closeClipPanel();
            state.activeTool = null;
            resultBar.textContent = 'Araç seçin ve haritaya tıklayın.';
        });
    }

    // +/- butonları
    document.querySelectorAll('.clip-axis-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var axis = this.dataset.axis;
            var dir = parseInt(this.dataset.dir, 10);
            clipMobileState[axis] = Math.max(CLIP_MIN, Math.min(CLIP_MAX, clipMobileState[axis] + dir * CLIP_STEP));
            updateClipAxisUI(axis);
            haptic(8);
            // Ana ClipBoxManager'a ilet
            if (window.ClipBoxManager && window.ClipBoxManager._updateSize) {
                window.ClipBoxManager._updateSize(axis.toLowerCase(), clipMobileState[axis], true);
            }
            TelemetryManager.addLog('MOBILE_CLIPBOX_RESIZE', { axis: axis, val: clipMobileState[axis] });
        });
    });

    // Sıfırla
    if (clipMobileReset) {
        clipMobileReset.addEventListener('click', function () {
            clipMobileState = { X: 30, Y: 30, Z: 30 };
            ['X', 'Y', 'Z'].forEach(updateClipAxisUI);
            haptic(10);
            if (window.ClipBoxManager) {
                if (window.ClipBoxManager._halfSize) {
                    window.ClipBoxManager._halfSize = { x: 15, y: 15, z: 15 };
                }
                if (window.ClipBoxManager._applyClipping) window.ClipBoxManager._applyClipping();
            }
        });
    }

    // Odakla
    if (clipMobileFlyTo) {
        clipMobileFlyTo.addEventListener('click', function () {
            haptic(10);
            if (window.ClipBoxManager && window.ClipBoxManager._flyToBox && window.ClipBoxManager._worldCenter) {
                window.ClipBoxManager._flyToBox(window.ClipBoxManager._worldCenter);
            } else {
                resultBar.textContent = '📍 Önce kırpma kutusunu haritaya yerleştirin.';
            }
        });
    }

    // ═══════════════════════════════════════
    //  KML MOBİL IMPORT (v0.9.2+)
    // ═══════════════════════════════════════
    var btnImportKMLMobile = document.getElementById('btnImportKMLMobile');
    if (btnImportKMLMobile) {
        btnImportKMLMobile.addEventListener('click', function () {
            haptic(10);
            if (window.ImportManager && window.ImportManager.importKML) {
                window.ImportManager.importKML();
            } else {
                resultBar.textContent = '⚠️ KML importu masaüstü görünümünde desteklenir.';
                setTimeout(function () {
                    resultBar.textContent = 'Araç seçin ve haritaya tıklayın.';
                }, 3000);
            }
            TelemetryManager.addLog('MOBILE_KML_IMPORT_ATTEMPT', {});
        });
    }

    // ═══════════════════════════════════════
    //  DELETE SELECTED FAB (seçili objeyi sil butonu)
    // ═══════════════════════════════════════
    var deleteSelFab = document.getElementById('deleteSelFab');
    if (deleteSelFab) {
        deleteSelFab.addEventListener('click', function () {
            haptic(20);
            // Edit modundaysa önce kapat
            if (window.EditManager && window.EditManager.activeMeasure) {
                window.EditManager.stopEdit();
            }
            // Seçili ölçümü sil
            if (window.activeHighlightId !== null && window.activeHighlightId !== undefined
                && window.deleteMeasurement) {
                window.deleteMeasurement(window.activeHighlightId);
                TelemetryManager.addLog('MOBILE_FAB_DELETE', { id: window.activeHighlightId });
            }
            deleteSelFab.style.display = 'none';
        });
    }

    // ═══════════════════════════════════════
    //  DRAWER — ÖLÇÜM SİLME (event delegation)
    // ═══════════════════════════════════════
    // Drawer kapsamında tek event listener ile tüm m-row-delete butonlarını yakalar.
    // Not: renderList(), m-row elementlerine data-id="<measureId>" atar (main.js).
    drawer.addEventListener('click', function (e) {
        // ── Tek satır sil ──
        var delBtn = e.target.closest('.m-row-delete');
        if (delBtn) {
            e.stopPropagation();
            haptic(15);
            var row = delBtn.closest('.m-row');
            var measureId = row ? row.dataset.id : null;

            if (measureId && window.safeRemoveItem && window.measurements) {
                // Edit modundaysa önce kapat
                if (window.EditManager && window.EditManager.activeMeasure) {
                    window.EditManager.stopEdit();
                }
                var idx = window.measurements.findIndex(function (m) { return m.id === measureId; });
                if (idx !== -1) {
                    var m = window.measurements[idx];
                    m.entities.forEach(function (ent) { window.safeRemoveItem(ent); });
                    window.measurements.splice(idx, 1);
                    if (window.renderList) window.renderList();
                    if (window.debouncedSave) window.debouncedSave();
                    resultBar.textContent = '🗑️ Ölçüm silindi.';
                    setTimeout(function () { resultBar.textContent = 'Araç seçin ve haritaya tıklayın.'; }, 1500);
                    TelemetryManager.addLog('MOBILE_MEASURE_DELETE', { id: measureId });
                }
            } else if (!measureId) {
                // Statik demo satır — sadece DOM'dan kaldır
                if (row) row.remove();
            }
            return;
        }

        // ── Tümünü Sil butonu ──
        var allDelBtn = e.target.closest('.drawer-toolbar-btn.danger');
        if (allDelBtn) {
            e.stopPropagation();
            haptic(20);
            if (window.measurements && window.measurements.length > 0) {
                if (window.EditManager && window.EditManager.activeMeasure) {
                    window.EditManager.stopEdit();
                }
                window.measurements.forEach(function (m) {
                    m.entities.forEach(function (ent) { if (window.safeRemoveItem) window.safeRemoveItem(ent); });
                });
                window.measurements.length = 0;
                if (window.renderList) window.renderList();
                if (window.debouncedSave) window.debouncedSave();
                resultBar.textContent = '🗑️ Tüm ölçümler silindi.';
                setTimeout(function () { resultBar.textContent = 'Araç seçin ve haritaya tıklayın.'; }, 2000);
                TelemetryManager.addLog('MOBILE_MEASURE_DELETE_ALL', {});
            }
        }
    });

})();

