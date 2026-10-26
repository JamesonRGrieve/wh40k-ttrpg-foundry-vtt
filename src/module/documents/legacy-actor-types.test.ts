/**
 * Legacy actor types (#701): `rt-voidcraft` is the one ship type. `rt-starship`
 * stays registered so existing world ships open, is never offered for creation,
 * and converts in place.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import system from '../../system.json';
import { creatableActorTypes, LEGACY_ACTOR_TYPES, legacyConversionTarget, legacyConversionUpdate, requestedTypes } from './legacy-actor-types.ts';

const REGISTERED = Object.keys(system.documentTypes.Actor);

describe('legacy actor types (#701)', () => {
    it('rt-starship is legacy and converts to rt-voidcraft; current types do not convert', () => {
        expect(LEGACY_ACTOR_TYPES).toEqual({ 'rt-starship': 'rt-voidcraft' });
        expect(legacyConversionTarget('rt-starship')).toBe('rt-voidcraft');
        expect(legacyConversionTarget('rt-voidcraft')).toBeNull();
        expect(legacyConversionTarget('toString')).toBeNull();
    });

    it('rt-starship stays registered, so existing world ships still load and open', () => {
        expect(REGISTERED).toContain('rt-starship');
        expect(REGISTERED).toContain('rt-voidcraft');
    });

    it('the create dialog offers every registered type except the legacy ones', () => {
        const offered = creatableActorTypes(REGISTERED);
        expect(offered).not.toContain('rt-starship');
        expect(offered).toContain('rt-voidcraft');
        expect(offered).toHaveLength(REGISTERED.length - 1);
    });

    it("a caller's own restriction is kept, minus the legacy types", () => {
        expect(creatableActorTypes(REGISTERED, ['rt-starship', 'rt-voidcraft'])).toEqual(['rt-voidcraft']);
    });

    it('reads a createDialog `types` restriction only when it is a list of type ids', () => {
        expect(requestedTypes(undefined)).toBeUndefined();
        expect(requestedTypes({})).toBeUndefined();
        expect(requestedTypes({ types: 'rt-voidcraft' })).toBeUndefined();
        expect(requestedTypes({ types: ['rt-voidcraft', 3] })).toBeUndefined();
        expect(requestedTypes({ types: ['rt-voidcraft'] })).toEqual(['rt-voidcraft']);
    });

    it('converts in place: the new type, with the whole system source wrapped for replacement', () => {
        const shipSystem = { gameSystem: 'rt', hullIntegrity: { max: 40, value: 31 } };
        const update = legacyConversionUpdate('rt-starship', shipSystem, (s) => ({ replaced: s }));
        expect(update).toEqual({ type: 'rt-voidcraft', system: { replaced: shipSystem } });
        // Nothing else rides on the update: id, items and token links stay as they are.
        expect(Object.keys(update ?? {})).toEqual(['type', 'system']);
    });

    it('a current-type actor gets no conversion', () => {
        expect(legacyConversionUpdate('rt-voidcraft', {}, (s) => s)).toBeNull();
    });
});

describe('no creation path offers rt-starship (#701)', () => {
    const MODULE = resolve(__dirname, '..');
    const sources = (dir: string, out: string[] = []): string[] => {
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (statSync(path).isDirectory()) sources(path, out);
            else if (path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.endsWith('.stories.ts') && !path.endsWith('.d.ts')) out.push(path);
        }
        return out;
    };

    it('only the registration and the legacy table name it in system code', () => {
        const naming = sources(MODULE)
            .filter((path) => readFileSync(path, 'utf8').includes("'rt-starship'"))
            .map((path) => path.slice(MODULE.length + 1))
            .sort();
        expect(naming).toEqual(['documents/legacy-actor-types.ts', 'hooks-manager.ts']);
    });

    it('the Actor document routes its create dialog through the legacy filter', () => {
        const actor = readFileSync(join(MODULE, 'documents', 'base-actor.ts'), 'utf8');
        expect(actor).toMatch(/static override async createDialog\([\s\S]*?creatableActorTypes\(this\.TYPES/u);
    });
});
