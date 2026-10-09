/**
 * Regression guard: `WH40KItem.rollNavigatorPower` resolves through the RAW
 * Navigator-power engine (`rules/navigator-powers.ts`) — the power's own test
 * characteristic + mastery bonus + compendium difficulty — and carries each
 * target component onto the card with provenance.
 *
 * History: the roll used "higher of Perception / Willpower + navigatorRank × 5",
 * a non-RAW formula, while the RAW engine sat unreachable. The Document cannot
 * load under happy-dom (it extends Foundry's Item), so the contract is checked
 * against the source text of the method and the card template.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const itemSrc = readFileSync(resolve(__dirname, '../src/module/documents/item.ts'), 'utf8');
const cardSrc = readFileSync(resolve(__dirname, '../src/templates/chat/navigator-power-chat.hbs'), 'utf8');
const sheetSrc = readFileSync(resolve(__dirname, '../src/templates/item/item-sheet.hbs'), 'utf8');

function methodBody(name: string): string {
    const start = itemSrc.indexOf(`async ${name}(`);
    expect(start).toBeGreaterThan(-1);
    const next = itemSrc.indexOf('\n    /**', start);
    return itemSrc.slice(start, next === -1 ? undefined : next);
}

describe('rollNavigatorPower wiring', () => {
    const body = methodBody('rollNavigatorPower');

    it('resolves via the RAW engine, not the navigatorRank shortcut', () => {
        expect(body).toContain('resolveNavigatorPower(');
        expect(body).toContain('resolveOpposedNavigatorPower(');
        expect(body).not.toContain('navigatorRank');
    });

    it('tests the power-declared characteristic at the owned mastery tier', () => {
        expect(body).toContain('power.test.characteristic');
        expect(body).toContain('power.mastery');
        expect(body).toContain('difficultyModifier: power.test.modifier');
    });

    it('sends per-component provenance to the card', () => {
        expect(body).toContain('navigatorPowerTargetComponents(');
        expect(body).toContain('modifierSources');
        expect(cardSrc).toContain('modifier-breakdown.hbs');
    });

    it('lets the player set mastery on the item sheet', () => {
        expect(sheetSrc).toContain('name="system.mastery"');
    });
});
