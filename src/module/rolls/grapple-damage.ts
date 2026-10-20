/**
 * @file grapple-damage — a won Damage Opponent deals the controller's unarmed hit (#665).
 *
 * DH2 core p. 221: "If the active character wins, he inflicts unarmed damage
 * (1d5-3+SB) to his opponent's Body location and one level of Fatigue". RT, BC, DW
 * and OW print the same; DH1's injure deals "normal unarmed Damage … and one level
 * of Fatigue" and names no location.
 *
 * The hit is the controller's own unarmed strike (the weapon its content declares
 * `unarmed`), built by the same `Hit.createHit` an attack uses and posted on the
 * same damage card, so its formula, Strength Bonus, qualities, armour, Toughness,
 * auto-apply and Assign Damage are exactly an unarmed attack's. The grapple adds
 * only what its line prints: the location and the Fatigue, each stated on the hit
 * with its source.
 */

import { DHBasicActionManager } from '../actions/basic-action-manager.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import { t } from '../i18n/t.ts';
import { GRAPPLE_ACTION_LABEL_KEYS, type GrappleDamageRule } from '../rules/grapple.ts';
import { getHitLocationForRoll } from '../rules/hit-locations.ts';
import { WeaponActionData } from './action-data.ts';
import { type AttackDataLike, Hit } from './damage-data.ts';

/** An owned item, as far as finding the unarmed strike reads it. */
interface StrikeCandidate {
    readonly type: string;
    readonly system: object;
}

/** The actor's unarmed strike: its weapon the content declares `unarmed`, or null when it has none. */
export function findUnarmedStrike<T extends StrikeCandidate>(items: Iterable<T>): T | null {
    for (const item of items) {
        if (item.type === 'weapon' && (item.system as { unarmed?: boolean }).unarmed === true) return item;
    }
    return null;
}

/**
 * Where the grapple's hit lands: the location the line prints, else (DH1) where
 * the controller's test roll puts it, reversed the same way every attack roll is. The Body
 * when the roll maps to no location.
 */
export function grappleDamageLocation(rule: GrappleDamageRule, testRoll: number): string {
    return rule.location ?? getHitLocationForRoll(testRoll) ?? 'body';
}

/** What dealing the grapple's damage needs. */
export interface GrappleDamageRequest {
    controller: WH40KBaseActor;
    opponent: WH40KBaseActor;
    rule: GrappleDamageRule;
    /** The controller's d100 roll on the won test (DH1 places the hit with it). */
    testRoll: number;
}

/**
 * Roll the controller's unarmed hit on the opponent and post the damage card.
 * Returns false (and warns) when the controller has no unarmed strike.
 */
export async function dealGrappleDamage(request: GrappleDamageRequest): Promise<boolean> {
    const { controller, opponent, rule } = request;
    const strike = findUnarmedStrike<WH40KItem>(controller.items);
    if (strike === null) {
        ui.notifications.warn(t('WH40K.Grapple.Damage.NoUnarmedStrike', { actor: controller.name }));
        return false;
    }
    const action = new WeaponActionData();
    const rollData = action.rollData;
    rollData.weapons = [strike];
    rollData.sourceActor = controller;
    rollData.targetActor = opponent;
    rollData.initialize();
    rollData.update();
    rollData.nameOverride = t('WH40K.Grapple.Damage.Title', { weapon: strike.name });
    rollData.success = true;

    // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData↔AttackDataLike are duck-typed siblings (as in ActionData.calculateHits)
    const hit = await Hit.createHit(action as unknown as AttackDataLike, 0, grappleDamageLocation(rule, request.testRoll));
    stampGrappleHit(hit, rule, opponent.name);
    action.damageData.hits.push(hit);

    DHBasicActionManager.storeActionData(action);
    await DHBasicActionManager._postDamageCard(action);
    return true;
}

/** The part of a hit the grapple writes. */
interface GrappleStampedHit {
    targetName: string;
    totalFatigue: number;
    fatigueSource: string;
    addEffect: (name: string, effect: string) => void;
}

/**
 * Stamp what the grapple adds onto the unarmed hit: whom it lands on, the line's
 * Fatigue with Damage Opponent as its source, and the option stated as the hit's
 * effect (where it landed, and how much Fatigue).
 */
export function stampGrappleHit(hit: GrappleStampedHit, rule: GrappleDamageRule, opponentName: string): void {
    const optionLabel = t(GRAPPLE_ACTION_LABEL_KEYS['damage-opponent']);
    hit.targetName = opponentName;
    hit.totalFatigue += rule.fatigue;
    hit.fatigueSource = optionLabel;
    const effectKey = rule.location === null ? 'WH40K.Grapple.Damage.EffectRolledLocation' : 'WH40K.Grapple.Damage.EffectBody';
    hit.addEffect(optionLabel, t(effectKey, { fatigue: rule.fatigue }));
}
