/**
 * Elite Advance definitions (core.md §"Elite Advances", §"Inquisitor",
 * §"Psyker", §"Untouchable"; beyond.md §"Astropath").
 *
 * Each Elite Advance is an item the compendium ships; the rules layer
 * exposes the canonical XP cost + prerequisite shape so the advancement
 * dialog can validate purchases without re-deriving them per system.
 */

export interface EliteAdvancePrerequisite {
    type: 'characteristic' | 'skill' | 'talent';
    key: string;
    /** For characteristics: minimum total. For skills: minimum advance level. */
    minimum: number;
}

export interface EliteAdvanceDefinition {
    id: string;
    label: string;
    description: string;
    xpCost: number;
    prerequisites: EliteAdvancePrerequisite[];
}

export const ELITE_ADVANCES: Record<string, EliteAdvanceDefinition> = {
    astropath: {
        id: 'astropath',
        label: 'Astropath',
        description:
            'You are bound to the Emperor\'s soul and serve as a telepathic relay. Gains Bound to the Highest Power (ignore one Psychic Phenomena roll per session) and Supreme Telepath (+1 PR when using Telepathy powers).',
        xpCost: 1000,
        prerequisites: [
            { type: 'characteristic', key: 'willpower', minimum: 40 },
            { type: 'skill', key: 'psyniscience', minimum: 1 },
            { type: 'talent', key: 'Sanctioned', minimum: 1 },
        ],
    },
    inquisitor: {
        id: 'inquisitor',
        label: 'Inquisitor',
        description: 'You take the Rosette and become an Inquisitor of the Holy Ordos. Grants the Inquisitor talent and unlocks Inquisitor special rules.',
        xpCost: 3000,
        prerequisites: [{ type: 'characteristic', key: 'willpower', minimum: 50 }],
    },
    psyker: {
        id: 'psyker',
        label: 'Psyker',
        description: 'You awaken the witch within. Gain Psy Rating 1, Sanctioned talent, and Psyniscience as a Known skill.',
        xpCost: 1000,
        prerequisites: [{ type: 'characteristic', key: 'willpower', minimum: 35 }],
    },
    untouchable: {
        id: 'untouchable',
        label: 'Untouchable',
        description: 'The galaxy recoils from your absence. Permanent immunity to psychic powers; you do not register on the Warp.',
        xpCost: 2000,
        prerequisites: [],
    },
};
