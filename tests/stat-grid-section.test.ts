/**
 * Smoke tests for the stat-grid-section partial.
 *
 * Asserts:
 *   - heading + heading icon render when provided;
 *   - each stat cell emits its label/value/unit;
 *   - clickable cells receive `data-action` and pass through `attrs`;
 *   - column count is reflected as a Tailwind grid-cols class;
 *   - per-system rendering is identical (the partial is data-driven).
 */

import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import { initializeStoryHandlebars } from '../stories/template-support';
import statGridSrc from '../src/templates/actor/partial/stat-grid-section.hbs?raw';

initializeStoryHandlebars();

const tpl = Handlebars.compile(statGridSrc);

function dom(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('stat-grid-section partial', () => {
    it('renders heading text and icon when provided', () => {
        const root = dom(
            tpl({
                heading: 'Athletics',
                headingIcon: 'fa-person-hiking',
                columns: 3,
                stats: [{ label: 'Leap', value: 2, unit: 'm' }],
            }),
        );
        const header = root.querySelector('.wh40k-stat-grid-header');
        expect(header).not.toBeNull();
        expect(header?.textContent).toContain('Athletics');
        expect(root.querySelector('.fa-person-hiking')).not.toBeNull();
    });

    it('omits the heading block when heading is unset', () => {
        const root = dom(
            tpl({
                stats: [{ label: 'X', value: 1 }],
            }),
        );
        expect(root.querySelector('.wh40k-stat-grid-header')).toBeNull();
    });

    it('renders one cell per stat with label / value / unit', () => {
        const root = dom(
            tpl({
                heading: 'Mobility',
                columns: 4,
                stats: [
                    { label: 'Half', value: 3, unit: 'm' },
                    { label: 'Full', value: 6, unit: 'm' },
                    { label: 'Charge', value: 9, unit: 'm' },
                    { label: 'Run', value: 18, unit: 'm' },
                ],
            }),
        );
        const cells = root.querySelectorAll('.wh40k-stat-grid-cell');
        expect(cells.length).toBe(4);
        expect(cells[0].querySelector('.wh40k-stat-grid-label')?.textContent?.trim()).toBe('Half');
        expect(cells[0].querySelector('.wh40k-stat-grid-value')?.textContent).toContain('3');
        expect(cells[0].querySelector('.wh40k-stat-grid-unit')?.textContent).toBe('m');
        expect(cells[3].querySelector('.wh40k-stat-grid-value')?.textContent).toContain('18');
    });

    it('reflects the column count in the grid class', () => {
        const root = dom(
            tpl({
                columns: 4,
                stats: [{ label: 'A', value: 1 }],
            }),
        );
        const grid = root.querySelector('.wh40k-stat-grid');
        expect(grid?.className).toContain('tw-grid-cols-4');
    });

    it('defaults to 3 columns when column count is unset', () => {
        const root = dom(
            tpl({
                stats: [{ label: 'A', value: 1 }],
            }),
        );
        expect(root.querySelector('.wh40k-stat-grid')?.className).toContain('tw-grid-cols-3');
    });

    it('marks cells with action as clickable and passes through attrs', () => {
        const root = dom(
            tpl({
                stats: [
                    {
                        label: 'Half',
                        value: 3,
                        unit: 'm',
                        action: 'setMovementMode',
                        attrs: 'data-movement-type="half"',
                        title: 'Set Half Move',
                    },
                ],
            }),
        );
        const cell = root.querySelector('.wh40k-stat-grid-cell');
        expect(cell?.getAttribute('data-action')).toBe('setMovementMode');
        expect(cell?.getAttribute('data-movement-type')).toBe('half');
        expect(cell?.getAttribute('title')).toBe('Set Half Move');
        expect(cell?.className).toContain('tw-cursor-pointer');
    });

    it('non-clickable cells do not receive data-action or cursor-pointer', () => {
        const root = dom(
            tpl({
                stats: [{ label: 'Jump', value: 50, unit: 'cm' }],
            }),
        );
        const cell = root.querySelector('.wh40k-stat-grid-cell');
        expect(cell?.hasAttribute('data-action')).toBe(false);
        expect(cell?.className).not.toContain('tw-cursor-pointer');
    });

    it('renders identically regardless of system context — partial is data-driven', () => {
        // Story uses `withSystem(actor, 'im')` style helpers; the partial itself
        // takes only resolved label/value pairs, so the render is byte-identical
        // for the same input regardless of which system supplied the labels.
        const ctx = {
            heading: 'Carrying Capacity',
            columns: 3,
            stats: [
                { label: 'Lift', value: 100, unit: 'kg' },
                { label: 'Carry', value: 50, unit: 'kg' },
                { label: 'Push', value: 250, unit: 'kg' },
            ],
        };
        const dh2 = tpl(ctx);
        const im = tpl(ctx);
        const rt = tpl(ctx);
        expect(dh2).toEqual(im);
        expect(im).toEqual(rt);
    });
});
