/**
 * @file DaemonologyRitualDialog — the DH2 daemonology ritual surface
 * opened from the character sheet's Daemonology panel.
 *
 * Exorcism (#83): the exorcist (the sheet's actor) targets the possessed
 * individual's token, ticks the exorcism modifiers table rows that apply and confirms. The
 * whole extended test resolves in one go through
 * `actions/daemonology-actions.ts`; the exorcist's Fatigue (and Corruption, on
 * a collapse) are written back, a cast-out Daemon clears the host's possession
 * track, and a chat card prints every test's formula with sourced rows.
 *
 * Summoning (#80): the summoner targets the Daemon's token (its
 * Willpower pre-fills), notes a known True Name / patron service and any GM
 * factors, and confirms. The Hellish ritual test is rolled; if the Daemon
 * appears, the opposed Daemonic Mastery test decides whether it is bound and
 * for how many hours.
 */

import {
    buildExorcismCard,
    buildSummoningCard,
    daemonologyLoreTotal,
    exorcistUpdate,
    parseExorcismForm,
    parseSummoningForm,
    ritualCharacteristic,
    runExorcism,
    runSummoning,
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

/** Which ritual the dialog performs. */
export type RitualMode = 'exorcism' | 'summoning';

/**
 * What the dialog reads off the user's single target: the possessed individual
 * for an Exorcism, the Daemon for a Summoning.
 */
interface TargetInfo {
    readonly actor: Actor;
    readonly name: string;
    readonly toughness: number;
    readonly willpower: number;
    readonly corruption: number;
    readonly possessionState: string;
}

function readTarget(): TargetInfo | null {
    if (game.user.targets.size !== 1) return null;
    const actor = Array.from(game.user.targets).at(0)?.actor;
    if (actor == null) return null;
    const system = actor.system as { corruption?: number; possession?: { state?: string } };
    return {
        actor,
        name: actor.name,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types characteristics[key] as possibly undefined, tsconfig.test.json does not
        toughness: actor.characteristics['toughness']?.total ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types characteristics[key] as possibly undefined, tsconfig.test.json does not
        willpower: actor.characteristics['willpower']?.total ?? 0,
        corruption: typeof system.corruption === 'number' ? system.corruption : 0,
        possessionState: system.possession?.state ?? 'none',
    };
}

const TITLE_KEYS: Record<RitualMode, string> = {
    exorcism: 'WH40K.Daemonology.Exorcism.DialogTitle',
    summoning: 'WH40K.Daemonology.Summoning.DialogTitle',
};

const PERFORM_KEYS: Record<RitualMode, string> = {
    exorcism: 'WH40K.Daemonology.Exorcism.Perform',
    summoning: 'WH40K.Daemonology.Summoning.Perform',
};

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
interface RitualDialogContext extends Record<string, unknown> {
    isExorcism: boolean;
    performLabelKey: string;
    actorName: string;
    loreTotal: number;
    willpowerTotal: number;
    fatigueValue: number;
    fatigueMax: number;
    targetName: string | null;
    modifiers: { id: string; labelKey: string; signed: string; checked: boolean }[];
    daemonWillpowerBonus: number;
    possessedCorruptionBonus: number;
    daemonWillpower: number;
}

function signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
class DaemonologyRitualDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare performer: RitualPerformer;
    declare mode: RitualMode;
    declare target: TargetInfo | null;

    constructor(performer: RitualPerformer, mode: RitualMode) {
        super({ window: { title: TITLE_KEYS[mode] } });
        this.performer = performer;
        this.mode = mode;
        this.target = readTarget();
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
        window: { resizable: false },
    };

    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: { template: 'systems/wh40k-rpg/templates/prompt/daemonology-ritual-dialog.hbs', classes: [], scrollable: [] },
    };

    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<RitualDialogContext> {
        const context = await super._prepareContext(options);
        const system = this.performer.system;
        const target = this.target;
        return {
            ...context,
            isExorcism: this.mode === 'exorcism',
            performLabelKey: PERFORM_KEYS[this.mode],
            actorName: this.performer.name,
            loreTotal: daemonologyLoreTotal(system),
            willpowerTotal: ritualCharacteristic(system, 'willpower').total,
            fatigueValue: system.fatigue.value,
            fatigueMax: system.fatigue.max,
            targetName: target?.name ?? null,
            modifiers: EXORCISM_MODIFIER_ORDER.map((id) => ({
                id,
                labelKey: EXORCISM_MODIFIERS[id].labelKey,
                signed: signed(EXORCISM_MODIFIERS[id].modifier),
                // The exorcism modifiers table's first row applies when the exorcist targets himself.
                checked: id === 'SELF_EXORCISM' && target?.actor.id === this.performer.id,
            })),
            daemonWillpowerBonus: 0,
            possessedCorruptionBonus: target === null ? 0 : corruptionBonus(target.corruption),
            daemonWillpower: target?.willpower ?? 0,
        };
    }

    static async #onPerform(this: DaemonologyRitualDialog, event: Event): Promise<void> {
        event.preventDefault();
        const form = this.element instanceof HTMLFormElement ? this.element : null;
        if (form === null) return;
        if (this.mode === 'summoning') await this.#performSummoning(new FormData(form));
        else await this.#performExorcism(new FormData(form));
        await this.close();
    }

    async #performSummoning(data: FormData): Promise<void> {
        const performer = this.performer;
        const dice = new FoundryRitualDice();
        const outcome = await runSummoning(performer.system, parseSummoningForm(data), dice);
        const card = buildSummoningCard({
            summonerName: performer.name,
            daemonName: this.target?.name ?? null,
            outcome,
            localize: (key) => game.i18n.localize(key),
            gameSystem: performer.system.gameSystem,
        });
        const speaker = ChatMessage.getSpeaker({ actor: performer });
        await emitChatFromTemplate(CHAT_TEMPLATE, { ...card }, { speaker, rolls: dice.rolls, applyWhispers: true });
    }

    async #performExorcism(data: FormData): Promise<void> {
        const inputs = parseExorcismForm(data);
        const performer = this.performer;
        const host = this.target;
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
    }

    static async #onCancel(this: DaemonologyRitualDialog, event: Event): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/** Open a ritual dialog for `performer` (DH2 only — the caller gates the line). */
export function openDaemonologyRitualDialog(performer: RitualPerformer, mode: RitualMode): void {
    void new DaemonologyRitualDialog(performer, mode).render({ force: true });
}
