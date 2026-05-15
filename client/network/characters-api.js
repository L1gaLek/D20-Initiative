// Saved character API helpers for the VPS backend.

(function () {
  function getVpsApiClient() {
    const client = window.vpsApi;
    if (typeof client !== 'function') {
      throw new Error('VPS API helper is not loaded.');
    }
    return client;
  }

  function normalizeSavedId(savedId) {
    return String(savedId || '').trim();
  }

  async function listSavedBases(options = {}) {
    return getVpsApiClient()('/characters', {
      ...options,
      method: 'GET'
    });
  }

  async function saveSavedBase(payload = {}, options = {}) {
    return getVpsApiClient()('/characters', {
      ...options,
      method: 'POST',
      body: {
        name: payload.name,
        state: payload.state
      }
    });
  }

  async function getSavedBase(savedId, options = {}) {
    const cleanSavedId = normalizeSavedId(savedId);
    return getVpsApiClient()(`/characters/${encodeURIComponent(cleanSavedId)}`, {
      ...options,
      method: 'GET'
    });
  }

  async function deleteSavedBase(savedId, options = {}) {
    const cleanSavedId = normalizeSavedId(savedId);
    return getVpsApiClient()(`/characters/${encodeURIComponent(cleanSavedId)}`, {
      ...options,
      method: 'DELETE'
    });
  }

  window.CharactersApi = Object.freeze({
    listSavedBases,
    saveSavedBase,
    getSavedBase,
    deleteSavedBase
  });
})();
