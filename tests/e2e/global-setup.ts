import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { hasFoundry, requireOrSkip, skipBanner } from './has-foundry';

export const TEST_PORT = Number(process.env.FOUNDRY_TEST_PORT ?? 30001);

export default async function globalSetup(): Promise<void> {
    requireOrSkip('B');
    if (!hasFoundry()) {
        // Playwright still invokes globalSetup even when no specs match.
        // Emit the banner so the run output is unambiguous.
        // eslint-disable-next-line no-console
        console.log(skipBanner('B'));
        return;
    }
    const script = resolve(__dirname, '..', '..', 'scripts', 'setup-foundry-test-world.sh');
    const result = spawnSync('bash', [script], {
        env: { ...process.env, FOUNDRY_TEST_PORT: String(TEST_PORT) },
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        throw new Error(`setup-foundry-test-world.sh exited with ${result.status}`);
    }
}
