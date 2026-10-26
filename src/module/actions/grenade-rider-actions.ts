/**
 * @file Resolving a grenade's rider on the canvas (#623): roll each caught creature's
 * test, apply the rider's condition to those who fail, and post the results card.
 *
 * Two cards offer Resolve Rider. A grenade that deals no damage is thrown from the
 * grenade dialog, which places the rider's area on the canvas and records it on its card
 * (`rolls/grenade-rider-flag.ts`); Resolve reads the tokens inside that area as it stands
 * now. A grenade that deals damage takes the weapon roll, and its damage card resolves
 * the rider against the creatures its attack struck (#622). Both land here, from the
 * chat action manager, which hands in its dice and chat poster ({@link RiderResolveIo})
 * so this module stays outside the roll pipeline's import cycle. The scoring is the pure
 * `rules/grenade-rider-resolution.ts`; the words are
 * `applications/prompts/grenade-rider-results-view.ts`.
 */

import { GRENADE_LABELS } from '../applications/prompts/grenade-labels.ts';
import { buildRiderResultsCard, type RiderResultsCard } from '../applications/prompts/grenade-rider-results-view.ts';
import { buildGrenadeChoice, type GrenadeItemView } from '../applications/prompts/grenade-throw-view.ts';
import type { WH40KBaseActor as WH40KBaseActorDocument } from '../documents/base-actor.ts';
import { t } from '../i18n/t.ts';
import { bearerLine, conditionEffectData, type EffectOptions, resolveCondition } from '../rules/condition-registry.ts';
import {
    type RiderCreature,
    type RiderTargetResult,
    resolveRiderCreature,
    riderAffectsCreature,
    riderRollsDuration,
} from '../rules/grenade-rider-resolution.ts';
import { hasGrenadeRider, riderDealsCharacteristicDamage, riderHasTest } from '../rules/grenade-rider.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';

/** A token the rider resolves against. */
export interface RiderToken {
    id: string;
    name: string;
    actor: WH40KBaseActorDocument | null;
    /** The damage this creature suffered from the grenade's own hit, after soak (#698); 0 off a damage card. */
    damageSuffered: number;
}

/** The grenade whose rider resolves, and who threw it. */
export interface RiderSource {
    /** The grenade; its UUID (null before it is persisted) is the applied condition's origin. */
    item: GrenadeItemView & { uuid: string | null };
    thrower: WH40KBaseActorDocument | null;
}

/** The dice and chat poster the caller supplies. */
export interface RiderResolveIo {
    /** Roll a creature's d100. */
    rollD100: () => Promise<Roll>;
    /** Post the results card, with its rolls attached. */
    post: (card: RiderResultsCard & { _gameSystemId: string | undefined }, rolls: Roll[]) => Promise<void>;
}

/** A creature's total in the rider test's characteristic, and whether it is a psyker. */
function riderCreature(token: RiderToken, actor: WH40KBaseActorDocument, characteristic: string): RiderCreature | null {
    const uuid = actor.uuid;
    // An actor's UUID is null only before it is persisted; such a token cannot take an effect.
    if (uuid === null) return null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types characteristics[key] as possibly undefined, tsconfig.test.json does not
    const total = characteristic === '' ? 0 : actor.characteristics[characteristic]?.total ?? 0;
    return {
        tokenId: token.id,
        actorUuid: uuid,
        name: token.name,
        isPsyker: actor.system.psy !== undefined && actor.system.psy.rating > 0,
        characteristic: total,
        damageSuffered: token.damageSuffered,
    };
}

/**
 * Apply the rider's condition to a creature that suffers it, for its rounds (from the
 * current combat round) or indefinitely. The payload is the condition registry's pure
 * builder (`conditionEffectData`, #495) — the one every condition writer uses — so the
 * effect is the condition document resolved for the bearer's line and shows on the
 * token as a status (#595). Only a user who owns the creature can write to it; the card
 * says the GM applies it otherwise. Returns whether it was applied.
 */
async function applyRiderCondition(actor: WH40KBaseActorDocument, result: RiderTargetResult, origin: string | null): Promise<boolean> {
    if (!actor.isOwner) return false;
    const combat = game.combat;
    const options: EffectOptions = origin === null ? {} : { origin };
    if (result.rounds !== null) options.duration = { rounds: result.rounds, startRound: combat?.round ?? 0, startTurn: combat?.turn ?? 0 };
    const data = conditionEffectData(result.condition, bearerLine(actor), options);
    if (data === null) return false;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.createEmbeddedDocuments takes Foundry's untyped embedded-document create schema
    const created = await actor.createEmbeddedDocuments('ActiveEffect', [data] as unknown as Parameters<
        typeof actor.createEmbeddedDocuments<'ActiveEffect'>
    >[1]);
    return created.length > 0;
}

/**
 * Write what the rider does to a creature that suffers it (#698): its condition, and the
 * characteristic damage it deals. Only an owner can write either; returns whether every
 * part was applied.
 */
async function applyRiderEffects(actor: WH40KBaseActorDocument, result: RiderTargetResult, origin: string | null): Promise<boolean> {
    if (!actor.isOwner) return false;
    const conditionApplied = result.condition === '' ? true : await applyRiderCondition(actor, result, origin);
    const damage = result.characteristicDamage;
    if (damage !== null) await actor.applyCharacteristicDamage(damage.characteristic, damage.amount);
    return conditionApplied;
}

/**
 * Resolve the grenade's rider against `tokens` and post the results card. Every creature
 * the rider touches rolls its test (when the rider has one); a failure — or being caught
 * by a rider with no test — applies the rider's condition for its duration and deals its
 * characteristic damage.
 */
export async function resolveRiderAgainst(source: RiderSource, tokens: readonly RiderToken[], io: RiderResolveIo): Promise<void> {
    const { item } = source;
    const { system } = item;
    const choice = buildGrenadeChoice(item, item.id, GRENADE_LABELS);
    if (!hasGrenadeRider(system) || choice === null) return;
    const { rider } = system;
    const rolls: Roll[] = [];
    const results: RiderTargetResult[] = [];
    const applied = new Map<string, boolean>();
    for (const token of tokens) {
        const actor = token.actor;
        const creature = actor === null ? null : riderCreature(token, actor, rider.test.characteristic);
        if (actor === null || creature === null) continue;
        // eslint-disable-next-line no-await-in-loop -- sequential by design: each creature's d100 is its own roll on the card
        const d100 = riderHasTest(rider) && riderAffectsCreature(rider, creature) ? await io.rollD100() : null;
        if (d100 !== null) rolls.push(d100);
        const roll = d100?.total ?? null;
        const scored = resolveRiderCreature({ rider, creature, roll, rolledRounds: null, rolledDamage: null });
        let rolledRounds: number | null = null;
        let rolledDamage: number | null = null;
        if (scored.suffers && rider.condition !== '' && riderRollsDuration(rider)) {
            // eslint-disable-next-line no-await-in-loop -- sequential by design: each creature's duration is its own roll on the card
            const rounds = await new Roll(rider.duration.formula).evaluate();
            rolls.push(rounds);
            rolledRounds = rounds.total;
        }
        if (scored.suffers && riderDealsCharacteristicDamage(rider)) {
            // eslint-disable-next-line no-await-in-loop -- sequential by design: each creature's damage is its own roll on the card
            const damage = await new Roll(rider.characteristicDamage.formula).evaluate();
            rolls.push(damage);
            rolledDamage = damage.total;
        }
        const result = resolveRiderCreature({ rider, creature, roll, rolledRounds, rolledDamage });
        if (result.suffers && (rider.condition !== '' || result.characteristicDamage !== null)) {
            // eslint-disable-next-line no-await-in-loop -- sequential by design: each creature's effect is written in turn
            applied.set(result.tokenId, await applyRiderEffects(actor, result, item.uuid));
        }
        results.push(result);
    }
    if (results.length === 0) {
        ui.notifications.info(t('WH40K.GrenadeRider.NoTargets'));
        return;
    }
    const line = bearerLine(source.thrower);
    const card = buildRiderResultsCard(choice, results, applied, (id) => resolveCondition(id, line)?.name ?? id, GRENADE_LABELS, rider.test.characteristic);
    await io.post({ ...card, _gameSystemId: firstSystemId(source.thrower) }, rolls);
}

/** The grenade a throw card names, from its thrower: null when the item is gone. */
export function riderSourceOf(thrower: WH40KBaseActorDocument, itemId: string): RiderSource | null {
    const item = thrower.items.get(itemId);
    if (item === undefined) return null;
    return { item: { id: item.id, name: item.name, uuid: item.uuid, system: item.system }, thrower };
}
