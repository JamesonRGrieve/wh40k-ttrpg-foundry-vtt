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
export type ScenarioSceneType =
    | 'investigation'
    | 'combat'
    | 'social'
    | 'travel'
    | 'set-piece';

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

const SCENE_TYPES = new Set<ScenarioSceneType>([
    'investigation',
    'combat',
    'social',
    'travel',
    'set-piece',
]);
const PROVENANCES = new Set<ScenarioSource['provenance']>(['raw', 'homebrew', 'derived']);
const DISPOSITIONS = new Set<ScenarioEncounter['disposition']>(['hostile', 'neutral', 'friendly']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith('Compendium.');
}

/**
 * Validate a candidate scenario payload structurally.
 *
 * Returns the list of issues found (empty when valid). This is a pure check —
 * it does not resolve UUIDs (that is the build resolver's job); it only
 * verifies that referenced ids form a coherent graph and that UUID-shaped
 * fields look like Compendium UUIDs.
 */
export function validateScenario(candidate: unknown): ScenarioValidationIssue[] {
    const issues: ScenarioValidationIssue[] = [];
    const add = (path: string, message: string): void => {
        issues.push({ path, message });
    };

    if (!isRecord(candidate)) {
        add('', 'scenario must be an object');
        return issues;
    }

    if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
        add('id', 'id must be a non-empty string');
    }

    const source = candidate.source;
    if (!isRecord(source)) {
        add('source', 'source must be an object');
    } else {
        if (!PROVENANCES.has(source.provenance as ScenarioSource['provenance'])) {
            add('source.provenance', 'provenance must be one of raw | homebrew | derived');
        }
        if (source.provenance === 'raw') {
            if (typeof source.book !== 'string' || source.book.length === 0) {
                add('source.book', 'raw provenance requires a book citation');
            }
            if (typeof source.page !== 'string' || source.page.length === 0) {
                add('source.page', 'raw provenance requires a page citation');
            }
        }
    }

    const scenes = candidate.scenes;
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
        if (typeof raw.id !== 'string' || raw.id.length === 0) {
            add(`${base}.id`, 'scene id must be a non-empty string');
        } else {
            if (sceneIds.has(raw.id)) add(`${base}.id`, `duplicate scene id "${raw.id}"`);
            sceneIds.add(raw.id);
        }
        if (typeof raw.name !== 'string' || raw.name.length === 0) {
            add(`${base}.name`, 'scene name must be a non-empty string');
        }
        if (!SCENE_TYPES.has(raw.type as ScenarioSceneType)) {
            add(`${base}.type`, `scene type must be one of ${[...SCENE_TYPES].join(' | ')}`);
        }
        if (raw.sceneUuid != null && !isUuid(raw.sceneUuid)) {
            add(`${base}.sceneUuid`, 'sceneUuid must be a Compendium UUID or null');
        }

        const checks = raw.checks;
        if (checks !== undefined && !Array.isArray(checks)) {
            add(`${base}.checks`, 'checks must be an array');
        } else if (Array.isArray(checks)) {
            for (const [ci, check] of checks.entries()) {
                if (!isRecord(check)) {
                    add(`${base}.checks[${ci}]`, 'check must be an object');
                    continue;
                }
                if (typeof check.id === 'string' && check.id.length > 0) checkIds.add(check.id);
                if (typeof check.difficulty !== 'number') {
                    add(`${base}.checks[${ci}].difficulty`, 'difficulty must be a number');
                }
            }
        }

        const encounters = raw.encounters;
        if (encounters !== undefined && !Array.isArray(encounters)) {
            add(`${base}.encounters`, 'encounters must be an array');
        } else if (Array.isArray(encounters)) {
            for (const [ei, enc] of encounters.entries()) {
                if (!isRecord(enc)) {
                    add(`${base}.encounters[${ei}]`, 'encounter must be an object');
                    continue;
                }
                if (!isUuid(enc.actorUuid)) {
                    add(`${base}.encounters[${ei}].actorUuid`, 'actorUuid must be a Compendium UUID');
                }
                if (enc.disposition !== undefined && !DISPOSITIONS.has(enc.disposition as ScenarioEncounter['disposition'])) {
                    add(`${base}.encounters[${ei}].disposition`, 'disposition must be hostile | neutral | friendly');
                }
            }
        }

        const rewards = raw.rewards;
        if (Array.isArray(rewards)) {
            for (const [ri, rew] of rewards.entries()) {
                if (isRecord(rew) && rew.itemUuid != null && !isUuid(rew.itemUuid)) {
                    add(`${base}.rewards[${ri}].itemUuid`, 'itemUuid must be a Compendium UUID or null');
                }
            }
        }
    }

    if (typeof candidate.entrySceneId !== 'string' || !sceneIds.has(candidate.entrySceneId)) {
        add('entrySceneId', 'entrySceneId must reference an existing scene id');
    }

    // Second pass: edge integrity (now that all scene/check ids are known).
    for (const [index, raw] of scenes.entries()) {
        if (!isRecord(raw)) continue;
        const base = `scenes[${index}]`;
        const transitions = raw.transitions;
        if (Array.isArray(transitions)) {
            for (const [ti, tr] of transitions.entries()) {
                if (isRecord(tr) && typeof tr.toSceneId === 'string' && !sceneIds.has(tr.toSceneId)) {
                    add(`${base}.transitions[${ti}].toSceneId`, `unknown scene id "${tr.toSceneId}"`);
                }
            }
        }
        const leads = raw.leads;
        if (Array.isArray(leads)) {
            for (const [li, lead] of leads.entries()) {
                if (!isRecord(lead)) continue;
                if (lead.revealsSceneId != null && typeof lead.revealsSceneId === 'string' && !sceneIds.has(lead.revealsSceneId)) {
                    add(`${base}.leads[${li}].revealsSceneId`, `unknown scene id "${lead.revealsSceneId}"`);
                }
                if (lead.requiresCheckId != null && typeof lead.requiresCheckId === 'string' && !checkIds.has(lead.requiresCheckId)) {
                    add(`${base}.leads[${li}].requiresCheckId`, `unknown check id "${lead.requiresCheckId}"`);
                }
            }
        }
    }

    return issues;
}

/** Type guard: a structurally-valid scenario. */
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
        for (const enc of scene.encounters ?? []) {
            if (typeof enc.actorUuid === 'string') actors.add(enc.actorUuid);
        }
        for (const rew of scene.rewards ?? []) {
            if (typeof rew.itemUuid === 'string') items.add(rew.itemUuid);
        }
    }
    return { actors, items, scenes };
}
