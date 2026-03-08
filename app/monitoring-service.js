/**
 * MonitoringService.js
 * Supabase tabanlı gerçek zamanlı izleme ve telemetri servisi.
 */
(function () {
    const SUPABASE_URL = 'https://qnobscsbcsrhizqcraif.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_VmFm70pf-3g3xDfXNBxcpw_ji_Dj-Ee';

    let supabaseClient = null;
    let sessionId = 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    let currentFps = 60;
    let userLocation = null;
    let ipLocation = null;
    let cesiumViewer = null;
    let logBuffer = [];
    let isOffline = !navigator.onLine;
    let staticInfo = null;
    let lastInteractionTime = 0;
    const INTERACTION_DEBOUNCE = 500; // ms

    const MonitoringService = {
        init: function () {
            if (typeof supabase === 'undefined') {
                console.warn('Supabase SDK yüklenemedi. İzleme devre dışı.');
                return;
            }

            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('🚀 Monitoring Service ID:', sessionId);
            console.log("%c[Monitoring] Oturum Başladı: " + sessionId, "color: #38bdf8; font-weight: bold;");

            window.onerror = (msg, url, line, col, error) => {
                this.log('CRITICAL_ERROR', {
                    message: msg,
                    url: url,
                    line: line,
                    col: col,
                    stack: error ? error.stack : 'N/A'
                }, true);
            };

            window.addEventListener('online', () => {
                isOffline = false;
                this.flushBuffer();
            });
            window.addEventListener('offline', () => isOffline = true);

            // IP tabanlı yaklaşık konum (Fallback 1 - Hızlı ve izinsiz)
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
            this.log('SESSION_START', {
                referrer: document.referrer,
                url: window.location.href
            });

            this.startFpsMonitoring();
            this.startHeartbeat();
            this.cacheStaticInfo();
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

        setupInteractionTracking: function () {
            document.addEventListener('click', (e) => {
                const now = Date.now();
                if (now - lastInteractionTime < INTERACTION_DEBOUNCE) return;

                const toolElement = e.target.closest('.tool-btn, .area-mode-btn, .cesium-button, #measureList .m-row, .camera-angle-btn');
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
            const controlsSubscription = supabaseClient
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
            const { data, error } = await supabaseClient
                .from('system_controls')
                .select('value')
                .eq('key', 'feature_flags')
                .single();

            if (data) {
                this.applyFeatureFlags(data.value);
            }
        },

        applyFeatureFlags: function (flags) {
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
            if (!alertBar) {
                alertBar = document.createElement('div');
                alertBar.id = 'system-alert-bar';
                alertBar.style = 'position:fixed; top:0; left:0; width:100%; padding:15px; background:#f59e0b; color:#000; text-align:center; font-weight:bold; z-index:99999; animation: slideDown 0.5s ease-out;';
                document.body.appendChild(alertBar);

                const closeBtn = document.createElement('span');
                closeBtn.innerHTML = ' &times;';
                closeBtn.style = 'margin-left:20px; cursor:pointer; font-size:1.5rem;';
                closeBtn.onclick = () => alertBar.remove();
                alertBar.appendChild(closeBtn);
            }
            alertBar.innerHTML = `📢 ${msg}`;
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
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

            // Storage Health
            let lsSize = 0;
            try {
                for (let key in localStorage) {
                    if (localStorage.hasOwnProperty(key)) lsSize += (localStorage[key].length + key.length) * 2;
                }
            } catch (e) { }

            // Network Health
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

            const info = {
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
                    localStorage: (lsSize / 1024).toFixed(2) + 'KB',
                    indexedDB: !!window.indexedDB
                },
                page: {
                    visible: !document.hidden,
                    duration: Math.round((Date.now() - performance.timing.navigationStart) / 1000) + 's'
                }
            };

            // 3D Kamera ve Sahne Bağlamı (Cesium varsa)
            if (cesiumViewer) {
                const cam = cesiumViewer.camera;
                const carto = cam.positionCartographic;
                const scene = cesiumViewer.scene;

                info.camera = {
                    lat: (carto.latitude * 180 / Math.PI).toFixed(6),
                    lng: (carto.longitude * 180 / Math.PI).toFixed(6),
                    height: carto.height.toFixed(2),
                    heading: (cam.heading * 180 / Math.PI).toFixed(2),
                    pitch: (cam.pitch * 180 / Math.PI).toFixed(2)
                };

                // Sahne Karmaşıklığı ve Bellek
                info.scene = {
                    primitives: scene.primitives.length,
                    groundPrimitives: scene.groundPrimitives.length,
                    objects: scene.primitives._primitives?.length || 'N/A',
                    vram: scene.context._textureCache?._count || 'N/A' // Yaklaşık texture sayısı
                };
            }

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
        log: async function (action, details = {}, isError = false) {
            if (!supabaseClient) return;

            const payload = {
                session_id: sessionId,
                user_id: 'guest',
                action: action,
                details: details,
                system_info: this.getSystemInfoSync(),
                fps: currentFps,
                is_error: isError,
                created_at: new Date().toISOString()
            };

            if (isOffline) {
                logBuffer.push(payload);
                if (logBuffer.length > 50) logBuffer.shift(); // Limit buffer
                return;
            }

            this.sendToCloud(payload);
        },

        sendToCloud: async function (payload) {
            try {
                const { error } = await supabaseClient
                    .from('telemetry_logs')
                    .insert([payload]);

                if (error) console.error('Monitoring Error:', error);
            } catch (e) {
                console.error('Failed to send log:', e);
                logBuffer.push(payload);
            }
        },

        flushBuffer: async function () {
            if (logBuffer.length === 0) return;
            console.log(`[Monitoring] Flushing ${logBuffer.length} buffered logs...`);

            const toSend = [...logBuffer];
            logBuffer = [];

            try {
                const { error } = await supabaseClient
                    .from('telemetry_logs')
                    .insert(toSend);
                if (error) {
                    console.error('Flush Error:', error);
                    logBuffer = [...toSend, ...logBuffer];
                }
            } catch (e) {
                logBuffer = [...toSend, ...logBuffer];
            }
        },

        /**
         * FPS Takibi
         */
        startFpsMonitoring: function () {
            let lastTime = performance.now();
            let frames = 0;

            const updateFps = () => {
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
