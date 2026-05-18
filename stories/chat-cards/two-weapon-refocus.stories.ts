import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import refocusChatSrc from '../../src/templates/chat/two-weapon-refocus-chat.hbs?raw';
import { resolveTwoWeaponRefocus, type TwoWeaponRefocusContext } from '../../src/module/rules/two-weapon-fighting.ts';
import { renderTemplate } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';

/**
 * Two-Weapon Wielder errata p. 132 refocus chat card (#147 —
 * errata/errata.md L67). Verifies the card renders the structured
 * two-Half-Action plan: the main-hand Half-Action opener plus the
 * same-mode Free-Action off-hand follow-up that the
 * `resolveTwoWeaponRefocus` resolver produces. Ranged single-shot
 * must surface a Standard Attack ×2, NOT a Full-Action lump.
 */
initializeStoryHandlebars();

const refocusTemplate = Handlebars.compile(refocusChatSrc);

function cardContext(ctx: TwoWeaponRefocusContext, gameSystem = 'dh2e'): Record<string, unknown> {
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
    render: () =>
        renderTemplate(
            refocusTemplate,
            cardContext({ isMelee: false, mode: 'Standard Attack', talents: new Set(['Two-Weapon Wielder (Ranged)']) }),
        ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Two Standard Attack rows render (main Half + off Free).
        expect(canvas.getAllByText(/Standard Attack/).length).toBe(2);
        // Action economy is Half + Free, never a Full-Action lump.
        expect(canvas.getByText(/\(Half\)/)).toBeTruthy();
        expect(canvas.getByText(/\(Free\)/)).toBeTruthy();
        // Per-system + outside-sheet cascade anchors must be present.
        const root = canvasElement.querySelector('.wh40k-twr-card');
        expect(root?.classList.contains('wh40k-rpg')).toBe(true);
        expect(root?.getAttribute('data-wh40k-system')).toBe('dh2e');
    },
};

export const RangedSemiAutoSameRestrictions: Story = {
    name: 'Ranged Wielder — semi-auto opener, same-mode follow-up',
    render: () =>
        renderTemplate(
            refocusTemplate,
            cardContext({ isMelee: false, mode: 'Semi-Auto Burst', talents: new Set(['Two-Weapon Wielder (Ranged)']) }),
        ),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // The off-hand follows the same restrictions as the opener.
        expect(canvas.getAllByText(/Semi-Auto Burst/).length).toBe(2);
    },
};

export const RangedMasterAmbidextrous: Story = {
    name: 'Ranged Master — both penalties 0',
    render: () =>
        renderTemplate(
            refocusTemplate,
            cardContext({
                isMelee: false,
                mode: 'Full Auto Burst',
                talents: new Set(['Two-Weapon Master (Ranged)', 'Ambidextrous']),
            }),
        ),
};

export const MeleeSwiftAttackVariant: Story = {
    name: 'Melee Wielder (RT) — Swift Attack ×2',
    render: () =>
        renderTemplate(
            refocusTemplate,
            cardContext({ isMelee: true, mode: 'Swift Attack', talents: new Set(['Two-Weapon Wielder (Melee)']) }, 'rt'),
        ),
    play: async ({ canvasElement }) => {
        // Per-system variant anchor differs across the seven systems.
        const root = canvasElement.querySelector('.wh40k-twr-card');
        expect(root?.getAttribute('data-wh40k-system')).toBe('rt');
    },
};
