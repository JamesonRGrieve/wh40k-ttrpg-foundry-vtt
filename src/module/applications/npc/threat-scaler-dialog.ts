import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import ThreatCalculator, { type NPCSystemData } from './threat-calculator.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface CharacteristicChange {
    current: number;
    new: number;
    change: number;
    label?: string;
    short?: string;
}

interface ScalingPreview {
    characteristics: Record<string, CharacteristicChange>;
    wounds: { current: number; new: number };
    armour: { current: number | string; new: number | string };
    // eslint-disable-next-line no-restricted-syntax -- boundary: ThreatCalculator returns dynamic keys; index signature required
    [key: string]: unknown;
}

interface NPCSystemView {
    threatLevel: number;
}

interface ScalerState {
    newThreatLevel: number;
    scaleCharacteristics: boolean;
    scaleWounds: boolean;
    scaleSkills: boolean;
    scaleWeapons: boolean;
    scaleArmour: boolean;
    activeTab: string;
}

/**
 * Dialog for scaling an existing NPC's stats to a new threat level.
 * @extends {ApplicationV2}
 */
export default class NPCThreatScalerDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 form/action handlers accept method references and bind `this` itself */
    static DEFAULT_OPTIONS = {
        id: 'npc-threat-scaler-{id}',
        classes: ['wh40k-rpg', 'npc-threat-scaler-dialog'],
        tag: 'form',
        window: {
            title: 'WH40K.NPC.ScaleThreat',
            icon: 'fa-solid fa-chart-line',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 550,
            height: 650,
        },
        form: {
            handler: NPCThreatScalerDialog.#onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            cancel: NPCThreatScalerDialog.#onCancel,
            adjustThreat: NPCThreatScalerDialog.#onAdjustThreat,
            resetThreat: NPCThreatScalerDialog.#onResetThreat,
            updatePreview: NPCThreatScalerDialog.#onUpdatePreview,
        },
    };
    /* eslint-enable @typescript-eslint/unbound-method */

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/threat-scaler.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The actor being scaled.
     * @type {WH40KBaseActor | null}
     */
    readonly #actor: WH40KBaseActor | null = null;

    /**
     * Current form state.
     * @type {ScalerState}
     */
    readonly #state: ScalerState = {
        newThreatLevel: 5,
        scaleCharacteristics: true,
        scaleWounds: true,
        scaleSkills: true,
        scaleWeapons: true,
        scaleArmour: true,
        activeTab: 'characteristics',
    };

    /**
     * Promise resolver.
     * @type {((value: boolean) => void) | null}
     */
    #resolve: ((value: boolean) => void) | null = null;

    /**
     * Whether the dialog was submitted.
     * @type {boolean}
     */
    #submitted = false;

    /**
     * Original threat level for reset functionality.
     * @type {number}
     */
    readonly #originalThreat: number = 5;

    /**
     * Render timeout.
     * @type {ReturnType<typeof setTimeout> | null}
     */
    _renderTimeout: ReturnType<typeof setTimeout> | null = null;

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * @param {WH40KBaseActor} actor - The NPC actor to scale.
     * @param {Record<string, unknown>} [options] - Application options.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 ctor accepts arbitrary options record
    constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);
        this.#actor = actor;
        this.#originalThreat = (actor.system as NPCSystemView).threatLevel;
        this.#state.newThreatLevel = this.#originalThreat;
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        const name = this.#actor?.name;
        return game.i18n.format('WH40K.NPC.ScaleThreatTitle', { name: name !== undefined && name !== '' ? name : 'NPC' });
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        if (!this.#actor) return context;

        const currentThreat = (this.#actor.system as NPCSystemView).threatLevel;
        const newThreat = this.#state.newThreatLevel;
        const threatDifference = Math.abs(newThreat - currentThreat);

        // Get scaling preview
        const preview = ThreatCalculator.previewScaling(this.#actor.system as object as NPCSystemData, currentThreat, newThreat, {
            scaleCharacteristics: this.#state.scaleCharacteristics,
            scaleWounds: this.#state.scaleWounds,
            scaleSkills: this.#state.scaleSkills,
            scaleWeapons: this.#state.scaleWeapons,
            scaleArmour: this.#state.scaleArmour,
            // eslint-disable-next-line no-restricted-syntax -- boundary: ThreatCalculator returns untyped object; refined to ScalingPreview at consumer
        }) as unknown as ScalingPreview;

        // Prepare characteristics for display
        const characteristicChanges = Object.entries(preview.characteristics).map(([key, char]) => {
            const change = this.#state.scaleCharacteristics ? char.change : 0;
            const newValue = this.#state.scaleCharacteristics ? char.new : char.current;
            const percentChange = char.current > 0 ? Math.round((change / char.current) * 100) : 0;

            return {
                key,
                label: char.label,
                short: char.short,
                current: char.current,
                new: newValue,
                change,
                percentChange: percentChange > 0 ? `+${percentChange}` : `${percentChange}`,
            };
        });

        // Calculate wounds change
        const currentWounds = preview.wounds.current;
        const newWounds = this.#state.scaleWounds ? preview.wounds.new : currentWounds;
        const woundsChange = newWounds - currentWounds;

        // Calculate armour change
        const currentArmour = typeof preview.armour.current === 'number' ? preview.armour.current : 0;
        const newArmour = this.#state.scaleArmour && typeof preview.armour.new === 'number' ? preview.armour.new : currentArmour;
        const armourChange = newArmour - currentArmour;

        // Get tier info with colors
        const currentTier = ThreatCalculator.getTierInfo(currentThreat);
        const newTier = ThreatCalculator.getTierInfo(newThreat);

        return {
            ...context,

            // Actor info
            actor: this.#actor,

            // Threat levels
            currentThreat,
            newThreat,
            threatDifference,

            // Tier info
            currentTier,
            newTier,

            // Form state
            scaleCharacteristics: this.#state.scaleCharacteristics,
            scaleWounds: this.#state.scaleWounds,
            scaleSkills: this.#state.scaleSkills,
            scaleWeapons: this.#state.scaleWeapons,
            scaleArmour: this.#state.scaleArmour,

            // Preview data
            characteristicChanges,
            currentWounds,
            newWounds,
            woundsChange,
            currentArmour,
            newArmour,
            armourChange,
        };
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender accepts untyped context record
    _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

        const form = this.element;

        // Threat level slider - live update
        const threatSlider = form.querySelector<HTMLInputElement>('[name="newThreatLevel"]');
        if (threatSlider) {
            threatSlider.addEventListener('input', () => {
                this.#state.newThreatLevel = parseInt(threatSlider.value, 10);
                this._debounceRender();
            });
        }

        // Scaling option checkboxes
        const checkboxes: (keyof ScalerState)[] = ['scaleCharacteristics', 'scaleWounds', 'scaleSkills', 'scaleWeapons', 'scaleArmour'];

        for (const name of checkboxes) {
            const checkbox = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: writing to a known-but-string-keyed field of #state via dynamic key
                    (this.#state as unknown as Record<string, unknown>)[name] = checkbox.checked;
                    this._debounceRender();
                });
            }
        }

        // Preview tabs
        const tabs = form.querySelectorAll('.wh40k-preview-tab');
        const sections = form.querySelectorAll('.wh40k-preview-section');

        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                const targetTab = (tab as HTMLElement).dataset.tab;

                // Update active tab
                tabs.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');

                // Update active section
                sections.forEach((s) => {
                    const sectionElement = s as HTMLElement;
                    if (sectionElement.dataset.section === targetTab) {
                        sectionElement.classList.add('active');
                    } else {
                        sectionElement.classList.remove('active');
                    }
                });
            });
        });
    }

    /**
     * Debounced render for preview updates.
     * @private
     */
    _debounceRender(): void {
        if (this._renderTimeout) clearTimeout(this._renderTimeout);
        this._renderTimeout = setTimeout(() => {
            void this.render({ parts: ['form'] });
        }, 100);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle adjust threat preset buttons.
     * @param {NPCThreatScalerDialog} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onAdjustThreat(this: NPCThreatScalerDialog, event: PointerEvent, target: HTMLElement): void {
        const amount = parseInt(target.dataset.amount ?? '0', 10);
        if (amount === 0 || Number.isNaN(amount)) return;

        const newValue = Math.max(1, Math.min(30, this.#state.newThreatLevel + amount));
        this.#state.newThreatLevel = newValue;

        // Update slider
        const slider = this.element.querySelector<HTMLInputElement>('[name="newThreatLevel"]');
        if (slider) slider.value = String(newValue);

        void this.render({ parts: ['form'] });
    }

    /**
     * Handle reset threat button.
     * @param {NPCThreatScalerDialog} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onResetThreat(this: NPCThreatScalerDialog, event: PointerEvent, target: HTMLElement): void {
        this.#state.newThreatLevel = this.#originalThreat;

        // Update slider
        const slider = this.element.querySelector<HTMLInputElement>('[name="newThreatLevel"]');
        if (slider) slider.value = String(this.#originalThreat);

        void this.render({ parts: ['form'] });
    }

    /**
     * Handle preview updates from slider.
     * @param {NPCThreatScalerDialog} this
     * @param {InputEvent} event
     * @param {HTMLElement} target
     */
    static #onUpdatePreview(this: NPCThreatScalerDialog, event: InputEvent, target: HTMLElement): void {
        this.#state.newThreatLevel = parseInt((target as HTMLInputElement).value, 10);

        // Debounce render
        if (this._renderTimeout) clearTimeout(this._renderTimeout);
        this._renderTimeout = setTimeout(() => {
            void this.render({ parts: ['form'] });
        }, 100);
    }

    /**
     * Handle form submission.
     * @param {NPCThreatScalerDialog} this
     * @param {SubmitEvent} event
     * @param {HTMLFormElement} form
     * @param {foundry.applications.api.FormDataExtended} formData
     */
    static async #onSubmit(this: NPCThreatScalerDialog, event: SubmitEvent, form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        if (!this.#actor) return;

        const data = foundry.utils.expandObject(formData.object) as Partial<ScalerState>;

        // Update state from form
        this.#state.newThreatLevel = parseInt(String(data.newThreatLevel), 10);
        this.#state.scaleCharacteristics = data.scaleCharacteristics === true || String(data.scaleCharacteristics) === 'true';
        this.#state.scaleWounds = data.scaleWounds === true || String(data.scaleWounds) === 'true';
        this.#state.scaleSkills = data.scaleSkills === true || String(data.scaleSkills) === 'true';
        this.#state.scaleWeapons = data.scaleWeapons === true || String(data.scaleWeapons) === 'true';
        this.#state.scaleArmour = data.scaleArmour === true || String(data.scaleArmour) === 'true';

        const currentThreat = (this.#actor.system as NPCSystemView).threatLevel;
        const newThreat = this.#state.newThreatLevel;

        // Check for no change
        if (currentThreat === newThreat) {
            // eslint-disable-next-line no-restricted-syntax -- TODO: needs WH40K.NPC.NoThreatChange localization key
            ui.notifications.info('No threat level change specified');
            this.#submitted = true;
            if (this.#resolve) this.#resolve(false);
            return;
        }

        // Get the updates
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system shape varies by gameSystem; ThreatCalculator narrows internally
        const updates = ThreatCalculator.scaleToThreat(this.#actor.system as unknown as NPCSystemData, currentThreat, newThreat, {
            scaleCharacteristics: this.#state.scaleCharacteristics,
            scaleWounds: this.#state.scaleWounds,
            scaleSkills: this.#state.scaleSkills,
            scaleWeapons: this.#state.scaleWeapons,
            scaleArmour: this.#state.scaleArmour,
        });

        // Prepare update object with system prefix
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry .update() accepts arbitrary path-keyed payload
        const actorUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
            actorUpdates[`system.${key}`] = value;
        }

        try {
            await this.#actor.update(actorUpdates);

            ui.notifications.info(
                game.i18n.format('WH40K.NPC.ScaledThreat', {
                    name: String(this.#actor.name),
                    from: String(currentThreat),
                    to: String(newThreat),
                }),
            );

            this.#submitted = true;
            if (this.#resolve) this.#resolve(true);
        } catch (error) {
            console.error('Failed to scale NPC:', error);
            // eslint-disable-next-line no-restricted-syntax -- TODO: needs WH40K.NPC.ScaleFailed localization key
            ui.notifications.error('Failed to scale NPC');
            if (this.#resolve) this.#resolve(false);
        }
    }

    /**
     * Handle cancel button.
     * @param {NPCThreatScalerDialog} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #onCancel(this: NPCThreatScalerDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        this.#submitted = false;
        if (this.#resolve) this.#resolve(false);
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close accepts arbitrary options record
    async close(options: Record<string, unknown> = {}): Promise<void> {
        // Clear any pending render
        if (this._renderTimeout) clearTimeout(this._renderTimeout);

        // Resolve as false if not submitted
        if (!this.#submitted && this.#resolve) {
            this.#resolve(false);
        }

        await super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for the dialog to complete.
     * @returns {Promise<boolean>} True if scaling was applied, false otherwise.
     */
    async wait(): Promise<boolean> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render({ force: true });
        });
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Open the threat scaler dialog for an actor.
     * @param {WH40KBaseActor} actor - The NPC actor to scale.
     * @returns {Promise<boolean>} True if scaling was applied, false otherwise.
     */
    static async scale(actor: WH40KBaseActor): Promise<boolean> {
        if ((actor.type as string) !== 'npcV2') {
            // eslint-disable-next-line no-restricted-syntax -- TODO: needs WH40K.NPC.ScaleOnlyV2 localization key
            ui.notifications.warn('Can only scale npcV2 type actors');
            return false;
        }

        const dialog = new this(actor);
        return dialog.wait();
    }
}
