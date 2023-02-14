import { hitDropdown } from '../rules/hit-locations.mjs';
import { getCriticalDamage } from '../rules/critical-damage.mjs';
import { damageTypeDropdown } from '../rules/damage-type.mjs';

export class AssignDamageData {
    locations = hitDropdown();
    actor;
    hit;
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

    constructor(actor, hit) {
        this.actor = actor;
        this.hit = hit;
    }

    async update() {
        this.armour = 0;
        this.tb = 0;
        const location = this.hit?.location;
        if(location) {
            for(const [name, locationArmour] of Object.entries(this.actor.system.armour)) {
                if(location.replace(/\s/g, "").toUpperCase() === name.toUpperCase()) {
                    this.armour = locationArmour.value;
                    this.tb = locationArmour.toughnessBonus;
                }
            }
        }
    }

    async finalize() {
        let totalDamage = Number.parseInt(this.hit.totalDamage);
        let totalPenetration = Number.parseInt(this.hit.totalPenetration);

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
        if(reducedDamage > 0) {
            // No Wounds Available
            if(this.actor.system.wounds.value <= 0) {
                // All applied as critical
                this.hasCriticalDamage = true;
                this.criticalDamageTaken = reducedDamage;
            } else {
                //Reduce Wounds First
                if(this.actor.system.wounds.value >= reducedDamage) {
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

        if(this.criticalDamageTaken > 0) {
            this.criticalEffect = getCriticalDamage(this.hit.damageType, this.hit.location, this.actor.system.wounds.critical + this.criticalDamageTaken);
        }

        if(this.hit.totalFatigue > 0) {
            this.hasFatigueDamage = true;
            this.fatigueTaken = this.hit.totalFatigue;
        }

        if(this.damageTaken > 0){
            this.hasDamage = true;
        }
    }

    async performActionAndSendToChat() {
        // Assign Damage
        this.actor = await this.actor.update({
            system: {
                wounds: {
                    value: this.actor.system.wounds.value - this.damageTaken,
                    critical: this.actor.system.wounds.critical + this.criticalDamageTaken,
                },
                fatigue: {
                    value: this.actor.system.fatigue.value + this.fatigueTaken
                }
            }
        });
        game.dh.log('performActionAndSendToChat', this)

        const html = await renderTemplate('systems/dark-heresy-2nd/templates/chat/assign-damage-chat.hbs', this);
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
}
