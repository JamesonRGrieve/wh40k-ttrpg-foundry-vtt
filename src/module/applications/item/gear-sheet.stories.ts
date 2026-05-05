import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-gear-sheet.hbs?raw';
import activeEffectsPanelSrc from '../../../../src/templates/item/panel/active-effects-panel.hbs?raw';
import { mockGearSheetContext, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';

initializeStoryHandlebars();
Handlebars.registerPartial('systems/wh40k-rpg/templates/item/panel/active-effects-panel.hbs', activeEffectsPanelSrc);
const compiled = Handlebars.compile(templateSrc);

interface Args {
    overrides?: Parameters<typeof mockGearSheetContext>[0];
}

const meta = {
    title: 'Item Sheets/GearSheet',
    render: (args) => renderTemplate(compiled, mockGearSheetContext(args.overrides)),
    args: {},
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const UsesExhausted: Story = {
    args: {
        overrides: {
            usesExhausted: true,
            usesPercentage: 0,
            system: { uses: 0 },
        },
    },
};

export const RendersName: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Medi-Kit')).toBeTruthy();
    },
};
