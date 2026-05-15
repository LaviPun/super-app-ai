import { json, redirect } from '@remix-run/node';
import { Form, useActionData, useSearchParams } from '@remix-run/react';
import { useRef, useEffect, useCallback } from 'react';
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
const PULSE_SPEED = 0.0008;
const DRIFT = 0.2;

function useNeuralCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<{ x: number; y: number; vx: number; vy: number; phase: number }[]>([]);
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

    let t = 0;
    const loop = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = window.devicePixelRatio ?? 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      const nodes = nodesRef.current;
      if (nodes.length === 0) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        n.x = Math.max(0, Math.min(w, n.x));
        n.y = Math.max(0, Math.min(h, n.y));
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

      t += 16;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [initNodes]);

  return canvasRef;
}

export default function InternalLogin() {
  const data = useActionData<typeof action>();
  const [params] = useSearchParams();
  const to = sanitizeInternalRedirect(params.get('to') ?? '/internal');
  const canvasRef = useNeuralCanvas();

  return (
    <div className="internal-login-root">
      <link
        href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <canvas ref={canvasRef} className="internal-login-canvas" aria-hidden />
      <div className="internal-login-backdrop" />
      <main className="internal-login-main">
        <div className="internal-login-panel">
          <h1 className="internal-login-title">Control plane</h1>
          <p className="internal-login-tagline">
            Authenticate to access the internal dashboard and system controls.
          </p>
          {data?.error && (
            <div className="internal-login-error" role="alert">
              {data.error}
            </div>
          )}
          <Form method="post" className="internal-login-form">
            <input type="hidden" name="to" value={to} />
            <label className="internal-login-label">
              <span className="internal-login-label-text">Access key</span>
              <input
                type="password"
                name="password"
                className="internal-login-input"
                placeholder="Enter access key"
                autoComplete="off"
                autoFocus
              />
            </label>
            <button type="submit" className="internal-login-submit">
              Authenticate
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
      <style>{`
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
          max-width: 420px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }
        .internal-login-panel {
          width: 100%;
          padding: 40px 36px;
          background: rgba(12, 18, 36, 0.72);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(100, 220, 255, 0.18);
          border-radius: 16px;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.2), 0 24px 48px -12px rgba(0,0,0,0.5), 0 0 80px -20px rgba(100, 220, 255, 0.12);
        }
        .internal-login-title {
          font-family: 'Orbitron', sans-serif;
          font-weight: 700;
          font-size: 1.75rem;
          letter-spacing: 0.08em;
          color: #e8f4fc;
          margin: 0 0 8px 0;
          text-align: center;
        }
        .internal-login-tagline {
          font-size: 0.9375rem;
          color: rgba(200, 230, 255, 0.7);
          margin: 0 0 28px 0;
          text-align: center;
          line-height: 1.45;
        }
        .internal-login-error {
          padding: 12px 14px;
          margin-bottom: 20px;
          background: rgba(220, 60, 60, 0.15);
          border: 1px solid rgba(220, 80, 80, 0.4);
          border-radius: 8px;
          color: #ff9a9a;
          font-size: 0.875rem;
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
        .internal-login-input {
          width: 100%;
          padding: 14px 16px;
          font-size: 1rem;
          font-family: inherit;
          color: #e8f4fc;
          background: rgba(8, 14, 28, 0.8);
          border: 1px solid rgba(100, 220, 255, 0.25);
          border-radius: 10px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
          box-sizing: border-box;
        }
        .internal-login-input::placeholder {
          color: rgba(180, 220, 255, 0.4);
        }
        .internal-login-input:hover {
          border-color: rgba(100, 220, 255, 0.4);
        }
        .internal-login-input:focus {
          border-color: rgba(100, 220, 255, 0.7);
          box-shadow: 0 0 0 3px rgba(100, 220, 255, 0.15);
        }
        .internal-login-submit {
          width: 100%;
          padding: 14px 20px;
          font-family: 'Orbitron', sans-serif;
          font-weight: 600;
          font-size: 0.875rem;
          letter-spacing: 0.1em;
          color: #050810;
          background: linear-gradient(135deg, #64dcff 0%, #48b8e0 100%);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.2s;
          box-shadow: 0 4px 20px rgba(100, 220, 255, 0.35);
        }
        .internal-login-submit:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 28px rgba(100, 220, 255, 0.45);
        }
        .internal-login-submit:active {
          transform: translateY(0);
        }
        .internal-login-sso {
          margin: 0;
          text-align: center;
        }
        .internal-login-sso a {
          font-size: 0.875rem;
          color: rgba(100, 220, 255, 0.9);
          text-decoration: none;
          transition: color 0.2s;
        }
        .internal-login-sso a:hover {
          color: #64dcff;
        }
        .internal-login-footer {
          font-size: 0.75rem;
          color: rgba(180, 220, 255, 0.4);
          letter-spacing: 0.04em;
          margin: 0;
        }
        .internal-login-footer-lavi {
          color: rgba(180, 220, 255, 0.55);
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}
