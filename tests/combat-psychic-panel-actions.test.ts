/**
 * Regression (#412): in the Combat tab's psychic powers list, the invoke and delete
 * hover buttons were absolutely positioned over the last grid column, so the PR cost
 * disappeared while a row was hovered. They now sit in a fourth column of their own,
 * in the row's flow, so they never cover a value.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import panelSrc from '../src/templates/actor/panel/combat-psychic-panel.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();
const panel = HbsStory.compile(panelSrc);

function render(): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = panel({
        showPsychicPanel: true,
        isGM: true,
        psychicPowers: [{ id: 'p1', name: 'Smite', disciplineLabel: 'Telekinesis', focusTestLabel: 'Willpower', prCost: 4, isAttack: true, identified: true }],
        system: { psy: { rating: 4, currentRating: 4, sustained: 0, class: 'bound', hasFocus: true } },
    });
    return root;
}

describe('the psychic power row keeps its buttons off the PR cost (#412)', () => {
    it('gives the buttons their own column: header and rows are four columns wide', () => {
        const root = render();
        const row = root.querySelector('[data-item-type="psychicPower"]');
        expect(row?.className).toContain('tw-grid-cols-[1fr_auto_auto_auto]');
        expect(row?.previousElementSibling?.className).toContain('tw-grid-cols-[1fr_auto_auto_auto]');
        expect(row?.previousElementSibling?.children).toHaveLength(4);
    });

    it('puts invoke and delete in the action cell, in the flow rather than absolutely positioned', () => {
        const row = render().querySelector('[data-item-type="psychicPower"]');
        const cell = row?.querySelector('[data-wh40k-hook="psychic-power-actions"]');
        expect([...(cell?.querySelectorAll('button') ?? [])].map((button) => button.dataset['action'])).toEqual(['rollPower', 'itemDelete']);
        expect([...(row?.querySelectorAll('button') ?? [])].filter((button) => button.classList.contains('tw-absolute'))).toEqual([]);
    });

    it('shows the PR cost in its own cell', () => {
        expect(render().querySelector('[data-wh40k-hook="psychic-power-pr"]')?.textContent.trim()).toBe('4');
    });
});
