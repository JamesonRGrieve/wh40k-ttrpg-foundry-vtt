/**
 * Compendium-sourced homeworld mechanics reader (#338).
 *
 * Per Direction #7, the mechanical values for the DH2 origin-path
 * home-worlds (characteristic modifiers, Fate threshold, Emperor's
 * Blessing breakpoint, starting wounds, key aptitude, and the named
 * home-world bonus) are authored once in the compendium packs
 * (`src/packs/dark-heresy-2/dh2-{within,beyond,without}-origins-homeworlds`),
 * NOT duplicated in `src/`. Each home-world is an `originPath` document
 * whose `system` block carries everything the GM info dialogs display.
 *
 * This module owns the single read path: given a pack name, it loads the
 * pack's documents and projects each into a {@link HomeworldMechanics}
 * view-model keyed by the document's stable `system.identifier`
 * (kebab-case, e.g. `agri-world`). The supplement-specific rider shapes
 * + resolution logic stay in the sibling `*-homeworlds.ts` registries
 * (the `bc-gifts.ts` split: shape + resolver in `src/`, catalogue in
 * packs, caller owns I/O).
 *
 * No DataModel coupling. The only Foundry surface touched is the
 * `game.packs` collection, which is a framework boundary (untyped
 * document shape); the access is narrowed locally to the fields read.
 */

/**
 * The basic mechanical values a homeworld info card displays, projected
 * from a single `originPath` compendium document. Characteristic-mod
 * lists hold characteristic *ids* (e.g. `fellowship`) so each caller can
 * format them in its own house style; `aptitudes` and `bonus*` hold the
 * already-authored display strings.
 */
export interface HomeworldMechanics {
    /** Stable key — the document's `system.identifier` (kebab-case, e.g. `agri-world`). */
    readonly id: string;
    /** Document display name (e.g. `Agri-World`). */
    readonly label: string;
    /** Characteristic ids with a positive modifier, in document order. */
    readonly charModsPositive: readonly string[];
    /** Characteristic ids with a negative modifier, in document order. */
    readonly charModsNegative: readonly string[];
    /** Base Fate threshold. */
    readonly fateBase: number;
    /** The d10 face required to trigger Emperor's Blessing (an extra Fate point). */
    readonly emperorsBlessingMin: number;
    /** Key (favoured) aptitude(s) — already-localized display strings. */
    readonly aptitudes: readonly string[];
    /** Named home-world bonus — the rules-text title. */
    readonly bonusName: string;
    /** Named home-world bonus — the rules-text body. */
    readonly bonusDescription: string;
    /** Starting-wounds flat component (the `N` in `N+1d5`). */
    readonly woundsFlat: number;
    /** Starting-wounds dice count (the `1` in `N+1d5`). */
    readonly woundsDice: number;
    /** Starting-wounds die faces (the `5` in `N+1d5`). */
    readonly woundsFaces: number;
}

/* -------------------------------------------- */
/*  Raw document shape (compendium boundary)    */
/* -------------------------------------------- */

/** A single home-world bonus entry under `system.grants.specialAbilities`. */
interface RawSpecialAbility {
    readonly name?: string;
    readonly description?: string;
}

/** The subset of an `originPath` document's `system` block this reader projects. */
interface RawHomeworldSystem {
    readonly identifier?: string;
    readonly modifiers?: { readonly characteristics?: Record<string, number> };
    readonly grants?: {
        readonly fateThreshold?: number;
        readonly woundsFormula?: string;
        readonly aptitudes?: readonly string[];
        readonly specialAbilities?: readonly RawSpecialAbility[];
    };
    readonly notes?: { readonly dh2?: string };
}

/** The subset of a compendium document this reader projects. */
interface RawHomeworldDoc {
    readonly name?: string;
    readonly system?: RawHomeworldSystem;
}

/** Minimal pack surface: a collection whose documents this reader loads. */
interface HomeworldPack {
    /** Optional — a locked or unavailable pack may not expose it; the reader guards for that. */
    readonly getDocuments?: () => Promise<readonly RawHomeworldDoc[]>;
}

/* -------------------------------------------- */
/*  Parsers                                      */
/* -------------------------------------------- */

/** `N+1d5` → `{ flat, dice, faces }`. Returns `null` on any non-matching string. */
const WOUNDS_FORMULA = /^(\d+)\+(\d+)d(\d+)$/;

interface WoundsParts {
    readonly flat: number;
    readonly dice: number;
    readonly faces: number;
}

export function parseWoundsFormula(formula: string): WoundsParts | null {
    const match = WOUNDS_FORMULA.exec(formula.trim());
    if (match === null) return null;
    const [, flat, dice, faces] = match;
    // The regex's three capture groups are all-or-nothing on a match, so they're present here.
    return { flat: Number(flat), dice: Number(dice), faces: Number(faces) };
}

/** Extract the Emperor's-Blessing breakpoint `N` from a `"...roll of N+ on 1d10..."` note. */
const BLESSING_BREAKPOINT = /roll of (\d+)\+/;

export function parseEmperorsBlessingMin(note: string): number | null {
    const match = BLESSING_BREAKPOINT.exec(note);
    if (match === null) return null;
    const [, min] = match;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json (flag on) types the capture `string | undefined` and requires this guard; tsconfig.test.json (ESLint parser project, flag off) does not
    if (min === undefined) return null;
    return Number(min);
}

/** Split a `{ char: signedValue }` map into ordered positive / negative id lists. */
function splitCharacteristicMods(characteristics: Record<string, number>): {
    positive: string[];
    negative: string[];
} {
    const positive: string[] = [];
    const negative: string[] = [];
    for (const [characteristic, value] of Object.entries(characteristics)) {
        if (value > 0) positive.push(characteristic);
        else if (value < 0) negative.push(characteristic);
    }
    return { positive, negative };
}

/* -------------------------------------------- */
/*  Reader                                       */
/* -------------------------------------------- */

/** Project one compendium document into a {@link HomeworldMechanics}, or `null` when it lacks an identifier. */
function projectDoc(doc: RawHomeworldDoc): HomeworldMechanics | null {
    const system = doc.system;
    const identifier = system?.identifier;
    if (system === undefined || identifier === undefined || identifier === '') return null;

    const characteristics = system.modifiers?.characteristics ?? {};
    const { positive, negative } = splitCharacteristicMods(characteristics);

    const grants = system.grants;
    const wounds = parseWoundsFormula(grants?.woundsFormula ?? '') ?? { flat: 0, dice: 1, faces: 5 };
    const blessing = parseEmperorsBlessingMin(system.notes?.dh2 ?? '') ?? 0;
    const firstAbility = grants?.specialAbilities?.[0];

    return {
        id: identifier,
        label: doc.name ?? identifier,
        charModsPositive: positive,
        charModsNegative: negative,
        fateBase: grants?.fateThreshold ?? 0,
        emperorsBlessingMin: blessing,
        aptitudes: grants?.aptitudes ?? [],
        bonusName: firstAbility?.name ?? '',
        bonusDescription: firstAbility?.description ?? '',
        woundsFlat: wounds.flat,
        woundsDice: wounds.dice,
        woundsFaces: wounds.faces,
    };
}

/**
 * Load a homeworld pack and project each document into a
 * {@link HomeworldMechanics}, keyed by `system.identifier`. Missing pack
 * (e.g. before the world is ready, or pack disabled) yields an empty Map
 * rather than throwing, so callers can render an empty grid gracefully.
 *
 * @param packName Fully-qualified pack id, e.g. `wh40k-rpg.dh2-within-origins-homeworlds`.
 */
export async function readHomeworldMechanics(packName: string): Promise<Map<string, HomeworldMechanics>> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs.get returns Foundry's CompendiumCollection (untyped document shape); narrowed locally to the HomeworldPack surface this reader reads
    const pack = game.packs.get(packName) as HomeworldPack | undefined;
    const out = new Map<string, HomeworldMechanics>();
    if (pack?.getDocuments === undefined) return out;

    // Call as a method (not a detached reference) so Foundry's CompendiumCollection
    // keeps its `this` binding inside getDocuments().
    const docs = await pack.getDocuments();
    for (const doc of docs) {
        const mechanics = projectDoc(doc);
        if (mechanics !== null) out.set(mechanics.id, mechanics);
    }
    return out;
}
