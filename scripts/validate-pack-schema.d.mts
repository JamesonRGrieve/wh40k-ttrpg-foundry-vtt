/**
 * Type declarations for the runnable `validate-pack-schema.mjs` gate, so the
 * unit test (and any TS consumer) imports it fully typed.
 */
import type { ZodTypeAny } from 'zod';

export declare const LINES: readonly string[];
export declare const WEAPON_CLASS: readonly string[];
export declare const WEAPON_TYPE: readonly string[];
export declare const ATTACK_KIND: readonly string[];
export declare const CREW_EXPOSURE: readonly string[];
export declare const DAMAGE_TYPE: readonly string[];
export declare const DAMAGE_SOURCE: readonly string[];
export declare const ROLL_TABLE_UUID: RegExp;
export declare const RIDER_TEST_CHARACTERISTIC: readonly string[];
export declare const RIDER_DURATION_KIND: readonly string[];
export declare const RIDER_AREA_MEASURE: readonly string[];
export declare const RIDER_AFFECTS: readonly string[];
export declare const RIDER_CONDITION_ID: RegExp;

/** A schema accepting a scalar OR a per-line / per-book variant container of it. */
export declare function variant(inner: ZodTypeAny): ZodTypeAny;

export declare const damageBandShape: ZodTypeAny;
export declare const damageProfileShape: ZodTypeAny;
export declare const tableResultDamageShape: ZodTypeAny;
export declare const grenadeRiderShape: ZodTypeAny;
export declare const weaponSystemSchema: ZodTypeAny;
export declare const vehicleTraitSystemSchema: ZodTypeAny;
export declare const SYSTEM_SCHEMAS: Record<string, ZodTypeAny>;
export declare const documentEnvelope: ZodTypeAny;

/** Paths to the unlicensed, unserved icon packs (`_vendored-ui`, #625). */
export declare const UNLICENSED_ART: RegExp;

/** Pointer paths of every string in `node` that references {@link UNLICENSED_ART}. */
export declare function unlicensedArtPaths(node: unknown, at?: string): string[];

/** Foundry's `CONST.IMAGE_FILE_EXTENSIONS`, mirrored (#626). */
export declare const IMAGE_FILE_EXTENSIONS: readonly string[];

/** Pointer paths of every image field whose path lacks an allowed image extension (#626). */
export declare function extensionlessImagePaths(node: unknown, at?: string, parentKey?: string): string[];

/** `system.json` `documentTypes`: the sub-types registered per document class. */
export type DocumentTypes = Record<string, Record<string, unknown>>;

/** Errors for a `type` (or an Actor's embedded `items[].type`) the system does not register (#136). */
export declare function unregisteredTypeIssues(doc: unknown, documentClass: string | undefined, documentTypes: DocumentTypes): string[];

/** Validate one `_source` document; returns human-readable error strings ([] when clean). */
export declare function validateDoc(doc: unknown, context?: { documentClass?: string | undefined; documentTypes?: DocumentTypes }): string[];
