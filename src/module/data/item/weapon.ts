import type { ReloadResult } from '../../actions/reload-action-manager.ts';
import { SYSTEM_ID } from '../../constants.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { capitalize } from '../../handlebars/handlebars-helpers.ts';
import { t } from '../../i18n/t.ts';
import { consumeRounds, frontSegment, type MagazineSegment, magazineFromLegacy, magazineTotal } from '../../rules/magazine.ts';
import { applyDeactivationQualities, deactivationStatDeltas, isDeactivated, type WeaponActivationConfig } from '../../rules/weapon-activation.ts';
import {
    activeFiringMode,
    applyModeQualities,
    hasFiringModes,
    modeAttackType,
    modeCharacteristic,
    modeDamageBonus,
    modeDamageFormula,
    modeDamageType,
    modeIsSingleUse,
    modePenetration,
    modeRange,
    modeRateOfFire,
    modeWeaponClass,
    type WeaponFiringMode,
} from '../../rules/weapon-modes.ts';
import {
    inferActiveGameLine,
    isLineVariantContainer,
    resolveLineVariant,
    type SupportedLineKey,
    tryResolveLineVariant,
} from '../../utils/item-variant-utils.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import AttackTemplate from '../shared/attack-template.ts';
import DamageTemplate from '../shared/damage-template.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate, { type EquippableState } from '../shared/equippable-template.ts';
import { renameKeys } from '../shared/migrate-rename.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';
import SubtletyAdjusterTemplate from '../shared/subtlety-adjuster-template.ts';
import type { SubtletyAdjusterKind } from '../shared/subtlety-adjuster.ts';
import { WEAPON_FACING_CHOICES, WEAPON_MOUNTING_CHOICES, type WeaponFacing, type WeaponMounting } from '../shared/vehicle-mounting.ts';

/**
 * Valid weapon `class` / `type` choices. Shared between `defineSchema()` and the
 * `_migrateData` coercion so a corrupt/legacy value (e.g. an imported `"low-tech"`
 * type) is normalized to a valid choice instead of failing strict validation —
 * which, for an owned item, drops it from the actor and empties the inventory.
 */
const WEAPON_CLASS_CHOICES = ['melee', 'pistol', 'basic', 'heavy', 'thrown', 'exotic'] as const;

/** Weapons already reported this session, so a re-render doesn't re-nag the GM. */
const reportedUnresolvedVariants = new Set<string>();

/**
 * Resolve a boolean per-line variant, treating an unresolved container as an
 * ERROR rather than coercing it (#503).
 *
 * `Boolean(unresolvedContainer)` is `true`, so the old code turned "I could not
 * work out which line this weapon belongs to" into "this weapon is melee" — the
 * one answer that unlocks Charge and WS-based attacks. An unresolved flag now
 * falls back to `false` (the inert answer) and is surfaced to the GM naming the
 * weapon and its actor.
 * @param {unknown} value  Scalar boolean, or a per-line variant container.
 * @param {SupportedLineKey} lineKey  Active game line.
 * @param {unknown} parent  Owning item, for the report.
 * @param {string} field  Field name, for the report.
 * @returns {boolean}  The resolved flag, or `false` when unresolved.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: `value` is a schema field that may still be an unresolved per-line container (tryResolveLineVariant narrows it on the next line); `parent` is the owning Foundry Item, read only for its name/uuid in the report
function resolveFlagVariant(value: unknown, lineKey: SupportedLineKey, parent: unknown, field: string): boolean {
    const outcome = tryResolveLineVariant(value, lineKey);
    if (outcome.resolved) return outcome.value === true;

    const item = parent as { name?: string | null; uuid?: string; actor?: { name?: string | null } | null } | null;
    const itemName = item?.name ?? 'Unknown weapon';
    const key = `${item?.uuid ?? itemName}|${field}`;
    if (!reportedUnresolvedVariants.has(key)) {
        reportedUnresolvedVariants.add(key);
        const actorName = item?.actor?.name ?? 'no actor';
        console.error(`${SYSTEM_ID} | weapon: could not resolve per-line '${field}' for "${itemName}" (${actorName}); treating as false rather than guessing.`);
        if (typeof ui !== 'undefined' && typeof game !== 'undefined') {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `ui.notifications` is undefined until Foundry's `setup` phase
            ui.notifications?.warn(game.i18n.format('WH40K.Warning.UnresolvedWeaponVariant', { item: itemName, field, actor: actorName }));
        }
    }
    return false;
}
const WEAPON_TYPE_CHOICES = [
    'primitive',
    'las',
    'solid-projectile',
    'bolt',
    'melta',
    'plasma',
    'flame',
    'launcher',
    'explosive',
    'power',
    'chain',
    'shock',
    'force',
    'exotic',
    'xenos',
] as const;

// Valid `reload` choices — keep in sync with the `reload` StringField schema
// (see defineSchema). Used by #coerceEnums to normalise legacy/typographic values.
const WEAPON_RELOAD_CHOICES = ['-', 'free', 'half', 'full', '2-full', '3-full', '4-full', '5-full', '6-full'] as const;

// Loose dictionary used as a structural shape for both pre-migration source data
// and the data dictionaries passed to Foundry's update/create APIs.
type DataDict = { [key: string]: SerializableValue };
type SerializableValue = string | number | boolean | null | undefined | SerializableValue[] | DataDict | Set<string>;

/** Minimal shape of an ammunition Item passed to loadAmmo(). */
interface AmmoItemLike {
    type: string;
    name: string;
    uuid: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item.update return type is opaque; Promise<unknown> is the honest type here
    update: (data: DataDict) => Promise<unknown>;
    system: {
        clipModifier?: number;
        quantity?: number;
        modifiers?: { damage?: number; penetration?: number; range?: number; attack?: number };
        addedQualities?: Set<string>;
        removedQualities?: Set<string>;
        fireRateOverride?: number | null;
        hitEffect?: string;
        damage?: { formula?: string; type?: string; bonus?: number; penetration?: number };
    };
}

/**
 * Extract the cached effect fields an ammunition item contributes to a magazine
 * segment (#ammo-system). Shared by `loadAmmo` and `buildClip` so the segment shape
 * is populated identically. `damageOverride` is set only for a full-profile round
 * (a warhead / sniper round with its own `formula`); a delta round leaves it absent
 * and carries its numbers in `modifiers`.
 */
function ammoSegmentEffects(
    system: AmmoItemLike['system'],
): Pick<
    MagazineSegment,
    'modifiers' | 'clipModifier' | 'addedQualities' | 'removedQualities' | 'attack' | 'damageType' | 'damageOverride' | 'fireRateOverride' | 'hitEffect'
> {
    const {
        clipModifier = 0,
        modifiers = {},
        addedQualities = new Set<string>(),
        removedQualities = new Set<string>(),
        fireRateOverride = null,
        hitEffect = '',
        damage,
    } = system;
    const { damage: damageMod = 0, penetration: penMod = 0, range: rangeMod = 0, attack: attackMod = 0 } = modifiers;
    const formula = damage?.formula ?? '';
    const base = {
        modifiers: { damage: damageMod, penetration: penMod, range: rangeMod },
        clipModifier,
        addedQualities: Array.from(addedQualities),
        removedQualities: Array.from(removedQualities),
        attack: attackMod,
        damageType: damage?.type ?? '',
        fireRateOverride,
        hitEffect,
    };
    // `damageOverride` is present ONLY for a full-profile round (formula set); an
    // absent key (not `undefined`) keeps the segment delta-mode under exactOptionalPropertyTypes.
    return formula !== '' ? { ...base, damageOverride: { formula, bonus: damage?.bonus ?? 0, penetration: damage?.penetration ?? 0 } } : base;
}

/** Minimal shape of an inventory ammunition item used by _returnRoundsToInventory(). */
interface InventoryAmmoItem {
    uuid: string;
    type: string;
    name: string;
    system: { quantity: number };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Item.update return type is opaque; Promise<unknown> is the honest type here
    update: (d: DataDict) => Promise<unknown>;
}

/**
 * The schema field `reload` collides with the `reload()` method on this class. At runtime
 * the instance property (schema field) shadows the prototype method, but TS sees the method
 * type. These helpers route field access through `Reflect.get` / `Reflect.set` with a typed
 * narrow result so no `as unknown` cast is required at the call site.
 */
interface ReloadFieldHost {
    reload?: string;
}
function getReloadField(weapon: object): string {
    const value = (weapon as ReloadFieldHost).reload;
    return typeof value === 'string' ? value : '-';
}
function setReloadField(weapon: object, value: string): void {
    (weapon as ReloadFieldHost).reload = value;
}

/** Result of `fromUuid()` narrowed for ammo restock fallback. */
interface SourceItemLike {
    toObject: () => { system: { quantity: number } } & DataDict;
}

/** Minimal shape of the owning actor used by ammo helpers. */
interface AmmoActorLike {
    items: {
        find: (pred: (i: InventoryAmmoItem) => boolean) => InventoryAmmoItem | undefined;
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.createEmbeddedDocuments return type is opaque; Promise<unknown> is the honest type here
    createEmbeddedDocuments: (type: string, data: DataDict[]) => Promise<unknown>;
}

/**
 * Data model for Weapon items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 * @mixes AttackTemplate
 * @mixes DamageTemplate
 * @mixes SubtletyAdjusterTemplate
 */
export default class WeaponData extends ItemDataModel.mixin(
    DescriptionTemplate,
    PhysicalItemTemplate,
    EquippableTemplate,
    AttackTemplate,
    DamageTemplate,
    SubtletyAdjusterTemplate,
) {
    // Narrow the foundry-typed `parent` to our concrete document for downstream access.
    declare parent: WH40KItem;
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    // From SubtletyAdjusterTemplate (mixin static type does not surface it).
    declare subtletyAdjuster?: { kind: SubtletyAdjusterKind; delta: number; minAbsoluteDelta: number; requiresEquipped: boolean };
    declare class: string;
    declare type: string;
    declare twoHanded: boolean;
    declare melee: boolean;
    /** Vehicle weapon mounting; blank on a personal-scale weapon. */
    declare mounting: WeaponMounting;
    /** Facing the mounted weapon's fire arc is measured from; blank when unmounted. */
    declare facing: WeaponFacing;
    /**
     * When `true`, this weapon is granted to every newly-created creature actor
     * (character / npc) by the default-grant hook, so e.g. an Unarmed strike is
     * always present. Content-declared policy (read by `default-grants.ts`); the
     * system code never name-matches the item (Direction #7).
     */
    declare grantedByDefault: boolean;
    declare clip: { max: number; value: number; type: string; magazine: MagazineSegment[] };
    // Per-weapon jam state (#411). May be undefined at runtime when the schema
    // fails to initialise (mirrors loadedAmmo), so consumers guard via isJammed.
    declare jammed: boolean | undefined;
    // Combi-weapon single-use secondary spent state (#ammo-system): true once the
    // active single-use mode has fired, until the weapon reloads. May be undefined
    // if the schema failed to initialise, so consumers guard.
    declare secondaryUsed: boolean | undefined;
    // Note: 'reload' schema field accessed via [key: string]: any; to avoid conflict with reload() method.
    // `loadedAmmo` is no longer a stored field — it is a derived getter over the
    // chambered (front) magazine segment (#ammo-system); see `get loadedAmmo()`.
    declare modifications: Array<{
        uuid: string;
        name: string;
        active: boolean;
        category: string;
        cachedModifiers: { damage: number; penetration: number; toHit: number; range: number; weight: number };
    }>;
    // `required: false` schema field — absent on weapons authored without an
    // activation block, so optional at runtime. The live on/off toggle is
    // `state.activated` (EquippableState), not part of this config.
    declare activation: WeaponActivationConfig | undefined;
    declare requiredTraining: string;
    declare notes: string;

    // Derived in prepareDerivedData()
    declare _modificationModifiers: { damage: number; penetration: number; toHit: number; range: number; weight: number };

    // Properties from PhysicalItemTemplate
    declare craftsmanship: string;
    declare weight: number;

    // equipped / inShipStorage are runtime state — inherited via EquippableTemplate's system.state.
    declare state: EquippableState;

    // Properties from DamageTemplate
    declare damage: { formula: string; type: string; bonus: number; penetration: number };
    declare special: Set<string>;
    declare modes: WeaponFiringMode[];
    declare activeMode: number;

    // Properties from AttackTemplate
    declare attack: {
        type: string;
        characteristic: string;
        modifier: number;
        range: { value: number; units: string; special: string };
        rateOfFire: { single: boolean; semi: number; full: number };
    };

    // Getters from DamageTemplate
    declare damageLabel: string;

    // Getters from AttackTemplate
    declare rangeLabel: string;
    declare rateOfFireLabel: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but isn't statically typed as such; cast required for schema registration
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.StringField,

            // Weapon classification (usage pattern only)
            class: new fields.StringField({
                required: true,
                initial: 'melee',
                choices: [...WEAPON_CLASS_CHOICES],
            }),

            type: new fields.StringField({
                required: true,
                initial: 'primitive',
                choices: [...WEAPON_TYPE_CHOICES],
            }),

            // Weapon properties
            twoHanded: new fields.BooleanField({ required: true, initial: false }),
            melee: new fields.BooleanField({ required: true, initial: false }),

            // Content-declared policy: grant this weapon to every new creature
            // actor (see default-grants.ts). Shared (never variantized) — the
            // grant decision is line-agnostic; per-line stats still resolve from
            // the variant containers when owned.
            grantedByDefault: new fields.BooleanField({ required: false, initial: false }),

            // Ammunition. `magazine` is the ordered clip loadout (#ammo-system): a
            // list of round-segments fired front-first, each a run of one ammo type
            // (empty `ammoUuid` = generic/standard rounds). `value` is the derived
            // total (Σ segment counts), synced in prepareDerivedData; `max`/`type`
            // are the base clip size and ammo family.
            clip: new fields.SchemaField({
                max: new fields.NumberField({ required: true, initial: 0, min: 0 }),
                value: new fields.NumberField({ required: true, initial: 0, min: 0 }),
                type: new fields.StringField({ required: false, blank: true }),
                magazine: new fields.ArrayField(
                    new fields.SchemaField({
                        ammoUuid: new fields.StringField({ required: true, blank: true, initial: '' }),
                        ammoName: new fields.StringField({ required: true, blank: true, initial: '' }),
                        count: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                        modifiers: new fields.SchemaField({
                            damage: new fields.NumberField({ required: true, initial: 0, integer: true }),
                            penetration: new fields.NumberField({ required: true, initial: 0, integer: true }),
                            range: new fields.NumberField({ required: true, initial: 0, integer: true }),
                        }),
                        clipModifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
                        addedQualities: new fields.ArrayField(new fields.StringField({ required: true }), { required: false, initial: [] }),
                        removedQualities: new fields.ArrayField(new fields.StringField({ required: true }), { required: false, initial: [] }),
                        // Structured ammo effects (#ammo-system) cached from the ammo item so
                        // the sync effective-stat getters read them without an async lookup.
                        // Optional with defaults: segments persisted before this model default cleanly.
                        attack: new fields.NumberField({ required: false, initial: 0, integer: true }),
                        damageType: new fields.StringField({ required: false, blank: true, initial: '' }),
                        damageOverride: new fields.SchemaField(
                            {
                                formula: new fields.StringField({ required: false, blank: true, initial: '' }),
                                bonus: new fields.NumberField({ required: false, initial: 0, integer: true }),
                                penetration: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            },
                            { required: false },
                        ),
                        fireRateOverride: new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
                        hitEffect: new fields.StringField({ required: false, blank: true, initial: '' }),
                    }),
                    { required: false, initial: [] },
                ),
            }),
            reload: new fields.StringField({
                required: true,
                initial: '-',
                choices: ['-', 'free', 'half', 'full', '2-full', '3-full', '4-full', '5-full', '6-full'],
            }),

            // Jam state (#411). Persisted PER-WEAPON transient runtime state, not
            // per-combatant: a jam belongs to this specific weapon instance and
            // travels with the item. Set when the firing-resolution path detects a
            // jam (rules/weapon-jam.ts trigger); a jammed weapon cannot fire until
            // cleared via the Unjam action (`clearJam()`). Like `clip.value`, it is
            // written to the owned item's per-actor overlay so it survives across
            // turns and the compendium→world resync.
            jammed: new fields.BooleanField({ required: false, initial: false }),
            // Combi-weapon single-use secondary spent state (#ammo-system).
            secondaryUsed: new fields.BooleanField({ required: false, initial: false }),

            // Firing modes (#430) — multiple named firing profiles on ONE weapon
            // (e.g. a mining melta's Focused vs Broad beam), each overriding a
            // subset of the base stats; empty/null fields inherit the base attack.
            // Line-authored content (variantizable). A weapon with no modes behaves
            // exactly as before (the base attack IS the single profile). Distinct
            // from the RoF `availableFireModes` (single/semi/full) axis.
            modes: new fields.ArrayField(
                new fields.SchemaField({
                    label: new fields.StringField({ required: true, blank: false }),
                    damage: new fields.StringField({ required: false, blank: true, initial: '' }),
                    damageType: new fields.StringField({ required: false, blank: true, initial: '' }),
                    damageBonus: new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
                    penetration: new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
                    range: new fields.NumberField({ required: false, nullable: true, initial: null, integer: true }),
                    addedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: false, initial: () => new Set() }),
                    removedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: false, initial: () => new Set() }),
                    // Melee↔ranged switch: a mode may override the weapon's class /
                    // attack type / characteristic / rate-of-fire so one dual-natured
                    // weapon (Burna, Necron Staff of Light) carries a melee and a
                    // ranged profile. Empty '' / null inherit the base attack.
                    weaponClass: new fields.StringField({ required: false, blank: true, initial: '' }),
                    attackType: new fields.StringField({ required: false, blank: true, initial: '' }),
                    characteristic: new fields.StringField({ required: false, blank: true, initial: '' }),
                    rateOfFire: new fields.SchemaField(
                        {
                            single: new fields.BooleanField({ required: true, initial: false }),
                            semi: new fields.NumberField({ required: true, initial: 0, integer: true }),
                            full: new fields.NumberField({ required: true, initial: 0, integer: true }),
                        },
                        { required: false, nullable: true, initial: null },
                    ),
                    // Combi-weapon secondary (#ammo-system): a single-use mode fires once
                    // then is spent until reload (RAW clip of 1). `clipMax` is the mode's
                    // own clip size (0 = share the weapon's clip).
                    singleUse: new fields.BooleanField({ required: false, initial: false }),
                    clipMax: new fields.NumberField({ required: false, initial: 0, min: 0, integer: true }),
                }),
                { required: false, initial: [] },
            ),
            // Live selected firing-mode index — per-weapon transient state, like `jammed`.
            activeMode: new fields.NumberField({ required: false, initial: 0, min: 0, integer: true }),

            // (Loaded ammunition is no longer stored — the chambered round is the
            // front of `clip.magazine`; `loadedAmmo` is a derived getter.)

            // Activation mode CONFIG — the powered ↔ deactivated toggle (chainsword,
            // shock whip, power weapons). Line-authored rules content: `activatable`
            // marks the weapon as having a state; `deactivated` is the profile of
            // qualities/stats lost (or gained) while off. The live on/off value is
            // transient state under `system.state.activated` (not here), per the
            // pack "Stateful Fields Live Under system.state" convention. Applied in
            // effectiveSpecial / effective damage / penetration (rules/weapon-activation.ts)
            // so the attack + damage rolls respect it.
            activation: new fields.SchemaField(
                {
                    activatable: new fields.BooleanField({ required: true, initial: false }),
                    deactivated: new fields.SchemaField(
                        {
                            addedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: false, initial: () => new Set() }),
                            removedQualities: new fields.SetField(new fields.StringField({ required: true }), { required: false, initial: () => new Set() }),
                            damage: new fields.NumberField({ required: true, initial: 0, integer: true }),
                            penetration: new fields.NumberField({ required: true, initial: 0, integer: true }),
                        },
                        { required: false },
                    ),
                },
                { required: false },
            ),

            // Modifications (references to weaponModification items)
            modifications: new fields.ArrayField(
                new fields.SchemaField({
                    uuid: new fields.StringField({ required: true }),
                    name: new fields.StringField({ required: true }),
                    active: new fields.BooleanField({ required: true, initial: true }),
                    category: new fields.StringField({ required: false, initial: 'accessory' }),
                    // Cached modifier values for display and aggregation
                    cachedModifiers: new fields.SchemaField(
                        {
                            damage: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            penetration: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            toHit: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            range: new fields.NumberField({ required: false, initial: 0, integer: true }),
                            weight: new fields.NumberField({ required: false, initial: 0 }),
                        },
                        { required: false },
                    ),
                }),
                { required: true, initial: [] },
            ),

            // Required training (for future talent integration)
            requiredTraining: new fields.StringField({ required: false, blank: true }),

            // === Vehicle mounting (OW core p.211-212; printed on every line's
            // vehicle weapon lines as e.g. "Turret-mounted", "Front Facing") ===
            // Per-installation, not per-weapon-type: the same Heavy Bolter is
            // hull-mounted on one tank and sponson-mounted on the next. The
            // canonical compendium record leaves both blank and the embedded copy
            // on the craft sets them, exactly like `specialization` on a talent.
            // The mounting fixes the fire arc; the facing is what that arc is
            // measured from.
            mounting: new fields.StringField({
                required: false,
                initial: '',
                blank: true,
                choices: [...WEAPON_MOUNTING_CHOICES],
                label: 'WH40K.Weapon.Mounting',
            }),
            facing: new fields.StringField({
                required: false,
                initial: '',
                blank: true,
                choices: [...WEAPON_FACING_CHOICES],
                label: 'WH40K.Weapon.Facing',
            }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate weapon data.
     * @param {object} source  The source data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel override; source mirrors parent _migrateData signature
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        WeaponData.#migrateSpecial(source);
        WeaponData.#migrateClass(source);
        WeaponData.#coerceEnums(source);
        WeaponData.#migrateMagazine(source);
        // Legacy field rename (overwrite if source present): proficiency→requiredTraining.
        renameKeys(source, { proficiency: 'requiredTraining' }, { guard: 'overwrite' });
    }

    /**
     * Migrate the pre-#ammo-system single `loadedAmmo` + `clip.value` shape into an
     * ordered `clip.magazine` (one segment for the loaded special ammo). Generic
     * rounds (no `loadedAmmo`) stay tracked by `clip.value` with an empty magazine.
     * Idempotent: a source that already has a magazine array is left alone.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors _migrateData source signature for internal migration helpers
    static #migrateMagazine(source: Record<string, unknown>): void {
        const clip = source['clip'];
        if (typeof clip !== 'object' || clip === null) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: raw pre-validation source object
        const clipObj = clip as Record<string, unknown>;
        if (Array.isArray(clipObj['magazine'])) return; // already migrated
        const loaded = source['loadedAmmo'];
        const clipValue = typeof clipObj['value'] === 'number' ? clipObj['value'] : 0;
        if (typeof loaded === 'object' && loaded !== null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: raw pre-validation legacy loadedAmmo object
            const l = loaded as {
                uuid?: string;
                name?: string;
                modifiers?: { damage?: number; penetration?: number; range?: number };
                clipModifier?: number;
                addedQualities?: Iterable<string>;
                removedQualities?: Iterable<string>;
            };
            clipObj['magazine'] = magazineFromLegacy(
                {
                    uuid: typeof l.uuid === 'string' ? l.uuid : '',
                    name: typeof l.name === 'string' ? l.name : '',
                    modifiers: {
                        damage: Number(l.modifiers?.damage ?? 0),
                        penetration: Number(l.modifiers?.penetration ?? 0),
                        range: Number(l.modifiers?.range ?? 0),
                    },
                    clipModifier: Number(l.clipModifier ?? 0),
                    addedQualities: l.addedQualities ?? [],
                    removedQualities: l.removedQualities ?? [],
                },
                clipValue,
            );
        }
        delete source['loadedAmmo']; // drop the retired legacy field
    }

    /**
     * Coerce an invalid/legacy `class` or `type` to the schema default so a
     * corrupt value (e.g. an imported `"low-tech"` type) doesn't fail strict
     * validation and drop the whole item from its owning actor. Runs after
     * `#migrateClass` (which remaps tech-type values) and after super (which
     * flattens any per-line variant container to a scalar).
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors _migrateData source signature for internal migration helpers
    static #coerceEnums(source: Record<string, unknown>): void {
        // An unresolved variant CONTAINER reaches here as an object and used to
        // slip past both guards untouched (they only fired for strings), then
        // rode through to `prepareBaseData` still shaped as an object (#503).
        // A container is left alone for `prepareBaseData` to resolve per line;
        // anything else non-string is genuinely corrupt and is normalised.
        const rawClass = source['class'];
        if (typeof rawClass === 'string') {
            if (!(WEAPON_CLASS_CHOICES as readonly string[]).includes(rawClass)) source['class'] = 'exotic';
        } else if (rawClass !== undefined && rawClass !== null && !isLineVariantContainer(rawClass)) {
            source['class'] = 'exotic';
        }
        const rawType = source['type'];
        if (typeof rawType === 'string') {
            if (!(WEAPON_TYPE_CHOICES as readonly string[]).includes(rawType)) source['type'] = 'primitive';
        } else if (rawType !== undefined && rawType !== null && !isLineVariantContainer(rawType)) {
            source['type'] = 'primitive';
        }
        // `reload` is a strict choice field, but legacy/compendium data is messy:
        // typographic dashes (–, —), capitalised/spaced spellings ("Full", "2 Full",
        // "2Full"), "Rld …" prefixes, etc. An out-of-choice value fails validation
        // and drops the whole weapon from its owning actor (and breaks token/
        // ActorDelta creation on drop). Normalise the recoverable forms to their
        // canonical choice, falling back to the '-' default for anything unparseable
        // (prose, "N/A", "Special", bare numbers, fractional/dice reloads).
        if (typeof source['reload'] === 'string') {
            let v = source['reload']
                .trim()
                .toLowerCase()
                .replace(/[‒–—―−]/g, '-') // figure/en/em/horizontal-bar/minus → hyphen
                .replace(/^(?:rld|reload)\s+/, '') // strip "Rld "/"Reload " prefix
                .replace(/\s+/g, '-') // "2 full" → "2-full"
                .replace(/(\d)-?full/, '$1-full'); // "2full" → "2-full"
            if (v === '1-full' || v === '1') v = 'full'; // 1 full action == full
            if (!(WEAPON_RELOAD_CHOICES as readonly string[]).includes(v)) v = '-';
            source['reload'] = v;
        }
    }

    /**
     * Ensure special is an array for SetField compatibility.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors _migrateData source signature for internal migration helpers
    static #migrateSpecial(source: Record<string, unknown>): void {
        const special = source['special'];
        if (Array.isArray(special)) return;
        if (special !== null && special !== undefined && typeof special === 'object' && Symbol.iterator in special) {
            source['special'] = Array.from(special as Iterable<string>);
        } else {
            source['special'] = [];
        }
    }

    /**
     * Migrate old class values (chain, power, shock, force) to type field.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors _migrateData source signature for internal migration helpers
    static #migrateClass(source: Record<string, unknown>): void {
        const techTypeValues = ['chain', 'power', 'shock', 'force'];
        const cls = source['class'];
        if (typeof cls === 'string' && techTypeValues.includes(cls)) {
            source['type'] = cls;
            source['class'] = 'melee';
        }
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritdoc */
    override prepareDerivedData(): void {
        super.prepareDerivedData();

        // #265: for PCs, `state.equipped` is authoritative persisted state — a weapon
        // must be drawn/equipped before it can make a combat action, and the Combat tab
        // marks the equipped set. Do NOT force-derive it for them; doing so clobbered the
        // stored toggle on every prepare, leaving every weapon permanently "equipped"
        // (uniform highlight, dead attack gate). Ship-storage stow is handled by the
        // EquippableTemplate stow helpers, which already clear `state.equipped`.
        //
        // NPCs, however, wield intrinsic weapons and have no per-weapon draw-state UI, so
        // their weapons are ALWAYS equipped. Without this, removing the blanket auto-derive
        // left NPC weapons unequipped and silently dropped their equip-conditional
        // contributions — item Active Effects (#333) and `requiresEquipped` Subtlety
        // passives (#391) no longer surfaced for NPC carriers. There is no stored toggle to
        // clobber on an NPC, so deriving equipped here is safe.
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.parent is the untyped Foundry Item; its `.actor.type` is runtime-only and not on the DataModel surface
        const ownerType = (this.parent as { actor?: { type?: string } } | null | undefined)?.actor?.type;
        if (typeof ownerType === 'string' && ownerType.endsWith('-npc')) {
            this.state.equipped = true;
        }

        // Auto-derive twoHanded for heavy weapons (if not explicitly set)
        // This provides a sensible default while allowing manual override
        if (this.class === 'heavy' && !this.twoHanded) {
            // Note: This is derived at runtime, not stored in source data
            // Heavy weapons are typically two-handed unless explicitly marked otherwise
        }

        // Aggregate modifiers from modifications (when they're active)
        this._aggregateModificationModifiers();
    }

    /** @inheritdoc */
    override prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent);
        this.class = resolveLineVariant(this.class, lineKey);
        this.type = resolveLineVariant(this.type, lineKey);
        this.twoHanded = resolveFlagVariant(this.twoHanded, lineKey, this.parent, 'twoHanded');
        // NEVER `Boolean(resolveLineVariant(...))`: an unresolved container is
        // handed back as-is, and `Boolean({dh1: false, dh2: false})` is `true` —
        // a weapon authored non-melee in every line became melee, which is what
        // offered Charge with an autogun (#503).
        this.melee = resolveFlagVariant(this.melee, lineKey, this.parent, 'melee');
        this.clip = foundry.utils.mergeObject({ max: 0, value: 0, type: '', magazine: [] }, resolveLineVariant(this.clip, lineKey), { inplace: false });
        // `clip.value` is the authoritative round count; when a magazine (special /
        // mixed ammo, #ammo-system) is loaded it mirrors the segment total.
        if (this.clip.magazine.length > 0) this.clip.value = magazineTotal(this.clip.magazine);
        setReloadField(this, resolveLineVariant(getReloadField(this), lineKey));
        this.requiredTraining = resolveLineVariant(this.requiredTraining, lineKey);
        this.notes = resolveLineVariant(this.notes, lineKey);
    }

    /**
     * Aggregate cached modifiers from active modifications.
     * @private
     */
    _aggregateModificationModifiers(): void {
        // Initialize aggregated modifiers
        this._modificationModifiers = {
            damage: 0,
            penetration: 0,
            toHit: 0,
            range: 0,
            weight: 0,
        };

        // Sum up all active modification modifiers
        for (const mod of this.modifications) {
            if (mod.active) {
                this._modificationModifiers.damage += mod.cachedModifiers.damage;
                this._modificationModifiers.penetration += mod.cachedModifiers.penetration;
                this._modificationModifiers.toHit += mod.cachedModifiers.toHit;
                this._modificationModifiers.range += mod.cachedModifiers.range;
                this._modificationModifiers.weight += mod.cachedModifiers.weight;
            }
        }

        // Add loaded ammunition modifiers (loadedAmmo may be undefined if the
        // schema failed to initialize due to upstream validation errors). A
        // full-profile OVERRIDE round (warhead / sniper round) replaces the damage
        // and penetration outright — its delta `modifiers` do NOT stack on top of the
        // replacement (they are 0 by authoring convention, but the guard makes it
        // robust); the orthogonal range delta always applies.
        if (this.loadedAmmo !== undefined && this.loadedAmmo.uuid !== '') {
            if (this.loadedAmmo.damageOverride === null) {
                this._modificationModifiers.damage += this.loadedAmmo.modifiers.damage;
                this._modificationModifiers.penetration += this.loadedAmmo.modifiers.penetration;
            }
            this._modificationModifiers.range += this.loadedAmmo.modifiers.range;
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get isRollable(): boolean {
        return true;
    }

    /**
     * The weapon's class for the active firing mode (#430). A dual-natured weapon
     * (Burna, Necron Staff of Light) carries a `melee` mode and a `basic`/`heavy`
     * mode; this returns the active mode's `weaponClass` override, else the base
     * `class`. Every melee↔ranged decision routes through this so a mode toggle
     * flips `isMeleeWeapon`/`isRangedWeapon` (and the WS↔BS characteristic).
     */
    get effectiveClass(): string {
        return modeWeaponClass(this.activeFiringModeProfile, this.class);
    }

    /** The active firing mode's attack type ('melee'|'ranged'), else the base attack type. */
    get effectiveAttackType(): string {
        return modeAttackType(this.activeFiringModeProfile, this.attack.type);
    }

    /** The active firing mode's test characteristic, else the base attack characteristic. */
    get effectiveCharacteristic(): string {
        return modeCharacteristic(this.activeFiringModeProfile, this.attack.characteristic);
    }

    /** The active firing mode's rate of fire, else the base attack rate of fire. */
    get effectiveRateOfFire(): { single: boolean; semi: number; full: number } {
        return modeRateOfFire(this.activeFiringModeProfile, this.attack.rateOfFire);
    }

    /**
     * Is this a ranged weapon? When a firing mode overrides the class (a dual
     * weapon's ranged mode), that wins; otherwise the base class decides (behaviour
     * unchanged for weapons without modes).
     * @type {boolean}
     */
    get isRangedWeapon(): boolean {
        // `launcher` is a weapon *type*, not a class — grenade/missile launchers are
        // class basic/heavy (already covered). The old 'launcher' class-check was dead.
        const mode = this.activeFiringModeProfile;
        if (mode !== null && mode.weaponClass !== '') return ['pistol', 'basic', 'heavy'].includes(mode.weaponClass);
        return ['pistol', 'basic', 'heavy'].includes(this.class);
    }

    /**
     * Is this a melee weapon? A firing mode's class override wins (a dual weapon's
     * melee mode); otherwise the base class / legacy `melee` flag decides (behaviour
     * unchanged for weapons without modes).
     * @type {boolean}
     */
    get isMeleeWeapon(): boolean {
        const mode = this.activeFiringModeProfile;
        if (mode !== null && mode.weaponClass !== '') return mode.weaponClass === 'melee';
        return this.class === 'melee' || this.melee;
    }

    /**
     * Is this a primitive weapon?
     * @type {boolean}
     */
    get isPrimitive(): boolean {
        return this.type === 'primitive';
    }

    /**
     * Alias for isPrimitive (for consistency with armour API).
     * @type {boolean}
     */
    get primitive(): boolean {
        return this.isPrimitive;
    }

    /** True when this weapon has a powered ↔ deactivated toggle (rules/weapon-activation.ts). */
    get isActivatable(): boolean {
        return this.activation?.activatable === true;
    }

    /** True when this weapon has more than one authored firing mode (#430). */
    get hasFiringModes(): boolean {
        return hasFiringModes(this.modes);
    }

    /** The active firing mode's profile, or null when the weapon has no modes (#430). */
    get activeFiringModeProfile(): WeaponFiringMode | null {
        return activeFiringMode(this.modes, this.activeMode);
    }

    /** True when the active mode is a single-use combi secondary (#ammo-system). */
    get activeModeSingleUse(): boolean {
        return modeIsSingleUse(this.activeFiringModeProfile);
    }

    /** The active single-use secondary's remaining shots (0 once spent, else its clipMax / 1). */
    get secondaryRemaining(): number {
        if (!this.activeModeSingleUse) return 0;
        if (this.secondaryUsed === true) return 0;
        const mode = this.activeFiringModeProfile;
        return mode !== null && mode.clipMax > 0 ? mode.clipMax : 1;
    }

    /** True when the weapon is currently powered/active. Always true for a weapon with no toggle. */
    get powered(): boolean {
        return !isDeactivated(this.activation, this.state.activated);
    }

    /**
     * Does this weapon use ammunition? A single-use combi secondary counts as
     * ammo-using even if the base bolter had no clip.
     * @type {boolean}
     */
    get usesAmmo(): boolean {
        return this.clip.max > 0 || this.activeModeSingleUse;
    }

    /**
     * Is the weapon jammed or out of ammo? A single-use combi secondary is "out"
     * once it has been fired (spent until reload); otherwise the shared clip decides.
     * @type {boolean}
     */
    get isOutOfAmmo(): boolean {
        if (this.activeModeSingleUse) return this.secondaryRemaining <= 0;
        return this.clip.max > 0 && this.clip.value <= 0;
    }

    /** Alias of {@link isOutOfAmmo} — the conceptual name used by chat / sheet templates. */
    get isEmpty(): boolean {
        return this.isOutOfAmmo;
    }

    /**
     * Is this weapon currently jammed (#411)? A jammed weapon cannot fire until
     * cleared with the Unjam action ({@link clearJam}). Melee weapons never jam.
     * Guards the (schema-optional) `jammed` field, which may be undefined if the
     * schema failed to initialise.
     * @type {boolean}
     */
    get isJammed(): boolean {
        return this.jammed === true && !this.isMeleeWeapon;
    }

    /**
     * Get effective qualities (base + craftsmanship-derived + ammo).
     * Applies WH40K RPG craftsmanship rules for ranged weapons:
     * - Poor: Gain Unreliable (or jam on any miss if already Unreliable)
     * - Good: Gain Reliable (or cancel Unreliable)
     * - Best: Never jams or overheats (gain Reliable, remove Overheats)
     * - Exceptional (Astartes): Gain Reliable (or cancel Unreliable)
     * - Master (Astartes): Never jams or overheats (like Best)
     *
     * @type {Set<string>}
     */
    get effectiveSpecial(): Set<string> {
        const qualities = new Set<string>(this.special);

        // Add craftsmanship-derived qualities for RANGED weapons only
        // Melee weapons get toHit/damage modifiers instead
        if (!this.melee && !this.isMeleeWeapon) {
            const hasUnreliable = qualities.has('unreliable');

            const craft = this.craftsmanship;
            if (craft === 'poor') {
                // Poor: Gain Unreliable quality
                // NOTE: If already Unreliable, jams on any miss (handled in roll logic, not here)
                qualities.add('unreliable');
            } else if (craft === 'good' || craft === 'exceptional') {
                // Good / Exceptional (Astartes): Gain Reliable OR cancel Unreliable
                if (hasUnreliable) {
                    qualities.delete('unreliable');
                } else {
                    qualities.add('reliable');
                }
            } else if (craft === 'best' || craft === 'master') {
                // Best / Master (Astartes): Never jams or overheats
                qualities.add('reliable');
                qualities.delete('unreliable');
                qualities.delete('overheats');
            }
        }

        // Apply loaded ammunition quality modifications
        if (this.loadedAmmo?.uuid !== undefined && this.loadedAmmo.uuid !== '') {
            // Add qualities from ammo
            for (const quality of this.loadedAmmo.addedQualities) {
                qualities.add(quality);
            }
            // Remove qualities blocked by ammo
            for (const quality of this.loadedAmmo.removedQualities) {
                qualities.delete(quality);
            }
        }

        // Apply the deactivated-mode quality profile (powered ↔ off). No-op for
        // non-activatable or currently-active weapons (rules/weapon-activation.ts).
        const powered = applyDeactivationQualities(qualities, this.activation, this.state.activated);

        // Apply the active firing mode's quality add/remove (#430). No-op when the
        // weapon has no modes.
        return applyModeQualities(powered, this.activeFiringModeProfile);
    }

    /**
     * Get craftsmanship-derived stat modifiers.
     * Applies WH40K RPG craftsmanship rules:
     *
     * MELEE WEAPONS:
     * - Poor: -10 to attack and parry
     * - Good: +5 to attack
     * - Best: +10 to attack, +1 damage
     * - Exceptional (Astartes): +5 to attack, +1 damage
     * - Master (Astartes): +10 to attack, +2 damage
     *
     * RANGED WEAPONS:
     * - Qualities handled in effectiveSpecial getter
     * - Exceptional (Astartes): Gain Reliable (or cancel Unreliable)
     * - Master (Astartes): Never jams or overheats (like Best)
     *
     * @type {object}
     */
    get craftsmanshipModifiers(): { toHit: number; damage: number; weight: number } {
        const mods = {
            toHit: 0, // WS/BS modifier
            damage: 0, // Damage bonus
            weight: 1.0, // Weight multiplier (for future use)
        };

        // Apply modifiers for MELEE weapons only
        // Ranged weapons get quality changes instead (see effectiveSpecial)
        if (this.melee || this.isMeleeWeapon) {
            const MELEE_CRAFT_MODS: Record<string, { toHit: number; damage: number }> = {
                poor: { toHit: -10, damage: 0 }, // -10 to attack and parry
                good: { toHit: 5, damage: 0 }, // +5 to attack
                best: { toHit: 10, damage: 1 }, // +10 to attack, +1 damage
                exceptional: { toHit: 5, damage: 1 }, // Astartes-grade: +5 attack, +1 damage
                master: { toHit: 10, damage: 2 }, // Master-crafted Astartes: +10 attack, +2 damage
            };
            if (Object.hasOwn(MELEE_CRAFT_MODS, this.craftsmanship)) {
                const meleeMods = MELEE_CRAFT_MODS[this.craftsmanship];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test.json lacks noUncheckedIndexedAccess; main tsconfig requires this guard
                if (meleeMods !== undefined) {
                    mods.toHit = meleeMods.toHit;
                    mods.damage = meleeMods.damage;
                }
            }
        }

        return mods;
    }

    /**
     * Check if weapon has any craftsmanship-derived qualities.
     * Only ranged weapons with non-common craftsmanship.
     * @type {boolean}
     */
    get hasCraftsmanshipQualities(): boolean {
        if (this.melee || this.isMeleeWeapon) return false;
        return ['poor', 'good', 'best', 'exceptional', 'master'].includes(this.craftsmanship);
    }

    /**
     * Get effective damage formula (base + modifications).
     * NOTE: This does NOT include Strength Bonus, which is added dynamically at roll time.
     * Strength Bonus is applied in the actor's rollWeaponDamage() method.
     * @type {string}
     */
    get effectiveDamageFormula(): string {
        // A loaded warhead / sniper round OVERRIDES the dice + bonus outright
        // (#ammo-system); otherwise the weapon's own profile is the base and the
        // ammo's delta is folded via `_modificationModifiers`.
        const override = this.loadedAmmo?.damageOverride ?? null;
        const baseFormulaRaw = override !== null ? override.formula : this.damage.formula || '1d10';
        const baseBonusRaw = override !== null ? override.bonus : this.damage.bonus || 0;
        const baseDamage = modeDamageFormula(this.activeFiringModeProfile, baseFormulaRaw);
        const baseBonus = modeDamageBonus(this.activeFiringModeProfile, baseBonusRaw);
        const craftBonus = this.craftsmanshipModifiers.damage;
        const modBonus = this._modificationModifiers.damage;
        const deactBonus = deactivationStatDeltas(this.activation, this.state.activated).damage;

        const totalBonus = baseBonus + craftBonus + modBonus + deactBonus;

        if (totalBonus === 0) return baseDamage;
        return `${baseDamage}${totalBonus > 0 ? '+' : ''}${totalBonus}`;
    }

    /**
     * The damage type for the active firing mode (#430), else the base damage type.
     * A beam-vs-blade weapon (a Necron Staff of Light) deals Energy at range and
     * Impact in melee — the active mode's `damageType` override selects which.
     * @type {string}
     */
    get effectiveDamageType(): string {
        // A loaded round's damage type overrides the weapon's (a needle round → Rending,
        // an Explosive Arrow → Explosive); the active firing mode overrides both.
        const ammoType = this.loadedAmmo?.damageType ?? '';
        const base = ammoType !== '' ? ammoType : this.damage.type;
        return modeDamageType(this.activeFiringModeProfile, base);
    }

    /** Damage-type abbreviation for the active mode (shadows the DamageTemplate getter). */
    get damageTypeAbbr(): string {
        const abbrs: Record<string, string | undefined> = {
            impact: 'I',
            rending: 'R',
            explosive: 'X',
            energy: 'E',
            fire: 'F',
            shock: 'S',
            cold: 'C',
            toxic: 'T',
        };
        const type = this.effectiveDamageType;
        return abbrs[type] ?? type.charAt(0).toUpperCase();
    }

    /** Localized damage-type label for the active mode (shadows the DamageTemplate getter). */
    get damageTypeLabel(): string {
        return game.i18n.localize(`WH40K.DamageType.${this.effectiveDamageType.capitalize()}`);
    }

    /**
     * Get full damage formula for display, including +SB indicator for melee weapons.
     * This is intended for UI display to show users what the complete damage formula will be.
     * @type {string}
     */
    get fullDamageFormula(): string {
        const baseFormula = this.effectiveDamageFormula;

        // Melee weapons add Strength Bonus to damage
        if (this.isMeleeWeapon) {
            return `${baseFormula}+SB`;
        }

        return baseFormula;
    }

    /**
     * Get effective penetration (base + modifications).
     * @type {number}
     */
    get effectivePenetration(): number {
        // An OVERRIDE round replaces base penetration; a delta round's Pen delta is
        // folded via `_modificationModifiers` (#ammo-system).
        const override = this.loadedAmmo?.damageOverride ?? null;
        const basePenRaw = override !== null ? override.penetration : this.damage.penetration || 0;
        const basePen = modePenetration(this.activeFiringModeProfile, basePenRaw);
        const modPen = this._modificationModifiers.penetration;
        return basePen + modPen + deactivationStatDeltas(this.activation, this.state.activated).penetration;
    }

    /**
     * Get effective to-hit modifier (craftsmanship + modifications).
     * @type {number}
     */
    get effectiveToHit(): number {
        const craftMod = this.craftsmanshipModifiers.toHit;
        const modMod = this._modificationModifiers.toHit;
        return craftMod + modMod;
    }

    /**
     * Get effective range (base + modifications).
     * For ranged weapons only.
     * @type {object}
     */
    get effectiveRange(): { value: number; units: string; special: string } {
        const baseRange = modeRange(this.activeFiringModeProfile, this.attack.range.value || 0);
        const rangeModifier = this._modificationModifiers.range;

        return {
            value: baseRange + rangeModifier,
            units: this.attack.range.units || 'm',
            special: this.attack.range.special || '',
        };
    }

    /**
     * Get effective weight (base + modifications).
     * @type {number}
     */
    get effectiveWeight(): number {
        const baseWeight = this.weight || 0;
        const modWeight = this._modificationModifiers.weight;
        return baseWeight + modWeight;
    }

    /**
     * Check if actor has the required training for this weapon.
     * @param {Actor} actor - The actor to check
     * @returns {boolean} - True if actor has required training (or no training required)
     */
    hasRequiredTraining(_actor: object | null): boolean {
        // If no training requirement, always return true
        if (!this.requiredTraining) return true;

        // TODO: Implement talent-based training check when talent integration is ready
        // For now, return true to not block usage
        // Future implementation should check actor.items for matching talent
        // e.g., "Weapon Training (Las)" talent

        return true;
    }

    /**
     * Get available fire modes for this weapon.
     * Returns an array of {mode, label, rof, modifier, description} objects.
     * @type {Array<{mode: string, label: string, rof: number, modifier: number, description: string, actionType: string}>}
     */
    get availableFireModes(): Array<{ mode: string; label: string; rof: number; modifier: number; description: string; actionType: string }> {
        if (!this.isRangedWeapon) return [];

        const modes: Array<{ mode: string; label: string; rof: number; modifier: number; description: string; actionType: string }> = [];
        const rof = this.effectiveRateOfFire;
        const hasStorm = this.effectiveSpecial.has('storm');

        // Single Shot - always available for ranged weapons
        if (rof.single) {
            modes.push({
                mode: 'single',
                label: 'Single Shot',
                rof: 1,
                modifier: 0,
                description: 'Fire a single shot',
                actionType: 'half',
            });
        }

        // Semi-Auto - available if semi > 0
        if (rof.semi > 0) {
            const semiRof = hasStorm ? rof.semi * 2 : rof.semi;
            modes.push({
                mode: 'semi',
                label: `Semi-Auto (${semiRof})`,
                rof: semiRof,
                modifier: 0,
                description: 'Additional hit per 2 DoS',
                actionType: 'half',
            });
        }

        // Full-Auto - available if full > 0
        if (rof.full > 0) {
            const fullRof = hasStorm ? rof.full * 2 : rof.full;
            modes.push({
                mode: 'full',
                label: `Full-Auto (${fullRof})`,
                rof: fullRof,
                modifier: -10,
                description: 'Additional hit per DoS',
                actionType: 'half',
            });
        }

        return modes;
    }

    /**
     * Get the effective RoF for a fire mode (accounting for Storm quality).
     * @param {string} mode - Fire mode: 'single', 'semi', or 'full'
     * @returns {number} - Effective rate of fire
     */
    getEffectiveRoF(mode: string): number {
        const rof = this.effectiveRateOfFire;
        const hasStorm = this.effectiveSpecial.has('storm');

        if (mode === 'semi') return hasStorm ? rof.semi * 2 : rof.semi;
        if (mode === 'full') return hasStorm ? rof.full * 2 : rof.full;
        // 'single' or unknown
        return 1;
    }

    /**
     * Get the reload time label.
     * @type {string}
     */
    get reloadLabel(): string {
        const labels: Record<string, string> = {
            '-': '-',
            'free': game.i18n.localize('WH40K.Reload.Free'),
            'half': game.i18n.localize('WH40K.Reload.Half'),
            'full': game.i18n.localize('WH40K.Reload.Full'),
            '2-full': game.i18n.localize('WH40K.Reload.2Full'),
            '3-full': game.i18n.localize('WH40K.Reload.3Full'),
            '4-full': game.i18n.localize('WH40K.Reload.4Full'),
            '5-full': game.i18n.localize('WH40K.Reload.5Full'),
            '6-full': game.i18n.localize('WH40K.Reload.6Full'),
        };
        // Access schema field via the typed helper — at runtime the instance property
        // (schema field) shadows the prototype method, but TS sees the method.
        const reloadTime = getReloadField(this);
        return labels[reloadTime] ?? reloadTime;
    }

    /**
     * Get effective reload time accounting for Customised quality.
     * Customised quality halves reload time.
     * @type {string}
     */
    get effectiveReloadTime(): string {
        // Access schema field via the typed helper — see reloadLabel comment
        const baseReload = getReloadField(this);

        // Check for Customised quality
        if (!this.effectiveSpecial.has('customised')) {
            return baseReload;
        }

        // Customised halves reload time
        const reloadMap: Record<string, string> = {
            '3-full': '2-full',
            '2-full': 'full',
            'full': 'half',
            'half': 'half', // Already minimum
            'free': 'free',
            '-': '-',
        };

        return reloadMap[baseReload] || baseReload;
    }

    /**
     * Get effective reload time label.
     * @type {string}
     */
    get effectiveReloadLabel(): string {
        const labels: Record<string, string> = {
            '-': '-',
            'free': game.i18n.localize('WH40K.Reload.Free'),
            'half': game.i18n.localize('WH40K.Reload.Half'),
            'full': game.i18n.localize('WH40K.Reload.Full'),
            '2-full': game.i18n.localize('WH40K.Reload.2Full'),
            '3-full': game.i18n.localize('WH40K.Reload.3Full'),
            '4-full': game.i18n.localize('WH40K.Reload.4Full'),
            '5-full': game.i18n.localize('WH40K.Reload.5Full'),
            '6-full': game.i18n.localize('WH40K.Reload.6Full'),
        };
        return labels[this.effectiveReloadTime] ?? this.effectiveReloadTime;
    }

    /**
     * Get the weapon class label.
     * @type {string}
     */
    get classLabel(): string {
        return game.i18n.localize(`WH40K.WeaponClass.${capitalize(this.class)}`);
    }

    /**
     * Get the weapon type label.
     * @type {string}
     */
    get typeLabel(): string {
        return game.i18n.localize(
            `WH40K.WeaponType.${this.type
                .split('-')
                .map((s) => capitalize(s))
                .join('')}`,
        );
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [
            ...ItemDataModel.inheritedChatProperties(this, PhysicalItemTemplate),
            ...ItemDataModel.inheritedChatProperties(this, AttackTemplate),
            ...ItemDataModel.inheritedChatProperties(this, DamageTemplate),
        ];

        props.unshift(`${this.classLabel} (${this.typeLabel})`);

        if (this.usesAmmo) {
            props.push(`Clip: ${this.clip.value}/${this.effectiveClipMax}`);
            props.push(`Reload: ${this.reloadLabel}`);
        }

        // Surface the jam state (#411) so the weapon card shows it needs clearing.
        if (this.isJammed) {
            props.push(game.i18n.localize('WH40K.Weapon.Jammed'));
        }

        // Show effective qualities (including craftsmanship)
        if (this.effectiveSpecial.size > 0) {
            props.push(`Qualities: ${Array.from(this.effectiveSpecial).join(', ')}`);
        }

        // Show craftsmanship modifiers if any
        const craftMods = this.craftsmanshipModifiers;
        if (craftMods.toHit !== 0 || craftMods.damage !== 0) {
            const modParts: string[] = [];
            if (craftMods.toHit !== 0) modParts.push(`${craftMods.toHit > 0 ? '+' : ''}${craftMods.toHit} Hit`);
            if (craftMods.damage !== 0) modParts.push(`+${craftMods.damage} Dmg`);
            props.push(`Craftsmanship: ${modParts.join(', ')}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): { class: string; type: string; damage: string; pen: number; range: string; rof: string } {
        return {
            class: this.classLabel,
            type: this.typeLabel,
            damage: this.damageLabel,
            pen: this.damage.penetration,
            range: this.rangeLabel,
            rof: this.rateOfFireLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Display Properties                          */
    /* -------------------------------------------- */

    /**
     * Get icon class for weapon class.
     * @type {string}
     */
    get classIcon(): string {
        const icons: Record<string, string> = {
            melee: 'fa-sword',
            pistol: 'fa-gun',
            basic: 'fa-crosshairs',
            heavy: 'fa-bullseye',
            thrown: 'fa-hand',
            exotic: 'fa-atom',
        };
        return icons[this.class] ?? 'fa-crosshairs';
    }

    /**
     * Get icon class for weapon type.
     * @type {string}
     */
    get typeIcon(): string {
        const icons: Record<string, string> = {
            'primitive': 'fa-axe',
            'las': 'fa-laser-pointer',
            'solid-projectile': 'fa-crosshairs',
            'bolt': 'fa-meteor',
            'melta': 'fa-fire-flame-curved',
            'plasma': 'fa-sun',
            'flame': 'fa-fire',
            'launcher': 'fa-rocket',
            'explosive': 'fa-bomb',
            'power': 'fa-bolt-lightning',
            'chain': 'fa-link-slash',
            'shock': 'fa-bolt',
            'force': 'fa-wand-magic-sparkles',
            'exotic': 'fa-alien',
            'xenos': 'fa-alien',
        };
        return icons[this.type] ?? 'fa-crosshairs';
    }

    /**
     * Get effective clip max, accounting for loaded ammo's clip modifier.
     * @type {number}
     */
    get effectiveClipMax(): number {
        // A single-use combi secondary shows its own clip (1), not the bolter's.
        if (this.activeModeSingleUse) {
            const mode = this.activeFiringModeProfile;
            return mode !== null && mode.clipMax > 0 ? mode.clipMax : 1;
        }
        const base = this.clip.max;
        const ammoMod = this.loadedAmmo?.clipModifier ?? 0;
        return Math.max(1, base + ammoMod);
    }

    /** The clip count for display — the active single-use secondary's remaining shots
     *  (#ammo-system), else the shared clip count. */
    get effectiveClipValue(): number {
        return this.activeModeSingleUse ? this.secondaryRemaining : this.clip.value;
    }

    /**
     * Get ammunition percentage for visual display.
     * @type {number}
     */
    get ammoPercentage(): number {
        if (!this.usesAmmo) return 100;
        if (!this.activeModeSingleUse && this.clip.max === 0) return 100;
        return Math.round((this.effectiveClipValue / this.effectiveClipMax) * 100);
    }

    /**
     * Get ammunition status class for styling.
     * @type {string}
     */
    get ammoStatus(): string {
        const pct = this.ammoPercentage;
        if (pct === 0) return 'empty';
        if (pct <= 25) return 'critical';
        if (pct <= 50) return 'low';
        return 'good';
    }

    /**
     * Get jam threshold for ranged weapons.
     * @type {number|null}
     */
    get jamThreshold(): number | null {
        if (this.isMeleeWeapon) return null;

        const qualities = this.effectiveSpecial;
        if (qualities.has('never-jam')) return null;
        if (qualities.has('reliable')) return 100; // Only jams on natural 100
        if (qualities.has('unreliable-2')) return 91; // Jams on 91+
        if (qualities.has('unreliable')) return 96; // Jams on 96+
        if (qualities.has('overheats')) return 91; // Overheats on 91+
        return 96; // Default jam on 96+
    }

    /**
     * Get a compact summary string for compendium/list display.
     * @type {string}
     */
    get compendiumSummary(): string {
        const parts: string[] = [];
        parts.push(this.damageLabel || '-');
        if (this.damage.penetration > 0) parts.push(`Pen ${this.damage.penetration}`);
        if (this.isRangedWeapon && this.rangeLabel !== '-') parts.push(this.rangeLabel);
        return parts.join(' • ');
    }

    /**
     * Get full stat line for display.
     * @type {string}
     */
    get statLine(): string {
        const parts: string[] = [];
        parts.push(`${this.classLabel}`);
        if (this.isRangedWeapon) {
            parts.push(`${this.rangeLabel}`);
            parts.push(`RoF: ${this.rateOfFireLabel}`);
        }
        parts.push(`${this.damageLabel}`);
        parts.push(`Pen: ${this.damage.penetration}`);
        if (this.usesAmmo) parts.push(`Clip: ${this.effectiveClipMax}`);
        return parts.join(' | ');
    }

    /**
     * Get qualities as array of objects with labels and descriptions.
     * @type {Array<{id: string, label: string, description: string, level: number|null}>}
     */
    get qualitiesArray(): Array<{ id: string; baseId: string; label: string; description: string; level: number | null; hasLevel: boolean }> {
        const qualities: Array<{ id: string; baseId: string; label: string; description: string; level: number | null; hasLevel: boolean }> = [];
        for (const qualityId of this.effectiveSpecial) {
            // Parse level from quality ID (e.g., "blast-3" -> "blast", 3)
            const match = qualityId.match(/^(.+?)-(\d+)$/);
            const [, baseFromMatch, levelStr] = match ?? [];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: baseFromMatch is string|undefined from regex destructure
            const baseId: string = baseFromMatch ?? qualityId;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: levelStr is string|undefined from regex destructure
            const level = levelStr !== undefined ? parseInt(levelStr, 10) : null;

            // Definition (label/description langpack keys + hasLevel) resolves from the
            // weaponQuality compendium via the boot index (#303); null → humanized fallback.
            const definition = CONFIG.wh40k.getQualityDefinition(qualityId);

            const fallbackLabel = qualityId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
            qualities.push({
                id: qualityId,
                baseId: baseId,
                label: definition !== null ? game.i18n.localize(definition.label) : fallbackLabel,
                description: definition !== null ? game.i18n.localize(definition.description) : '',
                level: level,
                hasLevel: definition !== null ? definition.hasLevel : false,
            });
        }

        return qualities;
    }

    /**
     * Check if weapon is two-handed.
     * @type {boolean}
     */
    get isTwoHanded(): boolean {
        return this.twoHanded || this.class === 'heavy';
    }

    /**
     * Get hands required string.
     * @type {string}
     */
    get handsLabel(): string {
        return this.isTwoHanded ? game.i18n.localize('WH40K.Weapon.TwoHanded') : game.i18n.localize('WH40K.Weapon.OneHanded');
    }

    /**
     * The chambered ammunition (#ammo-system): the front `clip.magazine` segment
     * mapped to the legacy loaded-ammo shape, or `undefined` when no *special* ammo
     * is chambered (an empty magazine, or a generic/standard front segment with no
     * ammo item — `ammoUuid === ''`). This is the single derivation every legacy
     * `loadedAmmo` consumer reads unchanged (modifiers, qualities, clip modifier).
     * @type {object|undefined}
     */
    get loadedAmmo():
        | {
              uuid: string;
              name: string;
              modifiers: { damage: number; penetration: number; range: number };
              clipModifier: number;
              addedQualities: Set<string>;
              removedQualities: Set<string>;
              attack: number;
              damageType: string;
              damageOverride: { formula: string; bonus: number; penetration: number } | null;
              fireRateOverride: number | null;
              hitEffect: string;
          }
        | undefined {
        const front = frontSegment(this.clip.magazine);
        if (front === null || front.ammoUuid === '') return undefined;
        const override = front.damageOverride;
        return {
            uuid: front.ammoUuid,
            name: front.ammoName,
            modifiers: { damage: front.modifiers.damage, penetration: front.modifiers.penetration, range: front.modifiers.range },
            clipModifier: front.clipModifier,
            addedQualities: new Set(front.addedQualities),
            removedQualities: new Set(front.removedQualities),
            attack: front.attack ?? 0,
            damageType: front.damageType ?? '',
            damageOverride: override !== undefined && override.formula !== '' ? override : null,
            fireRateOverride: front.fireRateOverride ?? null,
            hitEffect: front.hitEffect ?? '',
        };
    }

    /**
     * Check if weapon has loaded (special) ammunition chambered.
     * @type {boolean}
     */
    get hasLoadedAmmo(): boolean {
        return this.loadedAmmo?.uuid !== undefined && this.loadedAmmo.uuid !== '';
    }

    /**
     * Get loaded ammunition display name.
     * @type {string}
     */
    get loadedAmmoLabel(): string {
        if (!this.hasLoadedAmmo) return 'Standard';
        return this.loadedAmmo?.name !== undefined && this.loadedAmmo.name !== '' ? this.loadedAmmo.name : 'Unknown';
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Fire the weapon, consuming ammunition.
     * @param {number} [shots=1]   Number of shots to fire.
     * @returns {Promise<Item>}
     */
    fire(shots = 1): WH40KItem | null | Promise<WH40KItem | undefined> {
        if (!this.usesAmmo) return this.parent;
        const newValue = Math.max(0, this.clip.value - shots);
        // eslint-disable-next-line no-restricted-syntax -- boundary: weapon.update accepts a loose document update payload
        const update: Record<string, unknown> = { 'system.clip.value': newValue };
        if (this.clip.magazine.length > 0) update['system.clip.magazine'] = consumeRounds(this.clip.magazine, shots).magazine;
        return this.parent.update(update);
    }

    /**
     * Mark this weapon as jammed (#411). Persisted on the item so the jam is
     * per-weapon and survives across turns. Called from the firing-resolution
     * path when the rulebook jam trigger fires (rules/weapon-jam.ts).
     * @returns {Promise<Item>}
     */
    async jam(): Promise<WH40KItem | undefined> {
        return this.parent.update({ 'system.jammed': true });
    }

    /**
     * Clear a jam (#411 — the Unjam action). Per DH2 RAW the Unjam action is a
     * Full Action + BS test; on success the jam clears but any loaded rounds are
     * lost and the weapon must be reloaded. The action-economy spend + skill
     * test are owned by the action-economy layer (#264) — this method performs
     * only the state mutation it should call once the action resolves.
     *
     * @param {object} [options]
     * @param {boolean} [options.loseAmmo=true]  Empty the clip on clear (DH2 RAW).
     *   Systems whose unjam rules retain the loaded rounds pass `false`.
     * @returns {Promise<Item>}
     */
    async clearJam({ loseAmmo = true }: { loseAmmo?: boolean } = {}): Promise<WH40KItem | undefined> {
        if (loseAmmo && this.usesAmmo) {
            return this.parent.update({ 'system.jammed': false, 'system.clip.value': 0, 'system.clip.magazine': [] });
        }
        return this.parent.update({ 'system.jammed': false });
    }

    /**
     * Select the active firing mode by index (#430). Clamps to a valid mode;
     * no-op for a weapon without modes or when already active. The chosen mode's
     * stats flow through the effective getters into attack, damage, and range.
     * @param {number} index - Firing-mode index
     */
    async setActiveMode(index: number): Promise<WH40KItem | undefined> {
        if (!this.hasFiringModes) return undefined;
        const clamped = Math.min(Math.max(Math.trunc(index), 0), this.modes.length - 1);
        if (clamped === this.activeMode) return undefined;
        return this.parent.update({ 'system.activeMode': clamped });
    }

    /** Advance to the next firing mode, wrapping around (#430). */
    async cycleFiringMode(): Promise<WH40KItem | undefined> {
        if (!this.hasFiringModes) return undefined;
        const next = (this.activeMode + 1) % this.modes.length;
        return this.parent.update({ 'system.activeMode': next });
    }

    /**
     * Reload the weapon using the ReloadActionManager.
     * This method validates action economy and handles Customised quality.
     * @param {object} options - Reload options
     * @param {boolean} options.skipValidation - Skip action economy validation
     * @param {boolean} options.force - Force reload even if already full
     * @returns {Promise<{success: boolean, message: string, actionsSpent: object}>}
     */
    async reload(options: { skipValidation?: boolean; force?: boolean } = {}): Promise<ReloadResult> {
        // Dynamic import to avoid circular dependency
        const { ReloadActionManager } = await import('../../actions/reload-action-manager.ts');
        return ReloadActionManager.reloadWeapon(this.parent, options);
    }

    /**
     * Load ammunition into the weapon.
     * @param {Item} ammoItem - The ammunition item to load
     * @returns {Promise<Item>} - The updated weapon
     */
    async loadAmmo(ammoItem: AmmoItemLike): Promise<WH40KItem | null> {
        if (ammoItem.type !== 'ammunition') {
            ui.notifications.warn(t('WH40K.Warning.InvalidAmmunition'));
            return this.parent;
        }

        const actor: AmmoActorLike | null = (this.parent.actor as AmmoActorLike | null | undefined) ?? null;

        // Eject current ammo first (return remaining rounds to inventory)
        if (this.clip.value > 0 && this.hasLoadedAmmo && actor !== null) {
            await this._returnRoundsToInventory(actor, this.clip.value);
        }

        // Cache ammunition effects into the segment (#ammo-system) via the shared
        // extractor, so the sync effective-stat getters read them without an async lookup.
        const effects = ammoSegmentEffects(ammoItem.system);
        const quantity = ammoItem.system.quantity;
        const effectiveMax = Math.max(1, this.clip.max + effects.clipModifier);

        // Deduct rounds from inventory
        const availableQuantity = quantity ?? effectiveMax;
        const roundsToLoad = actor !== null ? Math.min(effectiveMax, availableQuantity) : effectiveMax;
        if (actor !== null && quantity !== undefined) {
            await ammoItem.update({ 'system.quantity': quantity - roundsToLoad });
        }

        // Load as a single-segment magazine (#ammo-system): the whole clip is this
        // one ammo type until fired down / reloaded.
        const segment: MagazineSegment = {
            ammoUuid: ammoItem.uuid,
            ammoName: ammoItem.name,
            count: roundsToLoad,
            ...effects,
        };
        await this.parent.update({
            'system.clip.magazine': [segment],
            'system.clip.value': roundsToLoad,
        });

        ui.notifications.info(`${ammoItem.name} loaded into ${this.parent.name} (${roundsToLoad} rounds)`);
        return this.parent;
    }

    /**
     * Eject loaded ammunition from the weapon.
     * @returns {Promise<Item>} - The updated weapon
     */
    async ejectAmmo(): Promise<WH40KItem | null> {
        if (!this.hasLoadedAmmo) {
            ui.notifications.warn(t('WH40K.Warning.NoAmmunitionLoaded'));
            return this.parent;
        }

        // Return remaining rounds to inventory
        const actor: AmmoActorLike | null = (this.parent.actor as AmmoActorLike | null | undefined) ?? null;
        if (this.clip.value > 0 && actor !== null) {
            await this._returnRoundsToInventory(actor, this.clip.value);
        }

        await this.parent.update({
            'system.clip.magazine': [],
            'system.clip.value': 0,
        });

        ui.notifications.info(`Ammunition ejected from ${this.parent.name}`);
        return this.parent;
    }

    /**
     * Build an ordered magazine from a sequence of `{ammoUuid, count}` segments —
     * the mixed-clip loadout (#ammo-system). The rounds fire front-first in the
     * given order, each using its own ammo profile. Returns any currently-loaded
     * special rounds to inventory first, then deducts each requested ammo type
     * from the owning actor's inventory (clamped to availability and the clip's
     * base max), and writes the resulting ordered magazine. Unresolvable / empty
     * segments are skipped.
     * @param {ReadonlyArray<{ammoUuid: string, count: number}>} segments - Ordered load
     * @returns {Promise<Item|null>}
     */
    async buildClip(segments: ReadonlyArray<{ ammoUuid: string; count: number }>): Promise<WH40KItem | null> {
        const actor: AmmoActorLike | null = (this.parent.actor as AmmoActorLike | null | undefined) ?? null;

        // Return the currently-chambered special rounds to inventory first.
        if (this.clip.value > 0 && this.hasLoadedAmmo && actor !== null) {
            await this._returnRoundsToInventory(actor, this.clip.value);
        }

        const max = this.clip.max;
        const magazine: MagazineSegment[] = [];
        let loaded = 0;
        for (const { ammoUuid, count } of segments) {
            if (count <= 0 || loaded >= max) continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.items members are Foundry Items; narrow to the ammo shape we read
            const ammoItem = actor?.items.find((i) => (i as unknown as { uuid: string }).uuid === ammoUuid) as AmmoItemLike | undefined;
            if (ammoItem?.type !== 'ammunition') continue;
            const quantity = ammoItem.system.quantity;
            const available = quantity ?? count;
            const take = Math.min(count, max - loaded, available);
            if (take <= 0) continue;
            if (actor !== null && quantity !== undefined) {
                // eslint-disable-next-line no-await-in-loop -- sequential: parallel inventory writes to distinct ammo items still must not race the shared clamp accounting
                await ammoItem.update({ 'system.quantity': available - take });
            }
            magazine.push({
                ammoUuid,
                ammoName: ammoItem.name,
                count: take,
                ...ammoSegmentEffects(ammoItem.system),
            });
            loaded += take;
        }

        await this.parent.update({ 'system.clip.magazine': magazine, 'system.clip.value': magazineTotal(magazine) });
        return this.parent;
    }

    /**
     * Return remaining rounds to the actor's inventory.
     * Finds the ammo item by UUID, then by name as fallback.
     * @param {Actor} actor - The owning actor
     * @param {number} rounds - Number of rounds to return
     * @returns {Promise<void>}
     * @private
     */
    async _returnRoundsToInventory(actor: AmmoActorLike, rounds: number): Promise<void> {
        const loaded = this.loadedAmmo;
        if (rounds <= 0 || loaded === undefined || loaded.uuid === '') return;

        // Try to find the ammo item by UUID first, then fall back to name+type.
        const ammoItem = actor.items.find((i) => i.uuid === loaded.uuid) ?? actor.items.find((i) => i.type === 'ammunition' && i.name === loaded.name);

        if (ammoItem) {
            await ammoItem.update({ 'system.quantity': ammoItem.system.quantity + rounds });
        } else {
            // Last resort: create a new ammo item with the returned rounds
            try {
                const sourceItem = (await fromUuid(loaded.uuid)) as SourceItemLike | null;
                if (sourceItem) {
                    const itemData = sourceItem.toObject();
                    itemData.system.quantity = rounds;
                    await actor.createEmbeddedDocuments('Item', [itemData]);
                }
            } catch {
                console.warn(`wh40k-rpg | Could not return ${rounds} rounds of ${loaded.name} to inventory`);
            }
        }
    }
}
