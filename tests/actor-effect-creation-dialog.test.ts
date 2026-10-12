/**
 * Regression guard: the actor sheet's "Create Effect" opens the effect-creation
 * dialog. Before this, EffectCreationDialog had no production opener, the actor
 * effects panel had no create control, and the sheet's `createEffect` action
 * dropped a blank, change-less effect on the actor.
 *
 * Source scan: the sheet pulls Foundry globals at load; the contract is the
 * literal control on the panel and the dialog call in the registered action.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const PANEL = readRepoFile('src/templates/actor/panel/overview-active-effects-panel.hbs');
const CHAR_SHEET = readRepoFile('src/module/applications/actor/character-sheet.ts');

function createEffectHandler(): string {
    const start = CHAR_SHEET.indexOf('static async #createEffect(');
    const end = CHAR_SHEET.indexOf('\n    }\n', start);
    return CHAR_SHEET.slice(start, end);
}

describe('Actor sheet Create Effect → EffectCreationDialog', () => {
    it('puts a createEffect control on the actor effects panel', () => {
        expect(PANEL).toContain('data-action="createEffect"');
        expect(PANEL).toContain('WH40K.Effects.Create');
    });

    it('registers the createEffect action on the shared character/NPC sheet', () => {
        expect(CHAR_SHEET).toContain("'createEffect': CharacterSheet.#createEffect");
    });

    it('opens the dialog instead of creating a blank effect', () => {
        const handler = createEffectHandler();
        expect(handler).toContain('EffectCreationDialog.show(this.actor)');
        expect(handler).not.toContain('EffectActions.createEffect');
    });
});
