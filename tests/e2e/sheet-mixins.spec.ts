import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the sheet-mixin layer:
 *   - `src/module/applications/api/primary-sheet-mixin.ts`
 *   - `src/module/applications/item/base-item-sheet.ts`
 *   - `src/module/applications/actor/base-actor-sheet.ts`
 *
 * The existing `sheet-interactions.spec.ts` covers tab switching, action
 * dispatch, and form submission against a single DH2 character sheet. This
 * spec drills into the orthogonal concerns introduced by the mixin chain
 * itself: edit-mode toggle (locked/unlocked), the `canEdit` /
 * `isCompendiumItem` / `isOwnedByActor` getters on item sheets, the
 * mixin's `changeTab` routing into `tabGroups.primary`, and the
 * `_onDropItem` drop handler that BaseActorSheet overrides.
 *
 * ProseMirror gating (CLAUDE.md gotcha #5) is verified by opening a
 * compendium item sheet and asserting the sheet exposes `inEditMode ===
 * false` so the `{{#if inEditMode}}` guard around the editor short-
 * circuits before ProseMirror is asked to render in a read-only context.
 *
 * Each successful interaction records `sheet-mixin.flow::<name>`. The
 * enumerable inventory for the dimension lives in `scripts/e2e-coverage.mjs`.
 */

const SHEET_MIXIN_FLOWS = [
    'edit-mode-toggle-actor',
    'edit-mode-toggle-item',
    'owned-item-sheet-canEdit',
    'compendium-item-sheet-readonly',
    'tab-switch-routes-via-mixin',
    'drop-event-on-sheet',
    'prosemirror-gated-in-readonly',
] as const;

type FlowName = (typeof SHEET_MIXIN_FLOWS)[number];

interface FlowResult {
    flow: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeResult {
    flows: FlowResult[];
    pageErrors: string[];
}

const TALENT_PACK = 'wh40k-rpg.dh2-core-stats-talents';

async function probeSheetMixins(page: import('@playwright/test').Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error) => pageErrors.push(err.message);
    page.on('pageerror', listener);
    try {
        const flows = await page.evaluate(async (talentPackId: string) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const Item = g.Item;
            const game = g.game;
            const results: Array<{ flow: string; ok: boolean; detail: string | null }> = [];

            const record = (flow: string, ok: boolean, detail: string | null): void => {
                results.push({ flow, ok, detail });
            };

            /* ---------- shared setup: build an actor + an owned item ---------- */
            let actor: any = null;
            let ownedItem: any = null;
            try {
                actor = await Actor.create({
                    name: 'sheet-mixin-probe-actor',
                    type: 'dh2-character',
                    system: { gameSystem: 'dh2e' },
                });
            } catch (err) {
                record('edit-mode-toggle-actor', false, `actor.create threw: ${String((err as Error)?.message ?? err)}`);
                return results;
            }
            if (!actor) {
                record('edit-mode-toggle-actor', false, 'Actor.create returned null');
                return results;
            }

            /* ---------- flow 1: edit-mode-toggle-actor ---------- */
            try {
                const sheet = actor.sheet;
                if (!sheet) {
                    record('edit-mode-toggle-actor', false, 'actor.sheet undefined');
                } else {
                    await sheet.render(true);
                    await new Promise((r) => setTimeout(r, 80));
                    const before = sheet.inEditMode === true;
                    // Character/NPC sheets register `toggleEditMode` as an action.
                    const handler = sheet.options?.actions?.toggleEditMode;
                    if (typeof handler !== 'function') {
                        record('edit-mode-toggle-actor', false, 'toggleEditMode action not registered');
                    } else {
                        const event = new MouseEvent('click', { bubbles: false, cancelable: true });
                        const target = document.createElement('div');
                        const rv = handler.call(sheet, event, target);
                        if (rv && typeof rv.then === 'function') await rv;
                        await new Promise((r) => setTimeout(r, 60));
                        const afterFirst = sheet.inEditMode === true;
                        // Toggle back so we exercise both edges.
                        const rv2 = handler.call(sheet, event, target);
                        if (rv2 && typeof rv2.then === 'function') await rv2;
                        await new Promise((r) => setTimeout(r, 60));
                        const afterSecond = sheet.inEditMode === true;
                        if (before === false && afterFirst === true && afterSecond === false) {
                            record('edit-mode-toggle-actor', true, null);
                        } else {
                            record('edit-mode-toggle-actor', false, `inEditMode trace: ${String(before)} → ${String(afterFirst)} → ${String(afterSecond)}`);
                        }
                    }
                    try {
                        await sheet.close?.();
                    } catch {
                        /* ignore */
                    }
                }
            } catch (err) {
                record('edit-mode-toggle-actor', false, String((err as Error)?.message ?? err));
            }

            /* ---------- flow 5: tab-switch-routes-via-mixin ---------- */
            try {
                const sheet = actor.sheet;
                if (!sheet) {
                    record('tab-switch-routes-via-mixin', false, 'actor.sheet undefined');
                } else {
                    await sheet.render(true);
                    await new Promise((r) => setTimeout(r, 80));
                    const initial = sheet.tabGroups?.primary;
                    const targetTab = initial === 'skills' ? 'combat' : 'skills';
                    if (typeof sheet.changeTab !== 'function') {
                        record('tab-switch-routes-via-mixin', false, 'sheet.changeTab not a function');
                    } else {
                        sheet.changeTab(targetTab, 'primary');
                        await new Promise((r) => setTimeout(r, 60));
                        const after = sheet.tabGroups?.primary;
                        if (after === targetTab) {
                            record('tab-switch-routes-via-mixin', true, null);
                        } else {
                            record('tab-switch-routes-via-mixin', false, `tabGroups.primary was ${String(after)}, expected ${targetTab}`);
                        }
                    }
                    try {
                        await sheet.close?.();
                    } catch {
                        /* ignore */
                    }
                }
            } catch (err) {
                record('tab-switch-routes-via-mixin', false, String((err as Error)?.message ?? err));
            }

            /* ---------- create an owned item on the actor for flows 2/3/6 ---------- */
            try {
                const docs = await actor.createEmbeddedDocuments?.('Item', [
                    {
                        name: 'sheet-mixin-probe-talent',
                        type: 'talent',
                        system: { gameSystem: 'dh2e' },
                    },
                ]);
                ownedItem = Array.isArray(docs) ? docs[0] : null;
            } catch (err) {
                // capture below per flow
                ownedItem = null;
                record('owned-item-sheet-canEdit', false, `createEmbeddedDocuments threw: ${String((err as Error)?.message ?? err)}`);
            }

            /* ---------- flow 3: owned-item-sheet-canEdit ---------- */
            if (ownedItem) {
                try {
                    const sheet = ownedItem.sheet;
                    if (!sheet) {
                        record('owned-item-sheet-canEdit', false, 'item.sheet undefined');
                    } else {
                        await sheet.render(true);
                        await new Promise((r) => setTimeout(r, 80));
                        const ownedFlag = sheet.isOwnedByActor === true;
                        const compendiumFlag = sheet.isCompendiumItem === false;
                        const canEdit = sheet.canEdit === true; // owner GM on a world actor
                        if (ownedFlag && compendiumFlag && canEdit) {
                            record('owned-item-sheet-canEdit', true, null);
                        } else {
                            record(
                                'owned-item-sheet-canEdit',
                                false,
                                `isOwnedByActor=${String(sheet.isOwnedByActor)} isCompendiumItem=${String(sheet.isCompendiumItem)} canEdit=${String(
                                    sheet.canEdit,
                                )}`,
                            );
                        }
                        try {
                            await sheet.close?.();
                        } catch {
                            /* ignore */
                        }
                    }
                } catch (err) {
                    record('owned-item-sheet-canEdit', false, String((err as Error)?.message ?? err));
                }
            } else if (!results.some((r) => r.flow === 'owned-item-sheet-canEdit')) {
                record('owned-item-sheet-canEdit', false, 'owned item not created');
            }

            /* ---------- flow 2: edit-mode-toggle-item ---------- */
            if (ownedItem) {
                try {
                    const sheet = ownedItem.sheet;
                    if (!sheet) {
                        record('edit-mode-toggle-item', false, 'item.sheet undefined');
                    } else {
                        await sheet.render(true);
                        await new Promise((r) => setTimeout(r, 80));
                        // Actor-owned items use the toggle to switch view ↔ edit
                        const before = sheet.inEditMode === true;
                        const handler = sheet.options?.actions?.toggleEditMode;
                        if (typeof handler !== 'function') {
                            record('edit-mode-toggle-item', false, 'toggleEditMode action not registered on item sheet');
                        } else {
                            const event = new MouseEvent('click', { bubbles: false, cancelable: true });
                            const target = document.createElement('div');
                            const rv = handler.call(sheet, event, target);
                            if (rv && typeof rv.then === 'function') await rv;
                            await new Promise((r) => setTimeout(r, 80));
                            const afterFirst = sheet.inEditMode === true;
                            const rv2 = handler.call(sheet, event, target);
                            if (rv2 && typeof rv2.then === 'function') await rv2;
                            await new Promise((r) => setTimeout(r, 80));
                            const afterSecond = sheet.inEditMode === true;
                            if (before === false && afterFirst === true && afterSecond === false) {
                                record('edit-mode-toggle-item', true, null);
                            } else {
                                record('edit-mode-toggle-item', false, `inEditMode trace: ${String(before)} → ${String(afterFirst)} → ${String(afterSecond)}`);
                            }
                        }
                        try {
                            await sheet.close?.();
                        } catch {
                            /* ignore */
                        }
                    }
                } catch (err) {
                    record('edit-mode-toggle-item', false, String((err as Error)?.message ?? err));
                }
            } else {
                record('edit-mode-toggle-item', false, 'owned item not created');
            }

            /* ---------- flow 6: drop-event-on-sheet ---------- */
            try {
                const sheet = actor.sheet;
                if (!sheet) {
                    record('drop-event-on-sheet', false, 'actor.sheet undefined');
                } else {
                    await sheet.render(true);
                    await new Promise((r) => setTimeout(r, 80));
                    // Build a transient world-level item, then invoke the sheet's
                    // _onDropItem handler with a synthesized DragEvent. This is
                    // the entrypoint base-actor-sheet.ts:2351 overrides; the
                    // synthetic path is preferred over a real DOM drag because
                    // playwright's drag plumbing doesn't traverse Foundry's
                    // DataTransfer payload contract.
                    //
                    // Drop a `gear` item rather than a `talent`: character-sheet.ts
                    // intercepts unknown-talent drops and routes them through
                    // AdvancementDialog (issue #17), returning `false` from
                    // _onDropItem to block the direct embed. That branch is the
                    // intended behaviour, not what the sheet-mixin drop flow
                    // wants to exercise — we want the BaseActorSheet pass-through
                    // path that creates the embedded item.
                    const transient = await Item.create({
                        name: 'sheet-mixin-drop-source',
                        type: 'gear',
                        system: { gameSystem: 'dh2e' },
                    });
                    if (!transient) {
                        record('drop-event-on-sheet', false, 'Item.create for drop-source returned null');
                    } else {
                        const beforeCount = actor.items?.contents?.length ?? 0;
                        const dragEvent = new Event('drop', { bubbles: false, cancelable: true });
                        let dropOk = false;
                        let dropDetail: string | null = null;
                        try {
                            const result = await sheet._onDropItem?.(dragEvent, transient);
                            // _onDropItem returns the created Document[] on a fresh
                            // drop, the sort result on an existing item, or false /
                            // undefined on a reject path.
                            const afterCount = actor.items?.contents?.length ?? 0;
                            if (afterCount > beforeCount || (Array.isArray(result) && result.length > 0)) {
                                dropOk = true;
                            } else {
                                dropDetail = `items before=${beforeCount} after=${afterCount} result=${String(result)}`;
                            }
                        } catch (err) {
                            dropDetail = `_onDropItem threw: ${String((err as Error)?.message ?? err)}`;
                        }
                        record('drop-event-on-sheet', dropOk, dropDetail);
                        try {
                            await transient.delete?.();
                        } catch {
                            /* ignore */
                        }
                    }
                    try {
                        await sheet.close?.();
                    } catch {
                        /* ignore */
                    }
                }
            } catch (err) {
                record('drop-event-on-sheet', false, String((err as Error)?.message ?? err));
            }

            /* ---------- flow 4: compendium-item-sheet-readonly ---------- */
            /* ---------- flow 7: prosemirror-gated-in-readonly --------- */
            let compendiumSheet: any = null;
            try {
                const pack = game?.packs?.get?.(talentPackId);
                if (!pack) {
                    record('compendium-item-sheet-readonly', false, `pack ${talentPackId} not found`);
                    record('prosemirror-gated-in-readonly', false, `pack ${talentPackId} not found`);
                } else {
                    const docs = (await pack.getDocuments()) as any[];
                    const sample: any = Array.isArray(docs) ? docs[0] : null;
                    if (!sample) {
                        record('compendium-item-sheet-readonly', false, `pack ${talentPackId} empty`);
                        record('prosemirror-gated-in-readonly', false, `pack ${talentPackId} empty`);
                    } else {
                        compendiumSheet = sample.sheet;
                        if (!compendiumSheet) {
                            record('compendium-item-sheet-readonly', false, 'compendium item sheet undefined');
                            record('prosemirror-gated-in-readonly', false, 'compendium item sheet undefined');
                        } else {
                            await compendiumSheet.render(true);
                            await new Promise((r) => setTimeout(r, 100));

                            // flow 4: assert read-only flags
                            const isCompendium = compendiumSheet.isCompendiumItem === true;
                            const editGatedOff = compendiumSheet.canEdit === false;
                            if (isCompendium && editGatedOff) {
                                record('compendium-item-sheet-readonly', true, null);
                            } else {
                                record(
                                    'compendium-item-sheet-readonly',
                                    false,
                                    `isCompendiumItem=${String(compendiumSheet.isCompendiumItem)} canEdit=${String(compendiumSheet.canEdit)}`,
                                );
                            }

                            // flow 7: ProseMirror gating — `inEditMode` MUST be
                            // false on a compendium item so {{#if inEditMode}}
                            // skips the ProseMirror editor instantiation (CLAUDE.md
                            // gotcha #5). We also verify no `<prose-mirror>` element
                            // is wired into the rendered DOM, since the editor
                            // would have to short-circuit on the gate to keep the
                            // sheet from crashing in compendium read-only context.
                            const inEdit = compendiumSheet.inEditMode === true;
                            const proseEl = compendiumSheet.element?.querySelector?.('prose-mirror');
                            if (!inEdit && proseEl === null) {
                                record('prosemirror-gated-in-readonly', true, null);
                            } else {
                                record(
                                    'prosemirror-gated-in-readonly',
                                    false,
                                    `inEditMode=${String(compendiumSheet.inEditMode)} proseMirrorEl=${proseEl ? 'present' : 'absent'}`,
                                );
                            }

                            try {
                                await compendiumSheet.close?.();
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                }
            } catch (err) {
                const msg = String((err as Error)?.message ?? err);
                if (!results.some((r) => r.flow === 'compendium-item-sheet-readonly')) {
                    record('compendium-item-sheet-readonly', false, msg);
                }
                if (!results.some((r) => r.flow === 'prosemirror-gated-in-readonly')) {
                    record('prosemirror-gated-in-readonly', false, msg);
                }
            }

            /* ---------- cleanup ---------- */
            try {
                await actor.delete?.();
            } catch {
                /* ignore */
            }

            return results;
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, TALENT_PACK);

        return { flows: flows as FlowResult[], pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('sheet mixins (Tier B)', () => {
    test('PrimarySheetMixin + Base*Sheet edit-mode / tab / drop / ProseMirror gating', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeSheetMixins(page);
        const failures: string[] = [];
        const seen = new Set<string>();

        for (const result of probe.flows) {
            seen.add(result.flow);
            if (result.ok && result.detail === null) {
                recordCoverage('sheet-mixin.flow', result.flow);
                continue;
            }
            failures.push(`${result.flow}: ${result.detail ?? 'did not pass'}`);
        }

        for (const expected of SHEET_MIXIN_FLOWS) {
            if (!seen.has(expected)) {
                failures.push(`${expected}: probe did not report on this flow`);
            }
        }

        if (probe.pageErrors.length > 0) {
            failures.push(`page errors: ${probe.pageErrors.slice(0, 3).join(' | ')}`);
        }

        expect(failures, `${failures.length}/${SHEET_MIXIN_FLOWS.length} sheet-mixin flows failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
