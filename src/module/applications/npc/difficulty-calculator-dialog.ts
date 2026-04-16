/**
 * @file DifficultyCalculatorDialog - Calculate encounter difficulty vs party
 * Phase 7: QoL Features
 *
 * Provides:
 * - Party composition analysis (size, average rank, total threat)
 * - NPC threat calculation with quantity multiplier
 * - Difficulty rating (Trivial → Apocalyptic)
 * - Visual indicators for encounter balance
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for calculating encounter difficulty against the party.
 * Analyzes active party members and compares to NPC threat rating.
 *
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export default class DifficultyCalculatorDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    [key: string]: any;

    /**
     * Internal state for the dialog.
     * @type {Object}
     */
    #state: any = {
        npc: null,
        quantity: 1,
    };

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'difficulty-calculator-{id}',
        classes: ['wh40k-rpg', 'difficulty-calculator-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.NPC.DifficultyCalculator',
            icon: 'fa-solid fa-calculator',
        },
        position: {
            width: 600,
            height: 'auto' as const,
        },
        actions: {
            updateQuantity: DifficultyCalculatorDialog.#updateQuantity,
        },
    };

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/difficulty-calculator.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Constructor                                 */
    /* -------------------------------------------- */

    /**
     * Create a new DifficultyCalculatorDialog.
     * @param {WH40KNPC} npc - The NPC actor to calculate difficulty for.
     * @param {Object} options - Application options.
     */
    constructor(npc, options = {}) {
        super(options);
        this.#state.npc = npc;
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Show the difficulty calculator for an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @returns {Promise<DifficultyCalculatorDialog>}
     */
    static show(npc: any): any {
        const dialog = new DifficultyCalculatorDialog(npc);
        void dialog.render(true);
        return dialog;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: any): Promise<any> {
        const context: any = await super._prepareContext(options);

        // Get party info
        const party = (game as any).users.filter((u: any) => u.active && u.character);
        const partySize = party.length;

        // Calculate average party rank
        let totalRank = 0;
        for (const user of party) {
            const rank = user.character?.system?.rank ?? 1;
            totalRank += rank;
        }
        const partyLevel = partySize > 0 ? Math.round(totalRank / partySize) : 1;

        // Party threat = size × rank × 2 (baseline formula)
        const partyThreat = partySize * partyLevel * 2;

        // NPC threat
        const npc = this.#state.npc;
        const npcThreat = npc.system.threatLevel;
        const quantity = this.#state.quantity;
        const totalThreat = npcThreat * quantity;

        // Threat ratio determines difficulty
        const threatRatio = partyThreat > 0 ? totalThreat / partyThreat : 0;
        const difficulty = this._getDifficultyRating(threatRatio);

        context.npc = {
            name: npc.name,
            img: npc.img,
            threatLevel: npcThreat,
            type: npc.system.type,
            isHorde: npc.system.horde?.enabled ?? false,
        };
        context.partySize = partySize;
        context.partyLevel = partyLevel;
        context.partyThreat = partyThreat;
        context.quantity = quantity;
        context.totalThreat = totalThreat;
        context.threatRatio = threatRatio.toFixed(2);
        context.difficulty = difficulty;

        // Add party members list
        context.partyMembers = party.map((u: any) => ({
            name: u.character?.name ?? u.name,
            rank: u.character?.system?.rank ?? 1,
            img: u.character?.img ?? u.avatar,
        }));

        return context;
    }

    /* -------------------------------------------- */
    /*  Difficulty Calculation                      */
    /* -------------------------------------------- */

    /**
     * Get difficulty rating from threat ratio.
     * @param {number} ratio - Threat ratio (NPC threat / Party threat).
     * @returns {Object} Difficulty object with key, label, color, description.
     * @private
     */
    _getDifficultyRating(ratio: number): any {
        if (ratio < 0.25) {
            return {
                key: 'trivial',
                label: 'Trivial',
                color: '#4caf50',
                description: 'This encounter poses no real threat to the party.',
            };
        }
        if (ratio < 0.5) {
            return {
                key: 'easy',
                label: 'Easy',
                color: '#8bc34a',
                description: 'The party should handle this encounter without significant resource expenditure.',
            };
        }
        if (ratio < 0.75) {
            return {
                key: 'moderate',
                label: 'Moderate',
                color: '#ff9800',
                description: 'A fair challenge that will require tactical thinking and resource management.',
            };
        }
        if (ratio < 1) {
            return {
                key: 'dangerous',
                label: 'Dangerous',
                color: '#ff5722',
                description: 'A difficult encounter. Party members may take significant wounds.',
            };
        }
        if (ratio < 1.5) {
            return {
                key: 'deadly',
                label: 'Deadly',
                color: '#f44336',
                description: 'A life-threatening encounter. Party members may die or suffer critical injuries.',
            };
        }
        return {
            key: 'apocalyptic',
            label: 'Apocalyptic',
            color: '#9c27b0',
            description: 'Near-certain TPK. Only attempt with significant advantages or preparation.',
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle updating the quantity.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #updateQuantity(this: any, event: Event, target: HTMLElement): void {
        event.preventDefault();
        const input = target.closest('form').querySelector('[name="quantity"]') as HTMLInputElement;
        const quantity = parseInt(input.value, 10) || 1;
        this.#state.quantity = Math.max(1, quantity);
        this.render();
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @override */
    _attachPartListeners(partId: string, htmlElement: HTMLElement, options: Record<string, unknown>): void {
        super._attachPartListeners(partId, htmlElement, options);

        // Listen for quantity input changes
        const quantityInput = htmlElement.querySelector('[name="quantity"]');
        if (quantityInput) {
            quantityInput.addEventListener('input', (event: any) => {
                const quantity = parseInt((event.target as HTMLInputElement).value, 10) || 1;
                this.#state.quantity = Math.max(1, quantity);
                void this.render();
            });
        }
    }
}
