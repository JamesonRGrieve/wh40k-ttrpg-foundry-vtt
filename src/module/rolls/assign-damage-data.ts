import { getCriticalDamage } from '../rules/critical-damage.ts';
import { damageTypeDropdown } from '../rules/damage-type.ts';
import { hitDropdown } from '../rules/hit-locations.ts';
import { applyRollModeWhispers } from './roll-helpers.ts';

/** Minimal actor shape needed for damage assignment. */
export interface ActorLike {
    system: {
        armour: Record<string, { value: number; toughnessBonus: number }>;
        wounds: { value: number; critical: number };
        fatigue: { value: number };
    };
    hasTalent: (name: string) => boolean;
    update: (data: Record<string, unknown>) => Promise<unknown>;
    createEmbeddedDocuments: (type: string, data: Record<string, unknown>[]) => Promise<unknown>;
}

/** Minimal hit shape needed for damage assignment. */
interface HitLike {
    location: string;
    damageType: string;
    totalDamage: number;
    totalPenetration: number;
    totalFatigue: number;
}

export class AssignDamageData {
    locations = hitDropdown();
    actor: ActorLike;
    hit: HitLike;
    damageType = damageTypeDropdown();
    ignoreArmour = false;

    armour = 0;
    tb = 0;

    hasFatigueDamage = false;
    fatigueTaken = 0;

    hasDamage = false;
    damageTaken = 0;
    hasCriticalDamage = false;
    criticalDamageTaken = 0;
    criticalEffect = '';

    constructor(actor: ActorLike, hit: HitLike) {
        this.actor = actor;
        this.hit = hit;
    }

    update(): void {
        this.armour = 0;
        this.tb = 0;
        const location = this.hit?.location;
        if (location) {
            for (const [name, locationArmour] of Object.entries(this.actor.system.armour)) {
                if (location.replace(/\s/g, '').toUpperCase() === name.toUpperCase()) {
                    this.armour = locationArmour.value;
                    this.tb = locationArmour.toughnessBonus;
                }
            }
        }
    }

    async finalize(): Promise<void> {
        const totalDamage = Number(this.hit.totalDamage);
        const totalPenetration = Number(this.hit.totalPenetration);

        // Reduce Armour by Penetration
        let usableArmour = this.armour;
        usableArmour = usableArmour - totalPenetration;
        if (usableArmour < 0) {
            usableArmour = 0;
        }
        if (this.ignoreArmour) {
            usableArmour = 0;
        }

        const reduction = usableArmour + this.tb;
        const reducedDamage = totalDamage - reduction;
        // We have damage to process
        if (reducedDamage > 0) {
            // No Wounds Available
            if (this.actor.system.wounds.value <= 0) {
                // All applied as critical
                this.hasCriticalDamage = true;
                this.criticalDamageTaken = reducedDamage;
            } else {
                //Reduce Wounds First
                if (this.actor.system.wounds.value >= reducedDamage) {
                    // Only Wound Damage
                    this.damageTaken = reducedDamage;
                } else {
                    // Wound and Critical
                    this.damageTaken = this.actor.system.wounds.value;
                    this.hasCriticalDamage = true;
                    this.criticalDamageTaken = reducedDamage - this.damageTaken;
                }
            }
        }

        if (this.criticalDamageTaken > 0) {
            // Handle True Grit Talent
            if (this.actor.hasTalent('True Grit')) {
                // Reduces by Toughness Bonus to minimum of 1
                this.criticalDamageTaken = this.criticalDamageTaken - this.tb < 1 ? 1 : this.criticalDamageTaken - this.tb;
            }

            this.criticalEffect =
                (await getCriticalDamage(this.hit.damageType, this.hit.location, this.actor.system.wounds.critical + this.criticalDamageTaken)) ?? '';
        }

        if (this.hit.totalFatigue > 0) {
            this.hasFatigueDamage = true;
            this.fatigueTaken = this.hit.totalFatigue;
        }

        if (this.damageTaken > 0) {
            this.hasDamage = true;
        }
    }

    async performActionAndSendToChat(): Promise<void> {
        // Assign Damage - use dot notation to avoid overwriting sibling properties
        await this.actor.update({
            'system.wounds.value': this.actor.system.wounds.value - this.damageTaken,
            'system.wounds.critical': this.actor.system.wounds.critical + this.criticalDamageTaken,
            'system.fatigue.value': this.actor.system.fatigue.value + this.fatigueTaken,
        });
        game.wh40k.log('performActionAndSendToChat', this);

        // Create critical injury item if critical damage was taken
        if (this.hasCriticalDamage && this.criticalEffect) {
            await this._createCriticalInjuryItem();
        }

        const html = await foundry.applications.handlebars.renderTemplate(
            'systems/wh40k-rpg/templates/chat/assign-damage-chat.hbs',
            this as unknown as Record<string, unknown>,
        );
        const chatData: Record<string, unknown> = {
            user: game.user.id,
            rollMode: game.settings.get('core', 'rollMode'),
            content: html,
        };
        applyRollModeWhispers(chatData);
        await ChatMessage.create(chatData);
    }

    /**
     * Create a criticalInjury item on the actor from the critical damage.
     * @private
     */
    async _createCriticalInjuryItem(): Promise<void> {
        const severity = this.actor.system.wounds.critical + this.criticalDamageTaken;
        const clampedSeverity = Math.min(severity, 10);

        // Normalize location name
        let location = this.hit.location || 'body';
        if (location.toLowerCase().includes('arm')) location = 'Arm';
        else if (location.toLowerCase().includes('leg')) location = 'Leg';
        else if (location.toLowerCase().includes('head')) location = 'Head';
        else location = 'Body';

        // Normalize damage type
        const damageType = (this.hit.damageType || 'impact').toLowerCase();

        const itemData = {
            name: `Critical Injury - ${location} (${damageType.capitalize()})`,
            type: 'criticalInjury',
            system: {
                damageType: damageType,
                bodyPart: location.toLowerCase(),
                severity: clampedSeverity,
                effect: this.criticalEffect || '',
                permanent: clampedSeverity >= 8, // Severity 8+ typically permanent
                notes: `Taken at ${new Date().toLocaleString()}`,
            },
        };

        await this.actor.createEmbeddedDocuments('Item', [itemData]);
    }
}
