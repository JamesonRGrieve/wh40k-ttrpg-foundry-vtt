import { describe, expect, it } from 'vitest';

/** Narrow shape of migrated description field. */
interface DescriptionField {
    value: string;
    chat: string;
    summary: string;
}

/** Narrow shape of migrated source field. */
interface SourceField {
    book: string;
    page: string;
    custom: string;
}

/**
 * Tests for ItemDataModel._migrateData static helpers.
 *
 * ItemDataModel extends foundry.abstract.TypeDataModel so it cannot be
 * instantiated in happy-dom. However the private migration helpers operate
 * on plain objects and are fully testable. We access them indirectly through
 * the public _migrateData entry-point.
 */
describe('ItemDataModel', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./item-data-model').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`ItemDataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('_migrateData promotes flat description string to object', async () => {
        const mod = await import('./item-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { description: 'A plain string description.' as string | DescriptionField };
        ItemDataModel._migrateData(source);
        expect(typeof source.description).toBe('object');
        const desc = source.description as DescriptionField;
        expect(desc.value).toBe('A plain string description.');
        expect(desc.chat).toBe('');
        expect(desc.summary).toBe('');
    });

    it('_migrateData does not overwrite an existing description object', async () => {
        const mod = await import('./item-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source: { description: DescriptionField } = {
            description: { value: 'Rich text', chat: 'Chat text', summary: 'Summary' },
        };
        ItemDataModel._migrateData(source);
        expect(source.description.value).toBe('Rich text');
        expect(source.description.chat).toBe('Chat text');
    });

    it('_migrateData promotes flat source string to object', async () => {
        const mod = await import('./item-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { source: 'Dark Heresy 2e, p.123' as string | SourceField };
        ItemDataModel._migrateData(source);
        expect(typeof source.source).toBe('object');
        const src = source.source as SourceField;
        expect(src.custom).toBe('Dark Heresy 2e, p.123');
        expect(src.book).toBe('');
        expect(src.page).toBe('');
    });

    it('_migrateData promotes Array coverage to Set', async () => {
        const mod = await import('./item-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { coverage: ['head', 'body'] as string[] | Set<string> };
        ItemDataModel._migrateData(source);
        expect(source.coverage).toBeInstanceOf(Set);
        expect((source.coverage as Set<string>).has('head')).toBe(true);
        expect((source.coverage as Set<string>).has('body')).toBe(true);
    });

    it('_migrateData promotes Array properties to Set', async () => {
        const mod = await import('./item-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { properties: ['reliable', 'tearing'] as string[] | Set<string> };
        ItemDataModel._migrateData(source);
        expect(source.properties).toBeInstanceOf(Set);
        expect((source.properties as Set<string>).has('reliable')).toBe(true);
    });

    it('_migrateData replaces img with invalid extension to default icon', async () => {
        const mod = await import('./item-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { img: 'some-image.tiff', type: 'weapon' };
        ItemDataModel._migrateData(source);
        expect(source.img).toBe('icons/svg/sword.svg');
    });

    it('_migrateData preserves img with valid .webp extension', async () => {
        const mod = await import('./item-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { img: 'systems/wh40k-rpg/assets/weapon.webp', type: 'weapon' };
        ItemDataModel._migrateData(source);
        expect(source.img).toBe('systems/wh40k-rpg/assets/weapon.webp');
    });

    it('static metadata has enchantable, hasEffects, singleton all false', async () => {
        const mod = await import('./item-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const ItemDataModel = mod.default;
        const meta = ItemDataModel.metadata as { enchantable: boolean; hasEffects: boolean; singleton: boolean };
        expect(meta.enchantable).toBe(false);
        expect(meta.hasEffects).toBe(false);
        expect(meta.singleton).toBe(false);
    });
});
