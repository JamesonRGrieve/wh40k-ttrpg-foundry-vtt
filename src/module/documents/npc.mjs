import { WH40KAcolyte } from './acolyte.mjs';

export class WH40KNPC extends WH40KAcolyte {

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
