/**
 * Propaga a versão calculada pelo semantic-release para o package.json da raiz
 * e de cada workspace. O repositório é privado e nada é publicado no npm, então
 * não usamos @semantic-release/npm — só mantemos os manifests em sincronia com
 * a tag, para que a versão apareça em /health, logs e builds.
 *
 * Uso: node scripts/sync-version.mjs 1.4.0
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!version) {
  console.error('sync-version: versão não informada');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'packages/shared/package.json',
];

for (const target of targets) {
  const file = resolve(root, target);
  if (!existsSync(file)) continue;

  const raw = readFileSync(file, 'utf8');
  const pattern = /("version"\s*:\s*)"[^"]*"/;
  if (!pattern.test(raw)) {
    console.warn(`sync-version: campo "version" não encontrado em ${target}`);
    continue;
  }
  const updated = raw.replace(pattern, `$1"${version}"`);
  if (updated !== raw) writeFileSync(file, updated);
  console.log(`sync-version: ${target} -> ${version}`);
}

// Mantém o package-lock coerente com os manifests sem tocar na árvore instalada.
