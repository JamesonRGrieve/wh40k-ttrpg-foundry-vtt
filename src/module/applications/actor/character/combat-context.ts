/**
 * Character sheet: the Combat tab's context (attacks, armour, vitals, movement, psychic powers).
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed functions; the sheet calls
 * them with itself as `this` (`fn.call(sheet, …)`), and binds any handlers in
 * `DEFAULT_OPTIONS.actions`.
 */
import { SYSTEM_ID } from '../../../constants.ts';
import type { WH40KActiveEffect } from '../../../documents/active-effect.ts';
import type { WH40KItem } from '../../../documents/item.ts';
import { buildEffectView, type EffectChangeRaw, type EffectView } from '../../../helpers/effects.ts';
import { actionBudgetForActor } from '../../../rules/action-economy.ts';
import { isGrenadeWeapon } from '../../../rules/grenade-weapon.ts';
import { computeHandBudget, handsForWeapon, resolveAvailableHands } from '../../../rules/hand-budget.ts';
import { HIT_LOCATION_IDS, hitLocationLabel, hitLocationRollRange, hitLocationShortLabel } from '../../../rules/hit-locations.ts';
import { combatMovementView, MOVE_MODE_FLAG } from '../../../rules/movement-budget.ts';
import type { WH40KActorSystemData, WH40KItemSystemData } from '../../../types/global.d.ts';
import { getArmourAPForLocation } from '../../../utils/armour-calculator.ts';
import { capitalize } from '../../../utils/format.ts';
import type CharacterSheet from '../character-sheet.ts';
import type { CharacterSheetContext, CategorizedItems, WeaponLike, TalentLike } from './sheet-support.ts';

/** Calculate wounds and fatigue percentages for the combat vitals display. */
export function prepareCombatVitals(
    this: CharacterSheet,
    sheetContext: CharacterSheetContext,
    system: WH40KActorSystemData | NonNullable<CharacterSheetContext['system']>,
): void {
    const woundsValue = system.wounds?.value;
    const woundsMaxRaw = system.wounds?.max;
    const woundsMax = typeof woundsMaxRaw === 'number' && woundsMaxRaw > 0 ? woundsMaxRaw : 1;
    sheetContext.woundsPercent = Math.min(100, Math.round(((woundsValue ?? 0) / woundsMax) * 100));

    const fatigueValue = system.fatigue?.value;
    const fatigueMaxRaw = system.fatigue?.max;
    const fatigueMax = typeof fatigueMaxRaw === 'number' && fatigueMaxRaw > 0 ? fatigueMaxRaw : 1;
    sheetContext.fatiguePercent = Math.min(100, Math.round(((fatigueValue ?? 0) / fatigueMax) * 100));
}

/** The actor's ActiveEffects in the one view shape the chips, rows and dashboard all render. */
export function effectViews(this: CharacterSheet): EffectView<WH40KActiveEffect>[] {
    return this.actor.effects.map((effect) =>
        // eslint-disable-next-line no-restricted-syntax -- boundary: effect.changes is Foundry EffectChange[]; double-cast to EffectChangeRaw[] which is this codebase's typed wrapper
        buildEffectView(effect, effect.changes as unknown as EffectChangeRaw[]),
    );
}

/**
 * Combat move-mode cluster state (#235): the selected move mode + whether the
 * cluster is turn-gated (greyed) for this player + metres left this turn. GMs are
 * never gated — they move freely — and out of combat nothing is gated.
 */
function computeCombatMovement(this: CharacterSheet): { inCombat: boolean; disabled: boolean; selectedMode: string | undefined; remaining: number } {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.combat / Combatant / TokenDocument flags are loosely-typed Foundry runtime surfaces, read defensively
    const combat = game.combat as { started?: boolean; combatant?: { actorId?: string | null; getFlag?: (s: string, k: string) => unknown } | null } | null;
    const inCombat = combat?.started === true;
    // eslint-disable-next-line no-restricted-syntax -- boundary: TokenDocument.getFlag returns Foundry's untyped flag payload
    const token = this.actor.getActiveTokens()[0]?.document as { getFlag?: (s: string, k: string) => unknown } | undefined;
    const rawMode = token?.getFlag?.(SYSTEM_ID, MOVE_MODE_FLAG);
    // Disengage is a Half Action, not a move mode (#416) — no longer a valid selection here.
    const selectedMode = rawMode === 'half' || rawMode === 'full' || rawMode === 'charge' || rawMode === 'run' ? rawMode : undefined;
    const combatant = combat?.combatant;
    const moved = Number(combatant?.getFlag?.('wh40k-rpg', 'movedThisTurnMetres') ?? 0);
    return combatMovementView({
        inCombat,
        isActorsTurn: combatant?.actorId === this.actor.id,
        isGM: game.user.isGM,
        selectedMode,
        rates: this.actor.system.movement,
        movedThisTurnMetres: Number.isFinite(moved) ? moved : 0,
    });
}

/**
 * The actor's available hands for wielding weapons (#418). Reads the optional
 * `system.hands` count (creatures with a non-standard anatomy set their own);
 * a missing/invalid value resolves to the standard two hands.
 */
export function availableHands(this: CharacterSheet): number {
    // eslint-disable-next-line no-restricted-syntax -- boundary: `hands` is an optional per-line actor field absent from the shared system union; narrowed inline
    const raw = (this.actor.system as { hands?: number }).hands;
    return resolveAvailableHands(raw);
}

/**
 * Build the combat-panel psychic-power rows (#412). Any owned `psychicPower`
 * item surfaces a row; the panel is shown only when the actor knows at least
 * one power. The actor's effective Psy Rating is surfaced on the header. The
 * roll (targeting + Fettered/Unfettered/Push level + effective PR) is served
 * by the existing per-line psychic roll path via the `rollPower` action.
 */
function prepareCombatPsychicPowers(this: CharacterSheet, sheetContext: CharacterSheetContext): void {
    const powers = this.actor.items.filter((i) => (i.type as string) === 'psychicPower');
    sheetContext.psychicPowers = powers.map((power) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: psychicPower system fields (disciplineLabel/focusTestLabel getters, prCost, isAttack, state) are not on the shared system union; narrowed inline
        const sys = power.system as {
            disciplineLabel?: string;
            focusTestLabel?: string;
            prCost?: number;
            isAttack?: boolean;
            state?: { identified?: boolean };
        };
        return {
            id: power.id,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- item.name may be null per fvtt-types; ?? guard is intentional
            name: power.name ?? '',
            img: power.img,
            disciplineLabel: sys.disciplineLabel ?? '',
            focusTestLabel: sys.focusTestLabel ?? '',
            prCost: sys.prCost ?? 0,
            isAttack: sys.isAttack === true,
            identified: sys.state?.identified !== false,
        };
    });
    // eslint-disable-next-line no-restricted-syntax -- boundary: `psy` is an FFG-line actor field (currentRating/rating); `psyRating` is the BC-line field; neither is on the shared system union
    const psySystem = this.actor.system as { psy?: { currentRating?: number; rating?: number }; psyRating?: number };
    const psyRating = psySystem.psy?.currentRating ?? psySystem.psy?.rating ?? psySystem.psyRating;
    if (psyRating !== undefined) sheetContext.psyRating = psyRating;
    // A psyker is anyone with a Psy Rating or a known power: they get the
    // power rows and the Perils / Phenomena controls (#194).
    sheetContext.showPsychicPanel = powers.length > 0 || (psyRating ?? 0) > 0;
}

/**
 * Prepare combat tab data for the template.
 * @param {object} context      The template render context.
 * @param {object} categorized  Categorized items.
 * @protected
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: context comes from Foundry ApplicationV2; Record<string, unknown> matches upstream signature
export function prepareCombatData(this: CharacterSheet, context: Record<string, unknown>, categorized: CategorizedItems): void {
    // Runs from BOTH `_prepareContext` and `_prepareTabPartContext` (the
    // isolated part context doesn't inherit the main one), so the whole
    // preparation — including mapping every ActiveEffect through
    // `summarizeChanges` — used to be done twice per render (#507).
    //
    // Memoised as a DIFF rather than by returning a fresh object: the body
    // reads loadout values (`primaryWeapon`, `armourDisplayLocations`, …)
    // that `_prepareLoadoutData` writes onto the same context immediately
    // before, at both call sites, so it cannot simply be handed a blank
    // scratch object. The cache is cleared at the top of every render.
    const cached = this._combatDataCache;
    if (cached !== null) {
        Object.assign(context, cached);
        return;
    }
    const before = new Map(Object.entries(context));

    const sheetContext = context as CharacterSheetContext;
    const weapons = categorized.weapons as WeaponLike[];
    // eslint-disable-next-line no-restricted-syntax -- sheetContext.system may be absent if context was freshly created; ?? fallback to actor.system is intentional
    const system = sheetContext.system ?? this.actor.system;

    prepareCombatVitals.call(this, sheetContext, system);
    sheetContext.combatMovement = computeCombatMovement.call(this);
    // Per-turn action economy (#264) — null when this actor isn't in combat.
    const actorId = this.actor.id;
    sheetContext.actionBudget = actorId !== null ? actionBudgetForActor(actorId) : null;

    // Critical injuries
    sheetContext.criticalInjuries = categorized.criticalInjury;

    // Force field (first active/equipped one)
    const forceFields = categorized.forceField;
    sheetContext.forceField =
        forceFields.find((ff) => {
            const sys = ff.system as WeaponLike['system'];
            return sys.state.equipped || sys.state.activated;
        }) ?? forceFields[0];
    sheetContext.hasForceField = sheetContext.forceField !== undefined;
    sheetContext.armourDisplayLocations = prepareArmourDisplayLocations.call(this, this.actor.system, categorized.armour);
    // eslint-disable-next-line no-restricted-syntax -- boundary: armourDisplayMap values are heterogeneous display objects passed to Handlebars; no concrete type
    const armourDisplayMap: Record<string, Record<string, unknown>> = {};
    // eslint-disable-next-line no-restricted-syntax -- boundary: armourDisplayLocations is typed as unknown[] on the context; cast needed to iterate key/value pairs
    for (const entry of sheetContext.armourDisplayLocations as Array<Record<string, unknown>>) {
        if (typeof entry['key'] === 'string') {
            armourDisplayMap[entry['key']] = entry;
        }
    }
    sheetContext.armourDisplay = armourDisplayMap;

    // Equipped non-armour gear surfaced on the body preview as icons (#334):
    // auspex, rebreather, micro-bead, cybernetics, active force fields. Armour
    // already renders per body location and weapons live in the arsenal, so
    // both are excluded here to avoid duplicating them on the silhouette.
    sheetContext.equippedGear = categorized.equipped
        .filter((item) => item.type === 'gear' || item.type === 'cybernetic' || item.type === 'forceField')
        .map((item) => ({ id: item.id, name: item.name, img: item.img }));

    // Weapon slots - categorize by class and equipped status
    const equippedWeapons = weapons.filter((w) => w.system.state.equipped);
    sheetContext.equippedWeapons = equippedWeapons;

    // Hand budget (#418): sum the hands consumed by equipped weapons against
    // the actor's available hands (non-standard anatomies expose their own
    // count via `system.hands`; unrecorded actors default to two). Surfaced
    // on the arsenal header and enforced in the draw/holster action.
    sheetContext.handBudget = computeHandBudget(
        availableHands.call(this),
        equippedWeapons.map((w) => handsForWeapon(w.system.isTwoHanded)),
    );

    // Psychic powers (#412): mirror the weapon rows. Ownership of any
    // psychicPower item is the per-system-neutral gate — the roll itself
    // dispatches through the actor's per-line psychic path.
    prepareCombatPsychicPowers.call(this, sheetContext);
    const rangedWeapons = equippedWeapons.filter((w) => w.system.class !== 'Melee');
    const meleeWeapons = equippedWeapons.filter((w) => w.system.class === 'Melee');

    // Primary weapon
    sheetContext.primaryWeapon =
        rangedWeapons.length > 0 ? rangedWeapons[0] : meleeWeapons.length > 0 ? meleeWeapons[0] : weapons.find((w) => w.system.state.equipped);

    // Secondary weapon
    if (sheetContext.primaryWeapon !== undefined) {
        if (rangedWeapons.length > 0 && meleeWeapons.length > 0) {
            sheetContext.secondaryWeapon = meleeWeapons[0];
        } else if (rangedWeapons.length > 1) {
            sheetContext.secondaryWeapon = rangedWeapons[1];
        } else if (meleeWeapons.length > 1) {
            sheetContext.secondaryWeapon = meleeWeapons[1];
        }
    }

    // Sidearm: Pistol class weapon
    sheetContext.sidearm = weapons.find((w) => w.system.class === 'Pistol' && w !== sheetContext.primaryWeapon && w !== sheetContext.secondaryWeapon);

    // Grenades, read from each weapon's class and type (#619)
    sheetContext.grenades = weapons.filter((w) => isGrenadeWeapon(w.system));

    // Other weapons (not in slots)
    const slotWeapons = [sheetContext.primaryWeapon, sheetContext.secondaryWeapon, sheetContext.sidearm, ...(sheetContext.grenades as WeaponLike[])].filter(
        (w): w is WeaponLike => w !== undefined && w !== null,
    );
    sheetContext.otherWeapons = weapons.filter((w) => !slotWeapons.includes(w));

    // Add ammo percentage to weapons
    [sheetContext.primaryWeapon, sheetContext.secondaryWeapon, sheetContext.sidearm]
        .filter((w): w is WeaponLike => w !== undefined && w !== null)
        .forEach((w) => {
            const clip = w.system.clip;
            if (clip.max > 0 && w.system.effectiveClipMax > 0) {
                // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unnecessary-condition -- no-restricted-syntax: ammoPercentage may be absent on older data; no-unnecessary-condition: noUncheckedIndexedAccess makes ammoPercentage possibly-undefined despite WeaponLike typing it as number
                w.ammoPercent = w.system.ammoPercentage ?? Math.round((clip.value / w.system.effectiveClipMax) * 100);
            }
        });

    // Active effects in the one view shape every effect surface renders (#456 time remaining included).
    sheetContext.effects = effectViews.call(this);

    // Extract combat talents for display in combat actions panel
    const talents = this.actor.items.filter((i) => i.type === 'talent') as TalentLike[];
    sheetContext.combatTalents = talents
        .filter((t) => t.system.category === 'combat' && t.system['isPassive'] !== true)
        .map((t) => {
            return {
                id: t.id,
                name: t.name,
                img: t.img,
                system: {
                    tier: t.system.tier,
                    category: t.system.category,
                },
            };
        });

    // Attack actions are no longer surfaced on the combat panel — they live on the
    // per-weapon attack dialog (#227), so the panel no longer needs them partitioned.

    // Record what this pass produced so the second call in the same render
    // replays it instead of recomputing (#507).
    // eslint-disable-next-line no-restricted-syntax -- boundary: the sheet context is Foundry's untyped template payload
    const diff: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
        if (!before.has(key) || before.get(key) !== value) diff[key] = value;
    }
    this._combatDataCache = diff;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: returns heterogeneous display objects passed to Handlebars; no concrete type possible
function prepareArmourDisplayLocations(this: CharacterSheet, system: WH40KActorSystemData, armourItems: WH40KItem[]): Array<Record<string, unknown>> {
    // `equipped` is runtime state under `system.state` (EquippableTemplate), not
    // `system.equipped` — the flat path is always undefined, so this filter used to
    // yield [] and no armour icon ever reached the silhouette (#486). Every other
    // equipped-read in this file already uses the nested path.
    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is the shared item union; `state` is contributed by EquippableTemplate and is not on that union
    const equippedArmour = armourItems.filter((item) => (item.system as { state?: { equipped?: boolean } }).state?.equipped === true);

    return HIT_LOCATION_IDS.map((locationKey) => {
        const locationLabel = hitLocationLabel(locationKey);
        const armourData = this._armourAtLocation(system, locationKey);
        const coveringItems = equippedArmour
            .map((item) => {
                // Resolve AP through the shared helper so the effective-AP → AP →
                // armourPoints ladder lives in exactly one place, and — critically —
                // so the DataModel methods are invoked *as methods*. Reading them off
                // the model and calling them detached leaves `this` undefined, which
                // threw inside `armour.ts` getEffectiveAPForLocation and took the whole
                // sheet render down (#486).
                const ap = getArmourAPForLocation(item.system, locationKey);
                if (ap <= 0) return null;

                return {
                    id: item.id,
                    name: item.name,
                    img: item.img,
                    ap,
                    tooltipData: JSON.stringify({
                        title: item.name,
                        content: `
                            <div class="tw-flex tw-items-center tw-gap-2">
                                <img src="${item.img}" alt="${
                            item.name
                        }" class="tw-h-8 tw-w-8 tw-rounded tw-border tw-border-[var(--wh40k-border-color)] tw-object-cover" />
                                <div class="tw-flex tw-flex-col">
                                    <span class="tw-font-semibold">${item.name}</span>
                                    <span class="tw-text-xs tw-text-[var(--wh40k-text-muted)]">${game.i18n.format('WH40K.ArmourSilhouette.LocationAp', {
                                        location: locationLabel,
                                        ap: String(ap),
                                    })}</span>
                                </div>
                            </div>
                        `,
                    }),
                };
            })
            .filter((piece): piece is NonNullable<typeof piece> => piece !== null);

        return {
            key: locationKey,
            rollRange: hitLocationRollRange(locationKey),
            label: locationLabel,
            shortLabel: hitLocationShortLabel(locationKey),
            total: armourData.total,
            tooltipData: this.prepareArmorTooltip(locationKey, armourData, coveringItems),
            items: coveringItems,
        };
    });
}

/**
 * Context of the Combat tab's Navigator-powers, rituals and ship-orders
 * panels (#194). Each panel renders only when the character owns items of
 * its type, on every line: the gate is item ownership, never the game line,
 * so a Navigator in any line's sheet can use the power it holds.
 * @returns {object} Panel context data
 * @protected
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: returns heterogeneous display data for Handlebars; no concrete exported type
export function prepareCombatPowerPanelsContext(this: CharacterSheet): Record<string, unknown> {
    const navigatorPowers = this.actor.items.filter((i) => (i.type as string) === 'navigatorPower');
    const rituals = this.actor.items.filter((i) => (i.type as string) === 'ritual');
    const orders = this.actor.items.filter((i) => (i.type as string) === 'order');

    // Extract unique order categories
    const categories = new Map<string, { id: string; label: string }>();
    for (const order of orders) {
        const sys = order.system as WH40KItemSystemData & { category?: string; categoryLabel?: string };
        const cat = sys.category;
        if (cat !== undefined && cat !== '' && !categories.has(cat)) {
            categories.set(cat, {
                id: cat,
                label: sys.categoryLabel !== undefined && sys.categoryLabel !== '' ? sys.categoryLabel : capitalize(cat),
            });
        }
    }
    const orderCategories = Array.from(categories.values());

    // Apply category filter to orders
    const activeOrderCategory = this._orderCategoryFilter;
    let filteredOrders = orders;
    if (activeOrderCategory !== '') {
        filteredOrders = orders.filter((o) => (o.system as WH40KItemSystemData & { category?: string }).category === activeOrderCategory);
    }

    return {
        navigatorPowers,
        rituals,
        orders: filteredOrders,
        navigatorPowersCount: navigatorPowers.length,
        ritualsCount: rituals.length,
        ordersCount: orders.length,
        orderCategories,
        activeOrderCategory,
    };
}
