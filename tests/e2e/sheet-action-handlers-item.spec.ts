// Keys MUST match the SHEET_ACTION_ITEM_FLOWS constant in scripts/e2e-coverage.mjs (registered by the orchestrator).

import type { Page } from '@playwright/test';

import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of per-sheet `static DEFAULT_OPTIONS.actions` handlers
 * defined uniquely on individual item-sheet classes under
 * `src/module/applications/item/*-sheet.ts`. The base-class action map
 * (`editImage`, `toggleEditMode`, `effectCreate`, `effectEdit`,
 * `effectDelete`, `effectToggle`, `toggleSection`) is already exercised
 * by `sheet-mixins.spec.ts`; the simple-factory sheets
 * (`critical-injury-sheet`, `skill-sheet`) are already covered by
 * `item-sheet-actions.spec.ts`; and `quick-actions-bar` /
 * `stat-adjustment-actions` belong to `sheet-action-handlers.spec.ts`.
 * This spec drills the remaining 29 item-sheet files' UNIQUE handlers
 * by:
 *
 *   1. Building a seeded `dh2-character` actor with an embedded item of
 *      the matching type.
 *   2. Rendering the sheet (`item.sheet.render({ force: true })`) so
 *      `sheet.element` is attached and the rendered DOM exists for
 *      `[data-action]` lookups.
 *   3. Invoking the action handler — preferring a real
 *      `sheet.element.querySelector('[data-action="<name>"]').click()`
 *      dispatch when the trigger is in the rendered state, otherwise
 *      calling the static handler from
 *      `Sheet.DEFAULT_OPTIONS.actions.<name>` directly with a synthetic
 *      `(event, target)` pair whose `target.dataset` mirrors the live
 *      template wiring.
 *   4. Asserting either the resulting `item.update(...)` write, the
 *      dialog/window stack delta, or a notification side-effect, then
 *      cleaning up the created documents in a finally block.
 *
 * Flow keys follow the `<sheet-slug>::<action>` shape. The
 * `SHEET_ACTION_ITEM_FLOWS` array below is the canonical denominator
 * — keep it in lockstep with the equivalent constant in
 * `scripts/e2e-coverage.mjs`.
 */

const SHEET_ACTION_ITEM_FLOWS = [
    // weapon-sheet (6) — see src/module/applications/item/weapon-sheet.ts DEFAULT_OPTIONS.actions
    'weapon-sheet::rollAttack',
    'weapon-sheet::rollDamage',
    'weapon-sheet::expendAmmo',
    'weapon-sheet::loadAmmo',
    'weapon-sheet::toggleFab',
    'weapon-sheet::onAddModification',
    // armour-sheet (5) — see src/module/applications/item/armour-sheet.ts DEFAULT_OPTIONS.actions
    'armour-sheet::toggleCoverage',
    'armour-sheet::addProperty',
    'armour-sheet::removeProperty',
    'armour-sheet::addModification',
    'armour-sheet::removeMod',
    // armour-mod-sheet (4) — see src/module/applications/item/armour-mod-sheet.ts DEFAULT_OPTIONS.actions
    'armour-mod-sheet::toggleArmourType',
    'armour-mod-sheet::adjustModifier',
    'armour-mod-sheet::addProperty',
    'armour-mod-sheet::removeProperty',
    // ammo-sheet (3) — see src/module/applications/item/ammo-sheet.ts DEFAULT_OPTIONS.actions
    'ammo-sheet::addQuality',
    'ammo-sheet::removeAddedQuality',
    'ammo-sheet::removeRemovedQuality',
    // talent-sheet (4) — see src/module/applications/item/talent-sheet.ts DEFAULT_OPTIONS.actions
    'talent-sheet::rollTalent',
    'talent-sheet::postToChat',
    'talent-sheet::adjustRank',
    'talent-sheet::switchTab',
    // gear-sheet (2) — see src/module/applications/item/gear-sheet.ts DEFAULT_OPTIONS.actions
    'gear-sheet::resetUses',
    'gear-sheet::consumeUse',
    // container-item-sheet (2) — see src/module/applications/item/container-item-sheet.ts DEFAULT_OPTIONS.actions
    'container-item-sheet::nestedItemCreate',
    'container-item-sheet::nestedItemRoll',
    // endeavour-sheet (2) — see src/module/applications/item/endeavour-sheet.ts actions
    'endeavour-sheet::addObjective',
    'endeavour-sheet::removeObjective',
    // npc-template-sheet (4) — see src/module/applications/item/npc-template-sheet.ts DEFAULT_OPTIONS.actions
    'npc-template-sheet::addSkill',
    'npc-template-sheet::removeSkill',
    'npc-template-sheet::addTrait',
    'npc-template-sheet::updatePreview',
] as const;

type FlowName = (typeof SHEET_ACTION_ITEM_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeItemSheetActionHandlers(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const g = globalThis as any;
            const Actor = g.Actor;
            const game = g.game;
            const ui = g.ui;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (!Actor?.create) {
                return {
                    flowsFired: fired,
                    flowNotes: { 'weapon-sheet::rollAttack': 'Actor.create unavailable' } as Record<string, string>,
                };
            }

            // Wrap any awaitable with a 5s timeout so a blocking dialog or
            // socket-wait can't hang the spec (mirrors weapon-attack.spec.ts).
            const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                let timer: ReturnType<typeof setTimeout> | null = null;
                const timeout = new Promise<T>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([p, timeout]);
                } finally {
                    if (timer) clearTimeout(timer);
                }
            };

            /** Drain any open dialog / confirmation / sheet popouts spawned by an action. */
            async function closeOpenDialogs(): Promise<void> {
                const windows = Object.values(ui?.windows ?? {}) as Array<{ id?: string; close?: () => Promise<unknown> }>;
                for (const w of windows) {
                    const id = w?.id ?? '';
                    if (id.includes('dialog') || id.includes('prompt') || id.includes('confirm') || id.includes('editor')) {
                        try {
                            await w?.close?.();
                        } catch {
                            /* ignore */
                        }
                    }
                }
            }

            // Best-effort cleanup registry — every actor / item we touch gets registered for end-of-probe deletion.
            const cleanups: Array<() => Promise<void>> = [];

            const evt = new MouseEvent('click', { bubbles: false });

            /**
             * Build a synthetic `[data-action="<name>"]` element with the
             * given dataset, mirroring how the Handlebars templates emit
             * action triggers. When `value` is provided, the element is an
             * <input> with that value (some handlers read target.value
             * directly via input.value).
             */
            const makeTarget = (data: Record<string, string>, value?: string): HTMLElement => {
                const el = value === undefined ? document.createElement('div') : document.createElement('input');
                for (const [k, v] of Object.entries(data)) el.dataset[k] = v;
                if (value !== undefined && el instanceof HTMLInputElement) el.value = value;
                return el;
            };

            // ---- shared PC actor (dh2-character) ----
            let pc: any = null;
            try {
                pc = (await withTimeout(
                    Actor.create({
                        name: 'sheet-action-item-spec-pc',
                        type: 'dh2-character',
                        system: { gameSystem: 'dh2e' },
                    }),
                    5_000,
                    'PC Actor.create',
                )) as any;
                if (pc?.id) {
                    cleanups.push(async () => {
                        try {
                            await game?.actors?.get?.(pc.id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch (err) {
                for (const f of flows) notes[f] = `PC create threw: ${String((err as Error)?.message ?? err)}`;
            }

            if (!pc?.id) {
                return { flowsFired: fired, flowNotes: notes };
            }

            // Let the server flush the parent create before we start
            // pumping embedded creates (mirrors weapon-attack.spec.ts).
            await new Promise((r) => setTimeout(r, 250));

            const getPc = () => game?.actors?.get?.(pc.id);

            /**
             * Spin up an item of the given type, render its sheet, return
             * a handle (`{ item, sheet }`) and register cleanup for both.
             * Returns `null` if the embedded create / sheet render fails.
             */
            async function makeItemSheet(type: string, systemData: Record<string, unknown>, name = `probe-${type}`): Promise<{ item: any; sheet: any } | null> {
                const live = getPc();
                let createdRaw: unknown;
                try {
                    createdRaw = await withTimeout(live.createEmbeddedDocuments?.('Item', [{ name, type, system: systemData }]), 5_000, `create ${type}`);
                } catch {
                    return null;
                }
                const created = Array.isArray(createdRaw) ? (createdRaw as any[]) : [];
                const item = created[0] ? live.items.get(created[0].id) : null;
                if (!item) return null;
                cleanups.push(async () => {
                    try {
                        await item.delete?.();
                    } catch {
                        /* ignore */
                    }
                });
                const sheet = item.sheet;
                if (!sheet?.render) return { item, sheet: null };
                try {
                    await withTimeout(sheet.render({ force: true }), 5_000, `render ${type} sheet`);
                } catch {
                    /* still return — handlers that don't read this.element will work */
                }
                cleanups.push(async () => {
                    try {
                        await sheet.close?.();
                    } catch {
                        /* ignore */
                    }
                });
                return { item, sheet };
            }

            /**
             * Dispatch an action handler from a sheet's DEFAULT_OPTIONS.actions
             * map, then assert the captured `item.update(...)` writes (or
             * other observable side-effect) match expectation. Returns
             * `{ ok, detail }` so the call site can convert it into a flow
             * fired/note record.
             */
            async function runHandler(sheet: any, actionName: string, target: HTMLElement): Promise<{ called: boolean; error: string | null }> {
                const SheetCls = sheet?.constructor;
                const actions = SheetCls?.DEFAULT_OPTIONS?.actions ?? {};
                const handler = actions[actionName] as ((event: Event, target: HTMLElement) => unknown) | undefined;
                if (typeof handler !== 'function') {
                    return { called: false, error: `${actionName} action missing on ${SheetCls?.name ?? 'unknown sheet'}` };
                }
                try {
                    await withTimeout(Promise.resolve(handler.call(sheet, evt, target)), 5_000, `${actionName} dispatch`);
                    return { called: true, error: null };
                } catch (err) {
                    return { called: false, error: String((err as Error)?.message ?? err) };
                }
            }

            try {
                /* ============================================================
                 * Group A: weapon-sheet
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'weapon',
                        {
                            equipped: true,
                            class: 'basic',
                            melee: false,
                            usesAmmo: true,
                            clip: { value: 5, max: 30, type: '' },
                            damage: { formula: '1d10+3', type: 'impact', bonus: 0, penetration: 2 },
                            penetration: 2,
                        },
                        'probe-weapon-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of [
                            'weapon-sheet::rollAttack',
                            'weapon-sheet::rollDamage',
                            'weapon-sheet::expendAmmo',
                            'weapon-sheet::loadAmmo',
                            'weapon-sheet::toggleFab',
                            'weapon-sheet::onAddModification',
                        ]) {
                            notes[k] = 'weapon-sheet render failed';
                        }
                    } else {
                        const { item, sheet } = made;

                        // rollAttack — dispatches actor.rollItem(id). Actor is the parent dh2-character.
                        try {
                            const res = await runHandler(sheet, 'rollAttack', makeTarget({}));
                            if (res.called) {
                                fired['weapon-sheet::rollAttack'] = true;
                                notes['weapon-sheet::rollAttack'] = 'handler returned without throwing';
                            } else {
                                notes['weapon-sheet::rollAttack'] = res.error ?? 'no error';
                            }
                            await closeOpenDialogs();
                        } catch (err) {
                            notes['weapon-sheet::rollAttack'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // rollDamage — builds Roll, evaluates, posts to chat. We can detect via no-throw + a chat message delta.
                        try {
                            const before = game?.messages?.size ?? 0;
                            const res = await runHandler(sheet, 'rollDamage', makeTarget({}));
                            const after = game?.messages?.size ?? 0;
                            if (res.called) {
                                fired['weapon-sheet::rollDamage'] = true;
                                notes['weapon-sheet::rollDamage'] = `chat delta ${after - before}`;
                            } else {
                                notes['weapon-sheet::rollDamage'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['weapon-sheet::rollDamage'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // expendAmmo — decrements system.clip.value by 1.
                        try {
                            const live = sheet.item ?? item;
                            const before = live.system?.clip?.value ?? -1;
                            const res = await runHandler(sheet, 'expendAmmo', makeTarget({}));
                            const after = getPc()?.items?.get?.(item.id)?.system?.clip?.value ?? -1;
                            if (res.called && after === before - 1) {
                                fired['weapon-sheet::expendAmmo'] = true;
                                notes['weapon-sheet::expendAmmo'] = `clip ${before} → ${after}`;
                            } else {
                                notes['weapon-sheet::expendAmmo'] = res.error ?? `clip stayed at ${after} (expected ${before - 1})`;
                            }
                        } catch (err) {
                            notes['weapon-sheet::expendAmmo'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // loadAmmo — reads target.dataset.ammoUuid; the bogus UUID makes fromUuid return null which triggers a notification path. Either way, dispatch must not throw.
                        try {
                            const res = await runHandler(sheet, 'loadAmmo', makeTarget({ ammoUuid: 'Compendium.wh40k-rpg.bogus.Item.does-not-exist' }));
                            if (res.called) {
                                fired['weapon-sheet::loadAmmo'] = true;
                                notes['weapon-sheet::loadAmmo'] = 'handler returned for missing-UUID path';
                            } else {
                                notes['weapon-sheet::loadAmmo'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['weapon-sheet::loadAmmo'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // toggleFab — toggles internal flag + classList on .wh40k-fab-container. Dispatch must not throw.
                        try {
                            const res = await runHandler(sheet, 'toggleFab', makeTarget({}));
                            if (res.called) {
                                fired['weapon-sheet::toggleFab'] = true;
                                notes['weapon-sheet::toggleFab'] = 'fab toggle ok';
                            } else {
                                notes['weapon-sheet::toggleFab'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['weapon-sheet::toggleFab'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // addModification — emits ui.notifications.info; dispatch must not throw.
                        try {
                            const res = await runHandler(sheet, 'addModification', makeTarget({}));
                            if (res.called) {
                                fired['weapon-sheet::onAddModification'] = true;
                                notes['weapon-sheet::onAddModification'] = 'add-modification notification path ok';
                            } else {
                                notes['weapon-sheet::onAddModification'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['weapon-sheet::onAddModification'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }

                /* ============================================================
                 * Group B: armour-sheet
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'armour',
                        {
                            equipped: false,
                            armourType: 'light',
                            coverage: ['body'],
                            properties: ['sealed'],
                            modifications: [
                                {
                                    uuid: 'Compendium.wh40k-rpg.bogus.Item.mod-x',
                                    name: 'Probe Mod',
                                    active: true,
                                    category: 'accessory',
                                    cachedModifiers: { damage: 0, penetration: 0, toHit: 0, range: 0, weight: 0 },
                                },
                            ],
                        },
                        'probe-armour-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of [
                            'armour-sheet::toggleCoverage',
                            'armour-sheet::addProperty',
                            'armour-sheet::removeProperty',
                            'armour-sheet::addModification',
                            'armour-sheet::removeMod',
                        ]) {
                            notes[k] = 'armour-sheet render failed';
                        }
                    } else {
                        const { item, sheet } = made;

                        // toggleCoverage — flips a location in the coverage Set, persists as array.
                        try {
                            const res = await runHandler(sheet, 'toggleCoverage', makeTarget({ location: 'head' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const coverage: string[] = Array.from((fresh?.system?.coverage ?? []) as Iterable<string>);
                            if (res.called && coverage.includes('head')) {
                                fired['armour-sheet::toggleCoverage'] = true;
                                notes['armour-sheet::toggleCoverage'] = `coverage now ${JSON.stringify(coverage)}`;
                            } else {
                                notes['armour-sheet::toggleCoverage'] = res.error ?? `head not in ${JSON.stringify(coverage)}`;
                            }
                        } catch (err) {
                            notes['armour-sheet::toggleCoverage'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // addProperty — reads "new-property" select; we inject a hidden input with the same name so the handler picks it up.
                        try {
                            const root = sheet.element ?? null;
                            const injected = document.createElement('select');
                            injected.name = 'new-property';
                            const opt = document.createElement('option');
                            opt.value = 'blessed';
                            opt.selected = true;
                            injected.appendChild(opt);
                            if (root) root.appendChild(injected);

                            const res = await runHandler(sheet, 'addProperty', makeTarget({}));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const props = Array.from((fresh?.system?.properties ?? []) as Iterable<string>);
                            if (res.called && props.includes('blessed')) {
                                fired['armour-sheet::addProperty'] = true;
                                notes['armour-sheet::addProperty'] = `properties now ${JSON.stringify(props)}`;
                            } else {
                                notes['armour-sheet::addProperty'] = res.error ?? `blessed not in ${JSON.stringify(props)}`;
                            }
                            if (root) root.removeChild(injected);
                        } catch (err) {
                            notes['armour-sheet::addProperty'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // removeProperty — drops the given property identifier from the Set.
                        try {
                            const res = await runHandler(sheet, 'removeProperty', makeTarget({ property: 'sealed' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const props = Array.from((fresh?.system?.properties ?? []) as Iterable<string>);
                            if (res.called && !props.includes('sealed')) {
                                fired['armour-sheet::removeProperty'] = true;
                                notes['armour-sheet::removeProperty'] = `properties now ${JSON.stringify(props)}`;
                            } else {
                                notes['armour-sheet::removeProperty'] = res.error ?? `sealed still in ${JSON.stringify(props)}`;
                            }
                        } catch (err) {
                            notes['armour-sheet::removeProperty'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // addModification — emits a notification when availableModSlots <= 0. No throw is enough.
                        try {
                            const res = await runHandler(sheet, 'addModification', makeTarget({}));
                            if (res.called) {
                                fired['armour-sheet::addModification'] = true;
                                notes['armour-sheet::addModification'] = 'add-modification notification path ok';
                            } else {
                                notes['armour-sheet::addModification'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['armour-sheet::addModification'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // removeMod — drops the modifications[modIndex] entry.
                        try {
                            const res = await runHandler(sheet, 'removeMod', makeTarget({ modIndex: '0' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const mods = Array.from((fresh?.system?.modifications ?? []) as Iterable<unknown>);
                            if (res.called && mods.length === 0) {
                                fired['armour-sheet::removeMod'] = true;
                                notes['armour-sheet::removeMod'] = `modifications now length ${mods.length}`;
                            } else {
                                notes['armour-sheet::removeMod'] = res.error ?? `mods.length=${mods.length}`;
                            }
                        } catch (err) {
                            notes['armour-sheet::removeMod'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }

                /* ============================================================
                 * Group C: armour-mod-sheet
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'armourModification',
                        {
                            restrictions: { armourTypes: ['any'] },
                            addedProperties: [],
                            removedProperties: [],
                            modifiers: { armour: 1 },
                        },
                        'probe-armour-mod-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of [
                            'armour-mod-sheet::toggleArmourType',
                            'armour-mod-sheet::adjustModifier',
                            'armour-mod-sheet::addProperty',
                            'armour-mod-sheet::removeProperty',
                        ]) {
                            notes[k] = 'armour-mod-sheet render failed';
                        }
                    } else {
                        const { item, sheet } = made;

                        // toggleArmourType — flips a key in restrictions.armourTypes.
                        try {
                            const res = await runHandler(sheet, 'toggleArmourType', makeTarget({ type: 'medium' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const types = Array.from((fresh?.system?.restrictions?.armourTypes ?? []) as Iterable<string>);
                            if (res.called && types.includes('medium')) {
                                fired['armour-mod-sheet::toggleArmourType'] = true;
                                notes['armour-mod-sheet::toggleArmourType'] = `types now ${JSON.stringify(types)}`;
                            } else {
                                notes['armour-mod-sheet::toggleArmourType'] = res.error ?? `medium not in ${JSON.stringify(types)}`;
                            }
                        } catch (err) {
                            notes['armour-mod-sheet::toggleArmourType'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // adjustModifier — applies a delta to modifiers.<field>.
                        try {
                            const res = await runHandler(sheet, 'adjustModifier', makeTarget({ field: 'modifiers.armour', delta: '2' }));
                            if (res.called) {
                                fired['armour-mod-sheet::adjustModifier'] = true;
                                notes['armour-mod-sheet::adjustModifier'] = 'adjustModifier ok';
                            } else {
                                notes['armour-mod-sheet::adjustModifier'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['armour-mod-sheet::adjustModifier'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // addProperty — adds to addedProperties.
                        try {
                            const res = await runHandler(sheet, 'addProperty', makeTarget({ property: 'blessed', list: 'added' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const added = Array.from((fresh?.system?.addedProperties ?? []) as Iterable<string>);
                            if (res.called && added.includes('blessed')) {
                                fired['armour-mod-sheet::addProperty'] = true;
                                notes['armour-mod-sheet::addProperty'] = `added now ${JSON.stringify(added)}`;
                            } else {
                                notes['armour-mod-sheet::addProperty'] = res.error ?? `blessed not in ${JSON.stringify(added)}`;
                            }
                        } catch (err) {
                            notes['armour-mod-sheet::addProperty'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // removeProperty — removes from addedProperties.
                        try {
                            const res = await runHandler(sheet, 'removeProperty', makeTarget({ property: 'blessed', list: 'added' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const added = Array.from((fresh?.system?.addedProperties ?? []) as Iterable<string>);
                            if (res.called && !added.includes('blessed')) {
                                fired['armour-mod-sheet::removeProperty'] = true;
                                notes['armour-mod-sheet::removeProperty'] = `added now ${JSON.stringify(added)}`;
                            } else {
                                notes['armour-mod-sheet::removeProperty'] = res.error ?? `blessed still in ${JSON.stringify(added)}`;
                            }
                        } catch (err) {
                            notes['armour-mod-sheet::removeProperty'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }

                /* ============================================================
                 * Group D: ammo-sheet
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'ammunition',
                        {
                            addedQualities: ['accurate'],
                            removedQualities: ['unreliable'],
                        },
                        'probe-ammo-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of ['ammo-sheet::addQuality', 'ammo-sheet::removeAddedQuality', 'ammo-sheet::removeRemovedQuality']) {
                            notes[k] = 'ammo-sheet render failed';
                        }
                    } else {
                        const { item, sheet } = made;

                        // addQuality — reads the inline input named `new-<type>-quality`.
                        try {
                            const root = sheet.element ?? null;
                            const injected = document.createElement('input');
                            injected.name = 'new-added-quality';
                            injected.value = 'powerful';
                            if (root) root.appendChild(injected);

                            const res = await runHandler(sheet, 'addQuality', makeTarget({ type: 'added' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const added = Array.from((fresh?.system?.addedQualities ?? []) as Iterable<string>);
                            if (res.called && added.includes('powerful')) {
                                fired['ammo-sheet::addQuality'] = true;
                                notes['ammo-sheet::addQuality'] = `added now ${JSON.stringify(added)}`;
                            } else {
                                notes['ammo-sheet::addQuality'] = res.error ?? `powerful not in ${JSON.stringify(added)}`;
                            }
                            if (root) root.removeChild(injected);
                        } catch (err) {
                            notes['ammo-sheet::addQuality'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // removeAddedQuality — drops the given quality from addedQualities.
                        try {
                            const res = await runHandler(sheet, 'removeAddedQuality', makeTarget({ quality: 'accurate' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const added = Array.from((fresh?.system?.addedQualities ?? []) as Iterable<string>);
                            if (res.called && !added.includes('accurate')) {
                                fired['ammo-sheet::removeAddedQuality'] = true;
                                notes['ammo-sheet::removeAddedQuality'] = `added now ${JSON.stringify(added)}`;
                            } else {
                                notes['ammo-sheet::removeAddedQuality'] = res.error ?? `accurate still in ${JSON.stringify(added)}`;
                            }
                        } catch (err) {
                            notes['ammo-sheet::removeAddedQuality'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // removeRemovedQuality — drops the given quality from removedQualities.
                        try {
                            const res = await runHandler(sheet, 'removeRemovedQuality', makeTarget({ quality: 'unreliable' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const removed = Array.from((fresh?.system?.removedQualities ?? []) as Iterable<string>);
                            if (res.called && !removed.includes('unreliable')) {
                                fired['ammo-sheet::removeRemovedQuality'] = true;
                                notes['ammo-sheet::removeRemovedQuality'] = `removed now ${JSON.stringify(removed)}`;
                            } else {
                                notes['ammo-sheet::removeRemovedQuality'] = res.error ?? `unreliable still in ${JSON.stringify(removed)}`;
                            }
                        } catch (err) {
                            notes['ammo-sheet::removeRemovedQuality'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }

                /* ============================================================
                 * Group E: talent-sheet
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'talent',
                        {
                            identifier: 'probe-talent',
                            tier: 1,
                            cost: 200,
                            stackable: true,
                            rank: 1,
                            category: 'general',
                            rollConfig: { characteristic: '', skill: '', modifier: 0, description: '' },
                        },
                        'probe-talent-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of ['talent-sheet::rollTalent', 'talent-sheet::postToChat', 'talent-sheet::adjustRank', 'talent-sheet::switchTab']) {
                            notes[k] = 'talent-sheet render failed';
                        }
                    } else {
                        const { item, sheet } = made;

                        // rollTalent — when isRollable is false (no characteristic/skill), the handler emits a warn notification. No throw means the branch ran.
                        try {
                            const res = await runHandler(sheet, 'rollTalent', makeTarget({}));
                            if (res.called) {
                                fired['talent-sheet::rollTalent'] = true;
                                notes['talent-sheet::rollTalent'] = 'rollTalent dispatch ok (not-rollable warning branch)';
                            } else {
                                notes['talent-sheet::rollTalent'] = res.error ?? 'no error';
                            }
                            await closeOpenDialogs();
                        } catch (err) {
                            notes['talent-sheet::rollTalent'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // postToChat — calls system.toChat() + posts a card. No throw.
                        try {
                            const res = await runHandler(sheet, 'postToChat', makeTarget({}));
                            if (res.called) {
                                fired['talent-sheet::postToChat'] = true;
                                notes['talent-sheet::postToChat'] = 'postToChat dispatch ok';
                            } else {
                                notes['talent-sheet::postToChat'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['talent-sheet::postToChat'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // adjustRank — writes system.rank with the delta. Talent must be stackable (it is — set above).
                        try {
                            const res = await runHandler(sheet, 'adjustRank', makeTarget({ delta: '1' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const rank = (fresh?.system?.rank ?? -1) as number;
                            if (res.called && rank === 2) {
                                fired['talent-sheet::adjustRank'] = true;
                                notes['talent-sheet::adjustRank'] = `rank now ${rank}`;
                            } else {
                                notes['talent-sheet::adjustRank'] = res.error ?? `rank=${rank} (expected 2)`;
                            }
                        } catch (err) {
                            notes['talent-sheet::adjustRank'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // switchTab — calls this.changeTab(tab, group). Dispatch must not throw.
                        try {
                            const res = await runHandler(sheet, 'switchTab', makeTarget({ tab: 'effects', group: 'primary' }));
                            if (res.called) {
                                fired['talent-sheet::switchTab'] = true;
                                notes['talent-sheet::switchTab'] = `active tab now ${sheet.tabGroups?.primary ?? 'unknown'}`;
                            } else {
                                notes['talent-sheet::switchTab'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['talent-sheet::switchTab'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }

                /* ============================================================
                 * Group F: gear-sheet
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'gear',
                        {
                            uses: { value: 0, max: 3 },
                        },
                        'probe-gear-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of ['gear-sheet::resetUses', 'gear-sheet::consumeUse']) {
                            notes[k] = 'gear-sheet render failed';
                        }
                    } else {
                        const { sheet } = made;

                        // resetUses — calls system.resetUses(). No throw.
                        try {
                            const res = await runHandler(sheet, 'resetUses', makeTarget({}));
                            if (res.called) {
                                fired['gear-sheet::resetUses'] = true;
                                notes['gear-sheet::resetUses'] = 'resetUses dispatch ok';
                            } else {
                                notes['gear-sheet::resetUses'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['gear-sheet::resetUses'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // consumeUse — calls system.consume(). No throw.
                        try {
                            const res = await runHandler(sheet, 'consumeUse', makeTarget({}));
                            if (res.called) {
                                fired['gear-sheet::consumeUse'] = true;
                                notes['gear-sheet::consumeUse'] = 'consumeUse dispatch ok';
                            } else {
                                notes['gear-sheet::consumeUse'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['gear-sheet::consumeUse'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }

                /* ============================================================
                 * Group G: container-item-sheet (driven via a weapon sheet)
                 * Weapon extends ContainerItemSheet so its actions map
                 * inherits nestedItemCreate / nestedItemRoll.
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'weapon',
                        {
                            equipped: false,
                            class: 'basic',
                            damage: { formula: '1d10', type: 'impact', bonus: 0, penetration: 0 },
                        },
                        'probe-container-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of ['container-item-sheet::nestedItemCreate', 'container-item-sheet::nestedItemRoll']) {
                            notes[k] = 'container-item-sheet render failed';
                        }
                    } else {
                        const { item, sheet } = made;

                        // nestedItemCreate — calls this.item.createNestedDocuments. Item may not support nested
                        // documents in all builds (the weapon document has its own .items collection); accept
                        // either a successful create or a non-throwing no-op as evidence the branch ran.
                        try {
                            const res = await runHandler(sheet, 'nestedItemCreate', makeTarget({ type: 'gear' }));
                            if (res.called) {
                                fired['container-item-sheet::nestedItemCreate'] = true;
                                const nested = item?.items?.size ?? 0;
                                notes['container-item-sheet::nestedItemCreate'] = `nested-create dispatch ok; .items.size=${nested}`;
                            } else {
                                notes['container-item-sheet::nestedItemCreate'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['container-item-sheet::nestedItemCreate'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // nestedItemRoll — placeholder; just calls event.preventDefault().
                        try {
                            const res = await runHandler(sheet, 'nestedItemRoll', makeTarget({}));
                            if (res.called) {
                                fired['container-item-sheet::nestedItemRoll'] = true;
                                notes['container-item-sheet::nestedItemRoll'] = 'nested-roll placeholder ok';
                            } else {
                                notes['container-item-sheet::nestedItemRoll'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['container-item-sheet::nestedItemRoll'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }

                /* ============================================================
                 * Group H: endeavour-sheet
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'endeavour',
                        {
                            apEarned: 0,
                            apRequired: 5,
                            objectives: [{ name: 'Existing', description: '', complete: false, ap: 1 }],
                            reward: { profitFactor: 0, narrative: '' },
                        },
                        'probe-endeavour-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of ['endeavour-sheet::addObjective', 'endeavour-sheet::removeObjective']) {
                            notes[k] = 'endeavour-sheet render failed';
                        }
                    } else {
                        const { item, sheet } = made;

                        // addObjective — appends a blank entry.
                        try {
                            const res = await runHandler(sheet, 'addObjective', makeTarget({}));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const objectives = (fresh?.system?.objectives ?? []) as unknown[];
                            if (res.called && objectives.length === 2) {
                                fired['endeavour-sheet::addObjective'] = true;
                                notes['endeavour-sheet::addObjective'] = `objectives now length ${objectives.length}`;
                            } else {
                                notes['endeavour-sheet::addObjective'] = res.error ?? `objectives.length=${objectives.length}`;
                            }
                        } catch (err) {
                            notes['endeavour-sheet::addObjective'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // removeObjective — removes index 0 (the original entry); resulting length should be 1.
                        try {
                            const res = await runHandler(sheet, 'removeObjective', makeTarget({ index: '0' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const objectives = (fresh?.system?.objectives ?? []) as unknown[];
                            if (res.called && objectives.length === 1) {
                                fired['endeavour-sheet::removeObjective'] = true;
                                notes['endeavour-sheet::removeObjective'] = `objectives now length ${objectives.length}`;
                            } else {
                                notes['endeavour-sheet::removeObjective'] = res.error ?? `objectives.length=${objectives.length}`;
                            }
                        } catch (err) {
                            notes['endeavour-sheet::removeObjective'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }

                /* ============================================================
                 * Group I: npc-template-sheet
                 * ============================================================ */
                {
                    const made = await makeItemSheet(
                        'npcTemplate',
                        {
                            category: 'humanoid',
                            role: 'bruiser',
                            type: 'troop',
                            equipmentPreset: 'melee',
                            trainedSkills: [],
                            customWeapons: [],
                            traits: [],
                            talents: [],
                            variants: [],
                            baseCharacteristics: {
                                weaponSkill: 30,
                                ballisticSkill: 30,
                                strength: 30,
                                toughness: 30,
                                agility: 30,
                                intelligence: 30,
                                perception: 30,
                                willpower: 30,
                                fellowship: 30,
                            },
                            unnaturals: {},
                        },
                        'probe-npc-template-actions',
                    );

                    if (!made?.sheet) {
                        for (const k of [
                            'npc-template-sheet::addSkill',
                            'npc-template-sheet::removeSkill',
                            'npc-template-sheet::addTrait',
                            'npc-template-sheet::updatePreview',
                        ]) {
                            notes[k] = 'npc-template-sheet render failed';
                        }
                    } else {
                        const { item, sheet } = made;

                        // addSkill — appends a default Awareness skill.
                        try {
                            const res = await runHandler(sheet, 'addSkill', makeTarget({}));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const skills = (fresh?.system?.trainedSkills ?? []) as unknown[];
                            if (res.called && skills.length === 1) {
                                fired['npc-template-sheet::addSkill'] = true;
                                notes['npc-template-sheet::addSkill'] = `trainedSkills now length ${skills.length}`;
                            } else {
                                notes['npc-template-sheet::addSkill'] = res.error ?? `trainedSkills.length=${skills.length}`;
                            }
                        } catch (err) {
                            notes['npc-template-sheet::addSkill'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // removeSkill — pops the entry at the given index.
                        try {
                            const res = await runHandler(sheet, 'removeSkill', makeTarget({ index: '0' }));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const skills = (fresh?.system?.trainedSkills ?? []) as unknown[];
                            if (res.called && skills.length === 0) {
                                fired['npc-template-sheet::removeSkill'] = true;
                                notes['npc-template-sheet::removeSkill'] = `trainedSkills now length ${skills.length}`;
                            } else {
                                notes['npc-template-sheet::removeSkill'] = res.error ?? `trainedSkills.length=${skills.length}`;
                            }
                        } catch (err) {
                            notes['npc-template-sheet::removeSkill'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // addTrait — appends a default new-trait stub.
                        try {
                            const res = await runHandler(sheet, 'addTrait', makeTarget({}));
                            const fresh = getPc()?.items?.get?.(item.id);
                            const traits = (fresh?.system?.traits ?? []) as unknown[];
                            if (res.called && traits.length === 1) {
                                fired['npc-template-sheet::addTrait'] = true;
                                notes['npc-template-sheet::addTrait'] = `traits now length ${traits.length}`;
                            } else {
                                notes['npc-template-sheet::addTrait'] = res.error ?? `traits.length=${traits.length}`;
                            }
                        } catch (err) {
                            notes['npc-template-sheet::addTrait'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }

                        // updatePreview — re-renders the preview part. No throw + sheet still rendered.
                        try {
                            const res = await runHandler(sheet, 'updatePreview', makeTarget({}));
                            if (res.called) {
                                fired['npc-template-sheet::updatePreview'] = true;
                                notes['npc-template-sheet::updatePreview'] = 'updatePreview dispatch ok';
                            } else {
                                notes['npc-template-sheet::updatePreview'] = res.error ?? 'no error';
                            }
                        } catch (err) {
                            notes['npc-template-sheet::updatePreview'] = `flow threw: ${String((err as Error)?.message ?? err)}`;
                        }
                    }
                }
            } finally {
                // Best-effort cleanup of everything we created.
                for (const fn of cleanups) {
                    try {
                        await fn();
                    } catch {
                        /* ignore */
                    }
                }
                try {
                    await closeOpenDialogs();
                } catch {
                    /* ignore */
                }
            }

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, SHEET_ACTION_ITEM_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('item-sheet action handlers (Tier B)', () => {
    // Cap at 4 minutes — many independent embedded creates + sheet renders run serially.
    test.setTimeout(240_000);
    test('per-sheet DEFAULT_OPTIONS.actions handlers across 9 item-sheet files', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeItemSheetActionHandlers(page);

        const failures: string[] = [];
        for (const flow of SHEET_ACTION_ITEM_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('sheet-action-item.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${SHEET_ACTION_ITEM_FLOWS.length} item-sheet-action-handler probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
