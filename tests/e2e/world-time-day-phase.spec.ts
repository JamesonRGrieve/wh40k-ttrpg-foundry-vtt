import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the day-phase label in the In-Universe Time widget (#593,
 * src/module/applications/hud/world-time-widget.ts + rules/scene-lighting.ts
 * `dayPhase`). The world clock is moved to the local hours that fall in each phase
 * of a Terran-standard day (no celestial body configured), and the widget's phase
 * line must name that phase, re-rendering as the clock advances. Each phase is
 * captured for visual review.
 *
 * Each flow records under `world-time.flow`. Keys MUST match WORLD_TIME_FLOWS in
 * scripts/e2e-coverage.mjs.
 */

const WORLD_TIME_FLOWS = ['phase-label-renders', 'phase-follows-clock'] as const;

type FlowName = (typeof WORLD_TIME_FLOWS)[number];

/** A local hour inside each phase of a 24-hour day, from the sun curve's band edges. */
const PHASE_HOURS: ReadonlyArray<{ phase: string; hour: number }> = [
    { phase: 'night', hour: 1 },
    { phase: 'dawn', hour: 6 },
    { phase: 'morning', hour: 9 },
    { phase: 'midday', hour: 12 },
    { phase: 'afternoon', hour: 15 },
    { phase: 'dusk', hour: 18 },
    { phase: 'evening', hour: 19 },
];

const WIDGET_ID = 'wh40k-world-time-widget';
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

interface PhaseView {
    phase: string | null;
    label: string;
    /** The widget's day counter text. */
    day: string;
    /** Whole days since inception: the stored, 0-based day index. */
    dayIndex: number;
}

interface WidgetGlobals {
    game: {
        time: { worldTime: number; advance: (seconds: number) => Promise<number> };
        settings: {
            get: (ns: string, key: string) => object | number | string | boolean;
            set: (ns: string, key: string, v: object | number | string | boolean) => Promise<object | number | string | boolean>;
        };
    };
}

/** Clear any configured celestial bodies so the widget shows a Terran-standard day; returns what was set. */
async function useTerranDay(page: Page): Promise<object> {
    return page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as WidgetGlobals;
        const before = g.game.settings.get('wh40k-rpg', 'celestial-bodies') as object;
        await g.game.settings.set('wh40k-rpg', 'celestial-bodies', {});
        return before;
    });
}

async function restoreBodies(page: Page, bodies: object): Promise<void> {
    await page.evaluate(async (b: object) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as WidgetGlobals;
        await g.game.settings.set('wh40k-rpg', 'celestial-bodies', b);
    }, bodies);
}

/** Advance the world clock forward to the next moment at `hour` local time, open the widget, and read its phase line. */
async function showHour(page: Page, hour: number): Promise<PhaseView> {
    return page.evaluate(
        async (args: { hour: number; perHour: number; perDay: number; widgetId: string }): Promise<PhaseView> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as WidgetGlobals;
            const { waitFor, scaledMs: scale } = globalThis.wh40kE2E;
            const inceptionRaw = g.game.settings.get('wh40k-rpg', 'world-time-inception');
            const inception = typeof inceptionRaw === 'number' ? inceptionRaw : 0;
            const elapsed = g.game.time.worldTime - inception;
            const intoDay = ((elapsed % args.perDay) + args.perDay) % args.perDay;
            let delta = args.hour * args.perHour - intoDay;
            if (delta <= 0) delta += args.perDay;
            await g.game.time.advance(delta);
            // The served system module (a runtime URL, not a source path), so the open widget is the system's own singleton.
            const moduleRoot = '/systems/wh40k-rpg/module';
            const widgetModule = (await import(/* @vite-ignore */ `${moduleRoot}/applications/hud/world-time-widget.js`)) as {
                default: { show: () => object };
            };
            widgetModule.default.show();
            const phaseEl = (): HTMLElement | null => document.querySelector<HTMLElement>(`#${args.widgetId} [data-wh40k-hook="wt-phase"]`);
            const target = args.hour;
            await waitFor(
                () => {
                    const clock = document.querySelector(`#${args.widgetId}`)?.textContent ?? '';
                    return phaseEl() !== null && clock.includes(`${String(target).padStart(2, '0')}:00`);
                },
                `world-time widget at ${target}:00`,
                scale(10_000),
            );
            const el = phaseEl();
            return {
                phase: el?.dataset['dayPhase'] ?? null,
                label: el?.textContent.trim() ?? '',
                day: document.querySelector(`#${args.widgetId} [data-wh40k-hook="wt-day"]`)?.textContent.trim() ?? '',
                dayIndex: Math.floor((g.game.time.worldTime - inception) / args.perDay),
            };
        },
        { hour, perHour: SECONDS_PER_HOUR, perDay: SECONDS_PER_DAY, widgetId: WIDGET_ID },
    );
}

test.describe.serial('world-time widget day phase (Tier B, #593)', () => {
    test.setTimeout(scaledMs(180_000));
    test('the widget names the phase of the local day as the clock moves', async ({ page }) => {
        await joinOrSkip(page);
        await clearScreenOverlays(page);
        const failures: string[] = [];
        const passed = new Set<FlowName>();
        const bodies = await useTerranDay(page);
        try {
            const seen: PhaseView[] = [];
            for (const { phase, hour } of PHASE_HOURS) {
                // eslint-disable-next-line no-await-in-loop -- sequential by design: each phase is one clock position, captured in turn
                const view = await showHour(page, hour);
                seen.push(view);
                if (view.phase !== phase) failures.push(`at ${hour}:00 the widget shows phase ${String(view.phase)}, expected ${phase}`);
                if (view.label === '') failures.push(`at ${hour}:00 the phase line is empty`);
                // #701: the first day is Day 1, so the counter reads one more than the stored day index.
                if (view.day !== `Day ${view.dayIndex + 1}`) failures.push(`at ${hour}:00 the counter reads "${view.day}" on day index ${view.dayIndex}`);
                // eslint-disable-next-line no-await-in-loop -- sequential by design: overlays cleared before each capture
                await clearScreenOverlays(page, WIDGET_ID);
                // eslint-disable-next-line no-await-in-loop -- sequential by design: one capture per phase
                await snap(page, `world-time-phase-${phase}`, { selector: `#${WIDGET_ID}` });
            }
            if (seen.every((v) => v.label !== '' && v.phase !== null)) passed.add('phase-label-renders');
            if (new Set(seen.map((v) => v.phase)).size === PHASE_HOURS.length && failures.length === 0) passed.add('phase-follows-clock');
        } finally {
            await restoreBodies(page, bodies);
        }

        // #701: at world start (no time elapsed since inception) the counter reads Day 1, not Day 0.
        // The inception stamp is moved to now for the check and put back after.
        const atStart = await page.evaluate(async (widgetId: string) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as WidgetGlobals;
            const before = g.game.settings.get('wh40k-rpg', 'world-time-inception');
            await g.game.settings.set('wh40k-rpg', 'world-time-inception', g.game.time.worldTime);
            const dayEl = (): string => document.querySelector(`#${widgetId} [data-wh40k-hook="wt-day"]`)?.textContent.trim() ?? '';
            // A miss is reported by the assertion below, with the counter's text.
            await globalThis.wh40kE2E.pollUntil(() => dayEl() === 'Day 1').catch(() => undefined);
            return { day: dayEl(), before };
        }, WIDGET_ID);
        try {
            expect(atStart.day, 'the counter at world start').toBe('Day 1');
            await clearScreenOverlays(page, WIDGET_ID);
            await snap(page, 'world-time-day-1-at-start', { selector: `#${WIDGET_ID}` });
        } finally {
            await page.evaluate(async (before: object | number | string | boolean) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as WidgetGlobals;
                await g.game.settings.set('wh40k-rpg', 'world-time-inception', before);
            }, atStart.before);
        }

        for (const flow of WORLD_TIME_FLOWS) {
            if (passed.has(flow)) recordCoverage('world-time.flow', flow);
            else failures.push(`flow ${flow} did not pass`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });

    test('the Celestial Bodies & Weather button label fits on one line (#473)', async ({ page }) => {
        await joinOrSkip(page);
        await clearScreenOverlays(page);
        await showHour(page, 12);
        const button = await page.evaluate((widgetId) => {
            const el = document.querySelector<HTMLElement>(`#${widgetId} [data-action="editBodies"]`);
            const label = el?.querySelector('span') ?? null;
            if (el === null || label === null) return null;
            const style = getComputedStyle(el);
            const lineHeight = Number.isNaN(parseFloat(style.lineHeight)) ? parseFloat(style.fontSize) * 1.2 : parseFloat(style.lineHeight);
            return {
                text: label.textContent.trim(),
                lines: label.getClientRects().length,
                truncated: label.scrollWidth > label.clientWidth,
                // The button's content box holds one line of its text.
                oneLine: el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) < lineHeight * 1.5,
                tooltip: el.dataset['tooltip'] ?? null,
            };
        }, WIDGET_ID);
        expect(button).toEqual({ text: 'Bodies & Weather', lines: 1, truncated: false, oneLine: true, tooltip: 'Celestial Bodies & Weather' });
        await clearScreenOverlays(page, WIDGET_ID);
        await snap(page, 'world-time-celestial-bodies-button', { selector: `#${WIDGET_ID}` });
    });
});
