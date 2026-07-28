import { t } from '../i18n/t.ts';
import { emitChatFromTemplate, isD100Success, roll1d100 } from '../rolls/roll-helpers.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { conditionEffectData, type EffectChange, type EffectDataInput, type EffectOptions, MODE_ADD } from './condition-registry.ts';
import { type CriticalDamageRecord, criticalRiderConditionIds } from './critical-damage.ts';
import type { CanonicalBodyPart } from './damage-type.ts';

type ActiveEffectChatContext = {
    template: string;
    actor: WH40KBaseActorDocument;
    roll?: Roll;
    target?: number;
    success?: boolean;
    damage?: number;
};

/* -------------------------------------------- */
/*  Combat Effects                              */
/* -------------------------------------------- */

export async function handleBleeding(actor: WH40KBaseActorDocument): Promise<void> {
    const context: ActiveEffectChatContext = {
        template: 'systems/wh40k-rpg/templates/chat/bleeding-chat.hbs',
        actor: actor,
    };
    await sendActiveEffectMessage(context);
}

/**
 * Per-turn Blood Loss tick (core.md §"Blood Loss"). The character takes
 * 1 wound at the start of their turn while Heavily Damaged. The Toughness
 * test that mitigates the +1 fatigue tier is left to the GM; the wound
 * tick is automated here. Reuses the bleeding chat card.
 */
export async function handleBloodLoss(actor: WH40KBaseActorDocument): Promise<void> {
    const context: ActiveEffectChatContext = {
        template: 'systems/wh40k-rpg/templates/chat/bleeding-chat.hbs',
        actor: actor,
    };
    await sendActiveEffectMessage(context);
}

export async function handleOnFire(actor: WH40KBaseActorDocument): Promise<void> {
    const willpower = actor.characteristics['willpower'];
    const context: ActiveEffectChatContext = {
        template: 'systems/wh40k-rpg/templates/chat/burning-chat.hbs',
        actor: actor,
        roll: await roll1d100(),
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics index may be undefined at runtime
        target: willpower?.total ?? 0,
    };
    const rollTotal = context.roll?.total ?? 0;
    const target = context.target ?? 0;
    context.success = isD100Success(rollTotal, target);

    const damageRoll = new Roll('1d10', {});
    await damageRoll.evaluate();
    context.damage = damageRoll.total ?? 0;
    await sendActiveEffectMessage(context);
}

export async function sendActiveEffectMessage(activeContext: ActiveEffectChatContext): Promise<void> {
    await emitChatFromTemplate(
        activeContext.template,
        // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate accepts untyped context; cast to match Handlebars signature
        activeContext,
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.settings.get('core', 'rollMode') is typed as the open core-settings value
        { rollMode: game.settings.get('core', 'rollMode'), applyWhispers: true },
    );
}

/* -------------------------------------------- */
/*  Active Effect Helpers                       */
/* -------------------------------------------- */

/**
 * Create a new Active Effect on an actor.
 * @param {Actor} actor                 The target actor
 * @param {object} effectData           Effect creation data
 * @param {string} effectData.name      Effect name
 * @param {string} effectData.icon      Effect icon path
 * @param {object[]} effectData.changes Array of change objects
 * @param {object} [options={}]         Additional options
 * @returns {Promise<ActiveEffect>}     The created effect
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: options passed directly to createEmbeddedDocuments which accepts arbitrary keys
export async function createEffect(actor: WH40KBaseActorDocument, effectData: EffectDataInput, options: Record<string, unknown> = {}): Promise<unknown> {
    const data = {
        name: effectData.name,
        icon: effectData.icon ?? 'icons/svg/aura.svg',
        changes: effectData.changes ?? [],
        disabled: effectData.disabled ?? false,
        origin: effectData.origin,
        duration: effectData.duration ?? {},
        flags: effectData.flags ?? {},
    };

    // eslint-disable-next-line no-restricted-syntax -- boundary: data array must match Foundry's untyped embedded-document creation schema
    return actor.createEmbeddedDocuments('ActiveEffect', [data] as unknown as Parameters<typeof actor.createEmbeddedDocuments<'ActiveEffect'>>[1], options);
}

/**
 * Create a characteristic modifier effect.
 * @param {Actor} actor                 The target actor
 * @param {string} characteristic       Characteristic key (e.g., "strength")
 * @param {number} value                Modifier value
 * @param {object} [options={}]         Additional options
 * @returns {Promise<ActiveEffect>}
 */
export async function createCharacteristicEffect(
    actor: WH40KBaseActorDocument,
    characteristic: string,
    value: number,
    options: EffectOptions = {},
    // eslint-disable-next-line no-restricted-syntax -- boundary: return propagates Foundry createEmbeddedDocuments which is opaque
): Promise<unknown> {
    const charLabel = game.i18n.localize(`WH40K.Characteristic.${characteristic.capitalize()}`);
    const name = options.name ?? `${charLabel} ${value > 0 ? '+' : ''}${value}`;

    return createEffect(actor, {
        name,
        icon: options.icon ?? 'icons/svg/upgrade.svg',
        changes: [
            {
                key: `system.characteristics.${characteristic}.modifier`,
                mode: MODE_ADD,
                value: value,
            },
        ],
        duration: options.duration,
        origin: options.origin,
        flags: options.flags,
    });
}

/**
 * Create a skill modifier effect.
 * @param {Actor} actor                 The target actor
 * @param {string} skill                Skill key (e.g., "dodge")
 * @param {number} value                Modifier value
 * @param {object} [options={}]         Additional options
 * @returns {Promise<ActiveEffect>}
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: return propagates Foundry createEmbeddedDocuments which is opaque
export async function createSkillEffect(actor: WH40KBaseActorDocument, skill: string, value: number, options: EffectOptions = {}): Promise<unknown> {
    const skillLabel = game.i18n.localize(`WH40K.Skill.${skill}`);
    const name = options.name ?? `${skillLabel} ${value > 0 ? '+' : ''}${value}`;

    return createEffect(actor, {
        name,
        icon: options.icon ?? 'icons/svg/upgrade.svg',
        changes: [
            {
                key: `system.skills.${skill}.bonus`,
                mode: MODE_ADD,
                value: value,
            },
        ],
        duration: options.duration,
        origin: options.origin,
        flags: options.flags,
    });
}

/**
 * Create a combat modifier effect (attack, damage, defense, initiative).
 * @param {Actor} actor                 The target actor
 * @param {string} type                 Combat type ("attack", "damage", "defense", "initiative")
 * @param {number} value                Modifier value
 * @param {object} [options={}]         Additional options
 * @returns {Promise<ActiveEffect>}
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: return propagates Foundry createEmbeddedDocuments which is opaque
export async function createCombatEffect(actor: WH40KBaseActorDocument, type: string, value: number, options: EffectOptions = {}): Promise<unknown> {
    const typeLabel = game.i18n.localize(`WH40K.Combat.${type.capitalize()}`);
    const name = options.name ?? `${typeLabel} ${value > 0 ? '+' : ''}${value}`;

    return createEffect(actor, {
        name,
        icon: options.icon ?? 'icons/svg/combat.svg',
        changes: [
            {
                key: `system.combat.${type}`,
                mode: MODE_ADD,
                value: value,
            },
        ],
        duration: options.duration,
        origin: options.origin,
        flags: options.flags,
    });
}

/**
 * THE writer for condition effects (#495). Every path that applies a condition —
 * the token HUD, the effect-creation dialog, a critical-damage rider, fatigue
 * automation, death — goes through here, so a condition is exactly one document
 * with one id, one artwork and one set of `changes`, visible on both the sheet
 * and the token.
 * @param {WH40KBaseActorDocument} actor  Actor to apply the condition to.
 * @param {string} condition  Registry key / Foundry status id.
 * @param {EffectOptions} [options]  Per-application overrides.
 * @returns {Promise<unknown>}  The created effect, or null for an unknown id.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: return propagates Foundry createEmbeddedDocuments which is opaque
export async function createConditionEffect(actor: WH40KBaseActorDocument, condition: string, options: EffectOptions = {}): Promise<unknown> {
    const data = conditionEffectData(condition, options);
    if (data === null) {
        ui.notifications.warn(t('WH40K.Warning.UnknownCondition', { condition }));
        return null;
    }
    return createEffect(actor, data);
}

/** A carried munition (grenade / ammunition) that cooked off from a crit. */
interface DetonatedMunition {
    /** Display name of the detonating item. */
    name: string;
    /**
     * Rolled secondary-damage total (the grenade's own formula + bonus), or null
     * when the item has no rollable damage of its own — loose ammunition, whose
     * blast is the fixed value in the crit prose the GM resolves by hand.
     */
    damage: number | null;
    /** The munition's own damage type (`explosive`, `impact`, …), when known. */
    damageType: string | null;
    /** True when the detonated munition was expended (its carried quantity zeroed). */
    consumed: boolean;
}

/**
 * Structured account of the non-condition side effects a Critical Damage result
 * produced — what the appliers changed on the target and what the GM must still
 * adjudicate. Returned by {@link applyCriticalDamageConditions} so the damage
 * chat card can surface a readout (blast radii / nearby-target selection need
 * token positions the damage path does not have).
 */
export interface CriticalSideEffectReport {
    /** A `negates` armour gate fired against worn armour — the row had no effect. */
    armourNegated: boolean;
    /** A `worsensIfUnarmoured` gate on an armoured location — harsher branch withheld for GM adjudication. */
    unarmouredWorsens: boolean;
    /** Name of the head armour torn off, or null. */
    helmetTornOff: string | null;
    /** Name of the weapon dropped (unequipped), or null. */
    itemDropped: string | null;
    /** Name of the weapon destroyed (broken + unequipped), or null. */
    weaponBroken: string | null;
    /** Carried munitions that cooked off, with rolled secondary damage. */
    munitions: DetonatedMunition[];
    /** Condition-registry ids applied this call (completeness / tests). */
    conditionsApplied: string[];
    /** True when the report carries anything worth surfacing on the chat card. */
    hasSideEffects: boolean;
}

/**
 * Apply the conditions / ActiveEffects and side effects a Critical Damage result
 * inflicts (#108). Walks the classified riders (Stunned, Burning, Blood Loss,
 * Prone, Blinded, Deafened, Fatigue, lost limb) and creates the matching
 * condition Active Effect on the target, then resolves the row's armour decision
 * tree and physical side effects (helmet torn off, held weapon dropped or
 * destroyed, carried munitions cooking off). Persistent tick conditions (Burning,
 * Blood Loss) are processed at the turn boundary by the combat turn-hook (#413).
 *
 * Armour decision trees (content-agnostic, resolved against the target's armour
 * at the crit body-part — a helmet for Head hits, location armour otherwise):
 *   - `negates` + armoured → the whole row is skipped ("wearing a helmet, he
 *     suffers no ill effects").
 *   - `worsensIfUnarmoured` + armoured → the harsher conditions are withheld and
 *     the reduction surfaced for the GM (the prose can't be split mechanically).
 *
 * Each crit-sourced condition is stamped with a `criticalConditionId` flag so a
 * later Critical does not stack a second per-turn-tick condition. The `fatal`
 * rider is intentionally not applied — instant death is surfaced on the chat card
 * for GM adjudication. Returns a {@link CriticalSideEffectReport} for the card.
 */
export async function applyCriticalDamageConditions(actor: WH40KBaseActorDocument, record: CriticalDamageRecord): Promise<CriticalSideEffectReport> {
    const report: CriticalSideEffectReport = {
        armourNegated: false,
        unarmouredWorsens: false,
        helmetTornOff: null,
        itemDropped: null,
        weaponBroken: null,
        munitions: [],
        conditionsApplied: [],
        hasSideEffects: false,
    };

    const gate = record.riders.armourGate;
    const locationArmoured = findEquippedArmourAt(actor, record.bodyPart) !== undefined;

    // `negates` gate: worn armour at the struck location cancels the entire row.
    if (gate === 'negates' && locationArmoured) {
        report.armourNegated = true;
        return finalizeSideEffectReport(report);
    }

    // `worsensIfUnarmoured` + armoured: the harsher (unarmoured) branch is what the
    // classifier caught, but the prose can't be split into base vs. worse
    // conditions — so withhold auto-applying them and surface the reduction.
    const suppressConditions = gate === 'worsensIfUnarmoured' && locationArmoured;
    if (suppressConditions) report.unarmouredWorsens = true;

    if (!suppressConditions) {
        for (const id of criticalRiderConditionIds(record.riders)) {
            const already = actor.effects.find(
                // eslint-disable-next-line no-restricted-syntax -- boundary: actor.effects elements are loosely typed; read getFlag off a minimal shape
                (e) => (e as unknown as { getFlag: (scope: string, key: string) => unknown }).getFlag('wh40k-rpg', 'criticalConditionId') === id,
            );
            if (already !== undefined) continue;
            // eslint-disable-next-line no-await-in-loop -- sequential: each create mutates the actor's effects collection the next dedupe reads
            await createConditionEffect(actor, id, { flags: { 'wh40k-rpg': { criticalConditionId: id } } });
            report.conditionsApplied.push(id);
        }
    }

    // Helmet knocked/torn off ("If he is wearing a helmet, it is torn off"): unequip
    // the worn head armour so it stops contributing head AP. Reversible.
    if (record.riders.helmetTornOff) {
        const helmet = findEquippedArmourAt(actor, 'Head');
        if (helmet !== undefined) {
            await helmet.update({ 'system.state.equipped': false });
            report.helmetTornOff = helmet.name ?? '';
            game.wh40k.log('critical-damage: helmet torn off', { actor: actor.name, helmet: helmet.name });
        }
    }

    // Held weapon dropped or destroyed (a hand/arm crit). Destruction supersedes a
    // mere drop on the same weapon: mark it broken (reversible via a Tech-Use
    // Repair, #444) and unequip; a plain drop only unequips.
    if (record.riders.weaponDestroyed || record.riders.dropsHeldItem) {
        const weapon = findEquippedWeapon(actor);
        if (weapon !== undefined) {
            if (record.riders.weaponDestroyed) {
                await weapon.update({ 'system.state.equipped': false, 'system.state.broken': true });
                report.weaponBroken = weapon.name ?? '';
                game.wh40k.log('critical-damage: held weapon destroyed', { actor: actor.name, weapon: weapon.name });
            } else {
                await weapon.update({ 'system.state.equipped': false });
                report.itemDropped = weapon.name ?? '';
                game.wh40k.log('critical-damage: held item dropped', { actor: actor.name, weapon: weapon.name });
            }
        }
    }

    // Carried munitions cook off ("any grenades or missiles … detonate"): roll each
    // detonating grenade's own damage; the GM distributes the blast (needs token
    // positions the damage path lacks).
    if (record.riders.detonatesMunitions) {
        report.munitions = await detonateCarriedMunitions(actor);
    }

    return finalizeSideEffectReport(report);
}

/** Set `hasSideEffects` from the populated report fields. */
function finalizeSideEffectReport(report: CriticalSideEffectReport): CriticalSideEffectReport {
    report.hasSideEffects =
        report.armourNegated ||
        report.unarmouredWorsens ||
        report.helmetTornOff !== null ||
        report.itemDropped !== null ||
        report.weaponBroken !== null ||
        report.munitions.length > 0;
    return report;
}

/** The minimal owned-item surface the critical-damage side-effect appliers read/update. */
interface OwnedItemLike {
    type: string;
    name: string | null;
    system: {
        coverage?: Set<string> | readonly string[] | undefined;
        /** Weapon usage class (`'thrown'` for grenades). */
        class?: string | undefined;
        /** Weapon damage block — the detonation path rolls a grenade's own formula. */
        damage?: { formula?: string | undefined; bonus?: number | undefined; type?: string | undefined } | undefined;
        state?: { equipped?: boolean | undefined; broken?: boolean | undefined } | undefined;
        /** Carried count — the detonation path expends the munition (RAW: it is destroyed). */
        quantity?: number | undefined;
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document#update (open-ended payload, opaque Promise return)
    update: (data: Record<string, unknown>) => Promise<unknown>;
}

/** Read the actor's owned items as the minimal side-effect surface. */
function ownedItems(actor: WH40KBaseActorDocument): Iterable<OwnedItemLike> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.items is a Foundry collection of loosely-typed owned items
    return (actor as unknown as { items: Iterable<OwnedItemLike> }).items;
}

/** Canonical Critical Effects body-part → armour `coverage` keys it maps onto. */
const BODY_PART_COVERAGE_KEYS: Record<CanonicalBodyPart, readonly string[]> = {
    Head: ['head'],
    Body: ['body'],
    Arm: ['leftArm', 'rightArm'],
    Leg: ['leftLeg', 'rightLeg'],
};

/**
 * The target's equipped armour covering a given Critical Effects body-part (a
 * "helmet" for Head), or undefined when the location is unarmoured. When several
 * worn pieces cover it, the one with the SMALLEST coverage wins (a dedicated
 * helmet over a full suit that also covers the head). `all`-coverage armour
 * counts for every location.
 */
function findEquippedArmourAt(actor: WH40KBaseActorDocument, bodyPart: CanonicalBodyPart): OwnedItemLike | undefined {
    const keys = BODY_PART_COVERAGE_KEYS[bodyPart];
    let best: OwnedItemLike | undefined;
    let bestCoverage = Infinity;
    for (const item of ownedItems(actor)) {
        if (item.type !== 'armour' || item.system.state?.equipped !== true) continue;
        const coverage = item.system.coverage;
        const asSet = coverage instanceof Set ? coverage : new Set(Array.isArray(coverage) ? coverage : []);
        const covers = asSet.has('all') || keys.some((k) => asSet.has(k));
        if (covers && asSet.size < bestCoverage) {
            best = item;
            bestCoverage = asSet.size;
        }
    }
    return best;
}

/**
 * The target's held (equipped) weapon, if any — what the "drop held item" /
 * "weapon destroyed" critical effects act on. Returns the first equipped weapon;
 * undefined when the target is wielding nothing.
 */
function findEquippedWeapon(actor: WH40KBaseActorDocument): OwnedItemLike | undefined {
    for (const item of ownedItems(actor)) {
        if (item.type === 'weapon' && item.system.state?.equipped === true) return item;
    }
    return undefined;
}

/**
 * Find the target's carried munitions (thrown-class grenades and ammunition
 * items) and, for each grenade with a rollable damage formula, roll its own
 * secondary damage. Ammunition (and utility grenades with no damage of their own)
 * is reported with `damage: null` for the GM to resolve from the crit prose.
 */
async function detonateCarriedMunitions(actor: WH40KBaseActorDocument): Promise<DetonatedMunition[]> {
    const munitions = [...ownedItems(actor)].filter((item) => (item.type === 'weapon' && item.system.class === 'thrown') || item.type === 'ammunition');
    return Promise.all(
        munitions.map(async (item): Promise<DetonatedMunition> => {
            const dmg = item.system.damage;
            const formula = typeof dmg?.formula === 'string' ? dmg.formula.trim() : '';
            const bonus = typeof dmg?.bonus === 'number' ? dmg.bonus : 0;
            const damageType = typeof dmg?.type === 'string' ? dmg.type : null;
            let damage: number | null = null;
            if (item.type === 'weapon' && formula !== '' && formula !== '-') {
                try {
                    const roll = new Roll(formula, {});
                    await roll.evaluate();
                    damage = (roll.total ?? 0) + bonus;
                } catch {
                    damage = null;
                }
            }
            // Expend the detonated munition (RAW: it is destroyed) — zero its carried
            // quantity. Reversible via a normal quantity edit; a no-op when it has none.
            const quantity = typeof item.system.quantity === 'number' ? item.system.quantity : 0;
            let consumed = false;
            if (quantity > 0) {
                await item.update({ 'system.quantity': 0 });
                consumed = true;
                game.wh40k.log('critical-damage: munition detonated & expended', { actor: actor.name, munition: item.name, quantity });
            }
            return { name: item.name ?? '', damage, damageType, consumed };
        }),
    );
}

/**
 * Create a temporary boost effect with a duration.
 * @param {Actor} actor                 The target actor
 * @param {string} name                 Effect name
 * @param {object[]} changes            Array of change objects
 * @param {number} rounds               Duration in rounds
 * @param {object} [options={}]         Additional options
 * @returns {Promise<ActiveEffect>}
 */
export async function createTemporaryEffect(
    actor: WH40KBaseActorDocument,
    name: string,
    changes: EffectChange[],
    rounds: number,
    options: EffectOptions = {},
    // eslint-disable-next-line no-restricted-syntax -- boundary: return propagates Foundry createEmbeddedDocuments which is opaque
): Promise<unknown> {
    const combat = game.combat;

    return createEffect(actor, {
        name,
        icon: options.icon ?? 'icons/svg/clockwork.svg',
        changes,
        duration: {
            rounds,
            startRound: combat?.round ?? 0,
            startTurn: combat?.turn ?? 0,
        },
        origin: options.origin,
        flags: options.flags,
    });
}

/**
 * Remove all effects from an actor matching a condition.
 * @param {Actor} actor                 The target actor
 * @param {Function} filter             Filter function
 * @returns {Promise<void>}
 */
export async function removeEffects(actor: WH40KBaseActorDocument, filter: (effect: ActiveEffect) => boolean): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.effects contains Foundry EmbeddedCollection items; cast to ActiveEffect for typed filter
    const effects = actor.effects.filter((effect) => filter(effect as unknown as ActiveEffect));
    const ids = effects.map((e) => e.id).filter((id): id is string => Boolean(id));
    if (ids.length) {
        await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    }
}

/**
 * Remove all effects from an actor by name.
 * @param {Actor} actor                 The target actor
 * @param {string} name                 Effect name
 * @returns {Promise<void>}
 */
export async function removeEffectByName(actor: WH40KBaseActorDocument, name: string): Promise<void> {
    await removeEffects(actor, (e: ActiveEffect) => e.name === name);
}

/**
 * Toggle an effect on/off (enable/disable).
 * @param {Actor} actor                 The target actor
 * @param {string} effectId             Effect ID
 * @returns {Promise<void>}
 */
export async function toggleEffect(actor: WH40KBaseActorDocument, effectId: string): Promise<void> {
    const effect = actor.effects.get(effectId);
    if (effect) {
        await effect.update({ disabled: !effect.disabled });
    }
}
