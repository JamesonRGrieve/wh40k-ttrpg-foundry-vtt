/**
 * Storybook stories for the Only War Comrade Healing panel (#157 — OW
 * Healing Comrades and replacement on return to camp).
 *
 *   1. Wounded mid-recovery — yellow badge, 5 of 7 days left, Tick Day and
 *      Medicae enabled, Replace disabled.
 *   2. Wounded after Medicae — the attempt is spent, so Medicae is disabled.
 *   3. Ready — green badge, recovery complete, nothing to tick.
 *   4. Dead at camp — red badge, refit available, Replace enabled.
 *
 * Each context is built by `buildComradeHealingPanel` — the builder the
 * character sheet passes through — so a value it leaves out shows here as
 * "undefined" text, which the plays reject.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { captureActionClicks, clickAction, renderSheet } from '../../../../stories/test-helpers';
import {
    applyMedicaeAttempt,
    buildComradeHealingPanel,
    type ComradeHealingPanelView,
    type ComradeHealingRecord,
    OW_COMRADE_AUTO_RECOVERY_DAYS,
    tickComradeRecovery,
} from '../../../module/rules/ow-comrade-healing';
import panelSrc from './ow-comrade-healing-panel.hbs?raw';

initializeStoryHandlebars();

interface ComradeHealingPanelCtx {
    comradeHealingPanel: ComradeHealingPanelView;
}

function buildContext(record: ComradeHealingRecord): ComradeHealingPanelCtx {
    return { comradeHealingPanel: buildComradeHealingPanel(record) };
}

function renderPanel(ctx: ComradeHealingPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

/** The enabled state of Tick Day / Medicae / Replace, in that order. */
function enabled(root: HTMLElement): boolean[] {
    return ['owComradeTickDay', 'owComradeMedicae', 'owComradeReplace2'].map(
        (action) => root.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`)?.disabled === false,
    );
}

async function expectAllDefined(root: HTMLElement): Promise<void> {
    await expect(root.textContent).not.toContain('undefined');
    await expect(root.querySelector('[data-field="recovery-days"]')?.textContent).toContain('Auto-recovery: 7 days');
}

const meta: Meta<ComradeHealingPanelCtx> = {
    title: 'Actor/Character/OwComradeHealingPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<ComradeHealingPanelCtx>;

// Two days of rest off the seven-day clock.
const midRecovery = tickComradeRecovery({ remainingDays: OW_COMRADE_AUTO_RECOVERY_DAYS, daysElapsed: 2 });

export const WoundedMidRecovery: Story = {
    name: 'Wounded — 5 days remaining on the 7-day auto-recovery clock',
    args: buildContext({ state: 'wounded', recoveryDays: midRecovery.remainingDays, refitAvailable: false, medicaeUsed: false }),
    play: async ({ canvasElement }) => {
        await expectAllDefined(canvasElement);
        await expect(canvasElement.querySelector<HTMLElement>('[data-recovery-status]')?.dataset['recoveryStatus']).toBe('recovering');
        await expect(canvasElement.querySelector('[data-remaining-days]')?.textContent).toContain('5 days until recovery');
        await expect(enabled(canvasElement)).toEqual([true, true, false]);
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'owComradeTickDay');
        clickAction(canvasElement, 'owComradeToggleRefit');
        await expect(clicks.map((c) => c.action)).toEqual(['owComradeTickDay', 'owComradeToggleRefit']);
    },
};

// The wound's one Medicae Test, with 3 Degrees of Success.
const afterMedicae = applyMedicaeAttempt({ remainingDays: midRecovery.remainingDays, degreesOfSuccess: 3 });

export const WoundedAfterMedicae: Story = {
    name: 'Wounded — the one Medicae(-10) attempt is spent',
    args: buildContext({ state: 'wounded', recoveryDays: afterMedicae.remainingDays, refitAvailable: false, medicaeUsed: true }),
    play: async ({ canvasElement }) => {
        await expectAllDefined(canvasElement);
        await expect(enabled(canvasElement)).toEqual([true, false, false]);
        await expect(canvasElement.querySelector('[data-action="owComradeMedicae"]')?.getAttribute('title')).toBe(
            "This wound's one Medicae Test has been made",
        );
    },
};

export const Ready: Story = {
    name: 'Ready — recovered, nothing to tick',
    args: buildContext({ state: 'unharmed', recoveryDays: 0, refitAvailable: false, medicaeUsed: false }),
    play: async ({ canvasElement }) => {
        await expectAllDefined(canvasElement);
        await expect(canvasElement.querySelector('[data-recovery-status]')?.textContent.trim()).toBe('Comrade ready for duty');
        await expect(enabled(canvasElement)).toEqual([false, false, false]);
    },
};

export const DeadAtCampReplaceReady: Story = {
    name: 'Dead at camp — refit available, Replace button enabled',
    args: buildContext({ state: 'dead', recoveryDays: 0, refitAvailable: true, medicaeUsed: false }),
    play: async ({ canvasElement }) => {
        await expectAllDefined(canvasElement);
        await expect(canvasElement.querySelector<HTMLElement>('[data-recovery-status]')?.dataset['recoveryStatus']).toBe('dead');
        await expect(canvasElement.querySelector('[data-action="owComradeToggleRefit"]')?.getAttribute('aria-pressed')).toBe('true');
        await expect(enabled(canvasElement)).toEqual([false, false, true]);
    },
};
