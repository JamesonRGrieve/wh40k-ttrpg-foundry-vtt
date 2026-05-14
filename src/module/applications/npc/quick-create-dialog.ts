import type { WH40KNPC } from '../../documents/npc.ts';
import ThreatCalculator from './threat-calculator.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface NPCState {
    name: string;
    threatLevel: number;
    role: string;
    type: string;
    preset: string;
    faction: string;
    isHorde: boolean;
}

/**
 * Dialog for quickly creating NPCs with auto-generated stats.
 * @extends {ApplicationV2}
 */
export default class NPCQuickCreateDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'npc-quick-create-{id}',
        classes: ['wh40k-rpg', 'npc-quick-create-dialog'],
        tag: 'form',
        window: {
            icon: 'fa-solid fa-user-plus',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 650,
            height: 700,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 action/form handlers: framework binds `this` at call time */
        form: {
            handler: NPCQuickCreateDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            cancel: NPCQuickCreateDialog.#onCancel,
            updatePreview: NPCQuickCreateDialog.#onUpdatePreview,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/npc-quick-create.hbs',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        return game.i18n.localize('WH40K.NPC.QuickCreate');
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Current form state for preview.
     * @type {NPCState}
     */
    readonly #state: NPCState;

    /**
     * Promise resolver.
     * @type {((value: WH40KNPC | null) => void) | null}
     */
    #resolve: ((value: WH40KNPC | null) => void) | null = null;

    /**
     * Whether the dialog was submitted.
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
     * @param {Partial<NPCState>} [config] - Initial configuration.
     * @param {Object} [options] - Application options.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 constructor accepts options as Record<string,unknown>; no narrower type is available from the base class
    constructor(config: Partial<NPCState> = {}, options: Record<string, unknown> = {}) {
        super(options);
        this.#state = {
            name: config.name ?? 'New NPC',
            threatLevel: config.threatLevel ?? 5,
            role: config.role ?? 'specialist',
            type: config.type ?? 'troop',
            preset: config.preset ?? 'mixed',
            faction: config.faction ?? '',
            isHorde: config.isHorde ?? false,
        };
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext must return Record<string,unknown> per framework contract
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Get available options
        const roles = ThreatCalculator.getRoles();
        const presets = ThreatCalculator.getPresets();
        const types = ThreatCalculator.getTypes();

        // Generate preview data
        // eslint-disable-next-line no-restricted-syntax -- boundary: ThreatCalculator.generateNPCData accepts Record<string,unknown>; NPCState satisfies the shape at runtime
        const previewData = ThreatCalculator.generateNPCData(this.#state as unknown as Record<string, unknown>);
        const tier = ThreatCalculator.getTier(this.#state.threatLevel);

        // Prepare characteristics for display
        const characteristics = Object.entries(previewData.characteristics).map(([key, char]) => ({
            key,
            label: char.label,
            short: char.short,
            value: char.base,
            bonus: Math.floor(char.base / 10),
        }));

        // Prepare skills for display
        const skills = Object.entries(previewData.trainedSkills).map(([key, skill]) => {
            let level = '';
            if (skill.plus20) level = '+20';
            else if (skill.plus10) level = '+10';
            else if (skill.trained) level = '';

            return {
                key,
                name: skill.name !== '' ? skill.name : key,
                level,
                bonus: skill.bonus !== 0 ? skill.bonus : 0,
            };
        });

        // Prepare weapons for display
        const weapons = previewData.weapons.simple.map((w) => ({
            name: w.name,
            damage: w.damage,
            pen: w.pen,
            range: w.range,
        }));

        return {
            ...context,

            // Form state
            state: this.#state,

            // Options
            roles: roles.map((r) => ({
                ...r,
                selected: r.key === this.#state.role,
            })),
            presets: presets.map((p) => ({
                ...p,
                selected: p.key === this.#state.preset,
            })),
            types: types.map((t) => ({
                ...t,
                selected: t.key === this.#state.type,
            })),

            // Threat tier info
            tierName: tier.name,
            tierDescription: this._getTierDescription(this.#state.threatLevel),

            // Preview data
            preview: {
                characteristics,
                skills,
                weapons,
                wounds: previewData.wounds.max,
                armour: previewData.armour.total,
                movement: previewData.movement,
            },

            // Buttons
            buttons: [
                { type: 'submit', icon: 'fa-solid fa-plus', label: 'WH40K.NPC.Create', cssClass: 'primary' },
                { type: 'button', action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel' },
            ],
        };
    }

    /**
     * Get threat tier description text.
     * @param {number} threatLevel - The threat level.
     * @returns {string} Description text.
     * @private
     */
    _getTierDescription(threatLevel: number): string {
        if (threatLevel <= 5) return game.i18n.localize('WH40K.NPC.TierMinor');
        if (threatLevel <= 10) return game.i18n.localize('WH40K.NPC.TierStandard');
        if (threatLevel <= 15) return game.i18n.localize('WH40K.NPC.TierTough');
        if (threatLevel <= 20) return game.i18n.localize('WH40K.NPC.TierElite');
        return game.i18n.localize('WH40K.NPC.TierBoss');
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._onRender context is an untyped framework parameter
    override _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

        // Add live update listeners
        const form = this.element;

        // Name input
        const nameInput = form.querySelector<HTMLInputElement>('[name="name"]');
        if (nameInput !== null) {
            nameInput.addEventListener('input', () => {
                this.#state.name = nameInput.value !== '' ? nameInput.value : 'New NPC';
            });
        }

        // Threat level slider
        const threatSlider = form.querySelector<HTMLInputElement>('[name="threatLevel"]');
        const threatValue = form.querySelector('.threat-value');
        if (threatSlider !== null) {
            threatSlider.addEventListener('input', () => {
                this.#state.threatLevel = parseInt(threatSlider.value, 10);
                if (threatValue !== null) threatValue.textContent = String(this.#state.threatLevel);
                this._debounceRender();
            });
        }

        // Role select
        const roleSelect = form.querySelector<HTMLSelectElement>('[name="role"]');
        if (roleSelect !== null) {
            roleSelect.addEventListener('change', () => {
                this.#state.role = roleSelect.value;
                this._debounceRender();
            });
        }

        // Type select
        const typeSelect = form.querySelector<HTMLSelectElement>('[name="type"]');
        if (typeSelect !== null) {
            typeSelect.addEventListener('change', () => {
                this.#state.type = typeSelect.value;
                // Auto-enable horde mode for horde/swarm types
                if (this.#state.type === 'horde' || this.#state.type === 'swarm') {
                    this.#state.isHorde = true;
                }
                this._debounceRender();
            });
        }

        // Equipment preset select
        const presetSelect = form.querySelector<HTMLSelectElement>('[name="preset"]');
        if (presetSelect !== null) {
            presetSelect.addEventListener('change', () => {
                this.#state.preset = presetSelect.value;
                this._debounceRender();
            });
        }

        // Faction input
        const factionInput = form.querySelector<HTMLInputElement>('[name="faction"]');
        if (factionInput !== null) {
            factionInput.addEventListener('input', () => {
                this.#state.faction = factionInput.value;
            });
        }

        // Horde checkbox
        const hordeCheckbox = form.querySelector<HTMLInputElement>('[name="isHorde"]');
        if (hordeCheckbox !== null) {
            hordeCheckbox.addEventListener('change', () => {
                this.#state.isHorde = hordeCheckbox.checked;
                this._debounceRender();
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
     * @param {SubmitEvent} event - The submit event.
     * @param {HTMLFormElement} form - The form element.
     * @param {FormDataExtended} formData - The form data.
     */
    static async #onSubmit(this: NPCQuickCreateDialog, _event: SubmitEvent, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const data = foundry.utils.expandObject(formData.object) as Partial<NPCState>;

        // Update state from form
        this.#state.name = data.name ?? 'New NPC';
        this.#state.threatLevel = parseInt(String(data.threatLevel ?? '5'), 10) || 5;
        this.#state.role = data.role ?? 'specialist';
        this.#state.type = data.type ?? 'troop';
        this.#state.preset = data.preset ?? 'mixed';
        this.#state.faction = data.faction ?? '';
        this.#state.isHorde = data.isHorde === true || String(data.isHorde) === 'true';

        // Generate NPC data
        // eslint-disable-next-line no-restricted-syntax -- boundary: ThreatCalculator.generateNPCData accepts Record<string,unknown>; NPCState satisfies the shape at runtime
        const npcSystemData = ThreatCalculator.generateNPCData(this.#state as unknown as Record<string, unknown>);

        // Create the actor
        const actorData = {
            name: this.#state.name,
            type: 'npcV2',
            img: 'icons/svg/mystery-man.svg',
            system: npcSystemData,
        };

        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create expects a complex Foundry type; actorData matches the required shape at runtime
            const actor = (await Actor.create(actorData as unknown as Parameters<typeof Actor.create>[0])) as WH40KNPC | undefined;

            if (actor) {
                ui.notifications.info(`Created NPC: ${String(actor.name)}`);

                // Open the sheet
                // eslint-disable-next-line @typescript-eslint/no-deprecated -- actor.sheet.render(true) is the V14 pattern for reopening actor sheets; render({ force: true }) breaks actor sheets
                void actor.sheet?.render(true);

                this.#submitted = true;
                if (this.#resolve) this.#resolve(actor);
            }
        } catch (error) {
            console.error('Failed to create NPC:', error);
            ui.notifications.error(game.i18n.localize('WH40K.NPC.QuickCreateFailed'));
            if (this.#resolve) this.#resolve(null);
        }
    }

    /**
     * Handle cancel button.
     * @param {PointerEvent} event - The click event.
     * @param {HTMLElement} target - The target element.
     */
    static async #onCancel(this: NPCQuickCreateDialog, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        this.#submitted = false;
        if (this.#resolve) this.#resolve(null);
        await this.close();
    }

    /**
     * Handle preview update (for any action that triggers re-render).
     * @param {PointerEvent} event - The click event.
     * @param {HTMLElement} target - The target element.
     */
    static #onUpdatePreview(this: NPCQuickCreateDialog, _event: PointerEvent, _target: HTMLElement): void {
        // Re-render to update preview
        void this.render({ parts: ['form'] });
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2.close() accepts untyped options; signature must match the framework override
    override async close(options: Record<string, unknown> = {}): Promise<void> {
        // Clear any pending render
        if (this._renderTimeout) clearTimeout(this._renderTimeout);

        // Resolve as null if not submitted
        if (!this.#submitted && this.#resolve) {
            this.#resolve(null);
        }

        await super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for the dialog to complete.
     * @returns {Promise<WH40KNPC | null>} The created actor, or null if cancelled.
     */
    async wait(): Promise<WH40KNPC | null> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Open the quick create dialog and wait for result.
     * @param {Partial<NPCState>} [config] - Initial configuration.
     * @returns {Promise<WH40KNPC | null>} The created actor, or null if cancelled.
     */
    static async create(config: Partial<NPCState> = {}): Promise<WH40KNPC | null> {
        const dialog = new this(config);
        return dialog.wait();
    }

    /**
     * Create multiple NPCs at once (batch creation).
     * @param {Object} config - Configuration for batch creation.
     * @param {number} config.count - Number of NPCs to create.
     * @param {string} config.namePattern - Name pattern (use {n} for number).
     * @param {boolean} config.randomize - Whether to randomize stats slightly.
     * @param {Record<string, unknown>} config.baseConfig - Base NPC configuration.
     * @returns {Promise<WH40KNPC[]>} Array of created actors.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: baseConfig is a caller-provided NPC configuration object with unknown field shapes
    static async createBatch(config: { count: number; namePattern: string; randomize: boolean; baseConfig: Record<string, unknown> }): Promise<WH40KNPC[]> {
        const { count = 1, namePattern = 'NPC {n}', randomize = false, baseConfig = {} } = config;

        const baseData = ThreatCalculator.generateNPCData(baseConfig);

        const actorDataList = Array.from({ length: count }, (_, idx) => {
            const name = namePattern.replace('{n}', String(idx + 1));
            const systemData = foundry.utils.deepClone(baseData);

            if (randomize) {
                // Randomize characteristics slightly (±5)
                for (const char of Object.values(systemData.characteristics)) {
                    const variance = Math.floor(Math.random() * 11) - 5;
                    char.base = Math.max(10, Math.min(99, char.base + variance));
                    char.total = char.base + char.modifier;
                    char.bonus = Math.floor(char.total / 10);
                }
            }

            return {
                name,
                type: 'npcV2',
                img: 'icons/svg/mystery-man.svg',
                system: systemData,
                // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.create expects a complex Foundry type; the actorData object satisfies the required shape at runtime
            } as unknown as Parameters<typeof Actor.create>[0];
        });

        const results = await Promise.all(actorDataList.map(async (data) => Actor.create(data)));
        const actors: WH40KNPC[] = [];
        for (const result of results) {
            if (result !== undefined) actors.push(result as WH40KNPC);
        }

        ui.notifications.info(`Created ${actors.length} NPCs`);
        return actors;
    }
}
