#!/usr/bin/env node
/**
 * Register an official release on the foundryvtt.com package listing through
 * Foundry's Package Release API, so Foundry's in-app installer offers it.
 *
 * Runs in release.yml after the GitHub release is published, for a `v<semver>`
 * tag without a prerelease label. Reads the stamped dist/system.json for the
 * version and compatibility, and points the listing at the TAG-PINNED manifest
 * (`/releases/download/v<version>/system.json`), the stable per-version URL the
 * listing expects; the /latest/ alias in the zip's own manifest moves on with
 * later releases.
 *
 * The package release token is a secret. It is read from FOUNDRY_RELEASE_TOKEN
 * (a secret of the approval-gated `release` environment), never passed on a command line and never printed.
 * FOUNDRY_RELEASE_DRY_RUN=1 asks the API to validate without publishing.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RELEASE_API = 'https://api.foundryvtt.com/_api/packages/release_version/';

/**
 * The Package Release API request body. Pure.
 * @param {{ id: string, version: string, compatibility?: { minimum?: string|number, verified?: string|number, maximum?: string|number } }} manifest - the stamped system.json
 * @param {{ repoUrl: string, tag: string, dryRun: boolean }} opts
 */
export function foundryReleaseBody(manifest, { repoUrl, tag, dryRun }) {
    if (!manifest.id || !manifest.version) throw new Error('system.json must carry id and version.');
    if (`v${manifest.version}` !== tag) throw new Error(`tag ${tag} does not match system.json version ${manifest.version}.`);
    const compat = manifest.compatibility ?? {};
    const compatibility = {};
    for (const key of ['minimum', 'verified', 'maximum']) {
        if (compat[key] !== undefined && compat[key] !== null && compat[key] !== '') compatibility[key] = String(compat[key]);
    }
    return {
        id: manifest.id,
        'dry-run': dryRun,
        release: {
            version: manifest.version,
            manifest: `${repoUrl}/releases/download/${tag}/system.json`,
            notes: `${repoUrl}/releases/tag/${tag}`,
            compatibility,
        },
    };
}

async function main() {
    const token = process.env.FOUNDRY_RELEASE_TOKEN;
    if (!token) throw new Error('FOUNDRY_RELEASE_TOKEN is not set — add the package release token as a secret of the `release` environment.');
    const repoUrl = process.env.REPO_URL;
    const tag = process.env.TAG;
    if (!repoUrl || !tag) throw new Error('REPO_URL and TAG are required.');
    const manifest = JSON.parse(readFileSync('dist/system.json', 'utf8'));
    const body = foundryReleaseBody(manifest, { repoUrl, tag, dryRun: process.env.FOUNDRY_RELEASE_DRY_RUN === '1' });

    const response = await fetch(RELEASE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== 'success') {
        // The API reports field errors; never echo the request (it carries no token, but stay strict).
        throw new Error(`Foundry package release failed (HTTP ${response.status}): ${JSON.stringify(result.errors ?? result)}`);
    }
    console.log(`Foundry package listing: ${body['dry-run'] ? 'validated' : 'published'} ${body.id} ${body.release.version}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
    });
}
