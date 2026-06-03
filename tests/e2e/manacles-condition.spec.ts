import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Minimal browser-side shapes for the untyped Foundry V14 globals used in
 * this probe. Foundry ships no types into the Playwright `page.evaluate`
 * surface, so these stand in for that framework boundary.
 */
interface FoundrySheet {
    render: (force: boolean) => Promise<void>;
    changeTab?: (tab: string, group: string) => void;
    element?: { querySelectorAll?: (selector: string) => ArrayLike<Element> };
}
interface FoundryProbeActor {
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id?: string }>>;
    sheet: FoundrySheet;
    delete?: () => Promise<void>;
}
interface FoundryGlobal {
    Actor: { create?: (data: object) => Promise<FoundryProbeActor | null> };
    game?: { actors?: { getName?: (name: string) => FoundryProbeActor | undefined } };
}

interface ManaclesResult {
    setupOk: boolean;
    aeFound: boolean;
    effectCount: number;
    error: string | null;
}

/**
 * Manacles tracked condition visual regression (#105 — errata p. 176).
 *
 * Creates a `dh2-character`, applies the Manacled ActiveEffect (the
 * condition that imposes −40 BS / −40 WS), opens the actor sheet,
 * snaps with the sheet OPEN, and asserts the condition is visible on
 * the rendered Active Effects panel.
 *
 * The condition itself is registered in
 * `src/module/rules/active-effects.ts:conditions.manacled` and applied
 * via `src/module/rules/manacles.ts:applyManaclesCondition`. This test
 * exercises the full render path: AE creation → sheet render → DOM
 * presence of the AE row.
 */
test('manacles-condition renders Manacled AE on the sheet (#105)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async (): Promise<ManaclesResult> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry browser-side globalThis.Actor surface
        const ActorCls = (globalThis as unknown as FoundryGlobal).Actor;
        if (ActorCls.create == null) return { setupOk: false, aeFound: false, effectCount: 0, error: 'Actor.create unavailable' };

        let actor: FoundryProbeActor | null;
        try {
            actor = await ActorCls.create({
                name: 'manacles-probe',
                type: 'dh2-character',
                system: { gameSystem: 'dh2' },
            });
        } catch (err) {
            return { setupOk: false, aeFound: false, effectCount: 0, error: err instanceof Error ? err.message : String(err) };
        }
        if (actor == null) return { setupOk: false, aeFound: false, effectCount: 0, error: 'Actor.create returned null' };

        // Apply the Manacled ActiveEffect directly. This mirrors what
        // `applyManaclesCondition` does at runtime; using the raw API
        // avoids depending on the system bundle's export surface in
        // the page evaluation context.
        try {
            await actor.createEmbeddedDocuments('ActiveEffect', [
                {
                    name: 'Manacled',
                    icon: 'icons/svg/chains.svg',
                    changes: [
                        { key: 'system.characteristics.ballisticSkill.modifier', mode: 2, value: -40 },
                        { key: 'system.characteristics.weaponSkill.modifier', mode: 2, value: -40 },
                    ],
                    flags: { 'wh40k-rpg': { manacles: true, nature: 'harmful' } },
                },
            ]);
        } catch (err) {
            return { setupOk: false, aeFound: false, effectCount: 0, error: `AE create failed: ${err instanceof Error ? err.message : String(err)}` };
        }

        await actor.sheet.render(true);
        await new Promise<void>((r) => {
            setTimeout(r, 250);
        });

        try {
            actor.sheet.changeTab?.('overview', 'primary');
            await new Promise<void>((r) => {
                setTimeout(r, 150);
            });
        } catch {
            /* fall back to whatever tab is open */
        }

        const root = actor.sheet.element;
        const effectRows: ArrayLike<Element> = root?.querySelectorAll?.('[data-effect-id]') ?? [];
        let aeFound = false;
        for (const row of Array.from(effectRows)) {
            if (row.textContent.includes('Manacled')) {
                aeFound = true;
                break;
            }
        }
        return { setupOk: true, aeFound, effectCount: effectRows.length, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'manacles-condition');

    try {
        const appLoc = page.locator('.application[data-application-part]').last();
        if ((await appLoc.count()) > 0) {
            await appLoc.screenshot({ path: '.e2e-screenshots/manacles-condition__sheet-element.png' });
        }
    } catch {
        /* non-fatal — primary snap already wrote a PNG */
    }

    expect(result.effectCount, 'expected at least one effect row on the sheet').toBeGreaterThan(0);
    expect(result.aeFound, 'expected a Manacled effect row in the sheet DOM').toBe(true);

    // Cleanup
    await page.evaluate(async (): Promise<void> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry browser-side globalThis.game surface
        const gameGlobal = (globalThis as unknown as FoundryGlobal).game;
        const a = gameGlobal?.actors?.getName?.('manacles-probe');
        try {
            await a?.delete?.();
        } catch {
            /* ignore */
        }
    });
});
