import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import ThreatCalculator from './threat-calculator.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
    #actor: WH40KBaseActor | null = null;

    /**
     * Current form state.
     * @type {ScalerState}
     */
    #state: ScalerState = {
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
    #originalThreat = 5;

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
    constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);
        this.#actor = actor;
        this.#originalThreat = (actor.system as any).threatLevel || 5;
        this.#state.newThreatLevel = this.#originalThreat;
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        return game.i18n.format('WH40K.NPC.ScaleThreatTitle', { name: this.#actor?.name || 'NPC' });
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        if (!this.#actor) return context;

        const currentThreat = (this.#actor.system as any).threatLevel;
        const newThreat = this.#state.newThreatLevel;
        const threatDifference = Math.abs(newThreat - currentThreat);

        // Get scaling preview
        const preview = ThreatCalculator.previewScaling(this.#actor.system as any, currentThreat, newThreat, {
            scaleCharacteristics: this.#state.scaleCharacteristics,
            scaleWounds: this.#state.scaleWounds,
            scaleSkills: this.#state.scaleSkills,
            scaleWeapons: this.#state.scaleWeapons,
            scaleArmour: this.#state.scaleArmour,
        });

        // Prepare characteristics for display
        const characteristicChanges = Object.entries(preview.characteristics as Record<string, any>).map(([key, char]) => {
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
    _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void {
        void super._onRender(context, options);

        const form = this.element;

        // Threat level slider - live update
        const threatSlider = form.querySelector('[name="newThreatLevel"]') as HTMLInputElement | null;
        if (threatSlider) {
            threatSlider.addEventListener('input', () => {
                this.#state.newThreatLevel = parseInt(threatSlider.value, 10);
                this._debounceRender();
            });
        }

        // Scaling option checkboxes
        const checkboxes: (keyof ScalerState)[] = ['scaleCharacteristics', 'scaleWounds', 'scaleSkills', 'scaleWeapons', 'scaleArmour'];

        for (const name of checkboxes) {
            const checkbox = form.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
            if (checkbox) {
                checkbox.addEventListener('change', () => {
                    this.#state[name] = checkbox.checked;
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
        const amount = parseInt(target.dataset.amount || '0', 10);
        if (!amount) return;

        const newValue = Math.max(1, Math.min(30, this.#state.newThreatLevel + amount));
        this.#state.newThreatLevel = newValue;

        // Update slider
        const slider = this.element.querySelector('[name="newThreatLevel"]') as HTMLInputElement | null;
        if (slider) slider.value = String(newValue);

        this.render({ parts: ['form'] });
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
        const slider = this.element.querySelector('[name="newThreatLevel"]') as HTMLInputElement | null;
        if (slider) slider.value = String(this.#originalThreat);

        this.render({ parts: ['form'] });
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
    static async #onSubmit(
        this: NPCThreatScalerDialog,
        event: SubmitEvent,
        form: HTMLFormElement,
        formData: foundry.applications.api.FormDataExtended,
    ): Promise<void> {
        if (!this.#actor) return;

        const data = foundry.utils.expandObject(formData.object) as Partial<ScalerState>;

        // Update state from form
        this.#state.newThreatLevel = parseInt(String(data.newThreatLevel), 10);
        this.#state.scaleCharacteristics = data.scaleCharacteristics === true || data.scaleCharacteristics === 'true';
        this.#state.scaleWounds = data.scaleWounds === true || data.scaleWounds === 'true';
        this.#state.scaleSkills = data.scaleSkills === true || data.scaleSkills === 'true';
        this.#state.scaleWeapons = data.scaleWeapons === true || data.scaleWeapons === 'true';
        this.#state.scaleArmour = data.scaleArmour === true || data.scaleArmour === 'true';

        const currentThreat = (this.#actor.system as any).threatLevel;
        const newThreat = this.#state.newThreatLevel;

        // Check for no change
        if (currentThreat === newThreat) {
            ui.notifications.info('No threat level change specified');
            this.#submitted = true;
            if (this.#resolve) this.#resolve(false);
            return;
        }

        // Get the updates
        const updates = ThreatCalculator.scaleToThreat(this.#actor.system as any, currentThreat, newThreat, {
            scaleCharacteristics: this.#state.scaleCharacteristics,
            scaleWounds: this.#state.scaleWounds,
            scaleSkills: this.#state.scaleSkills,
            scaleWeapons: this.#state.scaleWeapons,
            scaleArmour: this.#state.scaleArmour,
        });

        // Prepare update object with system prefix
        const actorUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
            actorUpdates[`system.${key}`] = value;
        }

        try {
            await this.#actor.update(actorUpdates);

            ui.notifications.info(
                game.i18n.format('WH40K.NPC.ScaledThreat', {
                    name: this.#actor.name,
                    from: currentThreat,
                    to: newThreat,
                }),
            );

            this.#submitted = true;
            if (this.#resolve) this.#resolve(true);
        } catch (error) {
            console.error('Failed to scale NPC:', error);
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
    async close(options: Record<string, unknown> = {}): Promise<void> {
        // Clear any pending render
        if (this._renderTimeout) clearTimeout(this._renderTimeout);

        // Resolve as false if not submitted
        if (!this.#submitted && this.#resolve) {
            this.#resolve(false);
        }

        return super.close(options);
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
            void this.render(true);
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
        if (!actor || actor.type !== 'npcV2') {
            ui.notifications.warn('Can only scale npcV2 type actors');
            return false;
        }

        const dialog = new this(actor);
        return dialog.wait();
    }
}
