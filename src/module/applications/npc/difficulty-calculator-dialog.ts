import type { WH40KNPC } from '../../documents/npc.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

interface DialogState {
    npc: WH40KNPC | null;
    quantity: number;
}

interface DifficultyRating {
    key: string;
    label: string;
    color: string;
    description: string;
}

/**
 * Dialog for calculating encounter difficulty against the party.
 * Analyzes active party members and compares to NPC threat rating.
 *
 * @extends {HandlebarsApplicationMixin(ApplicationV2)}
 */
export default class DifficultyCalculatorDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /**
     * Internal state for the dialog.
     * @type {DialogState}
     */
    readonly #state: DialogState = {
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
            // eslint-disable-next-line no-restricted-syntax -- this IS a localization key, not hardcoded English
            title: 'WH40K.NPC.DifficultyCalculator',
            icon: 'fa-solid fa-calculator',
        },
        position: {
            width: 600,
            // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 position.height accepts number | 'auto'
            height: 'auto' as unknown as number,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method -- Foundry action handlers are invoked with the application as `this`
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
     * @param {Record<string, unknown>} options - Application options.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 options is untyped record
    constructor(npc: WH40KNPC, options: Record<string, unknown> = {}) {
        super(options);
        this.#state.npc = npc;
    }

    /* -------------------------------------------- */
    /*  Static Factory Methods                      */
    /* -------------------------------------------- */

    /**
     * Show the difficulty calculator for an NPC.
     * @param {WH40KNPC} npc - The NPC actor.
     * @returns {DifficultyCalculatorDialog}
     */
    static show(npc: WH40KNPC): DifficultyCalculatorDialog {
        const dialog = new DifficultyCalculatorDialog(npc);
        void dialog.render(true);
        return dialog;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        type PartyUser = {
            active: boolean;
            character?: {
                name?: string;
                img?: string;
                system?: { rank?: number };
            } | null;
            name?: string;
            avatar?: string;
        };
        type NPCSystem = { threatLevel?: number; type?: string; horde?: { enabled?: boolean } };

        // Get party info
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry user collection narrowed to local PartyUser shape
        const party = game.users.filter((u) => u.active && !!u.character) as unknown as PartyUser[];
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
        if (!npc) return context;

        // eslint-disable-next-line no-restricted-syntax -- boundary: per-system NPC schemas read uniformly via local NPCSystem shape
        const npcSystem = npc.system as unknown as NPCSystem;
        const npcThreat = npcSystem.threatLevel ?? 0;
        const quantity = this.#state.quantity;
        const totalThreat = npcThreat * quantity;

        // Threat ratio determines difficulty
        const threatRatio = partyThreat > 0 ? totalThreat / partyThreat : 0;
        const difficulty = this._getDifficultyRating(threatRatio);

        context.npc = {
            name: npc.name,
            img: npc.img,
            threatLevel: npcThreat,
            type: npcSystem.type,
            isHorde: npcSystem.horde?.enabled ?? false,
        };
        context.partySize = partySize;
        context.partyLevel = partyLevel;
        context.partyThreat = partyThreat;
        context.quantity = quantity;
        context.totalThreat = totalThreat;
        context.threatRatio = threatRatio.toFixed(2);
        context.difficulty = difficulty;

        // Add party members list
        context.partyMembers = party.map((u) => ({
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
     * @returns {DifficultyRating} Difficulty object with key, label, color, description.
     * @private
     */
    _getDifficultyRating(ratio: number): DifficultyRating {
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
     * @param {DifficultyCalculatorDialog} this
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #updateQuantity(this: DifficultyCalculatorDialog, event: PointerEvent, target: HTMLElement): void {
        event.preventDefault();
        const input = target.closest('form')?.querySelector('[name="quantity"]') as HTMLInputElement | null;
        if (!input) return;
        const quantity = parseInt(input.value, 10) || 1;
        this.#state.quantity = Math.max(1, quantity);
        void this.render();
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /** @override */
    _attachPartListeners(partId: string, htmlElement: HTMLElement, options: ApplicationV2Config.RenderOptions): void {
        const proto = Object.getPrototypeOf(Object.getPrototypeOf(this)) as {
            _attachPartListeners?: (p: string, h: HTMLElement, o: ApplicationV2Config.RenderOptions) => void;
        };
        proto._attachPartListeners?.call(this, partId, htmlElement, options);

        // Listen for quantity input changes
        const quantityInput = htmlElement.querySelector('[name="quantity"]');
        if (quantityInput) {
            quantityInput.addEventListener('input', (event: Event) => {
                const input = event.target as HTMLInputElement;
                const quantity = parseInt(input.value, 10) || 1;
                this.#state.quantity = Math.max(1, quantity);
                void this.render();
            });
        }
    }
}
