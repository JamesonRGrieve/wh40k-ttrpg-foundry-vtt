import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { SYSTEM_ID } from '../constants.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import { PsychicActionData, WeaponActionData } from '../rolls/action-data.ts';
import { calculateTokenDistance } from '../utils/range-calculator.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';

/**
 * Interface for combined source and target data
 */
export interface SourceAndTargetData {
    actor: WH40KBaseActor;
    target: WH40KBaseActor | null;
    distance: number;
}

/**
 * Manager for targeted actions (attacks, powers) with distance calculation
 */
export class TargetedActionManager {
    /**
     * Initialize hooks for TargetedActionManager
     */
    initializeHooks(): void {
        // Initialize Scene Control Buttons
        Hooks.on('getSceneControlButtons', (controls: Record<string, foundry.applications.ui.SceneControls.Control>) => {
            const tokenControl = controls['tokens'];
            if (tokenControl === undefined) return;
            try {
                if (!game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls)) {
                    const toolOrder = Object.keys(tokenControl.tools).length;
                    tokenControl.tools['Attack'] = {
                        name: 'Attack',
                        title: 'Attack',
                        icon: 'fas fa-swords',
                        visible: true,
                        onChange: () => {
                            void this.performWeaponAttack();
                        },
                        button: true,
                        order: toolOrder,
                    };
                }
            } catch (error) {
                game.wh40k.log('Unable to add game bar icon.', error);
            }
        });
    }

    /**
     * Calculate distance between two tokens
     */
    tokenDistance(token1: Token, token2: Token): number {
        // Use the new range calculator for consistent distance calculation
        return calculateTokenDistance(token1, token2);
    }

    /**
     * Get source token from various inputs
     */
    getSourceToken(source: WH40KBaseActor | Token | null = null): Token | undefined {
        game.wh40k.log('getSourceToken', source);
        let sourceToken: Token | undefined;

        if (source) {
            sourceToken = (source as Token).actor ? (source as Token) : (source as WH40KBaseActor).getActiveTokens()[0];
        } else {
            const controlled = game.canvas?.tokens?.controlled;
            if (!controlled || controlled.length === 0) {
                ui.notifications.warn('You need to control a token!');
                return undefined;
            }
            if (controlled.length > 1) {
                ui.notifications.warn('You need to control a single token! Multi-token support is not yet added.');
                return undefined;
            }
            sourceToken = controlled[0];
        }

        if (sourceToken && !sourceToken.actor) {
            ui.notifications.warn('Token must be associated with an actor!');
            return undefined;
        }

        return sourceToken;
    }

    /**
     * Get target token from various inputs
     */
    getTargetToken(target: WH40KBaseActor | Token | null = null): Token | undefined {
        game.wh40k.log('getTargetToken', target);
        let targetToken: Token | undefined;

        if (target) {
            targetToken = (target as Token).actor ? (target as Token) : (target as WH40KBaseActor).getActiveTokens()[0];
        } else {
            const targetedObjects = game.user.targets;
            if (!targetedObjects || targetedObjects.size === 0) return undefined;
            if (targetedObjects.size > 1) {
                ui.notifications.warn('You need to target a single token! Multi-token targeting is not yet added.');
                return undefined;
            }
            targetToken = [...targetedObjects.values()][0];
        }

        if (targetToken && !targetToken.actor) {
            ui.notifications.warn('Target token must be associated with an actor!');
            return undefined;
        }

        return targetToken;
    }

    /**
     * Create source and target data for an action
     */
    createSourceAndTargetData(source: WH40KBaseActor | Token | null = null, target: WH40KBaseActor | Token | null = null): SourceAndTargetData | undefined {
        game.wh40k.log('createSourceAndTargetData', { source, target });

        // Source
        const sourceToken = this.getSourceToken(source);
        const sourceActorData = sourceToken ? (sourceToken.actor as WH40KBaseActor) : (source as WH40KBaseActor);
        if (!sourceActorData) return undefined;

        // Target
        const targetToken = this.getTargetToken(target);
        const targetActorData = targetToken ? (targetToken.actor as WH40KBaseActor) : (target as WH40KBaseActor);

        // Distance
        const targetDistance = sourceToken && targetToken ? this.tokenDistance(sourceToken, targetToken) : 0;

        return {
            actor: sourceActorData,
            target: targetActorData,
            distance: targetDistance,
        };
    }

    /**
     * Perform a weapon attack
     */
    async performWeaponAttack(
        source: WH40KBaseActor | Token | null = null,
        target: WH40KBaseActor | Token | null = null,
        weapon: WH40KItem | null = null,
    ): Promise<void> {
        game.wh40k.log('performWeaponAttack', { source, target, weapon });
        const rollData = this.createSourceAndTargetData(source, target);
        if (!rollData) return;

        // Weapon
        const weapons = weapon
            ? [weapon]
            : (rollData.actor.items.filter((item: WH40KItem) => item.type === 'weapon' && item.system.equipped === true) as WH40KItem[]);
        if (!weapons || weapons.length === 0) {
            ui.notifications.warn('Actor must have an equipped weapon!');
            return;
        }

        const weaponAttack = new WeaponActionData();
        const weaponRollData = weaponAttack.rollData;
        weaponRollData.weapons = weapons;
        weaponRollData.sourceActor = rollData.actor;
        weaponRollData.targetActor = rollData.target;
        weaponRollData.distance = rollData.distance;
        prepareUnifiedRoll(weaponAttack);
    }

    /**
     * Perform a psychic attack
     */
    async performPsychicAttack(
        source: WH40KBaseActor | Token | null = null,
        target: WH40KBaseActor | Token | null = null,
        psychicPower: WH40KItem | null = null,
    ): Promise<void> {
        game.wh40k.log('performPsychicAttack');
        const rollData = this.createSourceAndTargetData(source, target);
        if (!rollData) return;

        // Powers
        const powers = psychicPower ? [psychicPower] : (rollData.actor.items.filter((item: WH40KItem) => item.type === 'psychicPower') as WH40KItem[]);
        if (!powers || powers.length === 0) {
            ui.notifications.warn('Actor must have psychic power!');
            return;
        }

        const psychicAttack = new PsychicActionData();
        const psychicRollData = psychicAttack.rollData;
        psychicRollData.psychicPowers = powers;
        psychicRollData.sourceActor = rollData.actor;
        psychicRollData.targetActor = rollData.target;
        psychicRollData.distance = rollData.distance;
        prepareUnifiedRoll(psychicAttack);
    }
}

export const DHTargetedActionManager = new TargetedActionManager();
