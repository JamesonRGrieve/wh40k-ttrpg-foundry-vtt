/**
 * Storybook stories for the evasion prompt (`evasion-prompt-chat.hbs`, #414) — the
 * card whispered to a hit defender's owners and the GM: Dodge, Parry and Take the hit.
 *
 * Stories cover:
 *   1. RangedBurst      — a burst: Dodge and Take the hit open, Parry closed with its reason.
 *   2. MeleeFastWeapon  — a Fast melee weapon: Parry open, its penalty stated.
 *   3. Answered         — a prompt whose attack is answered renders closed.
 *   4. PerSystem        — the burst prompt under each of the six FFG lines.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { renderSheet } from '../../../stories/test-helpers';
import { closeEvasionPrompt } from '../../module/rolls/evasion-flow';
import cardSrc from './evasion-prompt-chat.hbs?raw';

type SystemId = 'bc' | 'dh1' | 'dh2' | 'dw' | 'ow' | 'rt';

interface PromptCtx {
    prompt: {
        attackId: string;
        attackerName: string;
        weaponName: string;
        defenderName: string;
        hitsLanded: number;
        parryPenalty: number;
    };
    parryBlocked: string;
    parryPenaltyNote: string;
    gameSystem?: SystemId;
}

const BURST: PromptCtx = {
    prompt: { attackId: 'atk-burst', attackerName: 'Cultist', weaponName: 'Autogun', defenderName: 'Lucius Varn', hitsLanded: 4, parryPenalty: 0 },
    parryBlocked: 'only a melee attack can be Parried',
    parryPenaltyNote: '',
};

const FAST_MELEE: PromptCtx = {
    prompt: { attackId: 'atk-melee', attackerName: 'Arbitrator', weaponName: 'Shock Maul', defenderName: 'Lucius Varn', hitsLanded: 1, parryPenalty: -20 },
    parryBlocked: '',
    parryPenaltyNote: 'Parrying Shock Maul',
};

function renderCard(ctx: PromptCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    if (ctx.gameSystem !== undefined) {
        wrapper.dataset['wh40kSystem'] = ctx.gameSystem;
        wrapper.classList.add('theme-dark');
    }
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

function buttons(canvasElement: HTMLElement): { dodge: HTMLButtonElement | null; parry: HTMLButtonElement | null; takeHit: HTMLButtonElement | null } {
    return {
        dodge: canvasElement.querySelector<HTMLButtonElement>('.roll-control__evade[data-skill="dodge"]'),
        parry: canvasElement.querySelector<HTMLButtonElement>('.roll-control__evade[data-skill="parry"]'),
        takeHit: canvasElement.querySelector<HTMLButtonElement>('.roll-control__take-hit'),
    };
}

const meta: Meta<PromptCtx> = {
    title: 'Chat / Evasion Prompt',
};
export default meta;
type Story = StoryObj<PromptCtx>;

export const RangedBurst: Story = {
    name: 'Burst — Dodge or take the hit; Parry closed',
    args: BURST,
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        const { dodge, parry, takeHit } = buttons(canvasElement);
        await expect(dodge?.disabled).toBe(false);
        await expect(takeHit?.disabled).toBe(false);
        await expect(parry?.disabled).toBe(true);
        await expect(canvasElement.querySelector('[data-parry-blocked]')?.textContent).toContain('only a melee attack can be Parried');
        await expect(canvasElement.querySelector('[data-evasion-prompt]')?.getAttribute('data-evasion-prompt')).toBe('atk-burst');
        await expect(canvasElement.textContent).toContain('Lucius Varn');
        // The plural form, not "hit(s)" (#414).
        await expect(canvasElement.textContent).toContain('Cultist hits with Autogun: 4 hits incoming');
    },
};

export const MeleeFastWeapon: Story = {
    name: 'Fast melee weapon — Parry open, its penalty stated',
    args: FAST_MELEE,
    render: (args) => renderCard(args),
    play: async ({ canvasElement }) => {
        const { parry } = buttons(canvasElement);
        await expect(parry?.disabled).toBe(false);
        const penalty = canvasElement.querySelector<HTMLElement>('[data-parry-penalty]');
        await expect(penalty?.textContent).toContain('Parrying Shock Maul');
        await expect(penalty?.textContent).toContain('-20');
        // One hit takes the singular form (#414).
        await expect(canvasElement.textContent).toContain('Arbitrator hits with Shock Maul: 1 hit incoming');
    },
};

export const Answered: Story = {
    name: 'Answered — every control closed',
    args: BURST,
    render: (args) => {
        const card = renderCard(args);
        closeEvasionPrompt(card, args.prompt.attackId, 'This attack has already been answered.');
        return card;
    },
    play: async ({ canvasElement }) => {
        const states = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>('button'), (button) => button.disabled);
        await expect(states).toEqual([true, true, true]);
        await expect(canvasElement.querySelector<HTMLElement>('[data-evasion-status]')?.hidden).toBe(false);
    },
};

export const PerSystem: Story = {
    name: 'Per system — the burst prompt under each line',
    args: BURST,
    render: (args) => {
        const grid = document.createElement('div');
        grid.classList.add('tw-grid', 'tw-gap-3');
        for (const gameSystem of ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'] as const) grid.appendChild(renderCard({ ...args, gameSystem }));
        return grid;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-evasion-prompt]').length).toBe(6);
    },
};
