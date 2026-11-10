/* SonicFrame authentication (Firebase Auth: email/password + Google).
   - On pages marked data-sf-protected it hides the page until a signed-in
     (and, if required, verified) user is confirmed; otherwise it redirects
     to the login page. It fails closed: any problem means "not signed in".
   - On the login page it exposes window.SFAuth for the sign-in modal. */
(function () {
  'use strict';
  var cfg = window.SF_FIREBASE_CONFIG || {};
  var opt = Object.assign({ REQUIRE_EMAIL_VERIFICATION: true, HOME: 'index.html', AFTER_LOGIN: 'studio.html' }, window.SF_AUTH_OPTIONS || {});
  var root = document.documentElement;
  var isProtected = root.hasAttribute('data-sf-protected');
  var SAFE_NEXT = /^[a-z0-9_-]+\.html(#[\w-]*)?$/i;

  var configured = !!(cfg.apiKey && cfg.projectId && String(cfg.apiKey).indexOf('PASTE') === -1 && String(cfg.projectId).indexOf('PASTE') === -1);
  var sdkLoaded = typeof firebase !== 'undefined' && firebase.auth;
  var auth = null, ready = false, current = null, listeners = [];

  function currentPage() { return (location.pathname.split('/').pop() || 'index.html') + (location.hash || ''); }
  function allowed(u) { return !!u && (u.emailVerified || !opt.REQUIRE_EMAIL_VERIFICATION); }
  function toLogin(reason) {
    location.replace(opt.HOME + '?login=1&reason=' + reason + '&next=' + encodeURIComponent(currentPage()));
  }

  if (configured && sdkLoaded) {
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      auth = firebase.auth();
    } catch (e) { auth = null; }
  }

  function ensure() {
    if (!auth) {
      var err = new Error('Login is not set up yet.');
      err.code = !configured ? 'sf/not-configured' : 'sf/sdk-missing';
      throw err;
    }
  }

  /* ---------- signed-in chip (bottom-left) ---------- */
  function mountChip(user) {
    function build() {
      if (document.getElementById('sfUserChip')) return;
      var css = document.createElement('style');
      css.textContent = '#sfUserChip{position:fixed;left:18px;bottom:18px;z-index:99998;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 110px);padding:7px 8px 7px 8px;border-radius:999px;background:rgba(14,16,20,.92);border:1px solid rgba(255,255,255,.22);box-shadow:0 8px 26px rgba(0,0,0,.5),0 0 18px rgba(255,255,255,.08);font:600 11px Manrope,Arial,sans-serif;color:#eef1f5;backdrop-filter:blur(10px)}' +
        '#sfUserChip .av{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#fff,#8e969f);color:#111;font-weight:800}' +
        '#sfUserChip .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '#sfUserChip button{flex:none;border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;border-radius:999px;padding:6px 12px;font:700 10px Manrope,Arial,sans-serif;cursor:pointer;transition:.2s}' +
        '#sfUserChip button:hover{background:#fff;color:#000;box-shadow:0 0 14px rgba(255,255,255,.4)}';
      document.head.appendChild(css);
      var label = user.displayName || user.email || 'Signed in';
      var chip = document.createElement('div');
      chip.id = 'sfUserChip';
      var av = document.createElement('span'); av.className = 'av'; av.textContent = label.charAt(0).toUpperCase();
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = label; nm.title = user.email || label;
      var out = document.createElement('button'); out.type = 'button'; out.textContent = 'Sign out';
      out.onclick = function () { api.signOut().then(function () { location.replace(opt.HOME); }); };
      chip.appendChild(av); chip.appendChild(nm); chip.appendChild(out);
      document.body.appendChild(chip);
    }
    if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  }

  /* ---------- friendly error text ---------- */
  function friendlyError(e) {
    var c = (e && e.code) || '';
    var map = {
      'sf/not-configured': 'Login is not set up yet. Add your Firebase details to firebase-config.js (see SETUP-AUTH.txt).',
      'sf/sdk-missing': 'The login service could not be loaded. Check your internet connection and try again.',
      'sf/unverified': 'Please verify your email first. Open the link we sent you, then sign in.',
      'auth/invalid-email': 'That email address does not look right.',
      'auth/missing-password': 'Please enter your password.',
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/wrong-password': 'Email or password is incorrect.',
      'auth/user-not-found': 'Email or password is incorrect.',
      'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
      'auth/weak-password': 'Please choose a stronger password (at least 8 characters).',
      'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
      'auth/network-request-failed': 'Network problem. Check your connection and try again.',
      'auth/popup-closed-by-user': 'The Google window was closed before finishing.',
      'auth/cancelled-popup-request': 'The Google window was closed before finishing.',
      'auth/popup-blocked': 'Your browser blocked the Google pop-up. Allow pop-ups for this site and try again.',
      'auth/unauthorized-domain': 'This website address is not authorised in Firebase yet. Add it under Authentication > Settings > Authorized domains.',
      'auth/operation-not-allowed': 'This sign-in method is not switched on in Firebase yet (Authentication > Sign-in method).',
      'auth/operation-not-supported-in-this-environment': 'Sign-in needs the site to be opened from http(s), not as a local file. Use your Netlify link or a local server.',
      'auth/account-exists-with-different-credential': 'An account with this email already exists using a different sign-in method.',
      'auth/user-disabled': 'This account has been disabled.'
    };
    return map[c] || 'Something went wrong. Please try again.';
  }

  /* ---------- public API ---------- */
  var api = {
    configured: configured,
    options: opt,
    friendlyError: friendlyError,
    onChange: function (cb) {
      listeners.push(cb);
      if (ready) cb(allowed(current) ? current : null);
    },
    getUser: function () { return allowed(current) ? current : null; },
    getToken: function () {
      var u = allowed(current) ? current : null;
      return u ? u.getIdToken() : Promise.resolve('');
    },
    nextUrl: function () {
      var n = new URLSearchParams(location.search).get('next');
      return n && SAFE_NEXT.test(n) ? n : opt.AFTER_LOGIN;
    },
    signInGoogle: function () {
      return Promise.resolve().then(function () {
        ensure();
        var p = new firebase.auth.GoogleAuthProvider();
        p.setCustomParameters({ prompt: 'select_account' });
        return auth.signInWithPopup(p);
      }).then(function (r) { return r.user; });
    },
    signInEmail: function (email, pass) {
      return Promise.resolve().then(function () {
        ensure();
        return auth.signInWithEmailAndPassword(email, pass);
      }).then(function (r) {
        if (opt.REQUIRE_EMAIL_VERIFICATION && !r.user.emailVerified) {
          return auth.signOut().then(function () { var e = new Error('unverified'); e.code = 'sf/unverified'; throw e; });
        }
        return r.user;
      });
    },
    register: function (name, email, pass) {
      return Promise.resolve().then(function () {
        ensure();
        return auth.createUserWithEmailAndPassword(email, pass);
      }).then(function (r) {
        var u = r.user;
        return Promise.resolve(name ? u.updateProfile({ displayName: name }) : null)
          .then(function () { return u.sendEmailVerification(); })
          .then(function () {
            if (opt.REQUIRE_EMAIL_VERIFICATION) return auth.signOut().then(function () { return { verify: true }; });
            return { verify: false, user: u };
          });
      });
    },
    resendVerification: function (email, pass) {
      return Promise.resolve().then(function () {
        ensure();
        return auth.signInWithEmailAndPassword(email, pass);
      }).then(function (r) {
        var p = r.user.emailVerified ? Promise.resolve() : r.user.sendEmailVerification();
        return p.then(function () { return auth.signOut(); });
      });
    },
    resetPassword: function (email) {
      return Promise.resolve().then(function () { ensure(); return auth.sendPasswordResetEmail(email); });
    },
    signOut: function () { return auth ? auth.signOut() : Promise.resolve(); }
  };
  window.SFAuth = api;

  /* ---------- auth state ---------- */
  if (auth) {
    auth.onAuthStateChanged(function (user) {
      current = user; ready = true;
      var ok = allowed(user);
      if (isProtected) {
        if (ok) { root.classList.remove('sf-auth-pending'); mountChip(user); }
        else toLogin(user ? 'verify' : 'signin');
      }
      listeners.forEach(function (cb) { cb(ok ? user : null); });
    });
  } else if (isProtected) {
    toLogin(configured ? 'sdk' : 'setup');
  } else {
    ready = true;
  }
})();
