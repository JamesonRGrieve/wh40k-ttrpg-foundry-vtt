/**
 * Vehicle hazard tables (core.md §"Out Of Control, Crashing, And
 * Falling Over", §"On Fire!", §"Repairing Vehicles").
 *
 * Each table maps a d10 / d5 result to a narrative effect description.
 * The roll consumer (chat-card hook in a future commit) picks the
 * right table by hazard type and renders the result.
 *
 * Repair difficulty maps a vehicle's integrity tier to a Tech-Use
 * difficulty modifier — input to the standard d100 test target.
 */

export type HazardKind = 'outOfControl' | 'crash' | 'onFire';

export interface HazardEntry {
    /** Roll bucket on a d10 (or d5 — see `dieSize`). */
    range: [number, number];
    label: string;
    description: string;
}

export interface HazardTable {
    dieSize: number;
    entries: HazardEntry[];
}

export const OUT_OF_CONTROL_TABLE: HazardTable = {
    dieSize: 10,
    entries: [
        { range: [1, 2], label: 'Wide Skid', description: 'Vehicle drifts d5 metres in a random direction; no further consequence.' },
        { range: [3, 4], label: 'Spin', description: 'Vehicle spins 90° in a random direction; passengers must pass an Agility test or take 1 fatigue.' },
        {
            range: [5, 6],
            label: 'Sideswipe',
            description: 'Vehicle scrapes its flank against terrain; side armour takes 1d5 wear (reduces side AP by 1 until repaired).',
        },
        { range: [7, 8], label: 'Stall', description: 'Engine stalls. Vehicle must Hot-Wire to restart next round; until then it cannot accelerate.' },
        { range: [9, 9], label: 'Roll', description: 'Vehicle rolls. All occupants take 1d10+3 Impact damage; vehicle takes 1d10 to integrity.' },
        { range: [10, 10], label: 'Crash', description: 'Resolve as Crash (see Crash table).' },
    ],
};

export const CRASH_TABLE: HazardTable = {
    dieSize: 10,
    entries: [
        { range: [1, 3], label: 'Glancing', description: 'Vehicle takes (speed) integrity damage; occupants take 1d10 Impact at the body location.' },
        { range: [4, 6], label: 'Solid Hit', description: 'Vehicle takes (speed × 2) integrity damage; occupants take 1d10+5 Impact + 1 fatigue.' },
        { range: [7, 8], label: 'Wreckage', description: 'Vehicle takes (speed × 3) integrity damage; occupants take 2d10 Impact at a random hit location.' },
        { range: [9, 9], label: 'Inferno', description: 'Vehicle ignites — apply On Fire status; occupants take 2d10 Impact + 1d5 Energy.' },
        {
            range: [10, 10],
            label: 'Catastrophic',
            description: 'Vehicle is destroyed outright; occupants take 3d10+5 damage and must roll on the Crash table again at half effect.',
        },
    ],
};

export const ON_FIRE_TABLE: HazardTable = {
    dieSize: 10,
    entries: [
        {
            range: [1, 4],
            label: 'Smouldering',
            description: 'Vehicle takes 1 integrity damage per round until the fire is extinguished. Occupants take 1d10 Energy.',
        },
        {
            range: [5, 7],
            label: 'Blaze',
            description: 'Vehicle takes 1d5 integrity damage per round. Occupants take 1d10+3 Energy and must pass an Agility test to extinguish self.',
        },
        {
            range: [8, 9],
            label: 'Inferno',
            description: 'Vehicle takes 1d10 integrity damage per round. Occupants take 2d10 Energy and gain Burning condition.',
        },
        { range: [10, 10], label: 'Detonation', description: "Vehicle's fuel/munitions detonate; resolve as a Crash, then destroy the vehicle." },
    ],
};

const HAZARD_TABLES: Record<HazardKind, HazardTable> = {
    outOfControl: OUT_OF_CONTROL_TABLE,
    crash: CRASH_TABLE,
    onFire: ON_FIRE_TABLE,
};

export function getHazardTable(kind: HazardKind): HazardTable {
    return HAZARD_TABLES[kind];
}

export function resolveHazardRoll(kind: HazardKind, rollTotal: number): HazardEntry | undefined {
    const table = getHazardTable(kind);
    const t = Math.max(1, Math.min(table.dieSize, Math.trunc(rollTotal)));
    return table.entries.find((e) => t >= e.range[0] && t <= e.range[1]);
}

/**
 * Tech-Use repair difficulty modifier for a damaged vehicle, keyed on
 * the integrity-deficit tier (core.md §"Repairing Vehicles").
 *
 * @param integrityCurrent current integrity value
 * @param integrityMax max integrity value
 * @returns d100 test modifier (negative = harder)
 */
export function getRepairDifficulty(integrityCurrent: number, integrityMax: number): number {
    if (integrityMax <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, integrityCurrent / integrityMax));
    if (ratio >= 0.75) return 0; // Ordinary
    if (ratio >= 0.5) return -10; // Difficult
    if (ratio >= 0.25) return -20; // Hard
    return -30; // Very Hard
}
