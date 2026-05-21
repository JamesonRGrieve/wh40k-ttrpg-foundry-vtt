/**
 * Storybook stories for the Profane Object presentation on the gear
 * item sheet (#96). Verifies that the crimson badge + aura row + hook
 * row render when `profaneObject` is non-null and that the block is
 * absent when it isn't.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { PROFANE_OBJECT_REGISTRY } from '../../src/module/rules/profane-objects.ts';
import templateSrc from '../../src/templates/item/item-gear-sheet.hbs?raw';
import { renderSheet } from '../test-helpers';

interface ProfaneGearArgs {
    item: {
        name: string;
        img: string;
        system: {
            category: string;
            craftsmanship: string;
            quantity: number;
            weight: number;
            equipped: boolean;
            inBackpack: boolean;
            consumable: boolean;
            uses: { value: number; max: number };
            duration: string;
            notes: string;
            availability: string;
            availabilityLabel: string;
            effectiveTotalWeight: number;
            cost: { dh2: { homebrew: { throneGelt: number } } };
            description: { value: string };
            effect: string;
            profaneObjectId: string;
        };
    };
    system: ProfaneGearArgs['item']['system'];
    source: ProfaneGearArgs['item']['system'];
    categoryLabel: string;
    categoryIcon: string;
    hasLimitedUses: boolean;
    usesExhausted: boolean;
    usesDisplay: string;
    profaneObject?: (typeof PROFANE_OBJECT_REGISTRY)[string];
    hideThroneGelt: boolean;
}

const baseSystem = (overrides: Partial<ProfaneGearArgs['item']['system']> = {}): ProfaneGearArgs['item']['system'] => ({
    category: 'religious',
    craftsmanship: 'best',
    quantity: 1,
    weight: 2,
    equipped: true,
    inBackpack: false,
    consumable: false,
    uses: { value: 0, max: 0 },
    duration: '',
    notes: 'Locked in the inquisitorial reliquary between sessions.',
    availability: 'unique',
    availabilityLabel: 'Unique',
    effectiveTotalWeight: 2,
    cost: { dh2: { homebrew: { throneGelt: 0 } } },
    description: { value: 'Recovered from the ruined chapel beneath Hab District 9.' },
    effect: 'Bound by chains of saint-iron. Do not open in the presence of psykers.',
    profaneObjectId: 'eye-of-tzeentch',
    ...overrides,
});

const baseArgs = (slug: keyof typeof PROFANE_OBJECT_REGISTRY): ProfaneGearArgs => {
    const sys = baseSystem({ profaneObjectId: slug });
    return {
        item: { name: PROFANE_OBJECT_REGISTRY[slug].label, img: 'icons/svg/skull.svg', system: sys },
        system: sys,
        source: sys,
        categoryLabel: 'Religious',
        categoryIcon: 'fa-cross',
        hasLimitedUses: false,
        usesExhausted: false,
        usesDisplay: '',
        profaneObject: PROFANE_OBJECT_REGISTRY[slug],
        hideThroneGelt: true,
    };
};

const meta = {
    title: 'Item Sheets/ProfaneObjectGearSheet',
    // eslint-disable-next-line no-restricted-syntax -- boundary: Storybook render args typed as ProfaneGearArgs; renderSheet accepts Context (Record<string, unknown>); double-cast is the framework boundary
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: baseArgs('eye-of-tzeentch'),
} satisfies Meta<ProfaneGearArgs>;

export default meta;
type Story = StoryObj<ProfaneGearArgs>;

export const EyeOfTzeentch: Story = {};

export const FoundationStone: Story = {
    args: baseArgs('foundation-stone-of-house-dane'),
};

export const HammerOfSaintLucillius: Story = {
    args: baseArgs('hammer-of-saint-lucillius'),
};

export const LibrisMaleficarum: Story = {
    args: baseArgs('libris-maleficarum'),
};

export const OrdinaryGearHidesPanel: Story = {
    args: {
        ...baseArgs('eye-of-tzeentch'),
        item: { ...baseArgs('eye-of-tzeentch').item, name: 'Standard issue lho-sticks', system: baseSystem({ profaneObjectId: '' }) },
        system: baseSystem({ profaneObjectId: '' }),
        source: baseSystem({ profaneObjectId: '' }),
        profaneObject: undefined,
    },
    play: ({ canvasElement }) => {
        // Profane panel should be absent for ordinary gear.
        const panel = canvasElement.querySelector('.wh40k-gear-profane-panel');
        void expect(panel).toBeNull();
    },
};

export const RendersPanel: Story = {
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByText('Profane Object')).toBeTruthy();
        const panel = canvasElement.querySelector('.wh40k-gear-profane-panel');
        void expect(panel).toBeTruthy();
        const aura = canvasElement.querySelector('.wh40k-gear-profane-aura');
        const hook = canvasElement.querySelector('.wh40k-gear-profane-hook');
        void expect(aura).toBeTruthy();
        void expect(hook).toBeTruthy();
    },
};
