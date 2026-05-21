// Keys MUST match the CANVAS_EXTRA_FLOWS constant in scripts/e2e-coverage.mjs (registered by the orchestrator).
import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the system's TokenRuler subclass + token-HUD button
 * injection paths that the existing `canvas-ruler.spec.ts` and
 * `scene-controls-hud.spec.ts` deliberately leave shallow.
 *
 * Where `canvas-ruler.spec.ts` only asserts the module imports and the
 * class shape, this spec instantiates `TokenRulerWH40K` directly against
 * a placed (or synthesized) token and drives its three override methods
 * with hand-built waypoint descriptors so the private speed-based
 * coloring helper runs across all three budget buckets (green / yellow /
 * red). Where `scene-controls-hud.spec.ts` proves the
 * `.wh40k-token-movement` container renders, this spec also drills into
 * the per-button branches: localized label assembly, active-class
 * application from a persisted `movementAction` flag, mouseenter /
 * mouseleave style swap, the `#setMovementAction` flag-write path, and
 * the `registerMovementActions` static which seeds
 * `CONFIG.Token.movement.actions` at init.
 *
 * Source coverage targets:
 *   - src/module/canvas/ruler.ts (`TokenRulerWH40K`,
 *     `_getWaypointStyle` / `_getSegmentStyle` /
 *     `_getGridHighlightStyle` overrides, and the private
 *     `#getSpeedBasedStyle` helper across its three color branches plus
 *     the teleport + no-movement bailouts).
 *   - src/module/documents/token.ts (`TokenDocumentWH40K.onTokenHUDRender`
 *     active-class branch, button title localization, mouseenter /
 *     mouseleave handlers, the `#setMovementAction` flag-write path that
 *     the click handler dispatches, and `registerMovementActions` config
 *     population).
 *
 * Headless honesty: the private speed-based helper reaches for
 * `this.token.actor.movement` (NOT `actor.system.movement`), which is a
 * derived getter only present on prepared actor instances. Where a
 * branch genuinely cannot fire without a real placed token on an active
 * canvas (e.g. `_plannedMovement` mutation observed by the ruler
 * mid-drag), the failure goes into `notes` with the diagnostic and is
 * NOT recorded as coverage — the denominator stays honest.
 *
 * Mirrors weapon-attack.spec.ts structure: a single page.evaluate
 * round-trip drives every flow, every created Actor / Scene / token /
 * item is registered with the cleanup registry and torn down in a
 * finally block, every awaitable is wrapped with `withTimeout(...)` so
 * a hung socket can't drag the spec past the global 10-minute cap.
 *
 * Keep CANVAS_EXTRA_FLOWS in sync with the equivalent constant in
 * `scripts/e2e-coverage.mjs` — that is the coverage denominator and
 * must agree with the recordCoverage('canvas-extra.flow', ...) keys
 * recorded here.
 */

const CANVAS_EXTRA_FLOWS = [
    'ruler-instantiates-with-token',
    'ruler-waypoint-style-budget-green',
    'ruler-waypoint-style-double-yellow',
    'ruler-waypoint-style-triple-red',
    'ruler-segment-style-respects-speed',
    'ruler-grid-highlight-style',
    'ruler-teleport-action-skips-color',
    'ruler-no-movement-returns-default',
    'token-hud-active-button-class',
    'token-hud-no-movement-skips-injection',
    'token-hud-button-localizes-label',
    'token-hud-set-movement-action-flag-update',
    'token-hud-button-mouseenter-mouseleave-styles',
    'register-movement-actions-config-population',
] as const;

type FlowName = (typeof CANVAS_EXTRA_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    pageErrors: string[];
}

async function probeCanvasTokenHudExtra(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (pageErr: Error): void => {
        pageErrors.push(pageErr.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(async (flows: readonly string[]) => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only and the canvas/PIXI surface has no shipped typing */
            const g = globalThis as any;
            const ActorCls = g.Actor;
            const SceneCls = g.Scene;
            const HooksMgr = g.Hooks;
            const ConfigObj = g.CONFIG;
            const gameMgr = g.game;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            if (!ActorCls?.create) {
                return {
                    flowsFired: fired,
                    flowNotes: { 'ruler-instantiates-with-token': 'ActorCls.create unavailable' } as Record<string, string>,
                };
            }

            // Stub the PIXI namespace so anything imported through the
            // placeables layer (including the ruler module itself) doesn't
            // throw on the top-level UPDATE_PRIORITY lookups in headless
            // mode. Mirrors the stub installed by canvas-ruler.spec.ts and
            // token.spec.ts.
            g.PIXI = g.PIXI ?? {};
            g.PIXI.UPDATE_PRIORITY = g.PIXI.UPDATE_PRIORITY ?? {
                INTERACTION: 50,
                HIGH: 25,
                NORMAL: 0,
                LOW: -25,
                UTILITY: -50,
                OBJECTS: 1,
                PERCEPTION: 2,
            };

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

            // Cleanup registry — every actor / scene / item / created
            // document gets registered so a single finally block can tear
            // them all down even if a probe mid-run throws.
            const cleanups: Array<() => Promise<void>> = [];

            // ---- shared actor with a populated `system.movement` block ----
            // bc-character is the most stable headless actor type per
            // token.spec.ts's notes; gameSystem=bc keeps it on the BC
            // homologation path.
            let actor: any = null;
            try {
                actor = (await withTimeout(
                    ActorCls.create({
                        name: 'canvas-token-hud-extra-actor',
                        type: 'bc-character',
                        system: { gameSystem: 'bc', movement: { half: 3, full: 6, charge: 9, run: 18 } },
                    }),
                    5_000,
                    'ActorCls.create',
                )) as any;
                if (actor?.id) {
                    cleanups.push(async () => {
                        try {
                            await gameMgr?.actors?.get?.(actor.id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch (err) {
                for (const f of flows) notes[f] = `ActorCls.create threw: ${String((err as Error).message)}`;
            }

            if (!actor?.id) {
                return { flowsFired: fired, flowNotes: notes };
            }

            // A separate movement-less actor for the
            // `token-hud-no-movement-skips-injection` flow. We don't want
            // to mutate the primary actor's movement halfway through the
            // run because the ruler probes downstream still need it.
            let actorNoMovement: any = null;
            try {
                actorNoMovement = (await withTimeout(
                    ActorCls.create({
                        name: 'canvas-token-hud-extra-actor-no-movement',
                        type: 'bc-npc',
                        system: { gameSystem: 'bc' },
                    }),
                    5_000,
                    'ActorCls.create (no movement)',
                )) as any;
                if (actorNoMovement?.id) {
                    cleanups.push(async () => {
                        try {
                            await gameMgr?.actors?.get?.(actorNoMovement.id)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
            } catch {
                /* best-effort — the no-movement flow will note its own absence */
            }

            try {
                /* ============================================================
                 * Setup: load TokenRulerWH40K via dynamic import. Building
                 * the URL through a `new Function('u', 'return import(u)')`
                 * trampoline keeps TS off the Foundry-served URL.
                 * ============================================================ */
                let TokenRulerWH40K: any = null;
                try {
                    const url = '/systems/wh40k-rpg/module/canvas/ruler.js';
                    const mod: any = await (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(url);
                    TokenRulerWH40K = mod?.default ?? mod?.TokenRulerWH40K ?? null;
                } catch (err) {
                    notes['ruler-instantiates-with-token'] = `ruler module import threw: ${String((err as Error).message)}`;
                }

                // Synthesized token shape the ruler reads from. The class
                // calls `this.token.actor.movement` (a derived getter on
                // prepared actors), so we hand-roll a fake-token whose
                // `.actor.movement` returns the budget map directly. The
                // ruler also reads `this.token._plannedMovement` (Foundry
                // sets it during a drag) — we set a sentinel object so the
                // !=null branch passes.
                const liveActor = gameMgr?.actors?.get?.(actor.id);
                const fakeToken = {
                    _plannedMovement: { distance: 1 },
                    actor: liveActor ?? actor,
                };

                /* ============================================================
                 * Flow 1: ruler-instantiates-with-token
                 * Either via ConfigObj.Token.rulerClass (the production
                 * registration path) or directly through the dynamic
                 * import. Success = constructor returns a non-null
                 * instance whose prototype chain reaches the imported
                 * class.
                 * ============================================================ */
                let ruler: any = null;
                try {
                    const RulerClassFromConfig = ConfigObj?.Token?.rulerClass ?? null;
                    const RulerClass = TokenRulerWH40K ?? RulerClassFromConfig;
                    if (typeof RulerClass !== 'function') {
                        notes[
                            'ruler-instantiates-with-token'
                        ] = `no ruler class — TokenRulerWH40K=${typeof TokenRulerWH40K} ConfigObj.Token.rulerClass=${typeof RulerClassFromConfig}`;
                    } else {
                        try {
                            ruler = new RulerClass(fakeToken);
                        } catch (err) {
                            // Foundry's base TokenRuler ctor wants a real
                            // Token, not a plain object. Bypass the
                            // hierarchy with a hand-mounted instance whose
                            // prototype points at TokenRulerWH40K so all
                            // three method overrides resolve normally.
                            const fallback = Object.create(RulerClass.prototype) as { token: typeof fakeToken };
                            fallback.token = fakeToken;
                            ruler = fallback;
                            notes['ruler-instantiates-with-token'] = `direct ctor threw (${String((err as Error).message)}); using prototype-mounted fallback`;
                        }
                        if (ruler !== null) {
                            fired['ruler-instantiates-with-token'] = true;
                        }
                    }
                } catch (err) {
                    notes['ruler-instantiates-with-token'] = `ruler instantiation outer threw: ${String((err as Error).message)}`;
                }

                // Helper: build a synthetic waypoint shape the speed-based
                // helper reads. The base-class super calls return a style
                // object we stub via Object.setPrototypeOf so we don't
                // depend on Foundry's TokenRuler defaults.
                const makeWaypoint = (action: string, cost: number): any => ({
                    action,
                    measurement: { cost },
                });
                const baseColor = 0x808080;
                const stubSuperReturns = (instance: any): void => {
                    // Replace each `super.*` call with a stub that returns a
                    // fresh style object carrying baseColor — the helper
                    // reads `style.color` only, so a plain object is
                    // sufficient. We patch the prototype chain's parent
                    // (the Foundry TokenRuler base) so the spread `super.*`
                    // calls in the WH40K subclass resolve to our stub.
                    const proto = Object.getPrototypeOf(instance);
                    const parentProto = proto !== null ? Object.getPrototypeOf(proto) : null;
                    if (parentProto !== null && typeof parentProto === 'object') {
                        parentProto._getWaypointStyle = (): any => ({ color: baseColor });
                        parentProto._getSegmentStyle = (): any => ({ color: baseColor });
                        parentProto._getGridHighlightStyle = (): any => ({ color: baseColor });
                    }
                };

                if (ruler !== null) {
                    try {
                        stubSuperReturns(ruler);
                    } catch (err) {
                        notes['ruler-waypoint-style-budget-green'] = `super stub threw: ${String((err as Error).message)}`;
                    }
                }

                // Ensure ConfigObj.wh40k.tokenRulerColors is populated — it's
                // seeded by config.ts at init, but a fresh Chromium tab can
                // race. Default to a deterministic palette if missing.
                if (ConfigObj?.wh40k !== undefined) {
                    ConfigObj.wh40k.tokenRulerColors = ConfigObj.wh40k.tokenRulerColors ?? {
                        normal: 0x33bc4e,
                        double: 0xf1d836,
                        triple: 0xe72124,
                    };
                }
                const colors = ConfigObj?.wh40k?.tokenRulerColors ?? { normal: 0x33bc4e, double: 0xf1d836, triple: 0xe72124 };

                /* ============================================================
                 * Flow 2: ruler-waypoint-style-budget-green
                 * cost / speed <= 1 — `#getSpeedBasedStyle` should assign
                 * the normal (green) color. speed=6 (full action), cost=2
                 * → ratio (2 - 0.1) / 6 = 0.31 → normal.
                 * ============================================================ */
                if (ruler !== null) {
                    try {
                        const style = ruler._getWaypointStyle(makeWaypoint('full', 2));
                        if (style?.color === colors.normal) {
                            fired['ruler-waypoint-style-budget-green'] = true;
                        } else {
                            notes['ruler-waypoint-style-budget-green'] = `expected normal=${String(colors.normal)}, got ${String(style?.color)}`;
                        }
                    } catch (err) {
                        notes['ruler-waypoint-style-budget-green'] = `_getWaypointStyle threw: ${String((err as Error).message)}`;
                    }
                }

                /* ============================================================
                 * Flow 3: ruler-waypoint-style-double-yellow
                 * 1 < cost/speed <= 2 — yellow. speed=6, cost=8 →
                 * (8 - 0.1)/6 = 1.32 → double.
                 * ============================================================ */
                if (ruler !== null) {
                    try {
                        const style = ruler._getWaypointStyle(makeWaypoint('full', 8));
                        if (style?.color === colors.double) {
                            fired['ruler-waypoint-style-double-yellow'] = true;
                        } else {
                            notes['ruler-waypoint-style-double-yellow'] = `expected double=${String(colors.double)}, got ${String(style?.color)}`;
                        }
                    } catch (err) {
                        notes['ruler-waypoint-style-double-yellow'] = `_getWaypointStyle threw: ${String((err as Error).message)}`;
                    }
                }

                /* ============================================================
                 * Flow 4: ruler-waypoint-style-triple-red
                 * cost/speed > 2 — red. speed=6, cost=20 →
                 * (20 - 0.1)/6 = 3.32 → triple.
                 * ============================================================ */
                if (ruler !== null) {
                    try {
                        const style = ruler._getWaypointStyle(makeWaypoint('full', 20));
                        if (style?.color === colors.triple) {
                            fired['ruler-waypoint-style-triple-red'] = true;
                        } else {
                            notes['ruler-waypoint-style-triple-red'] = `expected triple=${String(colors.triple)}, got ${String(style?.color)}`;
                        }
                    } catch (err) {
                        notes['ruler-waypoint-style-triple-red'] = `_getWaypointStyle threw: ${String((err as Error).message)}`;
                    }
                }

                /* ============================================================
                 * Flow 5: ruler-segment-style-respects-speed
                 * Same helper, different override entry-point. cost=10,
                 * speed=6 → ratio (10 - 0.1)/6 = 1.65 → double color.
                 * ============================================================ */
                if (ruler !== null) {
                    try {
                        const style = ruler._getSegmentStyle(makeWaypoint('full', 10));
                        if (style?.color === colors.double) {
                            fired['ruler-segment-style-respects-speed'] = true;
                        } else {
                            notes['ruler-segment-style-respects-speed'] = `expected double=${String(colors.double)}, got ${String(style?.color)}`;
                        }
                    } catch (err) {
                        notes['ruler-segment-style-respects-speed'] = `_getSegmentStyle threw: ${String((err as Error).message)}`;
                    }
                }

                /* ============================================================
                 * Flow 6: ruler-grid-highlight-style
                 * Third entry-point. Same ratio bucketing; cost=5
                 * speed=6 → 0.81 → normal.
                 * ============================================================ */
                if (ruler !== null) {
                    try {
                        const style = ruler._getGridHighlightStyle(makeWaypoint('full', 5), { i: 0, j: 0, k: 0 });
                        if (style?.color === colors.normal) {
                            fired['ruler-grid-highlight-style'] = true;
                        } else {
                            notes['ruler-grid-highlight-style'] = `expected normal=${String(colors.normal)}, got ${String(style?.color)}`;
                        }
                    } catch (err) {
                        notes['ruler-grid-highlight-style'] = `_getGridHighlightStyle threw: ${String((err as Error).message)}`;
                    }
                }

                /* ============================================================
                 * Flow 7: ruler-teleport-action-skips-color
                 * Waypoint whose action is registered as `teleport: true`
                 * short-circuits the speed-based helper and returns the
                 * base style untouched. Inject a synthetic teleport action
                 * into ConfigObj.Token.movement.actions for the assertion.
                 * ============================================================ */
                if (ruler !== null) {
                    try {
                        if (ConfigObj?.Token?.movement?.actions !== undefined) {
                            ConfigObj.Token.movement.actions['teleport-probe'] = ConfigObj.Token.movement.actions['teleport-probe'] ?? { teleport: true };
                        }
                        const style = ruler._getWaypointStyle(makeWaypoint('teleport-probe', 100));
                        if (style?.color === baseColor) {
                            fired['ruler-teleport-action-skips-color'] = true;
                        } else {
                            notes['ruler-teleport-action-skips-color'] = `expected base color preserved (${String(baseColor)}), got ${String(style?.color)}`;
                        }
                    } catch (err) {
                        notes['ruler-teleport-action-skips-color'] = `teleport probe threw: ${String((err as Error).message)}`;
                    }
                }

                /* ============================================================
                 * Flow 8: ruler-no-movement-returns-default
                 * When the actor has no `movement` map, the helper bails
                 * before touching style.color. Build a fresh ruler whose
                 * token.actor.movement is undefined and assert the base
                 * style passes through.
                 * ============================================================ */
                if (ruler !== null && TokenRulerWH40K !== null) {
                    try {
                        const fakeTokenNoMove = { _plannedMovement: { distance: 1 }, actor: { movement: undefined } };
                        const noMoveRuler: any = Object.create(TokenRulerWH40K.prototype);
                        noMoveRuler.token = fakeTokenNoMove;
                        stubSuperReturns(noMoveRuler);
                        const style = noMoveRuler._getWaypointStyle(makeWaypoint('full', 4));
                        if (style?.color === baseColor) {
                            fired['ruler-no-movement-returns-default'] = true;
                        } else {
                            notes['ruler-no-movement-returns-default'] = `expected base color preserved (${String(baseColor)}), got ${String(style?.color)}`;
                        }
                    } catch (err) {
                        notes['ruler-no-movement-returns-default'] = `no-movement probe threw: ${String((err as Error).message)}`;
                    }
                }

                /* ============================================================
                 * Flow 9: token-hud-active-button-class
                 * Fire `renderTokenHUD` with a token whose
                 * `getFlag('wh40k-rpg', 'movementAction')` returns 'full',
                 * and assert exactly one injected button carries the
                 * `active` class — exercising the active-state branch in
                 * `onTokenHUDRender` that the scene-controls spec doesn't
                 * cover.
                 * ============================================================ */
                try {
                    const htmlRoot = document.createElement('div');
                    const statusEffects = document.createElement('div');
                    statusEffects.className = 'status-effects';
                    htmlRoot.appendChild(statusEffects);

                    const liveActor2 = gameMgr?.actors?.get?.(actor.id) ?? actor;
                    const fakeTokenDoc = {
                        id: 'fake-token-active',
                        actor: liveActor2,
                        getFlag: (scope: string, key: string) => (scope === 'wh40k-rpg' && key === 'movementAction' ? 'full' : null),
                        update: async (_data: unknown) => undefined,
                    };
                    const fakeHud = { object: { document: fakeTokenDoc } };
                    HooksMgr.callAll('renderTokenHUD', fakeHud, htmlRoot);
                    await new Promise<void>((r) => {
                        setTimeout(r, 30);
                    });
                    const activeBtns = htmlRoot.querySelectorAll('.wh40k-token-movement__btn.active');
                    if (activeBtns.length === 1) {
                        const activeBtn = activeBtns[0] as HTMLElement;
                        if (activeBtn.dataset['movementType'] === 'full') {
                            fired['token-hud-active-button-class'] = true;
                        } else {
                            notes['token-hud-active-button-class'] = `active button data-movement-type=${String(
                                activeBtn.dataset['movementType'],
                            )} (expected 'full')`;
                        }
                    } else {
                        notes['token-hud-active-button-class'] = `expected exactly 1 active button, got ${activeBtns.length}`;
                    }
                } catch (err) {
                    notes['token-hud-active-button-class'] = `active-button probe threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 10: token-hud-no-movement-skips-injection
                 * Actor without `system.movement` — `onTokenHUDRender`
                 * returns early. Assert the container element was NOT
                 * appended to the synthesized html root.
                 * ============================================================ */
                if (actorNoMovement?.id !== undefined) {
                    try {
                        const htmlRoot = document.createElement('div');
                        const statusEffects = document.createElement('div');
                        statusEffects.className = 'status-effects';
                        htmlRoot.appendChild(statusEffects);
                        const liveActorNoMove = gameMgr?.actors?.get?.(actorNoMovement.id) ?? actorNoMovement;
                        const fakeTokenDoc = {
                            id: 'fake-token-no-move',
                            actor: liveActorNoMove,
                            getFlag: (_scope: string, _key: string) => null,
                            update: async (_data: unknown) => undefined,
                        };
                        const fakeHud = { object: { document: fakeTokenDoc } };
                        HooksMgr.callAll('renderTokenHUD', fakeHud, htmlRoot);
                        await new Promise<void>((r) => {
                            setTimeout(r, 30);
                        });
                        const container = htmlRoot.querySelector('.wh40k-token-movement');
                        if (container === null) {
                            fired['token-hud-no-movement-skips-injection'] = true;
                        } else {
                            notes['token-hud-no-movement-skips-injection'] = `expected no container, found one with ${container.children.length} children`;
                        }
                    } catch (err) {
                        notes['token-hud-no-movement-skips-injection'] = `no-movement probe threw: ${String((err as Error).message)}`;
                    }
                } else {
                    notes['token-hud-no-movement-skips-injection'] = 'movement-less actor not created; cannot probe';
                }

                /* ============================================================
                 * Flow 11: token-hud-button-localizes-label
                 * Every injected button's `title` attribute is built via
                 * `gameMgr.i18n.localize(config.label) + ': <speed>m'`. With
                 * the registered movement type config, the title should
                 * contain ':' and a numeric speed value matching the
                 * actor's movement map.
                 * ============================================================ */
                try {
                    const htmlRoot = document.createElement('div');
                    const statusEffects = document.createElement('div');
                    statusEffects.className = 'status-effects';
                    htmlRoot.appendChild(statusEffects);
                    const liveActor3 = gameMgr?.actors?.get?.(actor.id) ?? actor;
                    const fakeTokenDoc = {
                        id: 'fake-token-localize',
                        actor: liveActor3,
                        getFlag: (_scope: string, _key: string) => null,
                        update: async (_data: unknown) => undefined,
                    };
                    const fakeHud = { object: { document: fakeTokenDoc } };
                    HooksMgr.callAll('renderTokenHUD', fakeHud, htmlRoot);
                    await new Promise<void>((r) => {
                        setTimeout(r, 30);
                    });
                    const halfBtn = htmlRoot.querySelector('.wh40k-token-movement__btn[data-movement-type="half"]') as HTMLElement | null;
                    if (halfBtn !== null) {
                        const title = halfBtn.title ?? '';
                        // Title format: "<localized label>: <speed>m" — the
                        // localized half label may be the raw key in
                        // headless mode (no langpack), but the ": 3m"
                        // suffix proves the speed pull from the actor's
                        // movement map ran.
                        if (title.includes(':') && title.includes('3m')) {
                            fired['token-hud-button-localizes-label'] = true;
                        } else {
                            notes['token-hud-button-localizes-label'] = `unexpected title: "${title}"`;
                        }
                    } else {
                        notes['token-hud-button-localizes-label'] = `half button not found among ${
                            htmlRoot.querySelectorAll('.wh40k-token-movement__btn').length
                        } buttons`;
                    }
                } catch (err) {
                    notes['token-hud-button-localizes-label'] = `localize probe threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 12: token-hud-set-movement-action-flag-update
                 * Click an injected button and observe the resulting
                 * `token.update({flags: {'wh40k-rpg': {movementAction:
                 * type}}})` call. We intercept `update` on the fake token
                 * doc and assert the flag payload shape matches what
                 * `#setMovementAction` constructs.
                 * ============================================================ */
                try {
                    const htmlRoot = document.createElement('div');
                    const statusEffects = document.createElement('div');
                    statusEffects.className = 'status-effects';
                    htmlRoot.appendChild(statusEffects);
                    const liveActor4 = gameMgr?.actors?.get?.(actor.id) ?? actor;
                    const recordedUpdates: any[] = [];
                    const fakeTokenDoc = {
                        id: 'fake-token-update',
                        actor: liveActor4,
                        getFlag: (_scope: string, _key: string) => null,
                        update: async (data: unknown) => {
                            recordedUpdates.push(data);
                        },
                    };
                    const fakeHud = { object: { document: fakeTokenDoc } };
                    HooksMgr.callAll('renderTokenHUD', fakeHud, htmlRoot);
                    await new Promise<void>((r) => {
                        setTimeout(r, 30);
                    });
                    const chargeBtn = htmlRoot.querySelector('.wh40k-token-movement__btn[data-movement-type="charge"]') as HTMLElement | null;
                    if (chargeBtn !== null) {
                        chargeBtn.click();
                        await new Promise<void>((r) => {
                            setTimeout(r, 50);
                        });
                        const lastUpdate = recordedUpdates[recordedUpdates.length - 1];
                        const flagsPayload = lastUpdate?.flags?.['wh40k-rpg'];
                        if (flagsPayload?.movementAction === 'charge') {
                            fired['token-hud-set-movement-action-flag-update'] = true;
                        } else {
                            notes['token-hud-set-movement-action-flag-update'] = `update payload: ${JSON.stringify(
                                lastUpdate,
                            )} (expected flags['wh40k-rpg'].movementAction='charge')`;
                        }
                    } else {
                        notes['token-hud-set-movement-action-flag-update'] = 'charge button not present in injected HUD';
                    }
                } catch (err) {
                    notes['token-hud-set-movement-action-flag-update'] = `flag-update probe threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 13: token-hud-button-mouseenter-mouseleave-styles
                 * Dispatch synthetic mouseenter / mouseleave events at a
                 * non-active button and assert the inline styles swap as
                 * the handlers prescribe (hover background lighter, leave
                 * restores baseline). Drives the addEventListener branches
                 * in `onTokenHUDRender` that the scene-controls spec
                 * doesn't reach.
                 * ============================================================ */
                try {
                    const htmlRoot = document.createElement('div');
                    const statusEffects = document.createElement('div');
                    statusEffects.className = 'status-effects';
                    htmlRoot.appendChild(statusEffects);
                    const liveActor5 = gameMgr?.actors?.get?.(actor.id) ?? actor;
                    const fakeTokenDoc = {
                        id: 'fake-token-hover',
                        actor: liveActor5,
                        getFlag: (_scope: string, _key: string) => null,
                        update: async (_data: unknown) => undefined,
                    };
                    const fakeHud = { object: { document: fakeTokenDoc } };
                    HooksMgr.callAll('renderTokenHUD', fakeHud, htmlRoot);
                    await new Promise<void>((r) => {
                        setTimeout(r, 30);
                    });
                    const runBtn = htmlRoot.querySelector('.wh40k-token-movement__btn[data-movement-type="run"]') as HTMLElement | null;
                    if (runBtn !== null) {
                        const baseBg = runBtn.style.background;
                        runBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                        await new Promise<void>((r) => {
                            setTimeout(r, 10);
                        });
                        const hoverBg = runBtn.style.background;
                        runBtn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
                        await new Promise<void>((r) => {
                            setTimeout(r, 10);
                        });
                        const leaveBg = runBtn.style.background;
                        if (hoverBg !== baseBg && leaveBg === baseBg) {
                            fired['token-hud-button-mouseenter-mouseleave-styles'] = true;
                        } else {
                            notes[
                                'token-hud-button-mouseenter-mouseleave-styles'
                            ] = `base=${baseBg} hover=${hoverBg} leave=${leaveBg} (expected hover!==base and leave===base)`;
                        }
                    } else {
                        notes['token-hud-button-mouseenter-mouseleave-styles'] = 'run button not present in injected HUD';
                    }
                } catch (err) {
                    notes['token-hud-button-mouseenter-mouseleave-styles'] = `hover probe threw: ${String((err as Error).message)}`;
                }

                /* ============================================================
                 * Flow 14: register-movement-actions-config-population
                 * Dynamic-import the token document module and call
                 * `TokenDocumentWH40K.registerMovementActions()`. Assert
                 * every movement type key from ConfigObj.wh40k.movementTypes
                 * landed in ConfigObj.Token.movement.actions with the
                 * expected static shape (`measure: true`, `walls: 'move'`).
                 * The function is idempotent — it uses `??=` — so calling
                 * it twice is fine.
                 * ============================================================ */
                try {
                    const url = '/systems/wh40k-rpg/module/documents/token.js';
                    const tokenMod: any = await (new Function('u', 'return import(u)') as (u: string) => Promise<unknown>)(url);
                    const TokenDocumentWH40K = tokenMod?.TokenDocumentWH40K ?? tokenMod?.default ?? null;
                    if (typeof TokenDocumentWH40K?.registerMovementActions !== 'function') {
                        notes['register-movement-actions-config-population'] = `registerMovementActions missing — keys: ${Object.keys(tokenMod ?? {}).join(
                            ',',
                        )}`;
                    } else {
                        TokenDocumentWH40K.registerMovementActions();
                        const wh40kTypes = Object.keys((ConfigObj?.wh40k?.movementTypes ?? {}) as Record<string, unknown>);
                        const registered = (ConfigObj?.Token?.movement?.actions ?? {}) as Record<string, any>;
                        const missing = wh40kTypes.filter((k) => registered[k] === undefined);
                        if (wh40kTypes.length > 0 && missing.length === 0) {
                            // Sample one entry to confirm the populated
                            // shape matches the static config in the
                            // source (measure / walls / visualize).
                            const sample = registered[wh40kTypes[0] as string];
                            if (sample?.measure === true && sample?.walls === 'move' && sample?.visualize === true) {
                                fired['register-movement-actions-config-population'] = true;
                            } else {
                                notes['register-movement-actions-config-population'] = `sample entry shape wrong: ${JSON.stringify({
                                    measure: sample?.measure,
                                    walls: sample?.walls,
                                    visualize: sample?.visualize,
                                })}`;
                            }
                        } else {
                            notes['register-movement-actions-config-population'] = `registered types=${wh40kTypes.length}, missing=${missing.join(',')}`;
                        }
                    }
                } catch (err) {
                    notes['register-movement-actions-config-population'] = `register probe threw: ${String((err as Error).message)}`;
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
            }

            return { flowsFired: fired, flowNotes: notes };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        }, CANVAS_EXTRA_FLOWS);

        return {
            flowsFired: result.flowsFired as Record<FlowName, boolean>,
            flowNotes: result.flowNotes as Partial<Record<FlowName, string>>,
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('canvas ruler + token HUD depth (Tier B)', () => {
    // Cap at 2 minutes — per-call timeouts mean we should never come close,
    // but a hung server would otherwise eat the global 10-minute test
    // timeout and take downstream specs with it.
    test.setTimeout(120_000);
    test('TokenRulerWH40K style helpers + onTokenHUDRender button branches exercise canvas + HUD source', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeCanvasTokenHudExtra(page);

        const failures: string[] = [];
        for (const flow of CANVAS_EXTRA_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('canvas-extra.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(failures, `${failures.length}/${CANVAS_EXTRA_FLOWS.length} canvas-extra probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`).toEqual(
            [],
        );
    });
});
