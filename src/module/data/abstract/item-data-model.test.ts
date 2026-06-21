import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

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
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('_migrateData promotes flat description string to object', async () => {
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { coverage: ['head', 'body'] as string[] | Set<string> };
        ItemDataModel._migrateData(source);
        expect(source.coverage).toBeInstanceOf(Set);
        expect((source.coverage as Set<string>).has('head')).toBe(true);
        expect((source.coverage as Set<string>).has('body')).toBe(true);
    });

    it('_migrateData promotes Array properties to Set', async () => {
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { properties: ['reliable', 'tearing'] as string[] | Set<string> };
        ItemDataModel._migrateData(source);
        expect(source.properties).toBeInstanceOf(Set);
        expect((source.properties as Set<string>).has('reliable')).toBe(true);
    });

    it('_migrateData replaces img with invalid extension to default icon', async () => {
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { img: 'some-image.tiff', type: 'weapon' };
        ItemDataModel._migrateData(source);
        expect(source.img).toBe('icons/svg/sword.svg');
    });

    it('_migrateData preserves img with valid .webp extension', async () => {
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ItemDataModel = mod.default;

        const source = { img: 'systems/wh40k-rpg/assets/weapon.webp', type: 'weapon' };
        ItemDataModel._migrateData(source);
        expect(source.img).toBe('systems/wh40k-rpg/assets/weapon.webp');
    });

    it('static metadata has enchantable, hasEffects, singleton all false', async () => {
        const mod = await importModelOrSkip(import('./item-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ItemDataModel = mod.default;
        const meta = ItemDataModel.metadata as { enchantable: boolean; hasEffects: boolean; singleton: boolean };
        expect(meta.enchantable).toBe(false);
        expect(meta.hasEffects).toBe(false);
        expect(meta.singleton).toBe(false);
    });

    describe('inheritedChatProperties', () => {
        it('invokes a template prototype chatProperties getter with the live `this`', async () => {
            const mod = await importModelOrSkip(import('./item-data-model.ts'));
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
            if (mod === undefined) return;
            const ItemDataModel = mod.default;

            // A stand-in mixin template exposing a `chatProperties` getter that
            // reads instance state, mirroring how PhysicalItemTemplate behaves.
            class Template {
                label = 'unused';
                get chatProperties(): string[] {
                    return [`label: ${this.label}`];
                }
            }
            const instance = { label: 'plasma' };
            expect(ItemDataModel.inheritedChatProperties(instance, Template)).toEqual(['label: plasma']);
        });

        it('falls back to an empty array when the template defines no chatProperties getter', async () => {
            const mod = await importModelOrSkip(import('./item-data-model.ts'));
            // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
            if (mod === undefined) return;
            const ItemDataModel = mod.default;

            class NoGetter {}
            // This is the latent-crash case ritual.ts / navigator-power.ts hit
            // before the helper made the `?? []` fallback uniform.
            expect(ItemDataModel.inheritedChatProperties({}, NoGetter)).toEqual([]);
        });
    });
});
