/**
 * Storybook stories for the origin-path badges under the sidebar header
 * (`origin-path-bubbles.hbs`). A badge's art is a decorative background over its
 * step's icon, and the badge is labelled by name, so art that fails to load leaves
 * the icon: no alt text clipped by the circle ("Quarant… World"), no broken-image glyph.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, waitFor } from 'storybook/test';
import bubblesSrc from '../../src/templates/actor/partial/origin-path-bubbles.hbs?raw';
import { renderSheet } from '../test-helpers';

interface BubbleStep {
    label: string;
    icon: string;
    item?: { _id: string; img: string; name: string };
}

interface BubblesArgs {
    steps: BubbleStep[];
}

/** A path no server serves — the removed-art case. */
const MISSING_IMG = 'systems/wh40k-rpg/icons/talents/blue/missing.png';

const STEPS: BubbleStep[] = [
    { label: 'Home World', icon: 'fa-globe', item: { _id: 'originHomeWorld1', img: MISSING_IMG, name: 'Quarantine World' } },
    { label: 'Background', icon: 'fa-scroll', item: { _id: 'originBackgrnd01', img: 'icons/svg/book.svg', name: 'Adeptus Administratum' } },
    { label: 'Role', icon: 'fa-user-shield', item: { _id: 'originRole000001', img: 'icons/svg/book.svg', name: 'Mystic' } },
    { label: 'Elite Advance', icon: 'fa-star' },
];

function renderBubbles(args: BubblesArgs): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg', 'theme-dark');
    wrapper.dataset['wh40kSystem'] = 'dh2';
    wrapper.appendChild(renderSheet(bubblesSrc, { originPathSteps: args.steps }));
    return wrapper;
}

const meta = {
    title: 'Actor/Panels/OriginPathBubbles',
    render: (args) => renderBubbles(args),
    args: { steps: STEPS },
} satisfies Meta<BubblesArgs>;
export default meta;
type Story = StoryObj<BubblesArgs>;

/** A filled badge is a labelled button whose art is a decorative background over its step icon. */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        const badges = [...canvasElement.querySelectorAll<HTMLElement>('[data-action="itemEdit"]')];
        await expect(badges.map((b) => b.getAttribute('aria-label'))).toEqual(['Quarantine World', 'Adeptus Administratum', 'Mystic']);
        const art = badges[1]?.querySelector<HTMLElement>('[data-wh40k-hook="origin-art"]');
        await waitFor(async () => expect(art === null ? '' : getComputedStyle(art).backgroundImage).toContain('icons/svg/book.svg'));
        // No <img> to draw alt text or a broken-image glyph.
        await expect(canvasElement.querySelectorAll('[data-action="itemEdit"] img').length).toBe(0);
    },
};

/** An origin whose art is missing shows its step icon and no clipped name. */
export const MissingImage: Story = {
    play: async ({ canvasElement }) => {
        const badge = canvasElement.querySelector<HTMLElement>('[data-item-id="originHomeWorld1"]');
        await expect(badge?.querySelector('i.fa-globe')).not.toBeNull();
        await expect(badge?.querySelector('img')).toBeNull();
        // No text is drawn inside the circle; the name is the accessible label.
        await expect(badge?.textContent.trim()).toBe('');
        await expect(badge?.getAttribute('aria-label')).toBe('Quarantine World');
    },
};
