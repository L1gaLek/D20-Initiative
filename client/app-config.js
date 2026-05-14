// Central browser configuration.
// Keep public endpoints here instead of scattering them across feature files.
(function () {
  const defaults = {
    supabaseUrl: 'https://iwtxisgxikbddzqwpzsk.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3dHhpc2d4aWtiZGR6cXdwenNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1ODM5ODEsImV4cCI6MjA4NjE1OTk4MX0.gLCl7G-J8WvEVMcfQgzDRe-NCfrzCMLOFZ-51Ph5QRM',
    supabaseFetchFn: 'fetch',
    wsUrl: 'wss://ws.d20-initiative.fun/ws/',
    vpsApiBase: 'https://ws.d20-initiative.fun/api',
    bgmUploadEndpoint: 'https://ws.d20-initiative.fun/api/uploads/room-audio',
    boardBgUploadEndpoint: 'https://ws.d20-initiative.fun/api/uploads/room-board-bg'
  };

  const overrides = (window.D20_CONFIG && typeof window.D20_CONFIG === 'object')
    ? window.D20_CONFIG
    : {};

  const config = { ...defaults, ...overrides };
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
