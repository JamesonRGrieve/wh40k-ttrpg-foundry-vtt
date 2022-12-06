import { hitDropdown } from '../rules/hit-locations.mjs';

export class AssignDamageData {
    locations = hitDropdown();
    actor;
    hit;

    armour = 0;
    tb = 0;

    constructor(actor, hit) {
        this.actor = actor;
        this.hit = hit;
    }

    async update() {
        const location = this.hit?.location;
        if(location) {
            for(const [name, locationArmour] of Object.entries(this.actor.system.armour)) {
                if(location.toUpperCase() === name.toUpperCase()) {
                    this.armour = locationArmour.value;
                    this.tb = locationArmour.toughnessBonus;
                }
            }
        }
    }

    async finalize() {

    }

    async performActionAndSendToChat() {
        game.dh.log('performActionAndSendToChat', this)
    }
}
