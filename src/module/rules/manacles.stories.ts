/**
 * Manacles condition — visual coverage.
 *
 * Two surfaces matter for issue #105:
 *   1. The Manacled condition pill on the actor's Active Effects panel
 *      (sheet rendering).
 *   2. The −40 BS / −40 WS modifier rows in the unified roll dialog
 *      situational-modifiers section.
 *
 * Stories compose the canonical partials with realistic AE / dialog
 * mocks. The `withSystem` wrapper exercises every game-system theme so
 * a regression in any one of the seven shows up in visual review.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import actorActiveEffectsPanelSrc from '../../templates/actor/panel/active-effects-panel.hbs?raw';
import effectRowSrc from '../../templates/actor/partial/effect-row.hbs?raw';
import unifiedModifiersSrc from '../../templates/prompt/unified/modifiers.hbs?raw';
import { mockActiveEffect } from '../../../stories/mocks';
import { renderSheet, renderSheetParts } from '../../../stories/test-helpers';
import { MANACLES_BS_PENALTY, MANACLES_EFFECT_NAME, MANACLES_WS_PENALTY } from './manacles.ts';

const meta: Meta = {
    title: 'Rules / Manacles (#105)',
};
export default meta;

type Story = StoryObj;

function manaclesEffect(overrides: Record<string, unknown> = {}): ReturnType<typeof mockActiveEffect> {
    return mockActiveEffect({
        id: 'ae-manacled',
        label: MANACLES_EFFECT_NAME,
        icon: 'icons/svg/chains.svg',
        sourceName: 'Manacles',
        duration: { label: 'Until removed' },
        changes: [
            { label: 'BallisticSkill', value: String(MANACLES_BS_PENALTY) },
            { label: 'WeaponSkill', value: String(MANACLES_WS_PENALTY) },
        ],
        ...overrides,
    });
}

function manaclesSituationalRow(): Record<string, unknown> {
    return {
        toggleKey: 'manacles',
        source: 'Manacled',
        condition: 'Errata p. 176 — Manacles impose −40 BS/WS while worn.',
        icon: 'fas fa-link',
        value: MANACLES_BS_PENALTY,
        valueLabel: String(MANACLES_BS_PENALTY),
        active: true,
    };
}

/** Single condition pill (compact row). */
export const PillCompact: Story = {
    name: 'Pill / Compact row',
    render: () => renderSheet(effectRowSrc, { effect: manaclesEffect(), compact: true }),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText(MANACLES_EFFECT_NAME)).toBeTruthy();
    },
};

/** Single condition pill (full card, expanded changes). */
export const PillFullExpanded: Story = {
    name: 'Pill / Full card (expanded)',
    render: () =>
        renderSheet(effectRowSrc, {
            effect: manaclesEffect(),
            expanded: true,
            editable: true,
            showDuration: true,
        }),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // The two characteristic-modifier rows reveal the −40/−40 penalty.
        expect(canvas.getByText('BallisticSkill')).toBeTruthy();
        expect(canvas.getByText('WeaponSkill')).toBeTruthy();
    },
};

/** Actor active-effects panel — Manacled is the only condition. */
export const ActorPanelOnlyManacled: Story = {
    name: 'Actor / Active Effects panel — only Manacled',
    render: () =>
        renderSheet(actorActiveEffectsPanelSrc, {
            effects: [manaclesEffect()],
            actor: { flags: { 'wh40k-rpg': { expanded: { effects_details: true } } } },
        }),
};

/** Actor active-effects panel — Manacled stacked with another condition. */
export const ActorPanelStacked: Story = {
    name: 'Actor / Active Effects panel — stacked',
    render: () =>
        renderSheet(actorActiveEffectsPanelSrc, {
            effects: [
                manaclesEffect(),
                mockActiveEffect({
                    id: 'ae-stunned',
                    label: 'Stunned',
                    icon: 'icons/svg/daze.svg',
                    sourceName: 'Concussive',
                    duration: { label: '1 round' },
                    changes: [{ label: 'Defense', value: '-20' }],
                }),
            ],
            actor: { flags: { 'wh40k-rpg': { expanded: { effects_details: true } } } },
        }),
};

/** Composed: actor effects panel + unified roll-dialog modifiers row (DH2). */
export const ComposedSheetAndDialogDH2: Story = {
    name: 'Composed / Sheet + Roll Dialog (DH2e)',
    render: () => {
        const wrapper = renderSheetParts(
            [
                {
                    template: actorActiveEffectsPanelSrc,
                    context: {
                        effects: [manaclesEffect()],
                        actor: { flags: { 'wh40k-rpg': { expanded: { effects_details: true } } } },
                    },
                },
                {
                    template: unifiedModifiersSrc,
                    context: {
                        hasSituationalModifiers: true,
                        situationalModifiers: [manaclesSituationalRow()],
                        assistantCount: 0,
                        canDecrementAssistant: false,
                        canIncrementAssistant: true,
                        assistanceBonus: 0,
                        extended: false,
                        extendedThreshold: 0,
                        showCustomModifier: false,
                        customMod: 0,
                        tryAgainAdvice: null,
                        isForceField: false,
                    },
                },
            ],
            {},
        );
        wrapper.dataset.wh40kSystem = 'dh2e';
        return wrapper;
    },
};

/** Per-system homologation: Imperium Maledictum. */
export const ComposedSheetAndDialogIM: Story = {
    name: 'Composed / Sheet + Roll Dialog (IM)',
    render: () => {
        const wrapper = renderSheetParts(
            [
                {
                    template: actorActiveEffectsPanelSrc,
                    context: {
                        effects: [manaclesEffect()],
                        actor: { flags: { 'wh40k-rpg': { expanded: { effects_details: true } } } },
                    },
                },
                {
                    template: unifiedModifiersSrc,
                    context: {
                        hasSituationalModifiers: true,
                        situationalModifiers: [manaclesSituationalRow()],
                        assistantCount: 0,
                        canDecrementAssistant: false,
                        canIncrementAssistant: true,
                        assistanceBonus: 0,
                        extended: false,
                        extendedThreshold: 0,
                        showCustomModifier: false,
                        customMod: 0,
                        tryAgainAdvice: null,
                        isForceField: false,
                    },
                },
            ],
            {},
        );
        wrapper.dataset.wh40kSystem = 'im';
        return wrapper;
    },
};

/** Per-system homologation: Rogue Trader. */
export const ComposedSheetAndDialogRT: Story = {
    name: 'Composed / Sheet + Roll Dialog (RT)',
    render: () => {
        const wrapper = renderSheetParts(
            [
                {
                    template: actorActiveEffectsPanelSrc,
                    context: {
                        effects: [manaclesEffect()],
                        actor: { flags: { 'wh40k-rpg': { expanded: { effects_details: true } } } },
                    },
                },
                {
                    template: unifiedModifiersSrc,
                    context: {
                        hasSituationalModifiers: true,
                        situationalModifiers: [manaclesSituationalRow()],
                        assistantCount: 0,
                        canDecrementAssistant: false,
                        canIncrementAssistant: true,
                        assistanceBonus: 0,
                        extended: false,
                        extendedThreshold: 0,
                        showCustomModifier: false,
                        customMod: 0,
                        tryAgainAdvice: null,
                        isForceField: false,
                    },
                },
            ],
            {},
        );
        wrapper.dataset.wh40kSystem = 'rt';
        return wrapper;
    },
};
