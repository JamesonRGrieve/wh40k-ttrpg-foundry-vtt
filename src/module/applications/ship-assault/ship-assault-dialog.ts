/**
 * @file ShipAssaultDialog — the dialog that runs one RT ship assault action
 * (ramming, boarding, Hit and Run) from the voidcraft sheet.
 *
 * Step 1: pick the target ship and enter the skills and situational
 * modifiers; Roll resolves the tests. Step 2: the dialog previews the card and
 * asks for any choice the rules leave to the winner; Apply writes the damage
 * onto the ships and posts the card to chat. The fields come from the flow, so
 * one template serves every action.
 */

import { WH40KVoidcraft } from '../../documents/voidcraft.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';
import { readAssaultForm } from './ship-assault-fields.ts';
import {
    foundryLocalize,
    ShipAssaultInputError,
    type AssaultCard,
    type AssaultFieldGroup,
    type ShipAssaultEntry,
    type ShipAssaultSession,
} from './ship-assault-flow.ts';

const { ApplicationV2 } = foundry.applications.api;

/**
 * The ships an attacker can aim an assault action at: the user's targeted
 * tokens first, then ships on the viewed scene, then every world ship. Only
 * Rogue Trader voidcraft qualify, and never the attacker itself.
 */
function listTargetShips(attacker: WH40KVoidcraft): WH40KVoidcraft[] {
    const found = new Set<WH40KVoidcraft>();
    const consider = (actor: Actor.Implementation | null | undefined): void => {
        if (!(actor instanceof WH40KVoidcraft) || actor === attacker || !actor.supportsShipAssault) return;
        found.add(actor);
    };
    for (const token of game.user.targets) consider(token.actor);
    for (const token of game.scenes.viewed?.tokens ?? []) consider(token.actor);
    for (const actor of game.actors) consider(actor);
    return [...found];
}

/** Post an assault chat card under the attacker's speaker with its dice attached. */
async function postAssaultCard(attacker: WH40KVoidcraft, card: AssaultCard, rolls: Roll[]): Promise<void> {
    const html = await foundry.applications.handlebars.renderTemplate(card.template, card.data);
    await ChatMessage.create({
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker requires Actor.Implementation; WH40KVoidcraft extends it but the typings widen
        speaker: ChatMessage.getSpeaker({ actor: attacker as unknown as Actor.Implementation }),
        content: html,
        rolls,
    });
}

/** One option of the target-ship select. */
interface TargetOption {
    value: string;
    label: string;
    selected: boolean;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface ShipAssaultDialogContext extends Record<string, unknown> {
    title: string;
    hint: string;
    hasTargets: boolean;
    targets: TargetOption[];
    resolved: boolean;
    groups: AssaultFieldGroup[];
    previewHtml: string;
}

interface ShipAssaultDialogOptions extends ApplicationV2Config.DefaultOptions {
    attacker: WH40KVoidcraft;
    entry: ShipAssaultEntry;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
class ShipAssaultDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    readonly attacker: WH40KVoidcraft;
    readonly entry: ShipAssaultEntry;
    /** The ships this action can be aimed at; the first is the default target. */
    readonly targets: WH40KVoidcraft[];
    /** The run against the chosen target; null when there is no target ship. */
    session: ShipAssaultSession | null;
    /** Index into {@link targets} of the chosen target ship. */
    defenderIndex: number;

    constructor(options: ShipAssaultDialogOptions) {
        super({ ...options, window: { ...options.window, title: options.entry.windowTitleKey } });
        this.attacker = options.attacker;
        this.entry = options.entry;
        this.targets = listTargetShips(options.attacker);
        this.defenderIndex = 0;
        const first = this.targets.at(0);
        this.session = first === undefined ? null : this.#startSession(first);
    }

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'ship-assault-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 binds `this` at click time
            rollAssault: ShipAssaultDialog.#onRoll,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 binds `this` at click time
            applyAssault: ShipAssaultDialog.#onApply,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 binds `this` at click time
            backAssault: ShipAssaultDialog.#onBack,
        },
        position: { width: 520 },
        window: { title: 'WH40K.Voidcraft.Assault.DialogTitle', resizable: true },
    };

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: { template: 'systems/wh40k-rpg/templates/prompt/ship-assault-dialog.hbs', classes: [], scrollable: [''] },
    };

    #startSession(defender: WH40KVoidcraft): ShipAssaultSession {
        return this.entry.start({ attacker: this.attacker, defender, localize: foundryLocalize });
    }

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<ShipAssaultDialogContext> {
        const context = await super._prepareContext(options);
        const session = this.session;
        const preview = session?.previewCard() ?? null;
        const previewHtml = preview === null ? '' : await foundry.applications.handlebars.renderTemplate(preview.template, preview.data);
        return {
            ...context,
            title: foundryLocalize(this.entry.labelKey),
            hint: foundryLocalize(this.entry.hintKey),
            hasTargets: this.targets.length > 0,
            targets: this.targets.map((ship, index) => ({ value: String(index), label: ship.name, selected: index === this.defenderIndex })),
            resolved: session?.resolved === true,
            groups: session === null ? [] : session.resolved ? session.choiceGroups() : session.inputGroups(),
            previewHtml,
        };
    }

    /** @override */
    override async _onRender(context: ShipAssaultDialogContext, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);
        const select = this.element.querySelector<HTMLSelectElement>('select[name="defender"]');
        select?.addEventListener('change', () => {
            const index = Number(select.value);
            const defender = this.targets.at(index);
            if (defender === undefined) return;
            this.defenderIndex = index;
            this.session = this.#startSession(defender);
            void this.render();
        });
    }

    static async #onRoll(this: ShipAssaultDialog, event: Event): Promise<void> {
        event.preventDefault();
        if (this.session === null) return;
        try {
            await this.session.roll(readAssaultForm(this.element));
        } catch (err) {
            if (!(err instanceof ShipAssaultInputError)) throw err;
            ui.notifications.warn(err.message);
            return;
        }
        await this.render();
    }

    static async #onApply(this: ShipAssaultDialog, event: Event): Promise<void> {
        event.preventDefault();
        if (this.session === null) return;
        const applied = await this.session.apply(readAssaultForm(this.element));
        if (applied === null) return;
        await postAssaultCard(this.attacker, applied.card, applied.rolls);
        await this.close();
    }

    static async #onBack(this: ShipAssaultDialog, event: Event): Promise<void> {
        event.preventDefault();
        this.session?.reset();
        await this.render();
    }
}

/**
 * Open the dialog for one assault action. Refuses (with a notification) for a
 * ship whose game system has no assault actions.
 */
export function openShipAssaultDialog(attacker: WH40KVoidcraft, entry: ShipAssaultEntry): void {
    if (!attacker.supportsShipAssault) {
        ui.notifications.warn(foundryLocalize('WH40K.Voidcraft.Assault.Unsupported'));
        return;
    }
    void new ShipAssaultDialog({ attacker, entry }).render({ force: true });
}
