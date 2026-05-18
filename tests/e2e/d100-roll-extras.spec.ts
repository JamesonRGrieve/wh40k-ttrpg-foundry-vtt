import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of `src/module/dice/d100-roll.ts` static surface
 * beyond what rolls-data.spec.ts touches. rolls-data covered the
 * config accessors (chatTemplate / defaultFlavor / constructFormula);
 * this spec drives the heavier static methods that build template
 * data and chat data so the corresponding source branches light up:
 *
 *   - `_prepareTemplateData(roll, config)` — assembles the activeModifiers
 *     map + the rollData shape consumed by simple-roll-chat.hbs.
 *   - `_prepareChatData(roll, config)` — assembles the ChatMessage
 *     payload with wh40k-rpg flags + roll evaluation summary.
 *
 * Both methods need an evaluated Roll instance. The spec evaluates
 * `new D100Roll('1d100')` inside the page context so the roll object
 * has real `_total` / `_evaluated` state, then calls each static
 * method with a synthetic config bag.
 *
 * Pre-spec d100-roll.ts coverage was 9.5% fn / 51.7% line.
 *
 * Keep D100_ROLL_EXTRAS_FLOWS in sync with the equivalent constant
 * in scripts/e2e-coverage.mjs.
 */

const D100_ROLL_EXTRAS_FLOWS = ['prepareTemplateData-base', 'prepareTemplateData-with-modifiers', 'prepareChatData-base', 'evaluate-roll-isSuccess'] as const;

type FlowName = (typeof D100_ROLL_EXTRAS_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeD100Extras(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
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

            let mod: any;
            try {
                mod = await import(`${'/systems/wh40k-rpg'}/module/dice/d100-roll.js`);
            } catch (err) {
                for (const f of D100_ROLL_EXTRAS_FLOWS) record(f, false, `import: ${String((err as Error)?.message ?? err)}`);
                return out;
            }
            const D100Roll = mod.default ?? mod.D100Roll;
            if (typeof D100Roll !== 'function') {
                for (const f of D100_ROLL_EXTRAS_FLOWS) record(f, false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                return out;
            }

            // Build & evaluate a roll so the prepare-* helpers have a real
            // Roll to read from. D100Roll inherits Roll's evaluate() so the
            // standard `await roll.evaluate()` lifecycle applies.
            let roll: any;
            try {
                roll = new D100Roll('1d100');
                if (typeof roll.evaluate === 'function') {
                    await roll.evaluate();
                }
                record(
                    'evaluate-roll-isSuccess',
                    typeof roll.isSuccess === 'boolean' || roll.isSuccess === undefined,
                    `total=${roll.total} isSuccess=${roll.isSuccess}`,
                );
            } catch (err) {
                record('evaluate-roll-isSuccess', false, String((err as Error)?.message ?? err));
                for (const f of ['prepareTemplateData-base', 'prepareTemplateData-with-modifiers', 'prepareChatData-base'] as const) {
                    record(f, false, 'roll evaluation failed');
                }
                return out;
            }

            // ---- _prepareTemplateData (base config) ----
            try {
                const data = await D100Roll._prepareTemplateData(roll, { target: 50, flavor: 'spec-base' });
                const okShape = data !== null && typeof data === 'object' && data.rollData !== undefined;
                record('prepareTemplateData-base', okShape, `keys=${Object.keys(data ?? {}).join(',')}`);
            } catch (err) {
                record('prepareTemplateData-base', false, String((err as Error)?.message ?? err));
            }

            // ---- _prepareTemplateData with modifiers (drives the activeModifiers branch) ----
            try {
                const data = await D100Roll._prepareTemplateData(roll, {
                    target: 60,
                    flavor: 'spec-mods',
                    modifiers: { aiming: 10, range: -10, cover: 0 },
                });
                const am = data?.rollData?.activeModifiers ?? {};
                // cover should be filtered out (value === 0).
                const ok = 'AIMING' in am && 'RANGE' in am && !('COVER' in am);
                record('prepareTemplateData-with-modifiers', ok, `activeModifiers=${JSON.stringify(am)}`);
            } catch (err) {
                record('prepareTemplateData-with-modifiers', false, String((err as Error)?.message ?? err));
            }

            // ---- _prepareChatData ----
            try {
                const chat = await D100Roll._prepareChatData(roll, { target: 50, flavor: 'spec-chat' });
                const ok = chat !== null && typeof chat === 'object';
                record('prepareChatData-base', ok, `keys=${Object.keys(chat ?? {}).join(',')}`);
            } catch (err) {
                record('prepareChatData-base', false, String((err as Error)?.message ?? err));
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('d100-roll extras (Tier B)', () => {
    test('D100Roll._prepareTemplateData + _prepareChatData drive their branches', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeD100Extras(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('d100-roll-extras.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of D100_ROLL_EXTRAS_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${D100_ROLL_EXTRAS_FLOWS.length} d100-roll-extras flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
