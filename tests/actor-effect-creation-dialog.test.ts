/**
 * Regression guard: every sheet's "Create Effect" opens the effect-creation
 * dialog. Before this, EffectCreationDialog had no production opener, the actor
 * effects panel had no create control, and the sheet's `createEffect` action
 * dropped a blank, change-less effect on the actor. The item sheets' panel
 * dispatched `createEffect` while BaseItemSheet registered `effectCreate`, so
 * their buttons did nothing (#516).
 *
 * Source scan: the sheets pull Foundry globals at load; the contract is the
 * literal control on each panel and the dialog call in the registered action.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const PANEL = readRepoFile('src/templates/actor/panel/overview-active-effects-panel.hbs');
const CHAR_SHEET = readRepoFile('src/module/applications/actor/character-sheet.ts');
const ITEM_PANEL = readRepoFile('src/templates/item/panel/active-effects-panel.hbs');
const ITEM_SHEET = readRepoFile('src/module/applications/item/base-item-sheet.ts');

function handlerBody(source: string, signature: string): string {
    const start = source.indexOf(signature);
    expect(start).toBeGreaterThanOrEqual(0);
    const end = source.indexOf('\n    }\n', start);
    return source.slice(start, end);
}

describe('Actor sheet Create Effect → EffectCreationDialog', () => {
    it('puts a createEffect control on the actor effects panel', () => {
        expect(PANEL).toContain('data-action="createEffect"');
        expect(PANEL).toContain('WH40K.Effects.Create');
    });

    it('registers the createEffect action on the shared character/NPC sheet', () => {
        expect(CHAR_SHEET).toContain("'createEffect': CharacterSheet.#createEffect");
    });

    it('opens the dialog on the sheet effects owner instead of creating a blank effect', () => {
        const handler = handlerBody(CHAR_SHEET, 'static async #createEffect(');
        expect(handler).toContain('EffectCreationDialog.show(this.effectsOwner)');
        expect(handler).not.toContain('createEmbeddedDocuments');
    });
});

describe('Item sheet Create Effect → EffectCreationDialog (#516)', () => {
    it('every action the item effects panel dispatches is registered on BaseItemSheet', () => {
        const actions = [...ITEM_PANEL.matchAll(/data-action="([^"]+)"/gu)].map((match) => match[1]);
        expect(actions).toContain('createEffect');
        for (const action of new Set(actions)) {
            expect(ITEM_SHEET).toMatch(new RegExp(`\\b${action}: (?:BaseItemSheet\\.#|EffectActions\\.)${action}\\b`, 'u'));
        }
    });

    it("opens the dialog on the item with the item's origin, not a blank effect", () => {
        const handler = handlerBody(ITEM_SHEET, 'static async #createEffect(');
        expect(handler).toContain('EffectCreationDialog.show(this.effectsOwner, { origin: this.item.uuid })');
        expect(ITEM_SHEET).not.toContain('effectCreate');
    });
});
