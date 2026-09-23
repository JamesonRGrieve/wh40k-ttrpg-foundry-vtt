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

/** A schema accepting a scalar OR a per-line / per-book variant container of it. */
export declare function variant(inner: ZodTypeAny): ZodTypeAny;

export declare const weaponSystemSchema: ZodTypeAny;
export declare const vehicleTraitSystemSchema: ZodTypeAny;
export declare const SYSTEM_SCHEMAS: Record<string, ZodTypeAny>;
export declare const documentEnvelope: ZodTypeAny;

/** Validate one `_source` document; returns human-readable error strings ([] when clean). */
export declare function validateDoc(doc: unknown): string[];
