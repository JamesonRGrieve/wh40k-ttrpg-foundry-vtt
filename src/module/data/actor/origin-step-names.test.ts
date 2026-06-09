/**
 * Tests for the origin-path step→name helper (#243).
 *
 * Drives NPC origin-path support: NPCs reuse the character sheet's origin-path
 * UI/builder, and this maps their owned origin items into the `originPath` shape
 * so the bubbles / header rows / completeness flag populate.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../../testing/repo-file.ts';
import { FREE_TEXT_ORIGIN_STEPS, mapOriginStepNames, ORIGIN_STEP_KEYS, type OriginItemLike, preserveFreeTextStepNames } from './origin-step-names.ts';

describe('mapOriginStepNames', () => {
    it('returns every step key, all empty, for no items', () => {
        const map = mapOriginStepNames([]);
        expect(Object.keys(map).sort()).toEqual([...ORIGIN_STEP_KEYS].sort());
        expect(Object.values(map).every((v) => v === '')).toBe(true);
    });

    it('fills steps from matching originPath items (across systems)', () => {
        const items: OriginItemLike[] = [
            { type: 'originPath', name: 'Hive World', system: { step: 'homeWorld' } },
            { type: 'originPath', name: 'Scum', system: { step: 'background' } },
            { type: 'originPath', name: 'Assassin', system: { step: 'role' } },
            { type: 'originPath', name: 'Ultramarines', system: { step: 'chapter' } },
        ];
        const map = mapOriginStepNames(items);
        expect(map['homeWorld']).toBe('Hive World');
        expect(map['background']).toBe('Scum');
        expect(map['role']).toBe('Assassin');
        expect(map['chapter']).toBe('Ultramarines');
        expect(map['career']).toBe('');
    });

    it('ignores non-originPath items and unknown steps', () => {
        const items: OriginItemLike[] = [
            { type: 'weapon', name: 'Lasgun', system: { step: 'homeWorld' } },
            { type: 'originPath', name: 'Mystery', system: { step: 'notAStep' } },
            { type: 'originPath', name: 'No Step', system: {} },
        ];
        const map = mapOriginStepNames(items);
        expect(map['homeWorld']).toBe('');
        expect(Object.values(map).every((v) => v === '')).toBe(true);
    });

    it('tolerates missing name / system', () => {
        const items: OriginItemLike[] = [{ type: 'originPath', system: { step: 'homeWorld' } }, { type: 'originPath' }];
        expect(mapOriginStepNames(items)['homeWorld']).toBe('');
    });
});

describe('preserveFreeTextStepNames (#272 regression: divination quote clobbered)', () => {
    it('every free-text step is a known origin step key', () => {
        for (const key of FREE_TEXT_ORIGIN_STEPS) {
            expect(ORIGIN_STEP_KEYS).toContain(key);
        }
    });

    it('restores a stored divination quote when no item resolved a name', () => {
        // Divination has no backing origin-path item, so the resolved map seeds ''.
        const resolved = mapOriginStepNames([]);
        expect(resolved['divination']).toBe('');
        preserveFreeTextStepNames(resolved, { divination: 'The blade that breaks the chain.' });
        expect(resolved['divination']).toBe('The blade that breaks the chain.');
    });

    it('leaves an item-resolved name untouched', () => {
        const resolved: Record<string, string> = { divination: 'From an item' };
        preserveFreeTextStepNames(resolved, { divination: 'Stored quote' });
        expect(resolved['divination']).toBe('From an item');
    });

    it('does not invent a value when nothing is stored', () => {
        const resolved = mapOriginStepNames([]);
        preserveFreeTextStepNames(resolved, { divination: '' });
        expect(resolved['divination']).toBe('');
        preserveFreeTextStepNames(resolved, {});
        expect(resolved['divination']).toBe('');
    });

    it('does not touch item-backed steps', () => {
        const resolved = mapOriginStepNames([]);
        preserveFreeTextStepNames(resolved, { divination: 'quote' });
        expect(resolved['background']).toBe('');
        expect(resolved['homeWorld']).toBe('');
    });

    it('character data prep restores free-text steps before persisting (wiring guard)', () => {
        // CharacterData extends TypeDataModel and cannot be instantiated under
        // happy-dom, so guard the wiring at the source level: the divination
        // quote must be preserved before Object.assign writes the originPath.
        const character = readRepoFile('src/module/data/actor/character.ts');
        expect(character).toContain('preserveFreeTextStepNames(stepNames, this.originPath)');
        const preserveIdx = character.indexOf('preserveFreeTextStepNames(stepNames, this.originPath)');
        const assignIdx = character.indexOf('Object.assign(this.originPath, stepNames)');
        expect(preserveIdx).toBeGreaterThan(-1);
        expect(assignIdx).toBeGreaterThan(preserveIdx);
    });
});

describe('NPC origin-path wiring (#243)', () => {
    const npc = readRepoFile('src/module/data/actor/npc.ts');
    const npcSheet = readRepoFile('src/module/applications/actor/npc-sheet.ts');

    it('the NPC originPath getter derives from owned items, not the all-blank stub', () => {
        expect(npc).toContain('return mapOriginStepNames(items)');
        // The old stub literally returned an object of empty-string keys — gone now.
        expect(npc).not.toContain("homeWorld: '',");
    });

    it('the NPC sheet inherits the origin-path header part from CharacterSheet', () => {
        // header-dh.hbs (the inherited header PART) renders origin-path-bubbles +
        // the builder; NPCSheet keeps 'header' in its inherited PARTS list.
        expect(npcSheet).toContain("'header'");
    });
});
