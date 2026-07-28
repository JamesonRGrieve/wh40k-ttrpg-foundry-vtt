import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../testing/model-import.ts';

describe('TokenDocumentWH40K', () => {
    it('exports TokenDocumentWH40K class', async () => {
        const mod = await importModelOrSkip(import('./token.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.TokenDocumentWH40K).toBeTruthy();
    });

    it('registerMovementActions is a static method', async () => {
        const mod = await importModelOrSkip(import('./token.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(typeof mod.TokenDocumentWH40K.registerMovementActions).toBe('function');
    });

    it('registerHUDListeners is a static method', async () => {
        const mod = await importModelOrSkip(import('./token.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(typeof mod.TokenDocumentWH40K.registerHUDListeners).toBe('function');
    });

    it('onTokenHUDRender bails out early when actor has no movement data', async () => {
        const mod = await importModelOrSkip(import('./token.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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

    describe('onVehicleInteriorHUDRender (#508)', () => {
        /** A HUD root shaped like Foundry's, with the left control column. */
        function hudRoot(): HTMLElement {
            const root = document.createElement('div');
            const left = document.createElement('div');
            left.className = 'col left';
            root.appendChild(left);
            return root;
        }

        /** The actor shape `vehicle-interior.ts` reads. */
        interface ActorStub {
            type: string;
            flags: Record<string, Record<string, string> | undefined>;
        }

        /** A viewable Scene, and the collection the handler looks it up in. */
        interface SceneStub {
            id: string;
            name: string;
            view: () => Promise<void>;
        }
        type ScenesStub = { get: (id: string) => SceneStub | undefined };

        /** A token HUD app whose token carries the given actor. */
        function hudApp(actor: ActorStub): { object: { document: { actor: ActorStub } } } {
            return { object: { document: { actor } } };
        }

        /** Install the Foundry globals the handler reads, and restore afterwards. */
        function withGlobals(sceneLookup: ScenesStub, run: () => void): void {
            // eslint-disable-next-line no-restricted-syntax -- test boundary: globalThis is untyped at the engine boundary
            const g = globalThis as unknown as Record<string, unknown>;
            const originals = { game: g['game'], ui: g['ui'] };
            g['game'] = { scenes: sceneLookup, i18n: { localize: (key: string): string => key } };
            g['ui'] = { notifications: { warn: (): void => undefined } };
            try {
                run();
            } finally {
                g['game'] = originals.game;
                g['ui'] = originals.ui;
            }
        }

        // eslint-disable-next-line @typescript-eslint/require-await -- the stub satisfies Foundry's async `Scene#view` contract; there is nothing to await in a stub
        const interiorScene: SceneStub = { id: 'scene1', name: 'Errant Vector — Interior', view: async (): Promise<void> => undefined };
        const withInterior: ActorStub = { type: 'rt-voidcraft', flags: { 'kanka-foundry': { interiorSceneId: 'scene1' } } };
        const sentinel: ActorStub = { type: 'dh2-terracraft', flags: {} };
        const scenes: ScenesStub = { get: (id: string) => (id === 'scene1' ? interiorScene : undefined) };

        it('adds the Board Interior control for a vehicle with a linked interior Scene', async () => {
            const mod = await importModelOrSkip(import('./token.ts'));
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
            if (mod === undefined) return;
            const root = hudRoot();
            withGlobals(scenes, () => {
                mod.TokenDocumentWH40K.onVehicleInteriorHUDRender(hudApp(withInterior) as never, root as never);
            });
            expect(root.querySelectorAll('.wh40k-token-interior')).toHaveLength(1);
        });

        it('adds NOTHING for a vehicle with no interior — a Sentinel gets embark only', async () => {
            const mod = await importModelOrSkip(import('./token.ts'));
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
            if (mod === undefined) return;
            const root = hudRoot();
            withGlobals(scenes, () => {
                mod.TokenDocumentWH40K.onVehicleInteriorHUDRender(hudApp(sentinel) as never, root as never);
            });
            expect(root.querySelectorAll('.wh40k-token-interior')).toHaveLength(0);
        });

        it('adds nothing for a non-vehicle actor', async () => {
            const mod = await importModelOrSkip(import('./token.ts'));
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
            if (mod === undefined) return;
            const root = hudRoot();
            withGlobals(scenes, () => {
                mod.TokenDocumentWH40K.onVehicleInteriorHUDRender(hudApp({ type: 'dh2-character', flags: {} }) as never, root as never);
            });
            expect(root.querySelectorAll('.wh40k-token-interior')).toHaveLength(0);
        });

        it('adds nothing when the linked Scene id no longer resolves', async () => {
            // A deleted interior Scene must not leave a control that opens nothing.
            const mod = await importModelOrSkip(import('./token.ts'));
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
            if (mod === undefined) return;
            const root = hudRoot();
            withGlobals({ get: () => undefined }, () => {
                mod.TokenDocumentWH40K.onVehicleInteriorHUDRender(hudApp(withInterior) as never, root as never);
            });
            expect(root.querySelectorAll('.wh40k-token-interior')).toHaveLength(0);
        });

        it('does not throw when the HUD has no token at all', async () => {
            const mod = await importModelOrSkip(import('./token.ts'));
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
            if (mod === undefined) return;
            withGlobals(scenes, () => {
                expect(() => mod.TokenDocumentWH40K.onVehicleInteriorHUDRender({}, hudRoot())).not.toThrow();
            });
        });
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - movement cost function returns default cost fn when automation is disabled
    //   - movement cost function returns tracking fn when actor has no speed for the type
    //   - HUD render inserts movement buttons for each movement type with a speed value
});
