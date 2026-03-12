/**
 * MonitoringService.js
 * Supabase tabanlı gerçek zamanlı izleme ve telemetri servisi.
 */
(function () {
    const APP_CONFIG = window.CBS_CONFIG || {};
    const SUPABASE_URL = (APP_CONFIG.supabaseUrl || '').trim();
    const SUPABASE_KEY = (APP_CONFIG.supabaseAnonKey || '').trim();

    let supabaseClient = null;
    let sessionId = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    let currentFps = 60;
    let userLocation = null;
    let ipLocation = null;
    let cesiumViewer = null;
    let logBuffer = [];
    let isOffline = !navigator.onLine;
    let staticInfo = null;
    let isFlushing = false;
    let flushTimer = null;
    let fpsLoopStarted = false;
    let systemInfoCache = null;
    let systemInfoCacheAt = 0;
    let localStorageSizeCache = '0.00KB';
    let localStorageSizeCacheAt = 0;
    let lastInteractionTime = 0;
    const INTERACTION_DEBOUNCE = 500; // ms
    const LOG_BUFFER_MAX = 200;
    const LOG_BATCH_SIZE = 25;
    const LOG_FLUSH_INTERVAL = 1500; // ms
    const SYSTEM_INFO_CACHE_TTL = 5000; // ms
    const STORAGE_SIZE_CACHE_TTL = 30000; // ms

    const MonitoringService = {
        init: function () {
            if (window.__CBS_MONITORING_INIT_DONE__) {
                return;
            }
            window.__CBS_MONITORING_INIT_DONE__ = true;

            if (typeof supabase === 'undefined') {
                console.warn('Supabase SDK yüklenemedi. İzleme devre dışı.');
                return;
            }

            if (!SUPABASE_URL || !SUPABASE_KEY) {
                console.warn('Supabase yapılandırması eksik (CBS_CONFIG.supabaseUrl / supabaseAnonKey). İzleme devre dışı.');
                return;
            }

            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('🚀 Monitoring Service ID:', sessionId);
            console.log("%c[Monitoring] Oturum Başladı: " + sessionId, "color: #38bdf8; font-weight: bold;");

            this.bindGlobalErrorFallbacks();

            window.addEventListener('online', () => {
                isOffline = false;
                this.scheduleFlush(true);
            });
            window.addEventListener('offline', () => {
                isOffline = true;
                this.clearFlushTimer();
            });

            // IP tabanlı yaklaşık konum (Fallback 1 - Hızlı ve izinsiz)
            if (!isOffline) {
                fetch('https://ipapi.co/json/')
                    .then(res => res.json())
                    .then(data => {
                        if (data && data.latitude && data.longitude) {
                            ipLocation = {
                                lat: data.latitude,
                                lng: data.longitude,
                                city: data.city,
                                country: data.country_name,
                                isApprox: true
                            };
                            console.log('[Monitoring] Yaklaşık konum (IP):', ipLocation.city);
                        }
                    })
                    .catch(() => { });
            }

            // Konum yakalama (İzin istenirse - Fallback 0 - Kesin Konum)
            try {
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(pos => {
                        userLocation = {
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude
                        };
                        this.log('LOCATION_UPDATE', { location: userLocation });
                    }, err => {
                        console.warn('Konum izni reddedildi veya hata oluştu.');
                    }, { enableHighAccuracy: false, timeout: 5000 });
                }
            } catch (e) { }

            // İlk açılış logu ve sistem bilgisi
            this.cacheStaticInfo();
            this.log('SESSION_START', {
                referrer: document.referrer,
                url: window.location.href
            });

            this.startFpsMonitoring();
            this.startHeartbeat();
            this.setupInteractionTracking();
            this.setupSystemControls();
        },

        cacheStaticInfo: function () {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            staticInfo = {
                deviceType: isMobile ? 'Mobile' : 'Desktop',
                platform: navigator.platform,
                cores: navigator.hardwareConcurrency || 'N/A',
                memory: navigator.deviceMemory || 'N/A',
                screen: `${window.screen.width}x${window.screen.height}`,
                gpu: this.getGPUInfo(),
                host: window.location.hostname,
                source: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'Local' : 'Live'
            };
        },

        bindGlobalErrorFallbacks: function () {
            var self = this;
            if (!window.__CBS_MONITORING_ERROR_FALLBACK_BOUND__) {
                window.addEventListener('error', function (e) {
                    // main.js zaten global hata listener'ı kurduysa duplicate üretme.
                    if (window.__CBS_GLOBAL_ERROR_LISTENER_BOUND__ && window.TelemetryManager) {
                        return;
                    }
                    self.log('CRITICAL_ERROR', {
                        message: e && e.message ? e.message : 'N/A',
                        url: e && e.filename ? e.filename : window.location.href,
                        line: e && typeof e.lineno === 'number' ? e.lineno : null,
                        col: e && typeof e.colno === 'number' ? e.colno : null,
                        stack: e && e.error && e.error.stack ? e.error.stack : 'N/A'
                    }, true);
                });
                window.__CBS_MONITORING_ERROR_FALLBACK_BOUND__ = true;
            }

            if (!window.__CBS_MONITORING_REJECTION_FALLBACK_BOUND__) {
                window.addEventListener('unhandledrejection', function (e) {
                    if (window.__CBS_GLOBAL_REJECTION_LISTENER_BOUND__ && window.TelemetryManager) {
                        return;
                    }
                    self.log('PROMISE_REJECTION', { reason: e ? e.reason : null }, true);
                });
                window.__CBS_MONITORING_REJECTION_FALLBACK_BOUND__ = true;
            }
        },

        clearFlushTimer: function () {
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
        },

        scheduleFlush: function (forceNow) {
            if (!supabaseClient || isOffline) return;

            if (forceNow) {
                this.clearFlushTimer();
                this.flushBuffer();
                return;
            }

            if (flushTimer) return;
            var self = this;
            flushTimer = setTimeout(function () {
                flushTimer = null;
                self.flushBuffer();
            }, LOG_FLUSH_INTERVAL);
        },

        setupInteractionTracking: function () {
            document.addEventListener('click', (e) => {
                const now = Date.now();
                if (now - lastInteractionTime < INTERACTION_DEBOUNCE) return;

                const target = e.target;
                if (!target || typeof target.closest !== 'function') return;

                const toolElement = target.closest('.tool-btn, .area-mode-btn, .cesium-button, #measureList .m-row, .camera-angle-btn');
                if (toolElement) {
                    let toolName = toolElement.getAttribute('title') ||
                        toolElement.textContent.trim() ||
                        toolElement.id ||
                        'Bilinmeyen Araç';

                    // Clean up long names
                    if (toolName.length > 50) toolName = toolName.substring(0, 47) + '...';

                    lastInteractionTime = now;
                    this.log('USER_INTERACTION', {
                        tool: toolName,
                        elementId: toolElement.id
                    });
                }
            }, true);
        },

        setupSystemControls: function () {
            if (!supabaseClient) return;

            // 1. Initial Fetch of Feature Flags
            this.updateFeatureFlags();

            // 2. Realtime Table Subscription (Persistent Changes)
            supabaseClient
                .channel('public:system_controls')
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'system_controls' }, payload => {
                    if (payload.new.key === 'feature_flags') {
                        this.applyFeatureFlags(payload.new.value);
                    }
                })
                .subscribe();

            // 3. Broadcast Channel (Transient Commands: reload, message)
            const commandChannel = supabaseClient.channel('system-commands');

            commandChannel
                .on('broadcast', { event: 'reload' }, () => {
                    console.log('%c[Monitoring] Uzak sunucudan yenileme komutu alındı!', 'color: #ef4444; font-weight: bold;');
                    location.reload();
                })
                .on('broadcast', { event: 'message' }, ({ payload }) => {
                    this.showBroadcastMessage(payload.msg);
                })
                .subscribe();
        },

        updateFeatureFlags: async function () {
            if (!supabaseClient) return;
            try {
                const { data, error } = await supabaseClient
                    .from('system_controls')
                    .select('value')
                    .eq('key', 'feature_flags')
                    .single();

                if (error) {
                    console.warn('[Monitoring] feature_flags okunamadı:', error.message || error);
                    return;
                }

                if (data && data.value) {
                    this.applyFeatureFlags(data.value);
                }
            } catch (e) {
                console.warn('[Monitoring] feature_flags isteği başarısız:', e && e.message ? e.message : e);
            }
        },

        applyFeatureFlags: function (flags) {
            if (!flags || typeof flags !== 'object') {
                console.warn('[Monitoring] Geçersiz feature_flags alındı:', flags);
                return;
            }
            console.log('[Monitoring] Uygulanan Özellikler:', flags);
            // feature-toggle CSS class'ına sahip elemanları yönet
            // Örn: <div class="feature-toggle" data-feature="measure">...</div>
            document.querySelectorAll('[data-feature]').forEach(el => {
                const feature = el.getAttribute('data-feature');
                if (flags[feature] === false) {
                    el.style.display = 'none';
                } else {
                    el.style.display = '';
                }
            });
        },

        showBroadcastMessage: function (msg) {
            // Basit bir duyuru barı oluştur veya var olanı güncelle
            let alertBar = document.getElementById('system-alert-bar');
            let messageNode = null;
            if (!alertBar) {
                alertBar = document.createElement('div');
                alertBar.id = 'system-alert-bar';
                alertBar.style = 'position:fixed; top:0; left:0; width:100%; padding:15px; background:#f59e0b; color:#000; text-align:center; font-weight:bold; z-index:99999; animation: slideDown 0.5s ease-out;';

                messageNode = document.createElement('span');
                messageNode.id = 'system-alert-message';
                alertBar.appendChild(messageNode);

                const closeBtn = document.createElement('span');
                closeBtn.textContent = ' ×';
                closeBtn.style = 'margin-left:20px; cursor:pointer; font-size:1.5rem;';
                closeBtn.onclick = () => alertBar.remove();
                alertBar.appendChild(closeBtn);

                document.body.appendChild(alertBar);
            } else {
                messageNode = document.getElementById('system-alert-message');
            }

            if (!messageNode) {
                messageNode = document.createElement('span');
                messageNode.id = 'system-alert-message';
                alertBar.insertBefore(messageNode, alertBar.firstChild);
            }

            messageNode.textContent = '📢 ' + (msg || 'Sistem duyurusu');
            // 10 saniye sonra kapat (opsiyonel)
            // setTimeout(() => alertBar.remove(), 10000);
        },

        startHeartbeat: function () {
            // [FIX-5] Sekme görünmezken heartbeat gönderme — veri kirliliğini ve pil tüketimini önler
            var self = this;
            var _hbInterval = null;
            function _startHb() {
                if (_hbInterval) return;
                _hbInterval = setInterval(function () {
                    self.log('HEARTBEAT');
                }, 20000);
            }
            function _stopHb() {
                clearInterval(_hbInterval);
                _hbInterval = null;
            }
            _startHb();
            document.addEventListener('visibilitychange', function () {
                if (document.hidden) { _stopHb(); } else { _startHb(); }
            });
        },

        getSystemInfoSync: function () {
            var now = Date.now();
            if (systemInfoCache && (now - systemInfoCacheAt) < SYSTEM_INFO_CACHE_TTL) {
                return systemInfoCache;
            }

            if ((now - localStorageSizeCacheAt) > STORAGE_SIZE_CACHE_TTL) {
                var lsSize = 0;
                try {
                    for (var i = 0; i < localStorage.length; i++) {
                        var key = localStorage.key(i) || '';
                        var value = localStorage.getItem(key) || '';
                        lsSize += (key.length + value.length) * 2;
                    }
                } catch (e) { }
                localStorageSizeCache = (lsSize / 1024).toFixed(2) + 'KB';
                localStorageSizeCacheAt = now;
            }

            // Network Health
            var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            var navStart = now;
            if (typeof performance !== 'undefined') {
                if (typeof performance.timeOrigin === 'number' && performance.timeOrigin > 0) {
                    navStart = performance.timeOrigin;
                } else if (performance.timing && performance.timing.navigationStart) {
                    navStart = performance.timing.navigationStart;
                }
            }

            var info = {
                ...(staticInfo || {}),
                userAgent: navigator.userAgent,
                location: userLocation || ipLocation || (cesiumViewer ? this.getCameraLocation() : null),
                connection: {
                    status: isOffline ? 'Offline' : 'Online',
                    type: conn ? conn.effectiveType : 'N/A',
                    downlink: conn ? conn.downlink + 'Mbps' : 'N/A',
                    rtt: conn ? conn.rtt + 'ms' : 'N/A'
                },
                storage: {
                    localStorage: localStorageSizeCache,
                    indexedDB: !!window.indexedDB
                },
                page: {
                    visible: !document.hidden,
                    duration: Math.max(0, Math.round((now - navStart) / 1000)) + 's'
                }
            };

            // 3D Kamera ve Sahne Bağlamı (Cesium varsa)
            if (cesiumViewer && cesiumViewer.camera && cesiumViewer.scene) {
                try {
                    var cam = cesiumViewer.camera;
                    var carto = cam.positionCartographic;
                    var scene = cesiumViewer.scene;

                    info.camera = {
                        lat: (carto.latitude * 180 / Math.PI).toFixed(6),
                        lng: (carto.longitude * 180 / Math.PI).toFixed(6),
                        height: carto.height.toFixed(2),
                        heading: (cam.heading * 180 / Math.PI).toFixed(2),
                        pitch: (cam.pitch * 180 / Math.PI).toFixed(2)
                    };

                    // Sahne Karmaşıklığı ve Bellek
                    info.scene = {
                        primitives: scene.primitives && typeof scene.primitives.length === 'number' ? scene.primitives.length : 'N/A',
                        groundPrimitives: scene.groundPrimitives && typeof scene.groundPrimitives.length === 'number' ? scene.groundPrimitives.length : 'N/A',
                        objects: scene.primitives && scene.primitives._primitives ? scene.primitives._primitives.length : 'N/A',
                        vram: scene.context && scene.context._textureCache && typeof scene.context._textureCache._count === 'number' ? scene.context._textureCache._count : 'N/A'
                    };
                } catch (e) {
                    info.scene = { error: 'scene_info_unavailable' };
                }
            }

            systemInfoCache = info;
            systemInfoCacheAt = now;
            return info;
        },

        getCameraLocation: function () {
            if (!cesiumViewer) return null;
            const cam = cesiumViewer.camera;
            const carto = cam.positionCartographic;
            return {
                lat: (carto.latitude * 180 / Math.PI),
                lng: (carto.longitude * 180 / Math.PI)
            };
        },

        setViewer: function (viewer) {
            cesiumViewer = viewer;
            systemInfoCache = null;
            systemInfoCacheAt = 0;
            this.log('VIEWER_READY');
        },

        getGPUInfo: function () {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return 'N/A';
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'N/A';
            } catch (e) { return 'N/A'; }
        },

        /**
         * Log gönderimi
         */
        log: function (action, details = {}, isError = false) {
            if (!supabaseClient) return;

            var payload = {
                session_id: sessionId,
                user_id: 'guest',
                action: action,
                details: details,
                system_info: this.getSystemInfoSync(),
                fps: currentFps,
                is_error: isError,
                created_at: new Date().toISOString()
            };

            logBuffer.push(payload);
            if (logBuffer.length > LOG_BUFFER_MAX) {
                logBuffer.splice(0, logBuffer.length - LOG_BUFFER_MAX);
            }

            if (isOffline) return;

            if (isError || logBuffer.length >= LOG_BATCH_SIZE) {
                this.scheduleFlush(true);
                return;
            }

            this.scheduleFlush(false);
        },

        sendToCloud: async function (batch) {
            try {
                const { error } = await supabaseClient
                    .from('telemetry_logs')
                    .insert(batch);

                if (error) {
                    console.error('Monitoring Error:', error);
                    return false;
                }
                return true;
            } catch (e) {
                console.error('Failed to send log:', e);
                if (!navigator.onLine) {
                    isOffline = true;
                }
                return false;
            }
        },

        flushBuffer: async function () {
            if (!supabaseClient || isOffline || isFlushing || logBuffer.length === 0) return;

            isFlushing = true;
            this.clearFlushTimer();

            var toSend = logBuffer.splice(0, LOG_BATCH_SIZE);
            var ok = await this.sendToCloud(toSend);
            if (!ok) {
                logBuffer = toSend.concat(logBuffer);
            }

            isFlushing = false;

            if (!isOffline && logBuffer.length > 0) {
                this.scheduleFlush(logBuffer.length >= LOG_BATCH_SIZE);
            }
        },

        /**
         * FPS Takibi
         */
        startFpsMonitoring: function () {
            if (fpsLoopStarted) return;
            fpsLoopStarted = true;

            let lastTime = performance.now();
            let frames = 0;

            const updateFps = () => {
                if (document.hidden) {
                    frames = 0;
                    lastTime = performance.now();
                    requestAnimationFrame(updateFps);
                    return;
                }

                frames++;
                const now = performance.now();
                if (now >= lastTime + 1000) {
                    currentFps = Math.round((frames * 1000) / (now - lastTime));
                    frames = 0;
                    lastTime = now;
                }
                requestAnimationFrame(updateFps);
            };
            requestAnimationFrame(updateFps);
        }
    };

    // Global erişim
    window.MonitoringService = MonitoringService;

    // Yükleme tamamlandığında başlat
    if (document.readyState === 'complete') {
        MonitoringService.init();
    } else {
        window.addEventListener('load', () => MonitoringService.init());
    }
})();
