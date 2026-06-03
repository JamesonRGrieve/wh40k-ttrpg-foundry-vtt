/**
 * Regression guard (#248): the weapon chat card's action buttons.
 *
 *  1. Attack is the larger, central PRIMARY button (flex-1) — not Damage.
 *  2. The manual Damage button is hidden when the auto-apply-damage setting is on
 *     (it is redundant once damage applies automatically), gated on the
 *     `autoApplyDamage` flag that `Item#sendToChat` puts in the card context.
 *
 * Source-scan: rendering the card / reading the setting needs the Foundry
 * runtime; the contract here is literal on the template + the context builder.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CARD = readFileSync(resolve(__dirname, '../src/templates/chat/weapon-card-chat.hbs'), 'utf8');
const ITEM = readFileSync(resolve(__dirname, '../src/module/documents/item.ts'), 'utf8');

/** Extract the `<button …>` tag carrying the given data-action. */
function button(action: string): string {
    const re = new RegExp(`<button[^>]*data-action="${action}"[^>]*>`);
    const m = re.exec(CARD);
    if (m === null) throw new Error(`no button with data-action="${action}"`);
    return m[0];
}

describe('weapon card action buttons (#248)', () => {
    it('makes Attack the larger primary button (flex-1)', () => {
        expect(button('attack')).toContain('tw-flex-1');
    });

    it('keeps Damage and Reload as compact secondary buttons (not flex-1)', () => {
        expect(button('rollDamage')).not.toContain('tw-flex-1');
        expect(button('rollDamage')).toContain('tw-flex-none');
    });

    it('hides the manual Damage button behind {{#unless autoApplyDamage}}', () => {
        const start = CARD.indexOf('{{#unless autoApplyDamage}}');
        expect(start, 'autoApplyDamage guard present').toBeGreaterThan(-1);
        const end = CARD.indexOf('{{/unless}}', start);
        const guarded = CARD.slice(start, end);
        expect(guarded).toContain('data-action="rollDamage"');
        // Attack must NOT be inside the guard — it always shows.
        expect(guarded).not.toContain('data-action="attack"');
    });

    it('sendToChat seeds the autoApplyDamage flag from the setting', () => {
        expect(ITEM).toContain('autoApplyDamage: WH40KSettings.isAutoApplyDamageEnabled()');
    });
});
