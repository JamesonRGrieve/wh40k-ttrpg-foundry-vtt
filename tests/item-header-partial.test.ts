/**
 * Smoke tests for the canonical item-header partial.
 *
 * The partial at src/templates/item/panel/item-header.hbs is shared by every
 * "simple" item sheet (talent-base, ship-component, ship-weapon, ship-upgrade,
 * etc.). The Foundry form parser writes back through the `name=` paths in the
 * rendered HTML, so any drift in those paths silently breaks save/load. These
 * tests pin down:
 *
 *   - the name-input emits `name="name"` and a fixed canonical class set;
 *   - the image edit overlay carries `data-action="editImage"` and `data-edit="img"`;
 *   - placeholder resolution falls back through `namePlaceholder` ->
 *     `namePlaceholderKey` -> default i18n key;
 *   - the type badge renders the `typeLabel` / `typeLabelKey` / default
 *     `TYPES.Item.{type}` chain in priority order;
 *   - `hideTypeBadge=true` suppresses the default badge entirely so callers
 *     who compose their own meta block do not double-render.
 */

import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { initializeStoryHandlebars } from '../stories/template-support';
import itemHeaderSrc from '../src/templates/item/panel/item-header.hbs?raw';

initializeStoryHandlebars();

// Register the partial under its real prefix path so block-partial composition
// (`{{#> systems/wh40k-rpg/... }}`) resolves the same way it does at runtime.
Handlebars.registerPartial('systems/wh40k-rpg/templates/item/panel/item-header.hbs', itemHeaderSrc);
const directTemplate = Handlebars.compile(itemHeaderSrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

function baseContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        item: {
            name: 'Test Item',
            img: 'icons/test.svg',
            type: 'trait',
            icon: 'fa-shield-alt',
        },
        system: {},
        ...overrides,
    };
}

describe('item-header partial — name input', () => {
    it('emits name="name" with the canonical class and value', () => {
        const html = directTemplate(baseContext({ item: { name: 'Iron Jaw', img: 'i.svg', type: 'talent', icon: 'fa-bolt' } }));
        const input = dom(html).querySelector('input[name="name"]');
        expect(input).not.toBeNull();
        expect(input?.getAttribute('value')).toBe('Iron Jaw');
        expect(input?.className).toContain('wh40k-item-header__name');
    });

    it('uses raw namePlaceholder when provided (highest priority)', () => {
        const html = directTemplate(baseContext({ namePlaceholder: 'Component Name' }));
        const input = dom(html).querySelector('input[name="name"]');
        expect(input?.getAttribute('placeholder')).toBe('Component Name');
    });

    it('falls back to the default i18n key when no overrides are set', () => {
        // The story-mode localize helper returns the key unchanged when no
        // translation table is registered, which is the contract we want to
        // assert: the default key is `WH40K.Item.NamePlaceholder`.
        const html = directTemplate(baseContext());
        const input = dom(html).querySelector('input[name="name"]');
        expect(input?.getAttribute('placeholder')).toBe('WH40K.Item.NamePlaceholder');
    });

    it('uses namePlaceholderKey when no raw namePlaceholder is given', () => {
        const html = directTemplate(baseContext({ namePlaceholderKey: 'WH40K.Custom.Placeholder' }));
        const input = dom(html).querySelector('input[name="name"]');
        expect(input?.getAttribute('placeholder')).toBe('WH40K.Custom.Placeholder');
    });
});

describe('item-header partial — image overlay', () => {
    it('renders editImage action with data-edit="img"', () => {
        const html = directTemplate(baseContext());
        const wrap = dom(html).querySelector('.wh40k-item-header__image');
        expect(wrap?.getAttribute('data-action')).toBe('editImage');
        expect(wrap?.getAttribute('data-edit')).toBe('img');
        expect(wrap?.querySelector('img')?.getAttribute('src')).toBe('icons/test.svg');
    });
});

describe('item-header partial — type badge', () => {
    it('falls back to TYPES.Item.{item.type} when no overrides are passed', () => {
        const html = directTemplate(baseContext({ item: { name: 'X', img: 'i.svg', type: 'trait', icon: 'fa-shield-alt' } }));
        const badge = dom(html).querySelector('.wh40k-badge--type');
        expect(badge).not.toBeNull();
        // The template-support localize helper resolves real i18n keys when
        // available; en.json defines TYPES.Item.trait => "Trait".
        expect(badge?.textContent?.trim()).toBe('Trait');
        expect(badge?.querySelector('i')?.className).toContain('fa-shield-alt');
    });

    it('typeLabel takes precedence over typeLabelKey and the default lookup', () => {
        const html = directTemplate(
            baseContext({
                typeLabel: 'Custom Trait Label',
                typeLabelKey: 'WH40K.Items.Trait',
                typeIcon: 'fa-bolt',
            }),
        );
        const badge = dom(html).querySelector('.wh40k-badge--type');
        expect(badge?.textContent?.trim()).toBe('Custom Trait Label');
        expect(badge?.getAttribute('title')).toBe('Custom Trait Label');
        expect(badge?.querySelector('i')?.className).toContain('fa-bolt');
    });

    it('typeLabelKey is used when no typeLabel is supplied', () => {
        const html = directTemplate(
            baseContext({
                typeLabelKey: 'WH40K.ShipComponent',
                typeIcon: 'fa-cog',
            }),
        );
        const badge = dom(html).querySelector('.wh40k-badge--type');
        expect(badge?.textContent?.trim()).toBe('WH40K.ShipComponent');
        expect(badge?.querySelector('i')?.className).toContain('fa-cog');
    });

    it('hideTypeBadge=true suppresses the default badge entirely', () => {
        const html = directTemplate(baseContext({ hideTypeBadge: true }));
        const badge = dom(html).querySelector('.wh40k-badge--type');
        expect(badge).toBeNull();
    });
});

describe('item-header partial — tier / category badges', () => {
    it('renders the tier badge when system.tier is truthy', () => {
        const html = directTemplate(baseContext({ system: { tier: 3 } }));
        const tier = dom(html).querySelector('.wh40k-badge--tier');
        expect(tier).not.toBeNull();
        expect(tier?.textContent?.trim()).toBe('T3');
    });

    it('renders the category badge when system.category is set', () => {
        const html = directTemplate(baseContext({ system: { category: 'Forbidden Lore' } }));
        const cat = dom(html).querySelector('.wh40k-badge--category');
        expect(cat).not.toBeNull();
        expect(cat?.textContent?.trim()).toBe('Forbidden Lore');
    });

    it('omits both default extras when system has neither field', () => {
        const html = directTemplate(baseContext());
        expect(dom(html).querySelector('.wh40k-badge--tier')).toBeNull();
        expect(dom(html).querySelector('.wh40k-badge--category')).toBeNull();
    });
});

