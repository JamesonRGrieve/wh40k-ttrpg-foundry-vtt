/**
 * Stories for defineInfoCardDialog — the factory itself, exercised via a
 * representative info-card template (the home-world card grid). The factory is
 * infrastructure, not a visual component, so these stories verify the contract:
 * the `groups` context key renders a card per entry with its label,
 * characteristic modifiers, and accent class.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/prompt/homeworld-info-dialog.hbs?raw';
import { HOMEWORLD_ACCENTS, type HomeworldCardGroup } from './homeworld-cards.ts';

initializeStoryHandlebars();

interface CardCtx {
    groups: HomeworldCardGroup[];
}

function makeCtx(): CardCtx {
    return {
        groups: [
            {
                label: 'Fixture Pack',
                cards: [
                    {
                        id: 'death-world',
                        label: 'Death World',
                        characteristicModsLabel: '+Strength, +Toughness, −Fellowship',
                        fateLabel: '2 (5+)',
                        woundsLabel: '9 + 1d5',
                        aptitudes: ['Offence'],
                        abilities: [{ name: 'Fixture Bonus', description: 'Survivor of a lethal world.' }],
                        accent: HOMEWORLD_ACCENTS[0] ?? { border: '', accentText: '', accentBg: '' },
                    },
                ],
            },
        ],
    };
}

const meta: Meta = { title: 'Dialogs/DefineInfoCardDialog' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const RendersACardPerEntry: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('[data-homeworld="death-world"]');
        await expect(card).toBeTruthy();
        await expect(card?.className).toContain('tw-border-amber-600');
        await expect(canvasElement.textContent).toContain('Death World');
        await expect(canvasElement.textContent).toContain('+Strength, +Toughness');
    },
};
