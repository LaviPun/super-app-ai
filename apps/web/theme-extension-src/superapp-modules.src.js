// SOURCE for assets/superapp-modules.js — edit HERE, then rebuild the shipped asset with:
//   apps/web/node_modules/.bin/esbuild apps/web/theme-extension-src/superapp-modules.src.js --minify --outfile=extensions/theme-app-extension/assets/superapp-modules.js --allow-overwrite
// The shipped asset is minified to stay under Shopify's 30KB app-block JS budget (AssetSizeAppBlockJavaScript).
/* SuperApp theme extension runtime (vanilla JS, no deps). Loaded once per page
   via each block's schema "javascript" attribute. Two features:
   1. Popup engine — opens .superapp-popup overlays on their trigger (load/timed/
      exit-intent/scroll/click), closes on button/scrim/Escape, traps focus,
      honors prefers-reduced-motion, and suppresses re-shows per module id in
      local/session storage per the configured frequency.
   2. App-proxy contact forms — submits form[data-superapp-proxy-form] via fetch()
      with inline success/error status (no full-page nav to the raw JSON). */
(function () {
  'use strict';
  if (window.__superappModulesRuntime) return;
  window.__superappModulesRuntime = true;

  var DAY_MS = 24 * 60 * 60 * 1000;
  var reducedMotion = false;
  try { reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* noop */ }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ── frequency suppression (storage may be unavailable, e.g. private mode) ── */
  function storageGet(store, key) { try { return store.getItem(key); } catch (e) { return null; } }
  function storageSet(store, key, value) { try { store.setItem(key, value); } catch (e) { /* noop */ } }

  function popupKey(id) { return 'superapp:popup:' + id; }

  function isSuppressed(id, frequency) {
    var key = popupKey(id);
    if (frequency === 'EVERY_VISIT') return false;
    if (frequency === 'ONCE_EVER') return storageGet(window.localStorage, key) !== null;
    if (frequency === 'ONCE_PER_DAY' || frequency === 'ONCE_PER_WEEK') {
      var raw = storageGet(window.localStorage, key);
      if (raw === null) return false;
      var last = parseInt(raw, 10);
      if (isNaN(last)) return false;
      var windowMs = frequency === 'ONCE_PER_DAY' ? DAY_MS : 7 * DAY_MS;
      return Date.now() - last < windowMs;
    }
    /* ONCE_PER_SESSION and any unknown value */
    return storageGet(window.sessionStorage, key) !== null;
  }

  function markShown(id, frequency) {
    if (frequency === 'EVERY_VISIT') return;
    var key = popupKey(id);
    if (frequency === 'ONCE_PER_DAY' || frequency === 'ONCE_PER_WEEK' || frequency === 'ONCE_EVER') {
      storageSet(window.localStorage, key, String(Date.now()));
    } else {
      storageSet(window.sessionStorage, key, String(Date.now()));
    }
  }

  /* R2.1 display-rules evaluator. Hand-ported, byte-for-byte, from the TS source
     of truth `packages/core/src/rule-engine/evaluate.ts`. The two are pinned in
     lockstep by a fixture PARITY test (packages/core .../rule-engine-parity.test.ts)
     which extracts THIS region (the whole-code lines strictly between the two
     single-line BEGIN/END markers) and runs the shared fixtures through it. If you
     change the algorithm here, change it there too.

     Hard safety: no eval, no Function, no user-supplied RegExp. Operators are the
     fixed CONDITION_OPERATORS set. Unresolved values never fabricate a verdict. */
  /* RULE-ENGINE-EVALUATOR:BEGIN (parity marker — keep on its own line) */
  function ruleToNum(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.replace(/^\s+|\s+$/g, '') !== '') {
      var n = Number(v);
      return isNaN(n) ? NaN : n;
    }
    return NaN;
  }

  function ruleToStr(v) {
    if (v === null || v === undefined) return '';
    return String(v).toLowerCase();
  }

  function ruleCompare(actual, operator, expected) {
    var actualIsArray = Object.prototype.toString.call(actual) === '[object Array]';
    var expectedIsArray = Object.prototype.toString.call(expected) === '[object Array]';
    var i, hay, an, en, a, e;
    switch (operator) {
      case 'equal_to':
        if (actualIsArray) {
          hay = [];
          for (i = 0; i < actual.length; i++) hay.push(ruleToStr(actual[i]));
          if (expectedIsArray) {
            for (i = 0; i < expected.length; i++) if (hay.indexOf(ruleToStr(expected[i])) !== -1) return true;
            return false;
          }
          return hay.indexOf(ruleToStr(expected)) !== -1;
        }
        if (expectedIsArray) {
          for (i = 0; i < expected.length; i++) if (ruleToStr(expected[i]) === ruleToStr(actual)) return true;
          return false;
        }
        an = ruleToNum(actual);
        en = ruleToNum(expected);
        if (!isNaN(an) && !isNaN(en)) return an === en;
        return ruleToStr(actual) === ruleToStr(expected);
      case 'not_equal_to':
        return !ruleCompare(actual, 'equal_to', expected);
      case 'greater_than':
        return ruleToNum(actual) > ruleToNum(expected);
      case 'less_than':
        return ruleToNum(actual) < ruleToNum(expected);
      case 'greater_than_or_equal':
        return ruleToNum(actual) >= ruleToNum(expected);
      case 'less_than_or_equal':
        return ruleToNum(actual) <= ruleToNum(expected);
      case 'contains':
        if (actualIsArray) {
          hay = [];
          for (i = 0; i < actual.length; i++) hay.push(ruleToStr(actual[i]));
          if (expectedIsArray) {
            for (i = 0; i < expected.length; i++) if (hay.indexOf(ruleToStr(expected[i])) !== -1) return true;
            return false;
          }
          return hay.indexOf(ruleToStr(expected)) !== -1;
        }
        return ruleToStr(actual).indexOf(ruleToStr(expected)) !== -1;
      case 'not_contains':
        return !ruleCompare(actual, 'contains', expected);
      case 'starts_with':
        return ruleToStr(actual).indexOf(ruleToStr(expected)) === 0;
      case 'ends_with':
        a = ruleToStr(actual);
        e = ruleToStr(expected);
        return e.length <= a.length && a.lastIndexOf(e) === a.length - e.length;
      default:
        return false;
    }
  }

  function ruleEvalRow(row, ctx) {
    var key = row.object + '.' + row.attribute;
    var actual = ctx.values[key];
    if (row.operator === 'is_set') return actual !== null && actual !== undefined && actual !== '' ? 'pass' : 'fail';
    if (row.operator === 'is_not_set') return actual === null || actual === undefined || actual === '' ? 'pass' : 'fail';
    if (actual === undefined) return 'unresolved';
    return ruleCompare(actual, row.operator, row.value) ? 'pass' : 'fail';
  }

  /* Returns { verdict: 'show'|'hide', resolvable: boolean }. Mirrors evaluateRuleEngine. */
  function evaluateRules(rules, ctx) {
    if (!rules || !rules.enabled || !rules.groups || rules.groups.length === 0) {
      return { verdict: 'show', resolvable: true };
    }
    var anyUnresolved = false;
    var groupResults = [];
    for (var g = 0; g < rules.groups.length; g++) {
      var group = rules.groups[g];
      var conditions = group.conditions || [];
      var verdicts = [];
      for (var c = 0; c < conditions.length; c++) verdicts.push(ruleEvalRow(conditions[c], ctx));
      if (verdicts.indexOf('unresolved') !== -1) anyUnresolved = true;
      var resolved = [];
      for (var v = 0; v < verdicts.length; v++) if (verdicts[v] !== 'unresolved') resolved.push(verdicts[v]);
      var groupPass;
      if ((group.logic || 'AND') === 'AND') {
        groupPass = true;
        for (var r = 0; r < resolved.length; r++) if (resolved[r] !== 'pass') { groupPass = false; break; }
      } else {
        groupPass = false;
        for (var r2 = 0; r2 < resolved.length; r2++) if (resolved[r2] === 'pass') { groupPass = true; break; }
      }
      groupResults.push(groupPass);
    }
    var matched;
    if ((rules.logic || 'AND') === 'AND') {
      matched = true;
      for (var i = 0; i < groupResults.length; i++) if (!groupResults[i]) { matched = false; break; }
    } else {
      matched = false;
      for (var j = 0; j < groupResults.length; j++) if (groupResults[j]) { matched = true; break; }
    }
    var show = rules.matchAction === 'HIDE' ? !matched : matched;
    return { verdict: show ? 'show' : 'hide', resolvable: !anyUnresolved };
  }
  /* ══ RULE-ENGINE-EVALUATOR:END ════════════════════════════════════════════ */

  /* ── rule context: resolve client-side objects once per page ──
     Only objects/attributes actually available on the storefront client are
     resolved here; server-resolved customer/cart/product values are mirrored onto
     each module's data-sa-ctx by Liquid and overlaid per-element in gateModules(). */
  var sessionPagesKey = 'superapp:rules:pages';
  var sessionCountKey = 'superapp:rules:sessions';

  function sessionPageCount() {
    var raw = storageGet(window.sessionStorage, sessionPagesKey);
    var n = raw ? parseInt(raw, 10) : 0;
    if (isNaN(n)) n = 0;
    n += 1;
    storageSet(window.sessionStorage, sessionPagesKey, String(n));
    return n;
  }

  function allTimeSessionCount() {
    /* One increment per session: bump the local counter the first time we see a
       page in a given session (guarded by a session flag). */
    var seen = storageGet(window.sessionStorage, sessionCountKey);
    var raw = storageGet(window.localStorage, sessionCountKey);
    var n = raw ? parseInt(raw, 10) : 0;
    if (isNaN(n)) n = 0;
    if (!seen) {
      n += 1;
      storageSet(window.localStorage, sessionCountKey, String(n));
      storageSet(window.sessionStorage, sessionCountKey, '1');
    }
    return n || 1;
  }

  function recentlyViewed() {
    /* Shopify stores recently-viewed product handles in a cookie the theme sets;
       fall back to empty (unresolved-safe: the row simply doesn't constrain). */
    try {
      var m = document.cookie.match(/(?:^|;\s*)recently_viewed=([^;]+)/);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }

  var clientCtxCache = null;
  function clientRuleContext() {
    if (clientCtxCache) return clientCtxCache;
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { params = null; }
    function q(k) { return params ? (params.get(k) || '') : ''; }
    var now = new Date();
    clientCtxCache = {
      'geo.countryCode': (window.Shopify && window.Shopify.country) || undefined,
      'temporal.dayOfWeek': now.getDay(),
      'temporal.timeOfDay': ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2),
      'behavioral.utmSource': q('utm_source'),
      'behavioral.utmCampaign': q('utm_campaign'),
      'behavioral.referrerContains': document.referrer || '',
      'behavioral.pagesViewedThisSession': sessionPageCount(),
      'behavioral.sessionCount': allTimeSessionCount(),
      'behavioral.recentlyViewedProductId': recentlyViewed()
    };
    return clientCtxCache;
  }

  /* Merge server-mirrored values (data-sa-ctx) UNDER the client context, so the
     client's live values win for behavioral/temporal but server-only
     customer/cart/product values are still available. */
  function mergedContext(el) {
    var values = {};
    var server = {};
    try { server = JSON.parse(el.getAttribute('data-sa-ctx') || '{}'); } catch (e) { server = {}; }
    var k;
    for (k in server) if (Object.prototype.hasOwnProperty.call(server, k)) values[k] = server[k];
    var client = clientRuleContext();
    for (k in client) if (Object.prototype.hasOwnProperty.call(client, k) && client[k] !== undefined) values[k] = client[k];
    return { values: values };
  }

  /* Read the parsed rules JSON off an element, or null. */
  function readRules(el) {
    var raw = el.getAttribute('data-sa-rules');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /* Page-init sweep: reveal/remove every rule-gated module the server deferred. */
  function gateModules() {
    var els = document.querySelectorAll('[data-sa-rules]');
    Array.prototype.forEach.call(els, function (el) {
      var rules = readRules(el);
      if (!rules || !rules.enabled) { el.hidden = false; return; }
      var serverVerdict = el.getAttribute('data-sa-rule-server');
      if (serverVerdict === 'pass') { animateRuleReveal(el); return; } /* server already OK'd */
      /* 'defer' (or missing): the client is authoritative. Popups gate in open(). */
      if (el.classList && el.classList.contains('superapp-popup')) return;
      var res = evaluateRules(rules, mergedContext(el));
      if (res.verdict === 'show') {
        animateRuleReveal(el);
      } else if (el.parentNode) {
        el.parentNode.removeChild(el); /* hide = remove from flow (reserve no space) */
      }
    });
  }

  /* Popup rule gate — used alongside isSuppressed inside open(). */
  function rulesAllowOpen(el) {
    var rules = readRules(el);
    if (!rules || !rules.enabled) return true;
    if (el.getAttribute('data-sa-rule-server') === 'pass') return true;
    return evaluateRules(rules, mergedContext(el)).verdict === 'show';
  }

  /* ── popup engine ── */
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function setupPopup(popup) {
    if (popup.dataset.superappPopupBound) return;
    popup.dataset.superappPopupBound = '1';

    var id = popup.getAttribute('data-module-id') || '';
    var trigger = (popup.getAttribute('data-trigger') || 'ON_LOAD').toUpperCase();
    var frequency = (popup.getAttribute('data-frequency') || 'ONCE_PER_SESSION').toUpperCase();
    var delaySeconds = parseFloat(popup.getAttribute('data-delay-seconds'));
    if (isNaN(delaySeconds) || delaySeconds < 0) delaySeconds = 0;
    var autoCloseSeconds = parseFloat(popup.getAttribute('data-auto-close-seconds'));
    if (isNaN(autoCloseSeconds) || autoCloseSeconds < 0) autoCloseSeconds = 0;

    var panel = popup.querySelector('.superapp-popup__panel');
    var isOpen = false;
    var lastFocused = null;
    var timers = [];

    function later(fn, ms) { timers.push(window.setTimeout(fn, ms)); }
    function clearTimers() { while (timers.length) window.clearTimeout(timers.pop()); }

    function onKeydown(e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab' && panel) {
        var nodes = panel.querySelectorAll(FOCUSABLE);
        if (!nodes.length) { e.preventDefault(); return; }
        var first = nodes[0];
        var last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }

    function open() {
      if (isOpen || isSuppressed(id, frequency) || !rulesAllowOpen(popup)) return;
      isOpen = true;
      clearTimers();
      markShown(id, frequency);
      lastFocused = document.activeElement;
      popup.hidden = false;
      /* flush styles so the (cancelable, non-blocking) entrance transition runs */
      void popup.offsetWidth; // eslint-disable-line no-void
      popup.classList.add('is-open');
      var target = popup.querySelector('.superapp-popup__close') || panel;
      if (target && target.focus) {
        try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
      }
      document.addEventListener('keydown', onKeydown, true);
      if (autoCloseSeconds > 0) later(close, autoCloseSeconds * 1000);
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      clearTimers();
      document.removeEventListener('keydown', onKeydown, true);
      popup.classList.remove('is-open');
      var finish = function () { popup.classList.remove('is-closing'); popup.hidden = true; };
      if (reducedMotion) finish();
      else { popup.classList.add('is-closing'); window.setTimeout(finish, 180); }
      if (lastFocused && lastFocused.focus) {
        try { lastFocused.focus({ preventScroll: true }); } catch (e) { /* noop */ }
      }
      lastFocused = null;
    }

    popup.addEventListener('click', function (e) {
      var closer = e.target.closest ? e.target.closest('[data-superapp-close]') : null;
      if (closer && popup.contains(closer)) { e.preventDefault(); close(); }
    });

    if (isSuppressed(id, frequency)) return;

    if (trigger === 'TIMED') {
      later(open, delaySeconds * 1000);
    } else if (trigger === 'ON_EXIT_INTENT') {
      /* Pointer leaves through the top of the viewport (desktop only). */
      var onExit = function (e) {
        if (e.relatedTarget) return;
        if (e.clientY > 8) return;
        document.removeEventListener('mouseout', onExit);
        open();
      };
      document.addEventListener('mouseout', onExit);
    } else if (trigger === 'ON_SCROLL_25' || trigger === 'ON_SCROLL_50' || trigger === 'ON_SCROLL_75') {
      var pct = parseInt(trigger.slice('ON_SCROLL_'.length), 10);
      var onScroll = function () {
        var doc = document.documentElement;
        var max = doc.scrollHeight - window.innerHeight;
        if (max <= 0) return;
        var scrolled = ((window.scrollY || doc.scrollTop || 0) / max) * 100;
        if (scrolled >= pct) {
          window.removeEventListener('scroll', onScroll);
          open();
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    } else if (trigger === 'ON_CLICK') {
      /* Opens from any element carrying data-superapp-open="<module id>". */
      document.addEventListener('click', function (e) {
        var opener = e.target.closest ? e.target.closest('[data-superapp-open]') : null;
        if (!opener) return;
        var want = opener.getAttribute('data-superapp-open');
        if (want && want !== id) return;
        e.preventDefault();
        open();
      });
    } else {
      /* ON_LOAD (default): open shortly after load without blocking first paint. */
      later(open, delaySeconds > 0 ? delaySeconds * 1000 : 400);
    }
  }

  /* ── app-proxy contact form fetch submission ── */
  function setStatus(status, kind, text) {
    if (!status) return;
    status.classList.remove('superapp-contact__status--success', 'superapp-contact__status--error');
    if (!kind) { status.hidden = true; status.textContent = ''; return; }
    /* icon + text, never color alone (DESIGN.md F5/F8) */
    status.textContent = (kind === 'success' ? '✓ ' : '⚠ ') + text;
    status.classList.add('superapp-contact__status--' + kind);
    status.hidden = false;
  }

  function setupProxyForm(form) {
    if (form.dataset.superappFormBound) return;
    form.dataset.superappFormBound = '1';

    var status = form.querySelector('[data-superapp-form-status]');
    var successMessage = form.getAttribute('data-success-message') || 'Your message was submitted.';
    var errorMessage = form.getAttribute('data-error-message') || 'Something went wrong. Please try again.';

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn && submitBtn.disabled) return;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.classList.add('is-loading'); }
      setStatus(status, null, '');

      fetch(form.getAttribute('action'), {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (json) {
            if (!res.ok || (json && json.error)) {
              throw new Error((json && json.error) || ('Request failed (' + res.status + ')'));
            }
          });
        })
        .then(function () {
          setStatus(status, 'success', successMessage);
          form.reset();
        })
        .catch(function () {
          setStatus(status, 'error', errorMessage);
        })
        .then(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.classList.remove('is-loading'); }
        });
    });
  }

  /* ── gamified popup: spin-to-win wheel + scratch card ────────────────────────
     Feature-gated in Liquid on blocks kind:'slice' / kind:'scratch'. All coupon
     codes are merchant-configured (read from the DOM data attributes Liquid wrote);
     nothing is fabricated. A slice with an empty code — or a lose-ish label — is an
     honest no-prize. Reduced-motion → no spin / no scratch-erase, instant reveal. */

  /* The two PURE game functions (winner pick + no-prize detection) are pinned to a
     node-side test by an extraction PARITY test, exactly like the rule-engine
     evaluator above: the test slices the whole-code region strictly between the
     single-line BEGIN/END markers and runs the shared fixtures through it. If you
     change either function, the test re-derives from THIS source — no second copy. */
  /* SPIN-GAME-LOGIC:BEGIN (parity marker — keep on its own line) */
  /* Lose-ish labels signal a no-prize slice even if a (stray) code is present. */
  var LOSE_RE = /\b(no luck|try again|better luck|no win|no prize|sorry|not this time)\b/i;

  /* A slice/card is a no-prize when it has no code, or its label reads lose-ish. */
  function isNoPrize(code, label) {
    if (code && String(code).trim() !== '') return LOSE_RE.test(String(label || ''));
    return true;
  }

  /* Pure winner selection — weighted random over the slice list. `rand` is an
     injectable [0,1) source (defaults to Math.random) for deterministic tests.
     Returns the chosen index. Non-positive / NaN weights are treated as 0; an
     all-zero (or empty-weight) set falls back to a uniform pick. */
  function pickWeightedIndex(weights, rand) {
    var r = typeof rand === 'function' ? rand : Math.random;
    var n = weights ? weights.length : 0;
    if (n === 0) return -1;
    var norm = [];
    var total = 0;
    for (var i = 0; i < n; i++) {
      var w = Number(weights[i]);
      if (isNaN(w) || w < 0) w = 0;
      norm.push(w);
      total += w;
    }
    if (total <= 0) return Math.floor(r() * n) % n; /* uniform fallback */
    var target = r() * total;
    var acc = 0;
    for (var j = 0; j < n; j++) {
      acc += norm[j];
      if (target < acc) return j;
    }
    return n - 1; /* float-rounding safety */
  }
  /* ══ SPIN-GAME-LOGIC:END ══════════════════════════════════════════════════ */

  /* Copy-to-clipboard with a graceful execCommand fallback; toggles the button. */
  function copyCode(code, btn) {
    function done() {
      if (!btn) return;
      var prev = btn.getAttribute('data-label') || btn.textContent;
      btn.setAttribute('data-label', prev);
      btn.textContent = 'Copied ✓';
      window.setTimeout(function () { btn.textContent = prev; }, 1800);
    }
    if (window.navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, function () { legacyCopy(code); done(); });
    } else {
      legacyCopy(code);
      done();
    }
  }
  function legacyCopy(code) {
    try {
      var ta = document.createElement('textarea');
      ta.value = code;
      ta.setAttribute('readonly', '');
      ta.style.position = 'absolute';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { /* noop — reveal still shows the code to copy manually */ }
  }

  /* Render the shared coupon result (win or honest no-prize) and move focus to it. */
  function revealCoupon(resultEl, code, label) {
    if (!resultEl) return;
    var noPrize = isNoPrize(code, label);
    var html;
    if (noPrize) {
      html =
        '<div class="superapp-coupon superapp-coupon--lose">' +
        '<p class="superapp-coupon__headline">— ' + escapeHtml(label || 'No prize this time') + '</p>' +
        '<span class="superapp-coupon__code">Better luck next time</span>' +
        '</div>';
    } else {
      var c = String(code);
      html =
        '<div class="superapp-coupon">' +
        '<p class="superapp-coupon__headline">✓ ' + escapeHtml(label || 'You won') + '</p>' +
        '<span class="superapp-coupon__code" data-superapp-code>' + escapeHtml(c) + '</span>' +
        '<button class="superapp-coupon__copy" type="button" data-superapp-copy>Copy code</button>' +
        '</div>';
    }
    resultEl.innerHTML = html;
    resultEl.hidden = false;
    if (!noPrize) {
      var copyBtn = resultEl.querySelector('[data-superapp-copy]');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () { copyCode(String(code), copyBtn); });
      }
    }
    /* focus management: move focus to the result on state change (aria-live announces it) */
    var focusTarget = resultEl.querySelector('[data-superapp-copy]') || resultEl.querySelector('.superapp-coupon__headline');
    if (focusTarget) {
      if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
      try { focusTarget.focus({ preventScroll: true }); } catch (e) { focusTarget.focus(); }
    }
  }

  /* Optional email gate: reuse the app-proxy capture path. Best-effort — the
     merchant captures the email, but a flaky network never traps the visitor
     behind the prize (advance on completion, success or fail). */
  function bindGate(gameEl, onPass) {
    var gate = gameEl.querySelector('[data-superapp-gate]');
    if (!gate) { onPass(); return; }
    var status = gate.querySelector('[data-superapp-gate-status]');
    var stage = gameEl.querySelector('.superapp-game__stage');
    function advance() {
      gate.hidden = true;
      if (stage) stage.hidden = false;
      onPass();
    }
    gate.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!gate.checkValidity || gate.checkValidity()) {
        var btn = gate.querySelector('[type="submit"]');
        if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
        var action = gate.getAttribute('action');
        var doAdvance = function () { advance(); };
        if (action) {
          fetch(action, { method: 'POST', body: new FormData(gate), headers: { Accept: 'application/json' }, credentials: 'same-origin' })
            .then(doAdvance, doAdvance);
        } else {
          doAdvance();
        }
      } else if (gate.reportValidity) {
        gate.reportValidity();
      }
      if (status) { status.hidden = true; }
    });
  }

  function setupWheel(gameEl) {
    if (gameEl.dataset.superappGameBound) return;
    gameEl.dataset.superappGameBound = '1';
    var wheel = gameEl.querySelector('[data-superapp-wheel]');
    var dial = gameEl.querySelector('[data-superapp-wheel-dial]');
    var spinBtn = gameEl.querySelector('[data-superapp-wheel-spin]');
    var result = gameEl.querySelector('[data-superapp-result]');
    var labels = gameEl.querySelectorAll('[data-superapp-slice]');
    if (!wheel || !dial || !spinBtn || labels.length === 0) return;

    var slices = [];
    Array.prototype.forEach.call(labels, function (el) {
      slices.push({
        code: el.getAttribute('data-code') || '',
        label: el.getAttribute('data-label') || '',
        weight: el.getAttribute('data-weight'),
      });
    });
    var n = slices.length;
    var seg = 360 / n;
    var spun = false;

    bindGate(gameEl, function () { if (spinBtn.focus) try { spinBtn.focus({ preventScroll: true }); } catch (e) { spinBtn.focus(); } });

    function finish(idx) {
      revealCoupon(result, slices[idx].code, slices[idx].label);
      spinBtn.disabled = true;
    }

    spinBtn.addEventListener('click', function () {
      if (spun) return;
      spun = true;
      var idx = pickWeightedIndex(slices.map(function (s) { return s.weight; }));
      if (idx < 0) idx = 0;

      if (reducedMotion) { finish(idx); return; }

      /* Bring the chosen slice's center under the top pointer: rotate so that
         (idx*seg + seg/2) sits at 0deg, plus several full turns. A small jitter
         within the slice keeps repeat spins from looking identical. */
      var jitter = (Math.random() - 0.5) * seg * 0.6;
      var target = 360 * 5 - (idx * seg + seg / 2) + jitter;
      wheel.classList.add('is-spinning');
      dial.style.transform = 'rotate(' + target + 'deg)';
      var settled = false;
      var onEnd = function () {
        if (settled) return;
        settled = true;
        wheel.classList.remove('is-spinning');
        finish(idx);
      };
      dial.addEventListener('transitionend', onEnd, { once: true });
      /* fallback if transitionend never fires (e.g. tab backgrounded) */
      window.setTimeout(onEnd, 4600);
    });
  }

  function setupScratch(gameEl) {
    if (gameEl.dataset.superappGameBound) return;
    gameEl.dataset.superappGameBound = '1';
    var scratch = gameEl.querySelector('[data-superapp-scratch]');
    var canvas = gameEl.querySelector('[data-superapp-scratch-canvas]');
    var revealBtn = gameEl.querySelector('[data-superapp-scratch-reveal]');
    var result = gameEl.querySelector('[data-superapp-result]');
    if (!scratch) return;
    var code = scratch.getAttribute('data-code') || '';
    var label = scratch.getAttribute('data-label') || '';
    var done = false;

    function reveal() {
      if (done) return;
      done = true;
      scratch.classList.add('is-cleared');
      if (canvas) canvas.classList.add('is-cleared');
      revealCoupon(result, code, label);
    }

    bindGate(gameEl, function () { initScratchSurface(); });

    var ctx = null;
    function initScratchSurface() {
      /* Reduced-motion or no canvas support → tap-to-reveal button. */
      var supported = canvas && canvas.getContext && !reducedMotion;
      if (!supported) {
        scratch.classList.add('superapp-scratch--tap');
        if (revealBtn) revealBtn.addEventListener('click', reveal);
        return;
      }
      if (revealBtn) revealBtn.addEventListener('click', reveal); /* keyboard-accessible path */
      /* The canvas lives inside a popup that may be display:none until opened, so
         it has no size yet. Paint (and repaint) the moment it first gets a box. */
      var painted = false;
      function paint() {
        if (painted) return;
        var rect = canvas.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;
        painted = true;
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#b9bcc4';
        ctx.fillRect(0, 0, rect.width, rect.height);
        ctx.font = '600 13px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#5c6070';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Scratch here', rect.width / 2, rect.height / 2);
        ctx.globalCompositeOperation = 'destination-out';
      }
      paint();
      if (!painted && typeof window.ResizeObserver === 'function') {
        var ro = new window.ResizeObserver(function () { paint(); if (painted) ro.disconnect(); });
        ro.observe(canvas);
      }

      var drawing = false;
      function erodeAt(x, y) {
        if (!ctx) return;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
      }
      function pos(e) {
        var rect = canvas.getBoundingClientRect();
        var pt = (e.touches && e.touches[0]) || e;
        return { x: pt.clientX - rect.left, y: pt.clientY - rect.top };
      }
      function clearedRatio() {
        if (!ctx) return 0;
        try {
          var img = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          var clear = 0;
          var step = 40; /* sample every 10th pixel (RGBA*10) for speed */
          for (var i = 3; i < img.length; i += step) if (img[i] === 0) clear++;
          return clear / (img.length / step);
        } catch (e) { return 0; }
      }
      function onMove(e) {
        if (!drawing) return;
        e.preventDefault();
        var p = pos(e);
        erodeAt(p.x, p.y);
      }
      function onUp() {
        drawing = false;
        if (clearedRatio() >= 0.5) reveal();
      }
      function onDown(e) {
        if (done) return;
        drawing = true;
        var p = pos(e);
        erodeAt(p.x, p.y);
      }
      canvas.addEventListener('mousedown', onDown);
      canvas.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      canvas.addEventListener('touchstart', onDown, { passive: false });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onUp);
    }

    /* If ungated, bindGate calls initScratchSurface immediately (no gate present). */
  }

  function initGames() {
    var wheels = document.querySelectorAll('[data-superapp-game="wheel"]');
    Array.prototype.forEach.call(wheels, setupWheel);
    var scratches = document.querySelectorAll('[data-superapp-game="scratch"]');
    Array.prototype.forEach.call(scratches, setupScratch);
  }

  /* ── V-A A1: volume/quantity-break tiers ─────────────────────────────────────
     Selecting a tier row sets the product's quantity input (input[name=quantity])
     so Add-to-cart uses the chosen bundle quantity. Feature-gated + graceful:
     if the page has no quantity input (e.g. a marketing page), it's a no-op. */
  function setQuantityInput(qty) {
    if (!qty || qty < 1) return;
    var input = document.querySelector('input[name="quantity"]');
    if (!input) return; /* graceful no-op when no product quantity input on the page */
    input.value = String(qty);
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) { /* older browsers: value set still applies at ATC */ }
  }
  function setupVolumeTiers(group) {
    var radios = group.querySelectorAll('[data-superapp-tier]');
    Array.prototype.forEach.call(radios, function (radio) {
      radio.addEventListener('change', function () {
        if (radio.checked) setQuantityInput(parseInt(radio.getAttribute('data-quantity'), 10));
      });
    });
    /* Reflect the pre-checked (highlighted) tier into the quantity input on load. */
    var checked = group.querySelector('[data-superapp-tier]:checked');
    if (checked) setQuantityInput(parseInt(checked.getAttribute('data-quantity'), 10));
  }
  function initVolumeTiers() {
    var groups = document.querySelectorAll('[data-superapp-vtiers]');
    Array.prototype.forEach.call(groups, setupVolumeTiers);
  }

  /* ── R2.3: product recommendations resolver ──────────────────────────────────
     Third responsibility alongside popup + contact-form. Resolves DYNAMIC and
     cart-derived strategies (static ones already rendered inline by Liquid) and
     applies the configured `fallback` so a slot never stays empty.
     - related/complementary  → native /recommendations/products.json (service-free)
     - most/cheapest-in-cart  → /cart.js (service-free)
     - recently-viewed        → localStorage (service-free)
     - top-sellers/trending/buy-it-again → App Proxy /apps/superapp/recommend
       (returns [] today; JS then applies `fallback`). */
  function recCardHtml(p) {
    var url = p && p.url ? String(p.url) : '#';
    var title = p && (p.title || p.name) ? String(p.title || p.name) : '';
    var img = '';
    if (p && p.featured_image) img = String(p.featured_image);
    else if (p && p.image) img = String(p.image);
    else if (p && p.featuredImage) img = String(p.featuredImage);
    var price = p && p.price != null ? String(p.price) : '';
    return (
      '<li class="superapp-recs__card"><a class="superapp-recs__link" href="' + escapeAttr(safeUrl(url)) + '">' +
      (img ? '<img class="superapp-recs__img" src="' + escapeAttr(safeUrl(img)) + '" alt="" loading="lazy" width="150" height="150">' : '') +
      '<span class="superapp-recs__name">' + escapeHtml(title) + '</span>' +
      (price ? '<span class="superapp-recs__price">' + escapeHtml(price) + '</span>' : '') +
      '</a></li>'
    );
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }
  // Blank dangerous URL schemes before a value becomes a clickable href/src —
  // escapeAttr closes quotes but not schemes. Defends the app-proxy data boundary.
  function safeUrl(s) {
    var v = String(s == null ? '' : s);
    return /^\s*(javascript|data|vbscript):/i.test(v) ? '' : v;
  }

  function renderRecs(root, products, limit) {
    var list = (products || []).slice(0, limit);
    if (list.length === 0) return false;
    var html = '<ul class="superapp-recs__grid" role="list">';
    for (var i = 0; i < list.length; i++) html += recCardHtml(list[i]);
    html += '</ul>';
    var skeleton = root.querySelector('.superapp-recs__skeleton');
    if (skeleton && skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
    root.insertAdjacentHTML('beforeend', html);
    root.className = root.className.replace(/\s*superapp-recs--pending/, '');
    return true;
  }

  function initRecs(root) {
    if (root.getAttribute('data-superapp-recs-bound')) return;
    root.setAttribute('data-superapp-recs-bound', '1');
    var strat = root.getAttribute('data-strategy') || 'related';
    var limit = parseInt(root.getAttribute('data-limit') || '4', 10);
    if (isNaN(limit) || limit < 1) limit = 4;
    var fallback = root.getAttribute('data-fallback') || 'related';
    var seed = root.getAttribute('data-seed-product') || '';

    function done(products) {
      if (!renderRecs(root, products, limit)) resolveFallback();
    }
    function resolveFallback() {
      if (fallback === 'hide') { if (root.parentNode) root.parentNode.removeChild(root); return; }
      if (fallback === strat) { if (root.parentNode) root.parentNode.removeChild(root); return; } // avoid loop
      root.setAttribute('data-strategy', fallback);
      root.removeAttribute('data-superapp-recs-bound');
      initRecs(root);
    }

    /* native, service-free intents */
    if (strat === 'related' || strat === 'complementary') {
      if (!seed) return resolveFallback();
      var intent = strat === 'complementary' ? 'complementary' : 'related';
      return fetch('/recommendations/products.json?product_id=' + encodeURIComponent(seed) + '&limit=' + limit + '&intent=' + intent)
        .then(function (r) { return r.json(); })
        .then(function (j) { done(j && j.products ? j.products : []); })
        .catch(resolveFallback);
    }
    if (strat === 'most-expensive-in-cart' || strat === 'cheapest-in-cart') {
      return fetch('/cart.js')
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          var items = (cart && cart.items) ? cart.items.slice() : [];
          if (items.length === 0) return resolveFallback();
          items.sort(function (a, b) { return (a.price || 0) - (b.price || 0); });
          var pick = strat === 'most-expensive-in-cart' ? items[items.length - 1] : items[0];
          done([{ url: pick.url, title: pick.product_title || pick.title, image: pick.image, price: (pick.price / 100).toFixed(2) }]);
        })
        .catch(resolveFallback);
    }
    if (strat === 'recently-viewed') {
      var raw = storageGet(window.localStorage, 'superapp:recently-viewed');
      var ids = [];
      try { ids = raw ? JSON.parse(raw) : []; } catch (e) { ids = []; }
      if (!ids || ids.length === 0) return resolveFallback();
      // No product bodies stored — degrade to fallback (client can't hydrate ids alone).
      return resolveFallback();
    }

    /* DYNAMIC — App Proxy (returns [] today → fallback) */
    return fetch('/apps/superapp/recommend?strategy=' + encodeURIComponent(strat) + '&limit=' + limit + '&module_id=' + encodeURIComponent(root.getAttribute('data-module-id') || '') + (seed ? '&seed=' + encodeURIComponent(seed) : ''))
      .then(function (r) { if (!r.ok) throw new Error('recs proxy ' + r.status); return r.json(); })
      .then(function (j) { done(j && j.products ? j.products : []); })
      .catch(resolveFallback);
  }

  /* ── F4 / §7.3 scroll reveal ──────────────────────────────────────────────
     Liquid stamps `sa-reveal` on module roots; we add `is-inview` when they
     enter the viewport and CSS animates the entrance. One shared observer.
     Reduced-motion or no IntersectionObserver → reveal everything immediately
     (no motion). Per-child stagger index is set on grid children so CSS can
     offset each item's delay via --sa-stagger-i. */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function initScrollReveal() {
    /* stagger: expose the direct-child index on grid containers */
    var grids = document.querySelectorAll('.superapp-section__blocks, .superapp-recs__grid');
    Array.prototype.forEach.call(grids, function (grid) {
      var kids = grid.children;
      for (var i = 0; i < kids.length; i++) kids[i].style.setProperty('--sa-stagger-i', String(i));
    });

    var els = document.querySelectorAll('.sa-reveal');
    if (reducedMotion || typeof window.IntersectionObserver !== 'function') {
      Array.prototype.forEach.call(els, function (el) { el.classList.add('is-inview'); });
      return;
    }
    var io = new window.IntersectionObserver(function (entries, obs) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          entries[i].target.classList.add('is-inview');
          obs.unobserve(entries[i].target);
        }
      }
    }, { threshold: 0.25 });
    Array.prototype.forEach.call(els, function (el) {
      if (el.classList.contains('is-inview')) return; /* rule-reveal already played it */
      io.observe(el);
    });
  }

  /* Animated rule-reveal: un-hide a rule-gated module, then play the F4 entrance
     by adding `sa-reveal` + `is-inview` across a reflow so the transition runs.
     Reduced-motion → just un-hide (no animation). */
  function animateRuleReveal(el) {
    el.hidden = false;
    if (reducedMotion) return;
    el.classList.add('sa-reveal');
    void el.offsetWidth; /* force reflow so the resting (hidden) state commits */
    window.requestAnimationFrame(function () { el.classList.add('is-inview'); });
  }

  /* ── §6 effect runtime ─────────────────────────────────────────────────────
     Toggle the play state of an effect overlay + its particles. Bulletproof:
     we set --sa-play + data-effect-state for CSS, AND write animationPlayState
     directly on the overlay and every particle so it works with no CSS support. */
  function setEffectPlay(overlay, running) {
    if (!overlay) return;
    var play = running ? 'running' : 'paused';
    overlay.style.setProperty('--sa-play', play);
    overlay.setAttribute('data-effect-state', running ? 'running' : 'idle');
    try { overlay.style.animationPlayState = play; } catch (e) { /* noop */ }
    var particles = overlay.querySelectorAll('.superapp-effect__particle');
    for (var i = 0; i < particles.length; i++) {
      try { particles[i].style.animationPlayState = play; } catch (e2) { /* noop */ }
    }
  }

  /* Fire cb once when el first enters the viewport (fallback: fire immediately). */
  function observeOnce(el, cb) {
    if (typeof window.IntersectionObserver !== 'function') { cb(); return; }
    var io = new window.IntersectionObserver(function (entries, obs) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { obs.disconnect(); cb(); return; }
      }
    }, { threshold: 0.01 });
    io.observe(el);
  }

  function effectOverlay(root) {
    return root.querySelector('.superapp-effect__overlay') || root;
  }

  function initEffects() {
    var roots = document.querySelectorAll('.superapp-effect--embed');
    Array.prototype.forEach.call(roots, function (root) {
      if (root.getAttribute('data-superapp-effect-bound')) return;
      root.setAttribute('data-superapp-effect-bound', '1');
      /* Reduced-motion: do nothing — CSS already hides particles. */
      if (reducedMotion) return;

      var trigger = (root.getAttribute('data-trigger') || 'page_load').toLowerCase();
      /* page_load (default) → leave as-is; CSS runs the animation. */
      if (trigger === 'page_load') return;

      var overlay = effectOverlay(root);
      var started = false;
      function start(loops) {
        if (started) return;
        started = true;
        if (loops) overlay.style.setProperty('--sa-loops', String(loops));
        setEffectPlay(overlay, true);
      }

      /* All non-page_load triggers begin paused. */
      setEffectPlay(overlay, false);

      if (trigger === 'on_scroll') {
        observeOnce(root, function () { start(0); });
      } else if (trigger === 'timed') {
        var delay = parseFloat(root.getAttribute('data-delay-seconds'));
        if (isNaN(delay) || delay < 0) delay = 5;
        window.setTimeout(function () { start(0); }, delay * 1000);
      } else if (trigger === 'on_click') {
        var onClick = function () {
          document.removeEventListener('click', onClick, true);
          start(3); /* auto-stop after 3 loops (CSS reads --sa-loops) */
        };
        document.addEventListener('click', onClick, true);
      } else {
        /* unknown trigger → behave like page_load */
        start(0);
      }
    });
  }

  /* §7.4 celebration hook: on a `superapp:celebrate` event, replay any confetti
     / embers effect overlay for a short burst (--sa-loops:2). No cart wiring. */
  function onCelebrate() {
    if (reducedMotion) return;
    var roots = document.querySelectorAll('.superapp-effect--embed');
    Array.prototype.forEach.call(roots, function (root) {
      var overlay = effectOverlay(root);
      var cls = (overlay.className || '') + ' ' + (root.className || '');
      if (cls.indexOf('superapp-effect--confetti') === -1 &&
          cls.indexOf('superapp-effect--embers') === -1) return;
      overlay.style.setProperty('--sa-loops', '2');
      setEffectPlay(overlay, true);
    });
  }

  /* ── countdown ticker ──────────────────────────────────────────────────────
     Fill + tick every [data-sa-countdown]. Invalid/past → leave hidden. Else
     unhide and render compact `2d 04:31:22` (days dropped at 0); at zero render
     00:00:00 and stop. Intervals are cleaned up on pagehide. */
  var countdownTimers = [];

  function initCountdowns() {
    var els = document.querySelectorAll('[data-sa-countdown]');
    Array.prototype.forEach.call(els, function (el) {
      if (el.getAttribute('data-sa-countdown-bound')) return;
      el.setAttribute('data-sa-countdown-bound', '1');
      var target = Date.parse(el.getAttribute('data-sa-countdown') || '');
      if (isNaN(target) || target - Date.now() <= 0) return; /* invalid / past → hidden */

      function render() {
        var diff = target - Date.now();
        if (diff <= 0) {
          el.textContent = '00:00:00';
          window.clearInterval(id);
          var idx = countdownTimers.indexOf(id);
          if (idx !== -1) countdownTimers.splice(idx, 1);
          return;
        }
        var total = Math.floor(diff / 1000);
        var days = Math.floor(total / 86400);
        var hms = pad2(Math.floor((total % 86400) / 3600)) + ':' +
                  pad2(Math.floor((total % 3600) / 60)) + ':' + pad2(total % 60);
        el.textContent = days > 0 ? (days + 'd ' + hms) : hms;
      }

      el.hidden = false;
      var id = window.setInterval(render, 1000);
      countdownTimers.push(id);
      render();
    });
  }

  window.addEventListener('pagehide', function () {
    for (var i = 0; i < countdownTimers.length; i++) window.clearInterval(countdownTimers[i]);
    countdownTimers.length = 0;
  });

  ready(function () {
    /* R2.1: resolve display rules first — reveal/remove deferred non-popup modules,
       and let the popup engine consult the same rules in open(). */
    gateModules();
    var popups = document.querySelectorAll('.superapp-popup[data-module-id]');
    Array.prototype.forEach.call(popups, setupPopup);
    var forms = document.querySelectorAll('form[data-superapp-proxy-form]');
    Array.prototype.forEach.call(forms, setupProxyForm);
    /* Gamified popups: spin-to-win wheel + scratch card. */
    initGames();
    /* V-A A1: volume/quantity-break tier selection → product quantity input. */
    initVolumeTiers();
    /* R2.3: resolve dynamic / cart-derived recommendation mounts. */
    var recs = document.querySelectorAll('[data-superapp-recs]');
    Array.prototype.forEach.call(recs, initRecs);
    /* Two-pack runtime: F4 scroll reveal, §6 effect triggers, countdown ticker. */
    initScrollReveal();
    initEffects();
    initCountdowns();
    document.addEventListener('superapp:celebrate', onCelebrate);
  });
})();
