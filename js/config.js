/**
 * Base da API para a vitrine (mesma lógica do painel: admin/js/config.js).
 *
 * - Não definido: calcula a pasta do site (subpastas e /pasta sem barra final).
 * - Para forçar: antes deste script, em index.html:
 *     <script>window.AMINA_API_BASE = 'https://seudominio.com';</script>
 * - Valor vazio '' = URLs relativas à raiz do domínio (só faz sentido se a página estiver na raiz).
 */
(function (w) {
  /** Pasta do site na URL (evita bug de URL('.') com /pasta sem / no fim). */
  function publicSiteBasePath(pathname) {
    var p = pathname || '/';
    var segs = p.split('/').filter(function (s) {
      return s.length > 0;
    });
    if (!segs.length) return '';
    var last = segs[segs.length - 1];
    if (/\.(html?|php|aspx|htm|jsp)$/i.test(last)) {
      segs.pop();
    }
    return segs.length ? '/' + segs.join('/') : '';
  }

  if (!('AMINA_API_BASE' in w)) {
    try {
      if (w.location.protocol === 'file:') {
        w.AMINA_API_BASE = '';
      } else {
        var sub = publicSiteBasePath(w.location.pathname);
        w.AMINA_API_BASE = w.location.origin + sub;
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

  /**
   * WhatsApp para finalizar pedido (só dígitos, com DDI 55).
   * Pode definir antes deste script: window.AMINA_WHATSAPP = '5531999999999';
   */
  if (!('AMINA_WHATSAPP' in w)) {
    w.AMINA_WHATSAPP = '5531983614819';
  }
  w.AMINA_WHATSAPP = String(w.AMINA_WHATSAPP || '').replace(/\D/g, '');

  /**
   * Google Analytics 4 (GA4)
   * Exemplo: w.AMINA_GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';
   */
  if (!('AMINA_GA_MEASUREMENT_ID' in w)) {
    w.AMINA_GA_MEASUREMENT_ID = 'G-6NL6HKVPZV';
  }
  w.AMINA_GA_MEASUREMENT_ID = String(w.AMINA_GA_MEASUREMENT_ID || '').trim();

  /**
   * URL publica de dashboard (ex.: Looker Studio) para exibir no login interno.
   */
  if (!('AMINA_ANALYTICS_DASHBOARD_URL' in w)) {
    w.AMINA_ANALYTICS_DASHBOARD_URL = '';
  }
  w.AMINA_ANALYTICS_DASHBOARD_URL = String(w.AMINA_ANALYTICS_DASHBOARD_URL || '').trim();
})(window);
