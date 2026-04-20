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

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class AmmoPickerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'ammo-picker-{id}',
        classes: ['wh40k-rpg', 'ammo-picker-dialog'],
        tag: 'div',
        window: {
            title: 'Select Ammunition',
            icon: 'fa-solid fa-crosshairs',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 420,
            height: 'auto' as const,
        },
        actions: {
            selectAmmo: AmmoPickerDialog.#onSelect,
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

    #config: {
        ammoItems: unknown[];
        currentAmmoUuid: string;
        weaponName: string;
        clipMax: number;
    };

    #resolve: ((value: unknown) => void) | null = null;
    #resolved = false;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    constructor(config: { ammoItems: unknown[]; currentAmmoUuid?: string; weaponName: string; clipMax: number }, options = {}) {
        super(options);
        this.#config = {
            ammoItems: config.ammoItems || [],
            currentAmmoUuid: config.currentAmmoUuid || '',
            weaponName: config.weaponName || 'Weapon',
            clipMax: config.clipMax || 0,
        };
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        return `Load Ammunition — ${this.#config.weaponName}`;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        // @ts-expect-error - argument type
        const context = await super._prepareContext(options);

        const ammoItems = this.#config.ammoItems.map((item) => {
            const mods = item.system.modifiers;
            const modParts: string[] = [];
            if (mods?.damage) modParts.push(`${mods.damage > 0 ? '+' : ''}${mods.damage} Dmg`);
            if (mods?.penetration) modParts.push(`${mods.penetration > 0 ? '+' : ''}${mods.penetration} Pen`);
            if (mods?.range) modParts.push(`${mods.range > 0 ? '+' : ''}${mods.range}% Rng`);

            return {
                uuid: item.uuid,
                name: item.name,
                img: item.img,
                quantity: item.system.quantity,
                isCurrentlyLoaded: item.uuid === this.#config.currentAmmoUuid,
                modifierSummary: modParts.length ? modParts.join(', ') : '',
            };
        });

        return {
            ...context,
            weaponName: this.#config.weaponName,
            clipMax: this.#config.clipMax,
            ammoItems,
        };
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    static async #onSelect(this: any, event: Event, target: HTMLElement): Promise<void> {
        const form = this.element.querySelector('.ammo-picker-content');
        const selected = form?.querySelector('input[name="selectedAmmo"]:checked');
        if (!selected) return;

        const selectedUuid = (selected as HTMLInputElement).value;
        const selectedItem = this.#config.ammoItems.find((item) => item.uuid === selectedUuid);

        this.#resolved = true;
        this.#resolve?.(selectedItem || null);
        await this.close();
    }

    /* -------------------------------------------- */

    static async #onCancel(this: any, event: Event, target: HTMLElement): Promise<void> {
        this.#resolved = true;
        this.#resolve?.(null);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    // @ts-expect-error - override type
    async close(options: Record<string, unknown> = {}): Promise<void> {
        if (!this.#resolved && this.#resolve) {
            this.#resolve(null);
        }
        // @ts-expect-error - type assignment
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    async wait(): Promise<unknown> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    /**
     * Show the ammo picker dialog and wait for user selection.
     * If only one ammo type is available, auto-selects it without showing the dialog.
     * @param {object} config
     * @param {Item[]} config.ammoItems - Compatible ammunition items
     * @param {string} [config.currentAmmoUuid] - UUID of currently loaded ammo
     * @param {string} config.weaponName - Name of the weapon being reloaded
     * @param {number} config.clipMax - Effective clip max for display
     * @returns {Promise<Item|null>} Selected ammo item, or null if cancelled
     */
    static async pick(config: { ammoItems: unknown[]; currentAmmoUuid?: string; weaponName: string; clipMax: number }): Promise<unknown> {
        // Auto-select if only one type available
        if (config.ammoItems.length === 1) {
            return config.ammoItems[0];
        }
        const dialog = new this(config);
        return dialog.wait();
    }
}
