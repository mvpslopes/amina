(function (w, d) {
  'use strict';

  function loadGa4(measurementId) {
    var id = String(measurementId || '').trim();
    if (!id) return;
    if (!/^G-[A-Z0-9]+$/i.test(id)) {
      console.warn('[AMINA] ID do Google Analytics invalido:', id);
      return;
    }
    if (w.__aminaGaInitialized) return;
    w.__aminaGaInitialized = true;

    w.dataLayer = w.dataLayer || [];
    w.gtag = w.gtag || function () {
      w.dataLayer.push(arguments);
    };
    w.gtag('js', new Date());
    w.gtag('config', id, {
      anonymize_ip: true,
      page_title: d.title || undefined,
      page_path: w.location.pathname + w.location.search,
    });

    var s = d.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    d.head.appendChild(s);
  }

  function init() {
    loadGa4(w.AMINA_GA_MEASUREMENT_ID || '');
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window, document);
