/**
 * @file IncorruptibleDevotionDialog — Adepta Sororitas trade dialog
 * (within.md p. 30). When the actor would gain Corruption and carries
 * the Incorruptible Devotion trait, this dialog offers a 1:1 trade:
 * decline the Corruption gain, apply the same amount of Insanity
 * instead. The applicability gate is `canApplyIncorruptibleDevotion`
 * in `src/module/rules/chaos-backgrounds.ts`; this surface owns the
 * UI + chat-card emission only.
 *
 * See GitHub issue #92.
 */

import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Constructor options — `corruptionAmount` is required at the call site. */
export interface IncorruptibleDevotionDialogOptions extends ApplicationV2Config.DefaultOptions {
    corruptionAmount?: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface IncorruptibleDevotionContext extends Record<string, unknown> {
    corruptionAmount: number;
    insanityAmount: number;
}

/**
 * Dialog: shows incoming Corruption, asks whether to trade 1:1 for
 * Insanity. On confirm, emits a chat card describing the trade; on
 * decline, emits a chat card noting the Corruption gain stands.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class IncorruptibleDevotionDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    /** Incoming Corruption amount the actor would otherwise gain. */
    declare corruptionAmount: number;

    constructor(options: IncorruptibleDevotionDialogOptions = {}) {
        super(options);
        const amount = typeof options.corruptionAmount === 'number' ? Math.max(0, Math.trunc(options.corruptionAmount)) : 0;
        this.corruptionAmount = amount;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'incorruptible-devotion-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            trade: IncorruptibleDevotionDialog.#onTrade,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            decline: IncorruptibleDevotionDialog.#onDecline,
        },
        position: {
            width: 480,
        },
        window: {
            title: 'WH40K.IncorruptibleDevotion.DialogTitle',
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/incorruptible-devotion-dialog.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<IncorruptibleDevotionContext> {
        const context = (await super._prepareContext(options)) as IncorruptibleDevotionContext;
        return {
            ...context,
            corruptionAmount: this.corruptionAmount,
            insanityAmount: this.corruptionAmount,
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onTrade(this: IncorruptibleDevotionDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.#emitChat(true);
        await this.close();
    }

    /* -------------------------------------------- */

    static async #onDecline(this: IncorruptibleDevotionDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.#emitChat(false);
        await this.close();
    }

    /* -------------------------------------------- */

    async #emitChat(traded: boolean): Promise<void> {
        const templateData = {
            corruptionAmount: this.corruptionAmount,
            insanityAmount: this.corruptionAmount,
            traded,
            gameSystem: 'dh2',
        };
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/incorruptible-devotion-chat.hbs', templateData);
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
    }
}

/* -------------------------------------------- */
/*  Helper                                      */
/* -------------------------------------------- */

/** Convenience opener. */
export function openIncorruptibleDevotionDialog(corruptionAmount: number): void {
    const dialog = new IncorruptibleDevotionDialog({ corruptionAmount });
    void dialog.render({ force: true });
}
