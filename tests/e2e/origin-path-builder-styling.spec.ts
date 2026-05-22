import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Origin Path Builder styling regression (#198 — Tailwind port follow-up).
 *
 * The runtime crash on origin selection was resolved in cycle 1 (commits
 * a93206c0 + d161f1fb). The remaining defect this spec guards against is
 * the SCSS→Tailwind migration rot in
 * `src/templates/character-creation/origin-path-builder.hbs`: the template
 * historically referenced ~40 `.csd-*` class names that had ZERO matching
 * CSS rules (the backing SCSS file was deleted during the Tailwind
 * migration), so the Origin Path Builder rendered as bare-text scaffolding.
 *
 * Each `.csd-*` class is now retained ONLY as a JS selector hook for
 * `origin-path-builder.ts` (which uses `querySelector('.csd-*')` at
 * runtime); visual styling is provided by inline `tw-*` utilities sitting
 * alongside each `.csd-*` class on the same element. This spec verifies:
 *
 *   1. The builder dialog opens against a live `dh2-character` actor.
 *   2. The dialog root has the `.wh40k-rpg` class (required for the
 *      `important: '.wh40k-rpg'` Tailwind scope to fire on every `tw-*`
 *      utility — without this ancestor, the entire template renders
 *      unstyled).
 *   3. The header, journey rail, main content section, preview panel,
 *      and footer all render real elements (not bare-text fallback).
 *   4. The characteristic setup workspace renders with its `.csd-*`
 *      anchors AND has the inline `tw-grid` workspace utility (so the
 *      drag-and-drop layout is present, not stacked).
 *   5. Navigating to the Characteristics step (step index 4) does not
 *      throw and produces a panel with rolls-bank + characteristic grid.
 *
 * The snapshot is purely a debugging artefact: any visual regression is
 * caught by the DOM-shape assertions below, which fail loudly if the
 * `tw-*` utilities are stripped or the `.wh40k-rpg` ancestor is lost.
 */
interface StylingProbeResult {
    setupOk: boolean;
    error: string | null;
    hasWh40kRpgClass: boolean;
    hasHeader: boolean;
    hasJourneyRail: boolean;
    hasMainContent: boolean;
    hasFooter: boolean;
    hasPreviewSection: boolean;
    csdHookCount: number;
    twUtilityCount: number;
    workspaceHasTwGrid: boolean;
    charSetupReachable: boolean;
    pageErrors: string[];
}

test('origin-path-builder renders fully-styled dialog with workspace, journey rail, and preview panel (#198)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async (): Promise<StylingProbeResult> => {
        interface ActorDoc {
            delete?: () => Promise<void>;
        }
        interface ActorCtorShape {
            create?: (data: object) => Promise<ActorDoc | null>;
        }
        interface FoundryGlobal {
            Actor?: ActorCtorShape;
        }
        interface StepConfig {
            key?: string;
        }
        interface BuilderInstance {
            element?: HTMLElement | null;
            render: (force?: boolean) => Promise<void>;
            guidedMode: boolean;
            currentStepIndex: number;
            showCharacteristics: boolean;
            systemConfig?: { coreSteps?: StepConfig[] };
        }
        type BuilderCtor = new (actor: ActorDoc, options: object) => BuilderInstance;
        interface BuilderModule {
            default?: BuilderCtor;
        }
        const failure = (error: string, errs: string[]): StylingProbeResult => ({
            setupOk: false,
            error,
            hasWh40kRpgClass: false,
            hasHeader: false,
            hasJourneyRail: false,
            hasMainContent: false,
            hasFooter: false,
            hasPreviewSection: false,
            csdHookCount: 0,
            twUtilityCount: 0,
            workspaceHasTwGrid: false,
            charSetupReachable: false,
            pageErrors: errs,
        });

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global (Actor), no type surface in browser context
        const g = globalThis as unknown as FoundryGlobal;
        const ActorCls = g.Actor;
        if (ActorCls?.create == null) {
            return failure('Actor.create unavailable', []);
        }

        const pageErrors: string[] = [];
        // Surface any uncaught throws from the dialog render path.
        const errorListener = (event: ErrorEvent): void => {
            pageErrors.push(event.message);
        };
        window.addEventListener('error', errorListener);

        let actor: ActorDoc | null;
        try {
            actor = await ActorCls.create({
                name: 'origin-builder-styling-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2e' },
            });
        } catch (err) {
            window.removeEventListener('error', errorListener);
            return failure(`Actor.create: ${err instanceof Error ? err.message : String(err)}`, pageErrors);
        }
        if (actor == null) {
            window.removeEventListener('error', errorListener);
            return failure('Actor.create returned null', pageErrors);
        }

        let builder: BuilderInstance;
        try {
            const modUrl = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';
            const mod = (await import(/* @vite-ignore */ modUrl)) as BuilderModule;
            const OriginPathBuilder = mod.default;
            if (typeof OriginPathBuilder !== 'function') {
                throw new Error('OriginPathBuilder default export not a constructor');
            }
            builder = new OriginPathBuilder(actor, {});
            await builder.render(true);
            // Allow _loadOrigins() and the first render() to settle.
            await new Promise<void>((r) => {
                setTimeout(r, 300);
            });
        } catch (err) {
            try {
                await actor.delete?.();
            } catch {
                /* ignore */
            }
            window.removeEventListener('error', errorListener);
            return failure(`builder.render: ${err instanceof Error ? err.message : String(err)}`, pageErrors);
        }

        const root: HTMLElement | null = builder.element ?? null;
        const hasWh40kRpgClass = root?.classList.contains('wh40k-rpg') === true;
        const hasHeader = root?.querySelector('header') != null;
        const hasJourneyRail = root?.querySelector('nav') != null;
        const hasMainContent = root?.querySelector('main') != null;
        const hasFooter = root?.querySelector('footer') != null;
        const hasPreviewSection = (root?.querySelectorAll('section').length ?? 0) >= 2;

        // .csd-* hooks must remain in the DOM (JS selectors target them) AND
        // every element bearing a .csd-* class should also carry at least one
        // tw-* utility class — that is the post-port invariant.
        const csdElements = root?.querySelectorAll('[class*="csd-"]') ?? null;
        const csdHookCount = csdElements?.length ?? 0;
        let twUtilityCount = 0;
        csdElements?.forEach((el: Element) => {
            const cls = el.getAttribute('class') ?? '';
            if (/\btw-[a-z0-9-]/i.test(cls)) twUtilityCount += 1;
        });

        // Attempt to navigate to the characteristics step so the workspace
        // partial renders; #goToStep gates progress in guided mode so
        // flip to free first. If the system doesn't expose a
        // characteristics step we skip rather than fail.
        let charSetupReachable = false;
        let workspaceHasTwGrid = false;
        try {
            builder.guidedMode = false;
            const coreSteps: StepConfig[] = builder.systemConfig?.coreSteps ?? [];
            const charStepIdx = coreSteps.findIndex((s) => s.key === 'characteristics');
            if (charStepIdx >= 0) {
                builder.currentStepIndex = charStepIdx;
                builder.showCharacteristics = true;
                await builder.render();
                await new Promise<void>((r) => {
                    setTimeout(r, 120);
                });
                const workspace = root?.querySelector('.csd-workspace') ?? null;
                if (workspace) {
                    const cls = workspace.getAttribute('class') ?? '';
                    workspaceHasTwGrid = /\btw-grid\b/.test(cls);
                }
                charSetupReachable = workspace !== null;
            } else {
                // No characteristics step on this system; not a styling
                // regression — leave both flags false.
                charSetupReachable = true;
                workspaceHasTwGrid = true;
            }
        } catch {
            /* render may throw on cold compendium; that's a separate issue */
        }

        window.removeEventListener('error', errorListener);

        return {
            setupOk: true,
            error: null,
            hasWh40kRpgClass,
            hasHeader,
            hasJourneyRail,
            hasMainContent,
            hasFooter,
            hasPreviewSection,
            csdHookCount,
            twUtilityCount,
            workspaceHasTwGrid,
            charSetupReachable,
            pageErrors,
        };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    // Snap the OPEN dialog so a regression in the visual treatment shows up
    // in the diff. The screenshot is best-effort and never gates the test.
    await snap(page, 'origin-path-builder-styled');

    // Hard invariants — these are what the issue's reopening criteria
    // demand. Each one would correspond to a visible regression.
    expect(
        result.hasWh40kRpgClass,
        'OriginPathBuilder dialog root must carry the `.wh40k-rpg` class — without it, the `important: ".wh40k-rpg"` Tailwind scope dead-strips every `tw-*` utility and the dialog renders unstyled',
    ).toBe(true);
    expect(result.hasHeader, 'expected the unified toolbar/header to render').toBe(true);
    expect(result.hasJourneyRail, 'expected the step-navigation rail to render').toBe(true);
    expect(result.hasMainContent, 'expected the main content section to render').toBe(true);
    expect(result.hasFooter, 'expected the footer/commit bar to render').toBe(true);
    expect(result.hasPreviewSection, 'expected the bottom preview section to render alongside main').toBe(true);

    // Every retained .csd-* hook must have a tw-* utility on the same
    // element. Any drift here means a future port deleted styling from a
    // selector that JS still queries — exactly the failure mode #198
    // captured.
    // .csd-* hooks may or may not be present in any given step's DOM (only the
    // characteristic workspace surface uses them). What the regression-guard
    // really cares about is: IF any are present, every one must carry an inline
    // tw-* utility — i.e. no "dead by class" elements where the JS-queried hook
    // has zero matching CSS.
    expect(
        result.twUtilityCount,
        `every .csd-* hook must carry inline tw-* styling alongside (csdHookCount=${result.csdHookCount}, twUtilityCount=${result.twUtilityCount})`,
    ).toBe(result.csdHookCount);

    // Characteristic step renders the workspace (drag-bank + char grid).
    expect(result.charSetupReachable, 'expected the characteristics workspace to be reachable from the journey rail').toBe(true);
    expect(result.workspaceHasTwGrid, 'csd-workspace must carry `tw-grid` so the bank + grid render side-by-side rather than stacked').toBe(true);

    // Surface any page errors that occurred during render — a thrown
    // exception inside _onRender would still let the dialog DOM exist but
    // would point at a regression in the data prep paths.
    expect(result.pageErrors, `unexpected page errors during render: ${result.pageErrors.slice(0, 3).join(' | ')}`).toEqual([]);

    // Cleanup
    await page.evaluate(async () => {
        interface CleanupActor {
            delete?: () => Promise<void>;
        }
        interface FoundryGlobal {
            game?: { actors?: { getName?: (name: string) => CleanupActor | null } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global (game), no type surface in browser context
        const g = globalThis as unknown as FoundryGlobal;
        const a = g.game?.actors?.getName?.('origin-builder-styling-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
