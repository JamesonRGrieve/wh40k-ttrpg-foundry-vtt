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

/** Validate one `_source` document; returns human-readable error strings ([] when clean). */
export declare function validateDoc(doc: unknown): string[];
