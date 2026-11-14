/**
 * Module-level support for the Origin Path Builder (#717): the system-data view,
 * helper types and guards, content-item plans, provenance filtering and the
 * generation constants. They lived above the class in `origin-path-builder.ts`;
 * the builder and the modules beside this one import them from here.
 */
import { SystemConfigRegistry } from '../../../config/game-systems/index.ts';
import type { GameSystemId } from '../../../config/game-systems/types.ts';
import type { WH40KBaseActor } from '../../../documents/base-actor.ts';
import type { WH40KItem } from '../../../documents/item.ts';
import type { WH40KCharacteristic, WH40KItemModifiers } from '../../../types/global.d.ts';
import type { OriginChartLayout } from '../../../utils/origin-chart-layout.ts';
import { iterateResolvedChoices } from '../../../utils/origin-choices.ts';
import type { AmmoWeaponTypes } from '../equipment-grants.ts';
import type { NormalizedOrigin } from '../normalized-origin.ts';
import type { ActiveModifier, CharacterGenerationSlice } from '../types.ts';

/**
 * Union view covering all shapes this builder reads from system data:
 *   - origin-path item system fields  (item.system)
 *   - actor system fields             (actor.system)
 *   - compendium index entry fields   (entry.system)
 *
 * Defined as a plain interface with an index signature so it is structurally
 * compatible with both WH40KItemSystemData and WH40KActorSystemData — both of
 * which the builder casts to this type at various call sites. Without the index
 * signature the compiler rejects the cast because the two DataModel base classes
 * (ItemDataModel vs ActorDataModel) are otherwise structurally incompatible.
 */
export interface OriginPathSystemData {
    // Index signature kept loose for cross-DataModel structural compatibility.
    // The named fields below carry the actual typings the builder relies on.
    // eslint-disable-next-line no-restricted-syntax -- boundary: union view over heterogeneous DataModels (item vs actor vs compendium index)
    [key: string]: unknown;
    // Origin-path item fields
    step?: string;
    identifier?: string;
    availability?: string;
    clip?: { current?: number; max?: number };
    weaponTypes?: string[];
    description?: { value?: string; chat?: string; summary?: string };
    requirements?: { text?: string };
    activeModifiers?: ActiveModifier[];
    homebrew?: { throneGelt?: string; thrones?: string };
    modifiers?: WH40KItemModifiers;
    selectedChoices?: Record<string, string[]>;
    rollResults?: Record<string, { rolled?: number; breakdown?: string } | undefined>;
    grants?: {
        characteristics?: Record<string, number>;
        skills?: GrantItemRaw[];
        talents?: GrantItemRaw[];
        traits?: GrantItemRaw[];
        choices?: GrantChoiceRaw[];
        equipment?: GrantItemRaw[];
        specialAbilities?: Array<{ name?: string; description?: string }>;
        woundsFormula?: string;
        fateFormula?: string;
        /** The origin's Fate-total (`fate.max`) grant; see `originFateContribution`. */
        fateThreshold?: number;
    };
    // Actor-system shaped fields (also read via `actor.system as OriginPathSystemData`)
    originPath?: { divination?: string };
    throneGelt?: number;
    influence?: number;
    characteristics?: Record<string, WH40KCharacteristic>;
    skills?: Record<string, SkillSlice>;
    characterGeneration?: CharacterGenerationSlice;
    // Compendium index-entry shape (also read via `entry.system as OriginPathSystemData`)
    cost?: { dh2?: { homebrew?: { requisition?: number; throneGelt?: number } } };
    /** An ammunition entry's standard-ammunition flag (#699). */
    standard?: boolean;
}

/**
 * Per-skill slice on actor.system.skills.* — the builder reads `entries` for
 * the specialist-skill flatten and resets `advance` to zero on commit.
 */
interface SkillSlice {
    advance?: number;
    entries?: SkillEntry[];
}

/**
 * One specialist-skill entry. Beyond `advance` the builder treats the entry
 * as a passthrough, so unknown extra fields are tolerated via a loose value
 * type rather than `unknown`.
 */
interface SkillEntry {
    advance?: number;
    specialization?: string;
    [extra: string]: string | number | boolean | null | undefined | string[];
}

/**
 * NormalizedOrigin augmented with runtime metadata fields set by _itemToSelectionData.
 * `_id` and `_sourceUuid` are not part of the normalized schema but are attached to
 * selection objects at runtime for compendium source tracking.
 */
export type NormalizedOriginWithMeta = NormalizedOrigin & {
    _id?: string;
    _sourceUuid?: string | null;
    _actorItemId?: string | null;
};

/** A generated characteristic row of the char-gen context (`_prepareCharGenContext`): its key and total. */
export interface GeneratedCharacteristic {
    key: string;
    total: number | null;
}

/** Whether a char-gen context row carries a characteristic key and total. */
// eslint-disable-next-line no-restricted-syntax -- boundary: a type guard over the untyped char-gen context row it narrows
export function isGeneratedCharacteristic(row: unknown): row is GeneratedCharacteristic {
    return (
        row !== null &&
        typeof row === 'object' &&
        'key' in row &&
        typeof row.key === 'string' &&
        'total' in row &&
        (row.total === null || typeof row.total === 'number')
    );
}

export function hasToObject(item: WH40KItem | NormalizedOrigin): item is WH40KItem {
    // Compendium index entries and normalized origin POJOs have no
    // toObject(); calling it threw "item.toObject is not a function" on
    // origin selection. Guard the type and the operand so neither a
    // non-callable toObject nor a non-object item can reach .toObject().
    // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KItem | NormalizedOrigin lacks a typed `toObject`; the structural probe is the type guard's purpose
    return 'toObject' in item && typeof (item as { toObject?: unknown }).toObject === 'function';
}

/**
 * Shape of a single card inside a step layout produced by OriginChartLayout.
 */
export interface StepLayoutCard {
    origin: NormalizedOrigin;
    isSelected: boolean;
    isDisabled: boolean;
    isValidNext: boolean;
    isAdvanced: boolean;
    xpCost: number;
    hasChoices: boolean;
}

/**
 * Shape of one step entry returned by OriginChartLayout.computeFullChart().
 */
export interface StepLayout {
    stepKey: string;
    stepIndex: number;
    cards: StepLayoutCard[];
    maxPosition: number;
    hasSelection: boolean;
}

/**
 * Minimal shape of a raw grant skill/talent/trait entry from system.grants.*.
 * This mirrors the raw compendium data before normalization.
 */
export interface GrantItemRaw {
    name?: string;
    specialization?: string;
    level?: string;
    uuid?: string;
}

/**
 * Minimal shape of a raw grant choice entry from system.grants.choices.
 * This mirrors the raw compendium data before normalization.
 */
export interface GrantChoiceRaw {
    label?: string;
    name?: string;
    type?: string;
    count?: number;
    options?: Array<{ value?: string; name?: string; label?: string; description?: string; grants?: WH40KItemModifiers }>;
}

/**
 * A freeform content item to materialize on the actor at commit time.
 * @see OriginPathBuilder._applyContentItemGrantsFromOrigins
 */
export interface ContentItemPlan {
    type: string;
    name: string;
    description: string;
}

/** The slice of a weapon document the starting-clip lookup reads. */
export interface StandardClipWeapon {
    system?: { type?: string; identifier?: string; clip?: { max?: number } };
}

/** An ammunition row of a compendium index read with the clip lookup's fields. */
export interface AmmoIndexRow {
    _id: string;
    name?: string;
    type?: string;
    system?: { standard?: boolean; weaponTypes?: AmmoWeaponTypes; identifier?: string };
}

/** Item types instantiated from freeform name+description origin-path grants. */
const CONTENT_ITEM_TYPES = new Set(['specialAbility', 'malignancy', 'mutation', 'mentalDisorder']);

/** Strip a trailing "(specialization)" so a composite pick matches the option label. */
function stripCompositeSpecialization(raw: string): string {
    const match = raw.match(/^(.+?)\s*\(.+\)\s*$/);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: capture-group access is `string | undefined` under strict tsconfig, `string` under regular tsconfig
    return match === null ? raw : (match[1] ?? raw).trim();
}

/**
 * Walk one committed origin's `system` and append freeform content-item plans
 * (special ability / malignancy / mutation / mental disorder) to `out`.
 *
 * Two sources are read: fixed `grants.specialAbilities` and choice-resolved
 * options whose choice `type` is a content type, located via the same
 * `selectedChoices` key disambiguation as `OriginPathData._calculateActiveModifiers`.
 */
export function collectContentItemPlans(system: OriginPathSystemData, out: ContentItemPlan[]): void {
    const push = (type: string, name: string | undefined, description: string | undefined): void => {
        if (!CONTENT_ITEM_TYPES.has(type)) return;
        const cleanName = (name ?? '').trim();
        if (cleanName === '') return;
        out.push({ type, name: cleanName, description: description ?? '' });
    };

    // Fixed special-ability grants ({ name, description }).
    for (const ability of system.grants?.specialAbilities ?? []) {
        push('specialAbility', ability.name, ability.description);
    }

    // Choice-resolved content options.
    const selectedChoices = system.selectedChoices ?? {};
    for (const { choice, selectedValues, resolveOption } of iterateResolvedChoices(system.grants?.choices ?? [], selectedChoices)) {
        const choiceType = typeof choice.type === 'string' ? choice.type : '';
        if (!CONTENT_ITEM_TYPES.has(choiceType)) continue;
        for (const selectedValue of selectedValues) {
            const option = resolveOption(selectedValue);
            const name = option?.name ?? option?.label ?? stripCompositeSpecialization(selectedValue);
            push(choiceType, name, option?.description);
        }
    }
}

/**
 * Resolved talent entry ready for display in the selected-origin preview.
 */
export interface PreparedTalent {
    name?: string;
    specialization: string | null;
    uuid: string | null;
    tooltip?: string;
    tooltipData: string;
    hasItem: boolean;
}

/**
 * Resolved trait entry ready for display in the selected-origin preview.
 */
export interface PreparedTrait {
    name?: string;
    level: string | null;
    uuid: string | null;
    tooltip?: string;
    tooltipData: string;
    hasItem: boolean;
}

/**
 * Shape of an equipment item entry stored in equipmentItems and equipmentSelections.
 * These entries are constructed in _loadEquipmentItems and _toggleEquipmentByUuid and
 * keyed off compendium index data; all fields are nullable because they come from optional
 * system sub-documents.
 */
export interface EquipmentItemEntry {
    uuid: string;
    id: string;
    name: string | undefined;
    img: string | undefined;
    type: string | undefined;
    identifier: string | null;
    clipMax: number | null;
    weaponTypes: string[];
    availability: string;
    availabilityLabel: string;
    requisition: number | null;
    throneGelt: number | null;
}

/**
 * Local alias for the internal OriginLike type accepted by OriginChartLayout.
 * NormalizedOrigin is structurally compatible; this alias lets us cast without
 * `as any` at each call site.
 */
export type OriginLikeParam = Parameters<typeof OriginChartLayout.computeFullChart>[0][number];

/**
 * Cast helpers from `NormalizedOrigin` to the structurally-compatible
 * `OriginLikeParam` accepted by OriginChartLayout. The cast cannot be expressed
 * without `unknown` because the two types live in separate files and the
 * compiler cannot see the structural overlap.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: NormalizedOrigin is structurally compatible with OriginLikeParam; OriginChartLayout owns the parameter type
export const asOriginLike = (origin: NormalizedOrigin): OriginLikeParam => origin as unknown as OriginLikeParam;
// eslint-disable-next-line no-restricted-syntax -- boundary: same as asOriginLike, nullable variant
export const asOriginLikeOrNull = (origin: NormalizedOrigin | null): OriginLikeParam | null => origin as unknown as OriginLikeParam | null;
// eslint-disable-next-line no-restricted-syntax -- boundary: NormalizedOrigin[] is structurally compatible with OriginLikeParam[]
export const asOriginLikeArray = (origins: NormalizedOrigin[]): OriginLikeParam[] => origins as unknown as OriginLikeParam[];
export function asOriginLikeMap(selections: Map<string, NormalizedOrigin>): Map<string, OriginLikeParam> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Map<string, NormalizedOrigin> is structurally compatible with Map<string, OriginLikeParam>
    return selections as unknown as Map<string, OriginLikeParam>;
}

/**
 * Minimal shape of a document resolved via fromUuid().
 * Only the fields actually accessed in this file are declared.
 */
export interface ResolvedDocument {
    system?: {
        description?: { value?: string };
        grants?: { skills?: GrantItemRaw[]; talents?: GrantItemRaw[] };
        modifiers?: { characteristics?: Record<string, number | string | undefined> };
    };
    sheet?: { render: (force?: boolean) => void };
}

/**
 * Direction modes for origin path creation
 */
export const DIRECTION = {
    FORWARD: 'forward', // Start at Home World, end at Career
    BACKWARD: 'backward', // Start at Career, end at Home World
};

// eslint-disable-next-line no-restricted-syntax -- boundary: options is an ApplicationV2 options bag; no typed schema available
export function resolveBuilderGameSystem(actor: WH40KBaseActor, options: Record<string, unknown>): GameSystemId {
    const requested = typeof options['gameSystem'] === 'string' && options['gameSystem'] !== '' ? options['gameSystem'] : actor.system.gameSystem;
    if (typeof requested === 'string' && requested !== '' && SystemConfigRegistry.has(requested)) {
        return requested as GameSystemId;
    }
    // Fallback (#222): an actor whose `system.gameSystem` is empty/missing used to
    // throw here — which surfaced as the Origin Path builder opening with ZERO
    // selections (the builder never finished constructing). Recover by deriving the
    // system from the actor's `<system>-<role>` type, then the DH2 canonical default,
    // so the builder always has a valid line to load origins from.
    const [fromType = ''] = typeof actor.type === 'string' ? actor.type.split('-') : [];
    if (fromType !== '' && SystemConfigRegistry.has(fromType)) {
        return fromType as GameSystemId;
    }
    return 'dh2';
}

/** Display labels for game lines, used in adapted-homebrew tooltips. */
const GAME_LINE_LABELS: Record<string, string> = {
    dh1: 'Dark Heresy 1e',
    dh2: 'Dark Heresy 2e',
    rt: 'Rogue Trader',
    dw: 'Deathwatch',
    bc: 'Black Crusade',
    ow: 'Only War',
    im: 'Imperium Maledictum',
};

/**
 * Classify an origin's homebrew provenance relative to the active system:
 * - official for the active system (`raw`)        → neither flag
 * - homebrew here, but official (`raw`) elsewhere → adapted homebrew
 * - no official source in any line                → pure homebrew
 */
export function originProvenanceFlags(
    origin: NormalizedOrigin,
    activeSystem: string,
): { isPureHomebrew: boolean; isAdaptedHomebrew: boolean; adaptedFromLabel: string } {
    const official = origin.officialLines;
    if (official.includes(activeSystem)) return { isPureHomebrew: false, isAdaptedHomebrew: false, adaptedFromLabel: '' };
    if (official.length > 0) {
        const adaptedFromLabel = official.map((line) => GAME_LINE_LABELS[line] ?? line).join(', ');
        return { isPureHomebrew: false, isAdaptedHomebrew: true, adaptedFromLabel };
    }
    return { isPureHomebrew: true, isAdaptedHomebrew: false, adaptedFromLabel: '' };
}

/**
 * Filter an origin list by provenance category (#295), reusing the shared
 * `originProvenanceFlags` classification (raw = neither flag, adapted =
 * isAdaptedHomebrew, pure = isPureHomebrew). All categories enabled is a no-op,
 * so the default state shows everything. Pure (no `this`) so it's unit-testable.
 */
export function filterOriginsByProvenance(
    origins: NormalizedOrigin[],
    activeSystem: string,
    filter: { raw: boolean; adapted: boolean; homebrew: boolean },
): NormalizedOrigin[] {
    if (filter.raw && filter.adapted && filter.homebrew) return origins;
    return origins.filter((origin) => {
        const { isPureHomebrew, isAdaptedHomebrew } = originProvenanceFlags(origin, activeSystem);
        if (isPureHomebrew) return filter.homebrew;
        if (isAdaptedHomebrew) return filter.adapted;
        return filter.raw;
    });
}

/** The nine characteristics character creation generates, in sheet order. */
export const GENERATION_CHARACTERISTICS = [
    'weaponSkill',
    'ballisticSkill',
    'strength',
    'toughness',
    'agility',
    'intelligence',
    'perception',
    'willpower',
    'fellowship',
];

/** The dice rolled on top of the characteristic base in both dice-driven modes; see `OriginPathBuilder.CHARACTERISTIC_ROLL_FORMULA`. */
export const CHARACTERISTIC_ROLL_FORMULA = '2d10';
