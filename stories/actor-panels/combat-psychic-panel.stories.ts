/**
 * Storybook stories for the combat-panel Psychic Powers list (#412) and the
 * equipped-weapon hand budget (#418).
 *
 * The psychic panel mirrors the arsenal weapon-row pattern: one row per known
 * power with its discipline, Focus Power test, and PR cost, plus an invoke
 * control (the `rollPower` action) that opens the existing per-line psychic roll
 * (targeting + Fettered/Unfettered/Push level + effective PR). The hand-budget
 * badge is exercised through the weapons-panel header in the composed story.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import psychicPanelSrc from '../../src/templates/actor/panel/combat-psychic-panel.hbs?raw';
import { renderSheet, renderSheetParts } from '../test-helpers';

interface PsychicPowerRow {
    id: string;
    name: string;
    img: string | null;
    disciplineLabel: string;
    focusTestLabel: string;
    prCost: number;
    isAttack: boolean;
    identified: boolean;
}

interface PsychicPanelContext {
    psychicPowers: PsychicPowerRow[];
    psyRating?: number;
    showPsychicPanel: boolean;
    isGM: boolean;
}

const POWERS: PsychicPowerRow[] = [
    { id: 'pwr-smite', name: 'Smite', img: null, disciplineLabel: 'Telekinesis', focusTestLabel: 'Willpower', prCost: 4, isAttack: true, identified: true },
    {
        id: 'pwr-fearful',
        name: 'Fearful Aura',
        img: null,
        disciplineLabel: 'Divination',
        focusTestLabel: 'Willpower +10',
        prCost: 2,
        isAttack: false,
        identified: true,
    },
    {
        id: 'pwr-precog',
        name: 'Precognition',
        img: null,
        disciplineLabel: 'Divination',
        focusTestLabel: 'Perception',
        prCost: 1,
        isAttack: false,
        identified: true,
    },
];

function renderPanel(ctx: PsychicPanelContext): HTMLElement {
    return renderSheet(psychicPanelSrc, ctx);
}

const meta: Meta<PsychicPanelContext> = {
    id: 'actor-panels-combatpsychicpanel',
    title: 'Actor/Panels/CombatPsychicPanel',
    render: (args) => renderPanel(args),
};
export default meta;
type Story = StoryObj<PsychicPanelContext>;

export const Default: Story = {
    name: 'Known powers with invoke controls',
    args: { psychicPowers: POWERS, psyRating: 4, showPsychicPanel: true, isGM: true },
    play: async ({ canvasElement }) => {
        const body = within(canvasElement);
        // Every power surfaces a row with an invoke (rollPower) control.
        const invokeButtons = canvasElement.querySelectorAll('[data-action="rollPower"]');
        await expect(invokeButtons.length).toBe(POWERS.length);
        // Focus test + discipline are visible.
        await expect(body.getByText('Smite')).toBeTruthy();
        await expect(body.getAllByText('Willpower').length).toBeGreaterThan(0);
    },
};

export const NoPowers: Story = {
    name: 'Empty state (psyker without powers)',
    args: { psychicPowers: [], psyRating: 3, showPsychicPanel: true, isGM: true },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-action="rollPower"]').length).toBe(0);
    },
};

export const UnidentifiedForPlayer: Story = {
    name: 'Unidentified power hides Focus/PR from players',
    args: {
        psychicPowers: [{ ...POWERS[0], identified: false }],
        psyRating: 4,
        showPsychicPanel: true,
        isGM: false,
    },
};

/**
 * The arsenal header hand-budget badge (#418) rendered above the psychic rows,
 * mimicking the combat-station stacking. The badge markup mirrors the inline
 * span in `combat-station-panel.hbs`; the `overCommitted` red state fires when
 * equipped weapons exceed the actor's hands.
 */
const HAND_BUDGET_HEADER = `
<div class="wh40k-panel-header tw-order-[-1] tw-shrink-0 tw-flex tw-items-center">
    {{> systems/wh40k-rpg/templates/actor/partial/panel-header.hbs label=(localize "WH40K.Combat.Weapons") icon="fa-fist-raised"}}
    {{#if handBudget}}
    <span class="tw-ml-auto tw-shrink-0 tw-flex tw-items-center tw-gap-1 tw-px-2 tw-py-0.5 tw-rounded-full tw-text-[0.65rem] tw-font-bold tw-uppercase tw-tracking-wide tw-border tw-border-solid {{#if handBudget.overCommitted}}tw-bg-[rgb(from_var(--wh40k-accent-combat)_r_g_b_/_0.12)] tw-text-[color:var(--wh40k-accent-combat)] tw-border-[rgb(from_var(--wh40k-accent-combat)_r_g_b_/_0.3)]{{else}}tw-bg-[rgba(0,0,0,0.06)] tw-text-[color:var(--wh40k-text-secondary)] tw-border-[rgba(0,0,0,0.15)]{{/if}}" title="{{localize "WH40K.Combat.HandBudgetTooltip"}}" data-testid="hand-budget">
        <i class="fas fa-hand-paper tw-text-[0.7rem]"></i>
        {{localize "WH40K.Combat.Hands"}} {{handBudget.remaining}}/{{handBudget.available}}
    </span>
    {{/if}}
</div>`;

export const WithHandBudget: Story = {
    name: 'Arsenal hand budget + psychic rows (composed)',
    args: { psychicPowers: POWERS, psyRating: 4, showPsychicPanel: true, isGM: true },
    render: (args) =>
        renderSheetParts(
            [
                { template: HAND_BUDGET_HEADER, context: { handBudget: { available: 2, used: 1, remaining: 1, overCommitted: false } } },
                { template: psychicPanelSrc, context: args },
            ],
            {},
            { systemId: 'dh2' },
        ),
    play: async ({ canvasElement }) => {
        const badge = canvasElement.querySelector('[data-testid="hand-budget"]');
        await expect(badge?.textContent).toContain('1/2');
        await expect(canvasElement.querySelectorAll('[data-action="rollPower"]').length).toBe(POWERS.length);
    },
};

export const HandBudgetOverCommitted: Story = {
    name: 'Arsenal hand budget over-committed (red)',
    args: { psychicPowers: [], psyRating: 4, showPsychicPanel: false, isGM: true },
    render: (args) =>
        renderSheetParts([{ template: HAND_BUDGET_HEADER, context: { handBudget: { available: 2, used: 4, remaining: 0, overCommitted: true } } }], args, {
            systemId: 'rt',
        }),
    play: async ({ canvasElement }) => {
        const badge = canvasElement.querySelector('[data-testid="hand-budget"]');
        await expect(badge?.textContent).toContain('0/2');
        await expect(badge?.className).toContain('accent-combat');
    },
};
