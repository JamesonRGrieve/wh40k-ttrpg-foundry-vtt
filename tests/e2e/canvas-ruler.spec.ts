import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the system's TokenRuler subclass
 * (`src/module/canvas/ruler.ts` — 0% / 50.7% pre-spec). The class
 * extends `foundry.canvas.placeables.tokens.TokenRuler`. This spec
 * predates the discovery that the harness CAN render: PIXI boots
 * under SwiftShader after `scene.view()` — token-ring-art.spec.ts
 * and token-mask.spec.ts activate a scene, render placed tokens and
 * capture screenshots. So a real-canvas ruler spec is feasible; this
 * one still takes the cheaper path: dynamic-import the module so the
 * top-level statements run under coverage and assert the class shape.
 *
 * The `_getWaypointStyle` / `_getSegmentStyle` / `_getGridHighlightStyle`
 * overrides + the private `#getSpeedBasedStyle` helper are the
 * uncovered code; exercising them needs a placed Token with a planned
 * movement on an active canvas (see the token-ring specs for the
 * activation pattern) — a worthwhile follow-up now that rendering is
 * proven available.
 *
 * Each flow records under `canvas.flow`. Keys MUST match the
 * CANVAS_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const CANVAS_FLOWS = ['ruler-module-imports', 'ruler-class-extends-token-ruler'] as const;

type FlowName = (typeof CANVAS_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeCanvasRuler(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/canvas`;

            interface PixiPriority {
                OBJECTS: number;
                HIGH: number;
                LOW: number;
                NORMAL: number;
            }
            interface PixiNamespace {
                UPDATE_PRIORITY?: PixiPriority;
            }
            interface PixiGlobal {
                PIXI?: PixiNamespace;
            }
            // Stub the PIXI namespace so the module's top-level eval doesn't
            // throw when running in headless mode (placeables/token.mjs
            // references PIXI.UPDATE_PRIORITY.OBJECTS during import).
            // eslint-disable-next-line no-restricted-syntax -- boundary: PIXI global is a browser-realm runtime singleton with no shipped types
            const g = globalThis as unknown as PixiGlobal;
            g.PIXI = g.PIXI ?? {};
            g.PIXI.UPDATE_PRIORITY = g.PIXI.UPDATE_PRIORITY ?? { OBJECTS: 1, HIGH: 25, LOW: -25, NORMAL: 0 };

            interface RulerCtor {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 TokenRuler constructor params are not exposed by type packages
                new (...args: unknown[]): object;
                readonly name: string;
                readonly prototype: object;
            }
            interface RulerModule {
                default?: RulerCtor;
                TokenRulerWH40K?: RulerCtor;
            }
            interface FoundryRulerGlobal {
                foundry?: { canvas?: { placeables?: { tokens?: { TokenRuler?: RulerCtor } } } };
            }
            let mod: RulerModule | undefined;
            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- boundary: dynamic import is `any`; assigned to typed RulerModule slot
                mod = await import(`${base}/ruler.js`);
                record('ruler-module-imports', true, null);
            } catch (err) {
                record('ruler-module-imports', false, String((err as Error).message));
                record('ruler-class-extends-token-ruler', false, 'module import failed; cannot validate prototype chain');
                return out;
            }

            try {
                const TokenRulerWH40K = mod?.default ?? mod?.TokenRulerWH40K;
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const foundryTokenRuler = (globalThis as unknown as FoundryRulerGlobal).foundry?.canvas?.placeables?.tokens?.TokenRuler;
                if (typeof TokenRulerWH40K !== 'function') {
                    record('ruler-class-extends-token-ruler', false, `default export missing (keys: ${Object.keys(mod ?? {}).join(',')})`);
                } else if (typeof foundryTokenRuler !== 'function') {
                    // Foundry's TokenRuler isn't exposed in the namespace
                    // we expected; record the class shape we DO have.
                    record('ruler-class-extends-token-ruler', true, `TokenRulerWH40K.name=${TokenRulerWH40K.name}`);
                } else {
                    const ok = TokenRulerWH40K.prototype instanceof foundryTokenRuler;
                    record(
                        'ruler-class-extends-token-ruler',
                        ok,
                        ok ? null : `prototype chain mismatch: ${TokenRulerWH40K.name} does not extend ${foundryTokenRuler.name}`,
                    );
                }
            } catch (err) {
                record('ruler-class-extends-token-ruler', false, String((err as Error).message));
            }

            return out;
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('canvas/ruler (Tier B)', () => {
    test('TokenRulerWH40K module imports and extends Foundry TokenRuler', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeCanvasRuler(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('canvas.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of CANVAS_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${CANVAS_FLOWS.length} canvas-ruler flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
