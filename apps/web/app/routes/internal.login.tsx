import { json, redirect } from '@remix-run/node';
import type { LinksFunction, MetaFunction } from '@remix-run/node';
import { Form, useActionData, useNavigation, useSearchParams } from '@remix-run/react';
import { internalDocumentTitle } from '~/utils/internal-route-meta';

export const meta: MetaFunction = ({ location }) => [
  { title: internalDocumentTitle(location.pathname) },
];

export const links: LinksFunction = () => [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=IBM+Plex+Sans:wght@400;500;600&display=swap',
  },
];
import { useRef, useEffect, useCallback, useState } from 'react';
import { internalSessionStorage, commitInternal } from '~/internal-admin/session.server';

function sanitizeInternalRedirect(rawTo: string): string {
  if (!rawTo) return '/internal';
  if (rawTo.startsWith('//')) return '/internal';
  try {
    const parsed = new URL(rawTo, 'http://internal.local');
    if (parsed.origin !== 'http://internal.local') return '/internal';
    const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return target.startsWith('/internal') ? target : '/internal';
  } catch {
    return '/internal';
  }
}

async function constantTimePasswordEquals(input: string, expected: string): Promise<boolean> {
  const { createHash, timingSafeEqual } = await import('node:crypto');
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(input), hash(expected));
}

export async function action({ request }: { request: Request }) {
  const form = await request.formData();
  const password = String(form.get('password') ?? '');
  const to = sanitizeInternalRedirect(String(form.get('to') ?? '/internal'));

  const expected = process.env.INTERNAL_ADMIN_PASSWORD;
  if (!expected) return json({ error: 'Internal admin not configured' }, { status: 500 });

  if (!(await constantTimePasswordEquals(password, expected))) {
    return json({ error: 'Invalid password' }, { status: 401 });
  }

  const session = await internalSessionStorage.getSession(request.headers.get('cookie'));
  session.set('internal_admin', true);
  return redirect(to, { headers: { 'Set-Cookie': await commitInternal(session) } });
}

const NODE_COUNT = 80;
const CONNECT_DISTANCE = 140;
const POINTER_DISTANCE = 200;
const PULSE_SPEED = 0.0008;
const DRIFT = 0.2;

function useNeuralCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<{ x: number; y: number; vx: number; vy: number; phase: number }[]>([]);
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const rafRef = useRef<number>(0);

  const initNodes = useCallback((w: number, h: number) => {
    const nodes = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * DRIFT,
        vy: (Math.random() - 0.5) * DRIFT,
        phase: Math.random() * Math.PI * 2,
      });
    }
    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
      if (nodesRef.current.length === 0) initNodes(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY, active: true };
    };
    const onPointerLeave = () => {
      pointerRef.current.active = false;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerout', onPointerLeave);

    let t = 0;
    const drawFrame = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio ?? 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const nodes = nodesRef.current;
      if (nodes.length === 0) return;

      if (!reducedMotion) {
        const pointer = pointerRef.current;
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]!;
          n.x += n.vx;
          n.y += n.vy;
          // The field leans gently toward the cursor — alive, never frantic.
          if (pointer.active) {
            const dx = pointer.x - n.x;
            const dy = pointer.y - n.y;
            const d = Math.hypot(dx, dy);
            if (d > 1 && d < POINTER_DISTANCE) {
              const pull = ((POINTER_DISTANCE - d) / POINTER_DISTANCE) * 0.012;
              n.x += (dx / d) * pull * 8;
              n.y += (dy / d) * pull * 8;
            }
          }
          if (n.x < 0 || n.x > w) n.vx *= -1;
          if (n.y < 0 || n.y > h) n.vy *= -1;
          n.x = Math.max(0, Math.min(w, n.x));
          n.y = Math.max(0, Math.min(h, n.y));
        }
      }

      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const ni = nodes[i]!;
          const nj = nodes[j]!;
          const dx = ni.x - nj.x;
          const dy = ni.y - nj.y;
          const d = Math.hypot(dx, dy);
          if (d < CONNECT_DISTANCE) {
            const alpha = (1 - d / CONNECT_DISTANCE) * 0.35 * (0.7 + 0.3 * Math.sin(t * PULSE_SPEED + ni.phase));
            ctx.strokeStyle = `rgba(100, 220, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(ni.x, ni.y);
            ctx.lineTo(nj.x, nj.y);
            ctx.stroke();
          }
        }
      }

      const grad = ctx.createRadialGradient(0, 0, 0, w * 0.6, h * 0.6, w * 0.8);
      grad.addColorStop(0, 'rgba(8, 12, 28, 0.4)');
      grad.addColorStop(0.5, 'rgba(8, 12, 28, 0.75)');
      grad.addColorStop(1, 'rgba(4, 6, 18, 0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        const glow = 2 + 1.5 * Math.sin(t * PULSE_SPEED + n.phase);
        const r = 1.2;
        ctx.shadowColor = 'rgba(100, 220, 255, 0.9)';
        ctx.shadowBlur = glow * 4;
        ctx.fillStyle = 'rgba(140, 240, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    const loop = () => {
      drawFrame();
      t += 16;
      rafRef.current = requestAnimationFrame(loop);
    };

    // Reduced motion gets one composed still frame; everyone else gets the field,
    // paused while the tab is hidden so we never burn cycles unseen.
    if (reducedMotion) {
      drawFrame();
    } else {
      rafRef.current = requestAnimationFrame(loop);
    }

    const onVisibility = () => {
      if (reducedMotion) return;
      cancelAnimationFrame(rafRef.current);
      if (!document.hidden) rafRef.current = requestAnimationFrame(loop);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      cancelAnimationFrame(rafRef.current);
    };
  }, [initNodes]);

  return canvasRef;
}

// Module-level CSS injected via dangerouslySetInnerHTML: a plain <style> child gets
// its quotes entity-escaped during SSR but not on the client, which made React throw
// a hydration mismatch on every login load. innerHTML is byte-identical on both sides.
const LOGIN_CSS = `
  .internal-login-root {
    position: fixed;
    inset: 0;
    background: linear-gradient(160deg, #050810 0%, #0a0e1a 40%, #060b14 100%);
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
  }
  .internal-login-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    pointer-events: none;
  }
  .internal-login-backdrop {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 120% 80% at 50% 50%, rgba(20, 80, 120, 0.08) 0%, transparent 60%);
    pointer-events: none;
  }
  .internal-login-main {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 430px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
  }
  .internal-login-panel {
    position: relative;
    width: 100%;
    padding: 42px 38px 36px;
    background: linear-gradient(178deg, rgba(13, 20, 40, 0.92) 0%, rgba(9, 14, 30, 0.88) 100%);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    border: 1px solid rgba(100, 220, 255, 0.16);
    border-radius: 14px;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.25),
      0 30px 60px -18px rgba(0, 0, 0, 0.55),
      0 0 90px -24px rgba(100, 220, 255, 0.14),
      inset 0 1px 0 rgba(160, 230, 255, 0.08);
    animation: login-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  /* Instrument-panel corner ticks — the "control plane" read, not a generic glass card. */
  .internal-login-panel::before,
  .internal-login-panel::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    pointer-events: none;
  }
  .internal-login-panel::before {
    top: -1px;
    left: -1px;
    border-top: 2px solid rgba(100, 220, 255, 0.55);
    border-left: 2px solid rgba(100, 220, 255, 0.55);
    border-top-left-radius: 14px;
  }
  .internal-login-panel::after {
    bottom: -1px;
    right: -1px;
    border-bottom: 2px solid rgba(100, 220, 255, 0.55);
    border-right: 2px solid rgba(100, 220, 255, 0.55);
    border-bottom-right-radius: 14px;
  }
  .internal-login-lockup {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin: 0 0 18px 0;
  }
  .internal-login-mark {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Orbitron', sans-serif;
    font-weight: 700;
    font-size: 12.5px;
    letter-spacing: 0.04em;
    color: #05202e;
    background: linear-gradient(135deg, #7fe3ff 0%, #48b8e0 100%);
    box-shadow: 0 3px 14px rgba(100, 220, 255, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }
  .internal-login-lockup-name {
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(170, 220, 250, 0.72);
  }
  .internal-login-title {
    font-family: 'Orbitron', sans-serif;
    font-weight: 700;
    font-size: clamp(1.8rem, 5.4vw, 2.1rem);
    letter-spacing: 0.075em;
    line-height: 1.15;
    color: #eef8ff;
    text-shadow: 0 0 26px rgba(100, 220, 255, 0.28);
    margin: 0 0 10px 0;
    text-align: center;
    text-wrap: balance;
  }
  .internal-login-tagline {
    font-size: 0.9375rem;
    color: rgba(200, 230, 255, 0.68);
    margin: 0 0 26px 0;
    text-align: center;
    line-height: 1.55;
  }
  .internal-login-error {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 12px 14px;
    margin-bottom: 20px;
    background: rgba(220, 60, 60, 0.14);
    border: 1px solid rgba(220, 80, 80, 0.42);
    border-radius: 9px;
    color: #ff9f9f;
    font-size: 0.875rem;
    animation: login-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }
  .internal-login-error svg {
    flex: none;
  }
  .internal-login-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .internal-login-label {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .internal-login-label-text {
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgba(200, 230, 255, 0.85);
    letter-spacing: 0.02em;
  }
  .internal-login-input-wrap {
    position: relative;
  }
  .internal-login-input {
    width: 100%;
    padding: 14px 48px 14px 16px;
    font-size: 1rem;
    font-family: inherit;
    color: #e8f4fc;
    background: rgba(6, 11, 24, 0.85);
    border: 1px solid rgba(100, 220, 255, 0.24);
    border-radius: 10px;
    outline: none;
    transition: border-color 0.2s ease-out, box-shadow 0.2s ease-out, background-color 0.2s ease-out;
    box-sizing: border-box;
  }
  .internal-login-input::placeholder {
    color: rgba(180, 220, 255, 0.38);
  }
  .internal-login-input:hover {
    border-color: rgba(100, 220, 255, 0.4);
  }
  .internal-login-input:focus {
    border-color: rgba(100, 220, 255, 0.75);
    background: rgba(8, 14, 30, 0.95);
    box-shadow: 0 0 0 3px rgba(100, 220, 255, 0.14), 0 0 24px -6px rgba(100, 220, 255, 0.35);
  }
  .internal-login-reveal {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: rgba(170, 220, 250, 0.55);
    cursor: pointer;
    transition: color 0.15s ease-out, background-color 0.15s ease-out;
  }
  .internal-login-reveal:hover {
    color: rgba(200, 240, 255, 0.9);
    background: rgba(100, 220, 255, 0.08);
  }
  .internal-login-reveal:focus-visible {
    outline: 2px solid rgba(100, 220, 255, 0.7);
    outline-offset: 1px;
    color: rgba(200, 240, 255, 0.9);
  }
  .internal-login-submit {
    position: relative;
    overflow: hidden;
    width: 100%;
    padding: 14px 20px;
    font-family: 'Orbitron', sans-serif;
    font-weight: 600;
    font-size: 0.875rem;
    letter-spacing: 0.12em;
    color: #04121c;
    background: linear-gradient(135deg, #6fdfff 0%, #46b6e0 100%);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: transform 0.15s ease-out, box-shadow 0.2s ease-out, filter 0.2s ease-out;
    box-shadow: 0 4px 22px rgba(100, 220, 255, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .internal-login-submit::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(115deg, transparent 30%, rgba(255, 255, 255, 0.35) 50%, transparent 70%);
    transform: translateX(-120%);
    transition: transform 0.5s ease-out;
    pointer-events: none;
  }
  .internal-login-submit:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 30px rgba(100, 220, 255, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.35);
  }
  .internal-login-submit:hover::after {
    transform: translateX(120%);
  }
  .internal-login-submit:active {
    transform: translateY(0) scale(0.985);
  }
  .internal-login-submit:focus-visible {
    outline: 2px solid rgba(200, 240, 255, 0.9);
    outline-offset: 2px;
  }
  .internal-login-submit:disabled {
    cursor: default;
    filter: saturate(0.55) brightness(0.85);
    transform: none;
  }
  .internal-login-submit:disabled::after {
    display: none;
  }
  .internal-login-sso {
    margin: 0;
    text-align: center;
  }
  .internal-login-sso a {
    font-size: 0.875rem;
    color: rgba(100, 220, 255, 0.9);
    text-decoration: none;
    border-radius: 4px;
    transition: color 0.2s ease-out;
  }
  .internal-login-sso a:hover {
    color: #8ce7ff;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .internal-login-sso a:focus-visible {
    outline: 2px solid rgba(100, 220, 255, 0.7);
    outline-offset: 2px;
  }
  .internal-login-footer {
    font-size: 0.75rem;
    color: rgba(180, 220, 255, 0.42);
    letter-spacing: 0.04em;
    margin: 0;
    animation: login-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both;
  }
  .internal-login-footer-lavi {
    color: rgba(180, 220, 255, 0.58);
    margin-top: 4px;
  }
  @keyframes login-rise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @keyframes login-shake {
    10%, 90% { transform: translateX(-1px); }
    20%, 80% { transform: translateX(2px); }
    30%, 50%, 70% { transform: translateX(-3px); }
    40%, 60% { transform: translateX(3px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .internal-login-panel,
    .internal-login-footer {
      animation: none;
    }
    .internal-login-error {
      animation: none;
    }
    .internal-login-submit::after {
      display: none;
    }
  }
`;

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.7" />
      {off && <line x1="4" y1="4" x2="20" y2="20" />}
    </svg>
  );
}

export default function InternalLogin() {
  const data = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params] = useSearchParams();
  const [revealKey, setRevealKey] = useState(false);
  const to = sanitizeInternalRedirect(params.get('to') ?? '/internal');
  const canvasRef = useNeuralCanvas();
  const authenticating = navigation.state === 'submitting' || navigation.state === 'loading';

  return (
    <div className="internal-login-root">
      <canvas ref={canvasRef} className="internal-login-canvas" aria-hidden />
      <div className="internal-login-backdrop" />
      <main className="internal-login-main">
        <div className="internal-login-panel">
          <div className="internal-login-lockup">
            <div className="internal-login-mark">SA</div>
            <span className="internal-login-lockup-name">SuperApp AI · Internal</span>
          </div>
          <h1 className="internal-login-title">Control plane</h1>
          <p className="internal-login-tagline">
            Authenticate to access the internal dashboard and system controls.
          </p>
          {data?.error && (
            <div className="internal-login-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="13" />
                <line x1="12" y1="16.2" x2="12" y2="16.4" />
              </svg>
              {data.error}
            </div>
          )}
          <Form method="post" className="internal-login-form">
            <input type="hidden" name="to" value={to} />
            <label className="internal-login-label">
              <span className="internal-login-label-text">Access key</span>
              <span className="internal-login-input-wrap">
                <input
                  type={revealKey ? 'text' : 'password'}
                  name="password"
                  className="internal-login-input"
                  placeholder="Enter access key"
                  autoComplete="off"
                  autoFocus
                />
                <button
                  type="button"
                  className="internal-login-reveal"
                  onClick={() => setRevealKey((v) => !v)}
                  aria-label={revealKey ? 'Hide access key' : 'Show access key'}
                >
                  <EyeIcon off={revealKey} />
                </button>
              </span>
            </label>
            <button type="submit" className="internal-login-submit" disabled={authenticating}>
              {authenticating ? 'Authenticating…' : 'Authenticate'}
            </button>
            <p className="internal-login-sso">
              <a href="/internal/sso/start">Continue with SSO</a>
            </p>
          </Form>
        </div>
        <p className="internal-login-footer">
          Internal use only · Developers & app owners
        </p>
        <p className="internal-login-footer internal-login-footer-lavi">
          Made with ❤️ by Lavi
        </p>
      </main>
      <style dangerouslySetInnerHTML={{ __html: LOGIN_CSS }} />
    </div>
  );
}
