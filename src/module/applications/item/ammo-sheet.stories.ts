import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-ammo-sheet.hbs?raw';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderTemplate } from '../../../../stories/mocks';

initializeStoryHandlebars();
// AmmoSheet exposes setIncludes / setToArray on its render context. The story
// reproduces the same surface so the template can render without the sheet.
if (!Handlebars.helpers.setIncludes) {
    Handlebars.registerHelper('setIncludes', (key: unknown, set: unknown) => {
        if (set instanceof Set) return set.has(key as string);
        if (Array.isArray(set)) return (set as unknown[]).includes(key);
        return false;
    });
}
const compiled = Handlebars.compile(templateSrc);

interface AmmoArgs {
    item: {
        name: string;
        img: string;
        system: {
            hasModifiers: boolean;
            weight: number;
            clipModifier: number;
            modifiers: {
                damage: number;
                penetration: number;
                range: number;
                rateOfFire: { single: number; semi: number; full: number };
            };
            weaponTypes: { size: number };
            addedQualities: { size: number };
            removedQualities: { size: number };
        };
    };
    system: AmmoArgs['item']['system'];
    CONFIG: { WH40K: { weaponTypes: Record<string, never> } };
}

const baseSystem = (): AmmoArgs['item']['system'] => ({
    hasModifiers: true,
    weight: 0.4,
    clipModifier: 0,
    modifiers: {
        damage: 1,
        penetration: 0,
        range: 0,
        rateOfFire: { single: 0, semi: 0, full: 0 },
    },
    weaponTypes: { size: 0 },
    addedQualities: { size: 0 },
    removedQualities: { size: 0 },
});

const meta: Meta<AmmoArgs> = {
    title: 'Item Sheets/AmmoSheet',
    render: (args) => renderTemplate(compiled, args),
    args: {
        item: { name: 'Bolt Rounds (Standard)', img: 'icons/svg/bullet.svg', system: baseSystem() },
        system: baseSystem(),
        CONFIG: { WH40K: { weaponTypes: {} } },
    },
};
export default meta;

type Story = StoryObj<AmmoArgs>;

export const Default: Story = {};

export const HighDamage: Story = {
    args: {
        item: {
            name: 'Hellfire Rounds',
            img: 'icons/svg/fire-bullet.svg',
            system: { ...baseSystem(), modifiers: { ...baseSystem().modifiers, damage: 3, penetration: 2 } },
        },
        system: { ...baseSystem(), modifiers: { ...baseSystem().modifiers, damage: 3, penetration: 2 } },
        CONFIG: { WH40K: { weaponTypes: {} } },
    },
};

export const RendersTabs: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Bolt Rounds (Standard)')).toBeTruthy();
        expect(canvasElement.querySelector('[data-tab="modifiers"]')).toBeTruthy();
        expect(canvasElement.querySelector('[data-tab="qualities"]')).toBeTruthy();
    },
};
