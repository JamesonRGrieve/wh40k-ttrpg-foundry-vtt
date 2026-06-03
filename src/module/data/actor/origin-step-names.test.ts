/**
 * Tests for the origin-path step→name helper (#243).
 *
 * Drives NPC origin-path support: NPCs reuse the character sheet's origin-path
 * UI/builder, and this maps their owned origin items into the `originPath` shape
 * so the bubbles / header rows / completeness flag populate.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapOriginStepNames, ORIGIN_STEP_KEYS, type OriginItemLike } from './origin-step-names.ts';

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

describe('NPC origin-path wiring (#243)', () => {
    const npc = readFileSync(resolve(__dirname, './npc.ts'), 'utf8');
    const npcSheet = readFileSync(resolve(__dirname, '../../applications/actor/npc-sheet.ts'), 'utf8');

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
