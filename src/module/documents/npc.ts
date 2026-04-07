import { WH40KAcolyte } from './acolyte.ts';

export class WH40KNPC extends WH40KAcolyte {
    get faction(): any {
        return this.system.faction;
    }

    get subfaction(): any {
        return this.system.subfaction;
    }

    get subtype(): any {
        return this.system.type;
    }

    get threatLevel(): any {
        return this.system.threatLevel;
    }
}
