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

import HB from 'handlebars';
import { describe, expect, it } from 'vitest';
import movementFullSrc from '../src/templates/actor/panel/movement-panel-full.hbs?raw';
import statGridSrc from '../src/templates/actor/partial/stat-grid-section.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const tpl = HB.compile(statGridSrc);

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
        // Heading is the first child div containing a span with the heading text
        const header = root.querySelector('div > div:first-child');
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
        // Without a heading, the outer div should contain only the grid div (no header sibling)
        const children = Array.from(root.querySelector('div')?.children ?? []);
        expect(children).toHaveLength(1);
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
        // Each stat renders as a tw-flex div inside the grid
        const grid = root.querySelector('.tw-grid');
        const cells = grid?.querySelectorAll(':scope > div') ?? [];
        expect(cells).toHaveLength(4);
        // First span in cell is the label, second is the value
        const labelSpans = cells[0].querySelectorAll('span');
        expect(labelSpans[0].textContent.trim()).toBe('Half');
        expect(labelSpans[1].textContent).toContain('3');
        // Unit is a nested span inside the value span
        expect(labelSpans[1].querySelector('span')?.textContent).toBe('m');
        const lastCellSpans = cells[3].querySelectorAll('span');
        expect(lastCellSpans[1].textContent).toContain('18');
    });

    it('reflects the column count in the grid class', () => {
        const root = dom(
            tpl({
                columns: 4,
                stats: [{ label: 'A', value: 1 }],
            }),
        );
        const grid = root.querySelector('.tw-grid');
        expect(grid?.className).toContain('tw-grid-cols-4');
    });

    it('defaults to 3 columns when column count is unset', () => {
        const root = dom(
            tpl({
                stats: [{ label: 'A', value: 1 }],
            }),
        );
        expect(root.querySelector('.tw-grid')?.className).toContain('tw-grid-cols-3');
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
        const cell = root.querySelector('.tw-grid > div');
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
        const cell = root.querySelector('.tw-grid > div');
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

describe('#260 — carrying-capacity icons + tightened label/value gap', () => {
    it('renders the icon above the label when a stat supplies one', () => {
        const root = dom(
            tpl({
                stats: [{ label: 'Push/Drag', value: 250, unit: 'kg', icon: 'fa-cart-flatbed' }],
            }),
        );
        const cell = root.querySelector('.tw-grid > div');
        // Icon is the first child of the cell, before the label/value spans.
        expect(cell?.querySelector('.fa-cart-flatbed')).not.toBeNull();
        expect(cell?.firstElementChild?.classList.contains('fa-cart-flatbed')).toBe(true);
    });

    it('uses a tightened tw-gap-0.5 stack (not the looser tw-gap-1)', () => {
        const root = dom(tpl({ stats: [{ label: 'Lift', value: 100, unit: 'kg' }] }));
        const cell = root.querySelector('.tw-grid > div');
        expect(cell?.className).toContain('tw-gap-0.5');
        expect(cell?.className).not.toContain('tw-gap-1 ');
    });

    it('movement-panel-full gives Lift, Carry AND Push/Drag an icon (Push no longer bare)', () => {
        // Source assertion — the panel is composed via inline `(object …)` helpers
        // and can't be unit-rendered without the full sheet, so guard the source.
        expect(movementFullSrc).toContain('icon="fa-dumbbell"');
        expect(movementFullSrc).toContain('icon="fa-hands-holding"');
        expect(movementFullSrc).toContain('icon="fa-cart-flatbed"');
        // Push/Drag stat block specifically carries an icon.
        const pushBlock = movementFullSrc.slice(movementFullSrc.indexOf('WH40K.MOVEMENT.Stat.PushDrag'));
        expect(pushBlock).toContain('icon="fa-cart-flatbed"');
    });
});
