import ThreatCalculator from './threat-calculator.ts';
import type { WH40KNPC } from '../../documents/npc.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface BatchState {
    namePattern: string;
    count: number;
    threatLevel: number;
    role: string;
    type: string;
    preset: string;
    faction: string;
    isHorde: boolean;
    randomize: boolean;
    randomizeAmount: number;
    folder: string;
    openSheets: boolean;
}

/**
 * Dialog for creating multiple NPCs at once.
 * @extends {ApplicationV2}
 */
export default class BatchCreateDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'batch-create-dialog-{id}',
        classes: ['wh40k-rpg', 'batch-create-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.NPC.BatchCreate.Title',
            icon: 'fa-solid fa-users',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 550,
            height: 550,
        },
        form: {
            handler: BatchCreateDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            cancel: BatchCreateDialog.#onCancel,
            updatePreview: BatchCreateDialog.#onUpdatePreview,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/batch-create.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Form state.
     * @type {BatchState}
     */
    #state: BatchState = {
        namePattern: 'NPC {n}',
        count: 3,
        threatLevel: 5,
        role: 'specialist',
        type: 'troop',
        preset: 'mixed',
        faction: '',
        isHorde: false,
        randomize: false,
        randomizeAmount: 10,
        folder: '',
        openSheets: false,
    };

    /**
     * Promise resolver.
     * @type {((value: WH40KNPC[]) => void) | null}
     */
    #resolve: ((value: WH40KNPC[]) => void) | null = null;

    /**
     * Whether submitted.
     * @type {boolean}
     */
    #submitted = false;

    /**
     * Render timeout.
     * @type {ReturnType<typeof setTimeout> | null}
     */
    _renderTimeout: ReturnType<typeof setTimeout> | null = null;

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {Partial<BatchState>} [config] - Initial configuration.
     * @param {Record<string, unknown>} [options] - Application options.
     */
    constructor(config: Partial<BatchState> = {}, options: Record<string, unknown> = {}) {
        super(options);
        Object.assign(this.#state, config);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Get options
        const roles = ThreatCalculator.getRoles();
        const presets = ThreatCalculator.getPresets();
        const types = ThreatCalculator.getTypes();

        // Get available folders
        const folders = (game.folders as any)
            .filter((f: { type: string; displayed: boolean }) => f.type === 'Actor' && f.displayed)
            .map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }));

        // Generate preview names
        const previewNames = [];
        for (let i = 1; i <= Math.min(this.#state.count, 5); i++) {
            previewNames.push(this.#state.namePattern.replace('{n}', String(i)));
        }
        if (this.#state.count > 5) {
            previewNames.push('...');
            previewNames.push(this.#state.namePattern.replace('{n}', String(this.#state.count)));
        }

        // Calculate tier
        const tier = ThreatCalculator.getTier(this.#state.threatLevel);

        return {
            ...context,
            state: this.#state,

            roles: roles.map((r: any) => ({ ...r, selected: r.key === this.#state.role })),
            presets: presets.map((p: any) => ({ ...p, selected: p.key === this.#state.preset })),
            types: types.map((t: any) => ({ ...t, selected: t.key === this.#state.type })),
            folders: folders.map((f: any) => ({ ...f, selected: f.id === this.#state.folder })),

            tierName: tier.name,
            previewNames,

            buttons: [
                {
                    type: 'submit',
                    icon: 'fa-solid fa-plus',
                    label: 'WH40K.NPC.BatchCreate.Create',
                    cssClass: 'tw-bg-[var(--wh40k-color-accent,var(--wh40k-color-gold))] tw-text-white hover:tw-bg-[#9e801f]',
                },
                { type: 'button', action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel' },
            ],
        };
    }

    /** @override */
    _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

        const form = this.element;

        // Bind live update handlers
        const fields: { name: keyof BatchState; type: string }[] = [
            { name: 'namePattern', type: 'string' },
            { name: 'count', type: 'number' },
            { name: 'threatLevel', type: 'number' },
            { name: 'role', type: 'string' },
            { name: 'type', type: 'string' },
            { name: 'preset', type: 'string' },
            { name: 'faction', type: 'string' },
            { name: 'isHorde', type: 'boolean' },
            { name: 'randomize', type: 'boolean' },
            { name: 'randomizeAmount', type: 'number' },
            { name: 'folder', type: 'string' },
            { name: 'openSheets', type: 'boolean' },
        ];

        for (const field of fields) {
            const el = form.querySelector(`[name="${field.name}"]`) as HTMLInputElement | HTMLSelectElement;
            if (!el) continue;

            el.addEventListener(field.type === 'boolean' ? 'change' : 'input', () => {
                if (field.type === 'boolean') {
                    (this.#state as any)[field.name] = (el as HTMLInputElement).checked;
                } else if (field.type === 'number') {
                    (this.#state as any)[field.name] = parseInt((el as HTMLInputElement).value, 10) || 0;
                } else {
                    (this.#state as any)[field.name] = el.value;
                }
                this._debounceRender();
            });
        }

        // Update threat value display
        const threatSlider = form.querySelector('[name="threatLevel"]') as HTMLInputElement;
        const threatValue = form.querySelector('.threat-value');
        if (threatSlider && threatValue) {
            threatSlider.addEventListener('input', () => {
                threatValue.textContent = threatSlider.value;
            });
        }
    }

    /**
     * Debounced render for preview updates.
     * @private
     */
    _debounceRender(): void {
        if (this._renderTimeout) clearTimeout(this._renderTimeout);
        this._renderTimeout = setTimeout(() => {
            void this.render({ parts: ['form'] });
        }, 150);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle form submission.
     * @param {BatchCreateDialog} this
     * @param {SubmitEvent} event
     * @param {HTMLFormElement} form
     * @param {foundry.applications.api.FormDataExtended} formData
     */
    static async #onSubmit(
        this: BatchCreateDialog,
        event: SubmitEvent,
        form: HTMLFormElement,
        formData: foundry.applications.api.FormDataExtended,
    ): Promise<void> {
        const data = foundry.utils.expandObject(formData.object) as Partial<BatchState>;

        // Update state from form
        this.#state.namePattern = data.namePattern || 'NPC {n}';
        this.#state.count = Math.max(1, Math.min(100, parseInt(String(data.count), 10) || 1));
        this.#state.threatLevel = parseInt(String(data.threatLevel), 10) || 5;
        this.#state.role = data.role || 'specialist';
        this.#state.type = data.type || 'troop';
        this.#state.preset = data.preset || 'mixed';
        this.#state.faction = data.faction || '';
        this.#state.isHorde = data.isHorde === true || data.isHorde === 'true';
        this.#state.randomize = data.randomize === true || data.randomize === 'true';
        this.#state.randomizeAmount = parseInt(String(data.randomizeAmount), 10) || 10;
        this.#state.folder = data.folder || '';
        this.#state.openSheets = data.openSheets === true || data.openSheets === 'true';

        // Create the NPCs
        const actors = await this._createNPCs();

        if (actors.length > 0) {
            ui.notifications.info(game.i18n.format('WH40K.NPC.BatchCreate.Success', { count: String(actors.length) }));

            // Open sheets if requested (only first 5 to avoid overwhelming)
            if (this.#state.openSheets) {
                const toOpen = actors.slice(0, 5);
                for (const actor of toOpen) {
                    actor.sheet?.render(true);
                }
            }

            this.#submitted = true;
            if (this.#resolve) this.#resolve(actors);
        } else {
            ui.notifications.error(game.i18n.localize('WH40K.NPC.BatchCreate.Failed'));
            if (this.#resolve) this.#resolve([]);
        }
    }

    /**
     * Create the NPCs based on current state.
     * @returns {Promise<WH40KNPC[]>}
     * @private
     */
    async _createNPCs(): Promise<WH40KNPC[]> {
        const actors: WH40KNPC[] = [];

        // Generate base data
        const baseConfig = {
            threatLevel: this.#state.threatLevel,
            role: this.#state.role,
            type: this.#state.type,
            preset: this.#state.preset,
            faction: this.#state.faction,
            isHorde: this.#state.isHorde,
        };

        const baseData = ThreatCalculator.generateNPCData(baseConfig);

        for (let i = 1; i <= this.#state.count; i++) {
            const name = this.#state.namePattern.replace('{n}', String(i));

            // Clone and optionally randomize
            const systemData = foundry.utils.deepClone(baseData);

            if (this.#state.randomize) {
                const variance = this.#state.randomizeAmount / 100;

                // Randomize characteristics
                for (const char of Object.values(systemData.characteristics as Record<string, any>)) {
                    const delta = Math.floor((Math.random() * 2 - 1) * char.base * variance);
                    char.base = Math.max(10, Math.min(99, char.base + delta));
                    char.total = char.base + char.modifier;
                    char.bonus = Math.floor(char.total / 10);
                }

                // Randomize wounds slightly
                const woundVariance = Math.floor((Math.random() * 2 - 1) * systemData.wounds.max * variance);
                systemData.wounds.max = Math.max(1, systemData.wounds.max + woundVariance);
                systemData.wounds.value = systemData.wounds.max;
            }

            const actorData: any = {
                name,
                type: 'npcV2',
                img: 'icons/svg/mystery-man.svg',
                system: systemData,
            };

            // Add folder if specified
            if (this.#state.folder) {
                actorData.folder = this.#state.folder;
            }

            try {
                const actor = (await Actor.create(actorData)) as WH40KNPC | undefined;
                if (actor) actors.push(actor);
            } catch (err) {
                console.error(`Failed to create NPC "${name}":`, err);
            }
        }

        return actors;
    }

    /**
     * Handle cancel button.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCancel(this: BatchCreateDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        this.#submitted = false;
        if (this.#resolve) this.#resolve([]);
        await this.close();
    }

    /**
     * Handle preview update.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onUpdatePreview(this: BatchCreateDialog, event: PointerEvent, target: HTMLElement): void {
        this.render({ parts: ['form'] });
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    async close(options: Record<string, unknown> = {}): Promise<void> {
        if (this._renderTimeout) clearTimeout(this._renderTimeout);

        if (!this.#submitted && this.#resolve) {
            this.#resolve([]);
        }

        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for dialog completion.
     * @returns {Promise<WH40KNPC[]>} Created actors.
     */
    async wait(): Promise<WH40KNPC[]> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    /**
     * Open the batch create dialog.
     * @param {Partial<BatchState>} [config] - Initial configuration.
     * @returns {Promise<WH40KNPC[]>} Created actors.
     */
    static async open(config: Partial<BatchState> = {}): Promise<WH40KNPC[]> {
        const dialog = new this(config);
        return dialog.wait();
    }

    /**
     * Quick batch create without dialog.
     * @param {Record<string, unknown>} config - Configuration.
     * @returns {Promise<WH40KNPC[]>} Created actors.
     */
    static async quickCreate(config: Record<string, unknown>): Promise<WH40KNPC[]> {
        const {
            namePattern = 'NPC {n}',
            count = 1,
            threatLevel = 5,
            role = 'specialist',
            type = 'troop',
            preset = 'mixed',
            faction = '',
            isHorde = false,
            randomize = false,
            randomizeAmount = 10,
            folder = '',
        } = config;

        const actors: WH40KNPC[] = [];
        const baseData = ThreatCalculator.generateNPCData({
            threatLevel,
            role,
            type,
            preset,
            faction,
            isHorde,
        });

        for (let i = 1; i <= (count as number); i++) {
            const name = (namePattern as string).replace('{n}', String(i));
            const systemData = foundry.utils.deepClone(baseData);

            if (randomize) {
                const variance = (randomizeAmount as number) / 100;
                for (const char of Object.values(systemData.characteristics as Record<string, any>)) {
                    const delta = Math.floor((Math.random() * 2 - 1) * char.base * variance);
                    char.base = Math.max(10, Math.min(99, char.base + delta));
                    char.total = char.base + char.modifier;
                    char.bonus = Math.floor(char.total / 10);
                }
            }

            const actorData: any = {
                name,
                type: 'npcV2',
                img: 'icons/svg/mystery-man.svg',
                system: systemData,
                folder: folder || undefined,
            };

            const actor = (await Actor.create(actorData)) as WH40KNPC | undefined;
            if (actor) actors.push(actor);
        }

        if (actors.length > 0) {
            ui.notifications.info(game.i18n.format('WH40K.NPC.BatchCreate.Success', { count: String(actors.length) }));
        }

        return actors;
    }
}
