/**
 * Regression (#473): the world-time widget's "Celestial Bodies & Weather" button
 * label wrapped onto two lines and overflowed the button. It now shows the short
 * "Bodies & Weather" on one line (nowrap) and keeps the full name as its tooltip;
 * a langpack label too long for the button ends in an ellipsis.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import widgetSrc from '../src/templates/hud/world-time-widget.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();
const widget = HbsStory.compile(widgetSrc);

function button(): HTMLElement | null {
    const root = document.createElement('div');
    root.innerHTML = widget({ isGM: true, localBodyName: 'Solenne Minoris', localRotationHours: 19, localDay: 5, localTimeOfDay: '07:12' });
    return root.querySelector<HTMLElement>('[data-action="editBodies"]');
}

describe('the Celestial Bodies & Weather button (#473)', () => {
    it('never wraps its label', () => {
        expect(button()?.classList.contains('tw-whitespace-nowrap')).toBe(true);
    });

    it('shows the short label, in its own span that ends in an ellipsis rather than wrapping', () => {
        const label = button()?.querySelector('span');
        expect(label?.textContent.trim()).toBe('Bodies & Weather');
        expect(['tw-overflow-hidden', 'tw-text-ellipsis', 'tw-min-w-0'].filter((cls) => label?.classList.contains(cls) !== true)).toEqual([]);
    });

    it('carries the full name as its tooltip and accessible name', () => {
        expect(button()?.dataset['tooltip']).toBe('Celestial Bodies & Weather');
        expect(button()?.getAttribute('aria-label')).toBe('Celestial Bodies & Weather');
    });
});
