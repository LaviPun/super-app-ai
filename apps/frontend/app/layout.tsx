import './styles.css';
import Link from 'next/link';
import { internalRoutes, merchantRoutes } from '@/routes/legacy-route-map';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="app-nav" aria-label="Platform V2 navigation">
            <div className="brand">
              <span className="brand-mark">SA</span>
              <span>SuperApp V2</span>
            </div>
            <nav>
              <div className="nav-group">
                <p className="nav-title">Merchant embedded</p>
                {merchantRoutes.map((route) => (
                  <Link className="nav-link" href={route.href} key={route.href}>
                    {route.label}
                  </Link>
                ))}
              </div>
              <div className="nav-group">
                <p className="nav-title">Internal admin</p>
                {internalRoutes.map((route) => (
                  <Link className="nav-link" href={route.href} key={route.href}>
                    {route.label}
                  </Link>
                ))}
              </div>
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
