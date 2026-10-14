/**
 * Regression guard (#235): picking a move mode redraws the move-mode cluster.
 *
 * `#setMovementMode` writes the mode onto the actor's TOKEN flags. A token
 * update does not re-render the actor's sheet, so the cluster kept showing the
 * previous selection until something else redrew the sheet. The handler now
 * re-renders the Combat part after the write.
 *
 * The character sheet cannot be constructed under happy-dom, so this reads
 * the handler's source (the repo's idiom for sheet-only behaviour); Tier B
 * (`move-mode-turn-end.spec.ts`) checks the pressed state in Foundry.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE = readFileSync(resolve(__dirname, '../src/module/applications/actor/character-sheet.ts'), 'utf8');

/** The body of `static async #setMovementMode(...)`, up to the next static member. */
function handlerBody(): string {
    const start = SOURCE.indexOf('static async #setMovementMode(');
    expect(start).toBeGreaterThan(-1);
    const next = SOURCE.indexOf('\n    static ', start + 1);
    return SOURCE.slice(start, next === -1 ? undefined : next);
}

describe('#setMovementMode (#235)', () => {
    it('re-renders the Combat part after writing the token flag', () => {
        const body = handlerBody();
        const write = body.indexOf('await token.update(');
        const redraw = body.indexOf("await this.render({ parts: ['combat'] })");
        expect(write).toBeGreaterThan(-1);
        expect(redraw).toBeGreaterThan(write);
    });

    it('the cluster lives in the Combat part it re-renders', () => {
        const combatPart = /combat:\s*\{\s*template:\s*'systems\/wh40k-rpg\/templates\/actor\/player\/tab-combat\.hbs'/.test(SOURCE);
        expect(combatPart).toBe(true);
        const tabCombat = readFileSync(resolve(__dirname, '../src/templates/actor/player/tab-combat.hbs'), 'utf8');
        const station = readFileSync(resolve(__dirname, '../src/templates/actor/panel/combat-station-panel.hbs'), 'utf8');
        expect(tabCombat).toContain('panel/combat-station-panel.hbs');
        expect(station).toContain('panel/movement-panel-compact.hbs');
    });
});
