import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the character-creation dialogs at
 * `src/module/applications/character-creation/*`. These three classes
 * were below 10% function coverage before this spec because
 * origin-path-builder.spec.ts drives the OUTER builder shell while
 * never opening any of the per-step dialogs.
 *
 * Modules exercised (pre-spec line / fn coverage):
 *   - `origin-roll-dialog.ts` (31.5% / 4.2%) — dialog ctor + render
 *     against a synthetic OriginRollContext (actor + origin item).
 *   - `origin-path-choice-dialog.ts` (31.6% / 5.9%) — dialog ctor +
 *     render against a synthetic origin-path item attached to an
 *     actor; surfaces `_prepareContext`'s choice-list assembly and
 *     the no-choices-defined empty-state branch.
 *   - `origin-detail-dialog.ts` (35.4% / 6.2%) — dialog ctor + render
 *     against a normalized origin object passed via options.
 *
 * Each flow records under `chargen.flow`. Keys MUST match the
 * CHARGEN_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const CHARGEN_FLOWS = ['origin-roll-dialog-renders', 'origin-path-choice-dialog-renders', 'origin-detail-dialog-renders'] as const;

type FlowName = (typeof CHARGEN_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

async function probeChargenDialogs(page: Page): Promise<{ results: FlowResult[]; pageErrors: string[] }> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const results = await page.evaluate(async (): Promise<FlowResult[]> => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: dynamic-imported modules are runtime-only */
            const g = globalThis as any;
            const ActorCls = g.Actor;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/applications/character-creation`;

            // Seed a dh2 character + an embedded origin-path item that
            // all three dialogs can read for context.
            let actor: any;
            try {
                actor = await ActorCls.create({
                    name: 'chargen-spec-actor',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e' },
                });
            } catch (err) {
                for (const f of CHARGEN_FLOWS) record(f, false, `actor create threw: ${String((err as Error)?.message ?? err)}`);
                return out;
            }
            if (actor?.id == null) {
                for (const f of CHARGEN_FLOWS) record(f, false, 'actor not created');
                return out;
            }

            let originItem: any;
            try {
                const items = await actor.createEmbeddedDocuments('Item', [
                    {
                        name: 'chargen-spec-origin',
                        type: 'originPath',
                        img: 'icons/svg/d20.svg',
                        system: {
                            gameSystem: 'dh2e',
                            step: 'homeWorld',
                            identifier: 'hive-world',
                            grants: { skills: [], talents: [], traits: [], equipment: [], aptitudes: [], specialAbilities: [], choices: [] },
                            description: 'A spec-only origin path.',
                            shortDescription: 'Spec origin.',
                        },
                    },
                ]);
                originItem = Array.isArray(items) ? items[0] : null;
            } catch {
                /* surface per-flow below */
            }

            const opened: any[] = [];
            const closeAll = async (): Promise<void> => {
                for (const w of opened) {
                    try {
                        await w?.close?.();
                    } catch {
                        /* ignore */
                    }
                }
            };

            // ---------- origin-roll-dialog ----------
            try {
                const mod = await import(`${base}/origin-roll-dialog.js`);
                const OriginRollDialog = mod.default ?? mod.OriginRollDialog;
                if (typeof OriginRollDialog !== 'function') {
                    record('origin-roll-dialog-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else {
                    const ctx = {
                        actor: {
                            name: actor.name,
                            img: 'icons/svg/mystery-man.svg',
                            system: { characteristics: { toughness: { bonus: 3 } } },
                        },
                        originItem: {
                            name: 'chargen-spec-origin',
                            img: 'icons/svg/d20.svg',
                        },
                    };
                    const dlg = new OriginRollDialog('wounds', '1d10+3', ctx, {});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 50);
                    });
                    record('origin-roll-dialog-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('origin-roll-dialog-renders', false, String((err as Error)?.message ?? err));
            }

            // ---------- origin-path-choice-dialog ----------
            try {
                const mod = await import(`${base}/origin-path-choice-dialog.js`);
                const OriginPathChoiceDialog = mod.default ?? mod.OriginPathChoiceDialog;
                if (typeof OriginPathChoiceDialog !== 'function') {
                    record('origin-path-choice-dialog-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else if (originItem == null) {
                    record('origin-path-choice-dialog-renders', false, 'origin item not created');
                } else {
                    const dlg = new OriginPathChoiceDialog(originItem, actor, {});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 50);
                    });
                    record('origin-path-choice-dialog-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('origin-path-choice-dialog-renders', false, String((err as Error)?.message ?? err));
            }

            // ---------- origin-detail-dialog ----------
            try {
                const mod = await import(`${base}/origin-detail-dialog.js`);
                const OriginDetailDialog = mod.default ?? mod.OriginDetailDialog;
                if (typeof OriginDetailDialog !== 'function') {
                    record('origin-detail-dialog-renders', false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                } else if (originItem == null) {
                    record('origin-detail-dialog-renders', false, 'origin item not created');
                } else {
                    // OriginDetailDialog constructor signature is
                    // `(origin: WH40KItem, options)`. Pass the real
                    // origin-path item we seeded on the actor so
                    // _prepareContext can walk its `.system` shape.
                    const dlg = new OriginDetailDialog(originItem, {});
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 50);
                    });
                    record('origin-detail-dialog-renders', dlg.element instanceof HTMLElement, null);
                }
            } catch (err) {
                record('origin-detail-dialog-renders', false, String((err as Error)?.message ?? err));
            }

            await closeAll();
            // Best-effort cleanup of the seed actor.
            try {
                await actor.delete?.();
            } catch {
                /* ignore */
            }

            return out;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });
        return { results, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('character-creation dialogs (Tier B)', () => {
    test('every character-creation dialog renders against a seeded actor', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeChargenDialogs(page);
        const seen = new Set<string>();
        const failures: string[] = [];
        for (const r of probe.results) {
            seen.add(r.name);
            if (r.ok) {
                recordCoverage('chargen.flow', r.name);
            } else {
                failures.push(`${r.name}: ${r.detail ?? 'failed'}`);
            }
        }
        for (const expected of CHARGEN_FLOWS) {
            if (!seen.has(expected)) failures.push(`${expected}: flow did not run`);
        }
        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${CHARGEN_FLOWS.length} chargen-dialog flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
