import { formatChangeValue, getChangeLabel } from '../helpers/effects.ts';
import type { WH40KBaseActor } from './base-actor.ts';

/** Shape of an ActiveEffect change entry used throughout this class. */
interface EffectChange {
    key: string;
    value: string | number;
    mode: number;
    priority?: number;
}

/**
 * Extended ActiveEffect document for WH40K RPG system.
 * Integrates with the existing modifier system and provides proper effect application.
 * @extends {ActiveEffect}
 */
export class WH40KActiveEffect extends ActiveEffect {
    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Is this a temporary effect that expires?
     * @type {boolean}
     */
    get isTemporary(): boolean {
        const duration = this.duration.seconds ?? this.duration.rounds ?? this.duration.turns;
        return duration !== null && duration !== undefined && duration > 0;
    }

    /**
     * Get the source actor or item for this effect.
     * @type {Actor|Item|null}
     */
    get source(): Actor | Item | null {
        if (!this.origin) return null;
        return fromUuidSync(this.origin) as Actor | Item | null;
    }

    /**
     * Get the source name for display.
     * @type {string}
     */
    get sourceName(): string {
        const source = this.source;
        return source?.name ?? game.i18n.localize('WH40K.ActiveEffect.UnknownSource');
    }

    /**
     * Get the nature of this effect (beneficial, harmful, neutral).
     * Determined by flag or by analyzing changes.
     * @type {string}
     */
    get nature(): string {
        // Check explicit flag
        const flagNature = this.getFlag('wh40k-rpg', 'nature');
        if (flagNature) return flagNature;

        // Analyze changes to determine nature
        let positiveCount = 0;
        let negativeCount = 0;

        for (const change of this.changes) {
            if (change.mode === CONST.ACTIVE_EFFECT_MODES.ADD) {
                if (change.value > 0) positiveCount++;
                else if (change.value < 0) negativeCount++;
            }
        }

        if (positiveCount > negativeCount) return 'beneficial';
        if (negativeCount > positiveCount) return 'harmful';
        return 'neutral';
    }

    /**
     * Get CSS class based on nature.
     * @type {string}
     */
    get natureClass(): string {
        return `wh40k-effect-${this.nature}`;
    }

    /* -------------------------------------------- */
    /*  Active Effect Application                   */
    /* -------------------------------------------- */

    /**
     * Apply this Active Effect to a target Actor or Item.
     * Extends the core method to handle WH40K RPG-specific data paths.
     * @param {Actor|Item} target       The target to which this effect is applied
     * @param {object} change           The change data being applied
     * @returns {*}                     The resulting applied value
     * @override
     */
    apply(target: unknown, change: EffectChange): unknown {
        // Handle WH40K RPG-specific change keys
        const key = change.key;

        // Handle characteristic modifications (e.g., "characteristics.strength")
        if (key.startsWith('system.characteristics.')) {
            return this._applyCharacteristicChange(target, change);
        }

        // Handle skill modifications (e.g., "skills.acrobatics.bonus")
        if (key.startsWith('system.skills.')) {
            return this._applySkillChange(target, change);
        }

        // Handle combat stat modifications
        if (key.startsWith('system.combat.')) {
            return this._applyCombatChange(target, change);
        }

        // Handle movement modifications
        if (key.startsWith('system.movement.')) {
            return this._applyMovementChange(target, change);
        }

        // Default to parent implementation
        return super.apply(target, change);
    }

    /**
     * Apply a characteristic change.
     * @param {Actor} actor           The target actor
     * @param {object} change         The change data
     * @returns {number}              The applied value
     * @private
     */
    _applyCharacteristicChange(actor: WH40KBaseActor, change: EffectChange): number | null {
        const path = change.key;
        const charKey = path.split('.')[2]; // e.g., "strength" from "system.characteristics.strength.modifier"

        if (!actor.system.characteristics?.[charKey]) return null;

        const current = foundry.utils.getProperty(actor, path) ?? 0;
        return this._applyChangeValue(current, change);
    }

    /**
     * Apply a skill change.
     * @param {Actor} actor           The target actor
     * @param {object} change         The change data
     * @returns {number}              The applied value
     * @private
     */
    _applySkillChange(actor: WH40KBaseActor, change: EffectChange): number | null {
        const path = change.key;
        const skillKey = path.split('.')[2]; // e.g., "acrobatics"

        if (!actor.system.skills?.[skillKey]) return null;

        const current = foundry.utils.getProperty(actor, path) ?? 0;
        return this._applyChangeValue(current, change);
    }

    /**
     * Apply a combat stat change.
     * @param {Actor} actor           The target actor
     * @param {object} change         The change data
     * @returns {number}              The applied value
     * @private
     */
    _applyCombatChange(actor: WH40KBaseActor, change: EffectChange): number {
        const path = change.key;
        const current = foundry.utils.getProperty(actor, path) ?? 0;
        return this._applyChangeValue(current, change);
    }

    /**
     * Apply a movement change.
     * @param {Actor} actor           The target actor
     * @param {object} change         The change data
     * @returns {number}              The applied value
     * @private
     */
    _applyMovementChange(actor: WH40KBaseActor, change: EffectChange): number {
        const path = change.key;
        const current = foundry.utils.getProperty(actor, path) ?? 0;
        return this._applyChangeValue(current, change);
    }

    /**
     * Apply the change value based on the mode.
     * @param {number} current        Current value
     * @param {object} change         The change data
     * @returns {number}              The new value
     * @private
     */
    _applyChangeValue(current: number, change: EffectChange): number {
        const modes = CONST.ACTIVE_EFFECT_MODES;
        const value = Number(change.value);

        switch (change.mode) {
            case modes.ADD:
                return current + value;
            case modes.MULTIPLY:
                return current * value;
            case modes.OVERRIDE:
                return value;
            case modes.UPGRADE:
                return Math.max(current, value);
            case modes.DOWNGRADE:
                return Math.min(current, value);
            default:
                return current;
        }
    }

    /* -------------------------------------------- */
    /*  Helpers                                     */
    /* -------------------------------------------- */

    /**
     * Get a summary of all changes for display.
     * @type {object[]}
     */
    get changesSummary(): { key: string; label: string; value: string; mode: string }[] {
        return this.changes.map((change) => {
            const key = change.key.split('.').pop() ?? '';
            return {
                key,
                label: getChangeLabel(change.key),
                value: formatChangeValue(change as unknown as { key: string; value: string | number; mode: number }),
                mode: game.i18n.localize(`WH40K.ActiveEffect.Mode.${change.mode}`),
            };
        });
    }

    /* -------------------------------------------- */
    /*  Duration Management                         */
    /* -------------------------------------------- */

    /**
     * Get a human-readable duration string.
     * @type {string}
     */
    get durationLabel(): string {
        const d = this.duration;

        if (!this.isTemporary) {
            return game.i18n.localize('WH40K.ActiveEffect.Permanent');
        }

        if (d.rounds) {
            return game.i18n.format('WH40K.ActiveEffect.DurationRounds', { rounds: d.rounds });
        }

        if (d.turns) {
            return game.i18n.format('WH40K.ActiveEffect.DurationTurns', { turns: d.turns });
        }

        if (d.seconds) {
            return game.i18n.format('WH40K.ActiveEffect.DurationSeconds', { seconds: d.seconds });
        }

        return game.i18n.localize('WH40K.ActiveEffect.Unknown');
    }

    /**
     * Get remaining duration.
     * @type {number|null}
     */
    get remainingDuration(): number | null {
        if (!this.isTemporary) return null;

        const d = this.duration;
        const combat = game.combat;

        if (d.rounds && combat) {
            const startRound = d.startRound ?? 0;
            const currentRound = combat.round ?? 0;
            return Math.max(0, startRound + d.rounds - currentRound);
        }

        if (d.turns && combat) {
            const startTurn = d.startTurn ?? 0;
            const currentTurn = combat.turn ?? 0;
            const startRound = d.startRound ?? 0;
            const currentRound = combat.round ?? 0;
            const totalStart = startRound * combat.turns.length + startTurn;
            const totalCurrent = currentRound * combat.turns.length + currentTurn;
            return Math.max(0, totalStart + d.turns - totalCurrent);
        }

        if (d.seconds) {
            const startTime = d.startTime ?? 0;
            const currentTime = game.time.worldTime ?? 0;
            return Math.max(0, startTime + d.seconds - currentTime);
        }

        return null;
    }

    /**
     * Is this effect about to expire (1 round/turn remaining)?
     * @type {boolean}
     */
    get isExpiring(): boolean {
        const remaining = this.remainingDuration;
        return remaining !== null && remaining <= 1;
    }
}
