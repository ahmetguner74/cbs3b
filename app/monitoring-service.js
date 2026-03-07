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

            // Konum yakalama (İzin istenirse)
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
        },

        getSystemInfoSync: function () {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
            return {
                source: isLocal ? 'Local' : 'Live',
                host: window.location.host || 'File System',
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                screen: `${window.screen.width}x${window.screen.height}`,
                memory: navigator.deviceMemory ? `${navigator.deviceMemory}GB` : 'N/A',
                gpu: this.getGPUInfo(),
                location: userLocation
            };
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

            try {
                const { error } = await supabaseClient
                    .from('telemetry_logs')
                    .insert([{
                        session_id: sessionId,
                        user_id: 'guest',
                        action: action,
                        details: details,
                        system_info: this.getSystemInfoSync(),
                        fps: currentFps,
                        is_error: isError
                    }]);

                if (error) console.error('Monitoring Error:', error);
            } catch (e) {
                console.error('Failed to send log:', e);
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
