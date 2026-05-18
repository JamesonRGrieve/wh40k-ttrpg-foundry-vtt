/**
 * Consolidated Career Advancement Tables
 *
 * Single typed source for every career's characteristic costs, Rank 1
 * skill/talent advancements, and metadata. Replaces the eight previously
 * near-identical per-career modules (arch-militant, astropath, explorator,
 * missionary, navigator, seneschal, void-master, wh40k-rpg) which differed
 * only in their cost numbers and skill/talent arrays.
 *
 * Data sourced from the WH40K RPG Core Rulebook (unchanged from the prior
 * per-career files — values are byte-for-byte identical).
 *
 * NOTE (Direction #7 follow-up): this content data should ultimately live in
 * a compendium pack `_source/*.json` document rather than in `src/`. This
 * module is a DRY consolidation only; relocating the tables to a compendium
 * is tracked as follow-up work.
 */

/**
 * One advance option (skill or talent) offered at Rank 1.
 *
 * `multiplier` is present on a handful of entries (e.g. "Psychic Technique",
 * "Sound Constitution") and is preserved verbatim so downstream consumers
 * that read it via the registry's loose index signature keep working.
 */
interface RankAdvanceEntry {
    name: string;
    cost: number;
    type: 'skill' | 'talent';
    specialization?: string;
    multiplier?: number;
    // eslint-disable-next-line no-restricted-syntax -- boundary: prerequisite shapes are heterogeneous content data validated downstream
    prerequisites: Record<string, unknown>[];
}

/** Per-tier characteristic advancement cost block. */
interface CharacteristicCostTier {
    simple: number;
    intermediate: number;
    trained: number;
    expert: number;
}

/** Map of characteristic key → its per-tier costs. */
type CharacteristicCostTable = Record<string, CharacteristicCostTier>;

/** Career metadata block (matches the prior per-file `CAREER_INFO`). */
interface CareerInfo {
    key: string;
    name: string;
    description: string;
    ranks: string[];
}

/**
 * Full advancement configuration for one career.
 *
 * `TIER_ORDER` is retained per-entry purely to keep the object shape returned
 * by `getCareerAdvancements()` byte-identical to the prior per-career module
 * namespaces (each of which exported a `TIER_ORDER`). No consumer reads it off
 * a registry value — the canonical order is the module-level `TIER_ORDER`
 * export in `./index.ts` — but preserving it removes any shape-divergence risk.
 */
interface CareerTable {
    CAREER_INFO: CareerInfo;
    CHARACTERISTIC_COSTS: CharacteristicCostTable;
    RANK_1_ADVANCES: RankAdvanceEntry[];
    TIER_ORDER: readonly ['simple', 'intermediate', 'trained', 'expert'];
}

/** Per-career data without the shared `TIER_ORDER` (injected once below). */
type CareerTableData = Omit<CareerTable, 'TIER_ORDER'>;

/** Shared rank label list — identical across every career. */
const STANDARD_RANKS: readonly string[] = ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8'];

/** Shared tier order — identical across every career (mirrors the prior per-file export). */
const STANDARD_TIER_ORDER = ['simple', 'intermediate', 'trained', 'expert'] as const;

/**
 * Raw per-career advancement data keyed by registry key.
 *
 * Keys and every value below are transcribed unchanged from the original
 * eight per-career modules. `TIER_ORDER` is added uniformly afterwards so the
 * shared value is defined exactly once (DRY).
 */
const CAREER_TABLE_DATA = {
    rogueTrader: {
        CAREER_INFO: {
            key: 'rogueTrader',
            name: 'WH40K.Career.WH40K',
            description: 'WH40K.Career.WH40KDesc',
            ranks: [...STANDARD_RANKS],
        },
        CHARACTERISTIC_COSTS: {
            weaponSkill: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            ballisticSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            strength: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            toughness: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            agility: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            intelligence: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            perception: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            willpower: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            fellowship: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
        },
        RANK_1_ADVANCES: [
            { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Command', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Commerce', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Charm', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Ciphers', cost: 100, type: 'skill', specialization: 'WH40K RPG', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperium', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'WH40K RPGs', prerequisites: [] },
            { name: 'Dodge', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Evaluate', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Pilot', cost: 100, type: 'skill', specialization: 'Space Craft', prerequisites: [] },
            { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Astromancy', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'WH40K RPG', prerequisites: [] },
            { name: 'Speak Language', cost: 100, type: 'skill', specialization: "Trader's Cant", prerequisites: [] },
            {
                name: 'Air of Authority',
                cost: 100,
                type: 'talent',
                prerequisites: [{ type: 'characteristic', key: 'fellowship', value: 30 }],
            },
            {
                name: 'Ambidextrous',
                cost: 200,
                type: 'talent',
                prerequisites: [{ type: 'characteristic', key: 'agility', value: 30 }],
            },
            {
                name: 'Melee Weapon Training',
                cost: 200,
                type: 'talent',
                specialization: 'Primitive',
                prerequisites: [],
            },
            {
                name: 'Renowned Warrant',
                cost: 200,
                type: 'talent',
                prerequisites: [],
            },
            {
                name: 'Pistol Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Melee Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
        ],
    },
    archMilitant: {
        CAREER_INFO: {
            key: 'archMilitant',
            name: 'WH40K.Career.ArchMilitant',
            description: 'WH40K.Career.ArchMilitantDesc',
            ranks: [...STANDARD_RANKS],
        },
        CHARACTERISTIC_COSTS: {
            weaponSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            ballisticSkill: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            strength: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            toughness: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            agility: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            intelligence: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            perception: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            willpower: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            fellowship: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
        },
        RANK_1_ADVANCES: [
            { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperial Guard', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'War', prerequisites: [] },
            { name: 'Dodge', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Intimidate', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Pirates', prerequisites: [] },
            { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Tactica Imperialis', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Military', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'WH40K RPG', prerequisites: [] },
            {
                name: 'Ambidextrous',
                cost: 200,
                type: 'talent',
                prerequisites: [{ type: 'characteristic', key: 'agility', value: 30 }],
            },
            { name: 'Quick Draw', cost: 200, type: 'talent', prerequisites: [] },
            { name: 'Medicae', cost: 200, type: 'skill', prerequisites: [] },
            {
                name: 'Melee Weapon Training',
                cost: 200,
                type: 'talent',
                specialization: 'Primitive',
                prerequisites: [],
            },
            {
                name: 'Basic Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            { name: 'Bloodtracker', cost: 500, type: 'talent', prerequisites: [] },
            {
                name: 'Guardian',
                cost: 500,
                type: 'talent',
                prerequisites: [{ type: 'characteristic', key: 'agility', value: 40 }],
            },
            {
                name: 'Pistol Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Melee Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Thrown Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
        ],
    },
    astropath: {
        CAREER_INFO: {
            key: 'astropath',
            name: 'WH40K.Career.Astropath',
            description: 'WH40K.Career.AstropathDesc',
            ranks: [...STANDARD_RANKS],
        },
        CHARACTERISTIC_COSTS: {
            weaponSkill: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            ballisticSkill: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            strength: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            toughness: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            agility: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            intelligence: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            perception: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            willpower: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            fellowship: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
        },
        RANK_1_ADVANCES: [
            { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Ciphers', cost: 100, type: 'skill', specialization: 'Astropath Sign', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Administratum', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Adeptus Astra Telepathica', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Psykers', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Warp', prerequisites: [] },
            { name: 'Invocation', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Psyniscience', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Cryptology', prerequisites: [] },
            { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Occult', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'WH40K RPG', prerequisites: [] },
            {
                name: 'Psychic Technique',
                cost: 100,
                type: 'talent',
                multiplier: 2,
                prerequisites: [],
            },
            { name: 'Dodge', cost: 200, type: 'skill', prerequisites: [] },
            {
                name: 'Heightened Senses',
                cost: 200,
                type: 'talent',
                specialization: 'Sound',
                prerequisites: [],
            },
            {
                name: 'Psy Rating 2',
                cost: 200,
                type: 'talent',
                prerequisites: [],
            },
            {
                name: 'Melee Weapon Training',
                cost: 200,
                type: 'talent',
                specialization: 'Primitive',
                prerequisites: [],
            },
            {
                name: 'Pistol Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Rite of Sanctioning',
                cost: 500,
                type: 'talent',
                prerequisites: [{ type: 'talent', key: 'Psy Rating' }],
            },
            {
                name: 'Warp Affinity',
                cost: 500,
                type: 'talent',
                prerequisites: [{ type: 'talent', key: 'Psy Rating' }],
            },
        ],
    },
    explorator: {
        CAREER_INFO: {
            key: 'explorator',
            name: 'WH40K.Career.Explorator',
            description: 'WH40K.Career.ExploratorDesc',
            ranks: [...STANDARD_RANKS],
        },
        CHARACTERISTIC_COSTS: {
            weaponSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            ballisticSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            strength: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            toughness: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            agility: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            intelligence: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            perception: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            willpower: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            fellowship: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
        },
        RANK_1_ADVANCES: [
            { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Machine Cult', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Tech', prerequisites: [] },
            { name: 'Drive', cost: 100, type: 'skill', specialization: 'Ground Vehicle', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Archeotech', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Adeptus Mechanicus', prerequisites: [] },
            { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Logic', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Astromancy', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'WH40K RPG', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Tech', prerequisites: [] },
            { name: 'Tech-Use', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Trade', cost: 100, type: 'skill', specialization: 'Armourer', prerequisites: [] },
            { name: 'Trade', cost: 100, type: 'skill', specialization: 'Technomat', prerequisites: [] },
            { name: 'Autosanguine', cost: 200, type: 'talent', prerequisites: [] },
            { name: 'Logis Implant', cost: 200, type: 'talent', prerequisites: [] },
            {
                name: 'Sound Constitution',
                cost: 200,
                type: 'talent',
                multiplier: 2,
                prerequisites: [],
            },
            {
                name: 'Mechadendrite Use',
                cost: 500,
                type: 'talent',
                specialization: 'Utility',
                prerequisites: [{ type: 'trait', key: 'Mechanicus Implants' }],
            },
            {
                name: 'Basic Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Melee Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
        ],
    },
    missionary: {
        CAREER_INFO: {
            key: 'missionary',
            name: 'WH40K.Career.Missionary',
            description: 'WH40K.Career.MissionaryDesc',
            ranks: [...STANDARD_RANKS],
        },
        CHARACTERISTIC_COSTS: {
            weaponSkill: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            ballisticSkill: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            strength: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            toughness: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            agility: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            intelligence: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            perception: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            willpower: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            fellowship: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
        },
        RANK_1_ADVANCES: [
            { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Charm', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Ecclesiarchy', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperial Creed', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperium', prerequisites: [] },
            { name: 'Dodge', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Heresy', prerequisites: [] },
            { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Medicae', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Performer', cost: 100, type: 'skill', specialization: 'Choose One', prerequisites: [] },
            { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Imperial Creed', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Ecclesiarchy', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'WH40K RPG', prerequisites: [] },
            {
                name: 'Melee Weapon Training',
                cost: 100,
                type: 'talent',
                specialization: 'Primitive',
                prerequisites: [],
            },
            { name: 'Sound Constitution', cost: 200, type: 'talent', prerequisites: [] },
            { name: 'Unshakeable Faith', cost: 200, type: 'talent', prerequisites: [] },
            {
                name: 'Basic Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Flame Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Melee Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            { name: 'Pure Faith', cost: 500, type: 'talent', prerequisites: [] },
        ],
    },
    navigator: {
        CAREER_INFO: {
            key: 'navigator',
            name: 'WH40K.Career.Navigator',
            description: 'WH40K.Career.NavigatorDesc',
            ranks: [...STANDARD_RANKS],
        },
        CHARACTERISTIC_COSTS: {
            weaponSkill: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            ballisticSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            strength: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            toughness: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            agility: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            intelligence: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            perception: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            willpower: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            fellowship: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
        },
        RANK_1_ADVANCES: [
            { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Ciphers', cost: 100, type: 'skill', specialization: 'Nobilite Family', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Navis Nobilite', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperial Navy', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Navigators', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Warp', prerequisites: [] },
            { name: 'Intimidate', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Navigation', cost: 100, type: 'skill', specialization: 'Stellar', prerequisites: [] },
            { name: 'Navigation', cost: 100, type: 'skill', specialization: 'Warp', prerequisites: [] },
            { name: 'Psyniscience', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Astromancy', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'WH40K RPG', prerequisites: [] },
            {
                name: 'Secret Tongue',
                cost: 100,
                type: 'skill',
                specialization: 'Navigator',
                prerequisites: [{ type: 'characteristic', key: 'fellowship', value: 30 }],
            },
            { name: 'Trade', cost: 100, type: 'skill', specialization: 'Astrographer', prerequisites: [] },
            {
                name: 'Melee Weapon Training',
                cost: 100,
                type: 'talent',
                specialization: 'Primitive',
                prerequisites: [],
            },
            {
                name: 'Resistance',
                cost: 200,
                type: 'talent',
                specialization: 'Fear',
                prerequisites: [],
            },
            { name: 'Sound Constitution', cost: 200, type: 'talent', prerequisites: [] },
            { name: 'Navigator', cost: 500, type: 'talent', prerequisites: [] },
            {
                name: 'Pistol Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
        ],
    },
    seneschal: {
        CAREER_INFO: {
            key: 'seneschal',
            name: 'WH40K.Career.Seneschal',
            description: 'WH40K.Career.SeneschalDesc',
            ranks: [...STANDARD_RANKS],
        },
        CHARACTERISTIC_COSTS: {
            weaponSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            ballisticSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            strength: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            toughness: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            agility: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            intelligence: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            perception: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            willpower: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            fellowship: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
        },
        RANK_1_ADVANCES: [
            { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Barter', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Commerce', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Underworld', prerequisites: [] },
            { name: 'Charm', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Deceive', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Disguise', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Dodge', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Evaluate', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Archeotech', prerequisites: [] },
            { name: 'Inquiry', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Performer', cost: 100, type: 'skill', specialization: 'Choose One', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'WH40K RPGs', prerequisites: [] },
            { name: 'Security', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Silent Move', cost: 100, type: 'skill', prerequisites: [] },
            {
                name: 'Sound Constitution',
                cost: 200,
                type: 'talent',
                multiplier: 2,
                prerequisites: [],
            },
            { name: 'Unremarkable', cost: 200, type: 'talent', prerequisites: [] },
            {
                name: 'Basic Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Pistol Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
        ],
    },
    voidMaster: {
        CAREER_INFO: {
            key: 'voidMaster',
            name: 'WH40K.Career.VoidMaster',
            description: 'WH40K.Career.VoidMasterDesc',
            ranks: [...STANDARD_RANKS],
        },
        CHARACTERISTIC_COSTS: {
            weaponSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            ballisticSkill: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            strength: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            toughness: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            agility: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            intelligence: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            perception: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
            willpower: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
            fellowship: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
        },
        RANK_1_ADVANCES: [
            { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperial Navy', prerequisites: [] },
            { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'War', prerequisites: [] },
            { name: 'Dodge', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Drive', cost: 100, type: 'skill', specialization: 'Ground Vehicle', prerequisites: [] },
            { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Xenos', prerequisites: [] },
            { name: 'Gamble', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Navigation', cost: 100, type: 'skill', specialization: 'Stellar', prerequisites: [] },
            { name: 'Pilot', cost: 100, type: 'skill', specialization: 'Flyers', prerequisites: [] },
            { name: 'Pilot', cost: 100, type: 'skill', specialization: 'Space Craft', prerequisites: [] },
            { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Astromancy', prerequisites: [] },
            { name: 'Scrutiny', cost: 100, type: 'skill', prerequisites: [] },
            { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'WH40K RPG', prerequisites: [] },
            { name: 'Trade', cost: 100, type: 'skill', specialization: 'Voidfarer', prerequisites: [] },
            {
                name: 'Melee Weapon Training',
                cost: 100,
                type: 'talent',
                specialization: 'Primitive',
                prerequisites: [],
            },
            { name: 'Nerves of Steel', cost: 100, type: 'talent', prerequisites: [] },
            {
                name: 'Sound Constitution',
                cost: 200,
                type: 'talent',
                multiplier: 2,
                prerequisites: [],
            },
            {
                name: 'Pistol Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
            {
                name: 'Melee Weapon Training',
                cost: 500,
                type: 'talent',
                specialization: 'Universal',
                prerequisites: [],
            },
        ],
    },
} satisfies Record<string, CareerTableData>;

/** Registry key union derived from the consolidated career data. */
type CareerKey = keyof typeof CAREER_TABLE_DATA;

/**
 * Career advancement tables keyed by registry key.
 *
 * Each entry is the raw {@link CAREER_TABLE_DATA} block with the shared
 * `TIER_ORDER` appended. The resulting property order
 * (`CAREER_INFO, CHARACTERISTIC_COSTS, RANK_1_ADVANCES, TIER_ORDER`) and the
 * `TIER_ORDER` value both match the prior per-career ES-module namespace
 * objects exactly, so `getCareerAdvancements()` returns a byte-identical
 * shape to the pre-consolidation implementation. Entries are rebuilt eagerly
 * (not lazily) so the iteration order of `Object.entries(CAREER_TABLES)` —
 * relied on by `getAvailableCareers()` — matches the literal definition order.
 */
export const CAREER_TABLES: Record<CareerKey, CareerTable> = (() => {
    const built = {} as Record<CareerKey, CareerTable>;
    for (const key of Object.keys(CAREER_TABLE_DATA) as CareerKey[]) {
        built[key] = { ...CAREER_TABLE_DATA[key], TIER_ORDER: STANDARD_TIER_ORDER };
    }
    return built;
})();
