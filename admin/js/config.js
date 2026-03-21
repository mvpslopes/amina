/**
 * Configuração do painel ÂMINA
 *
 * A API pode ser:
 * - Node (npm start): rotas /api/... no mesmo domínio, OU
 * - PHP (pasta api/ na Hostinger): mesmas rotas /api/...
 *
 * Mesmo domínio (site + admin + api no mesmo https://...): deixe AMINA_API_BASE vazio ''.
 *
 * API em outro endereço (subdomínio, porta, etc.), SEM barra no final:
 *   window.AMINA_API_BASE = 'https://seudominio.com';
 */
(function (w) {
  w.AMINA_API_BASE = String(w.AMINA_API_BASE || '').replace(/\/$/, '');
  w.aminaApiUrl = function (path) {
    const p = path.startsWith('/') ? path : '/' + path;
    return w.AMINA_API_BASE + p;
  };
})(window);
