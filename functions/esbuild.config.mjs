import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const resolve = (p) => fileURLToPath(new URL(p, import.meta.url));

// Bundle the function + the shared @mgs/scoring & @mgs/config-types SOURCE into a
// single self-contained file. The shared packages are resolved by ALIAS (not via
// node_modules / workspace deps), so the deployed package.json carries NO
// `workspace:*` references — which Cloud Build's `npm install` cannot parse.
// firebase-admin / firebase-functions stay external (the cloud runtime provides them).
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'lib/index.js',
  external: ['firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*', 'node:*'],
  alias: {
    '@mgs/scoring': resolve('../packages/scoring/src/index.ts'),
    '@mgs/config-types': resolve('../packages/config-types/src/index.ts'),
    '@mgs/season-data': resolve('../tools/seed/src/data.ts'),
  },
  logLevel: 'info',
});
