/**
 * OpenTelemetry SDK initialisation — server-side only.
 *
 * Activated when OTEL_EXPORTER_OTLP_ENDPOINT is set in the environment.
 * No-op in test, and silently skipped when the env var is absent, so local
 * development is unaffected.
 *
 * Uses dynamic import so the app can start even when OTEL packages are not
 * resolved (e.g. Vite SSR in dev). OTEL is only loaded when configured.
 *
 * Exports traces to any OTLP-compatible backend:
 *   Grafana Tempo, Honeycomb, Jaeger, Datadog, Lightstep, AWS X-Ray ADOT, etc.
 *
 * Required env vars:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  — e.g. https://api.honeycomb.io
 *   OTEL_SERVICE_NAME             — e.g. superapp-web   (defaults to "superapp-web")
 *
 * Optional env vars:
 *   OTEL_EXPORTER_OTLP_HEADERS   — comma-separated "key=value" pairs (for API keys)
 *   OTEL_TRACES_SAMPLE_RATE      — 0–1 float (default 0.1 in production, 1.0 otherwise)
 *
 * Auto-instrumented:
 *   - Node.js core (http, https, dns)
 *   - fetch / undici
 *   - Prisma (via @prisma/instrumentation)
 *   - Remix server handler (via http instrumentation picking up incoming requests)
 */

let _started = false;

export function initOtel(): void {
  if (_started) return;
  _started = true;

  if (process.env.NODE_ENV === 'test') return;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return; // Silently skip when not configured

  // Dynamic import so Vite SSR / dev does not fail when OTEL packages are not resolved
  void (async () => {
    try {
      const [{ NodeSDK }, { OTLPTraceExporter }, resources, semanticConventions, { getNodeAutoInstrumentations }, { TraceIdRatioBasedSampler }] = await Promise.all([
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/exporter-trace-otlp-http'),
        import('@opentelemetry/resources'),
        import('@opentelemetry/semantic-conventions'),
        import('@opentelemetry/auto-instrumentations-node'),
        import('@opentelemetry/sdk-trace-node'),
      ]);
      const res = resources as { default?: { Resource?: new (attrs: Record<string, string>) => object }; Resource?: new (attrs: Record<string, string>) => object };
      const ResourceClass = res.default?.Resource ?? res.Resource;
      const sem = semanticConventions as { default?: { ATTR_SERVICE_NAME: string; ATTR_SERVICE_VERSION: string }; ATTR_SERVICE_NAME?: string; ATTR_SERVICE_VERSION?: string };
      const ATTR_SERVICE_NAME = sem.default?.ATTR_SERVICE_NAME ?? sem.ATTR_SERVICE_NAME ?? 'service.name';
      const ATTR_SERVICE_VERSION = sem.default?.ATTR_SERVICE_VERSION ?? sem.ATTR_SERVICE_VERSION ?? 'service.version';

      const serviceName = process.env.OTEL_SERVICE_NAME ?? 'superapp-web';
      const serviceVersion = process.env.npm_package_version ?? '0.0.0';

      const rawHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS ?? '';
      const headers: Record<string, string> = {};
      for (const pair of rawHeaders.split(',').filter(Boolean)) {
        const [k, ...rest] = pair.split('=');
        if (k) headers[k.trim()] = rest.join('=').trim();
      }

      const defaultSampleRate = process.env.NODE_ENV === 'production' ? 0.1 : 1.0;
      const sampleRate = parseFloat(process.env.OTEL_TRACES_SAMPLE_RATE ?? String(defaultSampleRate));

      const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers });

      const resource = ResourceClass
        ? new ResourceClass({
            [ATTR_SERVICE_NAME]: serviceName,
            [ATTR_SERVICE_VERSION]: serviceVersion,
            'deployment.environment': process.env.NODE_ENV ?? 'development',
          })
        : undefined;

      const sdk = new NodeSDK({
        ...(resource && { resource }),
        traceExporter: exporter,
        sampler: new TraceIdRatioBasedSampler(sampleRate),
        instrumentations: [
          getNodeAutoInstrumentations({
            '@opentelemetry/instrumentation-fs': { enabled: false },
          }),
        ],
      });

      sdk.start();

      process.on('SIGTERM', () => {
        sdk.shutdown().catch(console.error);
      });
      process.on('SIGINT', () => {
        sdk.shutdown().catch(console.error);
      });
    } catch (_) {
      // OTEL packages not available or failed to load (e.g. Vite SSR) — no-op
    }
  })();
}
