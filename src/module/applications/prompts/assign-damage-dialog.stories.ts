import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/assign-damage-prompt.hbs?raw';
import footerSrc from '../../../../src/templates/prompt/roll-dialog-footer.hbs?raw';
import { renderSheet, renderSheetParts } from '../../../../stories/test-helpers';

interface ActorView {
    name: string;
    img: string;
    system: {
        wounds: { value: number; max: number; critical: number };
        fatigue: { value: number; max: number };
    };
}

interface HitView {
    location: string;
    damageType: string;
    totalDamage: number;
    totalPenetration: number;
    totalFatigue: number;
}

interface Args {
    actor: ActorView;
    hit: HitView;
    armour: number;
    tb: number;
    locations: Record<string, string>;
    damageType: Record<string, string>;
}

const ACTOR: ActorView = {
    name: 'Acolyte Vael',
    img: 'icons/svg/mystery-man.svg',
    system: {
        wounds: { value: 8, max: 12, critical: 0 },
        fatigue: { value: 1, max: 4 },
    },
};

const LOCATIONS: Record<string, string> = {
    head: 'Head',
    body: 'Body',
    leftArm: 'Left Arm',
    rightArm: 'Right Arm',
    leftLeg: 'Left Leg',
    rightLeg: 'Right Leg',
};

const DAMAGE_TYPES: Record<string, string> = {
    energy: 'Energy',
    impact: 'Impact',
    rending: 'Rending',
    explosive: 'Explosive',
};

const meta = {
    title: 'Prompts/AssignDamageDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        actor: ACTOR,
        hit: { location: 'body', damageType: 'impact', totalDamage: 10, totalPenetration: 2, totalFatigue: 0 },
        armour: 4,
        tb: 3,
        locations: LOCATIONS,
        damageType: DAMAGE_TYPES,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const BodyHit: Story = {};

/** A heavy hit to the head that punches through armour. */
export const HeadCrit: Story = {
    args: {
        hit: { location: 'head', damageType: 'rending', totalDamage: 22, totalPenetration: 8, totalFatigue: 1 },
        armour: 2,
        tb: 3,
    },
};

/**
 * The form with the dialog's footer part, as the dialog composes them (#698): Apply and
 * Cancel come from the base roll dialog's footer, wired to its `roll` / `cancel` actions,
 * and the form itself carries no buttons of its own.
 */
export const Wired: Story = {
    render: (args) =>
        renderSheetParts([
            { template: templateSrc, context: { ...args } },
            { template: footerSrc, context: { footer: { labelKey: 'WH40K.Common.Apply', icon: 'fa-check' } } },
        ]),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Acolyte Vael')).toBeTruthy();
        const footer = canvasElement.querySelector<HTMLElement>('[data-roll-dialog-footer]');
        const buttons = Array.from(footer?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        await expect(buttons.map((button) => [button.dataset['action'], button.textContent.trim()])).toEqual([
            ['roll', 'Apply'],
            ['cancel', 'Cancel'],
        ]);
        await expect(buttons.every((button) => button.type === 'button')).toBe(true);
        await expect(canvasElement.querySelectorAll('button').length).toBe(2);
    },
};
