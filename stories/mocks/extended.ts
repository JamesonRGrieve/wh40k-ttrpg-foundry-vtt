/**
 * Extended mock factories — adds NPC/Vehicle/Starship actors, per-system
 * variants for the seven game systems, seeded RNG, and a stub pattern other
 * item types follow. Imported additively next to the existing factories in
 * `./index.ts`.
 *
 * Seeded RNG: `seedRandom(seed)` returns a deterministic generator. Replace
 * `Math.random()` calls in story setup with `randomId(prefix, seed)` so
 * snapshots, screenshot diffs, and play-function assertions stay stable.
 *
 * Per-system: `withSystem(actor, systemId)` returns a copy of the actor whose
 * `system` field matches the shape expected by the named game line. Use this
 * to author one set of stories that homologate across DH2 / DH1 / RT / BC /
 * OW / DW / IM. Without per-system mocks, "works in DH2 but not the other six"
 * regressions are invisible — the homologation rule from CLAUDE.md needs this.
 */

import { mockActor, type MockActor, type MockItem } from './index';

// ── Seeded RNG ──────────────────────────────────────────────────────────────

/**
 * Mulberry32 — a very small deterministic 32-bit PRNG. Stable across V8 and
 * happy-dom; sufficient for ID generation in stories/tests.
 */
export function seedRandom(seed: number): () => number {
    let a = seed >>> 0;
    return function next(): number {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const DEFAULT_SEED = 0xc0deba5e;
const defaultRng = seedRandom(DEFAULT_SEED);

/**
 * Deterministic ID. With no `rng`, uses the module-default RNG. Pass an
 * explicit `rng` returned from `seedRandom(seed)` to scope determinism per-call.
 */
export function randomId(prefix = 'mock', rng: () => number = defaultRng): string {
    const n = Math.floor(rng() * 0x100000000);
    return `${prefix}-${n.toString(36).padStart(7, '0')}`;
}

// ── Per-system variants ─────────────────────────────────────────────────────

export type SystemId = 'dh2' | 'dh1' | 'rt' | 'bc' | 'ow' | 'dw' | 'im';

/** Per-system actor type tags as registered in src/system.json. */
const SYSTEM_ACTOR_TYPES: Record<SystemId, { character: string; npc: string; vehicle: string }> = {
    dh2: { character: 'dh2-character', npc: 'dh2-npc', vehicle: 'dh2-vehicle' },
    dh1: { character: 'dh1-character', npc: 'dh1-npc', vehicle: 'dh1-vehicle' },
    rt: { character: 'rt-character', npc: 'rt-npc', vehicle: 'rt-vehicle' },
    bc: { character: 'bc-character', npc: 'bc-npc', vehicle: 'bc-vehicle' },
    ow: { character: 'ow-character', npc: 'ow-npc', vehicle: 'ow-vehicle' },
    dw: { character: 'dw-character', npc: 'dw-npc', vehicle: 'dw-vehicle' },
    im: { character: 'im-character', npc: 'im-npc', vehicle: 'im-vehicle' },
};

/**
 * Apply a system identity to an actor. Currently sets the `type` to the
 * matching system-namespaced type so consuming code that branches on
 * `actor.type === 'dh2-character'` etc. takes the right path. Extended fields
 * specific to per-system shapes (e.g. IM Patrons / Factions / Endeavours) live
 * under `system.systemExtensions.<id>` so a single story can assert presence
 * across systems without hand-rolling each shape.
 */
export function withSystem(actor: MockActor, systemId: SystemId, role: 'character' | 'npc' | 'vehicle' = 'character'): MockActor {
    return {
        ...actor,
        type: SYSTEM_ACTOR_TYPES[systemId][role],
        system: {
            ...actor.system,
            // System-specific extensions sit under a namespaced key so per-system
            // templates can read `system.systemExtensions.im.patrons`, while
            // shared templates ignore them.
            systemExtensions: {
                [systemId]: systemSpecificDefaults(systemId),
            },
        } as MockActor['system'] & { systemExtensions: SystemExtensionsMap },
    };
}

interface ImSystemDefaults {
    patrons: string[];
    factions: string[];
    endeavours: string[];
    criticalHits: string[];
}
interface RtSystemDefaults {
    profitFactor: number;
    misfortunes: string[];
    shipShares: number;
}
interface DwSystemDefaults {
    chapter: string;
    deedHonours: string[];
    successorChapter: string;
}
interface BcSystemDefaults {
    infamy: number;
    alignment: string;
    soulFate: string;
}
interface OwSystemDefaults {
    regiment: string;
    squadRole: string;
    logisticsRating: number;
}
interface Dh1SystemDefaults {
    advanceScheme: string;
    insanityPoints: number;
}
interface Dh2SystemDefaults {
    background: string;
    motivation: string;
    divination: string;
}

type SystemDefaults = ImSystemDefaults | RtSystemDefaults | DwSystemDefaults | BcSystemDefaults | OwSystemDefaults | Dh1SystemDefaults | Dh2SystemDefaults;

interface SystemExtensionsMap {
    [key: string]: SystemDefaults | undefined;
}

const SYSTEM_DEFAULTS_BY_ID: { readonly [K in SystemId]: () => SystemDefaults } = {
    im: () => ({ patrons: [], factions: [], endeavours: [], criticalHits: [] }),
    rt: () => ({ profitFactor: 30, misfortunes: [], shipShares: 1 }),
    dw: () => ({ chapter: 'Ultramarines', deedHonours: [], successorChapter: '' }),
    bc: () => ({ infamy: 0, alignment: 'Khorne', soulFate: 'unsworn' }),
    ow: () => ({ regiment: 'Cadian Shock Troops', squadRole: 'guardsman', logisticsRating: 0 }),
    dh1: () => ({ advanceScheme: 'core', insanityPoints: 0 }),
    dh2: () => ({ background: 'imperial-guard', motivation: 'duty', divination: '' }),
};

function systemSpecificDefaults(systemId: SystemId): SystemDefaults {
    return SYSTEM_DEFAULTS_BY_ID[systemId]();
}

// ── NPC / Vehicle / Starship actors ─────────────────────────────────────────

export function mockNPCActor(overrides?: Partial<MockActor>): MockActor {
    const base = mockActor({
        type: 'dh2-npc',
        name: 'Hive Ganger',
        img: 'icons/portraits/ganger-default.webp',
    });
    base._id = randomId('mock-npc');
    return { ...base, ...(overrides ?? {}) };
}

/**
 * Not exported: this shape is only ever produced by {@link mockVehicleActor},
 * never named by a caller. Exporting it made it an unused public type.
 */
interface MockVehicleActor extends Omit<MockActor, 'system'> {
    system: MockActor['system'] & {
        vehicle: {
            speed: { tactical: number; cruising: number };
            armour: { front: number; sides: number; rear: number };
            integrity: { value: number; max: number };
            crew: { driver: string; gunner: string };
        };
    };
}

export function mockVehicleActor(overrides?: Partial<MockVehicleActor>): MockVehicleActor {
    const base = mockActor({
        type: 'dh2-vehicle',
        name: 'Chimera APC',
        img: 'icons/vehicles/chimera.webp',
    });
    return {
        ...base,
        ...(overrides ?? {}),
        _id: randomId('mock-vehicle'),
        system: {
            ...base.system,
            vehicle: {
                speed: { tactical: 12, cruising: 18 },
                armour: { front: 25, sides: 22, rear: 15 },
                integrity: { value: 30, max: 30 },
                crew: { driver: '', gunner: '' },
            },
            ...(overrides?.system ?? {}),
        },
    };
}

// ── Item-type stub pattern ──────────────────────────────────────────────────

/**
 * Pattern for adding a new item-type mock. Copy this scaffolding into a new
 * factory below, fill in the `system` shape from the corresponding DataModel
 * under `src/module/data/item/<type>.ts`, and export. Future stories pick it
 * up automatically.
 *
 *     export function mockCyberneticItem(overrides?: Partial<MockItem>): MockItem {
 *         return {
 *             _id: randomId('mock-cybernetic'),
 *             id: '',
 *             name: 'Cortex Implant',
 *             img: 'icons/equipment/cybernetic-cortex.webp',
 *             type: 'cybernetic',
 *             system: {
 *                 location: 'head',
 *                 corruption: 1,
 *                 // ...
 *             },
 *             ...(overrides ?? {}),
 *         };
 *     }
 *
 * The 16 not-yet-mocked item types (Ammo, Combat Action, Condition, Critical
 * Injury, Cybernetic, Force Field, Journal Entry, Origin Path, Peer/Enemy,
 * Storage Location, Weapon Mod, Weapon Quality, Psychic Power, Ship Component,
 * Ship Weapon, Ship Upgrade, Trait, Skill) follow this exact shape.
 */
export function mockGenericItem(type: string, overrides?: Partial<MockItem>): MockItem {
    return {
        _id: randomId(`mock-${type}`),
        id: '',
        name: type.charAt(0).toUpperCase() + type.slice(1),
        img: 'icons/svg/item-bag.svg',
        type,
        isOwner: true,
        isEmbedded: false,
        system: {},
        ...(overrides ?? {}),
    };
}
