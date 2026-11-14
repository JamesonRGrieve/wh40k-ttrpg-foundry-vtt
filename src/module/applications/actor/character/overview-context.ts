/**
 * Character sheet: the Overview tab's context (characteristic HUD, dashboard, dynasty, favourites) and the item lists.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed functions; the sheet calls
 * them with itself as `this` (`fn.call(sheet, …)`), and binds any handlers in
 * `DEFAULT_OPTIONS.actions`.
 */
import { darkPactDefinitions } from '../../../documents/dark-pacts.ts';
import type { WH40KItem } from '../../../documents/item.ts';
import type { WH40KItemSystemData } from '../../../types/global.d.ts';
import { darkPactPanelView } from '../../item/dark-pact-view.ts';
import { ADVANCE_XP_COSTS, type SkillLike } from '../base-actor-sheet.ts';
import type CharacterSheet from '../character-sheet.ts';
import { encumbranceDisplay } from '../encumbrance-display.ts';
import * as CombatContext from './combat-context.ts';
import type { CategorizedItems, CharacterSheetContext, PartContext } from './sheet-support.ts';

/**
 * Synthesize an `influence` entry on the characteristics map for DH2 RAW mode.
 * Mirrors the CharacteristicField shape so the panel template and HUD prep treat
 * it identically to WS/BS/etc. Influence has no `advance`/`unnatural`/`base`
 * mechanics in the data model — it's a flat 0-100 value — so the derived fields
 * are filled with zero/identity values that the template renders harmlessly.
 */
export function injectInfluenceAsCharacteristic(this: CharacterSheet, context: CharacterSheetContext): void {
    const actor = context.actor;
    if (!actor) return;
    const value = Number(this.actor.system.influence);
    const entry = {
        label: game.i18n.localize('WH40K.Characteristic.Influence'),
        short: game.i18n.localize('WH40K.Characteristic.Abbr.Influence'),
        base: value,
        advance: 0,
        modifier: 0,
        unnatural: 0,
        bonus: Math.floor(value / 10),
        total: value,
    };
    const characteristics = actor.characteristics ?? {};
    characteristics['influence'] = entry;
    actor.characteristics = characteristics;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: context comes from Foundry ApplicationV2; Record<string, unknown> matches upstream signature
export function prepareCharacteristicHUD(this: CharacterSheet, context: Record<string, unknown>): void {
    const sheetContext = context as CharacterSheetContext;
    const hudCharacteristics = sheetContext.actor?.characteristics ?? {};
    const modifierSources = sheetContext.system?.modifierSources?.characteristics ?? {};

    // SVG circle parameters for progress ring
    const radius = 52;
    const circumference = 2 * Math.PI * radius; // ~326.7

    /* eslint-disable no-restricted-syntax -- boundary: HUD characteristic shape mirrors Foundry's CharacteristicField runtime payload; concrete properties exist only to make property writes legal under noPropertyAccessFromIndexSignature. */
    type CharHud = {
        total?: unknown;
        advance?: unknown;
        bonus?: unknown;
        hudMod?: unknown;
        hudTotal?: unknown;
        advanceProgress?: unknown;
        progressCircumference?: unknown;
        progressOffset?: unknown;
        nextAdvanceCost?: unknown;
        tooltipData?: unknown;
        [key: string]: unknown;
    };
    /* eslint-enable no-restricted-syntax */

    Object.entries(hudCharacteristics).forEach(([key, rawChar]) => {
        const char = rawChar as CharHud;
        const total = Number(char.total ?? 0);
        const advance = Number(char.advance ?? 0);

        // Use the calculated bonus (accounts for unnatural), fallback to tens digit
        char.hudMod = char.bonus ?? Math.floor(total / 10);
        char.hudTotal = total;

        // Progress ring data (advancement 0-5 maps to 0-100%)
        char.advanceProgress = (advance / 5) * 100;
        char.progressCircumference = circumference;
        char.progressOffset = circumference * (1 - advance / 5);

        // XP cost for next advancement (using WH40K progression)
        char.nextAdvanceCost = advance < 5 ? ADVANCE_XP_COSTS[advance] : 0;

        // Prepare tooltip data using the mixin helper
        char.tooltipData = this.prepareCharacteristicTooltip(key, char, modifierSources);
    });
}

/**
 * Get categorized items. Called fresh each time (no caching).
 * @returns {object} Categorized items
 * @protected
 */
export function getCategorizedItems(this: CharacterSheet): CategorizedItems {
    const categories: CategorizedItems = {
        all: [],
        allCarried: [], // Items on person or in backpack (not ship)
        allShip: [], // Items in ship storage
        weapons: [],
        armour: [],
        forceField: [],
        cybernetic: [],
        gear: [],
        storageLocation: [],
        criticalInjury: [],
        equipped: [],
    };

    // Equipment item types that should appear in backpack
    const equipmentTypes = ['weapon', 'armour', 'forceField', 'cybernetic', 'gear', 'storageLocation', 'ammunition', 'drugOrConsumable'];

    for (const item of this.actor.items) {
        const itemType = item.type as string;
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is a Foundry DataModel; transient flags (state) and the default-grant flag are not on the typed schema yet; bracket access needs Record cast
        const sys = item.system as Record<string, unknown>;
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.state is an untyped transient-flag bag on the DataModel; bracket access needs Record cast
        const sysState = sys['state'] as Record<string, unknown> | undefined;
        const inShip = sysState?.['inShipStorage'] === true;
        // Default-granted fallback items (e.g. the bound Unarmed strike, #228)
        // are the combat fallback, not inventory loot — keep them out of the
        // carried/backpack/ship inventory lists (they still flow into the
        // combat `weapons` category below).
        const isDefaultGrant = sys['grantedByDefault'] === true;

        // Add all equipment to "all" for display
        if (equipmentTypes.includes(itemType) && !isDefaultGrant) {
            categories.all.push(item);

            // Split into carried vs ship storage
            if (inShip) {
                categories.allShip.push(item);
            } else {
                categories.allCarried.push(item);
            }
        }

        // Categorize by type (ONLY non-ship items for armour/forceField/gear panels)
        if (itemType === 'weapon' || (item as WH40KItem).isWeapon) categories.weapons.push(item);
        else if ((itemType === 'armour' || (item as WH40KItem).isArmour) && !inShip) categories.armour.push(item);
        else if ((itemType === 'forceField' || (item as WH40KItem).isForceField) && !inShip) categories.forceField.push(item);
        else if ((itemType === 'cybernetic' || (item as WH40KItem).isCybernetic) && !inShip) categories.cybernetic.push(item);
        else if ((itemType === 'gear' || (item as WH40KItem).isGear) && !inShip) categories.gear.push(item);
        else if (itemType === 'storageLocation') categories.storageLocation.push(item);
        else if (itemType === 'criticalInjury' || (item as WH40KItem).isCriticalInjury) categories.criticalInjury.push(item);

        // Track equipped items (only non-ship items can be equipped)
        if (sysState?.['equipped'] === true && !inShip) categories.equipped.push(item);
    }

    return categories;
}

/**
 * Prepare loadout/equipment data for the template.
 * @param {object} context      The template render context.
 * @param {object} categorized  Categorized items.
 * @protected
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: context comes from Foundry ApplicationV2; Record<string, unknown> matches upstream signature
export function prepareLoadoutData(this: CharacterSheet, context: Record<string, unknown>, categorized: CategorizedItems): void {
    const loadoutContext = context as CharacterSheetContext & {
        armourItems: WH40KItem[];
        forceFieldItems: WH40KItem[];
        cyberneticItems: WH40KItem[];
        gearItems: WH40KItem[];
        equippedItems: WH40KItem[];
    };
    // Add all items to context for the Backpack panel
    loadoutContext.allItems = categorized.all;
    loadoutContext.allCarriedItems = categorized.allCarried;
    loadoutContext.allShipItems = categorized.allShip;

    // Filter items by type
    loadoutContext.armourItems = categorized.armour;
    loadoutContext.forceFieldItems = categorized.forceField;
    loadoutContext.cyberneticItems = categorized.cybernetic;
    loadoutContext.gearItems = categorized.gear;
    loadoutContext.storageLocations = categorized.storageLocation;

    // Equipped items (all types that are equipped)
    loadoutContext.equippedItems = categorized.equipped;

    // Counts for section headers
    loadoutContext.armourCount = loadoutContext.armourItems.length;
    loadoutContext.forceFieldCount = loadoutContext.forceFieldItems.length;
    loadoutContext.cyberneticCount = loadoutContext.cyberneticItems.length;
    loadoutContext.gearCount = loadoutContext.gearItems.length;
    loadoutContext.equippedCount = loadoutContext.equippedItems.length;

    // The Carry bar: NPCSheet inherits this pipeline, but only a document that
    // tracks encumbrance (the PC's) gets the bar, through the explicit flag (#545).
    Object.assign(loadoutContext, encumbranceDisplay(this.actor));
}

/**
 * Prepare WH40K RPG specific fields.
 * @param {object} rogueTraderData  The rogueTrader data object.
 * @returns {object}
 * @protected
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: rogueTraderData is an untyped sub-object from the sheet context; fields vary by system
export function prepareWH40KFields(this: CharacterSheet, rogueTraderData: Record<string, unknown>): Record<string, unknown> {
    /* eslint-disable no-restricted-syntax -- boundary: prepared sub-fields are heterogeneous system data passed to Handlebars */
    const prepared = rogueTraderData as Record<string, unknown> & {
        armour?: unknown;
        weight?: unknown;
        acquisitions?: unknown;
        wounds?: unknown;
        fate?: unknown;
    };
    /* eslint-enable no-restricted-syntax */
    prepared.armour = prepared.armour ?? {
        head: 0,
        rightArm: 0,
        leftArm: 0,
        body: 0,
        rightLeg: 0,
        leftLeg: 0,
    };
    prepared.weight = prepared.weight ?? { total: 0, current: 0 };

    const acquisitions = Array.isArray(prepared.acquisitions)
        ? prepared.acquisitions
        : prepared.acquisitions !== null && prepared.acquisitions !== undefined
        ? [{ name: '', availability: '', modifier: 0, notes: prepared.acquisitions, acquired: false, uuid: '' }]
        : [];
    prepared.acquisitions = acquisitions;

    // Wounds/fatigue/fate live on Acolyte-shaped actors; NPCs (which
    // share this sheet's prepare pipeline) don't define those getters.
    // Skip the rollup for them rather than crashing the render.
    if ('wounds' in this.actor && 'fate' in this.actor && 'fatigue' in this.actor) {
        const a = this.actor as {
            wounds: { max: number; value: number; critical: number };
            fate: { max: number; value: number };
            fatigue: { value: number };
        };
        prepared.wounds = {
            total: a.wounds.max,
            current: a.wounds.value,
            critical: a.wounds.critical,
            fatigue: a.fatigue.value,
        };
        prepared.fate = {
            total: a.fate.max,
            current: a.fate.value,
        };
    }

    return prepared;
}

/**
 * Prepare dynasty tab data including wealth tiers and gauge positioning.
 * @returns {object} Dynasty display data
 * @protected
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: dynasty data is a heterogeneous display object passed to Handlebars; no concrete exported type
export function prepareDynastyData(this: CharacterSheet): Record<string, unknown> {
    const pf = (this.actor.system.rogueTrader?.profitFactor ?? {}) as {
        current?: number;
        starting?: number;
        modifier?: number;
    };
    const currentPF = pf.current ?? 0;
    const startingPF = pf.starting ?? 0;
    const modifier = pf.modifier ?? 0;
    const effectivePF = currentPF + modifier;

    // Determine wealth tier (WH40K RPG wealth categories)
    let wealthTier: { key: string; label: string; min: number };
    if (effectivePF >= 100) {
        wealthTier = { key: 'legendary', label: game.i18n.localize('WH40K.Dynasty.WealthTier.Legendary'), min: 100 };
    } else if (effectivePF >= 75) {
        wealthTier = { key: 'mighty', label: game.i18n.localize('WH40K.Dynasty.WealthTier.Mighty'), min: 75 };
    } else if (effectivePF >= 50) {
        wealthTier = { key: 'notable', label: game.i18n.localize('WH40K.Dynasty.WealthTier.Notable'), min: 50 };
    } else if (effectivePF >= 25) {
        wealthTier = { key: 'modest', label: game.i18n.localize('WH40K.Dynasty.WealthTier.Modest'), min: 25 };
    } else {
        wealthTier = { key: 'poor', label: game.i18n.localize('WH40K.Dynasty.WealthTier.Poor'), min: 0 };
    }

    // Calculate percentage for gauge (cap at 100 for display, but allow >100 PF)
    const pfPercentage = Math.min(Math.max((effectivePF / 100) * 100, 0), 100);

    return {
        currentPF,
        startingPF,
        modifier,
        effectivePF,
        wealthTier,
        pfPercentage,
    };
}

/**
 * Prepare overview dashboard context for the new ultra-dense dashboard.
 * @param {object} context  Context being prepared.
 * @param {object} options  Render options.
 * @returns {Promise<object>}
 * @protected
 */
export async function prepareOverviewDashboardContext(this: CharacterSheet, context: PartContext, options: PartContext): Promise<PartContext> {
    // Dark Pacts (#84): each struck pact's Boons and Banes, read from its pact item.
    const pacts = this.actor.system.pacts;
    const pactDefinitions = await darkPactDefinitions(pacts);
    Object.assign(context, { darkPactPanel: darkPactPanelView(pacts, pactDefinitions, game.user.isGM) });

    const ctx = context as CharacterSheetContext;
    // First prepare standard tab context
    await this._prepareTabPartContext('overview', context, options);

    // Add Active Effects data for dashboard preview
    ctx.effects = CombatContext.effectViews.call(this);

    // Ensure combat data is available (for primaryWeapon)
    // This is already prepared in _prepareContext via _prepareCombatData

    // Ensure characteristics data is available in the format expected by dashboard
    // This is already prepared in _prepareContext

    // Prepare favorite skills for dashboard
    const favoriteSkills = prepareFavoriteSkills.call(this);
    ctx.favoriteSkills = favoriteSkills;

    // Add favorite talents for display
    const favoriteTalents = prepareFavoriteTalents.call(this);
    ctx.favoriteTalents = favoriteTalents;

    return ctx;
}

/**
 * Prepare favorite skills for overview dashboard display.
 * @returns {Array<object>} Array of favorite skill display objects
 * @protected
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: returns display objects for Handlebars; no concrete exported type
function prepareFavoriteSkills(this: CharacterSheet): Record<string, unknown>[] {
    const favorites = (this.actor.getFlag('wh40k-rpg', 'favoriteSkills') as string[] | undefined) ?? [];
    const specialistFavorites = (this.actor.getFlag('wh40k-rpg', 'favoriteSpecialistSkills') as string[] | undefined) ?? [];
    const skills = this.actor.skills;
    const characteristics = this.actor.characteristics;

    // Standard skill favourites
    const standardFavourites = favorites
        .map((key) => {
            const skill = skills[key];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (skill === undefined) return null;
            if (!this._isFavouriteEligible(skill as SkillLike)) return null;
            const charShort = skill.characteristic !== '' ? skill.characteristic : 'S';
            const charKey = this._charShortToKey(charShort);
            const char = characteristics[charKey];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (char === undefined) return null;
            const label: string = skill.label !== undefined && skill.label !== '' ? skill.label : key;
            // Route favourites through the same prepareSkillTooltip(...) path the
            // Statistics tab uses (issue #36) so the per-system rank labels (Known/
            // Trained/Experienced/Veteran vs Trained/+10/+20) resolve identically.
            // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics map is a Record<string, CharacteristicLike>; the mixin signature takes Record<string, unknown>.
            const tooltipData = this.prepareSkillTooltip(key, { ...skill, label }, characteristics);
            return {
                key,
                label,
                current: skill.current,
                characteristic: charKey,
                charShort: char.short !== '' ? char.short : charKey,
                breakdown: this._getSkillBreakdown(skill as SkillLike, char),
                tooltipData,
            };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

    // Specialist favourites are stored as "skillKey:entryIndex"; resolve each to the
    // matching specialisation entry so they appear in the Overview favourites list
    // alongside standard skills (issue #5).
    const specialistFavouriteRows = specialistFavorites
        .map((compositeKey) => {
            const [skillKey, indexStr] = compositeKey.split(':');
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (skillKey === undefined || skillKey === '' || indexStr === undefined) return null;
            const index = Number.parseInt(indexStr, 10);
            if (Number.isNaN(index)) return null;
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.skills is indexed by string; specialist skill shape not on the top-level type
            const parent = skills[skillKey] as { entries?: unknown[]; characteristic?: string; label?: string } | undefined;
            const entries = parent?.entries;
            if (!Array.isArray(entries)) return null;
            // eslint-disable-next-line no-restricted-syntax -- boundary: entries[] is unknown[] from the DataModel; cast to access specialist entry fields
            const entry = entries[index] as Record<string, unknown> | undefined;
            if (entry === undefined) return null;
            const charShort = (entry['characteristic'] as string | undefined) ?? parent?.characteristic ?? 'S';
            const charKey = this._charShortToKey(charShort);
            const char = characteristics[charKey];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (char === undefined) return null;
            const entryName = (entry['name'] as string | undefined) ?? (entry['label'] as string | undefined) ?? skillKey;
            const parentLabel = parent?.label ?? skillKey;
            const composedLabel = `${parentLabel} (${entryName})`;
            // Specialist entries carry the same trained/plus10/plus20/plus30 flags as
            // standard skills (WH40KSkillEntry shape); route them through the shared
            // prepareSkillTooltip(...) path so per-system rank labels resolve via the
            // active GameSystemConfig (issue #36).
            const synthesizedSkill = { ...entry, characteristic: charShort, label: composedLabel };
            // eslint-disable-next-line no-restricted-syntax -- boundary: synthesised from the raw entries[] payload (Record<string, unknown>); the mixin signature takes Record<string, unknown>.
            const tooltipData = this.prepareSkillTooltip(compositeKey, synthesizedSkill, characteristics);
            return {
                key: compositeKey,
                label: composedLabel,
                current: (entry['current'] as number | undefined) ?? 0,
                characteristic: charKey,
                charShort: char.short !== '' ? char.short : charKey,
                breakdown: this._getSkillBreakdown(entry, char),
                tooltipData,
            };
        })
        .filter((row) => row !== null);

    // Sort the rendered rows by their displayed label, locale-aware. This is the
    // single source of ordering for favourites (#6): the stored flag array's order
    // is ignored at render time so add / remove / re-add always produces the same
    // alphabetical sequence regardless of any historical insertion order drift.
    const lang = game.i18n.lang;
    const merged: { label: string }[] = [...standardFavourites, ...specialistFavouriteRows];
    merged.sort((a, b) => a.label.localeCompare(b.label, lang, { sensitivity: 'base' }));
    // eslint-disable-next-line no-restricted-syntax -- boundary: returned array is consumed by Handlebars; upcast to match declared return type
    return merged;
}

/**
 * Prepare favorite talents for overview dashboard display.
 * @returns {Array<object>} Array of favorite talent display objects
 * @protected
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: returns display objects for Handlebars; no concrete exported type
function prepareFavoriteTalents(this: CharacterSheet): Record<string, unknown>[] {
    const favorites = (this.actor.getFlag('wh40k-rpg', 'favoriteTalents') as string[] | undefined) ?? [];
    const talents = this.actor.items.filter((i) => (i.type as string) === 'talent');

    // Render the favourite talents and sort by their displayed name unconditionally
    // (#6) — flag array order is ignored so add / remove / re-add is stable. Falls
    // back to talent.name when fullName isn't set; matches what the template shows.
    const rows = favorites
        .map((id: string) => {
            const talent = talents.find((t) => t.id === id);
            if (talent === undefined) return null;

            const sys = talent.system as WH40KItemSystemData & {
                fullName?: string;
                specialization?: string;
                category?: string;
            };
            const fullName = sys.fullName !== undefined && sys.fullName !== '' ? sys.fullName : talent.name;
            return {
                id: talent.id,
                name: talent.name,
                img: talent.img,
                fullName,
                specialization: sys.specialization ?? '',
                system: {
                    tier: sys.tier ?? 0,
                    category: sys.category ?? '',
                },
            };
        })
        .filter((talent) => talent !== null);
    const lang = game.i18n.lang;
    rows.sort((a, b) => a.fullName.localeCompare(b.fullName, lang, { sensitivity: 'base' }));
    return rows;
}
