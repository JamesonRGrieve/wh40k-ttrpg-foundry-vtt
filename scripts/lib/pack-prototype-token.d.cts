/**
 * Type declarations for `pack-prototype-token.cjs`, the gulp pack compiler's
 * token-footprint completion. Hand-written so the consuming `.ts` tests are
 * typed under `tsconfig.test.json` without `allowJs`.
 */

export const DEFAULT_TOKEN_FOOTPRINT: Readonly<{ width: number; height: number; depth: number }>;

export function withCompleteTokenFootprint<T extends object>(doc: T): T;
