import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
export const FOUNDRY_RELEASE_DIR = resolve(REPO_ROOT, '.foundry-release');

const TIER_A_PROBE = resolve(FOUNDRY_RELEASE_DIR, 'public', 'scripts', 'foundry.mjs');
const TIER_B_PROBE = resolve(FOUNDRY_RELEASE_DIR, 'main.js');

export function hasFoundryTierA(): boolean {
    return existsSync(TIER_A_PROBE);
}

export function hasFoundryTierB(): boolean {
    return existsSync(TIER_B_PROBE);
}

export function requireOrSkip(tier: 'A' | 'B'): boolean {
    const present = tier === 'A' ? hasFoundryTierA() : hasFoundryTierB();
    const required = process.env.FOUNDRY_INTEGRATION === 'required';
    if (!present && required) {
        const probe = tier === 'A' ? TIER_A_PROBE : TIER_B_PROBE;
        throw new Error(
            `FOUNDRY_INTEGRATION=required but ${probe} is missing — run ./pull-foundry.sh`,
        );
    }
    return present;
}

export function skipBanner(tier: 'A' | 'B'): string {
    const probe = tier === 'A' ? TIER_A_PROBE : TIER_B_PROBE;
    return `[integration] Tier ${tier} skipped — ${probe} not found (run ./pull-foundry.sh to enable, or set FOUNDRY_INTEGRATION=required to fail-on-missing)`;
}
