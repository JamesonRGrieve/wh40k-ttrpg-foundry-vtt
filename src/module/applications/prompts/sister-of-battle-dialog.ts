/**
 * @file SisterOfBattleDialog — GM dialog confirming the Sister of
 * Battle elite advance for an applicant. Lists what the advance grants
 * and emits a chat card listing the grants on confirm.
 *
 * No actor mutation here — the advance item is applied through the
 * standard compendium flow. Every row comes from the elite advance
 * document (found by `system.identifier`), turned into rows by
 * `advanceGrantCards` in `src/module/rules/sister-of-battle.ts`; no talent
 * name or rule lives in code.
 *
 * See GitHub issue #134.
 */

import { emitChatFromTemplate } from '../../rolls/roll-helpers.ts';
import { advanceGrantCards, SISTER_OF_BATTLE_ADVANCE_IDENTIFIER, type AdvanceGrantCard, type AdvanceGrantsLike } from '../../rules/sister-of-battle.ts';
import { findItemUuidByIdentifier } from '../../utils/compendium-query.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** The game line whose packs hold the advance (an Enemies Within, DH2 advance). */
const ADVANCE_LINE = 'dh2';

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface SisterOfBattleContext extends Record<string, unknown> {
    talents: AdvanceGrantCard[];
    requirementsText: string;
    canApply: boolean;
}

/** What the dialog shows, read off the elite advance document. */
interface AdvanceView {
    cards: AdvanceGrantCard[];
    requirementsText: string;
}

/** The slice of the origin-path DataModel the dialog reads. */
interface AdvanceSystemLike {
    grants?: AdvanceGrantsLike;
    requirements?: { text?: string };
}

/** Load the elite advance document's requirements and grant rows; empty when the pack lacks it. */
async function loadAdvanceView(): Promise<AdvanceView> {
    const empty: AdvanceView = { cards: [], requirementsText: '' };
    const uuid = await findItemUuidByIdentifier('originPath', SISTER_OF_BATTLE_ADVANCE_IDENTIFIER, ADVANCE_LINE);
    if (uuid === null) return empty;
    const advance = await fromUuid(uuid);
    if (!(advance instanceof Item)) return empty;
    const system: AdvanceSystemLike = advance.system;
    return {
        cards: system.grants === undefined ? [] : advanceGrantCards(system.grants),
        requirementsText: system.requirements?.text ?? '',
    };
}

/**
 * GM-only dialog: confirm the Sister of Battle elite advance, click
 * Apply, post a chat card. The chat card is system-themed via
 * `data-wh40k-system="dh2"`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
class SisterOfBattleDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /** The advance's requirements and grant rows, loaded once on first render. */
    #view: AdvanceView | null = null;

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'sister-of-battle-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            apply: SisterOfBattleDialog.#onApply,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: SisterOfBattleDialog.#onCancel,
        },
        position: {
            width: 560,
        },
        window: {
            title: 'WH40K.SisterOfBattle.DialogTitle',
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/sister-of-battle-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /** The advance view, loading it on first use. */
    async #advanceView(): Promise<AdvanceView> {
        if (this.#view !== null) return this.#view;
        const view = await loadAdvanceView();
        this.#view = view;
        return view;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<SisterOfBattleContext> {
        const context = (await super._prepareContext(options)) as SisterOfBattleContext;
        const view = await this.#advanceView();
        return {
            ...context,
            talents: view.cards,
            requirementsText: view.requirementsText,
            canApply: view.cards.length > 0,
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onApply(this: SisterOfBattleDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const templateData = {
            talents: (await this.#advanceView()).cards,
            gameSystem: ADVANCE_LINE,
        };

        await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/sister-of-battle-chat.hbs', templateData);
        await this.close();
    }

    /* -------------------------------------------- */

    static async #onCancel(this: SisterOfBattleDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper                                      */
/* -------------------------------------------- */

/** Convenience opener for the dialog. */
export function openSisterOfBattleDialog(): void {
    const dialog = new SisterOfBattleDialog();
    void dialog.render({ force: true });
}
