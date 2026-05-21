/**
 * Storybook stories for the Only War Comrade Healing panel
 * (#157 — core.md §"Healing Comrades" p.12269; replacement p.12261).
 *
 * Three visual states an operator needs to verify:
 *
 *   1. Wounded mid-recovery — yellow badge, 5 days remaining of the
 *      RAW 7-day clock, refit unavailable, Tick Day + Medicae enabled,
 *      Replace disabled.
 *   2. Wounded after Medicae — yellow badge, the Medicae attempt
 *      shaved DoS off the clock, refit still unavailable.
 *   3. Dead at camp — green Ready badge cleared, Replace button
 *      enabled because state is dead AND refit is in reach.
 *
 * Every value is fixed for diff stability (no Math.random); recovery
 * arithmetic is resolved through the canonical rules module so any
 * change to the 7-day auto-recovery / Medicae DoS reduction surfaces
 * here first.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import type { ComradeState } from '../../../module/rules/ow-comrade';
import {
    applyMedicaeAttempt,
    OW_COMRADE_AUTO_RECOVERY_DAYS,
    OW_COMRADE_MEDICAE_DIFFICULTY_MODIFIER,
    tickComradeRecovery,
} from '../../../module/rules/ow-comrade-healing';
import panelSrc from './ow-comrade-healing-panel.hbs?raw';

initializeStoryHandlebars();

interface ComradeHealingPanelCtx {
    comradeHealingPanel: {
        recoveryDays: number;
        autoRecoveryTotal: number;
        refitAvailable: boolean;
        comradeState: ComradeState;
        isRecovering: boolean;
        isReady: boolean;
        canTick: boolean;
        canMedicae: boolean;
        canReplace: boolean;
        medicaeDifficulty: number;
    };
}

function buildContext(opts: { recoveryDays: number; refitAvailable: boolean; comradeState: ComradeState }): ComradeHealingPanelCtx {
    const isRecovering = opts.recoveryDays > 0;
    const isReady = !isRecovering && opts.comradeState === 'unharmed';
    const isDead = opts.comradeState === 'dead';
    return {
        comradeHealingPanel: {
            recoveryDays: opts.recoveryDays,
            autoRecoveryTotal: OW_COMRADE_AUTO_RECOVERY_DAYS,
            refitAvailable: opts.refitAvailable,
            comradeState: opts.comradeState,
            isRecovering,
            isReady,
            canTick: isRecovering,
            canMedicae: isRecovering,
            canReplace: isDead && opts.refitAvailable,
            medicaeDifficulty: OW_COMRADE_MEDICAE_DIFFICULTY_MODIFIER,
        },
    };
}

const panelTpl = HandlebarsLib.compile(panelSrc);

function renderPanel(ctx: ComradeHealingPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderStoryTemplate(panelTpl, ctx));
    return wrapper;
}

const meta: Meta<ComradeHealingPanelCtx> = {
    title: 'Actor/Character/OwComradeHealingPanel',
};
export default meta;
type Story = StoryObj<ComradeHealingPanelCtx>;

// Story 1 — wounded mid-recovery: tick the 7-day clock down by 2.
const midRecovery = tickComradeRecovery({ remainingDays: OW_COMRADE_AUTO_RECOVERY_DAYS, daysElapsed: 2 });

export const WoundedMidRecovery: Story = {
    name: 'Wounded — 5 days remaining on the 7-day auto-recovery clock',
    args: buildContext({ recoveryDays: midRecovery.remainingDays, refitAvailable: false, comradeState: 'wounded' }),
    render: (args) => renderPanel(args),
};

// Story 2 — Medicae attempt with 3 DoS shaves 3 days off the clock.
const afterMedicae = applyMedicaeAttempt({ remainingDays: midRecovery.remainingDays, degreesOfSuccess: 3 });

export const WoundedAfterMedicae: Story = {
    name: 'Wounded — Medicae(-10) shaved 3 DoS off recovery',
    args: buildContext({ recoveryDays: afterMedicae.remainingDays, refitAvailable: false, comradeState: 'wounded' }),
    render: (args) => renderPanel(args),
};

export const DeadAtCampReplaceReady: Story = {
    name: 'Dead at camp — refit available, Replace button enabled',
    args: buildContext({ recoveryDays: 0, refitAvailable: true, comradeState: 'dead' }),
    render: (args) => renderPanel(args),
};
