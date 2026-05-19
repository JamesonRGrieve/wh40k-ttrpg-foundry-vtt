import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import {
    type AvailabilityKey,
    type CraftsmanshipKey,
    type ScaleKey,
    AVAILABILITY_KEYS_ORDERED,
    CRAFTSMANSHIP_KEYS_ORDERED,
    SCALE_KEYS_ORDERED,
    normaliseAvailability,
    normaliseCraftsmanship,
    normaliseScale,
    resolveAcquisitionTest,
} from '../../rules/acquisition-scale.ts';

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

interface ScaleChoice {
    key: ScaleKey;
    labelKey: string;
    value: number;
    selected: boolean;
}

interface CraftsmanshipChoice {
    key: CraftsmanshipKey;
    labelKey: string;
    value: number;
    selected: boolean;
}

interface AvailabilityChoice {
    key: AvailabilityKey;
    labelKey: string;
    value: number;
    selected: boolean;
}

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
    availability: AvailabilityKey;
    craftsmanship: CraftsmanshipKey;
    scale: ScaleKey;
    availabilityChoices: ReadonlyArray<AvailabilityChoice>;
    craftsmanshipChoices: ReadonlyArray<CraftsmanshipChoice>;
    scaleChoices: ReadonlyArray<ScaleChoice>;
    availabilityModifier: number;
    craftsmanshipModifier: number;
    scaleModifier: number;
    commonModifiers: Array<{ key: string; label: string; value: number; selected: boolean }>;
    baseModifier: number;
    commonTotal: number;
    customModifier: number;
    totalModifier: number;
    finalTarget: number;
    autoSuccess: boolean;
    autoFail: boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: recentAcquisitions read from flag store; opaque shape
    recentAcquisitions: unknown[];
}

const AVAILABILITY_LABEL_KEYS: Record<AvailabilityKey, string> = {
    ubiquitous: 'WH40K.AcquisitionScale.Availability.Ubiquitous',
    abundant: 'WH40K.AcquisitionScale.Availability.Abundant',
    plentiful: 'WH40K.AcquisitionScale.Availability.Plentiful',
    common: 'WH40K.AcquisitionScale.Availability.Common',
    average: 'WH40K.AcquisitionScale.Availability.Average',
    scarce: 'WH40K.AcquisitionScale.Availability.Scarce',
    rare: 'WH40K.AcquisitionScale.Availability.Rare',
    veryRare: 'WH40K.AcquisitionScale.Availability.VeryRare',
    extremelyRare: 'WH40K.AcquisitionScale.Availability.ExtremelyRare',
    nearUnique: 'WH40K.AcquisitionScale.Availability.NearUnique',
    unique: 'WH40K.AcquisitionScale.Availability.Unique',
};

const CRAFTSMANSHIP_LABEL_KEYS: Record<CraftsmanshipKey, string> = {
    poor: 'WH40K.AcquisitionScale.Craftsmanship.Poor',
    common: 'WH40K.AcquisitionScale.Craftsmanship.Common',
    good: 'WH40K.AcquisitionScale.Craftsmanship.Good',
    best: 'WH40K.AcquisitionScale.Craftsmanship.Best',
};

const SCALE_LABEL_KEYS: Record<ScaleKey, string> = {
    negligible: 'WH40K.AcquisitionScale.Scale.Negligible',
    trivial: 'WH40K.AcquisitionScale.Scale.Trivial',
    minor: 'WH40K.AcquisitionScale.Scale.Minor',
    standard: 'WH40K.AcquisitionScale.Scale.Standard',
    major: 'WH40K.AcquisitionScale.Scale.Major',
    significant: 'WH40K.AcquisitionScale.Scale.Significant',
    vast: 'WH40K.AcquisitionScale.Scale.Vast',
};

// Modifier integer lookup used for sidebar display. Mirrors
// `ACQUISITION_*_MODIFIERS` from the rules module; kept inline here to
// avoid runtime cost of resolving the table for every render.
const AVAILABILITY_MOD_VALUES: Record<AvailabilityKey, number> = {
    ubiquitous: 70,
    abundant: 50,
    plentiful: 30,
    common: 20,
    average: 10,
    scarce: 0,
    rare: -10,
    veryRare: -20,
    extremelyRare: -30,
    nearUnique: -50,
    unique: -70,
};

const CRAFTSMANSHIP_MOD_VALUES: Record<CraftsmanshipKey, number> = {
    poor: 10,
    common: 0,
    good: -10,
    best: -30,
};

const SCALE_MOD_VALUES: Record<ScaleKey, number> = {
    negligible: 30,
    trivial: 20,
    minor: 10,
    standard: 0,
    major: -10,
    significant: -20,
    vast: -30,
};

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
            title: 'WH40K.AcquisitionScale.Title',
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
            handler: AcquisitionDialog.#onSubmit as unknown as NonNullable<ApplicationV2Config.FormConfiguration['handler']>,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            toggleModifier: AcquisitionDialog.#toggleModifier,
            selectAvailability: AcquisitionDialog.#selectAvailability,
            selectCraftsmanship: AcquisitionDialog.#selectCraftsmanship,
            selectScale: AcquisitionDialog.#selectScale,
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
    declare selectedAvailability: AvailabilityKey;
    declare selectedCraftsmanship: CraftsmanshipKey;
    declare selectedScale: ScaleKey;
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
        this.selectedModifiers = new Set<string>();
        this.customModifier = 0;
        // Seed selectors from the item's stored fields if present;
        // normalisation handles every shape Title-Case / hyphen / camel.
        const itemSys = (options.item?.system ?? null) as AcquireableItemSystem | null;
        this.selectedAvailability = normaliseAvailability(itemSys?.availability ?? null) ?? 'scarce';
        this.selectedCraftsmanship = normaliseCraftsmanship(itemSys?.craftsmanship ?? null) ?? 'common';
        this.selectedScale = 'negligible';
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        if (this.item) {
            return game.i18n.format('WH40K.AcquisitionScale.TitleForItem', { name: this.item.name });
        }
        return game.i18n.localize('WH40K.AcquisitionScale.Title');
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

        // Item data — display only. The resolver consumes the
        // normalised dialog selectors, not the raw string.
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
        } else {
            context.item = null;
        }

        context.availability = this.selectedAvailability;
        context.craftsmanship = this.selectedCraftsmanship;
        context.scale = this.selectedScale;
        context.availabilityModifier = AVAILABILITY_MOD_VALUES[this.selectedAvailability];
        context.craftsmanshipModifier = CRAFTSMANSHIP_MOD_VALUES[this.selectedCraftsmanship];
        context.scaleModifier = SCALE_MOD_VALUES[this.selectedScale];

        // Selector option lists for the template.
        context.availabilityChoices = AVAILABILITY_KEYS_ORDERED.map((k) => ({
            key: k,
            labelKey: AVAILABILITY_LABEL_KEYS[k],
            value: AVAILABILITY_MOD_VALUES[k],
            selected: k === this.selectedAvailability,
        }));
        context.craftsmanshipChoices = CRAFTSMANSHIP_KEYS_ORDERED.map((k) => ({
            key: k,
            labelKey: CRAFTSMANSHIP_LABEL_KEYS[k],
            value: CRAFTSMANSHIP_MOD_VALUES[k],
            selected: k === this.selectedCraftsmanship,
        }));
        context.scaleChoices = SCALE_KEYS_ORDERED.map((k) => ({
            key: k,
            labelKey: SCALE_LABEL_KEYS[k],
            value: SCALE_MOD_VALUES[k],
            selected: k === this.selectedScale,
        }));

        // Common modifiers (haggle / rush / etc) — display labels read
        // from the langpack at render time via {{localize}}.
        context.commonModifiers = [
            { key: 'haggling', label: 'WH40K.AcquisitionScale.Common.Haggling', value: 10, selected: this.selectedModifiers.has('haggling') },
            { key: 'rushed', label: 'WH40K.AcquisitionScale.Common.Rushed', value: -10, selected: this.selectedModifiers.has('rushed') },
            { key: 'supplier', label: 'WH40K.AcquisitionScale.Common.Supplier', value: 5, selected: this.selectedModifiers.has('supplier') },
            { key: 'bulk', label: 'WH40K.AcquisitionScale.Common.Bulk', value: -5, selected: this.selectedModifiers.has('bulk') },
            { key: 'rare', label: 'WH40K.AcquisitionScale.Common.RareMarket', value: -10, selected: this.selectedModifiers.has('rare') },
        ];

        let commonTotal = 0;
        for (const mod of context.commonModifiers) {
            if (mod.selected) commonTotal += mod.value;
        }
        context.commonTotal = commonTotal;
        context.customModifier = this.customModifier;

        // Delegate the actual maths to the pure resolver so the auto
        // success/fail short-circuit and combine-penalty bookkeeping stay
        // in one place.
        const resolved = resolveAcquisitionTest({
            profitFactor: pf.current,
            availability: this.selectedAvailability,
            craftsmanship: this.selectedCraftsmanship,
            scale: this.selectedScale,
            extra: commonTotal + this.customModifier,
        });
        context.baseModifier = context.availabilityModifier + context.craftsmanshipModifier + context.scaleModifier;
        context.totalModifier = resolved.totalModifier;
        context.finalTarget = resolved.target;
        context.autoSuccess = resolved.autoSuccess;
        context.autoFail = resolved.autoFail;

        // Recent acquisitions
        context.recentAcquisitions = this._getRecentAcquisitions();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Get availability modifier — RT Table 9-35.
     * Delegates to the shared rules module so all 7 systems and any
     * other consumer see the same numbers.
     * @param {string} availability  Availability rating (any case / separator).
     * @returns {number}  Modifier value (0 when unrecognised).
     */
    _getAvailabilityModifier(availability: string): number {
        const key = normaliseAvailability(availability);
        if (key === null) return 0;
        return AVAILABILITY_MOD_VALUES[key];
    }

    /* -------------------------------------------- */

    /**
     * Get craftsmanship modifier — RT Table 9-35.
     * @param {string} craftsmanship  Craftsmanship quality (any case).
     * @returns {number}  Modifier value (0 when unrecognised).
     */
    _getCraftsmanshipModifier(craftsmanship: string): number {
        const key = normaliseCraftsmanship(craftsmanship);
        if (key === null) return 0;
        return CRAFTSMANSHIP_MOD_VALUES[key];
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
    static async #toggleModifier(this: AcquisitionDialog, _event: Event, target: HTMLElement): Promise<void> {
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
     * Pick an Availability tier. The raw `data-availability` attribute
     * is normalised so Title-Case / hyphenated / camelCase all resolve.
     */
    static async #selectAvailability(this: AcquisitionDialog, _event: Event, target: HTMLElement): Promise<void> {
        const raw = target.dataset['availability'];
        const key = normaliseAvailability(raw ?? null);
        if (key === null) return;
        this.selectedAvailability = key;
        await this.render();
    }

    /* -------------------------------------------- */

    static async #selectCraftsmanship(this: AcquisitionDialog, _event: Event, target: HTMLElement): Promise<void> {
        const raw = target.dataset['craftsmanship'];
        const key = normaliseCraftsmanship(raw ?? null);
        if (key === null) return;
        this.selectedCraftsmanship = key;
        await this.render();
    }

    /* -------------------------------------------- */

    static async #selectScale(this: AcquisitionDialog, _event: Event, target: HTMLElement): Promise<void> {
        const raw = target.dataset['scale'];
        const key = normaliseScale(raw ?? null);
        if (key === null) return;
        this.selectedScale = key;
        await this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle form submission
     */
    static #onSubmit(this: AcquisitionDialog, _event: SubmitEvent, _form: HTMLFormElement, formData: FormDataExtended): void {
        this.customModifier = parseInt(formData.object['customModifier'] as string, 10) || 0;
    }

    /* -------------------------------------------- */

    /**
     * Roll the acquisition test
     */
    static async #roll(this: AcquisitionDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // Get form data
        const form = this.element as HTMLFormElement;
        const formData = new FormDataExtended(form);
        this.customModifier = parseInt(formData.object['customModifier'] as string, 10) || 0;

        // Calculate final target
        const context = await this._prepareContext({ force: true });
        const finalTarget = context.finalTarget;

        // Auto-success / auto-fail short-circuit (core.md §12238–12239):
        // if the adjusted PF ≥ 100 or ≤ 0 before rolling, no die is rolled.
        let roll: Roll | null = null;
        let success: boolean;
        let dos: number;
        if (context.autoSuccess) {
            success = true;
            // DoS by SoP: count tens by which the target exceeded 100, so
            // the chat card still reflects how comfortable the success was.
            dos = Math.max(1, Math.floor((finalTarget - 1) / 10) + 1);
        } else if (context.autoFail) {
            success = false;
            // DoF: count tens below zero (a flat −1 DoF when target = 0).
            dos = Math.min(-1, Math.floor(finalTarget / 10) - 1);
        } else {
            roll = await new Roll('1d100').evaluate();
            const rollTotal = Number(roll.total ?? 0);
            success = rollTotal <= finalTarget;
            dos = Math.floor((finalTarget - rollTotal) / 10);
        }

        // Log acquisition
        await this._logAcquisition({
            item: this.item,
            roll: roll?.total ?? finalTarget,
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
            autoSuccess: context.autoSuccess,
            autoFail: context.autoFail,
        });

        // On success, add item to inventory
        if (success && this.item) {
            await this.actor.createEmbeddedDocuments('Item', [this.item]);
            ui.notifications.info(game.i18n.format('WH40K.AcquisitionScale.Notification.Acquired', { name: this.item.name }));
        }

        // Critical failure: reduce PF (rolled DoF only — auto-fail at PF≤0
        // already implies a PF crisis and shouldn't compound).
        if (roll !== null && dos <= -3) {
            const rogueTrader = (this.actor.system as RogueTraderSystem).rogueTrader;
            const currentPF = rogueTrader?.profitFactor?.current ?? 0;
            const newPF = Math.max(0, currentPF - 1);
            await this.actor.update({ 'system.rogueTrader.profitFactor.current': newPF });
            ui.notifications.warn(game.i18n.format('WH40K.AcquisitionScale.Notification.CriticalFailure', { pf: String(newPF) }));
        }

        // Resolve and close
        if (this.#resolve !== null) {
            this.#resolve({
                success,
                dos,
                roll: roll?.total ?? null,
                target: finalTarget,
                autoSuccess: context.autoSuccess,
                autoFail: context.autoFail,
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
        roll: Roll | null;
        target: number;
        success: boolean;
        dos: number;
        item: WH40KItem | null;
        modifiers: { base: number; common: number; custom: number };
        autoSuccess: boolean;
        autoFail: boolean;
    }): Promise<ChatMessage | undefined> {
        const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/acquisition-test.hbs', {
            actor: this.actor,
            item: data.item,
            roll: data.roll?.total ?? null,
            target: data.target,
            success: data.success,
            dos: data.dos,
            autoSuccess: data.autoSuccess,
            autoFail: data.autoFail,
            modifiers: data.modifiers,
            gameSystem: (this.actor.system as { gameSystem?: string } | undefined)?.gameSystem,
        });

        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
            flavor: game.i18n.localize('WH40K.AcquisitionScale.ChatFlavor'),
            rolls: data.roll !== null ? [data.roll] : [],
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
