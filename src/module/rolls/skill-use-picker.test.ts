import { describe, expect, it } from 'vitest';
import { itemChoiceContent } from './skill-use-picker.ts';

/**
 * The item-choice picker's content (#668). Its choices used to be one footer row
 * of buttons, so many choices or a long name ("Lost Home World") overflowed. They
 * are now buttons in a wrapping grid, each with the item's id as its action.
 */

const ITEMS = [
    { id: 'Compendium.wh40k-rpg.ow.Item.lost', name: 'Lost Home World' },
    { id: 'Compendium.wh40k-rpg.ow.Item.doomed', name: 'Doomed' },
    { id: 'evil', name: '<img src=x onerror=alert(1)>' },
];

describe('itemChoiceContent', () => {
    const content = itemChoiceContent(ITEMS, 'Choose the drawback your regiment took.');

    it('is a bare div, as DialogV2 requires, holding the hint and the choices', () => {
        expect(content.tagName).toBe('DIV');
        expect(content.attributes).toHaveLength(0);
        expect(content.querySelector('p')?.textContent).toBe('Choose the drawback your regiment took.');
    });

    it('gives each item a button whose action is its id', () => {
        const buttons = Array.from(content.querySelectorAll<HTMLButtonElement>('[data-item-choices] button'));
        expect(buttons.map((button) => [button.type, button.dataset['action'], button.querySelector('span')?.textContent])).toEqual(
            ITEMS.map((item) => ['button', item.id, item.name]),
        );
    });

    it('lays the choices out as a wrapping grid whose buttons wrap their names', () => {
        const grid = content.querySelector('[data-item-choices]');
        expect(grid?.className).toContain('tw-grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]');
        expect(grid?.closest('.wh40k-rpg')).not.toBeNull();
        expect(Array.from(grid?.querySelectorAll('button') ?? []).every((button) => button.className.includes('tw-whitespace-normal'))).toBe(true);
    });

    it('puts a name in as text, never markup', () => {
        expect(content.querySelector('img')).toBeNull();
    });
});
