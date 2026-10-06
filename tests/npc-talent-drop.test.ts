import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

/**
 * Regression: dropping a talent on an NPC opened the XP Advancement dialog and
 * returned false, so the talent never landed (reported by a Black Crusade user).
 * NPCSheet extends CharacterSheet and inherited its player-character drop gate.
 * Source contract — the sheets cannot load under happy-dom.
 */
describe('talent drops on NPC sheets', () => {
    const characterSheet = readRepoFile('src/module/applications/actor/character-sheet.ts');
    const npcSheet = readRepoFile('src/module/applications/actor/npc-sheet.ts');

    it('the character sheet routes an unowned talent to XP advancement only when the actor buys talents with XP', () => {
        expect(characterSheet).toContain('protected _buysTalentsWithXp(): boolean');
        expect(characterSheet).toMatch(/isUnknownTalent = item\.type === 'talent' && [^;]*this\._buysTalentsWithXp\(\)/);
    });

    it('the NPC sheet opts out, so the dropped talent lands like any other item', () => {
        expect(npcSheet).toMatch(/protected override _buysTalentsWithXp\(\): boolean \{\s*return false;/);
    });
});
