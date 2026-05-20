import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Only War Battlefield Awareness panel + actions
 * (GitHub #161).
 *
 * Creates an `ow-character` actor in the seed world seeded with two
 * Regimental Awards and an active support cooldown; opens its sheet;
 * asserts the panel renders with the Request Support button (disabled
 * while on cooldown) and the awards roster.
 */

interface ActorRef {
    id: string;
}

async function createOwActor(page: import('@playwright/test').Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        const { Actor } = globalThis as unknown as {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        };
        if (!Actor?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await Actor.create({
                name: 'probe-ow-battlefield-pc',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    supportCooldown: 3,
                    regimentalAwards: ['award-cadian-valour', 'award-purgation-cross'],
                },
            });
            if (!actor) return { id: null, error: 'Actor.create returned null' };
            return { id: actor.id ?? null, error: null };
        } catch (err) {
            return { id: null, error: String((err as Error)?.message ?? err) };
        }
    });
    if (!result.id) return { error: result.error ?? 'unknown create error' };
    return { id: result.id };
}

async function deleteActor(page: import('@playwright/test').Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        const { game } = globalThis as unknown as {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<unknown> } | undefined } };
        };
        const actor = game?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

test.describe.serial('OW Battlefield Awareness panel (Tier B, #161)', () => {
    test('renders the panel, asserts Request Support gating and awards roster, snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const created = await createOwActor(page);
        if ('error' in created) {
            test.skip(true, `ow-character creation failed: ${created.error}`);
            return;
        }
        const actorId = created.id;

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async (id: string) => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const g = globalThis as any;
                const actor = g.game?.actors?.get?.(id);
                if (!actor) return { error: 'actor lookup failed' };
                let rendered = false;
                let hasPanel = false;
                let hasRequestBtn = false;
                let requestBtnDisabled: boolean | null = null;
                let hasCooldownBadge = false;
                let cooldownBefore: number | null = null;
                let awardRosterSize: number | null = null;
                let hasAwardListOrEmpty = false;
                let probeError: string | null = null;

                try {
                    cooldownBefore = actor.system?.supportCooldown ?? null;
                    awardRosterSize = Array.isArray(actor.system?.regimentalAwards) ? actor.system.regimentalAwards.length : null;
                    const sheet = actor.sheet;
                    if (!sheet) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise((r) => setTimeout(r, 120));
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-battlefield-panel');
                        hasPanel = panel !== null;
                        const requestBtn = el.querySelector('button[data-action="owRequestSupport"]') as HTMLButtonElement | null;
                        hasRequestBtn = requestBtn !== null;
                        requestBtnDisabled = requestBtn?.disabled ?? null;
                        hasCooldownBadge = el.querySelector('[data-cooldown-status]') !== null;
                        hasAwardListOrEmpty = el.querySelector('.wh40k-ow-battlefield-panel__award-list, .wh40k-ow-battlefield-panel__awards p') !== null;
                    }

                    g.__c161sheet = sheet;
                } catch (err) {
                    probeError = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    hasPanel,
                    hasRequestBtn,
                    requestBtnDisabled,
                    hasCooldownBadge,
                    cooldownBefore,
                    awardRosterSize,
                    hasAwardListOrEmpty,
                    error: probeError,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            }, actorId);

            await snap(page, 'ow-battlefield-panel');

            // Tear down so the open sheet doesn't leak into the next test's DOM.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const g = globalThis as any;
                try {
                    await g.__c161sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c161sheet = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            expect(result.hasPanel, 'battlefield panel should render in OW sheet').toBe(true);
            expect(result.hasRequestBtn, 'Request Support button should render').toBe(true);
            // With supportCooldown=3 (>0), the button must be disabled.
            expect(result.requestBtnDisabled, 'Request Support button should be disabled while cooldown > 0').toBe(true);
            expect(result.hasCooldownBadge, 'cooldown status badge should render').toBe(true);
            expect(result.cooldownBefore, 'initial cooldown should be 3').toBe(3);
            expect(result.awardRosterSize, 'initial award roster should hold 2 ids').toBe(2);
            expect(result.hasAwardListOrEmpty, 'awards section should render either the list or the empty-state notice').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'OwBattlefieldPanel');
        } finally {
            page.off('pageerror', listener);
            await deleteActor(page, actorId);
        }
    });
});
