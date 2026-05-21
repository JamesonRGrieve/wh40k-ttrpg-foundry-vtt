/**
 * Mental Disorders table + roll helper (#116 — core.md §"Insanity").
 *
 * Insanity Points accumulate during play; at 40 / 60 / 80 IP, the
 * character rolls on the Disorders table and gains a Mental Disorder.
 * Each disorder has a trigger condition and a mechanical effect.
 *
 * Severity tiers map directly onto `MentalDisorderData.severity`
 * ('minor' / 'severe' / 'acute'), so this table is also the canonical
 * registry the chat-card dispatcher feeds the GM dialog.
 *
 * This module is pure logic. The dialog (`disorder-roll-dialog.ts`)
 * picks a severity, calls `rollDisorder(severity, rng?)`, and emits
 * the chat card. `rng` is injectable so stories/tests stay deterministic.
 */

/** Three canonical severity tiers, mirroring `MentalDisorderData.severity`. */
export type DisorderSeverity = 'minor' | 'severe' | 'acute';

/** Stable identifiers for each canonical disorder. */
export type DisorderId = 'phobia' | 'paranoia' | 'delusion' | 'schizoid' | 'dissociative' | 'catatonia' | 'obsession' | 'compulsion' | 'anxiety' | 'echolalia';

/** Single Disorders-table entry. */
export interface DisorderDef {
    /** Stable identifier (used for chat cards, item creation, telemetry). */
    readonly id: DisorderId;
    /** i18n key suffix under `WH40K.DisorderRoll.Disorders.<key>.Name` / `.Effect`. */
    readonly key: string;
    /** Display name shown when no localization is wired up (English fallback). */
    readonly name: string;
    /** Short prose effect summary (English fallback). */
    readonly effect: string;
    /** Severity tiers this disorder can appear under. */
    readonly severities: ReadonlyArray<DisorderSeverity>;
}

/** Canonical Disorders registry — ten entries spanning all three tiers. */
export const DISORDERS_TABLE: ReadonlyArray<DisorderDef> = Object.freeze([
    {
        id: 'phobia',
        key: 'phobia',
        name: 'Phobia',
        effect: 'When confronted with the subject of the phobia, the character must pass a Willpower test or suffer a -10 penalty to all tests in its presence.',
        severities: ['minor', 'severe', 'acute'],
    },
    {
        id: 'paranoia',
        key: 'paranoia',
        name: 'Paranoia',
        effect: 'The character treats unfamiliar NPCs as hostile and suffers -10 on Fellowship tests with anyone not already a trusted ally.',
        severities: ['minor', 'severe', 'acute'],
    },
    {
        id: 'delusion',
        key: 'delusion',
        name: 'Delusion',
        effect: 'The character holds an unshakable false belief. Any test that requires acknowledging the truth contradicting the delusion suffers -10.',
        severities: ['minor', 'severe'],
    },
    {
        id: 'schizoid',
        key: 'schizoid',
        name: 'Schizoid',
        effect: 'The character is socially detached: -10 Fellowship for prolonged interactions; immune to first-encounter Fear ratings 1.',
        severities: ['minor', 'severe'],
    },
    {
        id: 'dissociative',
        key: 'dissociative',
        name: 'Dissociative',
        effect: 'Under stress, the character may lose minutes to hours. The GM may rule the character cannot recall recent events tied to the trauma.',
        severities: ['severe', 'acute'],
    },
    {
        id: 'catatonia',
        key: 'catatonia',
        name: 'Catatonia',
        effect: 'When triggered, the character is immobile for 1d5 rounds and may take no actions; a Willpower test each round to break free.',
        severities: ['acute'],
    },
    {
        id: 'obsession',
        key: 'obsession',
        name: 'Obsession',
        effect: 'The character is fixated on a person, object, or idea. Any test to act contrary to the obsession suffers -10.',
        severities: ['minor', 'severe'],
    },
    {
        id: 'compulsion',
        key: 'compulsion',
        name: 'Compulsion',
        effect: 'The character must perform a specific ritualised behaviour when stressed; failing to do so imposes -10 on all tests until completed.',
        severities: ['minor', 'severe'],
    },
    {
        id: 'anxiety',
        key: 'anxiety',
        name: 'Anxiety',
        effect: 'Under pressure, the character suffers -10 on Willpower tests and is treated as Fatigued in encounter situations.',
        severities: ['minor', 'severe'],
    },
    {
        id: 'echolalia',
        key: 'echolalia',
        name: 'Echolalia',
        effect: 'Under stress the character repeats fragments of nearby speech, imposing -10 on Stealth and Deceive tests while affected.',
        severities: ['minor', 'severe'],
    },
]);

/** Quick lookup helper. Returns null when the id is unknown. Accepts any string so callers can probe for membership without a pre-cast. */
export function getDisorder(id: string): DisorderDef | null {
    return DISORDERS_TABLE.find((d) => d.id === id) ?? null;
}

/** Filter the table to entries available at the given severity tier. */
export function listDisordersBySeverity(severity: DisorderSeverity): DisorderDef[] {
    return DISORDERS_TABLE.filter((d) => d.severities.includes(severity)).slice();
}

/** Injectable RNG signature: a 0..1 generator (matches `Math.random`). */
export type Rng = () => number;

/**
 * Pick a Disorder appropriate to the given severity tier. Pure given
 * `rng` (defaults to `Math.random`). Returns null only if the table is
 * empty at the tier — which the static table forbids today.
 */
export function rollDisorder(severity: DisorderSeverity, rng: Rng = Math.random): DisorderDef | null {
    const pool = listDisordersBySeverity(severity);
    if (pool.length === 0) return null;
    const raw = Number(rng());
    const r = Number.isFinite(raw) ? Math.min(0.9999999, Math.max(0, raw)) : 0;
    const idx = Math.floor(r * pool.length);
    return pool[idx] ?? null;
}
