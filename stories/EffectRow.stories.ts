/**
 * Stories for the canonical `effect-row.hbs` partial and the four panel
 * variants that consume it. Renders each panel with realistic mock effects
 * across multiple game systems via `withSystem`.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';

import effectRowSrc from '../src/templates/actor/partial/effect-row.hbs?raw';
import actorActiveEffectsPanelSrc from '../src/templates/actor/panel/active-effects-panel.hbs?raw';
import actorEffectsPanelSrc from '../src/templates/actor/panel/effects-panel.hbs?raw';
import actorActiveEffectsCompactSrc from '../src/templates/actor/panel/active-effects-compact.hbs?raw';
import itemActiveEffectsPanelSrc from '../src/templates/item/panel/active-effects-panel.hbs?raw';
import { mockActiveEffect, mockItem } from './mocks';
import { clickAction, renderSheet, renderSheetParts } from './test-helpers';

const meta: Meta = {
    title: 'Effects/Row + Panels',
};
export default meta;

type Story = StoryObj;

function makeEffects(): ReturnType<typeof mockActiveEffect>[] {
    return [
        mockActiveEffect({
            id: 'eff-1',
            label: 'Blessed Ammunition',
            sourceName: 'Litany of Wrath',
            changes: [
                { label: 'Strength', value: '+5' },
                { label: 'WeaponSkill', value: '+10' },
            ],
        }),
        mockActiveEffect({
            id: 'eff-2',
            label: 'Overheated',
            disabled: true,
            sourceName: 'Plasma Misfire',
            duration: { label: '1 round remaining' },
            changes: [{ label: 'Agility', value: '-10' }],
        }),
    ];
}

/** Direct partial rendering — full variant, expanded with changes. */
export const RowFullExpanded: Story = {
    name: 'Row / Full Expanded',
    render: () =>
        renderSheet(effectRowSrc, {
            effect: makeEffects()[0],
            expanded: true,
            editable: true,
            showDuration: true,
        }),
};

/** Direct partial rendering — compact variant. */
export const RowCompact: Story = {
    name: 'Row / Compact',
    render: () =>
        renderSheet(effectRowSrc, {
            effect: makeEffects()[0],
            compact: true,
        }),
};

/** Direct partial rendering — disabled / no edit. */
export const RowDisabledNoEdit: Story = {
    name: 'Row / Disabled, edit hidden',
    render: () =>
        renderSheet(effectRowSrc, {
            effect: makeEffects()[1],
            editable: false,
            showDuration: true,
        }),
};

/** Actor active-effects-panel — full panel with header + dropzone. */
export const ActorActiveEffectsPanel: Story = {
    name: 'Panels / Actor Active Effects',
    render: () =>
        renderSheet(actorActiveEffectsPanelSrc, {
            effects: makeEffects(),
            actor: { flags: { 'wh40k-rpg': { expanded: { effects_details: true } } } },
        }),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Toolbar dispatches the actor's `effectToggle` action.
        const toggleBtn = canvas.getAllByTitle(/Disable Effect|Enable Effect/i)[0];
        expect(toggleBtn.getAttribute('data-action')).toBe('effectToggle');
        clickAction(canvasElement, 'effectToggle');
    },
};

/** Actor (legacy) effects-panel — separate action names (toggleEffect/deleteEffect). */
export const ActorEffectsPanelLegacy: Story = {
    name: 'Panels / Actor Effects (legacy actions)',
    render: () =>
        renderSheet(actorEffectsPanelSrc, {
            effects: makeEffects(),
            editable: true,
        }),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const toggleBtn = canvas.getAllByTitle(/Disable Effect|Enable Effect/i)[0];
        expect(toggleBtn.getAttribute('data-action')).toBe('toggleEffect');
    },
};

/** Compact panel — combat-station vitals column. */
export const ActorActiveEffectsCompact: Story = {
    name: 'Panels / Actor Compact',
    render: () =>
        renderSheet(actorActiveEffectsCompactSrc, {
            effects: makeEffects(),
        }),
};

/** Item panel — embedded vs not embedded shows different toolbars. */
export const ItemActiveEffectsPanel: Story = {
    name: 'Panels / Item Active Effects',
    render: () =>
        renderSheet(itemActiveEffectsPanelSrc, {
            item: mockItem({ name: 'Bolt Pistol', isEmbedded: false }),
            effects: makeEffects(),
        }),
};

export const ItemActiveEffectsPanelEmbedded: Story = {
    name: 'Panels / Item Active Effects (Embedded)',
    render: () =>
        renderSheet(itemActiveEffectsPanelSrc, {
            item: mockItem({ name: 'Bolt Pistol', isEmbedded: true }),
            effects: makeEffects(),
        }),
};

/** Composed full-sheet view exercising all four panels at once across systems. */
export const ComposedAllPanelsDH2: Story = {
    name: 'Composed / All panels (DH2e)',
    render: () => {
        const wrapper = renderSheetParts(
            [
                { template: actorActiveEffectsPanelSrc, context: { effects: makeEffects(), actor: {} } },
                { template: actorEffectsPanelSrc, context: { effects: makeEffects(), editable: true } },
                { template: actorActiveEffectsCompactSrc, context: { effects: makeEffects() } },
                {
                    template: itemActiveEffectsPanelSrc,
                    context: { effects: makeEffects(), item: mockItem({ isEmbedded: false }) },
                },
            ],
            {},
        );
        wrapper.dataset.wh40kSystem = 'dh2e';
        return wrapper;
    },
};

export const ComposedAllPanelsIM: Story = {
    name: 'Composed / All panels (IM)',
    render: () => {
        const wrapper = renderSheetParts(
            [
                { template: actorActiveEffectsPanelSrc, context: { effects: makeEffects(), actor: {} } },
                { template: actorActiveEffectsCompactSrc, context: { effects: makeEffects() } },
                {
                    template: itemActiveEffectsPanelSrc,
                    context: { effects: makeEffects(), item: mockItem({ isEmbedded: false }) },
                },
            ],
            {},
        );
        wrapper.dataset.wh40kSystem = 'im';
        return wrapper;
    },
};

export const ComposedAllPanelsRT: Story = {
    name: 'Composed / All panels (RT)',
    render: () => {
        const wrapper = renderSheetParts(
            [
                { template: actorActiveEffectsPanelSrc, context: { effects: makeEffects(), actor: {} } },
                { template: actorActiveEffectsCompactSrc, context: { effects: makeEffects() } },
                {
                    template: itemActiveEffectsPanelSrc,
                    context: { effects: makeEffects(), item: mockItem({ isEmbedded: false }) },
                },
            ],
            {},
        );
        wrapper.dataset.wh40kSystem = 'rt';
        return wrapper;
    },
};
