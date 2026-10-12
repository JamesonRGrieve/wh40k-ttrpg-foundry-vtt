/**
 * Regression guard (#171): the actor sheet's drop handler is where a Deathwatch
 * Distinction / Mark / Advanced Special Ability is conferred, so it must run the
 * Renown-rank gate BEFORE the item is created and pay the Renown reward AFTER.
 *
 * The rules themselves are covered in `src/module/actions/dw-distinction-actions.test.ts`.
 * This guards the wiring: the engine shipped once with tests and no production
 * caller. It is a source scan because `BaseActorSheet` cannot be constructed
 * under happy-dom.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHEET_PATH = resolve(__dirname, '../src/module/applications/actor/base-actor-sheet.ts');
const src = readFileSync(SHEET_PATH, 'utf8');

/** The body of `_onDropItem`, from its signature to the next method's JSDoc. */
function dropHandlerBody(): string {
    const start = src.indexOf('async _onDropItem(');
    expect(start, '_onDropItem not found').toBeGreaterThan(-1);
    const end = src.indexOf('_onSortItem(event: DragEvent', start);
    expect(end, '_onSortItem not found after _onDropItem').toBeGreaterThan(start);
    return src.slice(start, end);
}

describe('Deathwatch special-ability conferral wiring in BaseActorSheet._onDropItem', () => {
    it('refuses a below-rank drop before creating the item', () => {
        const body = dropHandlerBody();
        const gate = body.indexOf('if (refuseBelowRenownRank(this.actor, item)) return false;');
        const create = body.indexOf("this.actor.createEmbeddedDocuments('Item'");
        expect(gate).toBeGreaterThan(-1);
        expect(create).toBeGreaterThan(gate);
    });

    it('pays the Renown reward after the item is created', () => {
        const body = dropHandlerBody();
        const create = body.indexOf("this.actor.createEmbeddedDocuments('Item'");
        const award = body.indexOf('await awardConferralRenown(this.actor, item);');
        expect(award).toBeGreaterThan(create);
    });

    it('does not gate a same-actor reorder', () => {
        const body = dropHandlerBody();
        expect(body.indexOf("if (action === 'sort')")).toBeLessThan(body.indexOf('refuseBelowRenownRank('));
    });
});
