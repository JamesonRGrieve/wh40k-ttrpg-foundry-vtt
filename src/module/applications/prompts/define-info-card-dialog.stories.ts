/**
 * Stories for defineInfoCardDialog — the factory itself, exercised via a
 * representative info-card template (the Without-homeworld card grid). The factory
 * is infrastructure, not a visual component, so these stories verify the contract:
 * the `homeworlds` context key renders a card per registry entry with its label,
 * bonus/penalty, and accent class.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/prompt/without-homeworld-info-dialog.hbs?raw';

initializeStoryHandlebars();
const compiled = Hbs.compile(templateSrc);

interface CardCtx {
    // eslint-disable-next-line no-restricted-syntax -- boundary: a mock Handlebars card context is a heterogeneous bag with no single shared shape
    homeworlds: Array<Record<string, unknown>>;
}

function makeCtx(): CardCtx {
    return {
        homeworlds: [
            {
                id: 'deathWorld',
                label: 'Death World',
                accent: 'crimson',
                bonusesLabel: '+Strength, +Toughness',
                penaltiesLabel: '−Fellowship',
                fateLabel: '2 (Emperor’s Blessing 5+)',
                woundsLabel: '9 + 1d5',
                aptitude: 'Offence',
                keyTalents: ['Hardy', 'Resistance (Poisons)'],
                recommendedBackgrounds: ['Imperial Guard'],
                mechanicalHook: 'Survivor of a lethal world.',
                surpriseSuppressionLabel: null,
                serenityLabel: null,
                pursuitOfDataLabel: null,
            },
        ],
    };
}

const meta: Meta = { title: 'Dialogs/DefineInfoCardDialog' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => compiled(makeCtx()) };

export const RendersACardPerEntry: Story = {
    render: () => compiled(makeCtx()),
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('.without-homeworld-card');
        await expect(card).toBeTruthy();
        await expect(canvasElement.textContent).toContain('Death World');
        await expect(canvasElement.textContent).toContain('+Strength, +Toughness');
    },
};
