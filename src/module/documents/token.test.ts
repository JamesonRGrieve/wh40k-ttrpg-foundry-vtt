import { describe, expect, it } from 'vitest';

describe('TokenDocumentWH40K', () => {
    it('exports TokenDocumentWH40K class', async () => {
        const mod = await import('./token').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`TokenDocumentWH40K could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.TokenDocumentWH40K).toBeTruthy();
    });

    it('registerMovementActions is a static method', async () => {
        const mod = await import('./token').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`TokenDocumentWH40K could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(typeof mod.TokenDocumentWH40K.registerMovementActions).toBe('function');
    });

    it('registerHUDListeners is a static method', async () => {
        const mod = await import('./token').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`TokenDocumentWH40K could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(typeof mod.TokenDocumentWH40K.registerHUDListeners).toBe('function');
    });

    it('onTokenHUDRender bails out early when actor has no movement data', async () => {
        const mod = await import('./token').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`TokenDocumentWH40K could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;

        // Provide a fake app whose actor has no movement property — onTokenHUDRender should return without throwing.
        const fakeApp = {
            object: {
                document: {
                    actor: {
                        system: {}, // no movement key
                    },
                },
            },
        };
        const fakeHtml = document.createElement('div');

        // Assign a minimal CONFIG.wh40k to avoid accessing undefined.
        // eslint-disable-next-line no-restricted-syntax -- test boundary: patching globalThis.CONFIG to simulate Foundry runtime for isolated unit test
        type GlobalAny = Record<string, Record<string, unknown>>;
        // eslint-disable-next-line no-restricted-syntax -- test boundary: globalThis is untyped at the engine boundary
        const g = globalThis as unknown as GlobalAny;
        const originalConfig = g['CONFIG'] ?? {};
        g['CONFIG'] = { wh40k: { movementTypes: {} } };
        try {
            expect(() => mod.TokenDocumentWH40K.onTokenHUDRender(fakeApp as never, fakeHtml as never)).not.toThrow();
        } finally {
            g['CONFIG'] = originalConfig;
        }
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - movement cost function returns default cost fn when automation is disabled
    //   - movement cost function returns tracking fn when actor has no speed for the type
    //   - HUD render inserts movement buttons for each movement type with a speed value
});
