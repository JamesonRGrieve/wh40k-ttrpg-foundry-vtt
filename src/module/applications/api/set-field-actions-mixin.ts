/**
 * @file SetFieldActionsMixin - Shared add/remove handlers for Set-backed list fields.
 *
 * Several item sheets (ammunition qualities, armour coverage/properties, armour-mod
 * properties/armour-type restrictions) persist list-shaped data as Foundry `SetField`
 * values. Every one of them re-implemented the same triplet:
 *
 *   const set = new Set(this.item.system[field]);
 *   set.add(value) | set.delete(value);
 *   await this.item.update({ ['system.' + field]: Array.from(set) });
 *
 * This mixin single-sources that core. It exposes:
 *
 * - {@link SetFieldActionsApplication.addToSetField} / `removeFromSetField` instance
 *   helpers — the Set add/delete/update core, usable by per-sheet action handlers that
 *   read their own template's dataset shape (e.g. `data-quality`, `data-property`).
 * - Generic `setFieldAdd` / `setFieldRemove` static action handlers keyed off
 *   `data-field` + `data-value` for templates that adopt that convention.
 *
 * Field paths may be nested (e.g. `restrictions.armourTypes`); the helper resolves the
 * current value with `foundry.utils.getProperty`.
 */

import type { WH40KItemDocument } from '../../types/global.d.ts';
import type { ApplicationV2Ctor, ConstructorOf } from './application-types.ts';
import type { SetFieldActionsMixinAPI } from './sheet-mixin-types.ts';

/**
 * Adds Set-backed list-field add/remove handling to an item sheet.
 * @template {ApplicationV2} T
 * @param Base - The base class being mixed.
 * @returns Extended class (base constructor surface intersected with the
 *   {@link SetFieldActionsMixinAPI} instance helpers) so consuming sheets see
 *   `this.addToSetField(...)` & friends without a cast.
 * @mixin
 */
export default function SetFieldActionsMixin<T extends ApplicationV2Ctor>(Base: T): T & ConstructorOf<SetFieldActionsMixinAPI> {
    class SetFieldActionsApplication extends Base implements SetFieldActionsMixinAPI {
        /**
         * The item document this sheet edits. Contributed by the item-sheet base
         * the mixin is applied over (BaseItemSheet); `declare`d here so the Set-field
         * helpers read `this.item.system` without bridging through a cast.
         */
        declare readonly item: WH40KItemDocument;

        /* eslint-disable @typescript-eslint/no-explicit-any -- mixin idiom: constructor forwards whatever the base accepts (TS2545) */
        // biome-ignore lint/complexity/noUselessConstructor: required to forward any[] args per TS mixin rule (TS2545)
        // biome-ignore lint/suspicious/noExplicitAny: mixin constructor requires any[] per TS mixin rule (TS2545)
        constructor(...args: any[]) {
            /* eslint-enable @typescript-eslint/no-explicit-any */
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- mixin idiom: forwarding variadic args to the unknown base
            super(...args);
        }

        /** @override */
        static DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 base DEFAULT_OPTIONS not on shipped types
            ...((Base as unknown as { DEFAULT_OPTIONS?: Partial<ApplicationV2Config.DefaultOptions> }).DEFAULT_OPTIONS ?? {}),
            actions: {
                // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 base DEFAULT_OPTIONS.actions not on shipped types
                ...((Base as unknown as { DEFAULT_OPTIONS?: { actions?: Record<string, unknown> } }).DEFAULT_OPTIONS?.actions ?? {}),
                /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
                setFieldAdd: SetFieldActionsApplication.#setFieldAdd,
                setFieldRemove: SetFieldActionsApplication.#setFieldRemove,
                /* eslint-enable @typescript-eslint/unbound-method */
            },
        };

        /* -------------------------------------------- */
        /*  Instance Helpers                            */
        /* -------------------------------------------- */

        /**
         * Read the current value of a (possibly nested) Set-backed field as a Set.
         * @param field - Dot-path under `system` (e.g. `properties`, `restrictions.armourTypes`).
         */
        readSetField(field: string): Set<string> {
            // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns the broad system value; the field is a SetField/array
            const value = foundry.utils.getProperty(this.item.system, field) as Iterable<string> | undefined;
            return new Set(value ?? []);
        }

        /**
         * Persist a Set-backed field as an array (Foundry's SetField storage form).
         * @param field - Dot-path under `system`.
         * @param set - The values to persist.
         */
        async writeSetField(field: string, set: Set<string>): Promise<void> {
            await this.item.update({ [`system.${field}`]: Array.from(set) });
        }

        /**
         * Add a value to a Set-backed field and persist the result as an array.
         * @param field - Dot-path under `system`.
         * @param value - Value to add (no-op when empty).
         */
        async addToSetField(field: string, value: string): Promise<void> {
            if (value === '') return;
            const set = this.readSetField(field);
            set.add(value);
            await this.writeSetField(field, set);
        }

        /**
         * Remove a value from a Set-backed field and persist the result as an array.
         * @param field - Dot-path under `system`.
         * @param value - Value to remove (no-op when undefined).
         */
        async removeFromSetField(field: string, value: string | undefined): Promise<void> {
            if (value === undefined) return;
            const set = this.readSetField(field);
            set.delete(value);
            await this.writeSetField(field, set);
        }

        /**
         * Project a config option map into the `{ key, label, description, selected }`
         * rows the Set-field sheets render (#429) — the shared projection side of the
         * mixin (it already owned the mutation side). Labels/descriptions are resolved
         * through `game.i18n`. Filters: `selected` flags rows whose key is in that set;
         * `only` restricts to keys in that set (materialise a chosen set); `exclude`
         * drops keys in that set (an available-minus-used list). Callers read only the
         * fields they need.
         */
        projectSetOptions(
            options: Record<string, { label: string; description?: string }>,
            filters: { selected?: Set<string>; only?: Set<string>; exclude?: Set<string> } = {},
        ): Array<{ key: string; label: string; description: string; selected: boolean }> {
            return (
                Object.entries(options)
                    // `only` absent → include all; `exclude` absent → drop none.
                    .filter(([key]) => filters.only?.has(key) !== false && filters.exclude?.has(key) !== true)
                    .map(([key, config]) => ({
                        key,
                        label: game.i18n.localize(config.label),
                        description: config.description !== undefined ? game.i18n.localize(config.description) : '',
                        selected: filters.selected?.has(key) ?? false,
                    }))
            );
        }

        /* -------------------------------------------- */
        /*  Generic Action Handlers                     */
        /* -------------------------------------------- */

        /**
         * Generic add handler for templates using `data-field` + `data-value`.
         */
        static async #setFieldAdd(this: SetFieldActionsApplication, _event: Event, target: HTMLElement): Promise<void> {
            const field = target.dataset['field'];
            if (field === undefined || field === '') return;
            await this.addToSetField(field, target.dataset['value'] ?? '');
        }

        /**
         * Generic remove handler for templates using `data-field` + `data-value`.
         */
        static async #setFieldRemove(this: SetFieldActionsApplication, _event: Event, target: HTMLElement): Promise<void> {
            const field = target.dataset['field'];
            if (field === undefined || field === '') return;
            await this.removeFromSetField(field, target.dataset['value']);
        }
    }

    return SetFieldActionsApplication;
}
