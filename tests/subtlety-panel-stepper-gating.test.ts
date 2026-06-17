/**
 * Regression tests for the Warband Subtlety panel's manual stepper gating (#317).
 *
 * Previously the +1 / −1 stepper was hidden for non-GM (`{{#if isGM}}`). It now
 * renders for everyone but is **disabled** (visible, greyed) for non-GM, with
 * the adjuster list still rendering beneath it. These tests pin:
 *
 *   - non-GM: the stepper container + both buttons render, both `disabled`;
 *   - GM: the same two buttons render, neither `disabled`;
 *   - either way: the adjuster list renders below the stepper.
 *
 * The handler (`CharacterSheet.#adjustSubtletyManually`) re-checks
 * `game.user.isGM`, so the `disabled` attribute is defence-in-depth, not the
 * sole gate — but a disabled button does not dispatch the action either way.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import panelSrc from '../src/templates/actor/panel/subtlety-panel.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const template = HbsStory.compile(panelSrc);

function render(isGM: boolean): HTMLElement {
    const html = template({
        isGM,
        system: { subtlety: { value: 60, max: 100 } },
        subtletyAdjusters: [],
    });
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('subtlety-panel — manual stepper gating (#317)', () => {
    it('renders the stepper disabled for a non-GM (visible, not hidden)', () => {
        const root = render(false);
        expect(root.querySelector('.wh40k-subtlety-manual')).not.toBeNull();
        const buttons = root.querySelectorAll<HTMLButtonElement>('[data-action="adjustSubtletyManually"]');
        expect(buttons).toHaveLength(2);
        expect(Array.from(buttons).every((b) => b.disabled)).toBe(true);
        // The adjuster list still renders beneath the stepper.
        expect(root.querySelector('.wh40k-subtlety-adjusters')).not.toBeNull();
    });

    it('renders the stepper enabled for a GM', () => {
        const root = render(true);
        const buttons = root.querySelectorAll<HTMLButtonElement>('[data-action="adjustSubtletyManually"]');
        expect(buttons).toHaveLength(2);
        expect(Array.from(buttons).some((b) => b.disabled)).toBe(false);
        const deltas = Array.from(buttons).map((b) => b.getAttribute('data-delta'));
        expect(deltas).toContain('1');
        expect(deltas).toContain('-1');
    });

    it('always renders the value readout', () => {
        for (const isGM of [false, true]) {
            const root = render(isGM);
            expect(root.querySelector('.wh40k-subtlety-value')?.textContent.trim()).toBe('60');
            expect(root.querySelector('.wh40k-subtlety-max')?.textContent.trim()).toBe('100');
        }
    });
});
