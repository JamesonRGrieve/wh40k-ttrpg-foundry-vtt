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
            interface ProbeItem {
                id?: string;
                name?: string;
                img?: string;
                system?: object;
            }
            interface ProbeActor {
                id?: string;
                name?: string;
                createEmbeddedDocuments?: (kind: string, data: object[]) => Promise<ProbeItem[]>;
                delete?: () => Promise<void>;
            }
            interface ProbeDialog {
                element?: HTMLElement | null;
                render: (options: { force?: boolean }) => Promise<void>;
                close?: () => Promise<void>;
            }
            interface DialogCtor {
                new (...args: never[]): ProbeDialog;
            }
            interface DialogModule {
                default?: DialogCtor;
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic-imported module exports have no shipped types
                [key: string]: unknown;
            }
            interface ProbeGlobals {
                Actor?: { create?: (data: object) => Promise<ProbeActor | null> };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const g = globalThis as unknown as ProbeGlobals;
            const ActorCls = g.Actor;
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };

            const base = `${'/systems/wh40k-rpg'}/module/applications/character-creation`;

            if (ActorCls?.create === undefined) {
                for (const f of CHARGEN_FLOWS) record(f, false, 'Actor.create unavailable');
                return out;
            }

            // Seed a dh2 character + an embedded origin-path item that
            // all three dialogs can read for context.
            let actor: ProbeActor | null;
            try {
                actor = await ActorCls.create({
                    name: 'chargen-spec-actor',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e' },
                });
            } catch (err) {
                for (const f of CHARGEN_FLOWS) record(f, false, `actor create threw: ${String(err instanceof Error ? err.message : err)}`);
                return out;
            }
            if (actor?.id === undefined) {
                for (const f of CHARGEN_FLOWS) record(f, false, 'actor not created');
                return out;
            }

            let originItem: ProbeItem | null = null;
            try {
                const items =
                    (await actor.createEmbeddedDocuments?.('Item', [
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
                    ])) ?? [];
                originItem = Array.isArray(items) ? items[0] ?? null : null;
            } catch {
                /* surface per-flow below */
            }

            const opened: ProbeDialog[] = [];
            const closeAll = async (): Promise<void> => {
                await Promise.all(
                    opened.map(async (w) => {
                        try {
                            await w.close?.();
                        } catch {
                            /* ignore */
                        }
                    }),
                );
            };

            const tryDialog = async (flow: FlowName, modPath: string, exportName: string, build: (Ctor: DialogCtor) => ProbeDialog | null): Promise<void> => {
                try {
                    const mod = (await import(modPath)) as DialogModule;
                    const Ctor = mod.default ?? (mod[exportName] as DialogCtor | undefined);
                    if (typeof Ctor !== 'function') {
                        record(flow, false, `default export missing (keys: ${Object.keys(mod).join(',')})`);
                        return;
                    }
                    const dlg = build(Ctor);
                    if (dlg === null) {
                        record(flow, false, 'origin item not created');
                        return;
                    }
                    opened.push(dlg);
                    await dlg.render({ force: true });
                    await new Promise<void>((r) => {
                        setTimeout(r, 50);
                    });
                    record(flow, dlg.element instanceof HTMLElement, null);
                } catch (err) {
                    record(flow, false, String(err instanceof Error ? err.message : err));
                }
            };

            // ---------- origin-roll-dialog ----------
            await tryDialog('origin-roll-dialog-renders', `${base}/origin-roll-dialog.js`, 'OriginRollDialog', (Ctor) => {
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
                return new Ctor('wounds' as never, '1d10+3' as never, ctx as never, {} as never);
            });

            // ---------- origin-path-choice-dialog ----------
            await tryDialog('origin-path-choice-dialog-renders', `${base}/origin-path-choice-dialog.js`, 'OriginPathChoiceDialog', (Ctor) => {
                if (originItem === null) return null;
                return new Ctor(originItem as never, actor as never, {} as never);
            });

            // ---------- origin-detail-dialog ----------
            // OriginDetailDialog constructor signature is
            // `(origin: WH40KItem, options)`. Pass the real
            // origin-path item we seeded on the actor so
            // _prepareContext can walk its `.system` shape.
            await tryDialog('origin-detail-dialog-renders', `${base}/origin-detail-dialog.js`, 'OriginDetailDialog', (Ctor) => {
                if (originItem === null) return null;
                return new Ctor(originItem as never, {} as never);
            });

            await closeAll();
            // Best-effort cleanup of the seed actor.
            try {
                await actor.delete?.();
            } catch {
                /* ignore */
            }

            return out;
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
