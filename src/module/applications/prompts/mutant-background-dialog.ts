/**
 * @file MutantBackgroundDialog — GM dialog confirming the Mutant
 * origin path background for a fresh dh2 character. Surfaces the
 * +10 starting Corruption and the Twisted Flesh talent grant, and
 * (when an actor is provided) applies both on confirm. Also emits
 * a chat card announcing the application.
 *
 * Mechanical hooks come from `MUTANT_STARTING_CORRUPTION` and
 * `canConvertMalignancyToMutation` in
 * `src/module/rules/chaos-backgrounds.ts`. Wires into the
 * Malignancy test pipeline (#67) — when an actor with the Twisted
 * Flesh flag fails a Malignancy test, the chat-card "Convert
 * Failed Malignancy" action becomes available.
 *
 * See GitHub issue #91.
 */

import { MUTANT_STARTING_CORRUPTION } from '../../rules/chaos-backgrounds.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Minimal actor surface the dialog touches — kept narrow to avoid Document coupling. */
interface MutantTargetActor {
    id?: string | undefined;
    name?: string | undefined;
    system?: { corruption?: { value?: number } | number };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update accepts a path-keyed payload and resolves to the updated Document (framework signature)
    update?: (data: Record<string, unknown>) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.setFlag stores arbitrary serializable values keyed by scope/key (framework signature)
    setFlag?: (scope: string, key: string, value: unknown) => Promise<unknown>;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface MutantBackgroundContext extends Record<string, unknown> {
    startingCorruption: number;
    actorName: string | null;
    canApply: boolean;
}

function localize(key: string): string {
    return game.i18n.localize(key);
}

/**
 * GM-only dialog: confirm the Mutant background, click Apply, post
 * a chat card. When an actor was passed at construction time, the
 * dialog mutates `system.corruption` and sets a system flag marking
 * the Twisted Flesh talent grant so the Malignancy pipeline can
 * surface the conversion option.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class MutantBackgroundDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
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
        return {
            ...context,
            startingCorruption: MUTANT_STARTING_CORRUPTION,
            actorName: this.actor?.name ?? null,
            canApply: true,
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onApply(this: MutantBackgroundDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        // Apply mechanical effects when an actor was supplied.
        const actor = this.actor;
        if (actor !== null && typeof actor.update === 'function') {
            const current = readCorruption(actor);
            const next = current + MUTANT_STARTING_CORRUPTION;
            try {
                await actor.update({ 'system.corruption.value': next });
            } catch {
                /* swallow — chat card still posts so the GM has a record */
            }
            if (typeof actor.setFlag === 'function') {
                try {
                    await actor.setFlag('wh40k-rpg', 'twistedFlesh', true);
                } catch {
                    /* swallow */
                }
            }
        }

        const templateData = {
            startingCorruption: MUTANT_STARTING_CORRUPTION,
            actorName: actor?.name ?? null,
            gameSystem: 'dh2e',
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/mutant-background-chat.hbs', templateData);

        // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- boundary: ChatMessage.create payload shape lives outside our shipped types; game.user can be undefined before login in some Foundry boot paths
        const payload = { user: game.user?.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
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

/** Read the current corruption value off the actor, tolerating either schema shape. */
function readCorruption(actor: MutantTargetActor): number {
    const corruption = actor.system?.corruption;
    if (typeof corruption === 'number') return corruption;
    if (corruption !== undefined && typeof corruption.value === 'number') return corruption.value;
    return 0;
}

// Suppress unused-warning for the localize helper kept for parity with sibling dialogs.
void localize;

/** Convenience opener for the dialog. */
export function openMutantBackgroundDialog(actor: MutantTargetActor | null = null): void {
    const dialog = new MutantBackgroundDialog(actor);
    void dialog.render({ force: true });
}
