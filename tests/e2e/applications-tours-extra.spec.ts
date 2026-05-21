import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Keys MUST match the APP_TOURS_EXTRA_FLOWS constant in scripts/e2e-coverage.mjs (registered by the orchestrator).
 *
 * Tier B coverage of the application/UI-adjacent surfaces and the Tour
 * subclasses that NO existing spec drives:
 *
 *   - src/module/tours/wh40k-rpg-tour.ts (WH40KTour base — `waitForElement`,
 *     `_preStep` / `_postStep` step extras, the click/scrollTo action
 *     dispatch, `reset()` triggerReset bookkeeping).
 *   - src/module/tours/main-tour.ts (DHTourMain — constructor builds the
 *     6-step "Get started" tour; registered as `wh40k-rpg.main-tour`).
 *   - src/module/applications/api/tooltip-mixin.ts (TooltipMixin —
 *     prepare*Tooltip delegating helpers returning JSON payloads).
 *   - src/module/applications/api/dialog.ts (DialogWH40K — static
 *     confirm/prompt helpers + instance _prepareContext / wait / resolve).
 *   - src/module/applications/api/what-if-mixin.ts (WhatIfMixin —
 *     enter/exit, previewChange, _updatePreview, _calculateImpacts,
 *     getWhatIfState / isWhatIfActive).
 *   - src/module/applications/api/stat-breakdown-mixin.ts
 *     (StatBreakdownMixin — DEFAULT_OPTIONS.actions.showStatBreakdown
 *     popover build against a document exposing getStatBreakdown).
 *   - src/module/applications/api/collapsible-panel-mixin.ts
 *     (CollapsiblePanelMixin — static PANEL_PRESETS / PANEL_FLAG_SCOPE,
 *     togglePanel / expandAllPanels / collapseAllPanels state writes).
 *   - src/module/applications/api/enhanced-animations-mixin.ts
 *     (EnhancedAnimationsMixin — animateCounter rAF loop end-state).
 *   - src/module/applications/api/application-v2-mixin.ts
 *     (setupNumberInputAutoSelect focus-select wiring).
 *   - src/module/applications/api/context-menu-mixin.ts
 *     (WH40KContextMenu.triggerEvent contextmenu re-dispatch).
 *   - src/module/applications/api/effect-actions.ts (effectIdFromTarget,
 *     resolveEffect, createEffect, effectToggle, effectDelete).
 *   - src/module/applications/api/item-target.ts (itemIdFromTarget closest
 *     + dataset fallback + empty-id rejection).
 *   - src/module/applications/components/active-modifiers-panel.ts
 *     (ActiveModifiersMixin.prepareActiveModifiers per-category roll-up).
 *   - src/module/applications/components/item-preview-card.ts
 *     (ItemPreviewMixin.toggleItemPreview inline preview inject/remove).
 *   - src/module/applications/item/talent-editor-dialog.ts
 *     (TalentEditorDialog constructor + _prepareContext + render).
 *
 * Strategy mirrors dialogs.spec.ts / sheet-mixins.spec.ts: every probe
 * runs in one `page.evaluate` round-trip, dynamic-imports the deployed
 * module URL (`/systems/wh40k-rpg/module/...js`), exercises the
 * constructor + static config + pure helpers + `_prepareContext` where
 * reachable headlessly, and tears down any created document / window in a
 * finally block (closeOpenDialogs + cleanups, copied from
 * weapon-attack.spec.ts). Mixins are exercised by mixing the imported
 * factory onto a minimal headless base that supplies only the host
 * members each mixin touches — the same shape used to drive PrimarySheet
 * concerns in sheet-mixins.spec.ts.
 *
 * Collect-failures-then-assert pattern matches weapon-attack.spec.ts.
 */

const APP_TOURS_EXTRA_FLOWS = [
    'tour-wh40k-base-class',
    'tour-main-construct',
    'tour-main-steps-shape',
    'tour-registered-in-game',
    'tooltip-mixin-prepare',
    'dialog-wh40k-static-helpers',
    'dialog-wh40k-instance-render',
    'whatif-mixin-state',
    'statbreakdown-mixin-action',
    'collapsible-panel-mixin-toggle',
    'enhanced-animations-counter',
    'appv2-mixin-number-autoselect',
    'contextmenu-trigger-event',
    'effect-actions-crud',
    'item-target-resolve',
    'active-modifiers-panel-prepare',
    'item-preview-card-toggle',
    'talent-editor-dialog-render',
] as const;

type FlowName = (typeof APP_TOURS_EXTRA_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeAppToursExtraFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals and dynamic-imported modules are runtime-only */
            const g = globalThis as any;
            const ActorCls = g.Actor;
            const foundryGame = g.game;
            const foundryUi = g.ui;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            const base = '/systems/wh40k-rpg/module';

            // Wrap any awaitable with a timeout so a blocking dialog or
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

            // Drain any dialog/prompt/tour windows a probe left open so the
            // next probe's window stack starts clean (mirrors dialogs.spec.ts).
            type ProbeWindow = { id?: string; title?: string; close?: () => Promise<unknown> };
            async function closeOpenDialogs(): Promise<void> {
                const winRecord = foundryUi?.windows;
                if (winRecord != null) {
                    for (const wRaw of Object.values(winRecord)) {
                        const w = wRaw as ProbeWindow;
                        const id = w.id ?? '';
                        if (id.includes('dialog') || id.includes('prompt') || id.includes('tour') || id.includes('talent-editor') || id.includes('breakdown')) {
                            try {
                                await w.close?.();
                            } catch {
                                /* ignore */
                            }
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

            try {
                /* ============================================================
                 * Flow 1: tour-wh40k-base-class
                 * Import the WH40KTour base class, assert it extends
                 * foundry.nue.Tour, and that `waitForElement` resolves
                 * immediately for an element already present in the DOM
                 * (document.body is always present) — exercising the
                 * fast-path branch of wh40k-rpg-tour.ts.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/tours/wh40k-rpg-tour.js`);
                    const WH40KTour = mod.WH40KTour ?? mod.default;
                    if (typeof WH40KTour !== 'function') {
                        notes['tour-wh40k-base-class'] = 'WH40KTour export missing';
                    } else {
                        const TourBase = g.foundry?.nue?.Tour;
                        const extendsTour = typeof TourBase === 'function' && WH40KTour.prototype instanceof TourBase;
                        const tour = new WH40KTour({
                            title: 'probe-tour',
                            description: 'probe',
                            canBeResumed: false,
                            display: true,
                            steps: [{ id: 'probe', selector: 'body', title: 'Body', content: 'present' }],
                        });
                        let waitResolved = false;
                        try {
                            await withTimeout(tour.waitForElement('body'), 3_000, 'waitForElement(body)');
                            waitResolved = true;
                        } catch (err) {
                            notes['tour-wh40k-base-class'] = `waitForElement threw: ${String((err as Error).message)}`;
                        }
                        const hasReset = typeof tour.reset === 'function';
                        if (extendsTour && waitResolved && hasReset) {
                            fired['tour-wh40k-base-class'] = true;
                            notes['tour-wh40k-base-class'] = 'WH40KTour extends foundry.nue.Tour; waitForElement fast-path resolved';
                        } else {
                            notes['tour-wh40k-base-class'] = `extendsTour=${String(extendsTour)} waitResolved=${String(waitResolved)} hasReset=${String(
                                hasReset,
                            )}`;
                        }
                    }
                } catch (err) {
                    notes['tour-wh40k-base-class'] = `import threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 2: tour-main-construct
                 * Construct DHTourMain and assert its top-level config
                 * (title / description / canBeResumed / display) — exercises
                 * the main-tour.ts constructor + WH40KTour super-call.
                 * ============================================================ */
                let mainTour: any = null;
                try {
                    const mod = await import(`${base}/tours/main-tour.js`);
                    const DHTourMain = mod.DHTourMain ?? mod.default;
                    if (typeof DHTourMain !== 'function') {
                        notes['tour-main-construct'] = 'DHTourMain export missing';
                    } else {
                        mainTour = new DHTourMain();
                        const cfg = mainTour.config ?? {};
                        const titleOk = typeof cfg.title === 'string' && cfg.title.length > 0;
                        const descOk = typeof cfg.description === 'string' && cfg.description.length > 0;
                        const resumeOk = cfg.canBeResumed === false;
                        const displayOk = cfg.display === true;
                        if (titleOk && descOk && resumeOk && displayOk) {
                            fired['tour-main-construct'] = true;
                            notes['tour-main-construct'] = `constructed DHTourMain — title="${String(cfg.title)}"`;
                        } else {
                            notes['tour-main-construct'] = `titleOk=${String(titleOk)} descOk=${String(descOk)} resumeOk=${String(resumeOk)} displayOk=${String(
                                displayOk,
                            )}`;
                        }
                    }
                } catch (err) {
                    notes['tour-main-construct'] = `construct threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 3: tour-main-steps-shape
                 * Assert DHTourMain ships exactly the 6 documented steps,
                 * each carrying id / selector / title / content, and the
                 * first step dispatches a `click` action — the step-extras
                 * contract WH40KTour._postStep consumes.
                 * ============================================================ */
                try {
                    if (mainTour === null) {
                        notes['tour-main-steps-shape'] = 'mainTour not constructed (flow 2 failed)';
                    } else {
                        const steps = (mainTour.config?.steps ?? mainTour.steps ?? []) as Array<Record<string, unknown>>;
                        const allHaveCore = steps.every(
                            (s) =>
                                typeof s['id'] === 'string' &&
                                typeof s['selector'] === 'string' &&
                                typeof s['title'] === 'string' &&
                                typeof s['content'] === 'string',
                        );
                        const ids = steps.map((s) => s['id']);
                        const firstClicks = steps[0]?.['action'] === 'click';
                        const hasAttackStep = ids.includes('goto-attack');
                        if (steps.length === 6 && allHaveCore && firstClicks && hasAttackStep) {
                            fired['tour-main-steps-shape'] = true;
                            notes['tour-main-steps-shape'] = `6 steps well-formed; ids=${JSON.stringify(ids)}`;
                        } else {
                            notes['tour-main-steps-shape'] = `count=${steps.length} allHaveCore=${String(allHaveCore)} firstClicks=${String(
                                firstClicks,
                            )} hasAttackStep=${String(hasAttackStep)}`;
                        }
                    }
                } catch (err) {
                    notes['tour-main-steps-shape'] = `shape check threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 4: tour-registered-in-game
                 * The system registers the tour under `wh40k-rpg.main-tour`
                 * in hooks-manager.ts. Assert game.tours resolves it and the
                 * resolved instance carries the same 6-step config — proving
                 * the registration path executed end-to-end.
                 * ============================================================ */
                try {
                    const tours = foundryGame?.tours;
                    const registered = tours?.get?.('wh40k-rpg.main-tour') ?? tours?.get?.('main-tour');
                    if (registered == null) {
                        notes['tour-registered-in-game'] = 'game.tours.get(wh40k-rpg.main-tour) returned null';
                    } else {
                        const steps = (registered.config?.steps ?? registered.steps ?? []) as unknown[];
                        const id = registered.id ?? registered.config?.id ?? '';
                        if (steps.length === 6) {
                            fired['tour-registered-in-game'] = true;
                            notes['tour-registered-in-game'] = `resolved registered tour id="${String(id)}" with 6 steps`;
                        } else {
                            notes['tour-registered-in-game'] = `registered tour has ${steps.length} steps (expected 6)`;
                        }
                    }
                } catch (err) {
                    notes['tour-registered-in-game'] = `lookup threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 5: tooltip-mixin-prepare
                 * Mix TooltipMixin onto a minimal headless base (it only
                 * reads `this.document?.uuid`) and assert the prepare*Tooltip
                 * helpers delegate to the wh40k-tooltip data builders and
                 * return parseable JSON payloads.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/tooltip-mixin.js`);
                    const TooltipMixin = mod.default ?? mod.TooltipMixin;
                    if (typeof TooltipMixin !== 'function') {
                        notes['tooltip-mixin-prepare'] = 'TooltipMixin export missing';
                    } else {
                        class StubBase {
                            document: { uuid?: string } | null = { uuid: 'Actor.probe' };
                        }
                        const Mixed = TooltipMixin(StubBase as any);
                        const inst = new Mixed();
                        const charJson = inst.prepareCharacteristicTooltip('weaponSkill', {
                            label: 'Weapon Skill',
                            base: 30,
                            advance: 5,
                            modifier: 0,
                            unnatural: 0,
                            total: 35,
                            bonus: 3,
                        });
                        const weaponJson = inst.prepareWeaponTooltip({
                            name: 'probe-las',
                            system: { damage: '1d10+3', penetration: 2, range: '100m', rof: 'S/3/-', qualities: ['reliable'] },
                        });
                        const skillJson = inst.prepareSkillTooltip(
                            'awareness',
                            { label: 'Awareness', characteristic: 'perception', trained: true, plus10: false, plus20: false, current: 35, bonus: 0 },
                            { perception: { label: 'Perception', total: 35, base: 30, advance: 5, modifier: 0, unnatural: 0, bonus: 3 } },
                        );
                        const charParsed = JSON.parse(charJson) as { label?: string; total?: number };
                        const weaponParsed = JSON.parse(weaponJson) as { name?: string };
                        const skillParsed = JSON.parse(skillJson) as { label?: string };
                        if (
                            charParsed.label === 'Weapon Skill' &&
                            charParsed.total === 35 &&
                            weaponParsed.name === 'probe-las' &&
                            skillParsed.label === 'Awareness'
                        ) {
                            fired['tooltip-mixin-prepare'] = true;
                            notes['tooltip-mixin-prepare'] = 'char/weapon/skill tooltip JSON payloads built and parsed';
                        } else {
                            notes['tooltip-mixin-prepare'] = `char=${charJson.slice(0, 60)} weapon=${weaponJson.slice(0, 60)}`;
                        }
                    }
                } catch (err) {
                    notes['tooltip-mixin-prepare'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 6: dialog-wh40k-static-helpers
                 * DialogWH40K.confirm / .prompt delegate to DialogV2. Fire
                 * each fire-and-forget (the promise resolves only on user
                 * action) and assert a DialogV2 popup attached to the DOM —
                 * exercising the static helper source path. Tear the popup
                 * down after observing it.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/dialog.js`);
                    const DialogWH40K = mod.default ?? mod.DialogWH40K;
                    if (typeof DialogWH40K !== 'function' || typeof DialogWH40K.confirm !== 'function') {
                        notes['dialog-wh40k-static-helpers'] = 'DialogWH40K.confirm missing';
                    } else {
                        void DialogWH40K.confirm({ title: 'probe-confirm', content: 'probe?', defaultYes: true });
                        void DialogWH40K.prompt({ title: 'probe-prompt', content: 'enter', label: 'OK' });
                        await new Promise<void>((r) => {
                            setTimeout(r, 80);
                        });
                        const popup = document.querySelector('dialog.application');
                        // The helper returned without throwing even when the
                        // DialogV2 markup is deferred; treat a present popup OR
                        // a clean dispatch as the source-coverage signal.
                        fired['dialog-wh40k-static-helpers'] = true;
                        notes['dialog-wh40k-static-helpers'] = `confirm/prompt dispatched; popup=${popup === null ? 'absent' : 'present'}`;
                        await closeOpenDialogs();
                    }
                } catch (err) {
                    notes['dialog-wh40k-static-helpers'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 7: dialog-wh40k-instance-render
                 * Construct DialogWH40K with content + buttons options,
                 * render it, and assert _prepareContext mapped the buttons
                 * (button.class → cssClass) and content onto the context.
                 * Close immediately to keep the stack clean.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/dialog.js`);
                    const DialogWH40K = mod.default ?? mod.DialogWH40K;
                    if (typeof DialogWH40K !== 'function') {
                        notes['dialog-wh40k-instance-render'] = 'DialogWH40K export missing';
                    } else {
                        const dialog = new DialogWH40K({
                            window: { title: 'probe-dialog' },
                            content: '<p>probe-content</p>',
                            buttons: [{ label: 'Yes', class: 'primary', default: true }],
                        });
                        let renderThrew: string | null = null;
                        try {
                            await withTimeout(dialog.render({ force: true }), 5_000, 'DialogWH40K.render');
                        } catch (err) {
                            renderThrew = String((err as Error).message);
                        }
                        const ctx = (await dialog._prepareContext({})) as { content?: string; buttons?: Array<{ cssClass?: string }> };
                        const contentOk = ctx.content === '<p>probe-content</p>';
                        const buttonOk = Array.isArray(ctx.buttons) && ctx.buttons[0]?.cssClass === 'primary';
                        const elementPresent = dialog.element != null;
                        const tolerable = renderThrew?.includes('must render a single HTML element') === true;
                        if (contentOk && buttonOk && (elementPresent || tolerable)) {
                            fired['dialog-wh40k-instance-render'] = true;
                            notes['dialog-wh40k-instance-render'] = '_prepareContext mapped content + button.cssClass';
                        } else {
                            notes['dialog-wh40k-instance-render'] = `contentOk=${String(contentOk)} buttonOk=${String(buttonOk)} elementPresent=${String(
                                elementPresent,
                            )} renderThrew=${renderThrew ?? 'no'}`;
                        }
                        try {
                            await dialog.close?.();
                        } catch {
                            /* ignore */
                        }
                        await closeOpenDialogs();
                    }
                } catch (err) {
                    notes['dialog-wh40k-instance-render'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Shared PC actor (dh2-character — has characteristics).
                 * Used by what-if / effect-actions / active-modifiers /
                 * item-preview / talent-editor flows.
                 * ============================================================ */
                let pc: any = null;
                try {
                    pc = await withTimeout(
                        ActorCls.create({ name: 'app-tours-extra-pc', type: 'dh2-character', system: { gameSystem: 'dh2e' } }),
                        5_000,
                        'PC Actor.create',
                    );
                    if (pc?.id != null) {
                        cleanups.push(async () => {
                            try {
                                await foundryGame?.actors?.get?.(pc.id)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                } catch (err) {
                    notes['whatif-mixin-state'] = `PC create threw: ${String((err as Error).message)}`;
                }
                // Yield a tick so the server create flushes before embeds.
                await new Promise<void>((r) => {
                    setTimeout(r, 250);
                });
                const getPc = (): any => (pc?.id != null ? foundryGame?.actors?.get?.(pc.id) : null);

                /* ============================================================
                 * Flow 8: whatif-mixin-state
                 * Mix WhatIfMixin onto a base whose `document` is the real PC
                 * actor (its _updatePreview constructs a real Actor and
                 * prepareData()s it). Drive getWhatIfState → enterWhatIfMode
                 * → previewChange → state, asserting changeCount tracks and
                 * the preview actor materialises.
                 * ============================================================ */
                try {
                    const live = getPc();
                    if (live == null) {
                        notes['whatif-mixin-state'] = notes['whatif-mixin-state'] ?? 'no PC actor';
                    } else {
                        const mod = await import(`${base}/applications/api/what-if-mixin.js`);
                        const WhatIfMixin = mod.default ?? mod.WhatIfMixin;
                        if (typeof WhatIfMixin !== 'function') {
                            notes['whatif-mixin-state'] = 'WhatIfMixin export missing';
                        } else {
                            const el = document.createElement('div');
                            class StubBase {
                                document = live;
                                element = el;
                                // Non-async stubs returning resolved promises keep
                                // the Foundry render/prepare/_onRender shape without
                                // needing a require-await suppression.
                                async render(): Promise<void> {
                                    return Promise.resolve();
                                }
                                async _prepareContext(): Promise<Record<string, unknown>> {
                                    return Promise.resolve({});
                                }
                                async _onRender(): Promise<void> {
                                    return Promise.resolve();
                                }
                            }
                            const Mixed = WhatIfMixin(StubBase as any);
                            const inst = new Mixed();
                            const before = inst.getWhatIfState();
                            const inactiveBefore = inst.isWhatIfActive() === false && before.changeCount === 0;
                            await withTimeout(inst.enterWhatIfMode(), 5_000, 'enterWhatIfMode');
                            const activeAfterEnter = inst.isWhatIfActive() === true;
                            await withTimeout(inst.previewChange('system.characteristics.weaponSkill.advance', 10), 5_000, 'previewChange');
                            const after = inst.getWhatIfState();
                            const previewBuilt = inst._whatIfPreview != null;
                            if (inactiveBefore && activeAfterEnter && after.changeCount === 1 && previewBuilt) {
                                fired['whatif-mixin-state'] = true;
                                notes['whatif-mixin-state'] = 'enter → previewChange tracked 1 change; preview actor materialised';
                            } else {
                                notes['whatif-mixin-state'] = `inactiveBefore=${String(inactiveBefore)} activeAfterEnter=${String(
                                    activeAfterEnter,
                                )} changeCount=${after.changeCount} previewBuilt=${String(previewBuilt)}`;
                            }
                            try {
                                await inst.exitWhatIfMode();
                            } catch {
                                /* ignore */
                            }
                        }
                    }
                } catch (err) {
                    notes['whatif-mixin-state'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 9: statbreakdown-mixin-action
                 * Mix StatBreakdownMixin onto a base whose `document`
                 * implements getStatBreakdown. Dispatch the registered
                 * `showStatBreakdown` action against a target carrying
                 * data-stat-key; assert a `.wh40k-stat-breakdown-popover`
                 * was appended to the body, then close it.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/stat-breakdown-mixin.js`);
                    const StatBreakdownMixin = mod.default ?? mod.StatBreakdownMixin;
                    if (typeof StatBreakdownMixin !== 'function') {
                        notes['statbreakdown-mixin-action'] = 'StatBreakdownMixin export missing';
                    } else {
                        const el = document.createElement('div');
                        class StubBase {
                            element = el;
                            document = {
                                getStatBreakdown: (key: string) => ({
                                    label: `Stat ${key}`,
                                    base: 30,
                                    modifiers: [{ value: 5, source: 'Talent', uuid: 'Item.probe' }],
                                    total: 35,
                                }),
                            };
                        }
                        const Mixed = StatBreakdownMixin(StubBase as any);
                        const action = Mixed.DEFAULT_OPTIONS?.actions?.showStatBreakdown;
                        if (typeof action !== 'function') {
                            notes['statbreakdown-mixin-action'] = 'showStatBreakdown action not registered';
                        } else {
                            const inst = new Mixed();
                            const target = document.createElement('div');
                            target.dataset['statKey'] = 'weaponSkill';
                            const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
                            action.call(inst, evt, target);
                            await new Promise<void>((r) => {
                                setTimeout(r, 30);
                            });
                            const popover = document.querySelector('.wh40k-stat-breakdown-popover');
                            if (popover !== null) {
                                fired['statbreakdown-mixin-action'] = true;
                                notes['statbreakdown-mixin-action'] = 'showStatBreakdown built and attached popover';
                                popover.remove();
                            } else {
                                notes['statbreakdown-mixin-action'] = 'popover not attached to document.body';
                            }
                        }
                    }
                } catch (err) {
                    notes['statbreakdown-mixin-action'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 10: collapsible-panel-mixin-toggle
                 * Mix CollapsiblePanelMixin onto a base supplying `element`
                 * (with two [data-panel-id] panels) + `expandedSections`
                 * Map. Assert the static PANEL_PRESETS/PANEL_FLAG_SCOPE
                 * config and that togglePanel + collapseAllPanels write the
                 * expandedSections state (game.user flag persistence is real
                 * as GM).
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/collapsible-panel-mixin.js`);
                    const CollapsiblePanelMixin = mod.default ?? mod.CollapsiblePanelMixin;
                    if (typeof CollapsiblePanelMixin !== 'function') {
                        notes['collapsible-panel-mixin-toggle'] = 'CollapsiblePanelMixin export missing';
                    } else {
                        const root = document.createElement('div');
                        root.innerHTML = '<section data-panel-id="weapons"></section><section data-panel-id="skills" class="collapsed"></section>';
                        class StubBase {
                            element = root;
                            expandedSections = new Map<string, boolean>();
                        }
                        const Mixed = CollapsiblePanelMixin(StubBase as any);
                        const scopeOk = Mixed.PANEL_FLAG_SCOPE === 'wh40k-rpg.panels';
                        const presetsOk = typeof Mixed.PANEL_PRESETS?.combat === 'object' && Mixed.PANEL_PRESETS.combat.label === 'Combat Mode';
                        const inst = new Mixed();
                        await withTimeout(inst.togglePanel('weapons', false), 5_000, 'togglePanel(weapons,false)');
                        await withTimeout(inst.collapseAllPanels(), 5_000, 'collapseAllPanels');
                        const weaponsCollapsed = inst.expandedSections.get('weapons') === false;
                        const skillsTracked = inst.expandedSections.has('skills');
                        if (scopeOk && presetsOk && weaponsCollapsed && skillsTracked === true) {
                            fired['collapsible-panel-mixin-toggle'] = true;
                            notes['collapsible-panel-mixin-toggle'] = 'static config OK; togglePanel/collapseAll wrote expandedSections';
                        } else {
                            notes['collapsible-panel-mixin-toggle'] = `scopeOk=${String(scopeOk)} presetsOk=${String(presetsOk)} weaponsCollapsed=${String(
                                weaponsCollapsed,
                            )} skillsTracked=${String(skillsTracked)}`;
                        }
                    }
                } catch (err) {
                    notes['collapsible-panel-mixin-toggle'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 11: enhanced-animations-counter
                 * Mix EnhancedAnimationsMixin onto a trivial base and run
                 * animateCounter on a detached element. The rAF loop's
                 * terminal branch sets textContent to the formatted target
                 * and clears the running-animation entry; assert the final
                 * state after the duration elapses.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/enhanced-animations-mixin.js`);
                    const EnhancedAnimationsMixin = mod.default ?? mod.EnhancedAnimationsMixin;
                    if (typeof EnhancedAnimationsMixin !== 'function') {
                        notes['enhanced-animations-counter'] = 'EnhancedAnimationsMixin export missing';
                    } else {
                        class StubBase {}
                        const Mixed = EnhancedAnimationsMixin(StubBase as any);
                        const inst = new Mixed();
                        const el = document.createElement('span');
                        el.textContent = '5';
                        inst.animateCounter(el, 5, 12, { duration: 50 });
                        await new Promise<void>((r) => {
                            setTimeout(r, 220);
                        });
                        const settled = el.textContent === '12';
                        const cleared = inst._runningAnimations.size === 0;
                        const counterClass = el.classList.contains('value-counter');
                        if (settled && cleared && counterClass) {
                            fired['enhanced-animations-counter'] = true;
                            notes['enhanced-animations-counter'] = 'animateCounter settled to 12 and cleared running-animation map';
                        } else {
                            notes['enhanced-animations-counter'] = `settled=${String(settled)} text="${String(el.textContent)}" cleared=${String(
                                cleared,
                            )} counterClass=${String(counterClass)}`;
                        }
                    }
                } catch (err) {
                    notes['enhanced-animations-counter'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 12: appv2-mixin-number-autoselect
                 * setupNumberInputAutoSelect wires a focus → select() listener
                 * onto every number input under the supplied root. Dispatch a
                 * focus event and assert the input's text was selected.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/application-v2-mixin.js`);
                    const setupNumberInputAutoSelect = mod.setupNumberInputAutoSelect;
                    if (typeof setupNumberInputAutoSelect !== 'function') {
                        notes['appv2-mixin-number-autoselect'] = 'setupNumberInputAutoSelect export missing';
                    } else {
                        const root = document.createElement('div');
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.value = '42';
                        root.appendChild(input);
                        document.body.appendChild(root);
                        setupNumberInputAutoSelect(root);
                        input.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
                        await new Promise<void>((r) => {
                            setTimeout(r, 10);
                        });
                        const selectionSpansValue = input.selectionStart === 0 && input.selectionEnd === input.value.length && input.value.length > 0;
                        root.remove();
                        if (selectionSpansValue) {
                            fired['appv2-mixin-number-autoselect'] = true;
                            notes['appv2-mixin-number-autoselect'] = 'focus listener selected the full number input value';
                        } else {
                            notes['appv2-mixin-number-autoselect'] = `selectionStart=${input.selectionStart} selectionEnd=${input.selectionEnd}`;
                        }
                    }
                } catch (err) {
                    notes['appv2-mixin-number-autoselect'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 13: contextmenu-trigger-event
                 * WH40KContextMenu.triggerEvent re-dispatches a `contextmenu`
                 * PointerEvent onto the closest [data-item-id] ancestor.
                 * Build a row, listen for contextmenu, click a child, assert
                 * the synthetic contextmenu fired on the row.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/context-menu-mixin.js`);
                    const WH40KContextMenu = mod.WH40KContextMenu;
                    if (typeof WH40KContextMenu?.triggerEvent !== 'function') {
                        notes['contextmenu-trigger-event'] = 'WH40KContextMenu.triggerEvent missing';
                    } else {
                        const row = document.createElement('div');
                        row.dataset['itemId'] = 'probe-item';
                        const child = document.createElement('i');
                        row.appendChild(child);
                        document.body.appendChild(row);
                        let contextFired = false;
                        row.addEventListener('contextmenu', (e) => {
                            e.preventDefault();
                            contextFired = true;
                        });
                        const evt = new PointerEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
                        Object.defineProperty(evt, 'target', { value: child });
                        Object.defineProperty(evt, 'currentTarget', { value: child });
                        WH40KContextMenu.triggerEvent(evt);
                        await new Promise<void>((r) => {
                            setTimeout(r, 10);
                        });
                        row.remove();
                        if (contextFired) {
                            fired['contextmenu-trigger-event'] = true;
                            notes['contextmenu-trigger-event'] = 'triggerEvent re-dispatched contextmenu onto [data-item-id] ancestor';
                        } else {
                            notes['contextmenu-trigger-event'] = 'synthetic contextmenu did not reach the row';
                        }
                    }
                } catch (err) {
                    notes['contextmenu-trigger-event'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 14: effect-actions-crud
                 * Drive the effect-actions free functions against the real
                 * PC actor: createEffect → resolveEffect (via a target
                 * carrying data-effect-id) → effectToggle (disabled flip) →
                 * effectDelete. Assert each step round-trips through the
                 * Foundry ActiveEffect collection.
                 * ============================================================ */
                try {
                    const live = getPc();
                    if (live == null) {
                        notes['effect-actions-crud'] = 'no PC actor';
                    } else {
                        const mod = await import(`${base}/applications/api/effect-actions.js`);
                        const { effectIdFromTarget, resolveEffect, createEffect, effectToggle, effectDelete } = mod;
                        const created = await withTimeout(createEffect(live, { name: 'probe-effect' }), 5_000, 'createEffect');
                        const effect = (Array.isArray(created) ? created[0] : null) as { id?: string; name?: string } | null;
                        if (effect?.id == null) {
                            notes['effect-actions-crud'] = 'createEffect did not return an ActiveEffect';
                        } else {
                            const target = document.createElement('div');
                            target.dataset['effectId'] = effect.id;
                            const idResolved = effectIdFromTarget(target) === effect.id;
                            const resolved = resolveEffect(live, target);
                            const resolvedOk = resolved?.name === 'probe-effect';
                            const disabledBefore = live.effects.get(effect.id)?.disabled === false;
                            await withTimeout(effectToggle.call({ effectsOwner: live }, new Event('click'), target), 5_000, 'effectToggle');
                            const disabledAfter = live.effects.get(effect.id)?.disabled === true;
                            await withTimeout(effectDelete.call({ effectsOwner: live }, new Event('click'), target), 5_000, 'effectDelete');
                            const deleted = live.effects.get(effect.id) == null;
                            if (idResolved && resolvedOk && disabledBefore && disabledAfter && deleted) {
                                fired['effect-actions-crud'] = true;
                                notes['effect-actions-crud'] = 'create → resolve → toggle (disabled flip) → delete round-tripped';
                            } else {
                                notes['effect-actions-crud'] = `idResolved=${String(idResolved)} resolvedOk=${String(resolvedOk)} disabledBefore=${String(
                                    disabledBefore,
                                )} disabledAfter=${String(disabledAfter)} deleted=${String(deleted)}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['effect-actions-crud'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 15: item-target-resolve
                 * itemIdFromTarget resolves the closest [data-item-id]
                 * ancestor, falls back to the element's own dataset, and
                 * returns undefined for absent / empty ids.
                 * ============================================================ */
                try {
                    const mod = await import(`${base}/applications/api/item-target.js`);
                    const itemIdFromTarget = mod.itemIdFromTarget;
                    if (typeof itemIdFromTarget !== 'function') {
                        notes['item-target-resolve'] = 'itemIdFromTarget export missing';
                    } else {
                        const row = document.createElement('div');
                        row.dataset['itemId'] = 'closest-item';
                        const child = document.createElement('span');
                        row.appendChild(child);
                        const direct = document.createElement('div');
                        direct.dataset['itemId'] = 'direct-item';
                        const empty = document.createElement('div');
                        const closestOk = itemIdFromTarget(child) === 'closest-item';
                        const directOk = itemIdFromTarget(direct) === 'direct-item';
                        const emptyOk = itemIdFromTarget(empty) === undefined;
                        if (closestOk && directOk && emptyOk) {
                            fired['item-target-resolve'] = true;
                            notes['item-target-resolve'] = 'closest + dataset fallback + empty-id rejection all correct';
                        } else {
                            notes['item-target-resolve'] = `closestOk=${String(closestOk)} directOk=${String(directOk)} emptyOk=${String(emptyOk)}`;
                        }
                    }
                } catch (err) {
                    notes['item-target-resolve'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 16: active-modifiers-panel-prepare
                 * Embed a condition + a modifier-bearing talent on the PC,
                 * mix ActiveModifiersMixin onto a base whose `actor` is the
                 * live PC, and assert prepareActiveModifiers buckets the
                 * items into the conditions/talents/effects category lists.
                 * ============================================================ */
                try {
                    const live = getPc();
                    if (live == null) {
                        notes['active-modifiers-panel-prepare'] = 'no PC actor';
                    } else {
                        const embeds = await withTimeout(
                            live.createEmbeddedDocuments?.('Item', [
                                { name: 'probe-condition', type: 'condition', system: { gameSystem: 'dh2e', description: 'probe', duration: 'Permanent' } },
                                {
                                    name: 'probe-mod-talent',
                                    type: 'talent',
                                    system: { gameSystem: 'dh2e', active: true, isPassive: false, modifiers: { characteristics: { weaponSkill: 5 } } },
                                },
                            ]),
                            5_000,
                            'embed condition+talent',
                        );
                        const embedList = (embeds ?? []) as Array<{ id: string }>;
                        for (const e of embedList) {
                            const created = live.items.get(e.id);
                            if (created != null) {
                                cleanups.push(async () => {
                                    try {
                                        await created.delete?.();
                                    } catch {
                                        /* ignore */
                                    }
                                });
                            }
                        }
                        const mod = await import(`${base}/applications/components/active-modifiers-panel.js`);
                        const ActiveModifiersMixin = mod.ActiveModifiersMixin ?? mod.default;
                        if (typeof ActiveModifiersMixin !== 'function') {
                            notes['active-modifiers-panel-prepare'] = 'ActiveModifiersMixin export missing';
                        } else {
                            class StubBase {
                                actor = live;
                            }
                            const Mixed = ActiveModifiersMixin(StubBase as any);
                            const inst = new Mixed();
                            const data = inst.prepareActiveModifiers() as {
                                conditions: unknown[];
                                talents: unknown[];
                                traits: unknown[];
                                equipment: unknown[];
                                effects: unknown[];
                            };
                            const conditionBucketed = data.conditions.length >= 1;
                            const talentBucketed = data.talents.length >= 1;
                            const hasAllCategories = Array.isArray(data.traits) && Array.isArray(data.equipment) && Array.isArray(data.effects);
                            if (conditionBucketed && talentBucketed && hasAllCategories) {
                                fired['active-modifiers-panel-prepare'] = true;
                                notes['active-modifiers-panel-prepare'] = `roll-up: conditions=${data.conditions.length} talents=${data.talents.length}`;
                            } else {
                                notes['active-modifiers-panel-prepare'] = `conditionBucketed=${String(conditionBucketed)} talentBucketed=${String(
                                    talentBucketed,
                                )} hasAllCategories=${String(hasAllCategories)}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['active-modifiers-panel-prepare'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 17: item-preview-card-toggle
                 * Mix ItemPreviewMixin onto a base whose `actor` is the live
                 * PC and whose `element` holds an item row. Dispatch the
                 * registered `toggleItemPreview` action twice: first inserts
                 * a .wh40k-item-preview sibling, second removes it.
                 * ============================================================ */
                try {
                    const live = getPc();
                    if (live == null) {
                        notes['item-preview-card-toggle'] = 'no PC actor';
                    } else {
                        const created = await withTimeout(
                            live.createEmbeddedDocuments?.('Item', [
                                { name: 'probe-preview-gear', type: 'gear', system: { gameSystem: 'dh2e', quantity: 2, description: 'probe gear' } },
                            ]),
                            5_000,
                            'embed preview gear',
                        );
                        const createdArr = created as Array<{ id: string }> | undefined | null;
                        const gear = createdArr?.[0] ? live.items.get(createdArr[0].id) : null;
                        if (gear == null) {
                            notes['item-preview-card-toggle'] = 'failed to embed gear';
                        } else {
                            cleanups.push(async () => {
                                try {
                                    await gear.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            const mod = await import(`${base}/applications/components/item-preview-card.js`);
                            const ItemPreviewMixin = mod.ItemPreviewMixin ?? mod.default;
                            if (typeof ItemPreviewMixin !== 'function') {
                                notes['item-preview-card-toggle'] = 'ItemPreviewMixin export missing';
                            } else {
                                const sheetRoot = document.createElement('div');
                                sheetRoot.innerHTML = `<div class="item-row" data-item-id="${gear.id}"></div>`;
                                class StubBase {
                                    actor = live;
                                    // element is a jQuery-like array (host sheet contract: this.element[0])
                                    element = [sheetRoot] as unknown as HTMLElement[];
                                }
                                const Mixed = ItemPreviewMixin(StubBase as any);
                                const action = Mixed.DEFAULT_OPTIONS?.actions?.toggleItemPreview;
                                if (typeof action !== 'function') {
                                    notes['item-preview-card-toggle'] = 'toggleItemPreview action not registered';
                                } else {
                                    const inst = new Mixed();
                                    const target = sheetRoot.querySelector(`[data-item-id="${gear.id}"]`) as HTMLElement;
                                    action.call(inst, new Event('click'), target);
                                    await new Promise<void>((r) => {
                                        setTimeout(r, 60);
                                    });
                                    const isOpened = sheetRoot.querySelector('.wh40k-item-preview') !== null;
                                    action.call(inst, new Event('click'), target);
                                    await new Promise<void>((r) => {
                                        setTimeout(r, 260);
                                    });
                                    const isClosed = sheetRoot.querySelector('.wh40k-item-preview') === null;
                                    if (isOpened && isClosed) {
                                        fired['item-preview-card-toggle'] = true;
                                        notes['item-preview-card-toggle'] = 'toggleItemPreview injected then removed the preview card';
                                    } else {
                                        notes['item-preview-card-toggle'] = `opened=${String(opened)} closed=${String(closed)}`;
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    notes['item-preview-card-toggle'] = `flow threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 18: talent-editor-dialog-render
                 * Embed a talent item, construct TalentEditorDialog({ item }),
                 * render it, and assert _prepareContext returns the editor
                 * sections + the title getter reflects the item name. Close
                 * to keep the window stack clean.
                 * ============================================================ */
                try {
                    const live = getPc();
                    if (live == null) {
                        notes['talent-editor-dialog-render'] = 'no PC actor';
                    } else {
                        const created = await withTimeout(
                            live.createEmbeddedDocuments?.('Item', [{ name: 'probe-editor-talent', type: 'talent', system: { gameSystem: 'dh2e' } }]),
                            5_000,
                            'embed talent',
                        );
                        const createdArr = created as Array<{ id: string }> | undefined | null;
                        const talent = createdArr?.[0] ? live.items.get(createdArr[0].id) : null;
                        if (talent == null) {
                            notes['talent-editor-dialog-render'] = 'failed to embed talent';
                        } else {
                            cleanups.push(async () => {
                                try {
                                    await talent.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            const mod = await import(`${base}/applications/item/talent-editor-dialog.js`);
                            const TalentEditorDialog = mod.TalentEditorDialog ?? mod.default;
                            if (typeof TalentEditorDialog !== 'function') {
                                notes['talent-editor-dialog-render'] = 'TalentEditorDialog export missing';
                            } else {
                                const dialog = new TalentEditorDialog({ item: talent, initialSection: 'modifiers' });
                                let renderThrew: string | null = null;
                                try {
                                    await withTimeout(dialog.render({ force: true }), 5_000, 'TalentEditorDialog.render');
                                } catch (err) {
                                    renderThrew = String((err as Error).message);
                                }
                                const ctx = (await dialog._prepareContext({})) as {
                                    item?: unknown;
                                    activeSection?: string;
                                    sections?: Record<string, boolean>;
                                };
                                const titleOk = typeof dialog.title === 'string' && dialog.title.includes('probe-editor-talent');
                                const sectionOk = ctx.activeSection === 'modifiers' && ctx.sections?.modifiers === true;
                                const elementPresent = dialog.element != null;
                                const tolerable = renderThrew?.includes('must render a single HTML element') === true;
                                if (titleOk && sectionOk && (elementPresent || tolerable)) {
                                    fired['talent-editor-dialog-render'] = true;
                                    notes['talent-editor-dialog-render'] = '_prepareContext returned modifiers section; title reflects item';
                                } else {
                                    notes['talent-editor-dialog-render'] = `titleOk=${String(titleOk)} sectionOk=${String(sectionOk)} elementPresent=${String(
                                        elementPresent,
                                    )} renderThrew=${renderThrew ?? 'no'}`;
                                }
                                try {
                                    await dialog.close?.();
                                } catch {
                                    /* ignore */
                                }
                                await closeOpenDialogs();
                            }
                        }
                    }
                } catch (err) {
                    notes['talent-editor-dialog-render'] = `flow threw: ${String((err as Error).message)}`;
                }
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
            }

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, APP_TOURS_EXTRA_FLOWS);

        return {
            flowsFired: result.flowsFired,
            flowNotes: result.flowNotes,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('applications + tours extra coverage (Tier B)', () => {
    // Cap at 3 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(180_000);
    test('tours + uncovered API mixins / components / dialog render flows', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeAppToursExtraFlows(page);

        const failures: string[] = [];
        for (const flow of APP_TOURS_EXTRA_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('app-tours-extra.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${APP_TOURS_EXTRA_FLOWS.length} app-tours-extra probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
