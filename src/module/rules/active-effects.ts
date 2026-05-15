import { t } from '../i18n/t.ts';
import { applyRollModeWhispers, roll1d100 } from '../rolls/roll-helpers.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';

type ActiveEffectChatContext = {
    template: string;
    actor: WH40KBaseActorDocument;
    roll?: Roll;
    target?: number;
    success?: boolean;
    damage?: number;
};

type EffectChange = {
    key: string;
    mode: number;
    value: number | string;
};

// eslint-disable-next-line no-restricted-syntax -- boundary: duration/flags/extra options are untyped Foundry ActiveEffect fields; shape is open-ended
type EffectOptions = Record<string, unknown> & {
    name?: string;
    icon?: string;
    duration?: Record<string, unknown>; // eslint-disable-line no-restricted-syntax -- boundary: Foundry duration object is untyped
    origin?: string;
    flags?: Record<string, unknown>; // eslint-disable-line no-restricted-syntax -- boundary: Foundry flags object is untyped
    changes?: EffectChange[];
};

type EffectDataInput = {
    name: string;
    icon?: string | undefined;
    changes?: EffectChange[] | undefined;
    disabled?: boolean | undefined;
    origin?: string | undefined;
    duration?: Record<string, unknown> | undefined; // eslint-disable-line no-restricted-syntax -- boundary: Foundry duration object is untyped
    flags?: Record<string, unknown> | undefined; // eslint-disable-line no-restricted-syntax -- boundary: Foundry flags object is untyped
};

type ConditionDefinition = {
    name: string;
    icon: string;
    changes: EffectChange[];
    flags: Record<string, unknown>; // eslint-disable-line no-restricted-syntax -- boundary: Foundry flags object is untyped
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
    context.success = rollTotal === 1 || (rollTotal <= target && rollTotal !== 100);

    const damageRoll = new Roll('1d10', {});
    await damageRoll.evaluate();
    context.damage = damageRoll.total ?? 0;
    await sendActiveEffectMessage(context);
}

export async function sendActiveEffectMessage(activeContext: ActiveEffectChatContext): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate accepts untyped context; cast to match Handlebars signature
    const html = await foundry.applications.handlebars.renderTemplate(activeContext.template, activeContext as unknown as Record<string, unknown>);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts untyped data; chatData keys are Foundry API fields
    const chatData: Record<string, unknown> = {
        user: game.user.id,
        rollMode: game.settings.get('core', 'rollMode'),
        content: html,
    };
    applyRollModeWhispers(chatData);
    await ChatMessage.create(chatData);
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
                mode: CONST.ACTIVE_EFFECT_MODES.ADD,
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
                mode: CONST.ACTIVE_EFFECT_MODES.ADD,
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
                mode: CONST.ACTIVE_EFFECT_MODES.ADD,
                value: value,
            },
        ],
        duration: options.duration,
        origin: options.origin,
        flags: options.flags,
    });
}

/**
 * Create a condition effect (stunned, prone, blinded, etc.).
 * @param {Actor} actor                 The target actor
 * @param {string} condition            Condition identifier
 * @param {object} [options={}]         Additional options
 * @returns {Promise<ActiveEffect>}
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: return propagates Foundry createEmbeddedDocuments which is opaque
export async function createConditionEffect(actor: WH40KBaseActorDocument, condition: string, options: EffectOptions = {}): Promise<unknown> {
    // Predefined conditions with their effects
    const conditions: Record<string, ConditionDefinition> = {
        stunned: {
            name: 'Stunned',
            icon: 'icons/svg/daze.svg',
            changes: [
                { key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                { key: 'system.combat.attack', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
            ],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
        prone: {
            name: 'Prone',
            icon: 'icons/svg/falling.svg',
            changes: [{ key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
        blinded: {
            name: 'Blinded',
            icon: 'icons/svg/blind.svg',
            changes: [
                { key: 'system.characteristics.ballisticSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
                { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
            ],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
        deafened: {
            name: 'Deafened',
            icon: 'icons/svg/deaf.svg',
            changes: [{ key: 'system.characteristics.perception.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
        grappled: {
            name: 'Grappled',
            icon: 'icons/svg/combat.svg',
            changes: [
                { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                { key: 'system.characteristics.agility.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
            ],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
        inspired: {
            name: 'Inspired',
            icon: 'icons/svg/upgrade.svg',
            changes: [
                { key: 'system.characteristics.willpower.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
                { key: 'system.characteristics.fellowship.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
            ],
            flags: { 'wh40k-rpg': { nature: 'beneficial' } },
        },
        blessed: {
            name: 'Blessed',
            icon: 'icons/svg/holy-shield.svg',
            changes: [{ key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 }],
            flags: { 'wh40k-rpg': { nature: 'beneficial' } },
        },
        pinned: {
            // core.md §"Pinning": pinned characters can't move or attack with
            // ranged weapons; melee attacks against them get +20 WS.
            name: 'Pinned',
            icon: 'icons/svg/net.svg',
            changes: [{ key: 'system.characteristics.ballisticSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
        unconscious: {
            // core.md §"Unconsciousness": helpless target until healed.
            name: 'Unconscious',
            icon: 'icons/svg/unconscious.svg',
            changes: [
                { key: 'system.combat.defense', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -60 },
                { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -60 },
                { key: 'system.characteristics.ballisticSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -60 },
                { key: 'system.characteristics.agility.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -60 },
            ],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
        suffocating: {
            // core.md §"Suffocation": no immediate stat hit, but the GM tracks
            // ladder-state via the flag. Damage accrues outside the AE pipeline.
            name: 'Suffocating',
            icon: 'icons/svg/drowning.svg',
            changes: [],
            flags: { 'wh40k-rpg': { nature: 'harmful', suffocating: true } },
        },
        bloodloss: {
            // core.md §"Blood Loss": persistent 1d10 per turn when Heavily
            // Damaged, plus Toughness test or +1 fatigue. The per-turn tick
            // hooks into `processActiveEffectsDuringCombat` (see settings).
            name: 'Blood Loss',
            icon: 'icons/svg/blood.svg',
            changes: [],
            flags: { 'wh40k-rpg': { nature: 'harmful', bloodloss: true } },
        },
        uselessLimb: {
            // core.md §"Useless Limbs": loss of use of the limb until healed.
            // The flag carries which limb; sheets / item enforcement consume it.
            name: 'Useless Limb',
            icon: 'icons/svg/sling.svg',
            changes: [],
            flags: { 'wh40k-rpg': { nature: 'harmful', uselessLimb: true } },
        },
        manacled: {
            // Errata p. 176 — Manacles impose −40 to BS and WS tests until removed.
            name: 'Manacled',
            icon: 'icons/svg/chains.svg',
            changes: [
                { key: 'system.characteristics.ballisticSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -40 },
                { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -40 },
            ],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
        fatigued: {
            // core.md §"Fatigue": each level adds -10 to all tests. The
            // applicator should be `applyFatigue(n)` on the actor; this AE
            // surfaces the impact in a player-readable way.
            name: 'Fatigued',
            icon: 'icons/svg/sleep.svg',
            changes: [
                { key: 'system.characteristics.weaponSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
                { key: 'system.characteristics.ballisticSkill.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
                { key: 'system.characteristics.strength.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
                { key: 'system.characteristics.toughness.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
                { key: 'system.characteristics.agility.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
                { key: 'system.characteristics.intelligence.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
                { key: 'system.characteristics.perception.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
                { key: 'system.characteristics.willpower.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
                { key: 'system.characteristics.fellowship.modifier', mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -10 },
            ],
            flags: { 'wh40k-rpg': { nature: 'harmful' } },
        },
    };

    const conditionData = conditions[condition.toLowerCase()];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions -- noUncheckedIndexedAccess guard: conditions index may be undefined at runtime
    if (!conditionData) {
        ui.notifications.warn(t('WH40K.Warning.UnknownCondition', { condition }));
        return null;
    }

    return createEffect(actor, {
        ...conditionData,
        ...options,
        changes: options.changes ?? conditionData.changes,
        flags: foundry.utils.mergeObject(conditionData.flags, options.flags ?? {}),
    });
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
