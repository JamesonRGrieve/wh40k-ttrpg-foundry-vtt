/**
 * Canonical location-type slugs, ordered largest → smallest spatial scale.
 *
 * Content-agnostic enum of place kinds (not content data) — shared by the
 * {@link LocationData} schema and the location sheet's type selector so the
 * sheet never imports the data model directly (3-layer separation).
 */
export const LOCATION_TYPE_SLUGS = [
    'sector',
    'subsector',
    'system',
    'star',
    'planet',
    'moon',
    'continent',
    'region',
    'settlement',
    'district',
    'site',
    'structure',
    'vessel',
    'station',
    'realm',
    'other',
] as const;

export type LocationTypeSlug = (typeof LOCATION_TYPE_SLUGS)[number];
