/**
 * Smoke tests for the generic `panel.hbs` block-partial.
 *
 * The partial wraps a body in the standard 3-element scaffold (outer wh40k-panel,
 * header with icon + title + optional count, body). These tests pin the contract
 * the existing 80+ static-header panels rely on:
 *   - the partial-block body renders inside `.wh40k-panel-body`;
 *   - `label` / `icon` populate the title (and the icon is omitted when not given);
 *   - `count`, `rootClass`, `headerClass`, `bodyClass` flow through unchanged so
 *     migrated panels render byte-equivalent classes / extra slots to the
 *     hand-rolled originals.
 */

import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { initializeStoryHandlebars } from '../stories/template-support';
import panelSrc from '../src/templates/actor/partial/panel.hbs?raw';

initializeStoryHandlebars();

Handlebars.registerPartial('panel-test', panelSrc);

const wrap = (innerBody: string) => Handlebars.compile(`{{#> panel-test ${'label="Armour" icon="fa-shield-alt"'} }}${innerBody}{{/panel-test}}`);

const wrapWith = (hashLiteral: string, innerBody: string) => Handlebars.compile(`{{#> panel-test ${hashLiteral}}}${innerBody}{{/panel-test}}`);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('panel.hbs block-partial', () => {
    it('renders a header with icon + label and a body containing the partial-block', () => {
        const html = wrap('<div class="custom-body">body markup</div>')({});
        const root = dom(html);
        expect(root.querySelector('.wh40k-panel')).not.toBeNull();
        expect(root.querySelector('.wh40k-panel-header')).not.toBeNull();
        expect(root.querySelector('.wh40k-panel-title')?.textContent?.trim()).toContain('Armour');
        expect(root.querySelector('.fa-shield-alt')).not.toBeNull();
        expect(root.querySelector('.wh40k-panel-body .custom-body')?.textContent).toBe('body markup');
    });

    it('omits the icon element when icon is not provided', () => {
        const html = wrapWith('label="Bonuses"', '<span class="x">x</span>')({});
        const root = dom(html);
        expect(root.querySelector('.wh40k-panel-title i.fas')).toBeNull();
        expect(root.querySelector('.wh40k-panel-title')?.textContent?.trim()).toBe('Bonuses');
    });

    it('passes rootClass / headerClass / bodyClass through verbatim', () => {
        const html = wrapWith(
            'label="Effects" icon="fa-magic" rootClass="wh40k-effects-panel tw-col-auto" headerClass="wh40k-panel-header--clickable" bodyClass="tw-p-3"',
            '<div></div>',
        )({});
        const root = dom(html);
        expect(root.querySelector('.wh40k-panel')?.className).toContain('wh40k-effects-panel');
        expect(root.querySelector('.wh40k-panel')?.className).toContain('tw-col-auto');
        expect(root.querySelector('.wh40k-panel-header')?.className).toContain('wh40k-panel-header--clickable');
        expect(root.querySelector('.wh40k-panel-body')?.className).toContain('tw-p-3');
    });

    it('renders the count badge slot only when count is truthy', () => {
        const without = dom(wrapWith('label="Effects"', 'b')({}));
        expect(without.querySelector('.wh40k-panel-count')).toBeNull();

        const withCount = dom(wrapWith('label="Effects" count=3', 'b')({}));
        expect(withCount.querySelector('.wh40k-panel-count')?.textContent).toBe('3');
    });

    it('contains tw-* utilities and structural hook classes when no extra classes are given', () => {
        // After Tailwind migration the elements carry both the structural JS-hook class
        // (wh40k-panel, wh40k-panel-header, wh40k-panel-body) and tw-* utilities.
        // Verify hook classes are present and no stray empty-string class tokens appear.
        const html = wrapWith('label="X"', 'body')({});
        const root = dom(html);
        const panel = root.querySelector('.wh40k-panel') as HTMLElement;
        expect(panel.classList.contains('wh40k-panel')).toBe(true);
        expect([...panel.classList].some((c) => c.startsWith('tw-'))).toBe(true);
        const header = root.querySelector('.wh40k-panel-header') as HTMLElement;
        expect(header.classList.contains('wh40k-panel-header')).toBe(true);
        expect([...header.classList].some((c) => c.startsWith('tw-'))).toBe(true);
        const body = root.querySelector('.wh40k-panel-body') as HTMLElement;
        expect(body.classList.contains('wh40k-panel-body')).toBe(true);
        expect([...body.classList].some((c) => c.startsWith('tw-'))).toBe(true);
    });
});
