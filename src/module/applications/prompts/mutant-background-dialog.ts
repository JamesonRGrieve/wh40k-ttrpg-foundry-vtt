/**
 * @file MutantBackgroundDialog — GM dialog finishing the Mutant origin path
 * background for a dh2 character (a DH2 supplement).
 *
 * The Mutant's 10 starting Corruption is an origin resource: the origin-grant
 * ledger applies it from the Mutant origin's `modifiers.resources.corruption`
 * when the origin is committed, and queues no Malignancy Test for it. In place
 * of that test the rules have the character roll 5d10 on the Mutations table
 * to determine a starting mutation. This dialog makes that roll (the
 * formula is the origin's `grants.startingMutationFormula`), adds the rolled
 * mutation to the character, sets the Twisted Flesh flag, and posts a chat card.
 *
 * The rule lives in `src/module/rules/chaos-backgrounds.ts`. See GitHub #91.
 */

import { SYSTEM_ID } from '../../constants.ts';
import { emitChatFromTemplate } from '../../rolls/roll-helpers.ts';
import { originStartingCorruption, startingMutationFormula, startingMutationRow, TWISTED_FLESH_FLAG } from '../../rules/chaos-backgrounds.ts';
import { loadMutationEntries } from '../../rules/mutation-roll.ts';
import type { WH40KMutantBackgroundOrigin, WH40KMutantBackgroundTarget } from '../../types/global.d.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/**
 * Minimal actor surface the dialog touches — kept narrow to avoid Document
 * coupling. Declared in `types/global.d.ts` rather than here because the
 * launcher signature on `game.wh40k.prompts` needs the same shape, and that
 * interface cannot import this module (see the note on `WH40KPromptLaunchers`
 * — a `typeof` import there closes a `no-circular` cycle per launcher).
 */
type MutantTargetActor = WH40KMutantBackgroundTarget;

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface MutantBackgroundContext extends Record<string, unknown> {
    startingCorruption: number;
    mutationFormula: string | null;
    actorName: string | null;
    canApply: boolean;
}

/** The actor's origin carrying a starting-mutation roll (the Mutant background), if any. */
function mutantOrigin(actor: MutantTargetActor | null): WH40KMutantBackgroundOrigin | null {
    if (actor?.items === undefined) return null;
    for (const item of actor.items) {
        if (item.type === 'originPath' && startingMutationFormula(item.system) !== null) return item;
    }
    return null;
}

/**
 * GM-only dialog: roll the Mutant's starting mutation, add it to the
 * character, set the Twisted Flesh flag the Malignancy pipeline reads, and post
 * a chat card. Apply is only offered for a character that carries the Mutant
 * origin, since the roll's formula and the starting Corruption are that
 * origin's content.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
class MutantBackgroundDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /** Optional target actor; null when the GM opens the dialog without a selection. */
    declare actor: MutantTargetActor | null;

    constructor(actor: MutantTargetActor | null = null, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.actor = actor;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'mutant-background-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            apply: MutantBackgroundDialog.#onApply,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: MutantBackgroundDialog.#onCancel,
        },
        position: {
            width: 560,
        },
        window: {
            title: 'WH40K.MutantBackground.DialogTitle',
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/mutant-background-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<MutantBackgroundContext> {
        const context = (await super._prepareContext(options)) as MutantBackgroundContext;
        const origin = mutantOrigin(this.actor);
        return {
            ...context,
            startingCorruption: origin === null ? 0 : originStartingCorruption(origin.system),
            mutationFormula: origin === null ? null : startingMutationFormula(origin.system),
            actorName: this.actor?.name ?? null,
            canApply: origin !== null,
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onApply(this: MutantBackgroundDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const actor = this.actor;
        const origin = mutantOrigin(actor);
        const formula = origin === null ? null : startingMutationFormula(origin.system);
        if (actor === null || origin === null || formula === null) return;

        // Roll the formula on the Mutations table for the starting mutation.
        const roll = await new Roll(formula).evaluate();
        const total = roll.total;
        const entries = (await loadMutationEntries()) ?? [];
        const mutation = startingMutationRow(entries, total);
        if (mutation === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.MutationRoll.TableMissing'));
        } else if (actor.createEmbeddedDocuments !== undefined) {
            const item = await fromUuid(mutation.uuid);
            if (item instanceof Item) await actor.createEmbeddedDocuments('Item', [item.toObject()]);
        }
        if (actor.setFlag !== undefined) await actor.setFlag(SYSTEM_ID, TWISTED_FLESH_FLAG, true);

        await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/mutant-background-chat.hbs', {
            startingCorruption: originStartingCorruption(origin.system),
            mutationFormula: formula,
            mutationTotal: total,
            mutationName: mutation?.name ?? null,
            actorName: actor.name ?? null,
            gameSystem: 'dh2',
        });
        await this.close();
    }

    /* -------------------------------------------- */

    static async #onCancel(this: MutantBackgroundDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** Convenience opener for the dialog. */
export function openMutantBackgroundDialog(actor: MutantTargetActor | null = null): void {
    const dialog = new MutantBackgroundDialog(actor);
    void dialog.render({ force: true });
}
