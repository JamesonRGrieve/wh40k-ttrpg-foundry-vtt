// Stamps the rolling-prerelease version + fixed-tag manifest/download URLs onto
// the built dist/system.json and strips the packs[] array. The public nightly
// build ships system code only — src/packs is a private submodule of
// copyrighted content and is NOT distributed — so the published manifest must
// not declare compendium packs that aren't in the zip (Foundry errors on
// missing pack dirs). Driven by .github/workflows/release.yml.
//
// Env:
//   RUN       — the alpha counter (GitHub Actions run_number of release.yml).
//   REPO_URL  — https://github.com/<owner>/<repo>.
//   TAG       — release tag the assets live under (default "nightly").
//   MANIFEST_FILE — file to rewrite (default dist/system.json; overridable for tests).
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = process.env.MANIFEST_FILE ?? 'dist/system.json';
const run = process.env.RUN ?? '0';
const tag = process.env.TAG ?? 'nightly';
const repoUrl = process.env.REPO_URL;

if (!repoUrl) {
  console.error('prepare-nightly-manifest: REPO_URL is required (https://github.com/<owner>/<repo>).');
  process.exit(1);
}

const sys = JSON.parse(readFileSync(FILE, 'utf8'));

// Version = committed prerelease base + this run. The committed version is the
// rolling base (e.g. 0.0.1-alpha or 0.0.1-alpha.1); drop a trailing numeric
// counter so re-runs don't stack (0.0.1-alpha.1 → base 0.0.1-alpha). Only strip
// when a prerelease label is present (a `-`), so a plain release base isn't
// mangled. A fresh release.yml run_number starts at 1 → first push = …-alpha.1.
const committed = String(sys.version);
const base = committed.includes('-') ? committed.replace(/\.\d+$/, '') : committed;
sys.version = `${base}.${run}`;

// Fixed-tag asset URLs. A prerelease is never the "latest" release alias, so
// these must use /releases/download/<tag>/, not /releases/latest/download/.
sys.manifest = `${repoUrl}/releases/download/${tag}/system.json`;
sys.download = `${repoUrl}/releases/download/${tag}/wh40k-rpg.zip`;

// Drop compendium declarations — packs are private and not shipped here.
sys.packs = [];

writeFileSync(FILE, `${JSON.stringify(sys, null, 4)}\n`);
console.log(`nightly manifest → version=${sys.version} packs=${sys.packs.length} manifest=${sys.manifest}`);
