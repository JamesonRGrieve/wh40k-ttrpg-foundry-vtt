/**
 * Storybook stories for the grapple dialogs (#665): the GM's Push Opponent token
 * move (direction, and whether the controller follows or lets go) and the
 * Ready / Use Item item picker. Grappling is in every line and the dialogs are the
 * same in each, so the stories frame each at the DialogV2 width it opens at, inside
 * the `.wh40k-rpg` scope the dialog carries.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import { grapplePushCompass, readGrapplePushForm } from '../../module/actions/grapple-controls';
import itemDialogSrc from './grapple-item-dialog.hbs?raw';
import pushDialogSrc from './grapple-push-dialog.hbs?raw';

initializeStoryHandlebars();

/** Render a dialog body at its DialogV2 content width. */
function frame(width: number, body: HTMLElement): HTMLElement {
    const wrapper = document.createElement('form');
    wrapper.classList.add('wh40k-rpg');
    wrapper.style.width = `${width}px`;
    wrapper.style.padding = '16px';
    wrapper.appendChild(body);
    return wrapper;
}

const meta: Meta = { title: 'Grapple/Dialogs (#665)' };
export default meta;
type Story = StoryObj;

/** The checked value of a radio group in the rendered form (read off the property: happy-dom's `:checked` follows the attribute). */
function checked(root: HTMLElement, name: string): string {
    return [...root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].find((radio) => radio.checked)?.value ?? '';
}

/** The push dialog: a compass of eight directions round the opponent, north chosen, the controller following. */
export const PushDialog: Story = {
    render: () => frame(388, renderSheet(pushDialogSrc, { targetName: 'Cultist', metres: 4, directions: grapplePushCompass() })),
    play: async ({ canvasElement }) => {
        const radios = [...canvasElement.querySelectorAll<HTMLInputElement>('input[name="direction"]')];
        await expect(radios.map((radio) => radio.value)).toEqual(['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']);
        await expect(canvasElement.querySelector('[data-grapple-push-centre]')?.textContent).toBe('Cultist');
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.Grapple.Push.Dir.ne'));
        await expect(readGrapplePushForm({ direction: checked(canvasElement, 'direction'), controller: checked(canvasElement, 'controller') })).toEqual({
            direction: 'n',
            follow: true,
        });
        // Every radio is inside its label, so a click on the text picks it.
        await expect(radios.every((radio) => radio.closest('label') !== null)).toBe(true);
    },
};

/** Picking a direction and letting go is what the dialog reads back. */
export const PushLetGo: Story = {
    render: () => frame(388, renderSheet(pushDialogSrc, { targetName: 'Cultist', metres: 4, directions: grapplePushCompass() })),
    play: async ({ canvasElement }) => {
        canvasElement.querySelector<HTMLInputElement>('input[name="direction"][value="sw"]')?.click();
        canvasElement.querySelector<HTMLInputElement>('input[name="controller"][value="let-go"]')?.click();
        await expect(readGrapplePushForm({ direction: checked(canvasElement, 'direction'), controller: checked(canvasElement, 'controller') })).toEqual({
            direction: 'sw',
            follow: false,
        });
        await expect(canvasElement.textContent).toContain(localizeKey('WH40K.Grapple.Push.LetGo'));
    },
};

/** The item picker: the actor's offered items, the first chosen; a click picks another. */
export const ItemDialog: Story = {
    render: () =>
        frame(
            348,
            renderSheet(itemDialogSrc, {
                legend: 'Items of Sister Ophelia',
                items: [
                    { uuid: 'Actor.o.Item.k', name: 'Mono-knife', img: 'icons/svg/item-bag.svg', checked: true },
                    { uuid: 'Actor.o.Item.p', name: 'Laspistol', img: 'icons/svg/item-bag.svg', checked: false },
                ],
            }),
        ),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('legend')?.textContent).toBe('Items of Sister Ophelia');
        await expect(checked(canvasElement, 'itemUuid')).toBe('Actor.o.Item.k');
        canvasElement.querySelector<HTMLInputElement>('input[value="Actor.o.Item.p"]')?.click();
        await expect(checked(canvasElement, 'itemUuid')).toBe('Actor.o.Item.p');
    },
};
