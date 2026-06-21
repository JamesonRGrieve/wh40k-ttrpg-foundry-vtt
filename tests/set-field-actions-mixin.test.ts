import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationV2Ctor } from '../src/module/applications/api/application-types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for mixin-class constructors; `unknown[]` is rejected.
type Constructor<T = object> = new (...args: any[]) => T;

/** Captured `item.update(...)` payloads, newest last. */
type UpdatePayload = Record<string, unknown>;

interface FakeItem {
    system: Record<string, unknown>;
    update: (payload: UpdatePayload) => Promise<void>;
}

const updates: UpdatePayload[] = [];

/** Minimal base the mixin is applied over (stands in for an item sheet). */
class BaseSheet {
    item: FakeItem;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest matching Foundry's ApplicationV2 constructor.
    constructor(...args: any[]) {
        this.item = args[0] as FakeItem;
    }
}

function makeItem(system: Record<string, unknown>): FakeItem {
    return {
        system,
        update(payload: UpdatePayload): Promise<void> {
            updates.push(payload);
            // Mirror the write back onto the in-memory system so reads see it.
            for (const [path, value] of Object.entries(payload)) {
                const key = path.replace(/^system\./, '');
                foundry.utils.setProperty(system, key, value);
            }
            return Promise.resolve();
        },
    };
}

function installFoundryStubs(): void {
    Object.assign(globalThis, {
        foundry: {
            utils: {
                getProperty(obj: Record<string, unknown>, path: string): unknown {
                    return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown> | undefined)?.[key], obj);
                },
                setProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
                    const keys = path.split('.');
                    const last = keys.pop();
                    if (last === undefined) return;
                    let cursor = obj;
                    for (const key of keys) {
                        cursor[key] ??= {};
                        cursor = cursor[key] as Record<string, unknown>;
                    }
                    cursor[last] = value;
                },
            },
        },
    });
}

// eslint-disable-next-line no-restricted-syntax -- the mixed instance exposes the helper methods; bridging BaseSheet into the Foundry ctor shape the mixin expects.
type MixedSheet = BaseSheet & {
    readSetField(field: string): Set<string>;
    writeSetField(field: string, set: Set<string>): Promise<void>;
    addToSetField(field: string, value: string): Promise<void>;
    removeFromSetField(field: string, value: string | undefined): Promise<void>;
};

describe('SetFieldActionsMixin', () => {
    beforeEach(() => {
        installFoundryStubs();
        vi.resetModules();
        updates.length = 0;
    });

    async function makeSheet(system: Record<string, unknown>): Promise<MixedSheet> {
        const { default: SetFieldActionsMixin } = await import('../src/module/applications/api/set-field-actions-mixin.ts');
        // eslint-disable-next-line no-restricted-syntax -- boundary: bridging structural BaseSheet into the mixin's ApplicationV2Ctor parameter.
        const Mixed = SetFieldActionsMixin(BaseSheet as unknown as ApplicationV2Ctor);
        return new Mixed(makeItem(system)) as unknown as MixedSheet;
    }

    it('reads a top-level Set-backed field, defaulting to empty', async () => {
        const sheet = await makeSheet({ properties: ['sealed', 'blessed'] });
        expect(sheet.readSetField('properties')).toEqual(new Set(['sealed', 'blessed']));
        expect(sheet.readSetField('missing')).toEqual(new Set());
    });

    it('reads a nested Set-backed field by dot-path', async () => {
        const sheet = await makeSheet({ restrictions: { armourTypes: ['flak', 'carapace'] } });
        expect(sheet.readSetField('restrictions.armourTypes')).toEqual(new Set(['flak', 'carapace']));
    });

    it('adds a value and persists the merged set as an array', async () => {
        const sheet = await makeSheet({ properties: ['sealed'] });
        await sheet.addToSetField('properties', 'blessed');

        expect(updates).toHaveLength(1);
        expect(updates[0]).toEqual({ 'system.properties': ['sealed', 'blessed'] });
    });

    it('is idempotent — adding an existing value does not duplicate it', async () => {
        const sheet = await makeSheet({ properties: ['sealed'] });
        await sheet.addToSetField('properties', 'sealed');

        expect(updates[0]).toEqual({ 'system.properties': ['sealed'] });
    });

    it('no-ops on an empty add value', async () => {
        const sheet = await makeSheet({ properties: ['sealed'] });
        await sheet.addToSetField('properties', '');

        expect(updates).toHaveLength(0);
    });

    it('removes a value and persists the remaining set', async () => {
        const sheet = await makeSheet({ addedProperties: ['a', 'b', 'c'] });
        await sheet.removeFromSetField('addedProperties', 'b');

        expect(updates[0]).toEqual({ 'system.addedProperties': ['a', 'c'] });
    });

    it('no-ops on an undefined remove value', async () => {
        const sheet = await makeSheet({ properties: ['a'] });
        await sheet.removeFromSetField('properties', undefined);

        expect(updates).toHaveLength(0);
    });

    it('persists a nested field via writeSetField', async () => {
        const sheet = await makeSheet({ restrictions: { armourTypes: ['flak'] } });
        await sheet.writeSetField('restrictions.armourTypes', new Set(['carapace', 'power']));

        expect(updates[0]).toEqual({ 'system.restrictions.armourTypes': ['carapace', 'power'] });
    });
});
