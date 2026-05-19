#!/usr/bin/env tsx
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deploymentManifest, DeploymentManifestSchema } from './deployment-manifest.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function assertFile(relativePath: string): void {
  const absolute = resolve(repoRoot, relativePath);
  if (!existsSync(absolute)) {
    throw new Error(`Missing deployment artifact: ${relativePath}`);
  }
}

function assertHealthPath(relativeToml: string, expectedPath: string): void {
  const raw = readFileSync(resolve(repoRoot, relativeToml), 'utf8');
  if (!raw.includes(`healthcheckPath = "${expectedPath}"`)) {
    throw new Error(`${relativeToml} must set healthcheckPath = "${expectedPath}"`);
  }
}

function main(): void {
  const manifest = DeploymentManifestSchema.parse(deploymentManifest);

  for (const target of manifest.targets) {
    for (const file of target.configFiles) {
      assertFile(file);
    }
    if (target.platform === 'railway' && target.healthPath) {
      const railwayToml = target.configFiles.find((f) => f.endsWith('railway.toml'));
      if (!railwayToml) {
        throw new Error(`Railway target ${target.service} is missing railway.toml`);
      }
      assertHealthPath(railwayToml, target.healthPath);
    }
    if (target.platform === 'vercel') {
      const vercelJson = target.configFiles.find((f) => f.endsWith('vercel.json'));
      if (!vercelJson) {
        throw new Error(`Vercel target ${target.service} is missing vercel.json`);
      }
      const parsed = JSON.parse(readFileSync(resolve(repoRoot, vercelJson), 'utf8')) as {
        framework?: string;
      };
      if (parsed.framework !== 'nextjs') {
        throw new Error(`${vercelJson} must declare framework nextjs`);
      }
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      targets: manifest.targets.map((t) => ({
        service: t.service,
        platform: t.platform,
        envCount: t.env.length,
        configFiles: t.configFiles.length,
      })),
    }),
  );
}

main();
