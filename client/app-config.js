// Central browser configuration.
// Values are injected by the generated, gitignored runtime-config.js.
// Browser configuration is public by definition; never put server secrets here.
(function () {
  const defaults = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseFetchFn: 'fetch',
    wsUrl: '',
    vpsApiBase: '',
    bgmUploadEndpoint: '',
    boardBgUploadEndpoint: ''
  };

  const runtimeConfig = (window.D20_RUNTIME_CONFIG && typeof window.D20_RUNTIME_CONFIG === 'object')
    ? window.D20_RUNTIME_CONFIG
    : {};
  const overrides = (window.D20_CONFIG && typeof window.D20_CONFIG === 'object') ? window.D20_CONFIG : {};

  const config = { ...defaults, ...runtimeConfig, ...overrides };
  window.D20_CONFIG = config;

  // Legacy aliases used by existing modules.
  window.SUPABASE_URL = config.supabaseUrl;
  window.SUPABASE_ANON_KEY = config.supabaseAnonKey;
  window.SUPABASE_FETCH_FN = config.supabaseFetchFn;
  window.WS_URL = config.wsUrl;
  window.VPS_API_BASE = config.vpsApiBase;
  window.BGM_UPLOAD_ENDPOINT = config.bgmUploadEndpoint;
  window.BOARD_BG_UPLOAD_ENDPOINT = config.boardBgUploadEndpoint;
})();
