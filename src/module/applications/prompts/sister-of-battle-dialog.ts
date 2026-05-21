/**
 * @file SisterOfBattleDialog — GM dialog confirming the Sister of
 * Battle elite advance for an applicant. Shows the three granted
 * talents (Faith of the Emperor, Holy Aegis, Sister's Resolve) and
 * emits a chat card listing the grants on confirm.
 *
 * No actor mutation here — the advance item is applied through the
 * standard compendium flow. This surface is the GM-facing
 * confirmation step plus the resulting chat announcement, driven
 * from `SISTER_OF_BATTLE_TALENTS` in
 * `src/module/rules/sister-of-battle.ts`.
 *
 * See GitHub issue #134.
 */

import { SISTER_OF_BATTLE_TALENTS, type SisterOfBattleTalent } from '../../rules/sister-of-battle.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Card view-model — one entry per talent rendered in the dialog + chat card. */
interface TalentCard {
    id: string;
    label: string;
    summary: string;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface SisterOfBattleContext extends Record<string, unknown> {
    talents: TalentCard[];
    canApply: boolean;
}

function localize(key: string): string {
    return game.i18n.localize(key);
}

function buildTalentCards(): TalentCard[] {
    return SISTER_OF_BATTLE_TALENTS.map(
        (talent: SisterOfBattleTalent): TalentCard => ({
            id: talent.id,
            label: localize(talent.label),
            summary: localize(talent.summary),
        }),
    );
}

/**
 * GM-only dialog: confirm the Sister of Battle elite advance, click
 * Apply, post a chat card. The chat card is system-themed via
 * `data-wh40k-system="dh2e"`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class SisterOfBattleDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
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

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<SisterOfBattleContext> {
        const context = (await super._prepareContext(options)) as SisterOfBattleContext;
        return {
            ...context,
            talents: buildTalentCards(),
            canApply: true,
        };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onApply(this: SisterOfBattleDialog, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const templateData = {
            talents: buildTalentCards(),
            gameSystem: 'dh2e',
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/sister-of-battle-chat.hbs', templateData);

        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const payload = { user: game.user.id, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(payload);
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
