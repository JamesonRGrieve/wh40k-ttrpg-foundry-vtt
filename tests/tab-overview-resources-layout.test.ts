/**
 * Regression guard (#236): the overview Resources panel (Influence / Requisition
 * / Throne Gelt) must lay its controls out HORIZONTALLY, side by side.
 *
 * History: a fixed 3-column grid clipped the −/input/+ steppers; the first fix
 * over-corrected to `grid-cols-[repeat(auto-fit,minmax(8rem,1fr))]`, whose 8rem
 * minimum forced the columns to wrap to a vertical stack in the narrow zone. The
 * fix uses a fixed column count (1 RAW / 2 when Gelt hidden / 3 otherwise) so the
 * cells stay on one row, while the number inputs keep `min-w-0` so they shrink to
 * share the row with the fixed-width steppers instead of clipping.
 *
 * Source-scan rather than runtime: rendering the tab requires Foundry's sheet
 * context, and the contract here is a literal one on the grid + input classes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const TEMPLATE = resolve(__dirname, '../src/templates/actor/player/tab-overview.hbs');
const src = readFileSync(TEMPLATE, 'utf8');

/** The opening tag of the resources grid `<div>` (the element wrapping the three resource cells). */
function resourcesGridTag(): string {
    // The grid sits right after the "Resources (Influence / Requisition / Gelt)" comment.
    const anchor = src.indexOf('Resources (Influence');
    expect(anchor, 'resources panel comment present').toBeGreaterThan(-1);
    const divStart = src.indexOf('<div class="tw-grid', anchor);
    expect(divStart, 'resources grid div present').toBeGreaterThan(-1);
    return src.slice(divStart, src.indexOf('>', divStart) + 1);
}

describe('overview Resources panel layout (#236)', () => {
    it('uses a fixed column count (horizontal), not an auto-fit grid that wraps to a vertical stack', () => {
        const grid = resourcesGridTag();
        expect(grid).toContain('tw-grid-cols-3');
        expect(grid).toContain('tw-grid-cols-2');
        expect(grid).toContain('tw-grid-cols-1');
        // The auto-fit minmax form is what caused the vertical stacking.
        expect(grid).not.toContain('auto-fit');
        expect(grid).not.toContain('minmax');
    });

    it('keeps the resource number inputs shrinkable (min-w-0) so they do not clip the steppers', () => {
        for (const name of ['system.influence', 'system.requisition', 'system.throneGelt']) {
            const re = new RegExp(`<input[^>]*name="${name.replace('.', '\\.')}"[^>]*>`);
            const input = re.exec(src)?.[0] ?? '';
            expect(input, `input for ${name}`).toContain('tw-min-w-0');
        }
    });
});
