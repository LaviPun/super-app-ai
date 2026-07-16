import { json } from '@remix-run/node';
import { shopify } from '~/shopify.server';
import { withApiLogging } from '~/services/observability/api-log.service';

const PROXY_WIDGET_QUERY = `#graphql
  query ReadProxyWidget($handle: MetaobjectHandleInput!) {
    metaobjectByHandle(handle: $handle) {
      configJson: field(key: "config_json") { value }
      styleCss:   field(key: "style_css")   { value }
    }
  }
`;

export async function loader({ request, params }: { request: Request; params: { widgetId?: string } }) {
  const { widgetId } = params;
  return withApiLogging(
    { actor: 'APP_PROXY', method: 'GET', path: `/proxy/${widgetId ?? ''}` },
    async () => {
      if (!widgetId) return json({ error: 'Missing widgetId' }, { status: 400 });

      const { admin: adminMaybe } = await shopify.authenticate.public.appProxy(request);
      if (!adminMaybe) return json({ error: 'Admin context unavailable' }, { status: 503 });
      const admin = adminMaybe;

      const res = await admin.graphql(PROXY_WIDGET_QUERY, {
        variables: { handle: { type: '$app:superapp_proxy_widget', handle: `superapp-proxy-${widgetId}` } },
      });
      const data = await res.json();
      const obj = data?.data?.metaobjectByHandle;
      if (!obj) return new Response('', { status: 204 });

      type WidgetConfig = {
        mode?: 'JSON' | 'HTML';
        title?: string;
        message?: string;
        /** 'embed' (default) → an inline fragment the theme wraps; 'full_page' →
         *  a standalone routed page rendered WITHOUT the theme layout (layout:false). */
        surface?: 'embed' | 'full_page';
        /** V-B B6 product-finder quiz (only rendered when surface: 'full_page'). */
        quiz?: Quiz;
      };
      // Malformed stored config must not 500 the storefront — fall back to empty.
      let cfg: WidgetConfig;
      try {
        cfg = JSON.parse(obj.configJson?.value ?? '{}') as WidgetConfig;
      } catch {
        cfg = {};
      }
      const styleCss: string = obj.styleCss?.value ?? '';

      if (cfg.mode === 'JSON') return json({ title: cfg.title ?? '', message: cfg.message ?? '' });

      const isFullPage = cfg.surface === 'full_page';

      // V-B B6 — product-finder QUIZ. Only meaningful full-page (app-served, so it
      // costs ZERO theme-extension Liquid). The server renders the shell + the first
      // question (SEO/no-JS fallback); the inline script steps through and resolves
      // the outcome client-side. Absent quiz → the classic title/message widget.
      if (isFullPage && cfg.quiz && Array.isArray(cfg.quiz.questions) && cfg.quiz.questions.length >= 2) {
        return new Response(buildQuizPage(cfg.title ?? '', cfg.quiz, styleCss, moduleIdOf(widgetId)), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            // Personalized (client-bucketed) content — do not shared-cache.
            'cache-control': 'private, max-age=0, no-store',
          },
        });
      }

      const widgetMarkup = `
          <div class="superapp-widget">
            <strong>${escapeHtml(cfg.title ?? '')}</strong>
            ${cfg.message ? `<div>${escapeHtml(cfg.message)}</div>` : ''}
          </div>`;

      // Full-page (layout:false) → a complete standalone HTML document served as its
      // own routed store page. Embed (default) → a fragment: a scoped <style> + the
      // widget <div>, which the theme's Liquid layout wraps (NO <html>/<head>/<body>,
      // so it composes into an existing page). This is the real embed/full-page split.
      const html = isFullPage
        ? `
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${escapeHtml(cfg.title ?? '')}</title>
          <style>
            ${styleCss}
            .superapp-widget strong{ display:block; margin-bottom: 6px; }
            .superapp-widget{ max-width: 960px; margin: 0 auto; }
          </style>
        </head>
        <body>${widgetMarkup}
        </body>
        </html>`.trim()
        : `<style>
            ${styleCss}
            .superapp-widget strong{ display:block; margin-bottom: 6px; }
          </style>${widgetMarkup}`.trim();

      return new Response(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=60',
        },
      });
    }
  );
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── V-B B6 product-finder quiz ────────────────────────────────────────────────

export interface QuizOption { label: string; tagHints?: string[] }
export interface QuizQuestion { text: string; options: QuizOption[] }
export interface QuizOutcome { hint: string; heading?: string; collectionHandle?: string; productHandles?: string[] }
export interface QuizFallback { heading?: string; collectionHandle?: string; productHandles?: string[] }
export interface Quiz {
  questions: QuizQuestion[];
  outcomes: QuizOutcome[];
  fallback?: QuizFallback;
  emailGate?: boolean;
}

/**
 * Resolve the winning outcome from the hints a shopper accumulated across their
 * answers. Pure + deterministic: tally each outcome's `hint`, pick the highest
 * count (ties resolve to the FIRST outcome in declared order), and fall back to
 * `fallback` (then the first outcome) when nothing accumulated. Exported so the
 * contract is unit-tested; the inline client script mirrors this exact logic.
 */
export function resolveQuizOutcome(quiz: Quiz, hints: string[]): QuizOutcome | QuizFallback {
  const counts: Record<string, number> = {};
  for (const h of hints) counts[h] = (counts[h] || 0) + 1;
  let best: QuizOutcome | null = null;
  let bestN = 0;
  for (const o of quiz.outcomes) {
    const n = counts[o.hint] || 0;
    if (n > bestN) {
      bestN = n;
      best = o;
    }
  }
  if (best && bestN > 0) return best;
  return quiz.fallback ?? quiz.outcomes[0] ?? {};
}

/** Stable module id for the widget (capture attribution). */
function moduleIdOf(widgetId: string): string {
  return `superapp-proxy-${widgetId}`;
}

/** Serialize an object for safe embedding inside a `<script>` (blocks `</script>` breakouts). */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

/**
 * Standalone full-page quiz document (layout:false, app-served). The server
 * renders the shell + the FIRST question statically (SEO / no-JS floor); the
 * inline script drives stepping, resolves the outcome (mirrors
 * `resolveQuizOutcome`), and renders the outcome's collection / product links.
 * HONEST v1: outcomes resolve to a Shopify collection handle or explicit product
 * handles — live product-card enrichment via the recs resolver is a follow-up.
 */
function buildQuizPage(title: string, quiz: Quiz, styleCss: string, moduleId: string): string {
  const q0 = quiz.questions[0] ?? { text: '', options: [] };
  const firstQuestion = `
    <fieldset class="superapp-quiz__q">
      <legend class="superapp-quiz__qtext">${escapeHtml(q0.text)}</legend>
      <div class="superapp-quiz__options">
        ${(q0.options ?? [])
          .map((o) => `<button class="superapp-quiz__option" type="button" disabled>${escapeHtml(o.label)}</button>`)
          .join('')}
      </div>
    </fieldset>
    <noscript><p class="superapp-quiz__note">This quiz needs JavaScript enabled.</p></noscript>`;

  const script = `
    (function () {
      var QUIZ = ${jsonForScript(quiz)};
      var MODULE_ID = ${jsonForScript(moduleId)};
      var root = document.getElementById('superapp-quiz');
      if (!root) return;
      var step = 0, hints = [];
      function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
      function escA(s){ return esc(s).replace(/"/g,'&quot;'); }
      /* mirrors resolveQuizOutcome() in proxy.$widgetId.tsx */
      function resolve(hs){
        var counts={}; for (var i=0;i<hs.length;i++){ counts[hs[i]]=(counts[hs[i]]||0)+1; }
        var best=null, bestN=0;
        for (var j=0;j<QUIZ.outcomes.length;j++){ var o=QUIZ.outcomes[j]; var n=counts[o.hint]||0; if (n>bestN){ bestN=n; best=o; } }
        if (best && bestN>0) return best;
        return QUIZ.fallback || QUIZ.outcomes[0];
      }
      function progress(){
        var total = QUIZ.questions.length;
        return '<div class="superapp-quiz__progress" aria-hidden="true">Step ' + Math.min(step+1,total) + ' of ' + total + '</div>';
      }
      function renderQuestion(){
        var q = QUIZ.questions[step];
        var opts = (q.options||[]).map(function(o,k){
          return '<button class="superapp-quiz__option" type="button" data-k="'+k+'">'+esc(o.label)+'</button>';
        }).join('');
        root.innerHTML = progress() +
          '<fieldset class="superapp-quiz__q"><legend class="superapp-quiz__qtext">'+esc(q.text)+'</legend>'+
          '<div class="superapp-quiz__options">'+opts+'</div></fieldset>';
        var btns = root.querySelectorAll('.superapp-quiz__option');
        Array.prototype.forEach.call(btns, function(b){
          b.addEventListener('click', function(){
            var opt = q.options[Number(b.getAttribute('data-k'))] || {};
            (opt.tagHints||[]).forEach(function(h){ hints.push(h); });
            step++;
            if (step < QUIZ.questions.length) renderQuestion();
            else if (QUIZ.emailGate) renderGate();
            else renderResult();
          });
        });
        var first = root.querySelector('.superapp-quiz__option');
        if (first) { try { first.focus({ preventScroll: true }); } catch(e){ first.focus(); } }
      }
      function renderGate(){
        root.innerHTML = '<form class="superapp-quiz__gate"><label class="superapp-quiz__field"><span>Enter your email to see your matches</span>'+
          '<input type="email" name="email" required autocomplete="email" placeholder="you@email.com"></label>'+
          '<button class="superapp-quiz__cta" type="submit">See my results</button></form>';
        var form = root.querySelector('.superapp-quiz__gate');
        form.addEventListener('submit', function(e){
          e.preventDefault();
          if (form.checkValidity && !form.checkValidity()){ if (form.reportValidity) form.reportValidity(); return; }
          var email = (form.querySelector('input[name=email]')||{}).value || '';
          fetch('/apps/superapp/capture', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, credentials:'same-origin',
            body: JSON.stringify({ moduleId: MODULE_ID, captureType:'quiz_lead', storeKey:'customer', payload:{ email: email, hints: hints.join(',') } }) }).then(renderResult, renderResult);
        });
      }
      function renderResult(){
        var o = resolve(hints);
        var links = '';
        if (o.collectionHandle) links += '<a class="superapp-quiz__cta" href="/collections/'+escA(o.collectionHandle)+'">See your matches</a>';
        if (o.productHandles && o.productHandles.length){
          links += '<ul class="superapp-quiz__products">' + o.productHandles.map(function(h){
            return '<li><a href="/products/'+escA(h)+'">'+esc(h)+'</a></li>'; }).join('') + '</ul>';
        }
        if (!links) links = '<a class="superapp-quiz__cta" href="/collections/all">Browse the collection</a>';
        root.innerHTML = '<div class="superapp-quiz__result"><h2 class="superapp-quiz__resulth">'+esc(o.heading||'Your recommendation')+'</h2>'+links+'</div>';
      }
      renderQuestion();
    })();`;

  return `
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)}</title>
      <style>
        ${styleCss}
        .superapp-widget{ max-width: 640px; margin: 0 auto; padding: 2rem 1.25rem; }
        .superapp-quiz__progress{ font-size: .8rem; opacity: .7; margin-bottom: 1rem; }
        .superapp-quiz__q{ border: 0; margin: 0; padding: 0; }
        .superapp-quiz__qtext{ font-size: 1.35rem; font-weight: 700; margin-bottom: 1.1rem; padding: 0; }
        .superapp-quiz__options{ display: grid; gap: .6rem; }
        .superapp-quiz__option{ min-height: 48px; padding: .8rem 1rem; font: inherit; text-align: left; cursor: pointer; background: Canvas; color: CanvasText; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 12px; }
        .superapp-quiz__option:hover:not([disabled]){ border-color: var(--sa-accent, CanvasText); }
        .superapp-quiz__option:focus-visible{ outline: 2px solid var(--sa-accent, CanvasText); outline-offset: 2px; }
        .superapp-quiz__option[disabled]{ opacity: .6; cursor: default; }
        .superapp-quiz__field{ display: flex; flex-direction: column; gap: .4rem; margin-bottom: 1rem; }
        .superapp-quiz__field input{ min-height: 48px; padding: .7rem .9rem; font: inherit; font-size: max(16px,1em); border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); border-radius: 12px; }
        .superapp-quiz__cta{ display: inline-block; min-height: 48px; padding: .8rem 1.4rem; font: inherit; font-weight: 600; text-decoration: none; text-align: center; cursor: pointer; background: var(--sa-accent, CanvasText); color: Canvas; border: 0; border-radius: 12px; }
        .superapp-quiz__resulth{ margin: 0 0 1rem; }
        .superapp-quiz__products{ list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: .5rem; }
      </style>
    </head>
    <body>
      <div class="superapp-widget">
        <div id="superapp-quiz" class="superapp-quiz">${firstQuestion}</div>
      </div>
      <script>${script}</script>
    </body>
    </html>`.trim();
}
