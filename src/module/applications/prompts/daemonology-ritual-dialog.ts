/**
 * @file DaemonologyRitualDialog — the DH2 Enemies Beyond ritual surface
 * opened from the character sheet's Daemonology panel.
 *
 * Exorcism (#83, p. 71): the exorcist (the sheet's actor) targets the possessed
 * individual's token, ticks the Table 2–21 rows that apply and confirms. The
 * whole extended test resolves in one go through
 * `actions/daemonology-actions.ts`; the exorcist's Fatigue (and Corruption, on
 * a collapse) are written back, a cast-out Daemon clears the host's possession
 * track, and a chat card prints every test's formula with sourced rows.
 */

import {
    buildExorcismCard,
    daemonologyLoreTotal,
    exorcistUpdate,
    parseExorcismForm,
    ritualCharacteristic,
    runExorcism,
    type RitualActorSystem,
    type RitualDice,
} from '../../actions/daemonology-actions.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { emitChatFromTemplate } from '../../rolls/roll-helpers.ts';
import { corruptionBonus, EXORCISM_MODIFIER_ORDER, EXORCISM_MODIFIERS } from '../../rules/exorcism.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/daemonology-ritual-chat.hbs';

/** The performer: a character whose system carries the ritual fields. */
export type RitualPerformer = WH40KBaseActor & { readonly system: RitualActorSystem & { readonly gameSystem: string } };

/** Foundry dice that keep every evaluated roll for the chat message. */
class FoundryRitualDice implements RitualDice {
    readonly rolls: Roll[] = [];

    async roll(formula: '1d100' | '1d10' | '1d5'): Promise<number> {
        const roll = await new Roll(formula).evaluate();
        this.rolls.push(roll);
        return Math.trunc(roll.total);
    }
}

/** What the dialog reads off the possessed individual (the user's single target). */
interface HostInfo {
    readonly actor: Actor;
    readonly name: string;
    readonly toughness: number;
    readonly corruption: number;
    readonly possessionState: string;
}

function readTargetedHost(): HostInfo | null {
    if (game.user.targets.size !== 1) return null;
    const actor = Array.from(game.user.targets).at(0)?.actor;
    if (actor == null) return null;
    const system = actor.system as { corruption?: number; possession?: { state?: string } };
    return {
        actor,
        name: actor.name,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types characteristics[key] as possibly undefined, tsconfig.test.json does not
        toughness: actor.characteristics['toughness']?.total ?? 0,
        corruption: typeof system.corruption === 'number' ? system.corruption : 0,
        possessionState: system.possession?.state ?? 'none',
    };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface RitualDialogContext extends Record<string, unknown> {
    actorName: string;
    loreTotal: number;
    willpowerTotal: number;
    fatigueValue: number;
    fatigueMax: number;
    hostName: string | null;
    modifiers: { id: string; labelKey: string; signed: string; checked: boolean }[];
    daemonWillpowerBonus: number;
    possessedCorruptionBonus: number;
}

function signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
class DaemonologyRitualDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare performer: RitualPerformer;
    declare host: HostInfo | null;

    constructor(performer: RitualPerformer, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.performer = performer;
        this.host = readTargetedHost();
    }

    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'daemonology-ritual-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            perform: DaemonologyRitualDialog.#onPerform,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            cancel: DaemonologyRitualDialog.#onCancel,
        },
        position: { width: 520 },
        window: { title: 'WH40K.Daemonology.Exorcism.DialogTitle', resizable: false },
    };

    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: { template: 'systems/wh40k-rpg/templates/prompt/daemonology-ritual-dialog.hbs', classes: [], scrollable: [] },
    };

    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<RitualDialogContext> {
        const context = await super._prepareContext(options);
        const system = this.performer.system;
        const host = this.host;
        return {
            ...context,
            actorName: this.performer.name,
            loreTotal: daemonologyLoreTotal(system),
            willpowerTotal: ritualCharacteristic(system, 'willpower').total,
            fatigueValue: system.fatigue.value,
            fatigueMax: system.fatigue.max,
            hostName: host?.name ?? null,
            modifiers: EXORCISM_MODIFIER_ORDER.map((id) => ({
                id,
                labelKey: EXORCISM_MODIFIERS[id].labelKey,
                signed: signed(EXORCISM_MODIFIERS[id].modifier),
                // Table 2–21's first row applies when the exorcist targets himself.
                checked: id === 'SELF_EXORCISM' && host?.actor.id === this.performer.id,
            })),
            daemonWillpowerBonus: 0,
            possessedCorruptionBonus: host === null ? 0 : corruptionBonus(host.corruption),
        };
    }

    static async #onPerform(this: DaemonologyRitualDialog, event: Event): Promise<void> {
        event.preventDefault();
        const form = this.element instanceof HTMLFormElement ? this.element : null;
        if (form === null) return;
        const inputs = parseExorcismForm(new FormData(form));
        const performer = this.performer;
        const host = this.host;
        const dice = new FoundryRitualDice();
        const outcome = await runExorcism(performer.system, host === null ? null : { toughness: host.toughness }, inputs, dice);

        const update = exorcistUpdate(performer.system, outcome);
        if (Object.keys(update).length > 0) await performer.update(update);
        const hostCleared = outcome.state.status === 'banished' && host !== null && host.possessionState !== 'none' && host.actor.isOwner;
        if (hostCleared) await host.actor.update({ 'system.possession.state': 'none' });

        const card = buildExorcismCard({
            exorcistName: performer.name,
            hostName: host?.name ?? null,
            outcome,
            localize: (key) => game.i18n.localize(key),
            gameSystem: performer.system.gameSystem,
            hostCleared,
        });
        const speaker = ChatMessage.getSpeaker({ actor: performer });
        await emitChatFromTemplate(CHAT_TEMPLATE, { ...card }, { speaker, rolls: dice.rolls, applyWhispers: true });
        await this.close();
    }

    static async #onCancel(this: DaemonologyRitualDialog, event: Event): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Open the exorcism dialog for `performer` (DH2 only — the caller gates the line). */
export function openExorcismDialog(performer: RitualPerformer): void {
    void new DaemonologyRitualDialog(performer).render({ force: true });
}
