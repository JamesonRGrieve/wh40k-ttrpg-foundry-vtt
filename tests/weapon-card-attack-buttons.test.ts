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

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const CARD = readRepoFile('src/templates/chat/weapon-card-chat.hbs');
const ITEM = readRepoFile('src/module/documents/item.ts');

/** Extract the `<button …>` tag carrying the given data-action. */
function button(action: string): string {
    const re = new RegExp(`<button[^>]*data-action="${action}"[^>]*>`);
    const m = re.exec(CARD);
    if (m === null) throw new Error(`no button with data-action="${action}"`);
    return m[0];
}

describe('weapon card action buttons (#248)', () => {
    it('makes Attack the larger primary button: it grows, from a basis sized to its label', () => {
        // flex-auto, not flex-1: a 0% basis let the row squeeze Attack until its label
        // split across two lines rather than wrap the button to its own line (freeze run).
        expect(button('attack')).toContain('tw-flex-auto');
        expect(button('attack')).not.toContain('tw-flex-1');
    });

    it('keeps Damage and Reload as compact secondary buttons (not flex-1), which may still shrink to fit the card', () => {
        for (const action of ['rollDamage', 'reload']) {
            expect(button(action)).not.toContain('tw-flex-1');
            // Never grows, but may shrink and wrap its label rather than overflow the chat card.
            expect(button(action)).toContain('tw-flex-initial');
            expect(button(action)).toContain('tw-min-w-0');
        }
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

    it('hides the Damage button for a weapon that deals no damage (#601)', () => {
        const start = CARD.indexOf('{{#unless noDamage}}');
        expect(start, 'noDamage guard present').toBeGreaterThan(-1);
        const guarded = CARD.slice(start, CARD.indexOf('{{/unless}}', start));
        expect(guarded).toContain('data-action="rollDamage"');
        expect(guarded).not.toContain('data-action="attack"');
        expect(ITEM).toContain('noDamage: this.isWeapon && (this.system as { dealsDamage?: boolean }).dealsDamage === false');
    });
});
