/**
 * Regression (#697): a container sheet reads the item types it accepts from its
 * DataModel class. It read `system.containerTypes` off the instance, where the
 * static getter StorageLocationData declares is not visible, so a storage location
 * refused every drop.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub } from '../../testing/foundry-data-stub.ts';
import { containerAccepts, containerTypesOf } from './container-types.ts';

afterAll(installFoundryDataStub());

// The model builds its schema at load, so the stub goes in before the import.
const { default: StorageLocationData } = await import('../../data/item/storage-location.ts');

/** A storage location's system data: an instance of its DataModel class. */
const storageSystem = Object.create(StorageLocationData.prototype) as object;

describe('container types come from the DataModel class (#697)', () => {
    it('a storage location accepts the gear types its model declares', () => {
        expect(containerAccepts(storageSystem, 'gear')).toBe(true);
        expect(containerAccepts(storageSystem, 'weapon')).toBe(true);
        expect(containerTypesOf(storageSystem)).toEqual(StorageLocationData.containerTypes);
    });

    it('a storage location refuses a type its model does not declare', () => {
        expect(containerAccepts(storageSystem, 'talent')).toBe(false);
    });

    it('the static list is not on the instance, which is why the old read refused everything', () => {
        expect('containerTypes' in storageSystem).toBe(false);
    });

    it('a model that declares no container types accepts nothing', () => {
        class PlainModel {}
        expect(containerTypesOf(new PlainModel())).toEqual([]);
        expect(containerAccepts(new PlainModel(), 'gear')).toBe(false);
    });
});
