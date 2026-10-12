/**
 * Render tests for the Black Crusade Gifts of the Gods panel (#180), through the
 * same `isBC` include gate as the overview tab and a context built by the real
 * `buildBcGiftsPanel`. Pins: the panel only renders for Black Crusade; each
 * Gift row shows its compendium HTML (not escaped), the applied rider, the
 * sub-table prompt and grant names; a pending acquisition roll renders a roll
 * button wired to `bcRollGiftCharacteristic`; the footer sums the changes.
 */

import HbsStory from 'handlebars';
import { describe, expect, it } from 'vitest';
import { buildBcGiftsPanel, type GiftPanelItem } from '../src/module/applications/actor/bc-gifts-panel-context';
import type { ChaosAlignment } from '../src/module/config/game-systems/types';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

const template = HbsStory.compile('{{#if isBC}}{{> systems/wh40k-rpg/templates/actor/panel/bc-gifts-panel.hbs giftsPanel=giftsPanel}}{{/if}}');

const GIFT: GiftPanelItem = {
    id: 'g1',
    name: 'Fixture Gift',
    img: null,
    system: {
        effect: '<p>Base <strong>effect</strong>.</p>',
        modifiers: { characteristics: { strength: 3 }, skills: {} },
        gift: {
            grants: ['uuid.trait'],
            riders: [{ alignment: 'khorne', description: '<p>Khorne rider.</p>', characteristics: { strength: 5 }, skills: {}, grants: [], activeEffect: '' }],
            subTable: 'animal',
            characteristicRolls: [{ characteristic: 'intelligence', formula: '1d10+5', direction: 'loss' }],
        },
    },
};

function render(isBC: boolean, alignment: ChaosAlignment, items: GiftPanelItem[]): HTMLElement {
    const giftsPanel = buildBcGiftsPanel({
        alignment,
        items,
        characteristicLabel: (key) => key,
        skillLabel: (key) => key,
        grantName: (uuid) => `Trait<${uuid}>`,
    });
    const root = document.createElement('div');
    root.innerHTML = template({ isBC, giftsPanel });
    return root;
}

describe('BC Gifts of the Gods panel', () => {
    it('renders nothing off Black Crusade', () => {
        expect(render(false, 'khorne', [GIFT]).querySelector('.wh40k-bc-gifts-panel')).toBeNull();
    });

    it('renders a Gift row with its base effect HTML, the applied rider, sub-table prompt and grants', () => {
        const row = render(true, 'khorne', [GIFT]).querySelector<HTMLElement>('[data-wh40k-hook="bc-gift-entry"]');

        expect(row?.dataset['appliedAlignment']).toBe('khorne');
        expect(row?.querySelector('strong')?.textContent).toBe('effect');
        expect(row?.querySelector('[data-rider-alignment="khorne"]')?.textContent).toContain('Khorne rider.');
        expect(row?.querySelector('[data-wh40k-hook="bc-gift-subtable"]')).not.toBeNull();
        expect(row?.querySelector('[data-gift-grants]')?.textContent).toContain('Trait<uuid.trait>');
        expect(row?.querySelector('[data-wh40k-hook="bc-gift-delta"]')?.getAttribute('data-delta-value')).toBe('8');
    });

    it('offers a roll button for each pending acquisition roll', () => {
        const button = render(true, 'unaligned', [GIFT]).querySelector<HTMLElement>('[data-action="bcRollGiftCharacteristic"]');

        expect(button?.dataset['itemId']).toBe('g1');
        expect(button?.dataset['characteristic']).toBe('intelligence');
        expect(button?.textContent).toContain('1d10+5');
    });

    it('sums the characteristic changes in the footer', () => {
        const merged = render(true, 'khorne', [GIFT]).querySelector<HTMLElement>('[data-wh40k-hook="bc-gifts-merged-delta"]');
        expect(merged?.dataset['deltaKey']).toBe('strength');
        expect(merged?.dataset['deltaValue']).toBe('8');
    });

    it('shows the empty state for a Heretic with no Gifts', () => {
        const root = render(true, 'unaligned', []);
        expect(root.querySelectorAll('[data-wh40k-hook="bc-gift-entry"]')).toHaveLength(0);
        expect(root.querySelector('.wh40k-bc-gifts-panel')).not.toBeNull();
    });
});
