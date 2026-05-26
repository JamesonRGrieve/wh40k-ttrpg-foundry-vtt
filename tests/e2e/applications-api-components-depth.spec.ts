import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Keys MUST match the APP_API_DEPTH_FLOWS constant in scripts/e2e-coverage.mjs (registered by the orchestrator).
 *
 * Tier B depth coverage of the REMAINING uncovered modules in
 * `src/module/applications/api/` and `src/module/applications/components/`
 * plus deeper branches into the api/components surfaces that
 * `applications-tours-extra.spec.ts` only touches at entry-point level.
 * `sheet-mixins.spec.ts` already covers `primary-sheet-mixin` + the base
 * sheet classes, and `sheet-action-handlers.spec.ts` covers `quick-
 * actions-bar` + `stat-adjustment-actions`. The dimensions below pick up
 * everything else under the api/ and components/ folders plus the icons/
 * helper pair that the existing handlebars-helpers-extra spec leaves dark.
 *
 * Per-module coverage targets (read each source file before extending):
 *
 *   New module coverage:
 *   - src/module/applications/api/drag-drop-api-mixin.ts (DragDropMixin —
 *     `_allowedDropBehaviors` / `_defaultDropBehavior` / `_dropBehavior`
 *     modifier-key + same-collection branches; `_onDragStart`
 *     dataTransfer.effectAllowed flip when isOwner=false).
 *   - src/module/applications/api/drag-drop-visual-mixin.ts
 *     (EnhancedDragDropMixin — `_createDragGhost` ghost markup;
 *     `_canSplitItem` quantity + type gate; `_validateEquipmentSlot`
 *     weapon/armour slot matching; `_resetDrag` cleanup; favorites
 *     getFavoriteItems / removeFromFavorites / clearFavorites public API).
 *   - src/module/applications/api/expandable-tooltip-mixin.ts
 *     (ExpandableTooltipMixin — `toggleExpandable` action open + close;
 *     `openExpandable` / `closeExpandable` programmatic API;
 *     `isPanelOpen` / `getOpenPanels` accessors; `_attachPartListeners`
 *     Escape + outside-click handlers).
 *   - src/module/applications/api/visual-feedback-mixin.ts
 *     (VisualFeedbackMixin — `_findFieldElement` selector fallback chain;
 *     `_getAnimationClass` wounds/xp/up/down/default branches;
 *     `_animateCounter` requestAnimationFrame settle; `visualizeChanges`
 *     flattens + compares; `animateStatChange` public API; `_applyAnimation`
 *     class swap; `_showBriefNotification` DOM injection).
 *   - src/module/applications/components/wh40k-tooltip.ts (TooltipsWH40K
 *     `_buildCharacteristicTooltip` / `_buildSkillTooltip` /
 *     `_buildArmorTooltip` / `_buildWeaponTooltip` / `_buildModifierTooltip`
 *     / `_buildQualityTooltip` / `_buildGenericTooltip` builder functions;
 *     `prepareArmorTooltipData` / `prepareModifierTooltipData` /
 *     `prepareQualityTooltipData` free helpers; `getSkillDescription`
 *     normalization).
 *   - src/module/icons/icon.ts (icon — registry lookup + size + label
 *     options; hasIcon — type guard; listIcons — sorted enumeration).
 *   - src/module/icons/helper.ts (registerIconHelper — Handlebars
 *     `{{iconSvg}}` registration + unknown-key warning + hash opts).
 *
 *   Deeper branches of modules already touched at entry level:
 *   - src/module/applications/api/application-v2-mixin.ts
 *     (`_renderContainers` data-container-id placement, `subtitle` i18n
 *     getter, `_disableFields` readonly/disabled flips).
 *   - src/module/applications/api/dialog.ts (DialogWH40K — `wait()` Promise
 *     resolve + `resolve(result)` static flag flip).
 *   - src/module/applications/api/what-if-mixin.ts (WhatIfMixin — exit
 *     resets `_whatIfActive` + clears DOM; `_applyChange` when inactive
 *     forwards straight to document.update).
 *   - src/module/applications/api/stat-breakdown-mixin.ts
 *     (StatBreakdownMixin — variant rows: positive vs negative mod with /
 *     without source uuid; total row arithmetic; close-button cleanup).
 *   - src/module/applications/api/collapsible-panel-mixin.ts
 *     (CollapsiblePanelMixin — expand-then-collapse round-trip flips
 *     expandedSections; `applyPanelPreset('combat')` writes the preset
 *     map; `_getPanelFlagKey` per-document key shape).
 *   - src/module/applications/api/enhanced-animations-mixin.ts
 *     (EnhancedAnimationsMixin — `_shouldSkipAnimation` reduced-motion
 *     gate, `animateCounter` early-out when from===to, `_flashElement`
 *     reflow + remove).
 *
 * Strategy mirrors applications-tours-extra.spec.ts: every probe runs in
 * one `page.evaluate` round-trip, dynamic-imports the deployed module URL
 * (`/systems/wh40k-rpg/module/...js`), exercises the constructor + static
 * config + pure helpers + public action handlers where reachable
 * headlessly, and tears down any created document / window in a finally
 * block. Mixins are exercised by mixing the imported factory onto a
 * minimal headless base that supplies only the host members each mixin
 * touches.
 *
 * Collect-failures-then-assert pattern matches weapon-attack.spec.ts.
 */

const APP_API_DEPTH_FLOWS = [
    'drag-drop-api-allowed-behaviors',
    'drag-drop-api-default-behavior',
    'drag-drop-api-modifier-keys',
    'drag-drop-visual-ghost-and-split',
    'drag-drop-visual-validate-slot',
    'drag-drop-visual-favorites-api',
    'expandable-tooltip-toggle-action',
    'expandable-tooltip-programmatic-api',
    'visual-feedback-find-and-classify',
    'visual-feedback-animate-counter',
    'visual-feedback-visualize-changes',
    'wh40k-tooltip-builders',
    'wh40k-tooltip-static-data-helpers',
    'icons-helper-resolution',
    'icons-handlebars-registration',
    'appv2-mixin-subtitle-and-disable',
    'dialog-wait-and-resolve',
    'whatif-mixin-exit-and-direct-apply',
    'statbreakdown-mixin-variant-rows',
    'collapsible-panel-roundtrip',
    'collapsible-panel-apply-preset',
    'enhanced-animations-skip-and-flash',
] as const;

interface ProbeResult {
    flowsFired: Record<string, boolean>;
    flowNotes: Record<string, string | undefined>;
    pageErrors: string[];
}

async function probeAppApiDepthFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async (flows: readonly string[]): Promise<{ flowsFired: Record<string, boolean>; flowNotes: Record<string, string> }> => {
                // ---- Headless-probe runtime shapes -------------------------------
                // The Foundry browser globals and the dynamic-imported system
                // modules are runtime-only; describe just the members each flow
                // touches so the probe stays fully typed without leaking `any`.
                // Foundry document/flag values are dynamic — model the return shapes
                // the probe actually inspects (flag scalars) and use `void` for the
                // fire-and-forget mutators whose result the probe never reads.
                type FlagValue = string | string[] | null | undefined;
                // Document-creation payloads the probe authors (name + type + a
                // shallow system block); concrete shape, not a Foundry boundary cast.
                interface DocCreateData {
                    name: string;
                    type: string;
                    system: { gameSystem: string; quantity?: number };
                }
                interface ProbeActor {
                    id?: string | null;
                    items: { get: (id: string) => ProbeItem | null | undefined };
                    createEmbeddedDocuments: (type: string, data: DocCreateData[]) => Promise<ProbeItem[]>;
                    setFlag: (scope: string, key: string, value: FlagValue) => Promise<void>;
                    getFlag?: (scope: string, key: string) => FlagValue;
                    unsetFlag?: (scope: string, key: string) => Promise<void>;
                    delete?: () => Promise<void>;
                }
                interface ProbeItem {
                    id: string;
                    delete?: () => Promise<void>;
                }
                interface ProbeWindow {
                    id?: string;
                    close?: () => Promise<void>;
                }
                interface FoundryGlobal {
                    Actor: { create: (data: DocCreateData) => Promise<ProbeActor | null> };
                    game: { actors?: { get?: (id: string) => ProbeActor | null | undefined } };
                    ui: { windows?: Record<string, ProbeWindow> };
                    Handlebars?: { helpers: Record<string, HandlebarsHelperFn | undefined> };
                }
                type HandlebarsHelperFn = (key: string, opts: { hash?: Record<string, string> }) => { toString: () => string };
                // Factory + instance shapes for the mixins under test. Each mixin's
                // mixed class exposes only the members the matching flow drives.
                type StubCtor = new (...args: never[]) => object;
                type MixinFactory<T> = (base: StubCtor) => MixedClass<T>;
                type SheetAction = (evt: Event, target: HTMLElement) => void;
                interface MixedClass<T> {
                    new (): T;
                    DEFAULT_OPTIONS?: { actions?: Record<string, SheetAction | undefined> };
                    prototype: T;
                }
                interface ProbeModule<T> {
                    default?: T;
                }

                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-realm runtime global has no shipped types
                const g = globalThis as unknown as FoundryGlobal;
                const ActorCls = g.Actor;
                const foundryGame = g.game;
                const foundryUi = g.ui;

                const fired: Record<string, boolean> = {};
                const notes: Record<string, string> = {};
                for (const f of flows) fired[f] = false;

                const base = '/systems/wh40k-rpg/module';

                // Typed dynamic-import wrapper: import() of a runtime `.js` URL has
                // no shipped types, so resolve it to a caller-described module shape.
                const loadModule = async <M extends object>(url: string): Promise<M> => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of a deployed runtime module has no shipped types
                    return (await import(url)) as M;
                };

                // Wrap any awaitable with a timeout so a blocking dialog or
                // socket-wait can't hang the spec (mirrors weapon-attack.spec.ts).
                const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                    const timerHandle = { id: 0 };
                    const timeout = new Promise<T>((_, reject) => {
                        timerHandle.id = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                    });
                    try {
                        return await Promise.race([p, timeout]);
                    } finally {
                        clearTimeout(timerHandle.id);
                    }
                };

                // Drain any dialog / prompt / tour windows a probe left open so
                // the next probe's window stack starts clean (mirrors
                // applications-tours-extra.spec.ts).
                async function closeOpenDialogs(): Promise<void> {
                    const windows: ProbeWindow[] = Object.values(foundryUi.windows ?? {});
                    for (const w of windows) {
                        const id = String(w.id ?? '');
                        if (id.includes('dialog') || id.includes('prompt') || id.includes('breakdown')) {
                            try {
                                await w.close?.();
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                    document.querySelectorAll('dialog.application').forEach((el) => {
                        try {
                            (el as HTMLDialogElement).close();
                            el.remove();
                        } catch {
                            /* ignore */
                        }
                    });
                }

                // Shared cleanup registry — every actor / item we create gets
                // registered for end-of-probe deletion.
                const cleanups: Array<() => Promise<void>> = [];

                // Shared PC actor for the flows that need a real WH40K actor to
                // walk drag-drop / favorites / what-if branches. Populated by
                // probeSharedPc() before the flows that depend on it run.
                let pc: ProbeActor | null = null;
                const getPc = (): ProbeActor | null | undefined => (pc?.id != null ? foundryGame.actors?.get?.(pc.id) : null);

                /* ============================================================
                 * Flow 1: drag-drop-api-allowed-behaviors
                 * `_allowedDropBehaviors` returns {copy,link} when the drag
                 * payload has no uuid (compendium-fresh drop), {copy,move,
                 * link} otherwise. Exercises both branches of the helper.
                 * ============================================================ */
                async function probeAllowedBehaviors(): Promise<void> {
                    try {
                        interface DragDropInst {
                            _allowedDropBehaviors: (evt: Event, data: { uuid?: string }) => Set<string>;
                            _defaultDropBehavior: (evt: Event, data: { uuid?: string }) => string;
                            _dropBehavior: (evt: Event) => string;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<DragDropInst>> & { DragDropMixin?: MixinFactory<DragDropInst> }>(
                            `${base}/applications/api/drag-drop-api-mixin.js`,
                        );
                        const DragDropMixin = mod.default ?? mod.DragDropMixin;
                        if (typeof DragDropMixin !== 'function') {
                            notes['drag-drop-api-allowed-behaviors'] = 'DragDropMixin export missing';
                        } else {
                            class StubBase {
                                document = { uuid: 'Actor.probe', isOwner: true };
                                element = document.createElement('div');
                            }
                            const Mixed = DragDropMixin(StubBase);
                            const inst = new Mixed();
                            const noUuid = inst._allowedDropBehaviors(new Event('drop'), {});
                            const withUuid = inst._allowedDropBehaviors(new Event('drop'), { uuid: 'Item.foo' });
                            const noUuidOk = Boolean(noUuid.has('copy')) && Boolean(noUuid.has('link')) && !noUuid.has('move');
                            const withUuidOk = Boolean(withUuid.has('copy')) && Boolean(withUuid.has('move')) && Boolean(withUuid.has('link'));
                            if (noUuidOk && withUuidOk) {
                                fired['drag-drop-api-allowed-behaviors'] = true;
                                notes['drag-drop-api-allowed-behaviors'] = 'no-uuid → {copy,link}; with-uuid → {copy,move,link}';
                            } else {
                                notes['drag-drop-api-allowed-behaviors'] = `noUuid=${Array.from(noUuid).join(',')} withUuid=${Array.from(withUuid).join(',')}`;
                            }
                        }
                    } catch (err) {
                        notes['drag-drop-api-allowed-behaviors'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 2: drag-drop-api-default-behavior
                 * `_defaultDropBehavior` returns 'copy' for a missing/non-
                 * string uuid, 'move' when source + target resolve to the
                 * same primary/embedded id+type+collection, 'copy' otherwise.
                 * Exercises the foundry.utils.parseUuid + collection compare
                 * branches.
                 * ============================================================ */
                async function probeDefaultBehavior(): Promise<void> {
                    try {
                        interface DragDropInst {
                            _defaultDropBehavior: (evt: Event, data: { uuid?: string }) => string;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<DragDropInst>> & { DragDropMixin?: MixinFactory<DragDropInst> }>(
                            `${base}/applications/api/drag-drop-api-mixin.js`,
                        );
                        const DragDropMixin = mod.default ?? mod.DragDropMixin;
                        if (typeof DragDropMixin !== 'function') {
                            notes['drag-drop-api-default-behavior'] = 'DragDropMixin export missing';
                        } else {
                            class StubBase {
                                document = { uuid: 'Actor.probe-actor', isOwner: true };
                                element = document.createElement('div');
                            }
                            const Mixed = DragDropMixin(StubBase);
                            const inst = new Mixed();
                            const noString = inst._defaultDropBehavior(new Event('drop'), {});
                            const copyAcross = inst._defaultDropBehavior(new Event('drop'), { uuid: 'Actor.someone-else' });
                            // Same UUID as the host doc → same primary id+type+collection → move.
                            const moveSame = inst._defaultDropBehavior(new Event('drop'), { uuid: 'Actor.probe-actor' });
                            if (noString === 'copy' && copyAcross === 'copy' && moveSame === 'move') {
                                fired['drag-drop-api-default-behavior'] = true;
                                notes['drag-drop-api-default-behavior'] = 'noString=copy; otherActor=copy; sameActor=move';
                            } else {
                                notes['drag-drop-api-default-behavior'] = `noString=${String(noString)} copyAcross=${String(copyAcross)} moveSame=${String(
                                    moveSame,
                                )}`;
                            }
                        }
                    } catch (err) {
                        notes['drag-drop-api-default-behavior'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 3: drag-drop-api-modifier-keys
                 * `_dropBehavior` honours shift→copy, alt→link; falls back to
                 * `_defaultDropBehavior` otherwise. Stub TextEditor.getDragEventData
                 * via the imported module's foundry binding by passing a
                 * DragEvent whose dataTransfer mocks `getData('text/plain')`.
                 * ============================================================ */
                async function probeModifierKeys(): Promise<void> {
                    try {
                        interface DragDropInst {
                            _dropBehavior: (evt: Event) => string;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<DragDropInst>> & { DragDropMixin?: MixinFactory<DragDropInst> }>(
                            `${base}/applications/api/drag-drop-api-mixin.js`,
                        );
                        const DragDropMixin = mod.default ?? mod.DragDropMixin;
                        if (typeof DragDropMixin !== 'function') {
                            notes['drag-drop-api-modifier-keys'] = 'DragDropMixin export missing';
                        } else {
                            class StubBase {
                                document = { uuid: 'Actor.probe-actor', isOwner: true };
                                element = document.createElement('div');
                            }
                            const Mixed = DragDropMixin(StubBase);
                            const inst = new Mixed();
                            // Build a real DragEvent so foundry.applications.ux.TextEditor.implementation.getDragEventData
                            // can parse the payload. The payload uuid points at the
                            // host doc so the default fallback would be 'move'.
                            const buildEvt = (extras: Partial<DragEvent>): DragEvent => {
                                const dt = new DataTransfer();
                                dt.setData('text/plain', JSON.stringify({ uuid: 'Actor.probe-actor' }));
                                const evt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
                                for (const [k, v] of Object.entries(extras)) {
                                    Object.defineProperty(evt, k, { value: v });
                                }
                                return evt;
                            };
                            const shiftCopy = inst._dropBehavior(buildEvt({ shiftKey: true }));
                            const altLink = inst._dropBehavior(buildEvt({ altKey: true }));
                            const noMods = inst._dropBehavior(buildEvt({}));
                            if (shiftCopy === 'copy' && altLink === 'link' && noMods === 'move') {
                                fired['drag-drop-api-modifier-keys'] = true;
                                notes['drag-drop-api-modifier-keys'] = 'shift→copy; alt→link; no-mods→default(move)';
                            } else {
                                notes['drag-drop-api-modifier-keys'] = `shiftCopy=${String(shiftCopy)} altLink=${String(altLink)} noMods=${String(noMods)}`;
                            }
                        }
                    } catch (err) {
                        notes['drag-drop-api-modifier-keys'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Shared PC actor for the flows that need a real WH40K actor
                 * to walk drag-drop / favorites / what-if branches.
                 * ============================================================ */
                async function probeSharedPc(): Promise<void> {
                    try {
                        pc = await withTimeout(
                            ActorCls.create({ name: 'app-api-depth-pc', type: 'dh2-character', system: { gameSystem: 'dh2' } }),
                            5_000,
                            'PC Actor.create',
                        );
                        const pcId = pc?.id;
                        if (pcId != null) {
                            cleanups.push(async () => {
                                try {
                                    await foundryGame.actors?.get?.(pcId)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                        }
                    } catch (err) {
                        notes['drag-drop-visual-ghost-and-split'] = `PC create threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                    await new Promise<void>((resolve) => {
                        setTimeout(resolve, 250);
                    });
                }

                /* ============================================================
                 * Flow 4: drag-drop-visual-ghost-and-split
                 * `_createDragGhost` builds the wh40k-drag-ghost element with
                 * embedded name + quantity; `_canSplitItem` gates on
                 * quantity>1 and type ∈ {gear, weapon}. Exercise both with a
                 * real embedded gear item.
                 * ============================================================ */
                async function probeGhostAndSplit(): Promise<void> {
                    try {
                        const live = getPc();
                        if (live == null) {
                            notes['drag-drop-visual-ghost-and-split'] = notes['drag-drop-visual-ghost-and-split'] ?? 'no PC actor';
                        } else {
                            const created = await withTimeout(
                                live.createEmbeddedDocuments('Item', [
                                    { name: 'probe-stack', type: 'gear', system: { gameSystem: 'dh2', quantity: 5 } },
                                    { name: 'probe-single', type: 'gear', system: { gameSystem: 'dh2', quantity: 1 } },
                                    { name: 'probe-notsplittable', type: 'talent', system: { gameSystem: 'dh2' } },
                                ]),
                                5_000,
                                'embed gear stack',
                            );
                            const stack = live.items.get(created[0].id);
                            const single = live.items.get(created[1].id);
                            const talent = live.items.get(created[2].id);
                            for (const it of [stack, single, talent]) {
                                if (it != null) {
                                    cleanups.push(async () => {
                                        try {
                                            await it.delete?.();
                                        } catch {
                                            /* ignore */
                                        }
                                    });
                                }
                            }
                            if (stack == null || single == null || talent == null) {
                                notes['drag-drop-visual-ghost-and-split'] = 'failed to embed probe items';
                            } else {
                                interface GhostSplitInst {
                                    _createDragGhost: (item: ProbeItem, evt: Event) => HTMLElement;
                                    _canSplitItem: (item: ProbeItem) => boolean;
                                }
                                const mod = await loadModule<
                                    ProbeModule<MixinFactory<GhostSplitInst>> & { EnhancedDragDropMixin?: MixinFactory<GhostSplitInst> }
                                >(`${base}/applications/api/drag-drop-visual-mixin.js`);
                                const EnhancedDragDropMixin = mod.default ?? mod.EnhancedDragDropMixin;
                                if (typeof EnhancedDragDropMixin !== 'function') {
                                    notes['drag-drop-visual-ghost-and-split'] = 'EnhancedDragDropMixin export missing';
                                } else {
                                    class StubBase {
                                        document = live;
                                        element = document.createElement('div');
                                    }
                                    const Mixed = EnhancedDragDropMixin(StubBase);
                                    const inst = new Mixed();
                                    const ghost = inst._createDragGhost(stack, new Event('dragstart'));
                                    const ghostInnerHtml = String(ghost.innerHTML);
                                    const ghostHasName = ghostInnerHtml.includes('probe-stack');
                                    const ghostHasQty = ghostInnerHtml.includes('×5');
                                    const stackSplittable = inst._canSplitItem(stack);
                                    const singleNotSplittable = !inst._canSplitItem(single); // qty 1
                                    const talentNotSplittable = !inst._canSplitItem(talent); // type talent
                                    if (ghostHasName && ghostHasQty && stackSplittable && singleNotSplittable && talentNotSplittable) {
                                        fired['drag-drop-visual-ghost-and-split'] = true;
                                        notes['drag-drop-visual-ghost-and-split'] = 'ghost contains name + ×qty; split allowed only for qty>1 stackable types';
                                    } else {
                                        notes['drag-drop-visual-ghost-and-split'] = `ghostHasName=${String(ghostHasName)} ghostHasQty=${String(
                                            ghostHasQty,
                                        )} stackSplittable=${String(stackSplittable)} singleNotSplittable=${String(
                                            singleNotSplittable,
                                        )} talentNotSplittable=${String(talentNotSplittable)}`;
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        notes['drag-drop-visual-ghost-and-split'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 5: drag-drop-visual-validate-slot
                 * `_validateEquipmentSlot` matches weapon→{primary-weapon,
                 * secondary-weapon}, armour→{*armor*}, gear→default true.
                 * Exercise all three branches plus the mismatch path.
                 * ============================================================ */
                async function probeValidateSlot(): Promise<void> {
                    try {
                        interface ValidateSlotInst {
                            _validateEquipmentSlot: (item: { type: string }, slot: string) => boolean;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<ValidateSlotInst>> & { EnhancedDragDropMixin?: MixinFactory<ValidateSlotInst> }>(
                            `${base}/applications/api/drag-drop-visual-mixin.js`,
                        );
                        const EnhancedDragDropMixin = mod.default ?? mod.EnhancedDragDropMixin;
                        if (typeof EnhancedDragDropMixin !== 'function') {
                            notes['drag-drop-visual-validate-slot'] = 'EnhancedDragDropMixin export missing';
                        } else {
                            class StubBase {
                                document = { id: 'probe', isOwner: true };
                                element = document.createElement('div');
                            }
                            const Mixed = EnhancedDragDropMixin(StubBase);
                            const inst = new Mixed();
                            const weaponInPrimary = inst._validateEquipmentSlot({ type: 'weapon' }, 'primary-weapon');
                            const weaponInArmor = inst._validateEquipmentSlot({ type: 'weapon' }, 'body-armor');
                            const armourInArmor = inst._validateEquipmentSlot({ type: 'armour' }, 'body-armor');
                            const gearDefault = inst._validateEquipmentSlot({ type: 'gear' }, 'belt');
                            if (weaponInPrimary && !weaponInArmor && armourInArmor && gearDefault) {
                                fired['drag-drop-visual-validate-slot'] = true;
                                notes['drag-drop-visual-validate-slot'] =
                                    'weapon→weapon-slot pass; weapon→armor slot fail; armour→armor slot pass; gear→default pass';
                            } else {
                                notes['drag-drop-visual-validate-slot'] = `weaponInPrimary=${String(weaponInPrimary)} weaponInArmor=${String(
                                    weaponInArmor,
                                )} armourInArmor=${String(armourInArmor)} gearDefault=${String(gearDefault)}`;
                            }
                        }
                    } catch (err) {
                        notes['drag-drop-visual-validate-slot'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 6: drag-drop-visual-favorites-api
                 * Drive the public favorites API end-to-end against the live
                 * PC actor: setFlag-backed list. `_addToFavorites` is exercised
                 * via the mixin's drop handler indirectly, but the public
                 * getFavoriteItems / removeFromFavorites / clearFavorites
                 * write the flag scope `wh40k-rpg.favorites`.
                 * ============================================================ */
                async function probeFavoritesApi(): Promise<void> {
                    try {
                        const live = getPc();
                        if (live == null) {
                            notes['drag-drop-visual-favorites-api'] = 'no PC actor';
                        } else {
                            const createdItems = await withTimeout(
                                live.createEmbeddedDocuments('Item', [
                                    { name: 'probe-fav-1', type: 'gear', system: { gameSystem: 'dh2' } },
                                    { name: 'probe-fav-2', type: 'gear', system: { gameSystem: 'dh2' } },
                                ]),
                                5_000,
                                'embed favorite gear',
                            );
                            const fav1 = live.items.get(createdItems[0].id);
                            const fav2 = live.items.get(createdItems[1].id);
                            for (const it of [fav1, fav2]) {
                                if (it != null) {
                                    cleanups.push(async () => {
                                        try {
                                            await it.delete?.();
                                        } catch {
                                            /* ignore */
                                        }
                                    });
                                }
                            }
                            if (fav1 == null || fav2 == null) {
                                notes['drag-drop-visual-favorites-api'] = 'failed to embed favorite items';
                            } else {
                                interface FavoritesInst {
                                    getFavoriteItems: () => string[];
                                    removeFromFavorites: (id: string) => Promise<void>;
                                    clearFavorites: () => Promise<void>;
                                }
                                const mod = await loadModule<
                                    ProbeModule<MixinFactory<FavoritesInst>> & { EnhancedDragDropMixin?: MixinFactory<FavoritesInst> }
                                >(`${base}/applications/api/drag-drop-visual-mixin.js`);
                                const EnhancedDragDropMixin = mod.default ?? mod.EnhancedDragDropMixin;
                                if (typeof EnhancedDragDropMixin !== 'function') {
                                    notes['drag-drop-visual-favorites-api'] = 'EnhancedDragDropMixin export missing';
                                } else {
                                    class StubBase {
                                        document = live;
                                        element = document.createElement('div');
                                    }
                                    const Mixed = EnhancedDragDropMixin(StubBase);
                                    const inst = new Mixed();
                                    // Seed the flag with both favorite ids — the
                                    // public API roundtrips with the actor flag scope.
                                    await withTimeout(live.setFlag('wh40k-rpg', 'favorites', [fav1.id, fav2.id]), 5_000, 'setFlag favorites seed');
                                    cleanups.push(async () => {
                                        try {
                                            await live.unsetFlag?.('wh40k-rpg', 'favorites');
                                        } catch {
                                            /* ignore */
                                        }
                                    });
                                    const initial = inst.getFavoriteItems();
                                    const initialOk = initial.length === 2;
                                    await withTimeout(inst.removeFromFavorites(fav1.id), 5_000, 'removeFromFavorites');
                                    const afterRemove = inst.getFavoriteItems();
                                    const removeOk = afterRemove.length === 1;
                                    await withTimeout(inst.clearFavorites(), 5_000, 'clearFavorites');
                                    const afterClear = inst.getFavoriteItems();
                                    const clearOk = afterClear.length === 0;
                                    if (initialOk && removeOk && clearOk) {
                                        fired['drag-drop-visual-favorites-api'] = true;
                                        notes['drag-drop-visual-favorites-api'] = 'getFavoriteItems→remove→clear flag-backed round-trip OK';
                                    } else {
                                        notes['drag-drop-visual-favorites-api'] = `initialOk=${String(initialOk)}(${initial.length}) removeOk=${String(
                                            removeOk,
                                        )}(${afterRemove.length}) clearOk=${String(clearOk)}(${afterClear.length})`;
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        notes['drag-drop-visual-favorites-api'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 7: expandable-tooltip-toggle-action
                 * Mix ExpandableTooltipMixin onto a base whose `element` holds
                 * the [data-expandable-id]/.wh40k-expandable/.wh40k-expansion-panel
                 * markup the action expects. Dispatch the registered
                 * `toggleExpandable` action; expect the panel opens, the
                 * trigger gains --expanded, and isPanelOpen reports true.
                 * ============================================================ */
                async function probeExpandableToggle(): Promise<void> {
                    try {
                        interface ExpandableInst {
                            isPanelOpen: (id: string) => boolean;
                            openExpandable: (id: string) => void;
                            closeExpandable: (id: string) => void;
                            getOpenPanels: () => string[];
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<ExpandableInst>> & { ExpandableTooltipMixin?: MixinFactory<ExpandableInst> }>(
                            `${base}/applications/api/expandable-tooltip-mixin.js`,
                        );
                        const ExpandableTooltipMixin = mod.default ?? mod.ExpandableTooltipMixin;
                        if (typeof ExpandableTooltipMixin !== 'function') {
                            notes['expandable-tooltip-toggle-action'] = 'ExpandableTooltipMixin export missing';
                        } else {
                            const root = document.createElement('div');
                            root.innerHTML = `
                            <div data-expandable-id="probe">
                                <button class="wh40k-expandable" data-action="toggleExpandable" data-target-id="probe">label</button>
                                <div class="wh40k-expansion-panel">body</div>
                            </div>
                        `;
                            class StubBase {
                                element = root;
                                document = null;
                            }
                            const Mixed = ExpandableTooltipMixin(StubBase);
                            const action = Mixed.DEFAULT_OPTIONS?.actions?.toggleExpandable;
                            if (typeof action !== 'function') {
                                notes['expandable-tooltip-toggle-action'] = 'toggleExpandable action not registered';
                            } else {
                                const inst = new Mixed();
                                const trigger = root.querySelector('.wh40k-expandable') as HTMLElement;
                                const panel = root.querySelector('.wh40k-expansion-panel') as HTMLElement;
                                const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                                action.call(inst, evt, trigger);
                                const openedAfter = panel.classList.contains('wh40k-expansion-panel--open');
                                const openReported = inst.isPanelOpen('probe');
                                // Toggle again — expect the panel closes.
                                action.call(inst, new MouseEvent('click', { bubbles: true, cancelable: true }), trigger);
                                const closedAfter = !panel.classList.contains('wh40k-expansion-panel--open');
                                if (openedAfter && openReported && closedAfter) {
                                    fired['expandable-tooltip-toggle-action'] = true;
                                    notes['expandable-tooltip-toggle-action'] = 'toggleExpandable opened then closed the panel; isPanelOpen tracked';
                                } else {
                                    notes['expandable-tooltip-toggle-action'] = `openedAfter=${String(openedAfter)} openReported=${String(
                                        openReported,
                                    )} closedAfter=${String(closedAfter)}`;
                                }
                            }
                        }
                    } catch (err) {
                        notes['expandable-tooltip-toggle-action'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 8: expandable-tooltip-programmatic-api
                 * `openExpandable(id)` + `closeExpandable(id)` should write
                 * the same #openPanels state visible via `getOpenPanels()` /
                 * `isPanelOpen()`. Exercise both helpers without going
                 * through the action map.
                 * ============================================================ */
                async function probeExpandableProgrammatic(): Promise<void> {
                    try {
                        interface ExpandableInst {
                            isPanelOpen: (id: string) => boolean;
                            openExpandable: (id: string) => void;
                            closeExpandable: (id: string) => void;
                            getOpenPanels: () => string[];
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<ExpandableInst>> & { ExpandableTooltipMixin?: MixinFactory<ExpandableInst> }>(
                            `${base}/applications/api/expandable-tooltip-mixin.js`,
                        );
                        const ExpandableTooltipMixin = mod.default ?? mod.ExpandableTooltipMixin;
                        if (typeof ExpandableTooltipMixin !== 'function') {
                            notes['expandable-tooltip-programmatic-api'] = 'ExpandableTooltipMixin export missing';
                        } else {
                            const root = document.createElement('div');
                            root.innerHTML = `
                            <div data-expandable-id="a">
                                <button class="wh40k-expandable">trig-a</button>
                                <div class="wh40k-expansion-panel">a-body</div>
                            </div>
                            <div data-expandable-id="b">
                                <button class="wh40k-expandable">trig-b</button>
                                <div class="wh40k-expansion-panel">b-body</div>
                            </div>
                        `;
                            class StubBase {
                                element = root;
                                document = null;
                            }
                            const Mixed = ExpandableTooltipMixin(StubBase);
                            const inst = new Mixed();
                            inst.openExpandable('a');
                            inst.openExpandable('b');
                            const openedTwo = inst.getOpenPanels().sort().join(',') === 'a,b';
                            const isOpenA = inst.isPanelOpen('a');
                            const isOpenB = inst.isPanelOpen('b');
                            inst.closeExpandable('a');
                            const closedA = !inst.isPanelOpen('a');
                            const stillOpenB = inst.isPanelOpen('b');
                            if (openedTwo && isOpenA && isOpenB && closedA && stillOpenB) {
                                fired['expandable-tooltip-programmatic-api'] = true;
                                notes['expandable-tooltip-programmatic-api'] = 'open(a,b) → close(a) leaves only b open; accessors report consistently';
                            } else {
                                notes['expandable-tooltip-programmatic-api'] = `openedTwo=${String(openedTwo)} isOpenA=${String(isOpenA)} isOpenB=${String(
                                    isOpenB,
                                )} closedA=${String(closedA)} stillOpenB=${String(stillOpenB)}`;
                            }
                        }
                    } catch (err) {
                        notes['expandable-tooltip-programmatic-api'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 9: visual-feedback-find-and-classify
                 * `_findFieldElement` walks selector fallbacks: name attr →
                 * data-field → data-stat → pattern-class. `_getAnimationClass`
                 * routes wounds.value → heal/damage, experience.total →
                 * advance, generic numeric up/down → increase/decrease.
                 * ============================================================ */
                async function probeFindAndClassify(): Promise<void> {
                    try {
                        interface FindClassifyInst {
                            _findFieldElement: (key: string) => HTMLElement | null;
                            _getAnimationClass: (key: string, from: string | number, to: string | number) => string;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<FindClassifyInst>> & { VisualFeedbackMixin?: MixinFactory<FindClassifyInst> }>(
                            `${base}/applications/api/visual-feedback-mixin.js`,
                        );
                        const VisualFeedbackMixin = mod.default ?? mod.VisualFeedbackMixin;
                        if (typeof VisualFeedbackMixin !== 'function') {
                            notes['visual-feedback-find-and-classify'] = 'VisualFeedbackMixin export missing';
                        } else {
                            const root = document.createElement('div');
                            root.innerHTML = `
                            <input name="system.wounds.value" value="5" />
                            <span data-field="wounds-max">10</span>
                            <span data-stat="initiative">3</span>
                            <span class="stat-corruption">5</span>
                        `;
                            class StubBase {
                                element = root;
                                document = null;
                            }
                            const Mixed = VisualFeedbackMixin(StubBase);
                            const inst = new Mixed();
                            const foundByName = inst._findFieldElement('system.wounds.value') !== null;
                            const foundByDataField = inst._findFieldElement('system.wounds.max') !== null;
                            const foundByDataStat = inst._findFieldElement('system.initiative') !== null;
                            const foundByPattern = inst._findFieldElement('system.corruption') !== null;
                            const notFound = inst._findFieldElement('system.totally.missing') === null;
                            const woundsHeal = inst._getAnimationClass('system.wounds.value', 5, 8);
                            const woundsDamage = inst._getAnimationClass('system.wounds.value', 8, 3);
                            const xpAdvance = inst._getAnimationClass('system.experience.total', 100, 200);
                            const numericUp = inst._getAnimationClass('system.something.numeric', 2, 5);
                            const numericDown = inst._getAnimationClass('system.something.numeric', 5, 2);
                            const stringFlash = inst._getAnimationClass('system.name', 'alice', 'bob');
                            if (
                                foundByName &&
                                foundByDataField &&
                                foundByDataStat &&
                                foundByPattern &&
                                notFound &&
                                woundsHeal === 'tw-animate-stat-heal' &&
                                woundsDamage === 'tw-animate-stat-damage' &&
                                xpAdvance === 'tw-animate-stat-advance' &&
                                numericUp === 'tw-animate-stat-increase' &&
                                numericDown === 'tw-animate-stat-decrease' &&
                                stringFlash === 'tw-animate-flash-update'
                            ) {
                                fired['visual-feedback-find-and-classify'] = true;
                                notes['visual-feedback-find-and-classify'] = 'selector fallbacks + animation routing all matched expected branches';
                            } else {
                                notes['visual-feedback-find-and-classify'] = `find: name=${String(foundByName)} field=${String(foundByDataField)} stat=${String(
                                    foundByDataStat,
                                )} pattern=${String(foundByPattern)} notFound=${String(
                                    notFound,
                                )} | classify: heal=${woundsHeal} dmg=${woundsDamage} xp=${xpAdvance} up=${numericUp} dn=${numericDown} str=${stringFlash}`;
                            }
                        }
                    } catch (err) {
                        notes['visual-feedback-find-and-classify'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 10: visual-feedback-animate-counter
                 * `_animateCounter` runs an easing rAF loop and lands on the
                 * exact `toValue`. `_showBriefNotification` injects a tooltip
                 * into document.body. Both observe DOM side-effects we can
                 * settle in <300ms.
                 * ============================================================ */
                async function probeAnimateCounter(): Promise<void> {
                    try {
                        interface CounterInst {
                            _animateCounter: (el: HTMLElement, from: number, to: number, duration: number) => void;
                            _showBriefNotification: (anchor: HTMLElement, msg: string, type: string) => void;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<CounterInst>> & { VisualFeedbackMixin?: MixinFactory<CounterInst> }>(
                            `${base}/applications/api/visual-feedback-mixin.js`,
                        );
                        const VisualFeedbackMixin = mod.default ?? mod.VisualFeedbackMixin;
                        if (typeof VisualFeedbackMixin !== 'function') {
                            notes['visual-feedback-animate-counter'] = 'VisualFeedbackMixin export missing';
                        } else {
                            class StubBase {
                                element = document.createElement('div');
                                document = null;
                            }
                            const Mixed = VisualFeedbackMixin(StubBase);
                            const inst = new Mixed();
                            const counterEl = document.createElement('span');
                            counterEl.textContent = '0';
                            inst._animateCounter(counterEl, 0, 7, 50);
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 200);
                            });
                            const counterSettled = counterEl.textContent === '7';
                            const anchor = document.createElement('div');
                            document.body.appendChild(anchor);
                            inst._showBriefNotification(anchor, 'probe-msg', 'info');
                            const noteEl = document.querySelector('.brief-notification');
                            const noteAppeared = noteEl !== null && noteEl.textContent === 'probe-msg';
                            // Best-effort cleanup of the injected DOM.
                            anchor.remove();
                            noteEl?.remove();
                            if (counterSettled && noteAppeared) {
                                fired['visual-feedback-animate-counter'] = true;
                                notes['visual-feedback-animate-counter'] = 'counter settled to 7; brief notification injected';
                            } else {
                                notes['visual-feedback-animate-counter'] = `counterSettled=${String(counterSettled)} text=${String(
                                    counterEl.textContent,
                                )} noteAppeared=${String(noteAppeared)}`;
                            }
                        }
                    } catch (err) {
                        notes['visual-feedback-animate-counter'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 11: visual-feedback-visualize-changes
                 * Seed `_previousValues` via `_captureCurrentValues` against a
                 * stub document, then call `visualizeChanges({system:{...}})`.
                 * Each numeric diff routes through `_flashStatChange` →
                 * `_applyAnimation` which adds + removes the animation class.
                 * Assert that the call returns without throwing and the
                 * Map was repopulated after the visualize call.
                 * ============================================================ */
                async function probeVisualizeChanges(): Promise<void> {
                    try {
                        interface VisualizeInst {
                            _captureCurrentValues: () => void;
                            _previousValues: Map<string, number>;
                            visualizeChanges: (changes: { system: { wounds: { value: number } } }) => void;
                            _applyAnimation: (el: HTMLElement, cls: string) => void;
                            animateStatChange: (key: string, kind: string) => void;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<VisualizeInst>> & { VisualFeedbackMixin?: MixinFactory<VisualizeInst> }>(
                            `${base}/applications/api/visual-feedback-mixin.js`,
                        );
                        const VisualFeedbackMixin = mod.default ?? mod.VisualFeedbackMixin;
                        if (typeof VisualFeedbackMixin !== 'function') {
                            notes['visual-feedback-visualize-changes'] = 'VisualFeedbackMixin export missing';
                        } else {
                            const root = document.createElement('div');
                            root.innerHTML = `<input name="system.wounds.value" value="5" />`;
                            class StubBase {
                                element = root;
                                // Minimal toObject shape that flattenObject can walk.
                                document = {
                                    toObject: (): { system: { wounds: { value: number }; name: string } } => ({
                                        system: { wounds: { value: 5 }, name: 'alice' },
                                    }),
                                };
                            }
                            const Mixed = VisualFeedbackMixin(StubBase);
                            const inst = new Mixed();
                            inst._captureCurrentValues();
                            const seededWounds = inst._previousValues.get('system.wounds.value') === 5;
                            inst.visualizeChanges({ system: { wounds: { value: 8 } } });
                            const woundsUpdated = inst._previousValues.get('system.wounds.value') === 8;
                            // Apply animation class directly to assert _applyAnimation works.
                            const target = document.createElement('div');
                            inst._applyAnimation(target, 'tw-animate-stat-heal');
                            const applied = target.classList.contains('tw-animate-stat-heal');
                            // public API smoke test — animateStatChange routes to _findFieldElement+_applyAnimation
                            inst.animateStatChange('system.wounds.value', 'heal');
                            if (seededWounds && woundsUpdated && applied) {
                                fired['visual-feedback-visualize-changes'] = true;
                                notes['visual-feedback-visualize-changes'] = 'capture→visualizeChanges→re-capture updated; _applyAnimation set class';
                            } else {
                                notes['visual-feedback-visualize-changes'] = `seededWounds=${String(seededWounds)} woundsUpdated=${String(
                                    woundsUpdated,
                                )} applied=${String(applied)}`;
                            }
                        }
                    } catch (err) {
                        notes['visual-feedback-visualize-changes'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 12: wh40k-tooltip-builders
                 * Instantiate TooltipsWH40K and exercise each `_build*Tooltip`
                 * directly. Builders are pure functions over the payload
                 * shape — verify the HTML output contains key markers.
                 * ============================================================ */
                async function probeTooltipBuilders(): Promise<void> {
                    try {
                        interface NamedValue {
                            name: string;
                            value: number;
                        }
                        interface SkillDescription {
                            name: string;
                            descriptor: string;
                            uses: string;
                            useTime: string;
                            isBasic: boolean;
                            aptitudes: string[];
                        }
                        interface TooltipInst {
                            _buildCharacteristicTooltip: (data: {
                                name: string;
                                label: string;
                                base: number;
                                advance: number;
                                modifier: number;
                                unnatural: number;
                                total: number;
                                bonus: number;
                                sources: NamedValue[];
                            }) => string;
                            _buildArmorTooltip: (data: {
                                location: string;
                                total: number;
                                toughnessBonus: number;
                                traitBonus: number;
                                armorValue: number;
                                equipped: Array<{ name: string; img: string; ap: number }>;
                            }) => string;
                            _buildWeaponTooltip: (data: {
                                name: string;
                                damage: string;
                                penetration: number;
                                range: string;
                                rof: string;
                                qualities: string[];
                            }) => string;
                            _buildModifierTooltip: (data: { title: string; sources: NamedValue[] }) => string;
                            _buildQualityTooltip: (data: {
                                label: string;
                                description: string;
                                level: number | null;
                                hasLevel: boolean;
                                category: string;
                                mechanicalEffect: boolean;
                                source: string;
                            }) => string;
                            _buildGenericTooltip: (data: { title: string; content: string }) => string;
                            skillDescriptions: Map<string, SkillDescription>;
                            getSkillDescription: (name: string) => { name?: string } | null;
                        }
                        type TooltipCtor = new () => TooltipInst;
                        const mod = await loadModule<{ TooltipsWH40K?: TooltipCtor; WH40KTooltip?: TooltipCtor; default?: TooltipCtor }>(
                            `${base}/applications/components/wh40k-tooltip.js`,
                        );
                        const TooltipsWH40K = mod.TooltipsWH40K ?? mod.WH40KTooltip ?? mod.default;
                        if (typeof TooltipsWH40K !== 'function') {
                            notes['wh40k-tooltip-builders'] = 'TooltipsWH40K export missing';
                        } else {
                            const t = new TooltipsWH40K();
                            const charHtml = t._buildCharacteristicTooltip({
                                name: 'weaponSkill',
                                label: 'Weapon Skill',
                                base: 30,
                                advance: 5,
                                modifier: 10,
                                unnatural: 2,
                                total: 45,
                                bonus: 8,
                                sources: [{ name: 'Talent', value: 5 }],
                            });
                            const armorHtml = t._buildArmorTooltip({
                                location: 'Body',
                                total: 5,
                                toughnessBonus: 3,
                                traitBonus: 1,
                                armorValue: 4,
                                equipped: [{ name: 'flak', img: 'icons/foo.png', ap: 4 }],
                            });
                            const weaponHtml = t._buildWeaponTooltip({
                                name: 'las',
                                damage: '1d10+3',
                                penetration: 0,
                                range: '100m',
                                rof: 'S/3/-',
                                qualities: ['reliable', 'tearing'],
                            });
                            const modHtml = t._buildModifierTooltip({
                                title: 'Combat Bonuses',
                                sources: [
                                    { name: 'Aim', value: 10 },
                                    { name: 'Cover', value: -10 },
                                ],
                            });
                            const qualityHtml = t._buildQualityTooltip({
                                label: 'Reliable',
                                description: 'Never jams.',
                                level: null,
                                hasLevel: false,
                                category: 'simple-modifier',
                                mechanicalEffect: true,
                                source: 'Core',
                            });
                            const genericHtml = String(t._buildGenericTooltip({ title: 'Info', content: '<p>generic</p>' }));
                            const charStr = String(charHtml);
                            const armorStr = String(armorHtml);
                            const weaponStr = String(weaponHtml);
                            const modStr = String(modHtml);
                            const qualityStr = String(qualityHtml);
                            const charOk = charStr.includes('Weapon Skill') && charStr.includes('45') && charStr.includes('Talent');
                            const armorOk = armorStr.includes('Body') && armorStr.includes('AP 5') && armorStr.includes('flak');
                            const weaponOk = weaponStr.includes('las') && weaponStr.includes('reliable') && weaponStr.includes('Click to attack');
                            const modOk = modStr.includes('Combat Bonuses') && modStr.includes('Aim') && modStr.includes('+10');
                            const qualityOk = qualityStr.includes('Reliable') && qualityStr.includes('Simple Modifier') && qualityStr.includes('Core');
                            const genericOk = genericHtml.includes('Info') && genericHtml.includes('generic');
                            if (charOk && armorOk && weaponOk && modOk && qualityOk && genericOk) {
                                fired['wh40k-tooltip-builders'] = true;
                                notes['wh40k-tooltip-builders'] = 'all six _build*Tooltip variants emit HTML containing payload markers';
                            } else {
                                notes['wh40k-tooltip-builders'] = `char=${String(charOk)} armor=${String(armorOk)} weapon=${String(weaponOk)} mod=${String(
                                    modOk,
                                )} quality=${String(qualityOk)} generic=${String(genericOk)}`;
                            }
                        }
                    } catch (err) {
                        notes['wh40k-tooltip-builders'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 13: wh40k-tooltip-static-data-helpers
                 * Call the exported `prepare*TooltipData` helpers and verify
                 * each returns parseable JSON whose key fields round-trip the
                 * input. Also exercise `getSkillDescription` normalization
                 * (case + whitespace + hyphen stripping).
                 * ============================================================ */
                async function probeTooltipStaticHelpers(): Promise<void> {
                    try {
                        interface SkillDescription {
                            name: string;
                            descriptor: string;
                            uses: string;
                            useTime: string;
                            isBasic: boolean;
                            aptitudes: string[];
                        }
                        interface TooltipInst {
                            skillDescriptions: Map<string, SkillDescription>;
                            getSkillDescription: (name: string) => { name?: string } | null;
                        }
                        type TooltipCtor = new () => TooltipInst;
                        type PrepareArmorFn = (
                            location: string,
                            data: { total: number; toughnessBonus: number; traitBonus: number; value: number },
                            equipped: Array<{ name: string; img: string; ap: number }>,
                        ) => string;
                        type PrepareModifierFn = (
                            title: string,
                            sources: Array<{ name?: string; value?: number; source?: string; modifier?: number }>,
                        ) => string;
                        type PrepareCharFn = (
                            name: string,
                            data: { label: string; base: number; advance: number; modifier: number; unnatural: number; total: number; bonus: number },
                            opts: Record<string, never>,
                        ) => string;
                        const mod = await loadModule<{
                            TooltipsWH40K?: TooltipCtor;
                            WH40KTooltip?: TooltipCtor;
                            default?: TooltipCtor;
                            prepareArmorTooltipData?: PrepareArmorFn;
                            prepareModifierTooltipData?: PrepareModifierFn;
                            prepareCharacteristicTooltipData?: PrepareCharFn;
                        }>(`${base}/applications/components/wh40k-tooltip.js`);
                        const TooltipsWH40K = mod.TooltipsWH40K ?? mod.WH40KTooltip ?? mod.default;
                        const { prepareArmorTooltipData, prepareModifierTooltipData, prepareCharacteristicTooltipData } = mod;
                        if (
                            typeof TooltipsWH40K !== 'function' ||
                            typeof prepareArmorTooltipData !== 'function' ||
                            typeof prepareModifierTooltipData !== 'function' ||
                            typeof prepareCharacteristicTooltipData !== 'function'
                        ) {
                            notes['wh40k-tooltip-static-data-helpers'] = 'exports missing';
                        } else {
                            const armorJson = prepareArmorTooltipData('body', { total: 5, toughnessBonus: 3, traitBonus: 0, value: 2 }, []);
                            const armorParsed = JSON.parse(armorJson) as { location?: string; total?: number };
                            const modJson = prepareModifierTooltipData('Skill Mods', [
                                { name: 'Talent', value: 10 },
                                { source: 'Cover', modifier: -10 },
                            ]);
                            const modParsed = JSON.parse(modJson) as { title?: string; sources?: Array<{ name?: string; value?: number }> };
                            const charJson = prepareCharacteristicTooltipData(
                                'weaponSkill',
                                { label: 'Weapon Skill', base: 30, advance: 5, modifier: 0, unnatural: 1, total: 35, bonus: 3 },
                                {},
                            );
                            const charParsed = JSON.parse(charJson) as { label?: string; total?: number };
                            // getSkillDescription normalization — without seeded
                            // skills the lookup returns null but does not throw.
                            const t = new TooltipsWH40K();
                            // Seed via the private map setter accessible on the instance.
                            t.skillDescriptions.set('awareness', {
                                name: 'Awareness',
                                descriptor: 'Per',
                                uses: '',
                                useTime: '',
                                isBasic: true,
                                aptitudes: [],
                            });
                            const directHit = t.getSkillDescription('Awareness')?.name === 'Awareness';
                            const normalizedHit = t.getSkillDescription('a-w-a r e n e s s')?.name === 'Awareness';
                            const missNull = t.getSkillDescription('definitely-missing') === null;
                            if (
                                armorParsed.location === 'Body' &&
                                armorParsed.total === 5 &&
                                modParsed.title === 'Skill Mods' &&
                                modParsed.sources?.[0]?.name === 'Talent' &&
                                charParsed.label === 'Weapon Skill' &&
                                charParsed.total === 35 &&
                                directHit &&
                                normalizedHit &&
                                missNull
                            ) {
                                fired['wh40k-tooltip-static-data-helpers'] = true;
                                notes['wh40k-tooltip-static-data-helpers'] = 'static data helpers + getSkillDescription normalization OK';
                            } else {
                                notes['wh40k-tooltip-static-data-helpers'] = `armor.loc=${armorParsed.location} mod.title=${modParsed.title} char.label=${
                                    charParsed.label
                                } direct=${String(directHit)} norm=${String(normalizedHit)} miss=${String(missNull)}`;
                            }
                        }
                    } catch (err) {
                        notes['wh40k-tooltip-static-data-helpers'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 14: icons-helper-resolution
                 * `icon(key, opts)` returns inline SVG with classes/labels/
                 * size styling. `hasIcon` is a type guard. `listIcons` returns
                 * a sorted array. Exercise each branch with bundled seeds.
                 * ============================================================ */
                async function probeIconsResolution(): Promise<void> {
                    try {
                        type IconOpts = { label?: string; class?: string; size?: number | string };
                        type IconFn = (key: string, opts?: IconOpts) => { toString: () => string };
                        type HasIconFn = (key: string) => boolean;
                        type ListIconsFn = () => string[];
                        const mod = await loadModule<{ icon?: IconFn; hasIcon?: HasIconFn; listIcons?: ListIconsFn }>(`${base}/icons/icon.js`);
                        const { icon, hasIcon, listIcons } = mod;
                        if (typeof icon !== 'function' || typeof hasIcon !== 'function' || typeof listIcons !== 'function') {
                            notes['icons-helper-resolution'] = 'icon/hasIcon/listIcons export missing';
                        } else {
                            const bareSvg = String(icon('fa:dice-d20'));
                            const labelSvg = String(icon('fa:dice-d20', { label: 'Roll', class: 'tw-w-4 tw-h-4' }));
                            const numSizeSvg = String(icon('fa:dice-d20', { size: 16 }));
                            const strSizeSvg = String(icon('fa:dice-d20', { size: '1em' }));
                            const missingSvg = String(icon('fa:definitely-not-a-real-icon-name'));
                            const has = Boolean(hasIcon('fa:dice-d20'));
                            const hasNot = Boolean(hasIcon('fa:definitely-not-a-real-icon-name'));
                            const list = listIcons();
                            const first = list[0];
                            const last = list[list.length - 1];
                            const listSortedAndContains = list.length > 0 && list.includes('fa:dice-d20') && first <= last;
                            const bareOk = bareSvg.includes('<svg') && bareSvg.includes('aria-hidden="true"') && bareSvg.includes('wh40k-icon--fa-dice-d20');
                            const labelOk = labelSvg.includes('role="img"') && labelSvg.includes('aria-label="Roll"') && labelSvg.includes('tw-w-4');
                            const numSizeOk = numSizeSvg.includes('width:16px') && numSizeSvg.includes('height:16px');
                            const strSizeOk = strSizeSvg.includes('width:1em') && strSizeSvg.includes('height:1em');
                            const missingOk = missingSvg === '';
                            if (bareOk && labelOk && numSizeOk && strSizeOk && missingOk && has && !hasNot && listSortedAndContains) {
                                fired['icons-helper-resolution'] = true;
                                notes['icons-helper-resolution'] = 'icon() returns svg variants; hasIcon distinguishes; listIcons sorted & populated';
                            } else {
                                notes['icons-helper-resolution'] = `bare=${String(bareOk)} label=${String(labelOk)} numSize=${String(
                                    numSizeOk,
                                )} strSize=${String(strSizeOk)} missing=${String(missingOk)} has=${String(has)} hasNot=${String(hasNot)} list=${String(
                                    listSortedAndContains,
                                )}`;
                            }
                        }
                    } catch (err) {
                        notes['icons-helper-resolution'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 15: icons-handlebars-registration
                 * `registerIconHelper()` registers `{{iconSvg}}` on the global
                 * Handlebars instance. Invoking it returns a SafeString whose
                 * value matches `icon(key, opts)`; unknown keys warn and
                 * return an empty SafeString.
                 * ============================================================ */
                async function probeIconsHandlebars(): Promise<void> {
                    try {
                        type IconOpts = { label?: string; class?: string; size?: number | string };
                        type IconFn = (key: string, opts?: IconOpts) => { toString: () => string };
                        const mod = await loadModule<{ registerIconHelper?: () => void }>(`${base}/icons/helper.js`);
                        const { registerIconHelper } = mod;
                        const iconMod = await loadModule<{ icon?: IconFn }>(`${base}/icons/icon.js`);
                        const { icon } = iconMod;
                        if (typeof registerIconHelper !== 'function' || typeof icon !== 'function') {
                            notes['icons-handlebars-registration'] = 'registerIconHelper / icon export missing';
                        } else {
                            const HB = g.Handlebars ?? null;
                            if (HB == null) {
                                notes['icons-handlebars-registration'] = 'global Handlebars not present';
                            } else {
                                registerIconHelper();
                                const helper = HB.helpers['iconSvg'];
                                if (typeof helper !== 'function') {
                                    notes['icons-handlebars-registration'] = 'iconSvg helper not registered';
                                } else {
                                    const helperResult = helper('fa:dice-d20', { hash: { class: 'tw-w-4', label: 'Roll' } });
                                    const direct = String(icon('fa:dice-d20', { class: 'tw-w-4', label: 'Roll' }));
                                    const helperOut = String(helperResult);
                                    const matched = helperOut === direct;
                                    const unknownResult = helper('fa:bogus-not-real', { hash: {} });
                                    const unknownEmpty = String(unknownResult) === '';
                                    if (matched && unknownEmpty) {
                                        fired['icons-handlebars-registration'] = true;
                                        notes['icons-handlebars-registration'] = 'iconSvg helper matches icon() output; unknown key → empty SafeString';
                                    } else {
                                        notes['icons-handlebars-registration'] = `matched=${String(matched)} unknownEmpty=${String(unknownEmpty)}`;
                                    }
                                }
                            }
                        }
                    } catch (err) {
                        notes['icons-handlebars-registration'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 16: appv2-mixin-subtitle-and-disable
                 * Mix ApplicationV2Mixin onto a synthetic base; assert the
                 * `subtitle` getter localizes options.window.subtitle (the
                 * `' '` localize fallback returns '' for empty keys), the
                 * `_renderContainers` helper threads data-container-id
                 * grouping, and `_disableFields` makes window-content inputs
                 * readonly/disabled while sparing `.always-interactive`.
                 * ============================================================ */
                async function probeAppV2SubtitleDisable(): Promise<void> {
                    try {
                        interface AppV2Inst {
                            subtitle: string;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<AppV2Inst>> & { ApplicationV2Mixin?: MixinFactory<AppV2Inst> }>(
                            `${base}/applications/api/application-v2-mixin.js`,
                        );
                        const ApplicationV2Mixin = mod.default ?? mod.ApplicationV2Mixin;
                        if (typeof ApplicationV2Mixin !== 'function') {
                            notes['appv2-mixin-subtitle-and-disable'] = 'ApplicationV2Mixin export missing';
                        } else {
                            const root = document.createElement('div');
                            root.innerHTML = `
                            <div class="window-content">
                                <input type="text" name="foo" />
                                <textarea name="bar"></textarea>
                                <select name="baz"><option>x</option></select>
                                <button>btn</button>
                                <input type="text" class="always-interactive" name="qux" />
                            </div>
                            <div data-application-part="x"></div>
                        `;
                            // Use the framework's ApplicationV2 + HandlebarsApplicationMixin chain
                            // by mixing onto a synthetic class implementing only what _disableFields
                            // and subtitle touch.
                            class StubBase {
                                element = root;
                                options = { window: { subtitle: '' } };
                                id = 'probe-app';
                                static DEFAULT_OPTIONS = {};
                                static PARTS = {};
                            }
                            const Mixed = ApplicationV2Mixin(StubBase);
                            const inst = new Mixed();
                            // Reach into the prototype: _disableFields is defined on Mixed.
                            const disableFn = (Mixed.prototype as AppV2Inst & { _disableFields?: () => void })._disableFields;
                            if (typeof disableFn !== 'function') {
                                notes['appv2-mixin-subtitle-and-disable'] = '_disableFields not present on prototype';
                            } else {
                                disableFn.call(inst);
                                const fooDisabled = (root.querySelector('input[name="foo"]') as HTMLInputElement).disabled;
                                const barReadOnly = (root.querySelector('textarea[name="bar"]') as HTMLTextAreaElement).readOnly;
                                const bazDisabled = (root.querySelector('select[name="baz"]') as HTMLSelectElement).disabled;
                                const quxIntact = !(root.querySelector('input[name="qux"]') as HTMLInputElement).disabled;
                                // subtitle getter — empty string key localizes to ''.
                                const subtitle = inst.subtitle;
                                const subtitleOk = subtitle === '';
                                if (fooDisabled && barReadOnly && bazDisabled && quxIntact && subtitleOk) {
                                    fired['appv2-mixin-subtitle-and-disable'] = true;
                                    notes['appv2-mixin-subtitle-and-disable'] =
                                        '_disableFields disabled non-interactive inputs; subtitle getter returns localized value';
                                } else {
                                    notes['appv2-mixin-subtitle-and-disable'] = `fooDisabled=${String(fooDisabled)} barReadOnly=${String(
                                        barReadOnly,
                                    )} bazDisabled=${String(bazDisabled)} quxIntact=${String(quxIntact)} subtitle="${String(subtitle)}"`;
                                }
                            }
                        }
                    } catch (err) {
                        notes['appv2-mixin-subtitle-and-disable'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 17: dialog-wait-and-resolve
                 * DialogWH40K.wait() returns a Promise resolved via the
                 * instance's `resolve(value)` helper which flips `_submitted`
                 * to true. Fire wait + resolve in sequence; assert the
                 * Promise settles with the passed value and `_submitted` is true.
                 * ============================================================ */
                async function probeDialogWaitResolve(): Promise<void> {
                    try {
                        interface DialogInst {
                            wait: () => Promise<string>;
                            resolve: (value: string) => void;
                            _submitted: boolean;
                            close?: () => Promise<void>;
                        }
                        type DialogCtor = new (config: { window: { title: string }; content: string; buttons: never[] }) => DialogInst;
                        const mod = await loadModule<{ default?: DialogCtor; DialogWH40K?: DialogCtor }>(`${base}/applications/api/dialog.js`);
                        const DialogWH40K = mod.default ?? mod.DialogWH40K;
                        if (typeof DialogWH40K !== 'function') {
                            notes['dialog-wait-and-resolve'] = 'DialogWH40K export missing';
                        } else {
                            const dialog = new DialogWH40K({
                                window: { title: 'probe-wait-dialog' },
                                content: '<p>wait-probe</p>',
                                buttons: [],
                            });
                            // wait() awaits a Promise that resolves on close OR
                            // resolve(). Kick off wait, then immediately call
                            // resolve('probe-value') to settle the Promise without
                            // needing the render to materialise.
                            const waitPromise = dialog.wait();
                            // Yield a tick so wait() installs its 'close' listener.
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 30);
                            });
                            dialog.resolve('probe-value');
                            const submittedFlag = dialog._submitted;
                            const settled = await withTimeout(waitPromise, 5_000, 'DialogWH40K.wait');
                            if (settled === 'probe-value' && submittedFlag) {
                                fired['dialog-wait-and-resolve'] = true;
                                notes['dialog-wait-and-resolve'] = 'wait() resolved with the resolve(value) payload; _submitted=true';
                            } else {
                                notes['dialog-wait-and-resolve'] = `settled=${String(settled)} submittedFlag=${String(submittedFlag)}`;
                            }
                            try {
                                await dialog.close?.();
                            } catch {
                                /* ignore */
                            }
                            await closeOpenDialogs();
                        }
                    } catch (err) {
                        notes['dialog-wait-and-resolve'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 18: whatif-mixin-exit-and-direct-apply
                 * Two complementary branches of WhatIfMixin:
                 *  1. When `_whatIfActive` is false, `previewChange` forwards
                 *     straight to `_applyChange` → `document.update` (no
                 *     buffering, no toolbar).
                 *  2. `exitWhatIfMode` after entering resets all flags and
                 *     removes the toolbar DOM.
                 * ============================================================ */
                async function probeWhatIfExitDirect(): Promise<void> {
                    try {
                        const live = getPc();
                        if (live == null) {
                            notes['whatif-mixin-exit-and-direct-apply'] = 'no PC actor';
                        } else {
                            interface WhatIfInst {
                                previewChange: (key: string, value: string | number) => Promise<void>;
                                enterWhatIfMode: () => Promise<void>;
                                exitWhatIfMode: () => Promise<void>;
                                _whatIfActive: boolean;
                                _whatIfChanges: Record<string, string | number>;
                                _whatIfPreview: object | null;
                            }
                            const mod = await loadModule<ProbeModule<MixinFactory<WhatIfInst>> & { WhatIfMixin?: MixinFactory<WhatIfInst> }>(
                                `${base}/applications/api/what-if-mixin.js`,
                            );
                            const WhatIfMixin = mod.default ?? mod.WhatIfMixin;
                            if (typeof WhatIfMixin !== 'function') {
                                notes['whatif-mixin-exit-and-direct-apply'] = 'WhatIfMixin export missing';
                            } else {
                                const el = document.createElement('div');
                                class StubBase {
                                    document = live;
                                    element = el;
                                    async render(): Promise<void> {
                                        return Promise.resolve();
                                    }
                                    async _prepareContext(): Promise<Record<string, never>> {
                                        return Promise.resolve({});
                                    }
                                    async _onRender(): Promise<void> {
                                        return Promise.resolve();
                                    }
                                }
                                const Mixed = WhatIfMixin(StubBase);
                                const inst = new Mixed();
                                // Branch 1: direct apply when inactive — write a
                                // tracker flag that we can read back.
                                const beforeFlag = live.getFlag?.('wh40k-rpg', 'probe-whatif-direct');
                                await withTimeout(inst.previewChange('flags.wh40k-rpg.probe-whatif-direct', 'applied'), 5_000, 'previewChange(inactive)');
                                const afterFlag = live.getFlag?.('wh40k-rpg', 'probe-whatif-direct') === 'applied';
                                cleanups.push(async () => {
                                    try {
                                        await live.unsetFlag?.('wh40k-rpg', 'probe-whatif-direct');
                                    } catch {
                                        /* ignore */
                                    }
                                });
                                // Branch 2: enter what-if, then exit — assert state cleared.
                                await withTimeout(inst.enterWhatIfMode(), 5_000, 'enterWhatIfMode');
                                await withTimeout(inst.previewChange('system.characteristics.weaponSkill.advance', 7), 5_000, 'previewChange(active)');
                                await withTimeout(inst.exitWhatIfMode(), 5_000, 'exitWhatIfMode');
                                const inactive = !inst._whatIfActive;
                                const changesCleared = Object.keys(inst._whatIfChanges).length === 0;
                                const previewCleared = inst._whatIfPreview === null;
                                if (beforeFlag !== 'applied' && afterFlag && inactive && changesCleared && previewCleared) {
                                    fired['whatif-mixin-exit-and-direct-apply'] = true;
                                    notes['whatif-mixin-exit-and-direct-apply'] =
                                        'inactive previewChange forwarded to update; exitWhatIfMode cleared all state';
                                } else {
                                    notes['whatif-mixin-exit-and-direct-apply'] = `beforeFlag=${String(beforeFlag)} afterFlag=${String(
                                        afterFlag,
                                    )} inactive=${String(inactive)} changesCleared=${String(changesCleared)} previewCleared=${String(previewCleared)}`;
                                }
                            }
                        }
                    } catch (err) {
                        notes['whatif-mixin-exit-and-direct-apply'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 19: statbreakdown-mixin-variant-rows
                 * Drive `showStatBreakdown` against a document whose
                 * getStatBreakdown returns multiple modifiers — one with a
                 * source uuid (clickable variant) and one without — plus a
                 * negative-value mod to exercise the negative-value class
                 * branch. Assert the popover contains the markers for each
                 * row variant, then close it via the registered close button.
                 * ============================================================ */
                async function probeStatBreakdownRows(): Promise<void> {
                    try {
                        const mod = await loadModule<ProbeModule<MixinFactory<object>> & { StatBreakdownMixin?: MixinFactory<object> }>(
                            `${base}/applications/api/stat-breakdown-mixin.js`,
                        );
                        const StatBreakdownMixin = mod.default ?? mod.StatBreakdownMixin;
                        if (typeof StatBreakdownMixin !== 'function') {
                            notes['statbreakdown-mixin-variant-rows'] = 'StatBreakdownMixin export missing';
                        } else {
                            const el = document.createElement('div');
                            interface StatBreakdownData {
                                label: string;
                                base: number;
                                modifiers: Array<{ value: number; source: string; uuid?: string; icon?: string }>;
                                total: number;
                            }
                            class StubBase {
                                element = el;
                                document = {
                                    getStatBreakdown: (_key: string): StatBreakdownData => ({
                                        label: 'Weapon Skill',
                                        base: 30,
                                        modifiers: [
                                            { value: 5, source: 'Talent', uuid: 'Item.probe', icon: 'fas fa-star' },
                                            { value: -3, source: 'Penalty' }, // no uuid → non-clickable
                                        ],
                                        total: 32,
                                    }),
                                };
                            }
                            const Mixed = StatBreakdownMixin(StubBase);
                            const action = Mixed.DEFAULT_OPTIONS?.actions?.showStatBreakdown;
                            if (typeof action !== 'function') {
                                notes['statbreakdown-mixin-variant-rows'] = 'showStatBreakdown action not registered';
                            } else {
                                const inst = new Mixed();
                                const target = document.createElement('div');
                                target.dataset['statKey'] = 'weaponSkill';
                                action.call(inst, new MouseEvent('click', { bubbles: true, cancelable: true }), target);
                                await new Promise<void>((resolve) => {
                                    setTimeout(resolve, 30);
                                });
                                const popover = document.querySelector('.wh40k-stat-breakdown-popover');
                                const html = popover?.innerHTML ?? '';
                                const hasTotal = html.includes('Weapon Skill: 32');
                                const hasBase = html.includes('>Base<') || html.includes('Base');
                                const hasPositive = html.includes('wh40k-stat-breakdown-value--positive') && html.includes('+5');
                                const hasNegative = html.includes('wh40k-stat-breakdown-value--negative') && html.includes('-3');
                                const hasClickable = html.includes('wh40k-stat-breakdown-row--clickable') && html.includes('Item.probe');
                                const hasIcon = html.includes('fas fa-star');
                                // Close via the registered button.
                                const closeBtn = popover?.querySelector<HTMLButtonElement>('[data-action="closeBreakdown"]');
                                closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                                await new Promise<void>((resolve) => {
                                    setTimeout(resolve, 30);
                                });
                                const popoverAfterClose = document.querySelector('.wh40k-stat-breakdown-popover');
                                const closedOk = popoverAfterClose === null;
                                if (hasTotal && hasBase && hasPositive && hasNegative && hasClickable && hasIcon && closedOk) {
                                    fired['statbreakdown-mixin-variant-rows'] = true;
                                    notes['statbreakdown-mixin-variant-rows'] =
                                        'popover rendered positive + negative + uuid-clickable + icon variants; close button removed it';
                                } else {
                                    notes['statbreakdown-mixin-variant-rows'] = `total=${String(hasTotal)} base=${String(hasBase)} pos=${String(
                                        hasPositive,
                                    )} neg=${String(hasNegative)} clickable=${String(hasClickable)} icon=${String(hasIcon)} closed=${String(closedOk)}`;
                                    // Force-remove leftover popover so subsequent flows start clean.
                                    document.querySelectorAll('.wh40k-stat-breakdown-popover').forEach((popoverEl) => popoverEl.remove());
                                }
                            }
                        }
                    } catch (err) {
                        notes['statbreakdown-mixin-variant-rows'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 20: collapsible-panel-roundtrip
                 * After togglePanel(forceState=true) the panel must NOT be
                 * collapsed and `expandedSections.get(id)` must be true.
                 * After togglePanel(forceState=false) it must be collapsed
                 * and the Map value must be false. The full round-trip
                 * exercises the `_animatePanelToggle` 300ms branch.
                 * ============================================================ */
                async function probeCollapsibleRoundtrip(): Promise<void> {
                    try {
                        interface CollapsibleInst {
                            togglePanel: (id: string, forceState: boolean) => Promise<void>;
                            expandedSections: Map<string, boolean>;
                            applyPanelPreset: (preset: string) => Promise<void>;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<CollapsibleInst>> & { CollapsiblePanelMixin?: MixinFactory<CollapsibleInst> }>(
                            `${base}/applications/api/collapsible-panel-mixin.js`,
                        );
                        const CollapsiblePanelMixin = mod.default ?? mod.CollapsiblePanelMixin;
                        if (typeof CollapsiblePanelMixin !== 'function') {
                            notes['collapsible-panel-roundtrip'] = 'CollapsiblePanelMixin export missing';
                        } else {
                            const root = document.createElement('div');
                            root.innerHTML = `<section data-panel-id="roundtrip" class="collapsed"><div class="panel-content">body</div></section>`;
                            class StubBase {
                                element = root;
                                expandedSections = new Map<string, boolean>();
                                id = 'rt-app';
                                document = undefined;
                            }
                            const Mixed = CollapsiblePanelMixin(StubBase);
                            const inst = new Mixed();
                            const panel = root.querySelector('[data-panel-id="roundtrip"]') as HTMLElement;
                            const beforeCollapsed = panel.classList.contains('collapsed');
                            await withTimeout(inst.togglePanel('roundtrip', true), 5_000, 'expand');
                            const afterExpandClasses = !panel.classList.contains('collapsed');
                            const expandedSet = inst.expandedSections.get('roundtrip') === true;
                            await withTimeout(inst.togglePanel('roundtrip', false), 5_000, 'collapse');
                            const afterCollapseClasses = panel.classList.contains('collapsed');
                            const collapsedSet = inst.expandedSections.get('roundtrip') === false;
                            if (beforeCollapsed && afterExpandClasses && expandedSet && afterCollapseClasses && collapsedSet) {
                                fired['collapsible-panel-roundtrip'] = true;
                                notes['collapsible-panel-roundtrip'] = 'expand → collapse round-trip flipped panel class and expandedSections value';
                            } else {
                                notes['collapsible-panel-roundtrip'] = `beforeCollapsed=${String(beforeCollapsed)} afterExpand=${String(
                                    afterExpandClasses,
                                )} expandedSet=${String(expandedSet)} afterCollapse=${String(afterCollapseClasses)} collapsedSet=${String(collapsedSet)}`;
                            }
                        }
                    } catch (err) {
                        notes['collapsible-panel-roundtrip'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 21: collapsible-panel-apply-preset
                 * `applyPanelPreset('combat')` walks the preset map and sets
                 * each panel's collapsed class + `expandedSections` value to
                 * the preset's truth-table. `applyPanelPreset('all')` and
                 * `('none')` delegate to expandAll/collapseAll branches.
                 * ============================================================ */
                async function probeCollapsiblePreset(): Promise<void> {
                    try {
                        interface CollapsibleInst {
                            expandedSections: Map<string, boolean>;
                            applyPanelPreset: (preset: string) => Promise<void>;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<CollapsibleInst>> & { CollapsiblePanelMixin?: MixinFactory<CollapsibleInst> }>(
                            `${base}/applications/api/collapsible-panel-mixin.js`,
                        );
                        const CollapsiblePanelMixin = mod.default ?? mod.CollapsiblePanelMixin;
                        if (typeof CollapsiblePanelMixin !== 'function') {
                            notes['collapsible-panel-apply-preset'] = 'CollapsiblePanelMixin export missing';
                        } else {
                            const root = document.createElement('div');
                            root.innerHTML = `
                            <section data-panel-id="weapons"><div class="panel-content">w</div></section>
                            <section data-panel-id="skills" class="collapsed"><div class="panel-content">s</div></section>
                            <section data-panel-id="biography" class="collapsed"><div class="panel-content">b</div></section>
                        `;
                            class StubBase {
                                element = root;
                                expandedSections = new Map<string, boolean>();
                                id = 'preset-app';
                                document = undefined;
                            }
                            const Mixed = CollapsiblePanelMixin(StubBase);
                            const inst = new Mixed();
                            await withTimeout(inst.applyPanelPreset('combat'), 10_000, 'applyPreset(combat)');
                            // combat preset: weapons=true, skills=false, biography=false
                            const weaponsExpanded = inst.expandedSections.get('weapons') === true;
                            const skillsCollapsed = inst.expandedSections.get('skills') === false;
                            const bioCollapsed = inst.expandedSections.get('biography') === false;
                            // applyPanelPreset('none') → collapseAllPanels.
                            await withTimeout(inst.applyPanelPreset('none'), 10_000, 'applyPreset(none)');
                            const allCollapsed =
                                inst.expandedSections.get('weapons') === false &&
                                inst.expandedSections.get('skills') === false &&
                                inst.expandedSections.get('biography') === false;
                            // applyPanelPreset('all') → expandAllPanels.
                            await withTimeout(inst.applyPanelPreset('all'), 10_000, 'applyPreset(all)');
                            const allExpanded =
                                inst.expandedSections.get('weapons') === true &&
                                inst.expandedSections.get('skills') === true &&
                                inst.expandedSections.get('biography') === true;
                            if (weaponsExpanded && skillsCollapsed && bioCollapsed && allCollapsed && allExpanded) {
                                fired['collapsible-panel-apply-preset'] = true;
                                notes['collapsible-panel-apply-preset'] =
                                    'combat preset selectively expanded; none/all special presets delegated to collapseAll/expandAll';
                            } else {
                                notes['collapsible-panel-apply-preset'] = `combat: weapons=${String(weaponsExpanded)} skills=${String(
                                    skillsCollapsed,
                                )} bio=${String(bioCollapsed)} | none-all=${String(allCollapsed)} | all-expand=${String(allExpanded)}`;
                            }
                        }
                    } catch (err) {
                        notes['collapsible-panel-apply-preset'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                /* ============================================================
                 * Flow 22: enhanced-animations-skip-and-flash
                 * `animateCounter` early-returns when from===to (no rAF
                 * scheduled). `_shouldSkipAnimation` is callable and returns
                 * a boolean. `_flashElement` adds + removes the animation
                 * class after the duration. Detection of the early-return is
                 * via the absence of any `.value-counter` class on the el.
                 * ============================================================ */
                async function probeEnhancedAnimations(): Promise<void> {
                    try {
                        interface AnimInst {
                            animateCounter: (el: HTMLElement, from: number, to: number, opts: { duration: number }) => void;
                            _shouldSkipAnimation: () => boolean;
                            _flashElement: (el: HTMLElement, cls: string, duration: number) => void;
                        }
                        const mod = await loadModule<ProbeModule<MixinFactory<AnimInst>> & { EnhancedAnimationsMixin?: MixinFactory<AnimInst> }>(
                            `${base}/applications/api/enhanced-animations-mixin.js`,
                        );
                        const EnhancedAnimationsMixin = mod.default ?? mod.EnhancedAnimationsMixin;
                        if (typeof EnhancedAnimationsMixin !== 'function') {
                            notes['enhanced-animations-skip-and-flash'] = 'EnhancedAnimationsMixin export missing';
                        } else {
                            class StubBase {
                                element = document.createElement('div');
                                document: { system: Record<string, never> } = { system: {} };
                            }
                            const Mixed = EnhancedAnimationsMixin(StubBase);
                            const inst = new Mixed();
                            // Branch 1: identical from/to → no class swap.
                            const el = document.createElement('span');
                            inst.animateCounter(el, 7, 7, { duration: 30 });
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 50);
                            });
                            const noClass = !el.classList.contains('value-counter');
                            // Branch 2: _shouldSkipAnimation is callable and returns boolean.
                            const shouldSkip = inst._shouldSkipAnimation();
                            const skipBoolean = typeof shouldSkip === 'boolean';
                            // Branch 3: _flashElement applies then removes class after duration.
                            const flashEl = document.createElement('div');
                            inst._flashElement(flashEl, 'tw-animate-stat-heal', 30);
                            const flashAppliedNow = flashEl.classList.contains('tw-animate-stat-heal');
                            await new Promise<void>((resolve) => {
                                setTimeout(resolve, 80);
                            });
                            const flashRemoved = !flashEl.classList.contains('tw-animate-stat-heal');
                            if (noClass && skipBoolean && flashAppliedNow && flashRemoved) {
                                fired['enhanced-animations-skip-and-flash'] = true;
                                notes['enhanced-animations-skip-and-flash'] =
                                    'animateCounter(from==to) skipped; _shouldSkipAnimation→bool; _flashElement applied then auto-cleared class';
                            } else {
                                notes['enhanced-animations-skip-and-flash'] = `noClass=${String(noClass)} skipBoolean=${String(
                                    skipBoolean,
                                )} flashAppliedNow=${String(flashAppliedNow)} flashRemoved=${String(flashRemoved)}`;
                            }
                        }
                    } catch (err) {
                        notes['enhanced-animations-skip-and-flash'] = `flow threw: ${String(err instanceof Error ? err.message : String(err))}`;
                    }
                }

                try {
                    await probeAllowedBehaviors();
                    await probeDefaultBehavior();
                    await probeModifierKeys();
                    await probeSharedPc();
                    await probeGhostAndSplit();
                    await probeValidateSlot();
                    await probeFavoritesApi();
                    await probeExpandableToggle();
                    await probeExpandableProgrammatic();
                    await probeFindAndClassify();
                    await probeAnimateCounter();
                    await probeVisualizeChanges();
                    await probeTooltipBuilders();
                    await probeTooltipStaticHelpers();
                    await probeIconsResolution();
                    await probeIconsHandlebars();
                    await probeAppV2SubtitleDisable();
                    await probeDialogWaitResolve();
                    await probeWhatIfExitDirect();
                    await probeStatBreakdownRows();
                    await probeCollapsibleRoundtrip();
                    await probeCollapsiblePreset();
                    await probeEnhancedAnimations();
                } finally {
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
                    // Clean up any popovers we leaked from stat-breakdown flows.
                    document.querySelectorAll('.wh40k-stat-breakdown-popover').forEach((el) => el.remove());
                }

                return { flowsFired: fired, flowNotes: notes };
            },
            APP_API_DEPTH_FLOWS,
        );

        return {
            flowsFired: result.flowsFired,
            flowNotes: result.flowNotes,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('applications/api + components depth coverage (Tier B)', () => {
    // Cap at 3 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(180_000);
    test('uncovered api/components modules + deeper branches into entry-level surfaces', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeAppApiDepthFlows(page);

        const failures: string[] = [];
        for (const flow of APP_API_DEPTH_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('app-api-depth.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${APP_API_DEPTH_FLOWS.length} app-api-depth probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
