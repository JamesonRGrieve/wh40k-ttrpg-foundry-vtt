/**
 * Build-time Adventure resolver.
 *
 * Turns the DRY `_source` adventure docs in `*-adventures` packs into true
 * Foundry V14 Adventure documents (per `common/documents/adventure.mjs`): the
 * Adventure's `journal` / `scenes` / `actors` / `items` / `tables` SetFields
 * carry full COPIES of the documents the scenario references.
 *
 * Source stays DRY — an adventure source file references its NPCs/items/maps
 * by Compendium UUID (on the scenario flag) and carries its handout journal
 * entries inline (handout prose is unique to the adventure, not referenced).
 * Only the COMPILED output embeds copies.
 *
 * Mirrors the reference-stub resolution pattern in `gulpfile.js`
 * (`resolvePackSourceDocument`): the resolver runs before the LevelDB write, so
 * Foundry receives a normal expanded Adventure document object.
 *
 * Hooked from `gulpfile.js`'s `compilePacks`: for any pack whose folder name
 * ends in `-adventures`, each source doc is passed through `resolveAdventure`
 * before `db.put`.
 */

const fs = require('fs');
const path = require('path');

const COMPENDIUM_PREFIX = 'Compendium.wh40k-rpg.';

/** Foundry document `type`-segment → Adventure SetField + matching pack collection. */
const UUID_CLASS_TO_ADVENTURE_FIELD = {
    Actor: { field: 'actors', collection: 'actors' },
    Item: { field: 'items', collection: 'items' },
    Scene: { field: 'scenes', collection: 'scenes' },
    JournalEntry: { field: 'journal', collection: 'journal' },
    RollTable: { field: 'tables', collection: 'tables' },
};

/** Top-level Adventure schema fields we surface from a source doc verbatim. */
const ADVENTURE_PASSTHROUGH_FIELDS = ['_id', 'name', 'img', 'caption', 'description', 'sort', 'folder', 'flags', '_stats'];

/** Adventure embedded-content SetFields, all initialised to empty arrays. */
const ADVENTURE_CONTENT_FIELDS = ['actors', 'combats', 'items', 'journal', 'scenes', 'tables', 'macros', 'cards', 'playlists', 'folders'];

/**
 * Build a global index of every pack `_source` document, keyed by its
 * Compendium UUID (`Compendium.wh40k-rpg.<pack>.<Class>.<id>`).
 *
 * The pack name is the leaf dir under `src/packs/<group>/<pack>`; the document
 * class is inferred from the pack's collection type (same detection the
 * gulpfile uses). Source filenames are slugs, not ids — so we read every file
 * and key by its `_id`. Reference stubs are resolved through `resolveSource`
 * so a stubbed doc still indexes under its own pack's UUID.
 *
 * @param {string} packsRoot absolute path to `src/packs`
 * @param {(filePath: string) => object} resolveSource resolve a source file
 *   (handles reference-stub chains; reuse the gulpfile's resolver)
 * @returns {Map<string, {doc: object, packName: string, collection: string}>}
 */
function buildUuidIndex(packsRoot, resolveSource) {
    const index = new Map();
    for (const group of fs.readdirSync(packsRoot)) {
        const groupPath = path.join(packsRoot, group);
        if (!fs.statSync(groupPath).isDirectory()) continue;
        for (const packName of fs.readdirSync(groupPath)) {
            const sourceDir = path.join(groupPath, packName, '_source');
            if (!fs.existsSync(sourceDir)) continue;
            const collection = collectionForPack(packName);
            const uuidClass = COLLECTION_TO_UUID_CLASS[collection];
            if (!uuidClass) continue; // adventures themselves are not referenceable content
            for (const file of fs.readdirSync(sourceDir)) {
                if (!file.endsWith('.json')) continue;
                const filePath = path.join(sourceDir, file);
                let doc;
                try {
                    doc = resolveSource(filePath);
                } catch (err) {
                    // A broken reference chain elsewhere should not abort indexing.
                    console.warn(`[adventures] skipping unindexable source ${filePath}: ${err.message}`);
                    continue;
                }
                if (!doc || typeof doc._id !== 'string' || doc._id.length === 0) continue;
                const uuid = `${COMPENDIUM_PREFIX}${packName}.${uuidClass}.${doc._id}`;
                index.set(uuid, { doc, packName, collection });
            }
        }
    }
    return index;
}

/** Same folder→collection mapping the gulpfile uses, plus adventures + scenes. */
function collectionForPack(folder) {
    const segment = (name) => new RegExp(`(^|-)${name}(-|$)`).test(folder);
    if (segment('adventures')) return 'adventures';
    if (segment('actors')) return 'actors';
    if (segment('scenes')) return 'scenes';
    if (segment('items')) return 'items';
    if (segment('journals')) return 'journal';
    if (segment('rolltables')) return 'tables';
    return 'items';
}

/** Collection → the UUID class segment used in `Compendium.wh40k-rpg.<pack>.<Class>.<id>`. */
const COLLECTION_TO_UUID_CLASS = {
    actors: 'Actor',
    items: 'Item',
    journal: 'JournalEntry',
    tables: 'RollTable',
    scenes: 'Scene',
};

/** Find the scenario flag payload on any of an adventure's journal-entry pages. */
function findScenario(journalEntries) {
    for (const entry of journalEntries) {
        for (const page of entry.pages ?? []) {
            const scenario = page?.flags?.['wh40k-rpg']?.scenario ?? page?.flags?.wh40k?.scenario;
            if (scenario) return scenario;
        }
    }
    return null;
}

/** Collect every Compendium UUID a scenario references, grouped by Adventure field. */
function collectScenarioUuids(scenario) {
    /** @type {Record<string, Set<string>>} */
    const byField = { actors: new Set(), items: new Set(), scenes: new Set() };
    for (const scene of scenario?.scenes ?? []) {
        if (typeof scene.sceneUuid === 'string') byField.scenes.add(scene.sceneUuid);
        for (const enc of scene.encounters ?? []) {
            if (typeof enc.actorUuid === 'string') byField.actors.add(enc.actorUuid);
        }
        for (const rew of scene.rewards ?? []) {
            if (typeof rew.itemUuid === 'string') byField.items.add(rew.itemUuid);
        }
    }
    return byField;
}

/**
 * Resolve a DRY adventure source doc into a true Foundry Adventure document.
 *
 * - Inline `journal[]` entries (handout + GM-scenario pages) are carried into
 *   the Adventure's `journal` set as-is (legacy `pages[]`-on-the-Adventure
 *   shape is normalised into a single wrapping JournalEntry first).
 * - Every Compendium UUID the scenario references is resolved against the
 *   global index and a COPY embedded into the matching content set
 *   (`actors` / `items` / `scenes`). Already-embedded ids are de-duplicated.
 * - The scenario flag is left UUID-referenced on the GM journal page (it is
 *   the machine-readable graph, not a duplication target).
 *
 * Unresolved UUIDs are reported (warn) and skipped — the build never fails on
 * a dangling reference (consistent with the gulpfile's warn-only validation),
 * so the adventure still imports with whatever resolved.
 *
 * @param {object} source the raw adventure source doc
 * @param {Map} uuidIndex the global UUID→source index
 * @param {string} sourceLabel a human label for warnings (file path)
 * @returns {object} the resolved Adventure document object
 */
function resolveAdventure(source, uuidIndex, sourceLabel) {
    const adventure = {};
    for (const key of ADVENTURE_PASSTHROUGH_FIELDS) {
        if (source[key] !== undefined) adventure[key] = source[key];
    }
    adventure.type = 'Adventure';
    for (const field of ADVENTURE_CONTENT_FIELDS) {
        adventure[field] = [];
    }

    const journalEntries = normaliseJournal(source);
    adventure.journal = journalEntries;

    const scenario = findScenario(journalEntries);
    if (!scenario) {
        console.warn(`[adventures] ${sourceLabel}: no scenario flag found on any journal page`);
        return adventure;
    }

    const refs = collectScenarioUuids(scenario);
    const seen = { actors: new Set(), items: new Set(), scenes: new Set() };
    const missing = [];

    for (const [adventureField, uuids] of Object.entries(refs)) {
        for (const uuid of uuids) {
            const entry = uuidIndex.get(uuid);
            if (!entry) {
                missing.push(uuid);
                continue;
            }
            const target = UUID_CLASS_TO_ADVENTURE_FIELD[COLLECTION_TO_UUID_CLASS[entry.collection]];
            if (!target) {
                missing.push(uuid);
                continue;
            }
            // Embed a deep COPY, keyed by the resolved doc's own id, de-duped.
            const copy = JSON.parse(JSON.stringify(entry.doc));
            const id = copy._id;
            if (seen[target.field].has(id)) continue;
            seen[target.field].add(id);
            adventure[target.field].push(copy);
        }
    }

    if (missing.length) {
        console.warn(
            `[adventures] ${sourceLabel}: ${missing.length} unresolved UUID reference(s) skipped:\n  ` +
                missing.join('\n  '),
        );
    }

    const counts = ADVENTURE_CONTENT_FIELDS.filter((f) => adventure[f].length).map(
        (f) => `${f}=${adventure[f].length}`,
    );
    console.log(`[adventures] ${sourceLabel}: embedded ${counts.join(', ') || '(no content)'}`);

    return adventure;
}

/**
 * Normalise a source doc's journal content into an array of JournalEntry
 * documents for the Adventure `journal` set.
 *
 * Two accepted source shapes:
 *  1. Canonical DRY shape: `source.journal` is already an array of
 *     JournalEntry docs (each with its own `pages[]`).
 *  2. Legacy shape: `pages[]` sit directly on the Adventure doc (the doc is a
 *     JournalEntry-misshape). These are wrapped into a single JournalEntry
 *     named after the adventure.
 */
function normaliseJournal(source) {
    if (Array.isArray(source.journal) && source.journal.length) {
        return source.journal.map((entry) => JSON.parse(JSON.stringify(entry)));
    }
    if (Array.isArray(source.pages) && source.pages.length) {
        return [
            {
                _id: deriveJournalId(source._id),
                name: source.name,
                pages: JSON.parse(JSON.stringify(source.pages)),
                folder: null,
                sort: 0,
                ownership: source.ownership ?? { default: 0 },
                flags: {},
            },
        ];
    }
    return [];
}

/**
 * Derive a stable 16-char JournalEntry id for the legacy-wrap case, from the
 * adventure id. Foundry requires exactly 16 alphanumerics.
 */
function deriveJournalId(adventureId) {
    const base = String(adventureId ?? '').replace(/[^a-zA-Z0-9]/g, '');
    const seed = (base + 'JournalEntry0000').slice(0, 16);
    return seed.padEnd(16, '0').slice(0, 16);
}

module.exports = {
    COMPENDIUM_PREFIX,
    buildUuidIndex,
    collectionForPack,
    resolveAdventure,
    findScenario,
    collectScenarioUuids,
    normaliseJournal,
};
