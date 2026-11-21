import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/quick-template-dialog.hbs?raw';
import { captureActionClicks, renderSheet } from '../../../../stories/test-helpers';
import { buildQuickTemplateContext, initialQuickTemplateState, type QuickTemplateState, withShapeKind } from './quick-template-view.ts';

/** #758: the quick-template form. Its context comes from the same view-model the dialog renders. */
interface Args {
    state: QuickTemplateState;
}

const CONDITIONS = [
    { id: 'blinded', label: 'Blinded' },
    { id: 'deafened', label: 'Deafened' },
    { id: 'stunned', label: 'Stunned' },
];

const meta = {
    title: 'Dialogs/QuickTemplateDialog',
    render: (args) => renderSheet(templateSrc, buildQuickTemplateContext(args.state, CONDITIONS)),
    args: { state: initialQuickTemplateState() },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Opens as a 4 m circle that blocks sight, no condition, until removed: the smoke grenade case. */
export const SmokeCircle: Story = {
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="kind"]')?.value).toBe('circle');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="primary"]')?.value).toBe('4');
        await expect(canvasElement.querySelector('input[name="secondary"]')).toBeNull();
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="blocksSight"]')?.checked).toBe(true);
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="condition"]')?.value).toBe('');
        await expect(canvasElement.querySelector('button[data-action="place"]')?.hasAttribute('disabled')).toBe(false);
    },
};

/** The player's Blind Grenade: a 4 m cloud that blocks sight and blinds the tokens inside for 12 rounds. */
export const BlindGrenade: Story = {
    args: { state: { ...initialQuickTemplateState(), condition: 'blinded', duration: 12, name: 'Blind Grenade' } },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector<HTMLSelectElement>('select[name="condition"]')?.value).toBe('blinded');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="duration"]')?.value).toBe('12');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('Blind Grenade');
    },
};

/** A flamer's cone: a length and an opening angle, aimed when placed. */
export const FlamerCone: Story = {
    args: { state: { ...withShapeKind(initialQuickTemplateState(), 'cone'), blocksSight: false } },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Length (m)')).toBeTruthy();
        await expect(view.getByText('Angle (°)')).toBeTruthy();
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="secondary"]')?.value).toBe('30');
        await expect(canvasElement.querySelector<HTMLInputElement>('input[name="blocksSight"]')?.checked).toBe(false);
    },
};

/** A size that is not positive cannot be placed. */
export const InvalidSize: Story = {
    args: { state: { ...initialQuickTemplateState(), primary: 0 } },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('button[data-action="place"]')?.hasAttribute('disabled')).toBe(true);
    },
};

/** Place and Clear send the actions the dialog handles. */
export const Actions: Story = {
    play: async ({ canvasElement }) => {
        const clicks = captureActionClicks(canvasElement);
        canvasElement.querySelector<HTMLElement>('[data-action="place"]')?.click();
        canvasElement.querySelector<HTMLElement>('[data-action="clear"]')?.click();
        await expect(clicks.map((c) => c.action)).toEqual(['place', 'clear']);
    },
};
