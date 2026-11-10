import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the world-time widget's Undo (#703,
 * src/module/rules/world-time-undo*.ts). A probe actor carries fatigue 3 and a
 * 30-minute timed effect. The GM presses +1 Hour on the widget: an hour of rest
 * recovers fatigue to 2 and the effect runs out. Undo must wind the clock back
 * to where it was, put fatigue back to 3, bring the effect back, and leave
 * nothing more to undo. The widget is captured before and after.
 *
 * Each flow records under `world-time-undo.flow`. Keys MUST match
 * WORLD_TIME_UNDO_FLOWS in scripts/e2e-coverage.mjs.
 */

const WORLD_TIME_UNDO_FLOWS = ['undo-restores-clock', 'undo-restores-fatigue', 'undo-restores-effects', 'undo-single-level'] as const;

type FlowName = (typeof WORLD_TIME_UNDO_FLOWS)[number];

const WIDGET_ID = 'wh40k-world-time-widget';
const START_FATIGUE = 3;
const EFFECT_SECONDS = 1800;

interface ProbeEffect {
    _source: { duration: { expired: boolean } };
}
interface ProbeActor {
    id: string;
    system: { fatigue?: { value: number } };
    effects: { get: (id: string) => ProbeEffect | undefined };
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>>;
    delete: () => Promise<void>;
}
interface UndoGlobals {
    game: {
        time: { worldTime: number };
        actors: { get: (id: string) => ProbeActor | undefined };
        settings: { get: (ns: string, key: string) => string };
    };
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
}

interface ProbeState {
    worldTime: number;
    fatigue: number | null;
    effectExpired: boolean | null;
    record: string;
    undoDisabled: boolean | null;
    undoLabel: string;
}

/** Create the probe actor with fatigue and a short timed effect, and open the widget. */
async function setUp(page: Page): Promise<{ actorId: string; effectId: string }> {
    return page.evaluate(
        async (args: { fatigue: number; seconds: number }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as UndoGlobals;
            const actor = await g.Actor.create({
                name: 'probe-world-time-undo',
                type: 'dh2-character',
                system: { gameSystem: 'dh2', fatigue: { value: args.fatigue } },
            });
            if (actor === null) throw new Error('probe actor not created');
            const created = await actor.createEmbeddedDocuments('ActiveEffect', [
                { name: 'probe-timed-effect', start: { time: g.game.time.worldTime }, duration: { value: args.seconds, units: 'seconds' } },
            ]);
            const effect = created.at(0);
            if (effect === undefined) throw new Error('probe effect not created');
            const moduleRoot = '/systems/wh40k-rpg/module';
            const widgetModule = (await import(/* @vite-ignore */ `${moduleRoot}/applications/hud/world-time-widget.js`)) as {
                default: { show: () => object };
            };
            widgetModule.default.show();
            return { actorId: actor.id, effectId: effect.id };
        },
        { fatigue: START_FATIGUE, seconds: EFFECT_SECONDS },
    );
}

/** Read the clock, the probe's fatigue and effect, the undo record and the Undo button. */
async function readState(page: Page, ids: { actorId: string; effectId: string }): Promise<ProbeState> {
    return page.evaluate(
        (args: { actorId: string; effectId: string; widgetId: string }): ProbeState => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as UndoGlobals;
            const actor = g.game.actors.get(args.actorId);
            const button = document.querySelector<HTMLButtonElement>(`#${args.widgetId} [data-action="undoAdvance"]`);
            return {
                worldTime: g.game.time.worldTime,
                fatigue: actor?.system.fatigue?.value ?? null,
                effectExpired: actor?.effects.get(args.effectId)?._source.duration.expired ?? null,
                record: g.game.settings.get('wh40k-rpg', 'world-time-last-advance'),
                undoDisabled: button?.disabled ?? null,
                undoLabel: button?.textContent.trim() ?? '',
            };
        },
        { ...ids, widgetId: WIDGET_ID },
    );
}

/** Wait until the page reaches a state, returning the last one read either way. */
async function waitForState(page: Page, ids: { actorId: string; effectId: string }, done: (s: ProbeState) => boolean): Promise<ProbeState> {
    let state = await readState(page, ids);
    const deadline = Date.now() + scaledMs(15_000);
    while (!done(state) && Date.now() < deadline) {
        // eslint-disable-next-line no-await-in-loop -- polling a settling world state
        await page.waitForTimeout(200);
        // eslint-disable-next-line no-await-in-loop -- polling a settling world state
        state = await readState(page, ids);
    }
    return state;
}

test.describe.serial('world-time widget undo (Tier B, #703)', () => {
    test.setTimeout(scaledMs(180_000));
    test('Undo takes back the last advance with the fatigue and effects it changed', async ({ page }) => {
        await joinOrSkip(page);
        await clearScreenOverlays(page);
        const failures: string[] = [];
        const passed = new Set<FlowName>();
        const ids = await setUp(page);
        try {
            const before = await readState(page, ids);
            const widget = page.locator(`#${WIDGET_ID}`);
            await widget.locator('[data-action="advanceHour"]').click();
            const advanced = await waitForState(
                page,
                ids,
                (s) => s.worldTime === before.worldTime + 3600 && s.record !== '' && s.effectExpired === true && s.undoDisabled === false,
            );
            if (advanced.fatigue !== START_FATIGUE - 1) failures.push(`after +1 hour fatigue is ${String(advanced.fatigue)}, expected ${START_FATIGUE - 1}`);
            if (advanced.effectExpired !== true) failures.push('the 30-minute effect did not run out over the hour');
            if (advanced.undoLabel !== 'Undo +1h') failures.push(`the Undo button reads "${advanced.undoLabel}"`);
            await clearScreenOverlays(page, WIDGET_ID);
            await snap(page, 'world-time-undo-available', { selector: `#${WIDGET_ID}` });

            await widget.locator('[data-action="undoAdvance"]').click();
            const undone = await waitForState(
                page,
                ids,
                (s) => s.worldTime === before.worldTime && s.fatigue === START_FATIGUE && s.effectExpired === false && s.undoDisabled === true,
            );
            if (undone.worldTime === before.worldTime) passed.add('undo-restores-clock');
            else failures.push(`after Undo the clock is ${undone.worldTime}, expected ${before.worldTime}`);
            if (undone.fatigue === START_FATIGUE) passed.add('undo-restores-fatigue');
            else failures.push(`after Undo fatigue is ${String(undone.fatigue)}, expected ${START_FATIGUE}`);
            if (undone.effectExpired === false) passed.add('undo-restores-effects');
            else failures.push('after Undo the timed effect is still expired');
            if (undone.record === '' && undone.undoDisabled === true) passed.add('undo-single-level');
            else failures.push(`after Undo the record is "${undone.record}" and the button disabled=${String(undone.undoDisabled)}`);
            await clearScreenOverlays(page, WIDGET_ID);
            await snap(page, 'world-time-undo-done', { selector: `#${WIDGET_ID}` });
        } finally {
            await page.evaluate(async (actorId: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as UndoGlobals;
                await g.game.actors.get(actorId)?.delete();
            }, ids.actorId);
        }

        for (const flow of WORLD_TIME_UNDO_FLOWS) {
            if (passed.has(flow)) recordCoverage('world-time-undo.flow', flow);
            else failures.push(`flow ${flow} did not pass`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
