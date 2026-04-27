import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import activeEffectsPanelSrc from '../src/templates/item/panel/active-effects-panel.hbs?raw';
import activeModifiersPanelSrc from '../src/templates/components/active-modifiers-panel.hbs?raw';
import quickActionsBarSrc from '../src/templates/components/quick-actions-bar.hbs?raw';
import { mockActiveEffectsContext, mockModifiersPanel, mockQuickActionItem, renderTemplate, type MockItem } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const activeEffectsTemplate = Handlebars.compile(activeEffectsPanelSrc);
const activeModifiersTemplate = Handlebars.compile(activeModifiersPanelSrc);
const quickActionsTemplate = Handlebars.compile(quickActionsBarSrc);

interface QuickActionsArgs {
    item: MockItem;
    system: Record<string, unknown>;
    compact: boolean;
    inSheet: boolean;
}

const meta: Meta = {
    title: 'Shared/Components',
};

export default meta;

type Story = StoryObj;

export const ActiveEffectsPanel: Story = {
    name: 'Active Effects Panel',
    render: () => renderTemplate(activeEffectsTemplate, mockActiveEffectsContext()),
};

export const ActiveEffectsEmptyEmbedded: Story = {
    name: 'Active Effects Panel / Empty Embedded',
    render: () =>
        renderTemplate(
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
    name: 'Active Modifiers Panel',
    render: () => renderTemplate(activeModifiersTemplate, mockModifiersPanel()),
};

export const ActiveModifiersCollapsed: Story = {
    name: 'Active Modifiers Panel / Collapsed',
    render: () =>
        renderTemplate(
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
    render: (args) => renderTemplate(quickActionsTemplate, args),
};

export const CompactConditionQuickActions: StoryObj<QuickActionsArgs> = {
    name: 'Quick Actions / Compact Condition',
    args: {
        item: mockQuickActionItem('condition'),
        system: mockQuickActionItem('condition').system,
        compact: true,
        inSheet: false,
    },
    render: (args) => renderTemplate(quickActionsTemplate, args),
};

export const InSheetTalentQuickActions: StoryObj<QuickActionsArgs> = {
    name: 'Quick Actions / In-Sheet Talent',
    args: {
        item: mockQuickActionItem('talent'),
        system: mockQuickActionItem('talent').system,
        compact: false,
        inSheet: true,
    },
    render: (args) => renderTemplate(quickActionsTemplate, args),
};
