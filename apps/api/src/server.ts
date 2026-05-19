import { buildApp, loadEnv } from './index.js';

async function main() {
  const env = loadEnv();
  const app = await buildApp({ env, logger: true });
  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
