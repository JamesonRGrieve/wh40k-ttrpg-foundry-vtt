import { describe, expect, it } from 'vitest';
import { cloneGrantedItemData } from './grant-materialize.ts';

/**
 * #306 — the shared origin-path materialization tail (clone → strip _id → stamp
 * flags/specialization) extracted from the equipment + talent appliers. These pin
 * the stamping contract those call sites depend on.
 */

/** A compendium-source stub exposing `toObject()` (the primary clone path). */
function source(data: object = {}): object {
    return { toObject: (): object => structuredClone({ _id: 'src-id', name: 'X', ...data }) };
}

type Flags = { 'core'?: { sourceId?: string }; 'wh40k-rpg'?: { originPathGranted?: boolean } };
type Sys = { specialization?: string };

describe('cloneGrantedItemData (#306)', () => {
    it('clones via toObject and strips the source _id', () => {
        const out = cloneGrantedItemData(source({ name: 'Awareness', type: 'skill' }));
        expect(out._id).toBeUndefined();
        expect(out.name).toBe('Awareness');
    });

    it('stamps core.sourceId from the UUID', () => {
        const out = cloneGrantedItemData(source(), { sourceId: 'Compendium.wh40k-rpg.dh2.Item.abc' });
        expect((out.flags as Flags).core?.sourceId).toBe('Compendium.wh40k-rpg.dh2.Item.abc');
    });

    it('stamps wh40k-rpg.originPathGranted when requested', () => {
        const out = cloneGrantedItemData(source(), { originPathGranted: true });
        expect((out.flags as Flags)['wh40k-rpg']?.originPathGranted).toBe(true);
    });

    it('stamps both sourceId and originPathGranted together (talent path)', () => {
        const out = cloneGrantedItemData(source(), { sourceId: 'uuid-1', originPathGranted: true, specialization: 'Las Weapons' });
        expect((out.flags as Flags).core?.sourceId).toBe('uuid-1');
        expect((out.flags as Flags)['wh40k-rpg']?.originPathGranted).toBe(true);
        expect((out.system as Sys).specialization).toBe('Las Weapons');
    });

    it('does not set specialization for blank/undefined', () => {
        expect((cloneGrantedItemData(source({ system: {} }), { specialization: '' }).system as Sys).specialization).toBeUndefined();
        expect((cloneGrantedItemData(source({ system: {} })).system as Sys).specialization).toBeUndefined();
    });

    it('leaves flags untouched when no flag stamp is requested (equipment-without-source path)', () => {
        const out = cloneGrantedItemData(source({ specialization: undefined }));
        expect(out.flags).toBeUndefined();
    });
});
