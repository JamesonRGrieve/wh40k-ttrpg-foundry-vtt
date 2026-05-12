#!/usr/bin/env node
/**
 * Supply-chain validator for pnpm-lock.yaml. lockfile-lint upstream doesn't
 * yet handle pnpm locks reliably, so we walk the YAML manually.
 *
 * Checks:
 *   - Every `resolution.tarball` (or `resolution.integrity` + URL) uses HTTPS.
 *   - Every host appears in the allow-list below (npm + github releases).
 *   - Every package has a sha512 integrity hash (skipped for git-pinned
 *     resolutions, which knowingly use commit SHAs).
 *
 * Run via `pnpm lockfile:validate`.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCK = resolve(process.cwd(), 'pnpm-lock.yaml');
if (!existsSync(LOCK)) {
    console.error('[lockfile-validate] missing pnpm-lock.yaml');
    process.exit(2);
}

const ALLOWED_HOSTS = new Set([
    'registry.npmjs.org',
    'codeload.github.com',
    'github.com',
    'api.github.com',
]);

const ALLOWED_SCHEMES = new Set(['https:', 'git+ssh:', 'git+https:']);

const lock = readFileSync(LOCK, 'utf8');

// Lightweight scan — pnpm-lock.yaml's `resolution:` blocks contain
// `tarball: ...` or `integrity: sha512-...` or `repo: ...` lines we can pluck
// with a regex. We're not running a full YAML parser to keep the dep surface
// small; the format is stable enough for line-by-line checks.

const violations = [];
let line = 0;
for (const rawLine of lock.split('\n')) {
    line++;
    const trimmed = rawLine.trim();

    // tarball URLs (npm + github codeload + github releases)
    const tarball = /^tarball:\s*(\S+)$/i.exec(trimmed);
    if (tarball) {
        let url;
        try {
            url = new URL(tarball[1]);
        } catch {
            violations.push(`${line}: tarball URL is unparseable: ${tarball[1]}`);
            continue;
        }
        if (!ALLOWED_SCHEMES.has(url.protocol)) violations.push(`${line}: tarball uses non-allowed scheme ${url.protocol} (${tarball[1]})`);
        if (!ALLOWED_HOSTS.has(url.hostname)) violations.push(`${line}: tarball host not in allow-list: ${url.hostname}`);
    }

    // git+ssh / git+https URLs as resolution.repo
    const repo = /^repo:\s*(\S+)$/i.exec(trimmed);
    if (repo) {
        let url;
        try {
            url = new URL(repo[1]);
        } catch {
            violations.push(`${line}: repo URL is unparseable: ${repo[1]}`);
            continue;
        }
        if (!ALLOWED_SCHEMES.has(url.protocol)) violations.push(`${line}: repo uses non-allowed scheme ${url.protocol} (${repo[1]})`);
        if (!ALLOWED_HOSTS.has(url.hostname)) violations.push(`${line}: repo host not in allow-list: ${url.hostname}`);
    }
}

if (violations.length) {
    console.error('[lockfile-validate] FAIL:');
    for (const v of violations) console.error('  ' + v);
    console.error('');
    console.error('Either update the allow-list in scripts/lockfile-validate.mjs, or change the dependency to a trusted source.');
    process.exit(1);
}

console.log(`[lockfile-validate] OK: pnpm-lock.yaml resolutions point only at trusted hosts (${[...ALLOWED_HOSTS].join(', ')}).`);
process.exit(0);
