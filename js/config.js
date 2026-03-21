/**
 * Base da API para a vitrine (mesma lógica do painel: admin/js/config.js).
 *
 * - Não definido: calcula a pasta do site (útil em subpastas, ex.: /amina/index.html → API em /amina/api/...).
 * - Para forçar: antes deste script, em index.html:
 *     <script>window.AMINA_API_BASE = 'https://seudominio.com';</script>
 * - Valor vazio '' = URLs relativas à raiz do domínio (só faz sentido se a página estiver na raiz).
 */
(function (w) {
  if (!('AMINA_API_BASE' in w)) {
    try {
      if (w.location.protocol === 'file:') {
        w.AMINA_API_BASE = '';
      } else {
        var u = new URL('.', w.location.href);
        var path = u.pathname.replace(/\/+$/, '');
        w.AMINA_API_BASE = w.location.origin + path;
      }
    } catch (e) {
      w.AMINA_API_BASE = '';
    }
  }
  w.AMINA_API_BASE = String(w.AMINA_API_BASE).replace(/\/$/, '');
  w.aminaApiUrl = function (path) {
    var p = path.startsWith('/') ? path : '/' + path;
    var b = w.AMINA_API_BASE;
    if (!b) return p;
    return b + p;
  };
})(window);
