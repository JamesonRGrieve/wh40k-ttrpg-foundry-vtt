/**
 * Storybook stories for the Overview Vitals panel (`overview-vitals-panel.hbs`):
 * the Fate row's pips, Restore and Burn controls (#42) and the queued Malignancy
 * Test button under Corruption (35092c9ab).
 *
 * The Malignancy stories derive `malignancyTestsDue` the way the sheet does —
 * zero on a line whose config does not opt into the Corruption Track's tests —
 * so a line that drops or gains the flag shows up here.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { SystemConfigRegistry } from '../../src/module/config/game-systems';
import type { GameSystemId } from '../../src/module/config/game-systems/types';
import vitalsSrc from '../../src/templates/actor/panel/overview-vitals-panel.hbs?raw';
import { mockPlayerSheetContext } from '../mocks/sheet-contexts';
import { captureActionClicks, renderSheet } from '../test-helpers';

/** The lines the stories render, each with the same queued count. */
const LINES: readonly GameSystemId[] = ['dh2', 'dh1', 'ow', 'rt', 'bc', 'dw'];

/** Corruption tests a fresh gain has queued in these stories. */
const QUEUED_TESTS = 2;

interface VitalsArgs {
    systemId: GameSystemId;
    fate: { value: number; max: number };
    corruption: number;
    queued: number;
    /** Wounds state; the default leaves the actor's mock wounds alone. */
    wounds?: { value: number; max: number; critical: number };
}

/** What the sheet writes into `malignancyTestsDue`: the queue, or 0 on a line without the tests. */
function malignancyTestsDue(systemId: GameSystemId, queued: number): number {
    return SystemConfigRegistry.get(systemId).usesMalignancyTest ? queued : 0;
}

function renderVitals(args: VitalsArgs): HTMLElement {
    const context = mockPlayerSheetContext({
        systemId: args.systemId,
        activeTab: 'overview',
        actorOverrides: { system: { fate: args.fate, corruption: args.corruption, ...(args.wounds === undefined ? {} : { wounds: args.wounds }) } },
        contextOverrides: { malignancyTestsDue: malignancyTestsDue(args.systemId, args.queued) },
    });
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg', 'theme-dark');
    wrapper.dataset['wh40kSystem'] = args.systemId;
    wrapper.style.maxWidth = '360px';
    wrapper.appendChild(renderSheet(vitalsSrc, context));
    return wrapper;
}

const meta = {
    id: 'actor-panels-overviewvitalspanel',
    title: 'Actor/Panels/OverviewVitalsPanel',
    render: (args) => renderVitals(args),
    args: { systemId: 'dh2', fate: { value: 2, max: 3 }, corruption: 12, queued: 0 },
} satisfies Meta<VitalsArgs>;
export default meta;
type Story = StoryObj<VitalsArgs>;

/** Fate row: one pip per point of the total, Restore, and the Burn control (#42). */
export const FateRow: Story = {
    play: async ({ canvasElement }) => {
        const pips = canvasElement.querySelectorAll('[data-action="setFateStar"]');
        await expect(pips.length).toBe(3);
        await expect(canvasElement.querySelector('[data-action="restoreFate"]')).not.toBeNull();
        const burn = canvasElement.querySelector<HTMLButtonElement>('[data-action="spendFate"][data-fate-action="burn"]');
        await expect(burn).not.toBeNull();
        await expect(burn?.getAttribute('aria-label')).toBeTruthy();

        const seen = captureActionClicks(canvasElement);
        burn?.click();
        await expect(seen.map((click) => [click.action, click.dataset['fateAction']])).toEqual([['spendFate', 'burn']]);
    },
};

/** Every point spent: the pips stay (the total is unchanged) and Burn is still offered, as RAW allows. */
export const FateSpentStillBurnable: Story = {
    args: { fate: { value: 0, max: 2 } },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-action="setFateStar"]').length).toBe(2);
        await expect(canvasElement.querySelector('[data-fate-action="burn"]')).not.toBeNull();
    },
};

/** No Fate total (all burnt): the whole row is gone, so nothing can be burnt. */
export const NoFateTotal: Story = {
    args: { fate: { value: 0, max: 0 } },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-action="setFateStar"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-fate-action="burn"]')).toBeNull();
    },
};

/** A Corruption gain queued two Malignancy Tests on DH2: the owed count is a roll button. */
export const MalignancyQueuedDH2: Story = {
    args: { corruption: 24, queued: QUEUED_TESTS },
    play: async ({ canvasElement }) => {
        const button = canvasElement.querySelector<HTMLButtonElement>('[data-action="rollMalignancyTest"]');
        await expect(button).not.toBeNull();
        await expect(within(canvasElement).getByText(/Malignancy Tests due: 2/)).toBeTruthy();
        const seen = captureActionClicks(canvasElement);
        button?.click();
        await expect(seen.map((click) => click.action)).toEqual(['rollMalignancyTest']);
    },
};

/**
 * The same queue on every line: the lines whose config opts into the Corruption
 * Track's tests (DH2, DH1, OW, RT) show the button; Black Crusade and Deathwatch
 * do not test for Malignancies, so theirs is absent.
 */
export const MalignancyAcrossLines: Story = {
    render: () => {
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(3, 360px)';
        grid.style.gap = '12px';
        for (const systemId of LINES) {
            const cell = renderVitals({ systemId, fate: { value: 1, max: 2 }, corruption: 24, queued: QUEUED_TESTS });
            cell.dataset['line'] = systemId;
            grid.appendChild(cell);
        }
        return grid;
    },
    play: async ({ canvasElement }) => {
        const shown = Object.fromEntries(
            LINES.map((systemId) => [systemId, canvasElement.querySelector(`[data-line="${systemId}"] [data-action="rollMalignancyTest"]`) !== null]),
        );
        const expected = Object.fromEntries(LINES.map((systemId) => [systemId, SystemConfigRegistry.get(systemId).usesMalignancyTest]));
        await expect(shown).toEqual(expected);
        await expect(canvasElement.querySelector('[data-line="bc"] [data-action="rollMalignancyTest"]')).toBeNull();
        await expect(canvasElement.querySelector('[data-line="dh2"] [data-action="rollMalignancyTest"]')).not.toBeNull();
    },
};

/** `tw-text-crimson-l40` (tailwind.config.js `crimson.l40`, #ff5a5a): danger text on every line (#685). */
const DANGER_CRIMSON = 'rgb(255, 90, 90)';
/** Critical damage taken in the critical-wounds stories. */
const CRITICAL_TAKEN = 3;

/**
 * At 0 wounds with critical damage the Critical row shows; each pip up to the damage
 * taken is filled crimson on every line, not the line's accent.
 */
function criticallyWounded(systemId: GameSystemId): Story {
    return {
        args: { systemId, wounds: { value: 0, max: 12, critical: CRITICAL_TAKEN } },
        play: async ({ canvasElement }) => {
            const pips = [...canvasElement.querySelectorAll<HTMLElement>('[data-action="setCriticalPip"]')];
            await expect(pips.length).toBe(10);
            const filled = pips.slice(0, CRITICAL_TAKEN).map((pip) => getComputedStyle(pip).color);
            await expect(filled.every((colour) => colour === DANGER_CRIMSON)).toBe(true);
            await expect(getComputedStyle(pips[CRITICAL_TAKEN] ?? pips[0]).color).not.toBe(DANGER_CRIMSON);
        },
    };
}

export const CriticallyWoundedDH2: Story = criticallyWounded('dh2');
export const CriticallyWoundedRT: Story = criticallyWounded('rt');
