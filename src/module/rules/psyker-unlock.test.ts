import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { grantsPsychicPowers, psykerUnlockHint, type PsykerUnlock } from './psyker-unlock.ts';

/**
 * The advancement dialog's locked Psychic Powers banner (#680, #681). It once told
 * every line to take the Psyker elite advance "from the Traits tab", a tab the
 * dialog does not have, in a sentence assembled from fragment keys. It now names
 * the line's own unlock: an elite advance by the tab that sells it (that tab's own
 * label, "Elite Advances"), an origin-path choice by its step. The name is the
 * flagged compendium document's, passed in by the dialog. Formatted through the
 * real langpack.
 */

interface LangNode {
    [key: string]: string | LangNode | undefined;
}
const lang = JSON.parse(readRepoFile('src/lang/en.json')) as LangNode;

function lookup(key: string): string {
    let node: string | LangNode = lang;
    for (const part of key.split('.')) {
        if (typeof node === 'string') throw new Error(`no langpack string ${key}`);
        const next: string | LangNode | undefined = node[part];
        if (next === undefined) throw new Error(`no langpack string ${key}`);
        node = next;
    }
    if (typeof node !== 'string') throw new Error(`${key} is not a string`);
    return node;
}

function format(key: string, data: Record<string, string>): string {
    return lookup(key).replace(/\{(\w+)\}/g, (_match, name: string) => data[name] ?? '');
}

/** The tabs the dialog builds on an aptitude line, by their label keys. */
const APTITUDE_TABS = [
    { id: 'characteristics', label: 'WH40K.Advancement.Tab.Characteristics' },
    { id: 'skills', label: 'WH40K.Advancement.Tab.Skills' },
    { id: 'talents', label: 'WH40K.Advancement.Tab.Talents' },
    { id: 'psychic', label: 'WH40K.Advancement.Tab.Psychic' },
    { id: 'traits', label: 'WH40K.Advancement.Tab.Traits' },
];

const DH2: PsykerUnlock = { step: 'elite' };
const OW: PsykerUnlock = { step: 'speciality' };

describe('grantsPsychicPowers (#681)', () => {
    it('is true only for an origin whose system carries the flag set', () => {
        expect(grantsPsychicPowers({ step: 'elite', grantsPsychicPowers: true })).toBe(true);
        expect(grantsPsychicPowers({ step: 'elite', grantsPsychicPowers: false })).toBe(false);
        expect(grantsPsychicPowers({ step: 'elite' })).toBe(false);
    });

    it('never reads the name', () => {
        expect(grantsPsychicPowers({ name: 'Psyker', step: 'elite' })).toBe(false);
    });
});

describe('psykerUnlockHint', () => {
    it("names DH2's Psyker elite advance and the tab that sells it, by that tab's own label", () => {
        const hint = psykerUnlockHint(DH2, 'Psyker', APTITUDE_TABS, lookup, format);
        expect(lookup('WH40K.Advancement.Tab.Traits')).toBe('Elite Advances');
        expect(hint.locked).toBe(
            'Take the Psyker elite advance from the Elite Advances tab to unlock purchases. The catalogue is shown read-only for reference.',
        );
        expect(hint.empty).toBe('No psychic powers available. Take the Psyker elite advance from the Elite Advances tab to unlock them.');
        expect(hint.locked).not.toContain('Traits');
    });

    it("names OW's Sanctioned Psyker speciality as an origin-path choice, never a dialog tab", () => {
        const hint = psykerUnlockHint(OW, 'Sanctioned Psyker', APTITUDE_TABS, lookup, format);
        expect(hint.locked).toBe(
            'Only a character with the Sanctioned Psyker Speciality can buy psychic powers; it is chosen on the origin path. The catalogue is shown read-only for reference.',
        );
        expect(hint.empty).toBe('No psychic powers available. They need the Sanctioned Psyker Speciality, chosen on the origin path.');
    });

    it("names BC's psyker archetypes as an origin-path choice", () => {
        expect(psykerUnlockHint({ step: 'archetype' }, 'Psyker or Sorcerer', APTITUDE_TABS, lookup, format).locked).toContain(
            'the Psyker or Sorcerer Archetype can buy',
        );
    });

    it('names whatever the flagged compendium document is called, not a configured name', () => {
        const hint = psykerUnlockHint(DH2, 'Renamed Psyker Advance', APTITUDE_TABS, lookup, format);
        expect(hint.locked).toContain('Take the Renamed Psyker Advance elite advance');
        expect(hint.locked).not.toContain('Take the Psyker elite');
    });

    it('falls back to the origin path when the dialog built no elite-advances tab', () => {
        expect(psykerUnlockHint(DH2, 'Psyker', APTITUDE_TABS.slice(0, 3), lookup, format).locked).toContain('the Psyker Elite Advance can buy');
    });

    it('says only that the character cannot buy them when no flagged origin is in the packs', () => {
        expect(psykerUnlockHint(DH2, null, APTITUDE_TABS, lookup, format).locked).toBe(
            'This character cannot buy psychic powers. The catalogue is shown read-only for reference.',
        );
    });

    it('says only that the character cannot buy them on a line with no unlock', () => {
        expect(psykerUnlockHint(null, null, APTITUDE_TABS, lookup, format)).toEqual({
            locked: 'This character cannot buy psychic powers. The catalogue is shown read-only for reference.',
            empty: 'No psychic powers available.',
        });
    });

    it('the deleted fragment keys stay deleted', () => {
        for (const key of ['PsychicLockedTake', 'PsychicLockedElite', 'NoPowersAvailable', 'NoPowersAvailableTab', 'Psyker']) {
            expect(() => lookup(`WH40K.Dialog.Advancement.${key}`)).toThrow();
        }
    });
});
