/**
 * The Combat tab's armour notice (#798), in the shared Armour panel. Each story
 * derives the notice through `armourNotice`, as the sheet does, so the state shown
 * is the rule's, not a hand-written one.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { captureActionClicks, renderSheet } from '../../../stories/test-helpers';
import armourZoneSrc from '../../templates/actor/partial/armour-zone.hbs?raw';
import { type ArmourPiece, armourNotice } from './armour-notice.ts';

const HIT_LOCATIONS = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const;

interface Args {
    armour: ArmourPiece[];
}

const meta = {
    title: 'Actor/Partials/ArmourNotice',
    render: (args) =>
        renderSheet(armourZoneSrc, {
            armourDisplay: Object.fromEntries(HIT_LOCATIONS.map((loc) => [loc, { total: 0, items: [], tooltipData: '{}' }])),
            equippedGear: [],
            compact: false,
            armourNotice: armourNotice(args.armour),
        }),
    args: { armour: [] },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

const vest: ArmourPiece = { id: 'vest01', name: 'Flak Vest', equipped: false };
const helmet: ArmourPiece = { id: 'helm01', name: 'Flak Helmet', equipped: false };

/** Armour carried, none worn: the notice names each piece with an Equip button that sends toggleEquip. */
export const CarriedNotWorn: Story = {
    args: { armour: [vest, helmet] },
    play: async ({ canvasElement }) => {
        const notice = canvasElement.querySelector<HTMLElement>('[data-armour-notice]');
        await expect(notice?.dataset['armourNotice']).toBe('unequipped');
        const buttons = [...canvasElement.querySelectorAll<HTMLButtonElement>('[data-armour-notice] [data-action="toggleEquip"]')];
        await expect(buttons.map((b) => b.dataset['itemId'])).toEqual(['vest01', 'helm01']);
        await expect(buttons.map((b) => b.textContent.trim())).toEqual(['Flak Vest', 'Flak Helmet']);
        const clicks = captureActionClicks(canvasElement);
        buttons[0]?.click();
        await expect(clicks).toEqual([{ action: 'toggleEquip', dataset: { itemId: 'vest01', tooltip: buttons[0]?.dataset['tooltip'] } }]);
    },
};

/** No armour at all: a lighter notice, with no buttons. */
export const NoneCarried: Story = {
    play: async ({ canvasElement }) => {
        const notice = canvasElement.querySelector<HTMLElement>('[data-armour-notice]');
        await expect(notice?.dataset['armourNotice']).toBe('none');
        await expect(notice?.querySelector('[data-action]')).toBeNull();
    },
};

/** Any piece worn: no notice. */
export const SomeWorn: Story = {
    args: { armour: [{ ...vest, equipped: true }, helmet] },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-armour-notice]')).toBeNull();
    },
};
