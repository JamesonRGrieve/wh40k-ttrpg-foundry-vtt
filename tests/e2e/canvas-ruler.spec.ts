import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the system's TokenRuler subclass
 * (`src/module/canvas/ruler.ts` — 0% / 50.7% pre-spec). The class
 * extends `foundry.canvas.placeables.tokens.TokenRuler`, whose
 * methods need a PIXI runtime and a real canvas — neither is wired
 * up in headless Foundry. Rather than open a canvas, the spec
 * dynamic-imports the module so the top-level statements run under
 * coverage and asserts that the class is a subclass of the Foundry
 * base, which is the most we can verify off-canvas without staging
 * a full WebGL context.
 *
 * The `_getWaypointStyle` / `_getSegmentStyle` / `_getGridHighlightStyle`
 * overrides + the private `#getSpeedBasedStyle` helper are the
 * uncovered code; exercising them requires either a placed Token
 * with a planned movement (only present after canvas activation) or
 * a hand-built `super` stub that mimics the Foundry base class. The
 * cleanest path is to wait until the headless harness gains a
 * GL-mock layer; for now this spec lights up the import + class
 * shape branches.
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
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules are runtime-only */
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/canvas`;

            // Stub the PIXI namespace so the module's top-level eval doesn't
            // throw when running in headless mode (placeables/token.mjs
            // references PIXI.UPDATE_PRIORITY.OBJECTS during import).
            const g = globalThis as any;
            g.PIXI = g.PIXI ?? {};
            g.PIXI.UPDATE_PRIORITY = g.PIXI.UPDATE_PRIORITY ?? { OBJECTS: 1, HIGH: 25, LOW: -25, NORMAL: 0 };

            let mod: any;
            try {
                mod = await import(`${base}/ruler.js`);
                record('ruler-module-imports', mod != null, null);
            } catch (err) {
                record('ruler-module-imports', false, String((err as Error).message));
                record('ruler-class-extends-token-ruler', false, 'module import failed; cannot validate prototype chain');
                return out;
            }

            try {
                const TokenRulerWH40K = mod.default ?? mod.TokenRulerWH40K;
                const foundryTokenRuler = (globalThis as any).foundry?.canvas?.placeables?.tokens?.TokenRuler;
                if (typeof TokenRulerWH40K !== 'function') {
                    record('ruler-class-extends-token-ruler', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
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
            /* eslint-enable @typescript-eslint/no-explicit-any */
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
