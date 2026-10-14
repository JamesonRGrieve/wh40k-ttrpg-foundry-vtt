/**
 * Type declarations for `pack-icon-map.mjs`, so the unit test (and any TS
 * consumer) imports the icon table and resolver fully typed.
 */

export interface PackIconPatternRule {
    pattern: string;
    role: string;
}

export interface PackIconAuthor {
    name: string;
    url: string;
}

export interface PackIconRules {
    conditionName: Record<string, string>;
    itemTypeDefault: Record<string, string>;
    actorTypeSuffixDefault: Record<string, string>;
    untypedDefault: string;
    weaponNaturalName: PackIconPatternRule[];
    weaponType: Record<string, string>;
    weaponExplosive: { thrown: string; otherwise: string };
    weaponName: PackIconPatternRule[];
    weaponClass: Record<string, string>;
    armourType: Record<string, string>;
    talentAptitude: PackIconPatternRule[];
    talentCategory: Record<string, string>;
    psychicDiscipline: PackIconPatternRule[];
    shipComponentType: Record<string, string>;
}

export interface PackIconTable {
    cdn: string;
    licence: string;
    licenceUrl: string;
    authors: Record<string, PackIconAuthor>;
    icons: Record<string, string>;
    rules: PackIconRules;
}

export interface PackIconDoc {
    name?: unknown;
    type?: unknown;
    system?: unknown;
}

export declare const ICON_TABLE: PackIconTable;
export declare function iconUrl(role: string): string;
export declare function isGameIconUrl(img: unknown): boolean;
export declare function iconRoleFor(doc: PackIconDoc): string;
export declare function iconUrlFor(doc: PackIconDoc): string;
