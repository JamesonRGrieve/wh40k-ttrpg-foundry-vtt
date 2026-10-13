/**
 * ShipActionDialog (#186, #189) renders `ship-action-dialog.hbs` from the real
 * ship-action flow's input groups:
 *
 *   1. Hold Fast! — the acting character's Willpower target (crew rating by
 *      default) and a situational modifier; no effect choice.
 *   2. Lock on Target — adds the Weapon Component select.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, userEvent } from 'storybook/test';
import { STORY_HOLD_FAST, STORY_LOCK_ON_TARGET, storyActionShip, storyLocalize } from '../../../../stories/mocks/ship-assault';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/prompt/ship-action-dialog.hbs?raw';
import { readAssaultForm } from '../ship-assault/ship-assault-fields.ts';
import { shipActionInputGroups, type ShipActionOrder } from './ship-action-flow.ts';

initializeStoryHandlebars();

interface DialogArgs {
    order: ShipActionOrder;
    requirements: string;
}

function renderDialog(args: DialogArgs): HTMLElement {
    return renderSheet(templateSrc, {
        title: args.order.name,
        requirements: args.requirements,
        groups: shipActionInputGroups({ ship: storyActionShip(), order: args.order, localize: storyLocalize, degreesMethod: 'gen1' }),
    });
}

const meta = {
    title: 'Prompts/ShipActionDialog (#186)',
    render: (args) => renderDialog(args),
    args: { order: STORY_HOLD_FAST, requirements: "Air of Authority (or a similar Talent at the GM's discretion)" },
} satisfies Meta<DialogArgs>;
export default meta;

type Story = StoryObj<DialogArgs>;

export const HoldFast: Story = {
    play: async ({ canvasElement }) => {
        const skill = canvasElement.querySelector<HTMLInputElement>('input[name="skill"]');
        await expect(skill?.value).toBe('40');
        await expect(canvasElement.textContent).toContain('Willpower target');
        await expect(canvasElement.textContent).toContain('Air of Authority');
        await expect(canvasElement.querySelector('select')).toBeNull();
        if (skill !== null) {
            await userEvent.clear(skill);
            await userEvent.type(skill, '52');
        }
        await expect(readAssaultForm(canvasElement).number('skill', 0)).toBe(52);
        await expect(canvasElement.querySelector('[data-action="rollShipAction"]')).toBeTruthy();
    },
};

export const LockOnTarget: Story = {
    args: { order: STORY_LOCK_ON_TARGET, requirements: '' },
    play: async ({ canvasElement }) => {
        const weapon = canvasElement.querySelector<HTMLSelectElement>('select[name="weapon"]');
        await expect([...(weapon?.options ?? [])].map((option) => option.textContent)).toEqual(['Sunsear Laser Battery', 'Titanforge Lance']);
        if (weapon !== null) await userEvent.selectOptions(weapon, 'lance');
        await expect(readAssaultForm(canvasElement).text('weapon', '')).toBe('lance');
    },
};
