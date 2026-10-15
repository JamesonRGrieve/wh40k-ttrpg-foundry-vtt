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
import { captureActionClicks, clickAction, renderSheet, renderSheetParts } from '../test-helpers';

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
    /** The actor's `system.psy` block, read by the psyker-controls footer (#194). */
    system?: { psy: { rating: number; currentRating: number; sustained: number; class: string; hasFocus: boolean } };
}

const PSY = { rating: 4, currentRating: 4, sustained: 1, class: 'bound', hasFocus: true };

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
    args: { psychicPowers: POWERS, psyRating: 4, showPsychicPanel: true, isGM: true, system: { psy: PSY } },
    play: async ({ canvasElement }) => {
        const body = within(canvasElement);
        // The psyker controls (#194): Phenomena and Perils send their roll actions; Sustained stays editable.
        const clicks = captureActionClicks(canvasElement);
        clickAction(canvasElement, 'rollPhenomena');
        clickAction(canvasElement, 'rollPerils');
        await expect(clicks.map((c) => c.action)).toEqual(['rollPhenomena', 'rollPerils']);
        await expect(canvasElement.querySelector<HTMLInputElement>('.wh40k-combat-psyker-controls [name="system.psy.sustained"]')?.value).toBe('1');
        // Psy Rating is build config: read-only outside the freeform bypass.
        await expect(canvasElement.querySelector('[name="system.psy.rating"]')).toBeNull();
        // Every power surfaces a row with an invoke (rollPower) control.
        // (The row itself also carries `rollPower`, so count the invoke buttons.)
        const invokeButtons = canvasElement.querySelectorAll('button[data-action="rollPower"]');
        await expect(invokeButtons.length).toBe(POWERS.length);
        // Focus test + discipline are visible.
        await expect(body.getByText('Smite')).toBeTruthy();
        await expect(body.getAllByText('Willpower').length).toBeGreaterThan(0);
    },
};

export const NoPowers: Story = {
    name: 'Empty state (psyker without powers) — the Perils / Phenomena controls still show',
    args: { psychicPowers: [], psyRating: 3, showPsychicPanel: true, isGM: true, system: { psy: { ...PSY, rating: 3, currentRating: 3 } } },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-action="rollPower"]').length).toBe(0);
        await expect(canvasElement.querySelector('[data-action="rollPerils"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-action="rollPhenomena"]')).not.toBeNull();
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
        await expect(canvasElement.querySelectorAll('button[data-action="rollPower"]').length).toBe(POWERS.length);
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

const PSYCHIC_LINES = ['dh1', 'dh2', 'rt', 'bc', 'dw', 'ow'] as const;

/** Whether a button's box overlaps the PR cost cell of its row. */
function prCovered(row: Element): boolean {
    const pr = row.querySelector('[data-wh40k-hook="psychic-power-pr"]')?.getBoundingClientRect();
    if (pr === undefined) return true;
    return [...row.querySelectorAll('button')].some((button) => {
        const b = button.getBoundingClientRect();
        return b.left < pr.right && b.right > pr.left && b.top < pr.bottom && b.bottom > pr.top;
    });
}

/**
 * #412: the invoke and delete buttons have their own column, so they never cover the
 * PR cost (they used to float over it on hover). Buttons take their space even while
 * hidden, so the layout is asserted without a hover, on every line.
 */
export const ActionsNeverCoverPrCost: Story = {
    name: 'Invoke / delete buttons never cover the PR cost',
    args: { psychicPowers: POWERS, psyRating: 4, showPsychicPanel: true, isGM: true, system: { psy: PSY } },
    render: (args) => {
        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
        row.style.gap = '12px';
        for (const line of PSYCHIC_LINES) row.appendChild(renderSheetParts([{ template: psychicPanelSrc }], args, { systemId: line }));
        return row;
    },
    play: async ({ canvasElement }) => {
        const rows = [...canvasElement.querySelectorAll('[data-item-type="psychicPower"]')];
        await expect(rows).toHaveLength(PSYCHIC_LINES.length * POWERS.length);
        await expect(rows.filter(prCovered)).toHaveLength(0);
        // Each row's buttons sit in its own action cell, in the flow rather than absolutely positioned.
        await expect(rows.filter((row) => row.querySelectorAll('[data-wh40k-hook="psychic-power-actions"] button').length !== 2)).toHaveLength(0);
    },
};
