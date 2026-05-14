import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { SYSTEM_ID } from '../constants.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import { PsychicActionData, WeaponActionData } from '../rolls/action-data.ts';
import { calculateTokenDistance } from '../utils/range-calculator.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';

type CanvasToken = foundry.canvas.placeables.Token;

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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard for strict tsconfig; controls['tokens'] may be undefined
            if (tokenControl === undefined) return;
            try {
                if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls) !== true) {
                    const toolOrder = Object.keys(tokenControl.tools).length;
                    tokenControl.tools['Attack'] = {
                        name: 'Attack',
                        title: 'Attack',
                        icon: 'fas fa-swords',
                        visible: true,
                        onChange: () => {
                            this.performWeaponAttack();
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
    tokenDistance(token1: CanvasToken, token2: CanvasToken): number {
        // Use the new range calculator for consistent distance calculation
        return calculateTokenDistance(token1, token2);
    }

    /**
     * Get source token from various inputs
     */
    getSourceToken(source: WH40KBaseActor | CanvasToken | null = null): CanvasToken | undefined {
        game.wh40k.log('getSourceToken', source);
        let sourceToken: CanvasToken | undefined;

        if (source !== null) {
            // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
            sourceToken = (source as CanvasToken).actor != null ? (source as CanvasToken) : (source as WH40KBaseActor).getActiveTokens()[0];
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- game.canvas?.tokens?.controlled optional chain; undefined is possible at invocation
            const controlled = game.canvas?.tokens?.controlled;
            if (controlled === undefined || controlled.length === 0) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
                ui.notifications.warn('You need to control a token!');
                return undefined;
            }
            if (controlled.length > 1) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
                ui.notifications.warn('You need to control a single token! Multi-token support is not yet added.');
                return undefined;
            }
            sourceToken = controlled[0];
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, eqeqeq -- sourceToken guard per noUncheckedIndexedAccess; loose null check intentional
        if (sourceToken !== undefined && sourceToken.actor == null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn('Token must be associated with an actor!');
            return undefined;
        }

        return sourceToken;
    }

    /**
     * Get target token from various inputs
     */
    getTargetToken(target: WH40KBaseActor | CanvasToken | null = null): CanvasToken | undefined {
        game.wh40k.log('getTargetToken', target);
        let targetToken: CanvasToken | undefined;

        if (target !== null) {
            // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
            targetToken = (target as CanvasToken).actor != null ? (target as CanvasToken) : (target as WH40KBaseActor).getActiveTokens()[0];
        } else {
            const targetedObjects = game.user.targets;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, eqeqeq -- game.user.targets may be undefined at invocation time; loose null check intentional
            if (targetedObjects == null || targetedObjects.size === 0) return undefined;
            if (targetedObjects.size > 1) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
                ui.notifications.warn('You need to target a single token! Multi-token targeting is not yet added.');
                return undefined;
            }
            targetToken = [...targetedObjects.values()][0];
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, eqeqeq -- targetToken guard per noUncheckedIndexedAccess; loose null check intentional
        if (targetToken !== undefined && targetToken.actor == null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn('Target token must be associated with an actor!');
            return undefined;
        }

        return targetToken;
    }

    /**
     * Create source and target data for an action
     */
    createSourceAndTargetData(
        source: WH40KBaseActor | CanvasToken | null = null,
        target: WH40KBaseActor | CanvasToken | null = null,
    ): SourceAndTargetData | undefined {
        game.wh40k.log('createSourceAndTargetData', { source, target });

        // Source
        const sourceToken = this.getSourceToken(source);
        // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
        const sourceActorData = sourceToken != null ? (sourceToken.actor as WH40KBaseActor) : (source as WH40KBaseActor);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, eqeqeq -- sourceActorData may be null/undefined; loose null check intentional
        if (sourceActorData == null) return undefined;

        // Target
        const targetToken = this.getTargetToken(target);
        // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
        const targetActorData = targetToken != null ? (targetToken.actor as WH40KBaseActor) : (target as WH40KBaseActor);

        // Distance
        // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
        const targetDistance = sourceToken != null && targetToken != null ? this.tokenDistance(sourceToken, targetToken) : 0;

        return {
            actor: sourceActorData,
            target: targetActorData,
            distance: targetDistance,
        };
    }

    /**
     * Perform a weapon attack
     */
    performWeaponAttack(
        source: WH40KBaseActor | CanvasToken | null = null,
        target: WH40KBaseActor | CanvasToken | null = null,
        weapon: WH40KItem | null = null,
    ): void {
        game.wh40k.log('performWeaponAttack', { source, target, weapon });
        const rollData = this.createSourceAndTargetData(source, target);
        // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
        if (rollData == null) return;

        // Weapon
        const weapons =
            // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
            weapon != null
                ? [weapon]
                : (rollData.actor.items.filter((item: WH40KItem) => item.type === 'weapon' && item.system.equipped === true) as WH40KItem[]);
        if (weapons.length === 0) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
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
    performPsychicAttack(
        source: WH40KBaseActor | CanvasToken | null = null,
        target: WH40KBaseActor | CanvasToken | null = null,
        psychicPower: WH40KItem | null = null,
    ): void {
        game.wh40k.log('performPsychicAttack');
        const rollData = this.createSourceAndTargetData(source, target);
        // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
        if (rollData == null) return;

        // Powers
        // eslint-disable-next-line eqeqeq -- null/undefined loose check is intentional
        const powers = psychicPower != null ? [psychicPower] : (rollData.actor.items.filter((item: WH40KItem) => item.type === 'psychicPower') as WH40KItem[]);
        if (powers.length === 0) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
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
