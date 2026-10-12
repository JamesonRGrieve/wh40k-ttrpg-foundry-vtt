/**
 * Unit tests for the reference-list / array-editor helpers behind the mutation
 * and special-ability sheets (#597).
 */
import { describe, expect, it } from 'vitest';
import {
    acceptsDroppedItem,
    appendUniqueUuid,
    buildArrayPathUpdate,
    buildReferenceList,
    effectName,
    effectOptions,
    type FormObject,
    type FormValue,
    isFormObject,
    isFormValue,
    isReferenceMode,
    itemUuidFromDropData,
    mergeIndexedArrays,
    removeIndex,
    stringList,
    systemPathSegments,
} from './reference-list-edits.ts';

const rider = (alignment: string, extra: FormObject = {}): FormObject => ({
    alignment,
    description: `<p>${alignment}</p>`,
    characteristics: { strength: 5 },
    skills: { intimidate: 10 },
    grants: [`Compendium.x.${alignment}`],
    activeEffect: '',
    ...extra,
});

describe('mergeIndexedArrays', () => {
    it('folds partial index-keyed elements onto the stored elements', () => {
        const stored = { gift: { riders: [rider('khorne'), rider('nurgle')] } };
        const submitted = { gift: { riders: { 0: { alignment: 'slaanesh' }, 1: { description: '<p>new</p>' } } } };
        expect(mergeIndexedArrays(submitted, stored)).toEqual({
            gift: { riders: [rider('khorne', { alignment: 'slaanesh' }), rider('nurgle', { description: '<p>new</p>' })] },
        });
    });

    it('keeps fields the form does not render (skills, grants)', () => {
        const stored = { gift: { riders: [rider('khorne')] } };
        expect(mergeIndexedArrays({ gift: { riders: { 0: { activeEffect: 'abc' } } } }, stored)).toEqual({
            gift: { riders: [rider('khorne', { activeEffect: 'abc' })] },
        });
    });

    it('merges nested plain objects per key', () => {
        const stored = { gift: { riders: [rider('khorne')] } };
        expect(mergeIndexedArrays({ gift: { riders: { 0: { characteristics: { toughness: -5 } } } } }, stored)).toEqual({
            gift: { riders: [rider('khorne', { characteristics: { strength: 5, toughness: -5 } })] },
        });
    });

    it('keeps stored elements the form did not mention', () => {
        const stored = { rolls: [{ formula: '1d5' }, { formula: '1d10' }] };
        expect(mergeIndexedArrays({ rolls: { 1: { formula: '2d10' } } }, stored)).toEqual({ rolls: [{ formula: '1d5' }, { formula: '2d10' }] });
    });

    it('keeps only the submitted keys outside arrays', () => {
        expect(mergeIndexedArrays({ category: 'gift' }, { category: 'minor', visible: true })).toEqual({ category: 'gift' });
    });

    it('leaves non-array targets and scalars as submitted', () => {
        const submitted = { category: 'gift', modifiers: { characteristics: { 0: 1 } } };
        expect(mergeIndexedArrays(submitted, { category: 'minor', modifiers: { characteristics: {} } })).toEqual(submitted);
        expect(mergeIndexedArrays('x', ['y'])).toBe('x');
    });
});

describe('form value guards', () => {
    it('accepts JSON-shaped data at any depth', () => {
        expect(isFormValue({ a: [1, 'b', null, { c: true }] })).toBe(true);
        expect(isFormValue(undefined)).toBe(true);
    });

    it('rejects functions and symbols anywhere', () => {
        expect(isFormValue({ a: [() => 1] })).toBe(false);
        expect(isFormValue(Symbol('x'))).toBe(false);
    });

    it('isFormObject accepts plain objects only', () => {
        expect(isFormObject({})).toBe(true);
        expect(isFormObject([])).toBe(false);
        expect(isFormObject(null)).toBe(false);
        expect(isFormObject('x')).toBe(false);
    });
});

describe('systemPathSegments', () => {
    it('strips the system prefix', () => {
        expect(systemPathSegments('system.gift.riders.0.grants')).toEqual(['gift', 'riders', '0', 'grants']);
    });

    it('rejects non-system paths', () => {
        expect(() => systemPathSegments('name')).toThrow();
        expect(() => systemPathSegments('system')).toThrow();
        expect(() => systemPathSegments('system..x')).toThrow();
    });
});

describe('buildArrayPathUpdate', () => {
    it('updates a top-level array directly', () => {
        const source = { marks: ['a'] };
        expect(buildArrayPathUpdate(source, 'system.marks', (current) => appendUniqueUuid(current, 'b'))).toEqual({ 'system.marks': ['a', 'b'] });
        expect(source.marks).toEqual(['a']);
    });

    it('rewrites the outermost array for a path inside an array element', () => {
        const source = { gift: { riders: [rider('khorne'), rider('nurgle')] } };
        const update = buildArrayPathUpdate(source, 'system.gift.riders.1.grants', (current) => appendUniqueUuid(current, 'Compendium.x.extra'));
        expect(update).toEqual({
            'system.gift.riders': [rider('khorne'), rider('nurgle', { grants: ['Compendium.x.nurgle', 'Compendium.x.extra'] })],
        });
        // The source is never mutated.
        expect(source).toEqual({ gift: { riders: [rider('khorne'), rider('nurgle')] } });
    });

    it('removes one element of a nested list', () => {
        const source = { gift: { riders: [rider('khorne', { grants: ['a', 'b'] })] } };
        expect(buildArrayPathUpdate(source, 'system.gift.riders.0.grants', (current) => removeIndex(current, 0))).toEqual({
            'system.gift.riders': [rider('khorne', { grants: ['b'] })],
        });
    });

    it('writes a plain scalar path as-is', () => {
        expect(buildArrayPathUpdate({ grant: { trait: 'old' } }, 'system.grant.trait', () => 'new')).toEqual({ 'system.grant.trait': 'new' });
    });

    it('treats a missing path as undefined', () => {
        const fresh = (current: FormValue): FormValue => (current === undefined ? ['fresh'] : current);
        expect(buildArrayPathUpdate({}, 'system.gift.riders', fresh)).toEqual({ 'system.gift.riders': ['fresh'] });
    });
});

describe('list helpers', () => {
    it('stringList keeps only strings and reads a missing list as empty', () => {
        expect(stringList(['a', 1, 'b'])).toEqual(['a', 'b']);
        expect(stringList(undefined)).toEqual([]);
    });

    it('appendUniqueUuid never duplicates', () => {
        expect(appendUniqueUuid(['a'], 'a')).toEqual(['a']);
        expect(appendUniqueUuid(undefined, 'a')).toEqual(['a']);
    });

    it('removeIndex drops one element and ignores out-of-range indexes', () => {
        expect(removeIndex(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
        expect(removeIndex(['a'], 5)).toEqual(['a']);
        expect(removeIndex('nope', 0)).toEqual([]);
    });
});

describe('itemUuidFromDropData', () => {
    it('reads the uuid of an Item drop', () => {
        expect(itemUuidFromDropData({ type: 'Item', uuid: 'Compendium.x.Item.1' })).toBe('Compendium.x.Item.1');
    });

    it('ignores other drops', () => {
        expect(itemUuidFromDropData({ type: 'Actor', uuid: 'Actor.1' })).toBeNull();
        expect(itemUuidFromDropData({ type: 'Item', uuid: '' })).toBeNull();
        expect(itemUuidFromDropData({ type: 'Item' })).toBeNull();
        expect(itemUuidFromDropData(null)).toBeNull();
        expect(itemUuidFromDropData('Item')).toBeNull();
    });
});

describe('acceptsDroppedItem', () => {
    it('matches by type', () => {
        expect(acceptsDroppedItem('trait,talent', { type: 'talent', system: {} })).toBe(true);
        expect(acceptsDroppedItem('trait,talent', { type: 'weapon', system: {} })).toBe(false);
    });

    it('matches type:category tokens on the item category', () => {
        expect(acceptsDroppedItem('specialAbility:mark', { type: 'specialAbility', system: { category: 'mark' } })).toBe(true);
        expect(acceptsDroppedItem('specialAbility:mark', { type: 'specialAbility', system: { category: 'distinction' } })).toBe(false);
        expect(acceptsDroppedItem('specialAbility:mark', { type: 'specialAbility', system: {} })).toBe(false);
    });

    it('accepts nothing for an empty token list', () => {
        expect(acceptsDroppedItem(' , ', { type: 'trait', system: {} })).toBe(false);
    });
});

describe('isReferenceMode', () => {
    it('recognises list and single', () => {
        expect(isReferenceMode('list')).toBe(true);
        expect(isReferenceMode('single')).toBe(true);
        expect(isReferenceMode('other')).toBe(false);
        expect(isReferenceMode(undefined)).toBe(false);
    });
});

describe('buildReferenceList', () => {
    const resolveName = (uuid: string): string => `name:${uuid}`;
    const base = { path: 'system.marks', accept: 'specialAbility:mark', resolveName, emptyKey: 'E', dropKey: 'D' };

    it('lists every stored UUID with its index', () => {
        expect(buildReferenceList({ ...base, mode: 'list', stored: ['a', 'b'] }).entries).toEqual([
            { uuid: 'a', name: 'name:a', index: 0 },
            { uuid: 'b', name: 'name:b', index: 1 },
        ]);
    });

    it('shows a single reference with index -1, and nothing when blank', () => {
        expect(buildReferenceList({ ...base, mode: 'single', stored: 'a' }).entries).toEqual([{ uuid: 'a', name: 'name:a', index: -1 }]);
        expect(buildReferenceList({ ...base, mode: 'single', stored: 'a' }).mode).toBe('single');
        expect(buildReferenceList({ ...base, mode: 'single', stored: '' }).entries).toEqual([]);
    });
});

describe('effect pickers', () => {
    const effects = [
        { id: 'e1', name: 'Frenzy' },
        { id: 'e2', name: 'Fear' },
    ];

    it('marks the stored effect selected', () => {
        expect(effectOptions(effects, 'e2')).toEqual([
            { value: 'e1', label: 'Frenzy', selected: false },
            { value: 'e2', label: 'Fear', selected: true },
        ]);
    });

    it('keeps a stored id that no longer resolves so a submit does not clear it', () => {
        expect(effectOptions(effects, 'gone').at(-1)).toEqual({ value: 'gone', label: 'gone', selected: true });
    });

    it('names the stored effect', () => {
        expect(effectName(effects, 'e1')).toBe('Frenzy');
        expect(effectName(effects, '')).toBe('');
        expect(effectName(effects, 'gone')).toBe('gone');
    });
});
