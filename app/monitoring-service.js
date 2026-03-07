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

    const MonitoringService = {
        init: function () {
            if (typeof supabase === 'undefined') {
                console.warn('Supabase SDK yüklenemedi. İzleme devre dışı.');
                return;
            }

            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('🚀 Monitoring Service ID:', sessionId);

            window.onerror = (msg, url, line, col, error) => {
                this.log('CRITICAL_ERROR', {
                    message: msg,
                    url: url,
                    line: line,
                    col: col,
                    stack: error ? error.stack : 'N/A'
                }, true);
            };

            // İlk açılış logu ve sistem bilgisi
            this.log('SESSION_START', {
                referrer: document.referrer,
                url: window.location.href
            });

            this.startFpsMonitoring();
        },

        /**
         * Log gönderimi (TelemetryManager tarafından çağrılır)
         */
        log: async function (action, details = {}, isError = false) {
            if (!supabaseClient) return;

            try {
                const systemInfo = (typeof TelemetryManager !== 'undefined') ? TelemetryManager.getSystemInfo() : {};

                const { error } = await supabaseClient
                    .from('telemetry_logs')
                    .insert([{
                        session_id: sessionId,
                        user_id: 'guest', // Gelecekte auth ile bağlanabilir
                        action: action,
                        details: details,
                        system_info: this.getSystemInfo(),
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
