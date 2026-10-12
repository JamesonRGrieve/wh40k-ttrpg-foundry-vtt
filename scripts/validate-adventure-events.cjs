/**
 * Build-time validator for Adventure event graphs (#592).
 *
 * An Adventure's scenario flag (`flags['wh40k-rpg'].scenario` on its GM journal
 * page, see docs/pack-authoring.md → Adventures) may carry an `eventGraph` in the
 * Event Tracker's own event shape (`EventDef` in
 * src/module/managers/event-graph.ts). The tracker loads it on import, so a
 * malformed graph would surface as an event that never unlocks, a trigger that
 * never fires, or a dead journal link — silently, at the table. This validator
 * fails the pack build instead (`gulp packs` throws on any error), on:
 *
 * - dangling event ids (requirements, excuses, `event-resolved` triggers,
 *   disposition triggers, relationship influences);
 * - unknown trigger kinds, unknown fields, and missing required fields;
 * - status ids no condition in the compiled packs declares
 *   (`system.identifier` of a `type: condition` document, plus core's `dead`);
 * - references that are not `{uuid}` (a bare name is never valid in a pack), or
 *   whose UUID resolves neither in the compiled packs nor to one of the
 *   Adventure's own documents.
 *
 * `COMPLETION_TRIGGER_FIELDS` mirrors the TypeScript table of the same name in
 * event-graph.ts; tests/validate-adventure-events.test.ts holds them equal.
 */

'use strict';

const { iterPackJson } = require('./lib/iter-pack-json.cjs');
const { COMPENDIUM_PREFIX, collectionForPack, collectScenarioUuids, findScenario, normaliseJournal } = require('./resolve-adventures.cjs');

/** Required and optional fields per trigger kind (mirror of event-graph.ts `COMPLETION_TRIGGER_FIELDS`). */
const COMPLETION_TRIGGER_FIELDS = {
    'item-acquired': { required: ['item'], optional: ['holder'] },
    'actor-died': { required: ['actor'], optional: [] },
    'actor-status': { required: ['actor', 'status', 'change'], optional: [] },
    'scene-entered': { required: ['location'], optional: [] },
    'event-resolved': { required: ['event'], optional: [] },
};

/** Options every trigger kind may carry (mirror of event-graph.ts `TRIGGER_OPTION_FIELDS`). */
const TRIGGER_OPTION_FIELDS = ['ignoreRequirements'];

/** The holder keyword meaning "any player character". */
const PARTY = 'party';

/** Foundry core's death status, kept beside the condition catalogue (`DEAD_STATUS_ID`). */
const CORE_STATUS_IDS = ['dead'];

const STATUS_CHANGES = ['gained', 'lost'];

/** Scenario ids namespace their events (`<id>:<event>`), so they are slugs. */
const SCENARIO_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Event ids and character keys: no `:` (the namespace separator), no spaces. */
const LOCAL_ID_RE = /^[A-Za-z0-9_-]+$/;

const DOC_ID = '[A-Za-z0-9]{16}';

/** `Compendium.wh40k-rpg.<pack>.<Class>.<id>[.JournalEntryPage.<id>]`. */
const COMPENDIUM_REF_RE = new RegExp(`^Compendium\\.wh40k-rpg\\.([a-z0-9-]+)\\.(Actor|Item|Scene|JournalEntry|RollTable)\\.(${DOC_ID})(?:\\.JournalEntryPage\\.(${DOC_ID}))?$`);

/** An adventure-internal ref: one of the Adventure's own Actors, Scenes or JournalEntries (import keeps ids). */
const INTERNAL_REF_RE = new RegExp(`^(Actor|Scene|JournalEntry)\\.(${DOC_ID})(?:\\.JournalEntryPage\\.(${DOC_ID}))?$`);

/** The document classes each reference field may name. A page counts as its JournalEntry's class `JournalEntryPage`. */
const REF_CLASSES = {
    source: ['JournalEntry', 'JournalEntryPage'],
    location: ['Scene', 'JournalEntry', 'JournalEntryPage'],
    initiates_quest: ['JournalEntry', 'JournalEntryPage'],
    actor: ['Actor'],
    item: ['Item'],
    holder: ['Actor'],
    triggerLocation: ['Scene'],
    character: ['Actor'],
};

const EVENT_FIELDS = new Set([
    'id',
    'name',
    'source',
    'location',
    'day',
    'act',
    'requires',
    'requires_any',
    'excuse',
    'is_day_end',
    'branch',
    'completion',
    'initiates_quest',
]);
const GRAPH_FIELDS = new Set(['events', 'characters']);
const CHARACTER_FIELDS = new Set(['actor', 'dispositions', 'relationships']);
const DISPOSITION_FIELDS = new Set(['target', 'attitude', 'default', 'trigger', 'note']);
const RELATIONSHIP_FIELDS = new Set(['target', 'type', 'state', 'summary', 'is_private', 'influences']);
const INFLUENCE_FIELDS = new Set(['event', 'to', 'note']);

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function isNonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0;
}

/**
 * Every condition status id the compiled packs declare, plus core's `dead`.
 * @param {Map<string, {doc: object}>} uuidIndex the global UUID → source index
 */
function conditionStatusIds(uuidIndex) {
    const ids = new Set(CORE_STATUS_IDS);
    for (const { doc } of uuidIndex.values()) {
        const identifier = doc?.type === 'condition' ? doc.system?.identifier : undefined;
        if (nonEmptyString(identifier)) ids.add(identifier);
    }
    return ids;
}

/** The pack ref (without any page part) a compendium UUID names. */
function compendiumDocUuid(match) {
    return `${COMPENDIUM_PREFIX}${match[1]}.${match[2]}.${match[3]}`;
}

/**
 * The world-relative UUIDs of the Adventure's own documents once imported:
 * its inline journal entries (and their pages), and every compendium document
 * the build embeds a copy of (`collectScenarioUuids`) — the import keeps the
 * copy's id.
 */
function adventureOwnDocuments(journalEntries, scenario, uuidIndex) {
    const own = new Set();
    for (const entry of journalEntries) {
        if (!nonEmptyString(entry?._id)) continue;
        own.add(`JournalEntry.${entry._id}`);
        for (const page of entry.pages ?? []) {
            if (nonEmptyString(page?._id)) own.add(`JournalEntry.${entry._id}.JournalEntryPage.${page._id}`);
        }
    }
    for (const uuids of Object.values(collectScenarioUuids(scenario))) {
        for (const uuid of uuids) {
            const entry = uuidIndex.get(uuid);
            if (entry === undefined) continue;
            const [documentClass, id] = uuid.split('.').slice(-2);
            own.add(`${documentClass}.${id}`);
            if (documentClass !== 'JournalEntry') continue;
            for (const page of entry.doc.pages ?? []) {
                if (nonEmptyString(page?._id)) own.add(`JournalEntry.${id}.JournalEntryPage.${page._id}`);
            }
        }
    }
    return own;
}

/** Whether a compendium UUID (possibly a page) resolves in the compiled packs. */
function compendiumRefResolves(match, uuidIndex) {
    const entry = uuidIndex.get(compendiumDocUuid(match));
    if (entry === undefined) return false;
    if (match[4] === undefined) return true;
    return (entry.doc.pages ?? []).some((page) => page?._id === match[4]);
}

/**
 * Validate one Adventure's scenario `eventGraph`. Returns the error messages
 * (empty when valid, or when the scenario carries no event graph).
 *
 * @param {object} scenario the scenario flag payload
 * @param {{ own: Set<string>, uuidIndex: Map<string, {doc: object}>, statuses: Set<string> }} ctx
 *   `own`: the Adventure's own world-relative UUIDs ({@link adventureOwnDocuments});
 *   `uuidIndex`: the compiled packs' UUID index; `statuses`: {@link conditionStatusIds}.
 * @returns {string[]}
 */
function validateEventGraph(scenario, ctx) {
    const errors = [];
    if (!isPlainObject(scenario) || scenario.eventGraph === undefined) return errors;
    const err = (where, message) => errors.push(`${where}: ${message}`);

    if (!nonEmptyString(scenario.id) || !SCENARIO_ID_RE.test(scenario.id)) {
        err('scenario.id', `must be a lowercase slug (it namespaces the events), got ${JSON.stringify(scenario.id)}`);
    }
    const graph = scenario.eventGraph;
    if (!isPlainObject(graph) || !isPlainObject(graph.events)) {
        err('eventGraph', 'must be an object with an `events` map');
        return errors;
    }
    for (const key of Object.keys(graph)) {
        if (!GRAPH_FIELDS.has(key)) err('eventGraph', `unknown field "${key}"`);
    }

    const eventIds = new Set(Object.keys(graph.events));
    const checkEventId = (where, id) => {
        if (typeof id !== 'string' || !eventIds.has(id)) err(where, `dangling event id ${JSON.stringify(id)}`);
    };
    const unknownFields = (where, value, allowed) => {
        for (const key of Object.keys(value)) {
            if (!allowed.has(key)) err(where, `unknown field "${key}"`);
        }
    };

    /** A `{uuid}` reference of one of `classes`. */
    const checkRef = (where, ref, classes) => {
        if (!isPlainObject(ref) || Object.keys(ref).length !== 1 || typeof ref.uuid !== 'string') {
            err(where, `must be a {uuid} reference (a Compendium UUID or one of the Adventure's own documents), got ${JSON.stringify(ref)}`);
            return;
        }
        const uuid = ref.uuid;
        const compendium = COMPENDIUM_REF_RE.exec(uuid);
        const internal = compendium === null ? INTERNAL_REF_RE.exec(uuid) : null;
        if (compendium === null && internal === null) {
            err(where, `${uuid} is neither a wh40k-rpg Compendium UUID nor an adventure-internal Actor / Scene / JournalEntry UUID`);
            return;
        }
        const pageRef = compendium === null ? internal[3] !== undefined : compendium[4] !== undefined;
        const documentClass = pageRef ? 'JournalEntryPage' : compendium === null ? internal[1] : compendium[2];
        if (!classes.includes(documentClass)) {
            err(where, `${uuid} is a ${documentClass}; expected ${classes.join(' or ')}`);
            return;
        }
        const resolves = compendium === null ? ctx.own.has(uuid) : compendiumRefResolves(compendium, ctx.uuidIndex);
        if (!resolves) {
            err(where, compendium === null ? `${uuid} is not one of the Adventure's own documents` : `${uuid} does not resolve in the compiled packs`);
        }
    };

    const checkRequirement = (where, node) => {
        if (node === null) return;
        if (typeof node === 'string') {
            checkEventId(where, node);
            return;
        }
        if (!isPlainObject(node)) {
            err(where, `invalid requirement ${JSON.stringify(node)}`);
            return;
        }
        if (Array.isArray(node.all) || Array.isArray(node.any)) {
            const op = Array.isArray(node.all) ? 'all' : 'any';
            if (Object.keys(node).length !== 1) err(where, `a {${op}} group takes no other field`);
            node[op].forEach((child, n) => checkRequirement(`${where}.${op}[${n}]`, child));
            return;
        }
        if (isPlainObject(node.char)) {
            unknownFields(where, node, new Set(['char', 'who']));
            return;
        }
        err(where, `invalid requirement ${JSON.stringify(node)}`);
    };

    const checkTrigger = (where, trigger) => {
        if (!isPlainObject(trigger)) {
            err(where, `trigger must be an object, got ${JSON.stringify(trigger)}`);
            return;
        }
        if (typeof trigger.kind !== 'string' || !Object.hasOwn(COMPLETION_TRIGGER_FIELDS, trigger.kind)) {
            err(where, `unknown trigger kind ${JSON.stringify(trigger.kind)} (known: ${Object.keys(COMPLETION_TRIGGER_FIELDS).join(', ')})`);
            return;
        }
        const fields = COMPLETION_TRIGGER_FIELDS[trigger.kind];
        const allowed = new Set(['kind', ...fields.required, ...fields.optional, ...TRIGGER_OPTION_FIELDS]);
        for (const key of Object.keys(trigger)) {
            if (!allowed.has(key)) err(where, `${trigger.kind} trigger has unknown field "${key}"`);
        }
        for (const key of fields.required) {
            if (trigger[key] === undefined) err(where, `${trigger.kind} trigger is missing "${key}"`);
        }
        if (trigger.ignoreRequirements !== undefined && typeof trigger.ignoreRequirements !== 'boolean') {
            err(`${where}.ignoreRequirements`, 'must be true or false');
        }
        if (trigger.item !== undefined) checkRef(`${where}.item`, trigger.item, REF_CLASSES.item);
        if (trigger.actor !== undefined) checkRef(`${where}.actor`, trigger.actor, REF_CLASSES.actor);
        if (trigger.holder !== undefined && trigger.holder !== PARTY) checkRef(`${where}.holder`, trigger.holder, REF_CLASSES.holder);
        if (trigger.kind === 'scene-entered' && trigger.location !== undefined) checkRef(`${where}.location`, trigger.location, REF_CLASSES.triggerLocation);
        if (trigger.event !== undefined) checkEventId(`${where}.event`, trigger.event);
        if (trigger.status !== undefined && !(typeof trigger.status === 'string' && ctx.statuses.has(trigger.status))) {
            err(`${where}.status`, `unknown status id ${JSON.stringify(trigger.status)} (no condition in the compiled packs declares it)`);
        }
        if (trigger.change !== undefined && !STATUS_CHANGES.includes(trigger.change)) {
            err(`${where}.change`, `must be one of ${STATUS_CHANGES.join(', ')}, got ${JSON.stringify(trigger.change)}`);
        }
    };

    for (const [id, event] of Object.entries(graph.events)) {
        const where = `eventGraph.events.${id}`;
        if (!LOCAL_ID_RE.test(id)) err(where, 'event ids are letters, digits, "_" and "-" only');
        if (!isPlainObject(event)) {
            err(where, 'must be an object');
            continue;
        }
        unknownFields(where, event, EVENT_FIELDS);
        if (event.id !== undefined && event.id !== id) err(`${where}.id`, `must equal its key "${id}"`);
        if (!nonEmptyString(event.name)) err(`${where}.name`, 'is required');
        for (const field of ['source', 'location', 'initiates_quest']) {
            if (event[field] !== undefined && event[field] !== null) checkRef(`${where}.${field}`, event[field], REF_CLASSES[field]);
        }
        for (const field of ['day', 'act']) {
            if (event[field] !== undefined && !isNonNegativeInteger(event[field])) err(`${where}.${field}`, 'must be a non-negative integer');
        }
        if (event.is_day_end !== undefined && typeof event.is_day_end !== 'boolean') err(`${where}.is_day_end`, 'must be true or false');
        if (event.branch !== undefined && event.branch !== null && typeof event.branch !== 'string') err(`${where}.branch`, 'must be a string');
        if (event.requires !== undefined) {
            if (Array.isArray(event.requires)) event.requires.forEach((node, n) => checkRequirement(`${where}.requires[${n}]`, node));
            else checkRequirement(`${where}.requires`, event.requires);
        }
        if (event.requires_any !== undefined && event.requires_any !== null) {
            if (Array.isArray(event.requires_any)) event.requires_any.forEach((node, n) => checkRequirement(`${where}.requires_any[${n}]`, node));
            else err(`${where}.requires_any`, 'must be a list');
        }
        if (isPlainObject(event.excuse)) {
            for (const [excused, text] of Object.entries(event.excuse)) {
                checkEventId(`${where}.excuse`, excused);
                if (typeof text !== 'string') err(`${where}.excuse.${excused}`, 'must be a string');
            }
        } else if (event.excuse !== undefined && event.excuse !== null && typeof event.excuse !== 'string') {
            err(`${where}.excuse`, 'must be a string or a map of event id → string');
        }
        if (event.completion !== undefined) {
            if (Array.isArray(event.completion)) event.completion.forEach((trigger, n) => checkTrigger(`${where}.completion[${n}]`, trigger));
            else err(`${where}.completion`, 'must be a list of triggers');
        }
    }

    const characters = graph.characters;
    if (characters !== undefined && characters !== null) {
        if (!isPlainObject(characters)) {
            err('eventGraph.characters', 'must be a map of character key → character');
            return errors;
        }
        for (const [key, character] of Object.entries(characters)) {
            const where = `eventGraph.characters.${key}`;
            if (!LOCAL_ID_RE.test(key)) err(where, 'character keys are letters, digits, "_" and "-" only');
            if (!isPlainObject(character)) {
                err(where, 'must be an object');
                continue;
            }
            unknownFields(where, character, CHARACTER_FIELDS);
            if (character.actor === undefined) err(`${where}.actor`, 'is required');
            else checkRef(`${where}.actor`, character.actor, REF_CLASSES.character);
            (Array.isArray(character.dispositions) ? character.dispositions : []).forEach((entry, n) => {
                const at = `${where}.dispositions[${n}]`;
                if (!isPlainObject(entry)) return err(at, 'must be an object');
                unknownFields(at, entry, DISPOSITION_FIELDS);
                if (!nonEmptyString(entry.attitude)) err(`${at}.attitude`, 'is required');
                if (entry.target !== undefined && entry.target !== PARTY) checkRef(`${at}.target`, entry.target, REF_CLASSES.character);
                if (entry.trigger !== undefined) checkEventId(`${at}.trigger`, entry.trigger);
                return undefined;
            });
            (Array.isArray(character.relationships) ? character.relationships : []).forEach((entry, n) => {
                const at = `${where}.relationships[${n}]`;
                if (!isPlainObject(entry)) return err(at, 'must be an object');
                unknownFields(at, entry, RELATIONSHIP_FIELDS);
                checkRef(`${at}.target`, entry.target, REF_CLASSES.character);
                if (!nonEmptyString(entry.type)) err(`${at}.type`, 'is required');
                if (!nonEmptyString(entry.state)) err(`${at}.state`, 'is required');
                (Array.isArray(entry.influences) ? entry.influences : []).forEach((influence, m) => {
                    const inf = `${at}.influences[${m}]`;
                    if (!isPlainObject(influence)) return err(inf, 'must be an object');
                    unknownFields(inf, influence, INFLUENCE_FIELDS);
                    checkEventId(`${inf}.event`, influence.event);
                    if (!nonEmptyString(influence.to)) err(`${inf}.to`, 'is required');
                    return undefined;
                });
                return undefined;
            });
            for (const list of ['dispositions', 'relationships']) {
                if (character[list] !== undefined && !Array.isArray(character[list])) err(`${where}.${list}`, 'must be a list');
            }
        }
    }
    return errors;
}

/**
 * Validate the event graph of one Adventure SOURCE document (the DRY shape in
 * a `*-adventures` pack's `_source`).
 * @param {object} source the adventure source document
 * @param {Map<string, {doc: object}>} uuidIndex the compiled packs' UUID index
 * @param {Set<string>} statuses {@link conditionStatusIds}
 * @returns {string[]}
 */
function validateAdventureSource(source, uuidIndex, statuses) {
    const journal = normaliseJournal(source);
    const scenario = findScenario(journal);
    if (scenario === null) return [];
    return validateEventGraph(scenario, { own: adventureOwnDocuments(journal, scenario, uuidIndex), uuidIndex, statuses });
}

/**
 * Validate the event graph of every Adventure source under a pack root.
 * @param {string} packsRoot absolute pack root (`src/packs` or `src/packs-private`)
 * @param {Map<string, {doc: object}>} uuidIndex the compiled packs' UUID index (`buildUuidIndex`)
 * @param {(filePath: string) => object} resolveSource the gulpfile's source resolver (reference stubs)
 * @returns {string[]} one message per error, prefixed with the source path
 */
function validateAdventurePacks(packsRoot, uuidIndex, resolveSource) {
    const statuses = conditionStatusIds(uuidIndex);
    const errors = [];
    for (const { filePath, relPath, packName } of iterPackJson(packsRoot)) {
        if (collectionForPack(packName) !== 'adventures') continue;
        for (const message of validateAdventureSource(resolveSource(filePath), uuidIndex, statuses)) errors.push(`${relPath}: ${message}`);
    }
    return errors;
}

module.exports = {
    COMPLETION_TRIGGER_FIELDS,
    TRIGGER_OPTION_FIELDS,
    adventureOwnDocuments,
    conditionStatusIds,
    validateAdventurePacks,
    validateAdventureSource,
    validateEventGraph,
};
