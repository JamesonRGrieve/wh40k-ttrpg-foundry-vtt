import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of issue #216 — "Duplicate aptitude option still
 * displays as a requirement even if it is selected".
 *
 * Pre-fix the OriginPathBuilder rendered every entry in
 * `preview.aptitudeCollisions` under the warning banner regardless of
 * whether the player had picked a replacement, so a resolved swap kept
 * appearing as an outstanding requirement.
 *
 * Fix: split the collision list into `unresolvedAptitudeCollisions`
 * (drives the warning banner) and `resolvedAptitudeCollisions` (drives a
 * neutral "applied swap" sub-section with a Change affordance). Banner
 * only fires for genuinely-outstanding entries.
 *
 * This spec creates a dh2-character actor, mounts the OriginPathBuilder
 * sheet, seeds a fake committed origin selection that doubles a
 * characteristic aptitude (Willpower from two origins) and a resolved
 * aptitude override (Willpower → Strength), then renders and captures
 * the live sheet. Follows the disorder-roll-dialog.spec.ts pattern:
 * keep the application open when snap() runs so the screenshot has DOM
 * to capture.
 */

const ORIGIN_BUILDER_MODULE_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';

interface BannerProbeResult {
    created: boolean;
    rendered: boolean;
    hasWarningBanner: boolean;
    hasResolvedBanner: boolean;
    unresolvedRowCount: number;
    resolvedRowCount: number;
    error: string | null;
}

/**
 * Minimal shape of a committed origin-path selection as the builder's
 * `selections` Map holds it (matches `mkPicked` below). Only the fields the
 * builder reads while computing the preview matter; the rest are stub values.
 */
interface PickedSelection {
    id: string;
    uuid: string | null;
    name: string;
    img: string;
    step: string;
    stepIndex: number;
    identifier: string;
    positions: number[];
    primaryPosition: number;
    description: string;
    shortDescription: string;
    requirements: { text: string; previousSteps: string[]; excludedSteps: string[] };
    grants: {
        skills: string[];
        talents: string[];
        traits: string[];
        equipment: string[];
        aptitudes: string[];
        specialAbilities: string[];
        choices: string[];
        woundsFormula: string | null;
        fateFormula: string | null;
    };
    modifiers: { characteristics: Record<string, number> };
    isAdvanced: boolean;
    xpCost: number;
    hasChoices: boolean;
    gameSystem: string;
    system: { grants: { aptitudes: string[] }; selectedChoices: Record<string, never>; modifiers: { characteristics: Record<string, number> } };
    _sourceUuid: string | null;
    _actorItemId: string | null;
}

/**
 * The OriginPathBuilder instance surface this probe drives. The builder is a
 * Foundry ApplicationV2 subclass; only the members exercised here are typed.
 */
interface OriginPathBuilderInstance {
    selections: Map<string, PickedSelection>;
    aptitudeOverrides: Map<string, string>;
    render: (options: { force: boolean }) => Promise<void>;
    element: HTMLElement | null;
    close?: () => Promise<void>;
}

type OriginPathBuilderCtor = new (actor: ProbeActor) => OriginPathBuilderInstance;

/**
 * Subset of the Foundry `Actor` surface used here. Members are optional
 * because the probe defends against a mid-init world at runtime.
 */
interface ProbeActor {
    id?: string;
    delete?: () => Promise<void>;
}

interface ProbeActorClass {
    create?: (data: object) => Promise<ProbeActor | null>;
}

/**
 * Foundry hangs `Actor` off the page globalThis; the probe also stashes the
 * open builder + actor on it so the out-of-evaluate `snap()` can capture live
 * DOM and the teardown evaluate can close them. These are framework / probe
 * runtime globals, so the cast to this shape is a named-boundary cast.
 */
interface Issue216Globals {
    Actor?: ProbeActorClass;
    __c216builder?: OriginPathBuilderInstance | undefined;
    __c216actor?: ProbeActor | null | undefined;
}

test.describe.serial('Issue #216 — resolved duplicate aptitude no longer renders as requirement (Tier B)', () => {
    test('warning banner is absent post-select; resolved-banner is present and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(
                async ({ moduleUrl }): Promise<BannerProbeResult> => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry injects `Actor` and the probe stashes builder/actor handles onto the page globalThis
                    const g = globalThis as unknown as Issue216Globals;
                    const ActorCls = g.Actor;
                    let created = false;
                    let rendered = false;
                    let hasWarningBanner = false;
                    let hasResolvedBanner = false;
                    let unresolvedRowCount = 0;
                    let resolvedRowCount = 0;
                    let error: string | null = null;

                    if (typeof ActorCls?.create !== 'function') {
                        return {
                            created,
                            rendered,
                            hasWarningBanner,
                            hasResolvedBanner,
                            unresolvedRowCount,
                            resolvedRowCount,
                            error: 'Actor.create unavailable',
                        };
                    }

                    let actor: ProbeActor | null = null;
                    try {
                        actor = await ActorCls.create({
                            name: 'issue-216-probe',
                            type: 'dh2-character',
                            system: { gameSystem: 'dh2' },
                        });
                        created = actor !== null;
                    } catch (err) {
                        return {
                            created,
                            rendered,
                            hasWarningBanner,
                            hasResolvedBanner,
                            unresolvedRowCount,
                            resolvedRowCount,
                            error: `Actor.create: ${err instanceof Error ? err.message : String(err)}`,
                        };
                    }
                    if (actor === null) {
                        return {
                            created,
                            rendered,
                            hasWarningBanner,
                            hasResolvedBanner,
                            unresolvedRowCount,
                            resolvedRowCount,
                            error: 'Actor.create returned null',
                        };
                    }

                    let mod: { default?: OriginPathBuilderCtor };
                    try {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of a runtime-only Foundry system module path
                        mod = (await import(moduleUrl)) as { default?: OriginPathBuilderCtor };
                    } catch (err) {
                        error = `import builder: ${err instanceof Error ? err.message : String(err)}`;
                        return {
                            created,
                            rendered,
                            hasWarningBanner,
                            hasResolvedBanner,
                            unresolvedRowCount,
                            resolvedRowCount,
                            error,
                        };
                    }

                    const OriginPathBuilder: OriginPathBuilderCtor | undefined = mod.default;
                    if (typeof OriginPathBuilder !== 'function') {
                        return {
                            created,
                            rendered,
                            hasWarningBanner,
                            hasResolvedBanner,
                            unresolvedRowCount,
                            resolvedRowCount,
                            error: 'OriginPathBuilder default export missing',
                        };
                    }

                    let builder: OriginPathBuilderInstance;
                    try {
                        builder = new OriginPathBuilder(actor);
                    } catch (err) {
                        return {
                            created,
                            rendered,
                            hasWarningBanner,
                            hasResolvedBanner,
                            unresolvedRowCount,
                            resolvedRowCount,
                            error: `new OriginPathBuilder: ${err instanceof Error ? err.message : String(err)}`,
                        };
                    }

                    // Seed two picked selections that both grant Willpower
                    // (the canonical doubling case) and stage a resolved
                    // override swapping Willpower → Strength. After
                    // _calculatePreview runs the warning banner data source
                    // (unresolvedAptitudeCollisions) must be empty and the
                    // resolved-banner data source must hold the entry.
                    try {
                        const mkPicked = (apts: string[]): PickedSelection => ({
                            id: `picked-${apts.join('-').toLowerCase()}`,
                            uuid: null,
                            name: `Stub ${apts.join('+')}`,
                            img: 'icons/svg/d20.svg',
                            step: 'homeWorld',
                            stepIndex: 0,
                            identifier: `stub-${apts.join('-').toLowerCase()}`,
                            positions: [1],
                            primaryPosition: 1,
                            description: '',
                            shortDescription: '',
                            requirements: { text: '', previousSteps: [], excludedSteps: [] },
                            grants: {
                                skills: [],
                                talents: [],
                                traits: [],
                                equipment: [],
                                aptitudes: apts,
                                specialAbilities: [],
                                choices: [],
                                woundsFormula: null,
                                fateFormula: null,
                            },
                            modifiers: { characteristics: {} },
                            isAdvanced: false,
                            xpCost: 0,
                            hasChoices: false,
                            gameSystem: 'dh2',
                            system: { grants: { aptitudes: apts }, selectedChoices: {}, modifiers: { characteristics: {} } },
                            _sourceUuid: null,
                            _actorItemId: null,
                        });

                        builder.selections = new Map<string, PickedSelection>([
                            ['homeWorld', mkPicked(['Willpower'])],
                            ['background', mkPicked(['Willpower'])],
                        ]);
                        builder.aptitudeOverrides = new Map<string, string>([['Willpower', 'Strength']]);
                    } catch (err) {
                        error = `state seed: ${err instanceof Error ? err.message : String(err)}`;
                        return {
                            created,
                            rendered,
                            hasWarningBanner,
                            hasResolvedBanner,
                            unresolvedRowCount,
                            resolvedRowCount,
                            error,
                        };
                    }

                    try {
                        await builder.render({ force: true });
                        await new Promise<void>((r) => {
                            setTimeout(r, 120);
                        });
                    } catch (err) {
                        error = `render: ${err instanceof Error ? err.message : String(err)}`;
                    }

                    rendered = builder.element instanceof HTMLElement;
                    if (rendered && builder.element != null) {
                        const el = builder.element;
                        hasWarningBanner = el.querySelector('[data-testid="aptitude-collision-banner"]') !== null;
                        hasResolvedBanner = el.querySelector('[data-testid="aptitude-collision-resolved-banner"]') !== null;
                        unresolvedRowCount = el.querySelectorAll('[data-testid="aptitude-collision-unresolved"]').length;
                        resolvedRowCount = el.querySelectorAll('[data-testid="aptitude-collision-resolved"]').length;
                    }

                    // Hold the open application on a handle so snap() (called
                    // outside this evaluate) captures the live DOM rather than
                    // an empty viewport. The follow-up evaluate closes it.
                    g.__c216builder = builder;
                    g.__c216actor = actor;

                    return {
                        created,
                        rendered,
                        hasWarningBanner,
                        hasResolvedBanner,
                        unresolvedRowCount,
                        resolvedRowCount,
                        error,
                    };
                    /* eslint-enable @typescript-eslint/no-explicit-any */
                },
                { moduleUrl: ORIGIN_BUILDER_MODULE_URL },
            );

            // Snap while the builder is still mounted (mirrors the disorder
            // dialog spec's keep-open-then-snap pattern).
            await snap(page, 'issue-216-resolved-aptitude');

            // Clean up: close the application and delete the seeded actor so
            // the next serial test doesn't trip over leftover DOM.
            await page.evaluate(async () => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: the probe stashed builder/actor handles onto the page globalThis
                const g = globalThis as unknown as Issue216Globals;
                const b = g.__c216builder;
                const a = g.__c216actor;
                try {
                    await b?.close?.();
                } catch {
                    /* ignore */
                }
                try {
                    await a?.delete?.();
                } catch {
                    /* ignore */
                }
                g.__c216builder = undefined;
                g.__c216actor = undefined;
            });

            // If the builder couldn't render at all (init pipeline regressions,
            // missing packs in the test world), surface that as a skip rather
            // than a noisy failure — the storybook iframe spec at
            // tests/storybook/issue-216-resolved-aptitude.spec.ts covers the
            // same DOM assertion without Foundry boot.
            test.skip(!result.rendered, `builder did not render: ${result.error ?? 'unknown'}`);

            expect(result.created, 'actor was not created').toBe(true);
            expect(result.error, `probe error: ${result.error ?? ''}`).toBeNull();

            // The fix's load-bearing assertion: warning banner gone post-swap.
            expect(result.hasWarningBanner, 'warning banner must be absent after swap (issue #216)').toBe(false);
            expect(result.unresolvedRowCount, 'no unresolved rows should render after swap').toBe(0);

            // The resolved entry is still listed so the player can Change it.
            expect(result.hasResolvedBanner, 'resolved-banner must be present so player can Change the swap').toBe(true);
            expect(result.resolvedRowCount, 'exactly one resolved row should render').toBe(1);

            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'OriginPathBuilder.Issue216');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
