import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { countHooks, expectHooks } from './lib/hooks';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Only War Comrade-in-Combat panel + actions (#152).
 *
 * Creates an `ow-character` with a Comrade 3 m away, opens its sheet and
 * walks the whole state track through the panel's own buttons:
 * Wound (unharmed → wounded), Heal (→ unharmed), Wound twice (→ dead), then —
 * once the squad is back in camp for refitting (`refitAvailable`) — Replace
 * (→ unharmed). At every step it asserts the actor's state, the panel's
 * badge, the button gates and that no panel text reads "undefined" (the
 * cohesion range used to render as "Cohesion range: undefined m"), and snaps
 * the panel.
 */

interface FoundryProbeSheet {
    render: (options: { force: boolean }) => Promise<void>;
    element: HTMLElement | null;
    close?: () => Promise<void>;
}
interface FoundryProbeActor {
    id?: string;
    system?: { comrade?: { state?: string | null } };
    sheet: FoundryProbeSheet | null;
    update?: (data: object) => Promise<FoundryProbeActor | undefined>;
    delete?: () => Promise<void>;
}
/** Minimal browser-side shapes for the untyped Foundry V14 globals this probe touches. */
interface FoundryGlobal {
    Actor?: { create?: (data: object) => Promise<FoundryProbeActor | null> };
    game?: { actors?: { get?: (id: string) => FoundryProbeActor | undefined } };
}

/** What the panel shows after one step. */
interface PanelState {
    error: string | null;
    actorState: string | null;
    badge: string | null;
    cohesion: string | null;
    rangeText: string;
    hasUndefined: boolean;
    /** Enabled state of Wound / Heal / Replace, in that order. */
    enabled: boolean[];
}

async function createOwActor(page: Page): Promise<string | { error: string }> {
    const result = await page.evaluate(async (): Promise<{ id: string | null; error: string | null }> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry browser-side globalThis.Actor surface
        const { Actor: ActorCls } = globalThis as unknown as FoundryGlobal;
        if (!ActorCls?.create) return { id: null, error: 'Actor.create unavailable' };
        try {
            const actor = await ActorCls.create({
                name: 'probe-ow-comrade-pc',
                type: 'ow-character',
                system: {
                    gameSystem: 'ow',
                    comrade: { name: 'Comrade Probe', state: 'unharmed', distanceM: 3, hasVisualLine: true },
                },
            });
            return actor?.id === undefined ? { id: null, error: 'Actor.create returned no actor' } : { id: actor.id, error: null };
        } catch (err) {
            return { id: null, error: err instanceof Error ? err.message : String(err) };
        }
    });
    return result.id ?? { error: result.error ?? 'unknown create error' };
}

/**
 * Optionally prepare the actor (`refit`), optionally click one panel button and
 * wait for the actor's Comrade state to change, then read the re-rendered panel.
 */
async function step(page: Page, actorId: string, opts: { click?: string; refit?: boolean }): Promise<PanelState> {
    return page.evaluate(
        async ({ id, click, refit }): Promise<PanelState> => {
            const empty: PanelState = { error: null, actorState: null, badge: null, cohesion: null, rangeText: '', hasUndefined: false, enabled: [] };
            // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry browser-side globalThis.game surface
            const g = globalThis as unknown as FoundryGlobal;
            const actor = g.game?.actors?.get?.(id);
            const sheet = actor?.sheet;
            if (actor == null || sheet == null) return { ...empty, error: 'actor or sheet lookup failed' };
            const panel = (): HTMLElement | null => sheet.element?.querySelector<HTMLElement>('[data-wh40k-hook="ow-comrade-panel"]') ?? null;
            try {
                if (refit === true) await actor.update?.({ 'system.refitAvailable': true });
                await sheet.render({ force: true });
                await globalThis.wh40kE2E.pollUntil(() => panel() !== null);
                if (click !== undefined) {
                    const before = actor.system?.comrade?.state ?? null;
                    const btn = panel()?.querySelector<HTMLButtonElement>(`button[data-action="${click}"]`);
                    if (btn == null || btn.disabled) return { ...empty, error: `${click} button missing or disabled` };
                    btn.click();
                    await globalThis.wh40kE2E.pollUntil(() => (actor.system?.comrade?.state ?? null) !== before);
                    const after = actor.system?.comrade?.state ?? null;
                    // The sheet re-renders on the update; wait until the panel shows the new state.
                    await globalThis.wh40kE2E.pollUntil(() => panel()?.dataset['owComradeState'] === after);
                }
                const el = panel();
                if (el === null) return { ...empty, error: 'comrade panel did not render' };
                return {
                    error: null,
                    actorState: actor.system?.comrade?.state ?? null,
                    badge: el.querySelector<HTMLElement>('[data-state-badge]')?.dataset['stateBadge'] ?? null,
                    cohesion: el.querySelector<HTMLElement>('[data-cohesion]')?.dataset['cohesion'] ?? null,
                    // The label's text, then the distance input's value (#152: the distance is editable).
                    rangeText: `${(el.querySelector('[data-field="distance-m"]')?.textContent ?? '').replace(/\s+/g, ' ').trim()} (${
                        el.querySelector<HTMLInputElement>('input[name="system.comrade.distanceM"]')?.value ?? ''
                    } m)`,
                    hasUndefined: el.textContent.includes('undefined'),
                    enabled: ['owComradeWound', 'owComradeHeal', 'owComradeReplace'].map(
                        (action) => el.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)?.disabled === false,
                    ),
                };
            } catch (err) {
                return { ...empty, error: err instanceof Error ? err.message : String(err) };
            }
        },
        { id: actorId, click: opts.click, refit: opts.refit },
    );
}

async function teardown(page: Page, actorId: string): Promise<void> {
    await page.evaluate(async (id: string): Promise<void> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: untyped Foundry browser-side globalThis.game surface
        const g = globalThis as unknown as FoundryGlobal;
        const actor = g.game?.actors?.get?.(id);
        try {
            await actor?.sheet?.close?.();
        } catch {
            /* the sheet may already be closed */
        }
        await actor?.delete?.();
    }, actorId);
}

const PANEL = '[data-wh40k-hook="ow-comrade-panel"]';

test.describe.serial('OW Comrade panel (Tier B, #152)', () => {
    test('walks the Comrade track through Wound, Heal and Replace with every value defined', async ({ page }) => {
        await joinOrSkip(page);

        const created = await createOwActor(page);
        if (typeof created !== 'string') {
            test.skip(true, `ow-character creation failed: ${created.error}`);
            return;
        }
        const actorId = created;

        try {
            const start = await step(page, actorId, {});
            expect(start.error, start.error ?? '').toBeNull();
            expectHooks(await countHooks(page), ['ow-comrade-panel']);
            await snap(page, 'ow-comrade-panel-unharmed', { selector: PANEL });
            expect(start.hasUndefined, 'no panel value may render as "undefined"').toBe(false);
            expect(start.rangeText).toContain('Cohesion range: 5 m');
            expect(start.rangeText).toContain('(3 m)');
            expect(start.cohesion, '3 m with no barrier is in Cohesion').toBe('in');
            expect(start).toMatchObject({ actorState: 'unharmed', badge: 'unharmed', enabled: [true, false, false] });

            const wounded = await step(page, actorId, { click: 'owComradeWound' });
            expect(wounded.error, wounded.error ?? '').toBeNull();
            await snap(page, 'ow-comrade-panel-wounded', { selector: PANEL });
            expect(wounded).toMatchObject({ actorState: 'wounded', badge: 'wounded', hasUndefined: false, enabled: [true, true, false] });

            const healed = await step(page, actorId, { click: 'owComradeHeal' });
            expect(healed.error, healed.error ?? '').toBeNull();
            expect(healed).toMatchObject({ actorState: 'unharmed', badge: 'unharmed', enabled: [true, false, false] });

            await step(page, actorId, { click: 'owComradeWound' });
            const dead = await step(page, actorId, { click: 'owComradeWound' });
            expect(dead.error, dead.error ?? '').toBeNull();
            await snap(page, 'ow-comrade-panel-dead', { selector: PANEL });
            expect(dead, 'a dead Comrade in the field cannot be wounded, healed or replaced').toMatchObject({
                actorState: 'dead',
                badge: 'dead',
                enabled: [false, false, false],
            });

            const inCamp = await step(page, actorId, { refit: true });
            expect(inCamp.error, inCamp.error ?? '').toBeNull();
            await snap(page, 'ow-comrade-panel-dead-in-camp', { selector: PANEL });
            expect(inCamp.enabled, 'back in camp for refitting, Replace is enabled').toEqual([false, false, true]);

            const replaced = await step(page, actorId, { click: 'owComradeReplace' });
            expect(replaced.error, replaced.error ?? '').toBeNull();
            await snap(page, 'ow-comrade-panel-replaced', { selector: PANEL });
            expect(replaced).toMatchObject({ actorState: 'unharmed', badge: 'unharmed', hasUndefined: false });

            recordCoverage('panel.render', 'OwComradePanel');
        } finally {
            await teardown(page, actorId);
        }
    });
});
