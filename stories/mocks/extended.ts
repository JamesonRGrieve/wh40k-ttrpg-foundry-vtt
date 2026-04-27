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

import { mockActor, mockCharacteristics, type MockActor, type MockItem } from './index';

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
let defaultRng = seedRandom(DEFAULT_SEED);

/**
 * Reset the default RNG used by `randomId(prefix)` (no-seed form). Call once
 * per story or once per test to pin determinism.
 */
export function resetDefaultRng(seed = DEFAULT_SEED): void {
    defaultRng = seedRandom(seed);
}

/**
 * Deterministic ID. With no `rng`, uses the module-default RNG (which can be
 * reset via `resetDefaultRng`). Pass an explicit `rng` returned from
 * `seedRandom(seed)` to scope determinism per-call.
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
        } as MockActor['system'] & { systemExtensions: Record<string, unknown> },
    };
}

function systemSpecificDefaults(systemId: SystemId): Record<string, unknown> {
    switch (systemId) {
        case 'im':
            return {
                patrons: [],
                factions: [],
                endeavours: [],
                criticalHits: [],
            };
        case 'rt':
            return { profitFactor: 30, misfortunes: [], shipShares: 1 };
        case 'dw':
            return { chapter: 'Ultramarines', deedHonours: [], successorChapter: '' };
        case 'bc':
            return { infamy: 0, alignment: 'Khorne', soulFate: 'unsworn' };
        case 'ow':
            return { regiment: 'Cadian Shock Troops', squadRole: 'guardsman', logisticsRating: 0 };
        case 'dh1':
            return { advanceScheme: 'core', insanityPoints: 0 };
        case 'dh2':
            return { background: 'imperial-guard', motivation: 'duty', divination: '' };
    }
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

export interface MockVehicleActor extends Omit<MockActor, 'system'> {
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

export interface MockStarshipActor extends Omit<MockActor, 'system'> {
    system: MockActor['system'] & {
        starship: {
            hullClass: string;
            speed: number;
            manoeuvrability: number;
            detectionRating: number;
            voidShields: { value: number; max: number };
            armour: number;
            hullIntegrity: { value: number; max: number };
            morale: { value: number; max: number };
            crew: { value: number; max: number; rating: number };
        };
    };
}

export function mockStarshipActor(overrides?: Partial<MockStarshipActor>): MockStarshipActor {
    const base = mockActor({
        type: 'rt-starship',
        name: 'Sword of Terra',
        img: 'icons/vehicles/voidship.webp',
    });
    return {
        ...base,
        ...(overrides ?? {}),
        _id: randomId('mock-starship'),
        system: {
            ...base.system,
            starship: {
                hullClass: 'frigate',
                speed: 8,
                manoeuvrability: 15,
                detectionRating: 10,
                voidShields: { value: 1, max: 1 },
                armour: 18,
                hullIntegrity: { value: 35, max: 35 },
                morale: { value: 100, max: 100 },
                crew: { value: 80, max: 100, rating: 40 },
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

// Convenience exports so symmetry-style tests don't need to constantly
// import mockGenericItem with a type string.
export const mockAmmoItem = (o?: Partial<MockItem>) => mockGenericItem('ammo', o);
export const mockCombatActionItem = (o?: Partial<MockItem>) => mockGenericItem('combat-action', o);
export const mockConditionItem = (o?: Partial<MockItem>) => mockGenericItem('condition', o);
export const mockCriticalInjuryItem = (o?: Partial<MockItem>) => mockGenericItem('critical-injury', o);
export const mockCyberneticItem = (o?: Partial<MockItem>) => mockGenericItem('cybernetic', o);
export const mockForceFieldItem = (o?: Partial<MockItem>) => mockGenericItem('force-field', o);
export const mockJournalEntryItem = (o?: Partial<MockItem>) => mockGenericItem('journal-entry', o);
export const mockOriginPathItem = (o?: Partial<MockItem>) => mockGenericItem('origin-path', o);
export const mockPeerEnemyItem = (o?: Partial<MockItem>) => mockGenericItem('peer-enemy', o);
export const mockStorageLocationItem = (o?: Partial<MockItem>) => mockGenericItem('storage-location', o);
export const mockWeaponModItem = (o?: Partial<MockItem>) => mockGenericItem('weapon-mod', o);
export const mockWeaponQualityItem = (o?: Partial<MockItem>) => mockGenericItem('weapon-quality', o);
export const mockPsychicPowerItem = (o?: Partial<MockItem>) => mockGenericItem('psychic-power', o);
export const mockShipComponentItem = (o?: Partial<MockItem>) => mockGenericItem('ship-component', o);
export const mockShipWeaponItem = (o?: Partial<MockItem>) => mockGenericItem('ship-weapon', o);
export const mockShipUpgradeItem = (o?: Partial<MockItem>) => mockGenericItem('ship-upgrade', o);
export const mockTraitItem = (o?: Partial<MockItem>) => mockGenericItem('trait', o);
export const mockSkillItem = (o?: Partial<MockItem>) => mockGenericItem('skill', o);

// Re-export characteristics helper so consumers can build sliced characters.
export { mockCharacteristics };
