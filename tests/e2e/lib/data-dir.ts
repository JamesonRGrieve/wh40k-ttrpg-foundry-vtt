import { resolve } from 'node:path';

/**
 * The isolated Foundry data dir for the e2e world on `port`. Lives under
 * E2E_DATA_ROOT when set (e.g. local disk on a runner whose repo is
 * NFS-mounted), else the repo root. scripts/setup-foundry-test-world.sh
 * resolves the same path.
 */
export function foundryTestDataDir(port: number): string {
    const root = process.env.E2E_DATA_ROOT ?? resolve(__dirname, '..', '..', '..');
    return resolve(root, `.foundry-test-data-${port}`);
}
