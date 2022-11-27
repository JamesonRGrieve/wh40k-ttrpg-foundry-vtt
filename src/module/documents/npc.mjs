import { DarkHeresyAcolyte } from './acolyte.mjs';

export class DarkHeresyNPC extends DarkHeresyAcolyte {

    get faction() {
        return this.system.faction;
    }

    get subfaction() {
        return this.system.subfaction;
    }

    get subtype() {
        return this.system.type;
    }

    get threatLevel() {
        return this.system.threatLevel;
    }

}
