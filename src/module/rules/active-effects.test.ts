import { describe, expect, it } from 'vitest';

/**
 * Schema regression: parse the active-effects module and confirm the
 * condition registry exposes the full DH2 set. The full
 * `createConditionEffect` flow needs `ui.notifications` and a live actor
 * graph that aren't available outside Foundry, so we verify the registry
 * via static module read (the registry is a literal inside the function).
 */
describe('active-effects condition registry', () => {
    it('lists every canonical DH2 condition string in the source', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const source = await fs.readFile(path.resolve(process.cwd(), 'src/module/rules/active-effects.ts'), 'utf8');
        // Each entry below appears as `<key>: {` in the conditions registry.
        for (const key of [
            'stunned',
            'prone',
            'blinded',
            'deafened',
            'grappled',
            'pinned',
            'unconscious',
            'suffocating',
            'bloodloss',
            'uselessLimb',
            'fatigued',
            'manacled',
            'inspired',
            'blessed',
        ]) {
            expect(source).toContain(`${key}: {`);
        }
    });

    it('declares handleBloodLoss alongside handleBleeding and handleOnFire', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const source = await fs.readFile(path.resolve(process.cwd(), 'src/module/rules/active-effects.ts'), 'utf8');
        expect(source).toContain('export async function handleBleeding');
        expect(source).toContain('export async function handleOnFire');
        expect(source).toContain('export async function handleBloodLoss');
    });
});
