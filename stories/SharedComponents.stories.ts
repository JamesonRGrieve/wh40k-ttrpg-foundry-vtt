import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import activeModifiersPanelSrc from '../src/templates/components/active-modifiers-panel.hbs?raw';
import quickActionsBarSrc from '../src/templates/components/quick-actions-bar.hbs?raw';
import activeEffectsPanelSrc from '../src/templates/item/panel/active-effects-panel.hbs?raw';
import { mockActiveEffectsContext, mockModifiersPanel, mockQuickActionItem, type MockItem } from './mocks';
import { initializeStoryHandlebars } from './template-support';
import { renderSheet } from './test-helpers';

initializeStoryHandlebars();

interface QuickActionsArgs {
    item: MockItem;
    system: object;
    compact: boolean;
    inSheet: boolean;
}

const meta: Meta = {
    title: 'Shared/Components',
};

export default meta;

type Story = StoryObj;

export const ActiveEffectsPanel: Story = {
    render: () => renderSheet(activeEffectsPanelSrc, mockActiveEffectsContext()),
};

export const ActiveEffectsEmptyEmbedded: Story = {
    name: 'Active Effects Panel / Empty Embedded',
    render: () =>
        renderSheet(
            activeEffectsPanelSrc,
            mockActiveEffectsContext({
                item: {
                    isEmbedded: true,
                },
                effects: [],
            }),
        ),
};

export const ActiveModifiersPanel: Story = {
    render: () => renderSheet(activeModifiersPanelSrc, mockModifiersPanel()),
    play: async ({ canvasElement }) => {
        const text = canvasElement.textContent;
        // All six roll-up sections render, including the #432 Origins section.
        await expect(text).toContain('Conditions');
        await expect(text).toContain('Talents');
        await expect(text).toContain('Traits');
        await expect(text).toContain('Equipment');
        await expect(text).toContain('Origins');
        await expect(text).toContain('Effects');
        // #432: origin-path bonuses surface flat, situational (with condition),
        // and equipment craftsmanship-gated (with tier) descriptions.
        await expect(text).toContain('Hive World');
        await expect(text).toContain('In an enclosed space'); // scoped/situational
        await expect(text).toContain('best+ craftsmanship'); // craftsmanship gate
        await expect(text).toContain('techUse +10'); // flat origin skill
    },
};

export const ActiveModifiersCollapsed: Story = {
    name: 'Active Modifiers Panel / Collapsed',
    render: () =>
        renderSheet(
            activeModifiersPanelSrc,
            mockModifiersPanel({
                modifiers: {
                    collapsed: true,
                },
            }),
        ),
};

export const WeaponQuickActions: StoryObj<QuickActionsArgs> = {
    name: 'Quick Actions / Weapon',
    args: {
        item: mockQuickActionItem('weapon'),
        system: mockQuickActionItem('weapon').system,
        compact: false,
        inSheet: false,
    },
    render: (args) => renderSheet(quickActionsBarSrc, args),
};

export const CompactConditionQuickActions: StoryObj<QuickActionsArgs> = {
    name: 'Quick Actions / Compact Condition',
    args: {
        item: mockQuickActionItem('condition'),
        system: mockQuickActionItem('condition').system,
        compact: true,
        inSheet: false,
    },
    render: (args) => renderSheet(quickActionsBarSrc, args),
};

export const InSheetTalentQuickActions: StoryObj<QuickActionsArgs> = {
    name: 'Quick Actions / In-Sheet Talent',
    args: {
        item: mockQuickActionItem('talent'),
        system: mockQuickActionItem('talent').system,
        compact: false,
        inSheet: true,
    },
    render: (args) => renderSheet(quickActionsBarSrc, args),
};
