/**
 * @file FateUsesDialog — read-only reference popout listing the canonical
 * Fate Point spend options for the active game system. Triggered from the
 * Fate icon on the character sheet (data-action="viewFateUses").
 *
 * The list of uses is sourced from `BaseSystemConfig.getFatePointUses()` so
 * per-system overrides surface naturally without touching this class.
 *
 * Implements issue #35.
 */

import { SystemConfigRegistry, type FatePointUseDef, type GameSystemId } from '../../config/game-systems/index.ts';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Bonus-attribute entry rendered alongside the canonical uses list. */
export interface FateBonusAttribute {
    /** Item / talent / career name. */
    name: string;
    /** One-line summary of how that attribute consumes fate points. */
    summary: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 context is a free-form template payload; Record<string, unknown> is the correct base shape
interface FateUsesContext extends Record<string, unknown> {
    uses: FatePointUseDef[];
    bonusAttributes: FateBonusAttribute[];
    gameSystem: GameSystemId | '';
}

interface FateUsesConfig {
    gameSystem: GameSystemId | null;
    bonusAttributes: FateBonusAttribute[];
}

export default class FateUsesDialog extends HandlebarsApplicationMixin(ApplicationV2) {
    /** @override */
    static override DEFAULT_OPTIONS = {
        id: 'fate-uses-dialog-{id}',
        classes: ['wh40k-rpg', 'fate-uses-dialog'],
        tag: 'div',
        window: {
            title: 'WH40K.FateUses.DialogTitle',
            icon: 'fa-solid fa-star',
            minimizable: false,
            resizable: false,
            contentClasses: ['standard-form', 'tw-p-0'],
        },
        position: {
            width: 460,
            // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-type-assertion -- Foundry accepts 'auto' here at runtime, but ApplicationV2's static typing still requires number
            height: 'auto' as unknown as number,
        },
        actions: {},
    };

    /** @override */
    static PARTS = {
        content: {
            template: 'systems/wh40k-rpg/templates/dialogs/fate-uses.hbs',
        },
    };

    readonly #config: FateUsesConfig;

    // eslint-disable-next-line no-restricted-syntax -- boundary: constructor options are forwarded to ApplicationV2 and remain a free-form Foundry options bag
    constructor(config: Partial<FateUsesConfig> = {}, options: Record<string, unknown> = {}) {
        super(options);
        this.#config = {
            gameSystem: config.gameSystem ?? null,
            bonusAttributes: config.bonusAttributes ?? [],
        };
    }

    /** @override */
    get title(): string {
        return game.i18n.localize('WH40K.FateUses.DialogTitle');
    }

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<FateUsesContext> {
        const context = await super._prepareContext(options);
        const systemId = this.#config.gameSystem;
        // Fall back to the DH2e canon if the active actor's game system is unknown.
        const config = systemId ? SystemConfigRegistry.getOrNull(systemId) : null;
        const fallback = SystemConfigRegistry.get('dh2e');
        const uses = (config ?? fallback).getFatePointUses();
        return {
            ...context,
            uses,
            bonusAttributes: this.#config.bonusAttributes,
            gameSystem: systemId ?? '',
        };
    }

    /**
     * Static helper for opening the dialog from a sheet action.
     */
    static open(config: Partial<FateUsesConfig> = {}): FateUsesDialog {
        const dialog = new this(config);
        void dialog.render(true);
        return dialog;
    }
}
