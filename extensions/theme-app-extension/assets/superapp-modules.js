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
      if (serverVerdict === 'pass') { el.hidden = false; return; } /* server already OK'd */
      /* 'defer' (or missing): the client is authoritative. Popups gate in open(). */
      if (el.classList && el.classList.contains('superapp-popup')) return;
      var res = evaluateRules(rules, mergedContext(el));
      if (res.verdict === 'show') {
        el.hidden = false;
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

  ready(function () {
    /* R2.1: resolve display rules first — reveal/remove deferred non-popup modules,
       and let the popup engine consult the same rules in open(). */
    gateModules();
    var popups = document.querySelectorAll('.superapp-popup[data-module-id]');
    Array.prototype.forEach.call(popups, setupPopup);
    var forms = document.querySelectorAll('form[data-superapp-proxy-form]');
    Array.prototype.forEach.call(forms, setupProxyForm);
  });
})();
