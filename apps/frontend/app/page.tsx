const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3002';

async function getHealth() {
  try {
    const response = await fetch(`${apiBase}/health`, { cache: 'no-store' });
    if (!response.ok) return { status: 'error' };
    return response.json() as Promise<{ status: string; service: string }>;
  } catch {
    return { status: 'unreachable', service: '@superapp/api' };
  }
}

export default async function HomePage() {
  const health = await getHealth();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720 }}>
      <h1>SuperApp Platform V2 Frontend</h1>
      <p>Minimal Next.js shell for the Platform V2 migration. Merchant UI remains in Remix (`apps/web`) during cutover.</p>
      <section style={{ marginTop: '1.5rem' }}>
        <h2>Health</h2>
        <pre>{JSON.stringify(health, null, 2)}</pre>
      </section>
      <p style={{ marginTop: '1.5rem' }}>
        API base: <code>{apiBase}</code>
      </p>
      <p>
        <a href={`${apiBase}/health`}>Open API health</a>
      </p>
      <p>
        <a href="/preview/shop_1/module_1?assetId=preview_module_1">Open preview sandbox (shop_1/module_1)</a>
      </p>
    </main>
  );
}
