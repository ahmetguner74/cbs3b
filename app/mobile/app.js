// ═══ CBS MOBİL — İNTERAKTİVİTE ═══
(function () {
    'use strict';

    // ─── SPLASH SCREEN ───
    var splash = document.getElementById('splash');
    var splashBar = document.getElementById('splashBar');
    var splashPct = document.getElementById('splashPct');
    var splashStatus = document.getElementById('splashStatus');
    var splashTips = document.getElementById('splashTips');

    // Kısayol ipuçları (masaüstü uygulamadan)
    var tips = [
        { key: 'Sol Tık', text: 'Nokta Koy' },
        { key: 'Sağ Tık', text: 'Ölçümü Bitir' },
        { key: 'Pinch', text: 'Yakınlaş / Uzaklaş' },
        { key: 'Ctrl+Z', text: 'Geri Al' },
        { key: 'L', text: 'Panel Aç/Kapat' },
        { key: 'H', text: 'Ana Görünüm' }
    ];
    // Rastgele 3 ipucu göster
    tips.sort(function () { return Math.random() - 0.5; });
    for (var i = 0; i < 3; i++) {
        var tip = document.createElement('div');
        tip.className = 'splash-tip';
        tip.innerHTML = '<kbd>' + tips[i].key + '</kbd> ' + tips[i].text;
        splashTips.appendChild(tip);
    }

    // Simüle yükleme
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

    // ─── TOOL PANEL ───
    var toolPanel = document.getElementById('toolPanel');
    var btnToolToggle = document.getElementById('btnToolToggle');
    var toolToggleIcon = document.getElementById('toolToggleIcon');
    var toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
    var measOverlay = document.getElementById('measOverlay');
    var resultBar = document.getElementById('resultBar');
    var activeGroupLabel = document.getElementById('activeGroupLabel');

    btnToolToggle.addEventListener('click', function () {
        toolPanel.classList.toggle('open');
        var isOpen = toolPanel.classList.contains('open');
        toolToggleIcon.textContent = isOpen ? 'chevron_left' : 'chevron_right';
    });

    toolBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            var wasActive = this.classList.contains('active');
            toolBtns.forEach(function (b) { b.classList.remove('active'); });
            if (!wasActive) {
                this.classList.add('active');
                measOverlay.style.display = 'block';
                var toolNames = { coord: '📍 Nokta modu aktif', distance: '📏 Mesafe ölçümü aktif', area: '📐 Alan ölçümü aktif', height: '📊 Yükseklik ölçümü aktif' };
                resultBar.textContent = toolNames[this.dataset.tool] || 'Araç seçildi';
            } else {
                measOverlay.style.display = 'none';
                resultBar.textContent = 'Araç seçin ve haritaya tıklayın.';
            }
        });
    });

    // ─── RIGHT DRAWER ───
    var drawer = document.getElementById('drawer');
    var drawerBackdrop = document.getElementById('drawerBackdrop');
    var btnDrawerToggle = document.getElementById('btnDrawerToggle');
    var btnCloseDrawer = document.getElementById('btnCloseDrawer');
    var drawerToggleIcon = document.getElementById('drawerToggleIcon');

    function openDrawer() {
        drawer.classList.add('open');
        drawerBackdrop.classList.add('show');
        drawerToggleIcon.textContent = 'chevron_right';
        btnDrawerToggle.style.display = 'none';
        activeGroupLabel.style.display = 'none';
    }
    function closeDrawer() {
        drawer.classList.remove('open');
        drawerBackdrop.classList.remove('show');
        drawerToggleIcon.textContent = 'chevron_left';
        btnDrawerToggle.style.display = '';
        activeGroupLabel.style.display = '';
    }

    btnDrawerToggle.addEventListener('click', openDrawer);
    activeGroupLabel.addEventListener('click', openDrawer);
    drawerBackdrop.addEventListener('click', closeDrawer);
    btnCloseDrawer.addEventListener('click', closeDrawer);

    // Folder toggle
    document.querySelectorAll('.folder-head').forEach(function (head) {
        head.addEventListener('click', function (e) {
            if (e.target.tagName === 'INPUT') return;
            this.classList.toggle('collapsed');
        });
    });

    // ─── SETTINGS SCREEN ───
    var settingsScreen = document.getElementById('settingsScreen');
    var btnSettingsBack = document.getElementById('btnSettingsBack');

    function openSettings() {
        settingsScreen.classList.add('open');
    }
    function closeSettings() {
        settingsScreen.classList.remove('open');
    }

    btnSettingsBack.addEventListener('click', closeSettings);

    // Globe toggle → show/hide layer card
    var toggleGlobe = document.getElementById('toggleGlobe');
    var layerCard = document.getElementById('layerCard');
    toggleGlobe.addEventListener('click', function () {
        this.classList.toggle('on');
        layerCard.style.display = this.classList.contains('on') ? 'block' : 'none';
    });

    // Generic toggle handler
    document.querySelectorAll('.toggle').forEach(function (t) {
        if (t.id === 'toggleGlobe') return;
        t.addEventListener('click', function () { this.classList.toggle('on'); });
    });

    // Pill selectors
    document.querySelectorAll('.pill-group').forEach(function (group) {
        group.querySelectorAll('.pill').forEach(function (pill) {
            pill.addEventListener('click', function () {
                group.querySelectorAll('.pill').forEach(function (p) { p.classList.remove('active'); });
                this.classList.add('active');
            });
        });
    });

    // ─── BOTTOM NAV ───
    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function (item) {
        item.addEventListener('click', function () {
            navItems.forEach(function (n) { n.classList.remove('active'); });
            this.classList.add('active');
            var nav = this.dataset.nav;
            // Close all overlays first
            closeDrawer();
            closeSettings();
            if (!toolPanel.classList.contains('open')) {
                // keep closed
            } else {
                toolPanel.classList.remove('open');
                toolToggleIcon.textContent = 'chevron_right';
            }

            switch (nav) {
                case 'tools':
                    toolPanel.classList.add('open');
                    toolToggleIcon.textContent = 'chevron_left';
                    break;
                case 'measurements':
                    openDrawer();
                    break;
                case 'settings':
                    openSettings();
                    break;
                case 'map':
                    // just close everything, show map
                    break;
            }
        });
    });

    // ─── SWIPE GESTURES ───
    var touchStartX = 0;
    var touchStartY = 0;
    var mainArea = document.querySelector('.main-area');

    mainArea.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    mainArea.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
        if (dx > 0 && touchStartX < 40) {
            // Swipe right from left edge → open tool panel
            toolPanel.classList.add('open');
            toolToggleIcon.textContent = 'chevron_left';
        } else if (dx < 0 && touchStartX > window.innerWidth - 40) {
            // Swipe left from right edge → open drawer
            openDrawer();
        }
    }, { passive: true });

    // ─── THEME TOGGLE ───
    var btnTheme = document.getElementById('btnTheme');
    btnTheme.addEventListener('click', function () {
        var icon = this.querySelector('.material-symbols-outlined');
        document.documentElement.classList.toggle('light-theme');
        icon.textContent = document.documentElement.classList.contains('light-theme') ? 'dark_mode' : 'light_mode';
    });

    // ─── PERFORMANCE MODE TOGGLE ───
    document.querySelectorAll('.tool-btn[data-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.tool-btn[data-mode]').forEach(function (b) { b.classList.remove('active'); });
            this.classList.add('active');
        });
    });

})();
