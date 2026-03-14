window.CBS_CONFIG = {
    // municipality (varsayılan) | public
    appMode: 'municipality',
    cesiumIonToken: '',
    supabaseUrl: '',
    supabaseAnonKey: '',
    adminPasswordSha256: '',
    // opsiyonel: system-commands broadcast doğrulaması için panel ve istemci tarafında aynı token kullanılmalı
    adminCommandToken: '',
    // true oldugunda istemci tarafinda izleme banner/popup gostermeden calisir
    monitoringStealthMode: true,
    // sadece teknik debug icin true yapin
    monitoringVerboseConsole: false,
    // kullanici etkileşim loglarinin minimum araligi (ms)
    monitoringInteractionDebounceMs: 900,
    // heartbeat gonderim araligi (ms)
    monitoringHeartbeatMs: 25000,
    // precision (resmi ölçüm öncelikli) | performance (daha akıcı, canvas back-buffer kapalı)
    preserveDrawingBufferMode: 'precision'
};
