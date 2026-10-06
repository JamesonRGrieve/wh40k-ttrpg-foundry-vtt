/* eslint-env node */
/**
 * Split a compiled pack document into the LevelDB records Foundry V14 reads.
 *
 * A V14 compendium stores every embedded document in its own sublevel, not
 * inline in its parent. The parent record holds only the embedded ids. On load,
 * the server expands each id from the sublevel named after the path to the
 * collection (`items.effects`, `actors.items.effects`, `journal.pages`, …), keyed
 * by the ancestor ids joined with dots. An array of inline OBJECTS is read as ids,
 * finds nothing, and is dropped with only a server-log warning. That is how every
 * psychic power's ActiveEffects, every journal page and every table result went
 * missing from the compiled packs.
 *
 * `EMBEDDED_HIERARCHY` mirrors the server's document hierarchy for the
 * collections this system compiles. A collection absent from it (adventures,
 * whose content sets are plain fields, and scenes) is written whole, as before.
 */

/**
 * Embedded collections per pack collection, nested as the server nests them.
 * @type {Readonly<Record<string, Readonly<Record<string, object>>>>}
 */
const EMBEDDED_HIERARCHY = Object.freeze({
    actors: Object.freeze({ items: Object.freeze({ effects: Object.freeze({}) }), effects: Object.freeze({}) }),
    items: Object.freeze({ effects: Object.freeze({}) }),
    journal: Object.freeze({ pages: Object.freeze({}), categories: Object.freeze({}) }),
    tables: Object.freeze({ results: Object.freeze({}) }),
});

/**
 * The records one document compiles to: the document itself under
 * `!<collection>!<id>`, with each embedded collection replaced by its ids, and
 * every embedded document (recursively) under `!<sublevel>!<ancestor ids>.<id>`.
 * An embedded entry without a string `_id` cannot be keyed and is reported in
 * `skipped` rather than written.
 * @param {string} collection - the pack's collection (`items`, `actors`, `journal`, …)
 * @param {{ _id: string }} doc - the resolved source document
 * @returns {{ records: Array<{ key: string, value: { _id: string } }>, skipped: string[] }}
 */
function packRecords(collection, doc) {
    const records = [];
    const skipped = [];

    const split = (sublevel, idPath, source, hierarchy) => {
        const value = { ...source };
        for (const [field, childHierarchy] of Object.entries(hierarchy)) {
            const embedded = value[field];
            if (!Array.isArray(embedded)) continue;
            const ids = [];
            for (const child of embedded) {
                const childId = child !== null && typeof child === 'object' ? child._id : undefined;
                if (typeof childId !== 'string' || childId === '') {
                    skipped.push(`${sublevel}.${field} in ${idPath}`);
                    continue;
                }
                split(`${sublevel}.${field}`, `${idPath}.${childId}`, child, childHierarchy);
                ids.push(childId);
            }
            value[field] = ids;
        }
        records.push({ key: `!${sublevel}!${idPath}`, value });
    };

    split(collection, doc._id, doc, EMBEDDED_HIERARCHY[collection] ?? {});
    return { records, skipped };
}

module.exports = { EMBEDDED_HIERARCHY, packRecords };
