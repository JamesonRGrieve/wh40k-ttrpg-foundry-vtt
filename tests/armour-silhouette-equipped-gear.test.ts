/**
 * Regression tests for the body-preview equipped-gear cluster (#334).
 *
 * The armour silhouette previously showed only armour fitted to body locations.
 * It now also renders every equipped non-armour item (gear, cybernetics, active
 * force fields) as a worn/active icon cluster below the body. These tests pin:
 *
 *   - the cluster renders one icon button per equipped-gear entry, each opening
 *     its item (data-action="itemEdit") and labelled with the item name;
 *   - no cluster renders when there is no equipped gear (empty / absent list).
 *
 * A minimal armourDisplay stub satisfies the silhouette's required context.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import silhouetteSrc from '../src/templates/actor/partial/armour-silhouette.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const template = HbsStory.compile(silhouetteSrc);

const LOCATIONS = ['head', 'rightArm', 'leftArm', 'body', 'rightLeg', 'leftLeg'] as const;

interface GearIcon {
    id: string;
    name: string;
    img: string;
}

function render(equippedGear: GearIcon[] | undefined): HTMLElement {
    const armourDisplay: Record<string, { total: number; items: never[]; tooltipData: string }> = {};
    for (const loc of LOCATIONS) armourDisplay[loc] = { total: 0, items: [], tooltipData: '' };
    const html = template({ armourDisplay, equippedGear, compact: false });
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

const GEAR: GearIcon[] = [
    { id: 'g1', name: 'Auspex', img: 'auspex.svg' },
    { id: 'c1', name: 'Cortex Implant', img: 'cortex.svg' },
];

describe('armour-silhouette — equipped-gear cluster (#334)', () => {
    it('renders one icon button per equipped-gear item, each opening its item', () => {
        const root = render(GEAR);
        const buttons = root.querySelectorAll('button[data-action="itemEdit"]');
        expect(buttons).toHaveLength(GEAR.length);
        const ids = Array.from(buttons).map((b) => b.getAttribute('data-item-id'));
        expect(ids).toEqual(['g1', 'c1']);
        // Each carries the item name + image.
        const auspex = root.querySelector('button[data-item-id="g1"]');
        expect(auspex?.getAttribute('title')).toBe('Auspex');
        expect(auspex?.querySelector('img')?.getAttribute('src')).toBe('auspex.svg');
    });

    it('renders no cluster when there is no equipped gear', () => {
        expect(render([]).querySelectorAll('button[data-action="itemEdit"]')).toHaveLength(0);
        expect(render(undefined).querySelectorAll('button[data-action="itemEdit"]')).toHaveLength(0);
    });
});
