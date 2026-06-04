import type { Meta, StoryObj } from '@storybook/html-vite';
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
