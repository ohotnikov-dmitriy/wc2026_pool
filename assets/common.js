/* Shared UI + API helpers. Loaded after engine.js and config.js. */
(function () {
  'use strict';
  var CFG = window.POOL_CONFIG || {};
  var API = (CFG.API_BASE || '').replace(/\/+$/, '');

  function flagURL(team) {
    var code = WC.iso[team];
    if (!code) return null;
    return 'https://flagcdn.com/w40/' + code + '.png';
  }
  function flagImg(team) {
    var url = flagURL(team);
    if (!url) return '';
    return '<img class="flag" loading="lazy" alt="" src="' + url + '">';
  }

  function deadline() { return CFG.DEADLINE_ISO ? new Date(CFG.DEADLINE_ISO) : null; }
  function isClosed() { var d = deadline(); return d ? (Date.now() > d.getTime()) : false; }

  function header(active) {
    var el = document.getElementById('app-header');
    if (!el) return;
    var signedIn = false, uname = '', isAdmin = false;
    try { signedIn = !!localStorage.getItem('wc2026:token'); uname = localStorage.getItem('wc2026:username') || '';
          isAdmin = localStorage.getItem('wc2026:admin') === '1'; } catch(e){}
    var nav = '';
    if (signedIn) nav += '<a href="bracket.html">My bracket</a>';
    nav += '<a href="leaderboard.html">Leaderboard</a>';
    if (signedIn && isAdmin) nav += '<a href="admin.html">Save results</a>';
    if (signedIn) nav += '<a href="#" id="nav-logout" title="' + uname + '">Log out</a>';
    else nav += '<a href="index.html">Sign in</a>';
    el.innerHTML =
      '<div class="top"><div class="brand">' +
        '<div class="crest">26</div>' +
        '<div><h1>' + (CFG.TITLE || 'World Cup 2026') + '</h1>' +
        '<div class="sub">Bracket Pool</div></div>' +
      '</div><nav class="nav">' + nav + '</nav></div>';
    var lo = document.getElementById('nav-logout');
    if (lo) lo.addEventListener('click', function(e){ e.preventDefault();
      ['wc2026:token','wc2026:refresh','wc2026:exp','wc2026:username','wc2026:admin'].forEach(function(k){ try { localStorage.removeItem(k); } catch(_){} });
      location.href = 'index.html'; });
  }

  function toast(msg, kind) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9999;' +
      'padding:12px 20px;border-radius:12px;font-weight:700;font-size:14px;box-shadow:0 12px 40px rgba(0,0,0,.5);' +
      'border:1px solid;background:#121823;color:#eef3f8;transition:opacity .25s;opacity:1;' +
      (kind === 'ok' ? 'border-color:#1e4a37;color:#1fd18b' :
       kind === 'err' ? 'border-color:#5c2b2e;color:#ff6b6b' : 'border-color:#2c3a4d');
    t.textContent = msg;
    clearTimeout(t._t); t._t = setTimeout(function(){ t.style.opacity = '0'; }, 2600);
  }

  function api(path, opts) {
    if (!API || API.indexOf('REPLACE-ME') !== -1) {
      return Promise.reject(new Error('API_BASE not configured — edit assets/config.js'));
    }
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' } };
    if (opts.body) init.body = JSON.stringify(opts.body);
    if (opts.token) init.headers['Authorization'] = 'Bearer ' + opts.token;
    return fetch(API + path, init).then(function (r) {
      return r.json().catch(function(){ return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
        return j;
      });
    });
  }

  // ---- session / silent token refresh -------------------------------------
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function setSession(s){
    try {
      if (s.token) localStorage.setItem('wc2026:token', s.token);
      if (s.refresh_token) localStorage.setItem('wc2026:refresh', s.refresh_token);
      localStorage.setItem('wc2026:exp', String(Date.now() + (s.expires_in || 300) * 1000));
      if (s.username) localStorage.setItem('wc2026:username', s.username);
    } catch(e){}
  }
  function clearSession(){
    ['wc2026:token','wc2026:refresh','wc2026:exp','wc2026:username','wc2026:admin']
      .forEach(function(k){ try { localStorage.removeItem(k); } catch(e){} });
  }
  function token(){ return ls('wc2026:token'); }
  function username(){ return ls('wc2026:username'); }
  function tokenFresh(skewMs){ var e = parseInt(ls('wc2026:exp')||'0',10); return !!e && Date.now() < e - (skewMs||0); }

  // Exchange the stored refresh_token for a new access token.
  function refresh(){
    var rt = ls('wc2026:refresh');
    if (!rt) return Promise.reject(new Error('Session expired — please sign in again'));
    return api('/api/refresh', { method:'POST', body:{ refresh_token: rt } })
      .then(function(r){ setSession(r); return r.token; });
  }
  // Resolve to a usable access token, refreshing first if it's about to expire.
  function ensureToken(){
    if (token() && tokenFresh(30000)) return Promise.resolve(token());
    return refresh();
  }
  // Authenticated API call: ensure a fresh token, and on a 401 try one refresh + retry.
  function apiAuth(path, opts){
    opts = opts || {};
    return ensureToken().then(function(tok){
      return api(path, Object.assign({}, opts, { token: tok }));
    }).catch(function(e){
      if (e && (e.status === 401 || /auth|expired|sign in/i.test(e.message||''))) {
        return refresh().then(function(tok){ return api(path, Object.assign({}, opts, { token: tok })); });
      }
      throw e;
    });
  }

  window.POOL = {
    API: API, flagURL: flagURL, flagImg: flagImg,
    deadline: deadline, isClosed: isClosed, header: header, toast: toast, api: api,
    setSession: setSession, clearSession: clearSession, token: token, username: username,
    refresh: refresh, ensureToken: ensureToken, apiAuth: apiAuth
  };
})();
