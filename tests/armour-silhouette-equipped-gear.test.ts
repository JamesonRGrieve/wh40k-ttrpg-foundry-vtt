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

interface ArmourItemIcon {
    id: string;
    name: string;
    img: string;
    tooltipData: string;
}

function render(equippedGear: GearIcon[] | undefined, locationItems: Partial<Record<(typeof LOCATIONS)[number], ArmourItemIcon[]>> = {}): HTMLElement {
    const armourDisplay: Record<string, { total: number; items: ArmourItemIcon[]; tooltipData: string }> = {};
    for (const loc of LOCATIONS) armourDisplay[loc] = { total: 0, items: locationItems[loc] ?? [], tooltipData: '' };
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

describe('armour-silhouette — fitted armour icons per body location (#486)', () => {
    // Guards the render side of #486: the builder was populating every location's
    // `items` with [] (it filtered on `system.equipped`, but equipped lives under
    // `system.state.equipped`), so this per-location icon loop had nothing to draw.
    // With the data fixed, each location's fitted armour must render as an icon.
    const HELM: ArmourItemIcon = { id: 'a-helm', name: 'Flak Helm', img: 'helm.webp', tooltipData: '{}' };
    const CARAPACE: ArmourItemIcon = { id: 'a-body', name: 'Carapace Chest', img: 'carapace.webp', tooltipData: '{}' };

    it('renders an icon button for each armour item fitted to a body location', () => {
        const root = render(undefined, { head: [HELM], body: [CARAPACE] });
        const head = root.querySelector('div[data-location="head"] button[data-item-id="a-helm"]');
        const body = root.querySelector('div[data-location="body"] button[data-item-id="a-body"]');
        expect(head, 'head armour icon should render').not.toBeNull();
        expect(body, 'body armour icon should render').not.toBeNull();
        expect(head?.getAttribute('title')).toBe('Flak Helm');
        expect(head?.querySelector('img')?.getAttribute('src')).toBe('helm.webp');
    });

    it('renders no location icons when every location has empty items (unequipped)', () => {
        const root = render(undefined);
        // The only item buttons in an all-empty silhouette are the (absent) gear cluster.
        expect(root.querySelectorAll('button[data-item-id^="a-"]')).toHaveLength(0);
    });
});

describe('armour-silhouette — body-model geometry (#485)', () => {
    // The legs used to share the arms' OUTER columns on a row that `body` also
    // spanned ('rleg body lleg'), so they flanked the torso instead of sitting under
    // it, and -40px pull margins dragged them back over it. Pin the corrected shape:
    // legs occupy their own row, in the two middle columns, with no pull margins.
    it('places the legs side by side on their own row beneath the body', () => {
        expect(silhouetteSrc).toContain("[grid-template-areas:'._head_head_.'_'rarm_body_body_larm'_'._rleg_lleg_.']");
    });

    it('uses four columns so the legs get middle tracks under a 2-wide body', () => {
        expect(silhouetteSrc).toContain('[grid-template-columns:80px_1fr_1fr_80px]');
        expect(silhouetteSrc).toContain('[grid-template-columns:1fr_1fr_1fr_1fr]');
    });

    it('no longer pulls the legs back across the body with negative margins', () => {
        expect(silhouetteSrc).not.toContain('tw-mr-[-40px]');
        expect(silhouetteSrc).not.toContain('tw-ml-[-40px]');
    });
});
