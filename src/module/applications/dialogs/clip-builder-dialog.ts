/**
 * @file ClipBuilderDialog — build an ordered mixed magazine (#ammo-system).
 *
 * The RAW reload loads a whole clip of one ammo type; this dialog lets the player
 * compose an ordered loadout — e.g. 3 AP then 2 Hot-shot — that fires front-first,
 * each round using its own profile. Each compatible ammunition type gets a count
 * input; rows load in the listed order (drag-free), and the running total is
 * clamped to the weapon's clip size. Resolves to the ordered `{ammoUuid, count}[]`
 * (empty array on cancel), consumed by `WeaponData.buildClip`.
 */

import type { WH40KItem } from '../../documents/item.ts';
import DialogResolution from './dialog-resolution.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface ClipBuilderConfig {
    ammoItems: WH40KItem[];
    weaponName: string;
    clipMax: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 context must extend Record<string, unknown>
interface ClipBuilderContext extends Record<string, unknown> {
    weaponName: string;
    clipMax: number;
    ammoItems: Array<{ uuid: string; name: string; img: string; quantity: number; modifierSummary: string }>;
}

export default class ClipBuilderDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'clip-builder-{id}',
        classes: ['wh40k-rpg', 'clip-builder-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.ClipBuilder.Title',
            icon: 'fa-solid fa-layer-group',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 460,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry accepts 'auto' at runtime but types declare number
            height: 'auto' as unknown as number,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            confirm: ClipBuilderDialog.#onConfirm,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: ClipBuilderDialog.#onCancel,
        },
    };

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/clip-builder.hbs',
        },
    };

    readonly #config: ClipBuilderConfig;
    readonly #resolution = new DialogResolution<Array<{ ammoUuid: string; count: number }>>([]);

    constructor(config: ClipBuilderConfig, options: ApplicationV2Config.DefaultOptions = {}) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 constructor accepts opaque options
        super(options as Record<string, unknown>);
        this.#config = config;
    }

    /** @override */
    get title(): string {
        return game.i18n.format('WH40K.ClipBuilder.LoadTitle', { weaponName: this.#config.weaponName });
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ClipBuilderContext> {
        const context = await super._prepareContext(options);
        const ammoItems = this.#config.ammoItems.map((item) => {
            const mods = item.system.modifiers as { damage?: number; penetration?: number; range?: number } | undefined;
            const modParts: string[] = [];
            if (mods?.damage !== undefined && mods.damage !== 0) modParts.push(`${mods.damage > 0 ? '+' : ''}${mods.damage} Dmg`);
            if (mods?.penetration !== undefined && mods.penetration !== 0) modParts.push(`${mods.penetration > 0 ? '+' : ''}${mods.penetration} Pen`);
            return {
                uuid: item.uuid,
                name: item.name,
                img: item.img ?? '',
                quantity: item.system.quantity as number,
                modifierSummary: modParts.join(', '),
            };
        });
        return { ...context, weaponName: this.#config.weaponName, clipMax: this.#config.clipMax, ammoItems } as ClipBuilderContext;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    static async #onConfirm(this: ClipBuilderDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const form = this.element.querySelector('.clip-builder-content');
        const rows = form?.querySelectorAll<HTMLInputElement>('input.clip-builder-count') ?? [];
        const segments: Array<{ ammoUuid: string; count: number }> = [];
        let total = 0;
        for (const row of rows) {
            const uuid = row.dataset['ammoUuid'] ?? '';
            const count = Math.max(0, Math.trunc(Number(row.value) || 0));
            if (uuid === '' || count <= 0) continue;
            const room = Math.max(0, this.#config.clipMax - total);
            const take = Math.min(count, room);
            if (take <= 0) break;
            segments.push({ ammoUuid: uuid, count: take });
            total += take;
        }
        this.#resolution.resolve(segments);
        await this.close();
    }

    static async #onCancel(this: ClipBuilderDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle & API                             */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2.close signature uses Record<string, unknown>
    override async close(options?: Record<string, unknown>): Promise<unknown> {
        this.#resolution.resolveDefault();
        return super.close(options);
    }

    async wait(): Promise<Array<{ ammoUuid: string; count: number }>> {
        const result = this.#resolution.track();
        void this.render(true);
        return result;
    }

    /** Open the builder; resolves to the ordered segments (empty on cancel). */
    static async build(config: ClipBuilderConfig): Promise<Array<{ ammoUuid: string; count: number }>> {
        return new this(config).wait();
    }
}
