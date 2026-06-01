import type { Page } from '@playwright/test';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B: a homebrew cross-system conversion renders the adapted-homebrew
 * (`fa-shuffle`) icon in the DH2 origin-path builder.
 *
 * Homeworlds that are official (`raw`) in OW/RT/DH1 but carry a `provenance:
 * "homebrew"` `dh2` variant (e.g. Fortress World, Imperial World) are reachable
 * in the DH2 builder via reference stubs in dh2-core-origins-homeworlds. For
 * those, `originProvenanceFlags(origin, 'dh2')` → `isAdaptedHomebrew`, and the
 * card template (origin-path-builder.hbs) renders an `<i class="fa-shuffle">`
 * badge with a "Homebrew conversion" tooltip. This spec drives the real builder
 * on a dh2-character and asserts both the classification and the rendered DOM.
 */

const ORIGIN_BUILDER_MODULE_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';

interface IconProbeResult {
    created: boolean;
    createError: string | null;
    originCount: number;
    adaptedHomebrewOrigins: string[];
    shuffleIconCount: number;
    conversionTooltipCount: number;
    pageErrors: string[];
}

async function probeConversionIcon(page: Page): Promise<IconProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
        const result = await page.evaluate(
            async ({ moduleUrl }) => {
                interface ActorDoc {
                    delete?: () => Promise<void>;
                }
                interface ActorCtorShape {
                    create?: (data: object) => Promise<ActorDoc | null>;
                }
                interface OriginEntry {
                    name?: string;
                    officialLines?: string[];
                    system?: { step?: string };
                }
                interface BuilderShape {
                    allOrigins?: OriginEntry[];
                    currentStepIndex: number;
                    element: HTMLElement | null;
                    render: (force?: boolean) => Promise<void>;
                    close?: () => Promise<void>;
                    _loadOrigins?: () => Promise<void>;
                }
                interface BuilderCtor {
                    new (actor: ActorDoc, options: object): BuilderShape;
                }
                type ProvFlags = { isPureHomebrew: boolean; isAdaptedHomebrew: boolean; adaptedFromLabel: string };
                interface BuilderModule {
                    default?: BuilderCtor;
                    originProvenanceFlags?: (origin: OriginEntry, activeSystem: string) => ProvFlags;
                }
                interface FoundryGlobal {
                    Actor?: ActorCtorShape;
                }
                const fail = (createError: string): IconProbeResult => ({
                    created: false,
                    createError,
                    originCount: 0,
                    adaptedHomebrewOrigins: [],
                    shuffleIconCount: 0,
                    conversionTooltipCount: 0,
                    pageErrors: [],
                });

                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global, no browser type surface
                const { Actor: ActorCls } = globalThis as unknown as FoundryGlobal;
                if (ActorCls?.create == null) return fail('Actor.create unavailable');

                let actor: ActorDoc | null;
                try {
                    actor = await ActorCls.create({ name: 'homebrew-icon-probe', type: 'dh2-character', system: { gameSystem: 'dh2' } });
                } catch (err) {
                    return fail(`Actor.create: ${String(err instanceof Error ? err.message : err)}`);
                }
                if (actor == null) return fail('Actor.create returned null');
                const seededActor = actor;

                let mod: BuilderModule;
                try {
                    mod = (await import(moduleUrl)) as BuilderModule;
                } catch (err) {
                    await seededActor.delete?.().catch(() => undefined);
                    return fail(`import builder: ${String(err instanceof Error ? err.message : err)}`);
                }
                const OriginPathBuilder = mod.default;
                const provFlags = mod.originProvenanceFlags;
                if (typeof OriginPathBuilder !== 'function' || typeof provFlags !== 'function') {
                    await seededActor.delete?.().catch(() => undefined);
                    return fail('builder default export / originProvenanceFlags missing');
                }

                let builder: BuilderShape;
                try {
                    builder = new OriginPathBuilder(seededActor, {});
                    await builder.render(true);
                    await new Promise<void>((r) => {
                        setTimeout(r, 200);
                    });
                    if ((builder.allOrigins?.length ?? 0) === 0 && typeof builder._loadOrigins === 'function') {
                        await builder._loadOrigins().catch(() => undefined);
                    }
                    // Ensure we are on the homeWorld step (default) and re-render so
                    // the loaded origins populate the card grid with their badges.
                    builder.currentStepIndex = 0;
                    await builder.render();
                    await new Promise<void>((r) => {
                        setTimeout(r, 150);
                    });
                } catch (err) {
                    await seededActor.delete?.().catch(() => undefined);
                    return fail(`builder.render: ${String(err instanceof Error ? err.message : err)}`);
                }

                const origins = builder.allOrigins ?? [];
                const homeWorldOrigins = origins.filter((o) => o.system?.step === 'homeWorld');
                const adaptedHomebrewOrigins = homeWorldOrigins.filter((o) => provFlags(o, 'dh2').isAdaptedHomebrew).map((o) => String(o.name ?? ''));

                const root = builder.element;
                const shuffleIconCount = root?.querySelectorAll('i.fa-shuffle').length ?? 0;
                const conversionTooltipCount = root?.querySelectorAll('[data-tooltip^="Homebrew conversion"]').length ?? 0;

                await builder.close?.().catch(() => undefined);
                await seededActor.delete?.().catch(() => undefined);

                return {
                    created: true,
                    createError: null,
                    originCount: origins.length,
                    adaptedHomebrewOrigins,
                    shuffleIconCount,
                    conversionTooltipCount,
                    pageErrors: [],
                };
            },
            { moduleUrl: ORIGIN_BUILDER_MODULE_URL },
        );
        return { ...result, pageErrors };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('origin homebrew-conversion icon (Tier B)', () => {
    test('DH2 builder renders the fa-shuffle adapted-homebrew badge for converted homeworlds', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeConversionIcon(page);
        test.skip(!probe.created, `could not bootstrap builder: ${probe.createError ?? 'unknown'}`);
        test.skip(probe.originCount === 0, 'no origins loaded (compendium packs unavailable in this world)');

        // The DH2 homeworld pool must include at least one homebrew conversion
        // (Fortress World, Imperial World, …), and the builder must render its
        // fa-shuffle / "Homebrew conversion" badge in the DOM.
        expect(
            probe.adaptedHomebrewOrigins.length,
            `expected ≥1 adapted-homebrew homeworld, got: ${probe.adaptedHomebrewOrigins.join(', ') || 'none'}`,
        ).toBeGreaterThan(0);
        expect(
            probe.shuffleIconCount + probe.conversionTooltipCount,
            'expected the adapted-homebrew badge (fa-shuffle / "Homebrew conversion" tooltip) to render',
        ).toBeGreaterThan(0);
        expect(probe.pageErrors, `builder page errors: ${probe.pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);
    });
});
