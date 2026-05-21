import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import activeModifiersPanelSrc from '../src/templates/components/active-modifiers-panel.hbs?raw';
import quickActionsBarSrc from '../src/templates/components/quick-actions-bar.hbs?raw';
import activeEffectsPanelSrc from '../src/templates/item/panel/active-effects-panel.hbs?raw';
import { mockActiveEffectsContext, mockModifiersPanel, mockQuickActionItem, renderTemplate as renderTpl, type MockItem } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const activeEffectsTemplate = Hbs.compile(activeEffectsPanelSrc);
const activeModifiersTemplate = Hbs.compile(activeModifiersPanelSrc);
const quickActionsTemplate = Hbs.compile(quickActionsBarSrc);

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
    render: () => renderTpl(activeEffectsTemplate, mockActiveEffectsContext()),
};

export const ActiveEffectsEmptyEmbedded: Story = {
    name: 'Active Effects Panel / Empty Embedded',
    render: () =>
        renderTpl(
            activeEffectsTemplate,
            mockActiveEffectsContext({
                item: {
                    isEmbedded: true,
                },
                effects: [],
            }),
        ),
};

export const ActiveModifiersPanel: Story = {
    render: () => renderTpl(activeModifiersTemplate, mockModifiersPanel()),
};

export const ActiveModifiersCollapsed: Story = {
    name: 'Active Modifiers Panel / Collapsed',
    render: () =>
        renderTpl(
            activeModifiersTemplate,
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
    render: (args) => renderTpl(quickActionsTemplate, args),
};

export const CompactConditionQuickActions: StoryObj<QuickActionsArgs> = {
    name: 'Quick Actions / Compact Condition',
    args: {
        item: mockQuickActionItem('condition'),
        system: mockQuickActionItem('condition').system,
        compact: true,
        inSheet: false,
    },
    render: (args) => renderTpl(quickActionsTemplate, args),
};

export const InSheetTalentQuickActions: StoryObj<QuickActionsArgs> = {
    name: 'Quick Actions / In-Sheet Talent',
    args: {
        item: mockQuickActionItem('talent'),
        system: mockQuickActionItem('talent').system,
        compact: false,
        inSheet: true,
    },
    render: (args) => renderTpl(quickActionsTemplate, args),
};
