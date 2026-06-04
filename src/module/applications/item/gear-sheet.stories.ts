import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-gear-sheet.hbs?raw';
import activeEffectsPanelSrc from '../../../../src/templates/item/panel/active-effects-panel.hbs?raw';
import { mockGearSheetContext } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();
Hbs.registerPartial('systems/wh40k-rpg/templates/item/panel/active-effects-panel.hbs', activeEffectsPanelSrc);

interface Args {
    overrides?: Parameters<typeof mockGearSheetContext>[0];
}

const meta = {
    title: 'Item Sheets/GearSheet',
    render: (args) => renderSheet(templateSrc, mockGearSheetContext(args.overrides)),
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
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        void expect(cv.getByDisplayValue('Medi-Kit')).toBeTruthy();
    },
};
