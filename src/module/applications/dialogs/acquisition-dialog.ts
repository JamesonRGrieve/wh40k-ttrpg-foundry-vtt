import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';

/**
 * @file AcquisitionDialog - Profit Factor test dialog for acquiring items
 * ApplicationV2 dialog for WH40K RPG acquisition tests
 *
 * Features:
 * - Auto-calculate availability modifiers
 * - Common modifier checkboxes
 * - Custom modifier input
 * - Live target calculation
 * - Drag-drop items to auto-fill
 * - Acquisition history tracking
 * - Critical failure PF reduction
 * - Success adds item to inventory
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record; we extend with strict fields
interface AcquisitionContext extends Record<string, unknown> {
    profitFactor: { current: number; starting: number };
    item: {
        name: string;
        img: string | null;
        type: string;
        availability: string;
        craftsmanship: string;
        cost: number;
    } | null;
    availabilityModifier: number;
    craftsmanshipModifier: number;
    commonModifiers: Array<{ key: string; label: string; value: number; selected: boolean }>;
    baseModifier: number;
    commonTotal: number;
    customModifier: number;
    totalModifier: number;
    finalTarget: number;
    // eslint-disable-next-line no-restricted-syntax -- boundary: recentAcquisitions read from flag store; opaque shape
    recentAcquisitions: unknown[];
}

interface RogueTraderSystem {
    rogueTrader?: {
        profitFactor?: { current: number; starting: number };
    };
}

interface AcquireableItemSystem {
    availability?: string;
    craftsmanship?: string;
    cost?: number;
}

interface AcquisitionHistoryEntry {
    item: WH40KItem | null;
    roll: number;
    target: number;
    success: boolean;
    dos: number;
    timestamp: number;
}

export default class AcquisitionDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        id: 'acquisition-dialog-{id}',
        classes: ['wh40k-rpg', 'acquisition-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.Acquisition.Title',
            icon: 'fa-solid fa-coins',
            resizable: false,
        },
        position: {
            width: 480,
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V14 position.height accepts 'auto' but typings list number
            height: 'auto' as unknown as number,
        },
        form: {
            // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/unbound-method -- ApplicationV2 form handler signature differs from shipped typings
            handler: AcquisitionDialog.#onSubmit as unknown as ApplicationV2Config.FormConfiguration['handler'],
            submitOnChange: false,
            closeOnSubmit: true,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            toggleModifier: AcquisitionDialog.#toggleModifier,
            roll: AcquisitionDialog.#roll,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/acquisition-dialog.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    declare actor: WH40KBaseActor;
    declare item: WH40KItem | null;
    declare selectedModifiers: Set<string>;
    declare customModifier: number;
    // eslint-disable-next-line no-restricted-syntax -- boundary: resolve receives an opaque result object whose shape depends on outcome
    #resolve: ((value: unknown) => void) | null = null;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    /**
     * Create acquisition dialog
     * @param {WH40KBaseActor} actor  The actor
     * @param {object} options  Additional options
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 ctor accepts arbitrary options record
    constructor(actor: WH40KBaseActor, options: { item?: WH40KItem | null } & Record<string, unknown> = {}) {
        super(options);
        this.actor = actor;
        this.item = options.item ?? null;
        this.selectedModifiers = new Set();
        this.customModifier = 0;
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        // eslint-disable-next-line no-restricted-syntax -- TODO: needs WH40K.Acquisition.AcquireItem and WH40K.Acquisition.PFTest localization keys
        return this.item ? `Acquire: ${this.item.name}` : 'Profit Factor Acquisition Test';
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<AcquisitionContext> {
        const context = (await super._prepareContext(options)) as AcquisitionContext;

        // Profit Factor
        const pf = (this.actor.system as RogueTraderSystem).rogueTrader?.profitFactor ?? { current: 0, starting: 0 };
        context.profitFactor = {
            current: pf.current,
            starting: pf.starting,
        };

        // Item data
        if (this.item) {
            const itemSys = this.item.system as AcquireableItemSystem;
            context.item = {
                name: this.item.name !== '' ? this.item.name : 'Unknown',
                img: this.item.img ?? null,
                type: this.item.type,
                availability: itemSys.availability !== undefined && itemSys.availability !== '' ? itemSys.availability : 'Common',
                craftsmanship: itemSys.craftsmanship !== undefined && itemSys.craftsmanship !== '' ? itemSys.craftsmanship : 'Common',
                cost: itemSys.cost ?? 0,
            };

            // Calculate availability modifier
            context.availabilityModifier = this._getAvailabilityModifier(context.item.availability);
            context.craftsmanshipModifier = this._getCraftsmanshipModifier(context.item.craftsmanship);
        } else {
            context.item = null;
            context.availabilityModifier = 0;
            context.craftsmanshipModifier = 0;
        }

        // Common modifiers
        context.commonModifiers = [
            { key: 'haggling', label: 'Haggling Successful', value: 10, selected: this.selectedModifiers.has('haggling') },
            { key: 'rushed', label: 'Rushed Purchase', value: -10, selected: this.selectedModifiers.has('rushed') },
            { key: 'supplier', label: 'Known Supplier', value: 5, selected: this.selectedModifiers.has('supplier') },
            { key: 'bulk', label: 'Bulk Purchase', value: -5, selected: this.selectedModifiers.has('bulk') },
            { key: 'rare', label: 'Rare Market', value: -10, selected: this.selectedModifiers.has('rare') },
        ];

        // Calculate totals
        context.baseModifier = context.availabilityModifier + context.craftsmanshipModifier;

        let commonTotal = 0;
        for (const mod of context.commonModifiers) {
            if (mod.selected) commonTotal += mod.value;
        }
        context.commonTotal = commonTotal;

        context.customModifier = this.customModifier;
        context.totalModifier = context.baseModifier + context.commonTotal + this.customModifier;
        context.finalTarget = pf.current + context.totalModifier;

        // Recent acquisitions
        context.recentAcquisitions = this._getRecentAcquisitions();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Get availability modifier
     * @param {string} availability  Availability rating
     * @returns {number}  Modifier value
     * @private
     */
    _getAvailabilityModifier(availability: string): number {
        const modifiers: Record<string, number> = {
            'Abundant': 30,
            'Plentiful': 20,
            'Common': 10,
            'Average': 0,
            'Scarce': -10,
            'Rare': -20,
            'Very Rare': -30,
            'Extremely Rare': -40,
            'Near Unique': -50,
            'Unique': -60,
        };
        return modifiers[availability] ?? 0;
    }

    /* -------------------------------------------- */

    /**
     * Get craftsmanship modifier
     * @param {string} craftsmanship  Craftsmanship quality
     * @returns {number}  Modifier value
     * @private
     */
    _getCraftsmanshipModifier(craftsmanship: string): number {
        const modifiers: Record<string, number> = {
            Poor: 10,
            Common: 0,
            Good: -10,
            Best: -20,
        };
        return modifiers[craftsmanship] ?? 0;
    }

    /* -------------------------------------------- */

    /**
     * Get recent acquisitions from actor flags
     * @returns {AcquisitionHistoryEntry[]}  Recent acquisitions
     * @private
     */
    _getRecentAcquisitions(): AcquisitionHistoryEntry[] {
        const history = this.actor.getFlag('wh40k-rpg', 'acquisitionHistory') as AcquisitionHistoryEntry[] | undefined;
        return history?.slice(-5).reverse() ?? [];
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Toggle a common modifier
     */
    static async #toggleModifier(this: AcquisitionDialog, event: Event, target: HTMLElement): Promise<void> {
        const key = target.dataset['modifier'];
        if (key === undefined || key === '') return;

        if (this.selectedModifiers.has(key)) {
            this.selectedModifiers.delete(key);
        } else {
            this.selectedModifiers.add(key);
        }

        await this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle form submission
     */
    static #onSubmit(this: AcquisitionDialog, event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): void {
        this.customModifier = parseInt(formData.object['customModifier'] as string) || 0;
    }

    /* -------------------------------------------- */

    /**
     * Roll the acquisition test
     */
    static async #roll(this: AcquisitionDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        // Get form data
        const form = this.element as HTMLFormElement;
        const formData = new FormDataExtended(form);
        this.customModifier = parseInt(formData.object['customModifier'] as string) || 0;

        // Calculate final target
        const context = await this._prepareContext({ force: true });
        const finalTarget = context.finalTarget;

        // Roll d100
        const roll = await new Roll('1d100').evaluate();
        const success = roll.total <= finalTarget;
        const dos = Math.floor((finalTarget - roll.total) / 10);

        // Log acquisition
        await this._logAcquisition({
            item: this.item,
            roll: roll.total,
            target: finalTarget,
            success,
            dos,
            timestamp: Date.now(),
        });

        // Create chat message
        await this._createAcquisitionMessage({
            roll,
            target: finalTarget,
            success,
            dos,
            item: this.item,
            modifiers: {
                base: context.baseModifier,
                common: context.commonTotal,
                custom: this.customModifier,
            },
        });

        // On success, add item to inventory
        if (success && this.item) {
            await this.actor.createEmbeddedDocuments('Item', [this.item]);
            // eslint-disable-next-line no-restricted-syntax -- TODO: needs WH40K.Acquisition.Acquired localization key
            ui.notifications.info(`Acquired ${this.item.name}`);
        }

        // Critical failure: reduce PF
        if (dos <= -3) {
            const rogueTrader = (this.actor.system as RogueTraderSystem).rogueTrader;
            const currentPF = rogueTrader?.profitFactor?.current ?? 0;
            const newPF = Math.max(0, currentPF - 1);
            await this.actor.update({ 'system.rogueTrader.profitFactor.current': newPF });
            // eslint-disable-next-line no-restricted-syntax -- TODO: needs WH40K.Acquisition.CriticalFailure localization key
            ui.notifications.warn(`Critical failure! Profit Factor reduced to ${newPF}`);
        }

        // Resolve and close
        if (this.#resolve !== null) {
            this.#resolve({
                success,
                dos,
                roll: roll.total,
                target: finalTarget,
            });
        }

        await this.close();
    }

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    /**
     * Log acquisition to actor flags
     * @param {AcquisitionHistoryEntry} data  Acquisition data
     * @private
     */
    async _logAcquisition(data: AcquisitionHistoryEntry): Promise<void> {
        const history = (this.actor.getFlag('wh40k-rpg', 'acquisitionHistory') as AcquisitionHistoryEntry[] | undefined) ?? [];
        history.push(data);

        // Keep last 20
        if (history.length > 20) history.shift();

        await this.actor.setFlag('wh40k-rpg', 'acquisitionHistory', history);
    }

    /* -------------------------------------------- */

    /**
     * Create acquisition chat message
     * @param {object} data  Message data
     * @private
     */
    async _createAcquisitionMessage(data: {
        roll: Roll;
        target: number;
        success: boolean;
        dos: number;
        item: WH40KItem | null;
        modifiers: { base: number; common: number; custom: number };
    }): Promise<ChatMessage | undefined> {
        const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/acquisition-test.hbs', {
            actor: this.actor,
            item: data.item,
            roll: data.roll.total,
            target: data.target,
            success: data.success,
            dos: data.dos,
            modifiers: data.modifiers,
            gameSystem: (this.actor.system as { gameSystem?: string } | undefined)?.gameSystem,
        });

        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
            flavor: 'Profit Factor Acquisition Test',
            rolls: [data.roll],
        });
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for dialog to complete
     * @returns {Promise<object|null>}  Result or null if cancelled
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: result shape depends on outcome (success object or null on cancel)
    async wait(): Promise<unknown> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
        });
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close accepts arbitrary options record
    override async close(options: Record<string, unknown> = {}): Promise<unknown> {
        if (this.#resolve !== null && options['_skipResolve'] !== true) {
            this.#resolve(null);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Static Helper                               */
    /* -------------------------------------------- */

    /**
     * Show acquisition dialog for actor
     * @param {Actor} actor  The actor
     * @param {object} item  Optional item to acquire
     * @returns {Promise<object|null>}  Result or null
     * @static
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: result shape depends on outcome (success object or null on cancel)
    static async show(actor: WH40KBaseActor, item: WH40KItem | null = null): Promise<unknown> {
        const dialog = new AcquisitionDialog(actor, { item });
        void dialog.render({ force: true });
        return dialog.wait();
    }
}
