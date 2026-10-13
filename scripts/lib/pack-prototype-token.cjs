/* eslint-env node */
/**
 * Complete a compiled actor's partial `prototypeToken` before it is written.
 *
 * Pack sources author only the token fields that differ from the defaults
 * (`texture.src`, `ring`, a `tokenFrame` flag), and the compiler writes them raw.
 * Foundry's server runs its record migrations on any pack record without
 * `_stats.coreVersion` — which is every compiled record — and `migrateDepthAndLevel`
 * (core 14.353) sets `prototypeToken.depth = Math.min(width, height)`. With no
 * `width`/`height` on the record that is `NaN`, so the server then logs
 * `prototypeToken: depth: must be a number` for the actor and persists a rewrite.
 *
 * Writing the schema's own initial footprint (1 x 1 x 1) next to the authored
 * fields gives the migration real numbers. It changes no behaviour: loading the
 * record already cleans a missing footprint to exactly these values, and an actor
 * created from a compendium entry carries the cleaned token anyway.
 */

/** The `TokenDocument` schema's initial `width`, `height` and `depth`. */
const DEFAULT_TOKEN_FOOTPRINT = Object.freeze({ width: 1, height: 1, depth: 1 });

/**
 * The document with every missing token footprint field set to its schema
 * default. A document without a `prototypeToken` object is returned unchanged
 * (the server skips the token migration for it); authored values are kept.
 * @param {{ prototypeToken?: unknown }} doc - the resolved source document
 * @returns {object} the document, copied only when a field had to be added
 */
function withCompleteTokenFootprint(doc) {
    const token = doc.prototypeToken;
    if (token === null || typeof token !== 'object' || Array.isArray(token)) return doc;
    const missing = Object.entries(DEFAULT_TOKEN_FOOTPRINT).filter(([field]) => typeof token[field] !== 'number');
    if (missing.length === 0) return doc;
    return { ...doc, prototypeToken: { ...token, ...Object.fromEntries(missing) } };
}

module.exports = { DEFAULT_TOKEN_FOOTPRINT, withCompleteTokenFootprint };
