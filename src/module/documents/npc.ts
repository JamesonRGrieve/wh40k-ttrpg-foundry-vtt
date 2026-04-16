import { WH40KAcolyte } from './acolyte.ts';

export class WH40KNPC extends WH40KAcolyte {
    [key: string]: any;
    get faction(): string {
        return this.system.faction;
    }

    get subfaction(): string {
        return this.system.subfaction;
    }

    get subtype(): string {
        return this.system.type;
    }

    get threatLevel(): string {
        return this.system.threatLevel;
    }
}
