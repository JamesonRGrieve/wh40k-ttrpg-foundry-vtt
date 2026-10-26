/**
 * Regression (#699): the shared editable portrait puts `data-edit` on its <img>,
 * never on the wrapper. A sheet's form data reads every [data-edit] element, an
 * <img> by its src and anything else by its innerHTML. With `data-edit="img"` on
 * the wrapper div, every save of an item sheet sent the portrait's `<img …>`
 * markup as `img`; the document rejected it and stored a placeholder, so a gear
 * item's sack became a hooded figure after any edit.
 */
import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import portraitSrc from '../src/templates/shared/editable-portrait.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();
const portrait = HbsStory.compile(portraitSrc);

function render(context: object): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = portrait(context);
    return root;
}

/** What a form's data would read for each [data-edit] element: an img's src, else its markup. */
function formEditValues(root: HTMLElement): Array<{ tag: string; value: string }> {
    return Array.from(root.querySelectorAll<HTMLElement>('[data-edit]'), (el) => ({
        tag: el.tagName,
        value: el.tagName === 'IMG' ? el.getAttribute('src') ?? '' : el.innerHTML.trim(),
    }));
}

describe('editable portrait form data (#699)', () => {
    it('the wrapped portrait submits the image path, not the <img> markup', () => {
        const root = render({ src: 'icons/svg/item-bag.svg', alt: 'Rope' });
        expect(formEditValues(root)).toEqual([{ tag: 'IMG', value: 'icons/svg/item-bag.svg' }]);
        // The edit action sits on the same element, so the file picker reads `data-edit`.
        expect(root.querySelector('[data-action="editImage"]')?.tagName).toBe('IMG');
    });

    it('the bare image mode submits the image path too', () => {
        const root = render({ src: 'icons/svg/item-bag.svg', imgOnly: true });
        expect(formEditValues(root)).toEqual([{ tag: 'IMG', value: 'icons/svg/item-bag.svg' }]);
    });

    it('the hover overlay lets clicks through to the image', () => {
        const root = render({ src: 'icons/svg/item-bag.svg' });
        const overlay = root.querySelector('img + div');
        expect(overlay?.classList.contains('tw-pointer-events-none')).toBe(true);
    });

    it('editAttr=false emits no data-edit, so the form carries no img at all', () => {
        expect(formEditValues(render({ src: 'icons/svg/item-bag.svg', editAttr: false }))).toEqual([]);
    });
});
