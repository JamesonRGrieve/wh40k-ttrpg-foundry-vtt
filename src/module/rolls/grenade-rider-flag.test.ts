import { describe, expect, it } from 'vitest';
import { GRENADE_RIDER_FLAG, readRiderThrowFlag, riderThrowFlags } from './grenade-rider-flag.ts';

/**
 * The throw card's rider flag (#623): written by the grenade dialog, read back by the
 * card's Resolve Rider — the stored JSON is untrusted, so a malformed flag reads as none.
 */

const FLAG = { actorUuid: 'Actor.a1', itemId: 'i1', sceneId: 's1', templateId: 't1' };

describe('riderThrowFlags', () => {
    it('stores the flag under its key, and reads back what it stored', () => {
        const flags = riderThrowFlags(FLAG);
        expect(Object.keys(flags)).toEqual([GRENADE_RIDER_FLAG]);
        expect(readRiderThrowFlag(flags[GRENADE_RIDER_FLAG])).toEqual(FLAG);
    });
});

describe('readRiderThrowFlag', () => {
    it('reads no flag, a non-object, or one missing or mistyping a field as none', () => {
        expect(readRiderThrowFlag(undefined)).toBeNull();
        expect(readRiderThrowFlag('Actor.a1')).toBeNull();
        expect(readRiderThrowFlag({ ...FLAG, templateId: 7 })).toBeNull();
        expect(readRiderThrowFlag({ actorUuid: 'Actor.a1', itemId: 'i1', sceneId: 's1' })).toBeNull();
    });

    it('keeps only the four fields', () => {
        expect(readRiderThrowFlag({ ...FLAG, extra: true })).toEqual(FLAG);
    });
});
