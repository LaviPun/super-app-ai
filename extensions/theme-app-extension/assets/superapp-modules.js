/* SuperApp theme extension runtime (vanilla JS, no dependencies).
   Loaded once per page via each block's schema "javascript" attribute.

   1. Popup engine — opens .superapp-popup overlays per their configured
      trigger (ON_LOAD | TIMED | ON_EXIT_INTENT | ON_SCROLL_25/50/75 | ON_CLICK),
      closes on close button / scrim click / Escape, manages focus, honors
      prefers-reduced-motion, and suppresses re-shows per module id via
      local/session storage according to the configured frequency
      (EVERY_VISIT | ONCE_PER_SESSION | ONCE_PER_DAY | ONCE_PER_WEEK | ONCE_EVER).
   2. App-proxy contact forms — submits form[data-superapp-proxy-form] via
      fetch() and shows an inline success/error status instead of navigating
      the buyer to the proxy's raw JSON response. */
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
      if (isOpen || isSuppressed(id, frequency)) return;
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
      /* Pointer leaves through the top of the viewport (desktop only; touch
         devices have no exit intent, so the popup intentionally never fires). */
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
    var popups = document.querySelectorAll('.superapp-popup[data-module-id]');
    Array.prototype.forEach.call(popups, setupPopup);
    var forms = document.querySelectorAll('form[data-superapp-proxy-form]');
    Array.prototype.forEach.call(forms, setupProxyForm);
  });
})();
