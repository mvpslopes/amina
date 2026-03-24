(function () {
  const form = document.getElementById('loginForm');
  const err = document.getElementById('loginError');
  const analyticsCard = document.getElementById('analyticsCard');
  const analyticsHint = document.getElementById('analyticsHint');
  const analyticsFrame = document.getElementById('analyticsFrame');
  const loginLayout = document.querySelector('.login-layout');

  (function initAnalyticsPreview() {
    const url = String(window.AMINA_ANALYTICS_DASHBOARD_URL || '').trim();
    if (!analyticsCard || !analyticsHint || !analyticsFrame || !loginLayout) return;
    if (url && /^https?:\/\//i.test(url)) {
      analyticsFrame.src = url;
      analyticsCard.hidden = false;
      analyticsHint.hidden = true;
      loginLayout.classList.remove('login-layout--single');
      return;
    }
    analyticsCard.hidden = true;
    analyticsHint.hidden = true;
    loginLayout.classList.add('login-layout--single');
  })();

  if (localStorage.getItem('amina_token')) {
    window.location.replace('/admin/index.html');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const fd = new FormData(form);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');

    try {
      const res = await fetch(window.aminaApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg =
          (data && data.error) ||
          (raw && raw.trim().slice(0, 800)) ||
          'Falha no login (HTTP ' + res.status + ')';
        err.textContent = msg;
        err.hidden = false;
        return;
      }
      localStorage.setItem('amina_token', data.token);
      localStorage.setItem('amina_user', JSON.stringify(data.user));
      window.location.replace('/admin/index.html');
    } catch {
      err.textContent = 'Erro de rede. O servidor está rodando?';
      err.hidden = false;
    }
  });
})();
