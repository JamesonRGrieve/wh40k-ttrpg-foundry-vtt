import { roll1d100 } from '../rolls/roll-helpers.mjs';

/* -------------------------------------------- */
/*  Legacy Combat Effects                       */
/* -------------------------------------------- */

export async function handleBleeding(actor) {
    const context = {
        template: 'systems/rogue-trader/templates/chat/bleeding-chat.hbs',
        actor: actor
    }
    await sendActiveEffectMessage(context);
}

export async function handleOnFire(actor) {
    const context = {
        template: 'systems/rogue-trader/templates/chat/burning-chat.hbs',
        actor: actor,
        roll: await roll1d100(),
        target: actor.characteristics.willpower.total
    }
    const rollTotal = context.roll.total;
    context.success = rollTotal === 1 || (rollTotal <= context.target && rollTotal !== 100);

    const damageRoll = new Roll('1d10', {});
    await damageRoll.evaluate();
    context.damage = damageRoll.total;
    await sendActiveEffectMessage(context);
}

export async function sendActiveEffectMessage(activeContext) {
    const html = await renderTemplate(activeContext.template, activeContext);
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get('core', 'rollMode'),
        content: html,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
    };
    if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients('GM');
    } else if (chatData.rollMode === 'selfroll') {
        chatData.whisper = [game.user];
    }
    ChatMessage.create(chatData);
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
export async function createEffect(actor, effectData, options = {}) {
    const data = {
        name: effectData.name,
        icon: effectData.icon ?? "icons/svg/aura.svg",
        changes: effectData.changes ?? [],
        disabled: effectData.disabled ?? false,
        origin: effectData.origin,
        duration: effectData.duration ?? {},
        flags: effectData.flags ?? {}
    };

    return await actor.createEmbeddedDocuments("ActiveEffect", [data], options);
}

/**
 * Create a characteristic modifier effect.
 * @param {Actor} actor                 The target actor
 * @param {string} characteristic       Characteristic key (e.g., "strength")
 * @param {number} value                Modifier value
 * @param {object} [options={}]         Additional options
 * @returns {Promise<ActiveEffect>}
 */
export async function createCharacteristicEffect(actor, characteristic, value, options = {}) {
    const charLabel = game.i18n.localize(`RT.Characteristic.${characteristic.capitalize()}`);
    const name = options.name ?? `${charLabel} ${value > 0 ? '+' : ''}${value}`;
    
    return await createEffect(actor, {
        name,
        icon: options.icon ?? "icons/svg/upgrade.svg",
        changes: [{
            key: `system.characteristics.${characteristic}.modifier`,
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: value
        }],
        duration: options.duration,
        origin: options.origin,
        flags: options.flags
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
export async function createSkillEffect(actor, skill, value, options = {}) {
    const skillLabel = game.i18n.localize(`RT.Skill.${skill}`);
    const name = options.name ?? `${skillLabel} ${value > 0 ? '+' : ''}${value}`;
    
    return await createEffect(actor, {
        name,
        icon: options.icon ?? "icons/svg/upgrade.svg",
        changes: [{
            key: `system.skills.${skill}.bonus`,
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: value
        }],
        duration: options.duration,
        origin: options.origin,
        flags: options.flags
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
export async function createCombatEffect(actor, type, value, options = {}) {
    const typeLabel = game.i18n.localize(`RT.Combat.${type.capitalize()}`);
    const name = options.name ?? `${typeLabel} ${value > 0 ? '+' : ''}${value}`;
    
    return await createEffect(actor, {
        name,
        icon: options.icon ?? "icons/svg/combat.svg",
        changes: [{
            key: `system.combat.${type}`,
            mode: CONST.ACTIVE_EFFECT_MODES.ADD,
            value: value
        }],
        duration: options.duration,
        origin: options.origin,
        flags: options.flags
    });
}

/**
 * Create a condition effect (stunned, prone, blinded, etc.).
 * @param {Actor} actor                 The target actor
 * @param {string} condition            Condition identifier
 * @param {object} [options={}]         Additional options
 * @returns {Promise<ActiveEffect>}
 */
export async function createConditionEffect(actor, condition, options = {}) {
    // Predefined conditions with their effects
    const conditions = {
        stunned: {
            name: "Stunned",
            icon: "icons/svg/daze.svg",
            changes: [
                { key: "system.combat.defense", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                { key: "system.combat.attack", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }
            ],
            flags: { "rogue-trader": { nature: "harmful" } }
        },
        prone: {
            name: "Prone",
            icon: "icons/svg/falling.svg",
            changes: [
                { key: "system.combat.defense", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }
            ],
            flags: { "rogue-trader": { nature: "harmful" } }
        },
        blinded: {
            name: "Blinded",
            icon: "icons/svg/blind.svg",
            changes: [
                { key: "system.characteristics.ballisticSkill.modifier", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 },
                { key: "system.characteristics.weaponSkill.modifier", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -30 }
            ],
            flags: { "rogue-trader": { nature: "harmful" } }
        },
        deafened: {
            name: "Deafened",
            icon: "icons/svg/deaf.svg",
            changes: [
                { key: "system.characteristics.perception.modifier", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }
            ],
            flags: { "rogue-trader": { nature: "harmful" } }
        },
        grappled: {
            name: "Grappled",
            icon: "icons/svg/combat.svg",
            changes: [
                { key: "system.characteristics.weaponSkill.modifier", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 },
                { key: "system.characteristics.agility.modifier", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: -20 }
            ],
            flags: { "rogue-trader": { nature: "harmful" } }
        },
        inspired: {
            name: "Inspired",
            icon: "icons/svg/upgrade.svg",
            changes: [
                { key: "system.characteristics.willpower.modifier", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 },
                { key: "system.characteristics.fellowship.modifier", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 }
            ],
            flags: { "rogue-trader": { nature: "beneficial" } }
        },
        blessed: {
            name: "Blessed",
            icon: "icons/svg/holy-shield.svg",
            changes: [
                { key: "system.combat.defense", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: 10 }
            ],
            flags: { "rogue-trader": { nature: "beneficial" } }
        }
    };

    const conditionData = conditions[condition.toLowerCase()];
    if ( !conditionData ) {
        ui.notifications.warn(`Unknown condition: ${condition}`);
        return null;
    }

    return await createEffect(actor, {
        ...conditionData,
        ...options,
        changes: options.changes ?? conditionData.changes,
        flags: foundry.utils.mergeObject(conditionData.flags ?? {}, options.flags ?? {})
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
export async function createTemporaryEffect(actor, name, changes, rounds, options = {}) {
    const combat = game.combat;
    
    return await createEffect(actor, {
        name,
        icon: options.icon ?? "icons/svg/clockwork.svg",
        changes,
        duration: {
            rounds,
            startRound: combat?.round ?? 0,
            startTurn: combat?.turn ?? 0
        },
        origin: options.origin,
        flags: options.flags
    });
}

/**
 * Remove all effects from an actor matching a condition.
 * @param {Actor} actor                 The target actor
 * @param {Function} filter             Filter function
 * @returns {Promise<void>}
 */
export async function removeEffects(actor, filter) {
    const effects = actor.effects.filter(filter);
    const ids = effects.map(e => e.id);
    if ( ids.length ) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
    }
}

/**
 * Remove all effects from an actor by name.
 * @param {Actor} actor                 The target actor
 * @param {string} name                 Effect name
 * @returns {Promise<void>}
 */
export async function removeEffectByName(actor, name) {
    await removeEffects(actor, e => e.name === name);
}

/**
 * Toggle an effect on/off (enable/disable).
 * @param {Actor} actor                 The target actor
 * @param {string} effectId             Effect ID
 * @returns {Promise<void>}
 */
export async function toggleEffect(actor, effectId) {
    const effect = actor.effects.get(effectId);
    if ( effect ) {
        await effect.update({ disabled: !effect.disabled });
    }
}

