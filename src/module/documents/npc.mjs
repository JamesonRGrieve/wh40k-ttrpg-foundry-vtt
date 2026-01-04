import { RogueTraderAcolyte } from './acolyte.mjs';

export class RogueTraderNPC extends RogueTraderAcolyte {

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
