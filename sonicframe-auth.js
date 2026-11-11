/* SonicFrame authentication (Firebase Auth: email/password + Google).
   - Security: Passwords are sent over TLS directly to Firebase Authentication,
     where Google hashes and salts each password using modified scrypt with
     individual per-user cryptographic salts. SonicFrame never stores, caches,
     or logs passwords in plaintext anywhere (neither locally nor on the server).
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
  var LOCK_ENDPOINT = '/.netlify/functions/login-attempts';
  var LOCKOUT_SECONDS = 300;
  /* Only real credential rejections count against the user. */
  var CREDENTIAL_ERRORS = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'];

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

  var STORAGE_KEY = 'sf_login_lockout';
  var STORAGE_BY_EMAIL = 'sf_login_lockout_by_email';
  var MAX_ATTEMPTS = 5;

  function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  function getLocalStore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { attempts: 0, lockedUntil: 0, email: '' };
      var parsed = JSON.parse(raw);
      var now = Date.now();
      if (parsed.lockedUntil && parsed.lockedUntil <= now) {
        clearLocalLock();
        return { attempts: 0, lockedUntil: 0, email: '' };
      }
      return parsed;
    } catch (e) {
      return { attempts: 0, lockedUntil: 0, email: '' };
    }
  }

  function getEmailStore(email) {
    var em = normalizeEmail(email);
    if (!em) return null;
    try {
      var raw = localStorage.getItem(STORAGE_BY_EMAIL);
      if (!raw) return null;
      var map = JSON.parse(raw) || {};
      var entry = map[em];
      if (!entry) return null;
      var now = Date.now();
      if (entry.lockedUntil && entry.lockedUntil <= now) {
        delete map[em];
        localStorage.setItem(STORAGE_BY_EMAIL, JSON.stringify(map));
        return null;
      }
      return entry;
    } catch (e) {
      return null;
    }
  }

  function saveEmailStore(email, entry) {
    var em = normalizeEmail(email);
    if (!em) return;
    try {
      var raw = localStorage.getItem(STORAGE_BY_EMAIL);
      var map = raw ? JSON.parse(raw) : {};
      map[em] = entry;
      localStorage.setItem(STORAGE_BY_EMAIL, JSON.stringify(map));
    } catch (e) {}
  }

  function clearEmailStore(email) {
    var em = normalizeEmail(email);
    if (!em) return;
    try {
      var raw = localStorage.getItem(STORAGE_BY_EMAIL);
      if (!raw) return;
      var map = JSON.parse(raw) || {};
      delete map[em];
      localStorage.setItem(STORAGE_BY_EMAIL, JSON.stringify(map));
    } catch (e) {}
  }

  function clearLocalLock(email) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    if (email) clearEmailStore(email);
  }

  function getLocalLockInfo(email) {
    var now = Date.now();
    var store = getLocalStore();
    var emStore = email ? getEmailStore(email) : null;

    var lockedUntil = 0;
    var attempts = store.attempts || 0;

    if (store.lockedUntil && store.lockedUntil > now) {
      lockedUntil = store.lockedUntil;
    }
    if (emStore && emStore.lockedUntil && emStore.lockedUntil > now) {
      if (emStore.lockedUntil > lockedUntil) lockedUntil = emStore.lockedUntil;
      if (emStore.attempts > attempts) attempts = emStore.attempts;
    }

    var isLocked = lockedUntil > now;
    var retryAfter = isLocked ? Math.ceil((lockedUntil - now) / 1000) : 0;
    var remaining = Math.max(0, MAX_ATTEMPTS - attempts);

    return {
      isLocked: isLocked,
      locked: isLocked,
      retryAfter: retryAfter,
      attempts: attempts,
      remaining: remaining
    };
  }

  function recordLocalFail(email) {
    var now = Date.now();
    var store = getLocalStore();
    var em = normalizeEmail(email);

    if (store.lockedUntil > now) {
      return getLocalLockInfo(email);
    }

    store.attempts = (store.attempts || 0) + 1;
    store.lastAttempt = now;
    store.email = em;

    var emStore = em ? (getEmailStore(em) || { attempts: 0, lockedUntil: 0 }) : null;
    if (emStore) {
      emStore.attempts = (emStore.attempts || 0) + 1;
      emStore.lastAttempt = now;
    }

    if (store.attempts >= MAX_ATTEMPTS || (emStore && emStore.attempts >= MAX_ATTEMPTS)) {
      var lockUntil = now + (LOCKOUT_SECONDS * 1000);
      store.lockedUntil = lockUntil;
      if (emStore) emStore.lockedUntil = lockUntil;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {}
    if (emStore) saveEmailStore(em, emStore);

    return getLocalLockInfo(email);
  }

  /* ---------- failed-attempt tracking (client + server-side) ---------- */
  function lockedError(retryAfter) {
    var e = new Error('locked');
    e.code = 'sf/locked';
    e.retryAfter = retryAfter > 0 ? retryAfter : LOCKOUT_SECONDS;
    return e;
  }

  function attemptRequest(action, email) {
    return fetch(LOCK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action, email: email })
    }).then(function (r) {
      if (!r.ok) throw new Error('lock-service HTTP ' + r.status);
      return r.json();
    }).catch(function (e) {
      return null;
    });
  }

  /* One password check, gated locally and by server. */
  function passwordAttempt(email, pass) {
    var localInfo = getLocalLockInfo(email);
    if (localInfo.isLocked) {
      return Promise.reject(lockedError(localInfo.retryAfter));
    }

    return attemptRequest('check', email).then(function (s) {
      if (s && s.locked) {
        var sLockUntil = Date.now() + (s.retryAfter * 1000);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts: MAX_ATTEMPTS, lockedUntil: sLockUntil, email: normalizeEmail(email) }));
        } catch (err) {}
        throw lockedError(s.retryAfter);
      }
      ensure();
      return auth.signInWithEmailAndPassword(email, pass);
    }).then(function (r) {
      clearLocalLock(email);
      attemptRequest('success', email);
      return r;
    }).catch(function (e) {
      if (!e) throw e;
      if (e.code === 'sf/locked') throw e;
      if (CREDENTIAL_ERRORS.indexOf(e.code) !== -1) {
        var failInfo = recordLocalFail(email);
        attemptRequest('fail', email).then(function (s) {
          if (s && s.locked) {
            var sLockUntil = Date.now() + (s.retryAfter * 1000);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts: MAX_ATTEMPTS, lockedUntil: sLockUntil, email: normalizeEmail(email) }));
            } catch (err) {}
          }
        });

        if (failInfo.isLocked) {
          throw lockedError(failInfo.retryAfter);
        } else {
          e.attemptsRemaining = failInfo.remaining;
          e.attempts = failInfo.attempts;
          throw e;
        }
      }
      throw e;
    });
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
      'auth/user-disabled': 'This account has been disabled.',
      'sf/locked': 'Too many failed attempts. Please wait 5 minutes and try again.'
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
    lockStatus: function (email) {
      var local = getLocalLockInfo(email);
      if (local.isLocked) return Promise.resolve(local);
      return attemptRequest('check', email).then(function (s) {
        if (s && s.locked) {
          var sLockUntil = Date.now() + (s.retryAfter * 1000);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts: MAX_ATTEMPTS, lockedUntil: sLockUntil, email: normalizeEmail(email) }));
          } catch (e) {}
          return s;
        }
        return local;
      }).catch(function () {
        return local;
      });
    },
    getLockInfo: function (email) {
      return getLocalLockInfo(email);
    },
    clearLock: function (email) {
      clearLocalLock(email);
      attemptRequest('success', email);
    },
    recordFail: function (email) {
      return recordLocalFail(email);
    },
    signInEmail: function (email, pass) {
      return passwordAttempt(email, pass).then(function (r) {
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
      return passwordAttempt(email, pass).then(function (r) {
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
