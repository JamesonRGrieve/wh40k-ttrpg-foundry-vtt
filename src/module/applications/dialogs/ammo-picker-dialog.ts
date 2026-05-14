/**
 * @file AmmoPickerDialog - Allows selecting ammunition type for weapon reload
 * Follows ConfirmationDialog pattern with ApplicationV2 + HandlebarsApplicationMixin
 *
 * Usage:
 *   const ammoItem = await AmmoPickerDialog.pick({
 *     ammoItems: compatibleAmmo,
 *     currentAmmoUuid: weapon.system.loadedAmmo?.uuid,
 *     weaponName: weapon.name,
 *     clipMax: weapon.system.effectiveClipMax
 *   });
 */

import type { WH40KItem } from '../../documents/item.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface AmmoPickerConfig {
    ammoItems: WH40KItem[];
    currentAmmoUuid: string;
    weaponName: string;
    clipMax: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 context must extend Record<string, unknown>
interface AmmoPickerContext extends Record<string, unknown> {
    weaponName: string;
    clipMax: number;
    ammoItems: Array<{
        uuid: string;
        name: string;
        img: string;
        quantity: number;
        isCurrentlyLoaded: boolean;
        modifierSummary: string;
    }>;
}

export default class AmmoPickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'ammo-picker-{id}',
        classes: ['wh40k-rpg', 'ammo-picker-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.AmmoPicker.Title',
            icon: 'fa-solid fa-crosshairs',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 420,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry accepts 'auto' at runtime but types declare number
            height: 'auto' as unknown as number,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            selectAmmo: AmmoPickerDialog.#onSelect,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: AmmoPickerDialog.#onCancel,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/ammo-picker.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    readonly #config: AmmoPickerConfig;
    #resolve: ((value: WH40KItem | null) => void) | null = null;
    #resolved = false;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    constructor(
        config: { ammoItems: WH40KItem[]; currentAmmoUuid?: string; weaponName: string; clipMax: number },
        options: ApplicationV2Config.DefaultOptions = {},
    ) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 constructor accepts opaque options
        super(options as Record<string, unknown>);
        this.#config = {
            ammoItems: config.ammoItems,
            currentAmmoUuid: config.currentAmmoUuid ?? '',
            weaponName: config.weaponName,
            clipMax: config.clipMax,
        };
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        return game.i18n.format('WH40K.AmmoPicker.LoadTitle', { weaponName: this.#config.weaponName });
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<AmmoPickerContext> {
        const context = await super._prepareContext(options);

        const ammoItems = this.#config.ammoItems.map((item) => {
            const mods = item.system.modifiers as { damage?: number; penetration?: number; range?: number } | undefined;
            const modParts: string[] = [];
            if (mods?.damage !== undefined && mods.damage !== 0) modParts.push(`${mods.damage > 0 ? '+' : ''}${mods.damage} Dmg`);
            if (mods?.penetration !== undefined && mods.penetration !== 0) modParts.push(`${mods.penetration > 0 ? '+' : ''}${mods.penetration} Pen`);
            if (mods?.range !== undefined && mods.range !== 0) modParts.push(`${mods.range > 0 ? '+' : ''}${mods.range}% Rng`);

            return {
                uuid: item.uuid,
                name: item.name,
                img: item.img ?? '',
                quantity: item.system.quantity as number,
                isCurrentlyLoaded: item.uuid === this.#config.currentAmmoUuid,
                modifierSummary: modParts.length !== 0 ? modParts.join(', ') : '',
            };
        });

        return {
            ...context,
            weaponName: this.#config.weaponName,
            clipMax: this.#config.clipMax,
            ammoItems,
        } as AmmoPickerContext;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    static async #onSelect(this: AmmoPickerDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const form = this.element.querySelector('.ammo-picker-content');
        const selected = form?.querySelector('input[name="selectedAmmo"]:checked') as HTMLInputElement | null;
        if (!selected) return;

        const selectedUuid = selected.value;
        const selectedItem = this.#config.ammoItems.find((item) => item.uuid === selectedUuid);

        this.#resolved = true;
        this.#resolve?.(selectedItem ?? null);
        await this.close();
    }

    /* -------------------------------------------- */

    static async #onCancel(this: AmmoPickerDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        this.#resolved = true;
        this.#resolve?.(null);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2.close signature uses Record<string, unknown>
    override async close(options?: Record<string, unknown>): Promise<unknown> {
        if (!this.#resolved && this.#resolve) {
            this.#resolve(null);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    async wait(): Promise<WH40KItem | null> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    static async pick(config: { ammoItems: WH40KItem[]; currentAmmoUuid?: string; weaponName: string; clipMax: number }): Promise<WH40KItem | null> {
        if (config.ammoItems.length === 1) {
            return config.ammoItems[0] ?? null;
        }
        const dialog = new this(config);
        return dialog.wait();
    }
}
