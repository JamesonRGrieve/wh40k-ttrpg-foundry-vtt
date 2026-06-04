import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { resolveTwoWeaponRefocus, type TwoWeaponRefocusContext, type TwoWeaponRefocusPlan } from '../../src/module/rules/two-weapon-fighting.ts';
import refocusChatSrc from '../../src/templates/chat/two-weapon-refocus-chat.hbs?raw';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Two-Weapon Wielder errata p. 132 refocus chat card (#147 —
 * errata/errata.md L67). Verifies the card renders the structured
 * two-Half-Action plan: the main-hand Half-Action opener plus the
 * same-mode Free-Action off-hand follow-up that the
 * `resolveTwoWeaponRefocus` resolver produces. Ranged single-shot
 * must surface a Standard Attack ×2, NOT a Full-Action lump.
 */
initializeStoryHandlebars();

interface TwoWeaponRefocusChatContext {
    gameSystem: string;
    granted: TwoWeaponRefocusPlan['granted'];
    attacks: TwoWeaponRefocusPlan['attacks'];
}

function cardContext(ctx: TwoWeaponRefocusContext, gameSystem = 'dh2'): TwoWeaponRefocusChatContext {
    const plan = resolveTwoWeaponRefocus(ctx);
    return {
        gameSystem,
        granted: plan.granted,
        attacks: plan.attacks,
    };
}

const meta: Meta = {
    title: 'Chat/Two-Weapon Refocus (#147)',
};

export default meta;

type Story = StoryObj;

export const RangedSingleShotWielder: Story = {
    name: 'Ranged Wielder — single shot Half-Action ×2',
    render: () => renderSheet(refocusChatSrc, cardContext({ isMelee: false, mode: 'Standard Attack', talents: new Set(['Two-Weapon Wielder (Ranged)']) })),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Two Standard Attack rows render (main Half + off Free).
        await expect(view.getAllByText(/Standard Attack/).length).toBe(2);
        // Action economy is Half + Free, never a Full-Action lump.
        await expect(view.getByText(/\(Half\)/)).toBeTruthy();
        await expect(view.getByText(/\(Free\)/)).toBeTruthy();
        // Per-system + outside-sheet cascade anchors must be present.
        const root = canvasElement.querySelector('.wh40k-twr-card');
        await expect(root?.classList.contains('wh40k-rpg')).toBe(true);
        await expect(root?.getAttribute('data-wh40k-system')).toBe('dh2');
    },
};

export const RangedSemiAutoSameRestrictions: Story = {
    name: 'Ranged Wielder — semi-auto opener, same-mode follow-up',
    render: () => renderSheet(refocusChatSrc, cardContext({ isMelee: false, mode: 'Semi-Auto Burst', talents: new Set(['Two-Weapon Wielder (Ranged)']) })),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // The off-hand follows the same restrictions as the opener.
        await expect(view.getAllByText(/Semi-Auto Burst/).length).toBe(2);
    },
};

export const RangedMasterAmbidextrous: Story = {
    name: 'Ranged Master — both penalties 0',
    render: () =>
        renderSheet(
            refocusChatSrc,
            cardContext({
                isMelee: false,
                mode: 'Full Auto Burst',
                talents: new Set(['Two-Weapon Master (Ranged)', 'Ambidextrous']),
            }),
        ),
};

export const MeleeSwiftAttackVariant: Story = {
    name: 'Melee Wielder (RT) — Swift Attack ×2',
    render: () => renderSheet(refocusChatSrc, cardContext({ isMelee: true, mode: 'Swift Attack', talents: new Set(['Two-Weapon Wielder (Melee)']) }, 'rt')),
    play: async ({ canvasElement }) => {
        // Per-system variant anchor differs across the seven systems.
        const root = canvasElement.querySelector('.wh40k-twr-card');
        await expect(root?.getAttribute('data-wh40k-system')).toBe('rt');
    },
};
