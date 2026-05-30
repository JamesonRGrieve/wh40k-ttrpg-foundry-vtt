/**
 * Adventure scenario schema + validator.
 *
 * Official adventure books ship as Foundry {@link Adventure} documents whose
 * GM-facing scenario flow is stored, machine-readably, on the adventure's GM
 * `JournalEntry` page under `flags['wh40k-rpg'].scenario`. Investigation /
 * quest tooling consumes this schema directly, so it is defined here as a
 * typed surface with a runtime validator (rather than as ad-hoc shapes read at
 * call sites).
 *
 * The scenario references content (NPCs, items, mapped scenes, tables) by
 * Compendium UUID — it never embeds copies. The build-time resolver
 * (`scripts/resolve-adventures.cjs`, invoked from `gulpfile.js`) walks these
 * UUIDs and embeds resolved copies into the compiled Adventure document; the
 * scenario flag itself stays UUID-referenced both on disk and in the compiled
 * output.
 *
 * See `src/packs/CLAUDE.md` *Adventures* for the authoring contract.
 */

/** Provenance shape shared with item `system.source` (RAW citation form). */
export interface ScenarioSource {
    /** `raw` for source-book content, `homebrew` for authored scenarios, `derived` for conversions. */
    provenance: 'raw' | 'homebrew' | 'derived';
    /** Source book title — present (and only) on `raw` provenance. */
    book?: string;
    /** Page citation — present (and only) on `raw` provenance. */
    page?: string;
    /** Citation link — primarily for `homebrew` / `derived`. */
    url?: string;
    /** Line id converted from — only on `derived`. */
    derivedFrom?: string;
}

/** Scene kind — drives tooling presentation, not mechanics. */
export type ScenarioSceneType = 'investigation' | 'combat' | 'social' | 'travel' | 'set-piece';

/** A skill / characteristic test gating a scene, with per-outcome prose. */
export interface ScenarioCheck {
    /** Stable id, referenced by `ScenarioLead.requiresCheckId`. */
    id: string;
    /** Skill key (lower-case, e.g. `awareness`). */
    skill: string;
    /** Characteristic key (lower-case, e.g. `perception`). */
    characteristic: string;
    /** RAW difficulty modifier (e.g. `-10`, `0`, `+20`). */
    difficulty: number;
    /** Outcome prose. */
    success: string;
    /** Optional partial-success prose; `null` when the RAW has no degree-of-success split. */
    partial?: string | null;
    /** Failure prose. */
    failure: string;
}

/** An encounter — a count of one referenced actor with a disposition + tactics. */
export interface ScenarioEncounter {
    /** Compendium UUID of the actor (resolved to an embedded copy at build). */
    actorUuid: string;
    /** Number fielded. */
    count: number;
    /** Encounter disposition (runtime attribute, not a pack-placement axis). */
    disposition: 'hostile' | 'neutral' | 'friendly';
    /** GM tactics prose. */
    tactics?: string;
}

/** A lead — a clue that may reveal another scene, optionally gated by a check. */
export interface ScenarioLead {
    /** Clue prose. */
    text: string;
    /** Id of the scene this lead reveals (a graph edge); `null` for a terminal clue. */
    revealsSceneId?: string | null;
    /** Id of the check that must succeed for this lead to surface; `null` when ungated. */
    requiresCheckId?: string | null;
}

/** A reward — XP and/or a referenced item, currency, influence. */
export interface ScenarioReward {
    /** Experience awarded. */
    xp?: number | null;
    /** Compendium UUID of an item reward (resolved to an embedded copy at build). */
    itemUuid?: string | null;
    /** Currency reward; `key` is a `CONFIG.wh40k.currencies` key. */
    currency?: { key: string; amount: number } | null;
    /** Influence / standing reward. */
    influence?: number | null;
}

/** A directed edge to another scene, gated by a free-text condition. */
export interface ScenarioTransition {
    /** Id of the destination scene. */
    toSceneId: string;
    /** Free-text condition prose for taking this edge. */
    condition?: string;
}

/** A node in the scenario scene graph. */
export interface ScenarioScene {
    /** Stable id — graph node key. */
    id: string;
    /** Display name. */
    name: string;
    /** Scene kind. */
    type: ScenarioSceneType;
    /** Compendium UUID of a mapped {@link Scene}, if any (resolved to an embedded copy at build). */
    sceneUuid?: string | null;
    /** Boxed read-aloud text (HTML). */
    readAloud?: string;
    /** GM-only context (HTML). */
    gmNotes?: string;
    /** Skill checks available in the scene. */
    checks: ScenarioCheck[];
    /** Encounters staged in the scene. */
    encounters: ScenarioEncounter[];
    /** Leads / clues surfaced in the scene. */
    leads: ScenarioLead[];
    /** Rewards granted on completion. */
    rewards: ScenarioReward[];
    /** Outbound graph edges. */
    transitions: ScenarioTransition[];
}

/** The full scenario flag payload stored under `flags['wh40k-rpg'].scenario`. */
export interface Scenario {
    /** Stable scenario id (typically the source-file slug). */
    id: string;
    /** Provenance of the scenario. */
    source: ScenarioSource;
    /** Act number, when the book splits into acts. */
    act?: number;
    /** Optional difficulty / exposure hint. */
    subtletyTier?: string;
    /** Id of the entry scene — the graph's start node. */
    entrySceneId: string;
    /** Scene graph. */
    scenes: ScenarioScene[];
}

/** The flag namespace the scenario lives under. */
export const SCENARIO_FLAG_SCOPE = 'wh40k-rpg' as const;
/** The flag key the scenario lives under. */
export const SCENARIO_FLAG_KEY = 'scenario' as const;

/** A single validation problem, addressed by dotted path into the scenario. */
export interface ScenarioValidationIssue {
    path: string;
    message: string;
}

const SCENE_TYPES = new Set<ScenarioSceneType>(['investigation', 'combat', 'social', 'travel', 'set-piece']);
const PROVENANCES = new Set<ScenarioSource['provenance']>(['raw', 'homebrew', 'derived']);
const DISPOSITIONS = new Set<ScenarioEncounter['disposition']>(['hostile', 'neutral', 'friendly']);

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard accepts unknown input from untyped scenario flag payload
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard accepts unknown input
function isUuid(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('Compendium.');
}

/** Sink for validation issues, threaded through the per-scene helpers. */
type AddIssue = (path: string, message: string) => void;

/** Validate the provenance `source` sub-object (already record-narrowed). */
// eslint-disable-next-line no-restricted-syntax -- boundary: validates the untyped scenario flag payload
function validateSource(source: Record<string, unknown>, add: AddIssue): void {
    const provenance = source['provenance'];
    if (!PROVENANCES.has(provenance as ScenarioSource['provenance'])) {
        add('source.provenance', 'provenance must be one of raw | homebrew | derived');
    }
    if (provenance === 'raw') {
        const book = source['book'];
        const page = source['page'];
        if (typeof book !== 'string' || book.length === 0) {
            add('source.book', 'raw provenance requires a book citation');
        }
        if (typeof page !== 'string' || page.length === 0) {
            add('source.page', 'raw provenance requires a page citation');
        }
    }
}

/** Validate one scene's intrinsic shape; records its id/check ids into the sets. */
// eslint-disable-next-line no-restricted-syntax -- boundary: validates the untyped scenario flag payload
function validateSceneShape(raw: Record<string, unknown>, base: string, add: AddIssue, sceneIds: Set<string>, checkIds: Set<string>): void {
    const rawId = raw['id'];
    if (typeof rawId !== 'string' || rawId.length === 0) {
        add(`${base}.id`, 'scene id must be a non-empty string');
    } else {
        if (sceneIds.has(rawId)) add(`${base}.id`, `duplicate scene id "${rawId}"`);
        sceneIds.add(rawId);
    }
    const rawName = raw['name'];
    if (typeof rawName !== 'string' || rawName.length === 0) {
        add(`${base}.name`, 'scene name must be a non-empty string');
    }
    if (!SCENE_TYPES.has(raw['type'] as ScenarioSceneType)) {
        add(`${base}.type`, `scene type must be one of ${[...SCENE_TYPES].join(' | ')}`);
    }
    const sceneUuid = raw['sceneUuid'];
    if (sceneUuid != null && !isUuid(sceneUuid)) {
        add(`${base}.sceneUuid`, 'sceneUuid must be a Compendium UUID or null');
    }
    validateSceneChecks(raw['checks'], base, add, checkIds);
    validateSceneEncounters(raw['encounters'], base, add);
    validateSceneRewards(raw['rewards'], base, add);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: validates the untyped scenario flag payload
function validateSceneChecks(checks: unknown, base: string, add: AddIssue, checkIds: Set<string>): void {
    if (checks === undefined) return;
    if (!Array.isArray(checks)) {
        add(`${base}.checks`, 'checks must be an array');
        return;
    }
    for (const [ci, check] of checks.entries()) {
        if (!isRecord(check)) {
            add(`${base}.checks[${ci}]`, 'check must be an object');
            continue;
        }
        const checkId = check['id'];
        if (typeof checkId === 'string' && checkId.length > 0) checkIds.add(checkId);
        if (typeof check['difficulty'] !== 'number') {
            add(`${base}.checks[${ci}].difficulty`, 'difficulty must be a number');
        }
    }
}

// eslint-disable-next-line no-restricted-syntax -- boundary: validates the untyped scenario flag payload
function validateSceneEncounters(encounters: unknown, base: string, add: AddIssue): void {
    if (encounters === undefined) return;
    if (!Array.isArray(encounters)) {
        add(`${base}.encounters`, 'encounters must be an array');
        return;
    }
    for (const [ei, enc] of encounters.entries()) {
        if (!isRecord(enc)) {
            add(`${base}.encounters[${ei}]`, 'encounter must be an object');
            continue;
        }
        if (!isUuid(enc['actorUuid'])) {
            add(`${base}.encounters[${ei}].actorUuid`, 'actorUuid must be a Compendium UUID');
        }
        const disposition = enc['disposition'];
        if (disposition !== undefined && !DISPOSITIONS.has(disposition as ScenarioEncounter['disposition'])) {
            add(`${base}.encounters[${ei}].disposition`, 'disposition must be hostile | neutral | friendly');
        }
    }
}

// eslint-disable-next-line no-restricted-syntax -- boundary: validates the untyped scenario flag payload
function validateSceneRewards(rewards: unknown, base: string, add: AddIssue): void {
    if (!Array.isArray(rewards)) return;
    for (const [ri, rew] of rewards.entries()) {
        if (isRecord(rew)) {
            const itemUuid = rew['itemUuid'];
            if (itemUuid != null && !isUuid(itemUuid)) {
                add(`${base}.rewards[${ri}].itemUuid`, 'itemUuid must be a Compendium UUID or null');
            }
        }
    }
}

/** Second-pass edge integrity for one scene (needs the full id sets). */
// eslint-disable-next-line no-restricted-syntax -- boundary: validates the untyped scenario flag payload
function validateSceneEdges(raw: Record<string, unknown>, base: string, add: AddIssue, sceneIds: Set<string>, checkIds: Set<string>): void {
    const transitions = raw['transitions'];
    if (Array.isArray(transitions)) {
        for (const [ti, tr] of transitions.entries()) {
            if (isRecord(tr)) {
                const toSceneId = tr['toSceneId'];
                if (typeof toSceneId === 'string' && !sceneIds.has(toSceneId)) {
                    add(`${base}.transitions[${ti}].toSceneId`, `unknown scene id "${toSceneId}"`);
                }
            }
        }
    }
    const leads = raw['leads'];
    if (Array.isArray(leads)) {
        for (const [li, lead] of leads.entries()) {
            if (!isRecord(lead)) continue;
            const revealsSceneId = lead['revealsSceneId'];
            if (typeof revealsSceneId === 'string' && !sceneIds.has(revealsSceneId)) {
                add(`${base}.leads[${li}].revealsSceneId`, `unknown scene id "${revealsSceneId}"`);
            }
            const requiresCheckId = lead['requiresCheckId'];
            if (typeof requiresCheckId === 'string' && !checkIds.has(requiresCheckId)) {
                add(`${base}.leads[${li}].requiresCheckId`, `unknown check id "${requiresCheckId}"`);
            }
        }
    }
}

/**
 * Validate a candidate scenario payload structurally.
 *
 * Returns the list of issues found (empty when valid). This is a pure check —
 * it does not resolve UUIDs (that is the build resolver's job); it only
 * verifies that referenced ids form a coherent graph and that UUID-shaped
 * fields look like Compendium UUIDs.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: validator entry point accepts the untyped scenario flag payload
export function validateScenario(candidate: unknown): ScenarioValidationIssue[] {
    const issues: ScenarioValidationIssue[] = [];
    const add: AddIssue = (path, message) => {
        issues.push({ path, message });
    };

    if (!isRecord(candidate)) {
        add('', 'scenario must be an object');
        return issues;
    }

    const candidateId = candidate['id'];
    if (typeof candidateId !== 'string' || candidateId.length === 0) {
        add('id', 'id must be a non-empty string');
    }

    const source = candidate['source'];
    if (!isRecord(source)) {
        add('source', 'source must be an object');
    } else {
        validateSource(source, add);
    }

    const scenes = candidate['scenes'];
    if (!Array.isArray(scenes) || scenes.length === 0) {
        add('scenes', 'scenes must be a non-empty array');
        return issues;
    }

    const sceneIds = new Set<string>();
    const checkIds = new Set<string>();
    for (const [index, raw] of scenes.entries()) {
        const base = `scenes[${index}]`;
        if (!isRecord(raw)) {
            add(base, 'scene must be an object');
            continue;
        }
        validateSceneShape(raw, base, add, sceneIds, checkIds);
    }

    const entrySceneId = candidate['entrySceneId'];
    if (typeof entrySceneId !== 'string' || !sceneIds.has(entrySceneId)) {
        add('entrySceneId', 'entrySceneId must reference an existing scene id');
    }

    // Second pass: edge integrity (now that all scene/check ids are known).
    for (const [index, raw] of scenes.entries()) {
        if (!isRecord(raw)) continue;
        validateSceneEdges(raw, `scenes[${index}]`, add, sceneIds, checkIds);
    }

    return issues;
}

/** Type guard: a structurally-valid scenario. */
// eslint-disable-next-line no-restricted-syntax -- boundary: type guard accepts the untyped scenario flag payload
export function isScenario(candidate: unknown): candidate is Scenario {
    return validateScenario(candidate).length === 0;
}

/**
 * Collect every Compendium UUID a scenario references (actors, items, scenes).
 * The build resolver uses this to know which documents to embed; runtime
 * tooling can use it to pre-warm the `uuidNameCache`.
 */
export function collectScenarioUuids(scenario: Scenario): {
    actors: Set<string>;
    items: Set<string>;
    scenes: Set<string>;
} {
    const actors = new Set<string>();
    const items = new Set<string>();
    const scenes = new Set<string>();
    for (const scene of scenario.scenes) {
        if (typeof scene.sceneUuid === 'string') scenes.add(scene.sceneUuid);
        for (const enc of scene.encounters) {
            if (typeof enc.actorUuid === 'string') actors.add(enc.actorUuid);
        }
        for (const rew of scene.rewards) {
            if (typeof rew.itemUuid === 'string') items.add(rew.itemUuid);
        }
    }
    return { actors, items, scenes };
}
