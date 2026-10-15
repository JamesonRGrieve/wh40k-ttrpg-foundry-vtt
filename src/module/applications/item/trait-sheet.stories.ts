import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-trait-sheet.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface TraitSystem {
    categoryLabel: string;
    hasLevel: boolean;
    level: number;
    isVariable: boolean;
    modifiers: {
        characteristics: Record<string, number> | null;
        skills: Record<string, number> | null;
        combat: Record<string, number> | null;
        wounds: number | null;
    };
    description: { value: string };
}
interface TraitItem {
    name: string;
    img: string;
    system: TraitSystem;
}
interface TraitSystemArg {
    description: { value: string };
}
interface TraitArgs {
    item: TraitItem;
    system: TraitSystemArg;
    [key: string]: TraitItem | TraitSystemArg;
}

const baseSystem = (): TraitSystem => ({
    categoryLabel: 'Physical',
    hasLevel: true,
    level: 3,
    isVariable: false,
    modifiers: { characteristics: null, skills: null, combat: null, wounds: null },
    description: { value: '<p>An ancient creature trait.</p>' },
});

const meta = {
    title: 'Item Sheets/TraitSheet',
    render: (args) => renderSheet(templateSrc, args),
    args: {
        item: { name: 'Sturdy', img: 'icons/svg/shield.svg', system: baseSystem() },
        system: { description: { value: '<p>An ancient creature trait.</p>' } },
    },
} satisfies Meta<TraitArgs>;
export default meta;

type Story = StoryObj<TraitArgs>;

export const Default: Story = {};

export const Variable: Story = {
    args: {
        item: {
            name: 'Daemonic (X)',
            img: 'icons/svg/daemon.svg',
            system: { ...baseSystem(), isVariable: true, hasLevel: false, categoryLabel: 'Daemonic' },
        },
        system: { description: { value: '<p>Daemonic creatures vary in power.</p>' } },
    },
};

export const RendersBadges: Story = {
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByDisplayValue('Sturdy')).toBeTruthy();
        void expect(storyCanvas.getAllByText('Physical').length).toBeGreaterThan(0);
    },
};

/** The fixed purple both themes used to share (#655), purple on a purple wash on the dark sheet. */
const OLD_TRAIT_PURPLE = 'rgb(106, 32, 144)';

/**
 * #655: the active tab label and the Level value take the themed trait accent, which
 * clears 4.5:1 on its wash on both themes (tests/accent-tab-contrast.test.ts); on
 * the dark Storybook theme that is the light purple, not the old dark one.
 */
export const ActiveTabAndLevelReadable: Story = {
    play: async ({ canvasElement }) => {
        const label = canvasElement.querySelector('.wh40k-tab.active span');
        const level = canvasElement.querySelector('[data-field="trait-level"]');
        const probe = document.createElement('span');
        probe.style.color = 'var(--wh40k-traits-primary)';
        canvasElement.append(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        await expect(label).not.toBeNull();
        await expect(level?.textContent.trim()).toBe('3');
        await expect(label === null ? '' : getComputedStyle(label).color).toBe(accent);
        await expect(level === null ? '' : getComputedStyle(level).color).toBe(accent);
        if (document.body.classList.contains('theme-dark')) await expect(accent).not.toBe(OLD_TRAIT_PURPLE);
    },
};
