import { describe, expect, it } from 'vitest';
import { buildLangStub } from '../../testing/lang-stub.ts';
import { readRepoFile } from '../../testing/repo-file.ts';
import { ACTOR_KINDS, ACTOR_SYSTEM_AVAILABILITY, ACTOR_SYSTEMS } from './create-actor-dialog.ts';

/**
 * The dialog carries ids only; every game-system and kind label resolves through
 * the langpack, so the offered ids must each have an entry there.
 */
describe('create-actor dialog option ids', () => {
    const lang = buildLangStub();

    it('offers exactly the systems that have an availability row', () => {
        expect([...ACTOR_SYSTEMS].sort()).toEqual(Object.keys(ACTOR_SYSTEM_AVAILABILITY).sort());
    });

    it('resolves every offered game system to its langpack name', () => {
        const labels = ACTOR_SYSTEMS.map((id) => lang.localize(`WH40K.SETTINGS.PrimaryGameSystem.Choices.${id}`));
        expect(labels).toEqual(['Dark Heresy 2e', 'Dark Heresy 1e', 'Rogue Trader', 'Black Crusade', 'Only War', 'Deathwatch', 'Imperium Maledictum']);
    });

    it('has a langpack label for every offered kind, and every available kind is offered', () => {
        expect(ACTOR_KINDS.filter((kind) => !lang.has(`WH40K.CreateActor.Kinds.${kind}`))).toEqual([]);
        const availableKinds = new Set(Object.values(ACTOR_SYSTEM_AVAILABILITY).flat());
        expect([...availableKinds].filter((kind) => !ACTOR_KINDS.includes(kind))).toEqual([]);
    });
});

describe('create-actor dialog starting line', () => {
    // Regression: the dialog always opened on DH2, ignoring the world's Primary Game System.
    it("opens on the world's Primary Game System unless the caller names one", () => {
        const source = readRepoFile('src/module/applications/dialogs/create-actor-dialog.ts');
        expect(source).toContain('opts.initialSystem ?? WH40KSettings.getPrimaryGameSystem()');
        expect(source).not.toContain("opts.initialSystem ?? 'dh2'");
    });
});
