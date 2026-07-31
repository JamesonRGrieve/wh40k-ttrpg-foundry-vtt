import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { countHooks, expectHooks, expectHooksAuthored, fetchAuthoredHooks } from './lib/hooks';
import { joinOrSkip } from './lib/join';
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

async function createOwActor(page: Page): Promise<ActorRef | { error: string }> {
    const result = await page.evaluate(async () => {
        interface ActorCreateGlobals {
            Actor?: { create?: (data: object) => Promise<{ id?: string } | null> };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (Actor namespace, no shipped browser-side types)
        const { Actor: ActorCls } = globalThis as unknown as ActorCreateGlobals;
        if (!ActorCls?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await ActorCls.create({
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
            return { id: null, error: err instanceof Error ? err.message : String(err) };
        }
    });
    if (result.id == null) return { error: result.error ?? 'unknown' };
    return { id: result.id };
}

async function deleteActor(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string) => {
        interface DeleteGlobals {
            game?: { actors?: { get?: (id: string) => { delete?: () => Promise<void> } | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (game namespace, no shipped browser-side types)
        const { game: gme } = globalThis as unknown as DeleteGlobals;
        const actor = gme?.actors?.get?.(id);
        await actor?.delete?.();
    }, actorId);
}

test.describe.serial('OW Battlefield Awareness panel (Tier B, #161)', () => {
    test('renders the panel, asserts Request Support gating and awards roster, snaps', async ({ page }) => {
        await joinOrSkip(page);

        const created = await createOwActor(page);
        if ('error' in created) {
            test.skip(true, `ow-character creation failed: ${created.error}`);
            return;
        }
        const actorId = created.id;

        try {
            const result = await page.evaluate(async (id: string) => {
                interface ProbeSheet {
                    render: (options: { force: boolean }) => Promise<void>;
                    element?: HTMLElement | null;
                    close?: () => Promise<void>;
                }
                interface ProbeActor {
                    system?: { supportCooldown?: number; regimentalAwards?: string[] };
                    sheet?: ProbeSheet | null;
                }
                interface ProbeGlobals {
                    game?: { actors?: { get?: (id: string) => ProbeActor | undefined } };
                    __c161sheet?: ProbeSheet | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (game namespace + cross-callback sheet handle, no shipped browser-side types)
                const g = globalThis as unknown as ProbeGlobals;
                const actor = g.game?.actors?.get?.(id);
                if (actor == null) return { error: 'actor lookup failed' };
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
                    if (sheet == null) return { error: 'actor.sheet is null' };
                    await sheet.render({ force: true });
                    await new Promise((r) => {
                        setTimeout(r, 120);
                    });
                    rendered = sheet.element instanceof HTMLElement;

                    if (rendered && sheet.element != null) {
                        const el: HTMLElement = sheet.element;
                        const panel = el.querySelector('.wh40k-ow-battlefield-panel');
                        hasPanel = panel !== null;
                        const requestBtn = el.querySelector<HTMLButtonElement>('button[data-action="owRequestSupport"]');
                        hasRequestBtn = requestBtn !== null;
                        requestBtnDisabled = requestBtn?.disabled ?? null;
                        hasCooldownBadge = el.querySelector('[data-cooldown-status]') !== null;
                        hasAwardListOrEmpty =
                            el.querySelector('[data-wh40k-hook="ow-battlefield-panel__award-list"], [data-wh40k-hook="ow-battlefield-panel__awards"] p') !==
                            null;
                    }

                    g.__c161sheet = sheet;
                } catch (err) {
                    probeError = err instanceof Error ? err.message : String(err);
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
            }, actorId);

            const hookCounts = await countHooks(page);
            const authoredHooks = await fetchAuthoredHooks(page, '/systems/wh40k-rpg/templates/actor/panel/ow-battlefield-panel.hbs');

            await snap(page, 'ow-battlefield-panel');

            // Tear down so the open sheet doesn't leak into the next test's DOM.
            await page.evaluate(async () => {
                interface CleanupGlobals {
                    __c161sheet?: { close?: () => Promise<void> } | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: cross-callback sheet handle stashed on globalThis (no shipped browser-side type)
                const g = globalThis as unknown as CleanupGlobals;
                try {
                    await g.__c161sheet?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c161sheet = undefined;
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sheet did not render').toBe(true);
            expectHooks(hookCounts, ['ow-battlefield-panel__awards']);
            // The roster falls back to its empty-state <p> for this fixture, so the
            // <ul> hook is legitimately unrendered — `hasAwardListOrEmpty` below accepts
            // either branch. Pin the id in the template so that either-branch selector
            // cannot quietly stop matching the list half.
            expectHooksAuthored(authoredHooks, ['ow-battlefield-panel__award-list']);
            expect(result.hasPanel, 'battlefield panel should render in OW sheet').toBe(true);
            expect(result.hasRequestBtn, 'Request Support button should render').toBe(true);
            // With supportCooldown=3 (>0), the button must be disabled.
            //
            // NOTE: this assertion alone cannot detect a broken gate. The template
            // renders `disabled` via `{{#unless canRequestSupport}}`, so a context
            // that omits the field entirely ALSO yields a disabled button — which is
            // exactly the bug that shipped (the button was permanently disabled and
            // Support could never be requested). The cooldown-cleared case below is
            // the half that actually discriminates; keep both.
            expect(result.requestBtnDisabled, 'Request Support button should be disabled while cooldown > 0').toBe(true);
            expect(result.hasCooldownBadge, 'cooldown status badge should render').toBe(true);
            expect(result.cooldownBefore, 'initial cooldown should be 3').toBe(3);
            expect(result.awardRosterSize, 'initial award roster should hold 2 ids').toBe(2);
            expect(result.hasAwardListOrEmpty, 'awards section should render either the list or the empty-state notice').toBe(true);

            // The discriminating half: clear the cooldown, re-render, and require the
            // button to come back. A context missing `canRequestSupport` leaves it
            // disabled here, so this is what fails when the gate regresses to a
            // constant.
            const ready = await page.evaluate(async (id: string) => {
                interface ReadySheet {
                    render: (options: { force: boolean }) => Promise<void>;
                    element?: HTMLElement | null;
                    close?: () => Promise<void>;
                }
                interface ReadyActor {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update() accepts an arbitrary diff record and resolves to the updated Document or undefined
                    update?: (diff: Record<string, unknown>) => Promise<unknown>;
                    sheet?: ReadySheet | null;
                }
                interface ReadyGlobals {
                    game?: { actors?: { get?: (id: string) => ReadyActor | undefined } };
                    __c161ready?: ReadySheet | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-context globalThis (game namespace + cross-callback sheet handle, no shipped browser-side types)
                const g = globalThis as unknown as ReadyGlobals;
                const actor = g.game?.actors?.get?.(id);
                if (actor == null) return { error: 'actor lookup failed', disabled: null, badge: null };
                try {
                    await actor.update?.({ 'system.supportCooldown': 0 });
                    const sheet = actor.sheet;
                    if (sheet == null) return { error: 'actor.sheet is null', disabled: null, badge: null };
                    await sheet.render({ force: true });
                    await new Promise((r) => {
                        setTimeout(r, 120);
                    });
                    g.__c161ready = sheet;
                    const el = sheet.element;
                    if (!(el instanceof HTMLElement)) return { error: 'sheet element missing', disabled: null, badge: null };
                    return {
                        error: null,
                        disabled: el.querySelector<HTMLButtonElement>('button[data-action="owRequestSupport"]')?.disabled ?? null,
                        badge: el.querySelector('[data-cooldown-status]')?.getAttribute('data-cooldown-status') ?? null,
                    };
                } catch (err) {
                    return { error: err instanceof Error ? err.message : String(err), disabled: null, badge: null };
                }
            }, actorId);

            expect(ready.error, `cooldown-cleared probe error: ${ready.error ?? ''}`).toBeNull();
            expect(ready.disabled, 'Request Support button must be ENABLED once cooldown reaches 0').toBe(false);
            expect(ready.badge, 'cooldown badge must report ready once cooldown reaches 0').toBe('ready');

            await page.evaluate(async () => {
                interface ReadyCleanup {
                    __c161ready?: { close?: () => Promise<void> } | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: cross-callback sheet handle stashed on globalThis (no shipped browser-side type)
                const g = globalThis as unknown as ReadyCleanup;
                try {
                    await g.__c161ready?.close?.();
                } catch {
                    /* ignore */
                }
                g.__c161ready = undefined;
            });

            recordCoverage('panel.render', 'OwBattlefieldPanel');
        } finally {
            await deleteActor(page, actorId);
        }
    });
});
