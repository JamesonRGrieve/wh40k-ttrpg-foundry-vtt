/**
 * Character sheet: the Black Crusade, Deathwatch and Only War engine panels' context builders, and the OW award / drawback handlers.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed functions; the sheet calls
 * them with itself as `this` (`fn.call(sheet, …)`), and binds any handlers in
 * `DEFAULT_OPTIONS.actions`.
 */
import { readSpecialAbility } from '../../../actions/dw-distinction-actions.ts';
import { orderPanelRows } from '../../../actions/ow-orders-actions.ts';
import { resolveRegimentCatalog } from '../../../actions/ow-regiment-actions.ts';
import { BC_INFAMY_ADVANCE_CAP, BC_INFAMY_INCREMENT, infamyAdvanceCost } from '../../../config/game-systems/bc-advancement-config.ts';
import { comradeOrdersFor, comradeRulesFor } from '../../../config/game-systems/index.ts';
import { addRegimentalAward, chooseCompendiumAward } from '../../../documents/ow-awards.ts';
import { addRegimentalDrawback, chooseCompendiumDrawback } from '../../../documents/ow-drawbacks.ts';
import { currentCombatRound } from '../../../rolls/counter-attack-flow.ts';
import {
    deriveAlignmentFromTally,
    nextAlignmentCheckpoint,
    psykerLockedByAlignment,
    shouldRecheckAlignment,
    tallyAdvancesByAlignment,
    type ChaosAdvanceEntry,
} from '../../../rules/bc-alignment-derivation.ts';
import { APOTHEOSIS_CORRUPTION, isAscended, resolveApotheosis } from '../../../rules/bc-daemon-prince.ts';
import { isGiftItem } from '../../../rules/bc-gifts.ts';
import { maxPushLevel, resolvePsychicTest } from '../../../rules/bc-psychic-strength.ts';
import { daemonEngineRageBonus } from '../../../rules/bc-supplement-mechanics.ts';
import {
    ASTARTES_IMPLANTS,
    astartesStrengthBonus,
    astartesToughnessBonus,
    hasBlackCarapace,
    IMPLANT_EFFECTS,
    type AstartesImplantId,
} from '../../../rules/dw-astartes.ts';
import {
    canGainSpecialAbility,
    type MarkGrantSource,
    mergeMarkGrants,
    SPECIAL_ABILITY_CATEGORIES,
    type SpecialAbilityCategory,
    specialAbilityCategoryLabelKey,
} from '../../../rules/dw-distinction.ts';
import { isOathActive } from '../../../rules/dw-oath.ts';
import { getRenownRank, RENOWN_RANK_ORDER, RENOWN_THRESHOLDS, type RenownRank, renownRankLabelKey } from '../../../rules/dw-renown.ts';
import { DW_SELECTED_AMMO_CHOICES, DW_SPECIAL_AMMO_EFFECTS, type DwSelectedAmmoId } from '../../../rules/dw-special-ammo.ts';
import { getSupportRange } from '../../../rules/dw-squad-mode.ts';
import { buildComradeHealingPanel } from '../../../rules/ow-comrade-healing.ts';
import { buildComradePanel, type ComradeRules } from '../../../rules/ow-comrade.ts';
import { buildOwCraftsmanshipPanel } from '../../../rules/ow-craftsmanship-panel.ts';
import { OW_DEFAULT_LOGISTICS_RATING } from '../../../rules/ow-logistics.ts';
import { MOUNTED_ACTIONS } from '../../../rules/ow-mount.ts';
import { REGIMENT_BUDGET, buildRegimentPanelSummary } from '../../../rules/ow-regiment-creation.ts';
import { buildDrawbackPanel, type MultiComradeRoster, type RegimentDrawback } from '../../../rules/ow-regiment-drawback.ts';
import { buildBattlefieldPanel, type RegimentalAward } from '../../../rules/ow-regimental-award.ts';
import { capitalize, formatSigned } from '../../../utils/format.ts';
import { uuidNameCache } from '../../../utils/uuid-name-cache.ts';
import { WH40KSettings } from '../../../wh40k-rpg-settings.ts';
import { buildBcGiftsPanel, labelOf, type BcGiftsPanelContext, type GiftPanelItem } from '../bc-gifts-panel-context.ts';
import type CharacterSheet from '../character-sheet.ts';
import {
    titleCase,
    cachedRefName,
    owSystemRecord,
    type BcAlignmentPanelContext,
    type BcPsychicPanelContext,
    type DwAstartesPanelContext,
    type DwCohesionPanelContext,
    type DwModePanelContext,
    type DwRenownPanelContext,
    type DwRequisitionPanelContext,
    type OwRegimentPanelContext,
    type OwComradePanelContext,
    type OwLogisticsPanelContext,
    type OwOrdersPanelContext,
    type BcRitualPanelContext,
    type BcSupplementsPanelContext,
    type BcDaemonPrincePanelContext,
    type DwDistinctionPanelContext,
    type DwAmmoPanelContext,
    type DwOathPanelContext,
    type DwMissionPanelContext,
    type OwMissionGearPanelContext,
    type OwVehicleMovementPanelContext,
    type OwMountPanelContext,
    type OwComradeHealingPanelContext,
    type SystemPanels,
    awardRefName,
} from './sheet-support.ts';

/**
 * Build the BC Alignment / Infamy panel context (#173).
 *
 * Tally + derived-alignment + recheck-due + psyker-lock all come from
 * `bc-alignment-derivation.ts`; the Infamy cost / cap / increment come
 * from `bc-advancement-config.ts`. The partial reads the returned
 * object as `alignmentPanel.*`.
 */
function prepareBcAlignmentPanel(this: CharacterSheet): BcAlignmentPanelContext {
    const system = this.actor.system;
    const advances: ReadonlyArray<ChaosAdvanceEntry> = system.chaosAdvancements;
    const tally = tallyAdvancesByAlignment(advances);
    const derived = deriveAlignmentFromTally(tally);
    const current = system.chaosAlignment;
    const checkpoint = system.alignmentCheckpoint;
    const corruption = system.corruption;
    const infamy = system.infamy;
    return {
        current,
        derived,
        tally,
        pendingFlip: current !== derived,
        checkpoint,
        corruption,
        nextCheckpoint: nextAlignmentCheckpoint(corruption),
        recheckDue: shouldRecheckAlignment(corruption, checkpoint),
        psykerLocked: psykerLockedByAlignment(current),
        infamy,
        infamyCost: infamyAdvanceCost(infamy),
        infamyCap: BC_INFAMY_ADVANCE_CAP,
        infamyIncrement: BC_INFAMY_INCREMENT,
    };
}

/**
 * BC Psychic Strength panel (#178). Resolver inputs come from the
 * persisted DataModel fields (psykerClass / psyRating / sustainedPowerCount);
 * the panel's mode + push level are ephemeral UI state owned by the
 * sheet instance (_bcPsyMode / _bcPsyPushLevel).
 */
function prepareBcPsychicPanel(this: CharacterSheet): BcPsychicPanelContext {
    const sys = this.actor.system;
    const psykerClass = sys.psykerClass;
    const psyRating = sys.psyRating;
    const sustainedPowerCount = sys.sustainedPowerCount;
    const mode = this._bcPsyMode;
    const pushLevel = this._bcPsyPushLevel;
    const resolved = resolvePsychicTest({ psykerClass, basePR: psyRating, mode, pushLevel, sustainedPowerCount });
    return {
        psykerClass,
        psyRating,
        sustainedPowerCount,
        mode,
        pushLevel,
        maxPushLevel: maxPushLevel(psykerClass),
        effectivePR: resolved.effectivePR,
        sustainPenalty: resolved.sustainPenalty,
        phenomenaRolls: resolved.phenomenaRolls,
    };
}

/**
 * DW Astartes implants panel (#167). Iterates the canonical implant
 * inventory and reports per-id presence + the derived Unnatural
 * Strength/Toughness bonuses and Black-Carapace flag.
 */
function prepareDwAstartesPanel(this: CharacterSheet): DwAstartesPanelContext {
    const sys = this.actor.system;
    const implants = sys.implants;
    const sb = sys.characteristics.strength.bonus;
    const tb = sys.characteristics.toughness.bonus;
    const implantSet = new Set<AstartesImplantId>(implants);
    return {
        implants: ASTARTES_IMPLANTS.map((id) => {
            // The implant's `mechanic` (kebab-case) maps directly onto the
            // `WH40K.DW.Astartes.Category.*` langpack keys (PascalCase).
            // Implants with no discrete mechanic (Ossmodula, Biscopea,
            // Haemastamen) feed the Unnatural Str/Tgh baselines → Baseline.
            const mechanic = IMPLANT_EFFECTS[id].mechanic;
            return {
                id,
                // The langpack name lives at `…Implant.<Id>.Name` — the
                // trailing `.Name` segment is required or `localize` falls
                // back to the raw key (the overflowing-text regression).
                nameKey: `WH40K.DW.Astartes.Implant.${titleCase(id)}.Name`,
                categoryKey: mechanic === undefined ? `WH40K.DW.Astartes.Category.Baseline` : `WH40K.DW.Astartes.Category.${titleCase(mechanic)}`,
                has: implantSet.has(id),
            };
        }),
        strengthBonus: astartesStrengthBonus(sb),
        toughnessBonus: astartesToughnessBonus(tb),
        hasBlackCarapace: hasBlackCarapace(implants),
    };
}

/**
 * DW Kill-team Cohesion panel (#162). Reads the four schema slots
 * (`cohesionCurrent`, `cohesionMax`, `cohesionLostThisTurn`,
 * `rallied`) and computes the action-availability gates.
 */
function prepareDwCohesionPanel(this: CharacterSheet): DwCohesionPanelContext {
    const sys = this.actor.system;
    const current = sys.cohesionCurrent;
    const max = sys.cohesionMax;
    const rallied = sys.rallied;
    return {
        current,
        max,
        lostThisTurn: sys.cohesionLostThisTurn,
        rallied,
        canRally: !rallied,
        canRecover: current < max && max > 0,
    };
}

/**
 * DW Squad Mode panel (#163). Surfaces the current combat mode,
 * Renown-derived support range, and the labels of any
 * currently-sustained Squad-mode abilities.
 */
function prepareDwModePanel(this: CharacterSheet): DwModePanelContext {
    const sys = this.actor.system;
    const mode = sys.combatMode;
    const renownRank = getRenownRank(sys.renown);
    const renownRankKey = capitalize(renownRank);
    const supportRange = getSupportRange(renownRank);
    const sustainedAbilities = sys.sustainedAbilities.map((id) => ({ id, label: id }));
    return {
        mode,
        renownRank,
        renownRankKey,
        supportRange,
        sustainedAbilities,
    };
}

/**
 * DW Renown panel (#164). Computes the current rank, the next rank's
 * threshold (if any), and a 0-100% progress percentage.
 */
function prepareDwRenownPanel(this: CharacterSheet): DwRenownPanelContext {
    const sys = this.actor.system;
    const value = sys.renown;
    const rank = getRenownRank(value);
    const rankRange = RENOWN_THRESHOLDS[rank];
    const rankIdx = RENOWN_RANK_ORDER.indexOf(rank);
    const nextRank: RenownRank | null = RENOWN_RANK_ORDER[rankIdx + 1] ?? null;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser narrows nextRank to RenownRank by missing the union; strict tsconfig retains the | null branch
    const nextRankMin = nextRank != null ? RENOWN_THRESHOLDS[nextRank].min : null;
    const rankLabel = game.i18n.localize(renownRankLabelKey(rank));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser narrows nextRank to RenownRank by missing the union; strict tsconfig retains the | null branch
    const nextRankLabel = nextRank != null ? game.i18n.localize(renownRankLabelKey(nextRank)) : null;
    const progressPercent =
        nextRankMin === null ? 100 : Math.max(0, Math.min(100, Math.round(((value - rankRange.min) / (nextRankMin - rankRange.min)) * 100)));
    return {
        value,
        rank,
        rankLabel,
        nextRank,
        nextRankLabel,
        rankMin: rankRange.min,
        nextRankMin,
        progressPercent,
    };
}

/**
 * DW Requisition panel (#165). Surfaces the RP balance, the current
 * mission rating, and the Renown-derived rank gate the requisition
 * dialog will enforce.
 */
export function prepareDwRequisitionPanel(this: CharacterSheet): DwRequisitionPanelContext {
    const sys = this.actor.system;
    return {
        rp: sys.requisitionPoints,
        missionRating: sys.missionRating,
        renownRank: getRenownRank(sys.renown),
    };
}

/** A recorded Regimental Drawback's descriptor, when its item records its Regiment Creation Points (#160). */
function owDrawbackDescriptor(this: CharacterSheet, id: string): RegimentDrawback | undefined {
    return this._drawbackDescriptors.get(id);
}

/** The Regimental Drawbacks the character's regiment took, as UUIDs; none off the OW line. */
export function regimentDrawbackIds(this: CharacterSheet): string[] {
    const record = owSystemRecord(this);
    return Array.isArray(record['regimentDrawbacks']) ? (record['regimentDrawbacks'] as string[]) : [];
}

/** Record a drawback the regiment took (a drop on the sheet, or the panel's Add Drawback). */
export async function recordRegimentalDrawback(this: CharacterSheet, uuid: string, name: string): Promise<void> {
    const added = await addRegimentalDrawback(
        { system: { regimentDrawbacks: regimentDrawbackIds.call(this) }, update: async (data) => this.actor.update(data) },
        uuid,
    );
    if (!added) this._notify('warning', game.i18n.format('WH40K.OW.RegimentDrawback.AlreadyTaken', { name }));
}

/** A conferred medal's descriptor (content#32). */
function owAwardDescriptor(this: CharacterSheet, id: string): RegimentalAward | undefined {
    return this._awardDescriptors.get(id);
}

/** The medals conferred on the character, as UUIDs; none off the OW line. */
export function regimentalAwardIds(this: CharacterSheet): string[] {
    const record = owSystemRecord(this);
    return Array.isArray(record['regimentalAwards']) ? (record['regimentalAwards'] as string[]) : [];
}

/** Confer a medal (a drop on the sheet, or the panel's Add Award). */
export async function recordRegimentalAward(this: CharacterSheet, uuid: string, name: string): Promise<void> {
    const added = await addRegimentalAward(
        { system: { regimentalAwards: regimentalAwardIds.call(this) }, update: async (data) => this.actor.update(data) },
        uuid,
    );
    if (!added) this._notify('warning', game.i18n.format('WH40K.OW.RegimentalAward.AlreadyConferred', { name }));
}

/**
 * OW Regiment Creation panel (#151). Surfaces the persisted regiment
 * selection + kit budget for the panel partial.
 */
function prepareOwRegimentPanel(this: CharacterSheet): OwRegimentPanelContext {
    const sys = this.actor.system;
    return buildRegimentPanelSummary(sys.regimentSelection, sys.regimentKit, resolveRegimentCatalog(this.actor));
}

/**
 * OW Comrade panel (#152). The values come from the rules layer's
 * `buildComradePanel`; the sheet only passes the Comrade record and the
 * camp (refit) flag through.
 */
function prepareOwComradePanel(this: CharacterSheet): OwComradePanelContext {
    const sys = this.actor.system;
    return buildComradePanel(sys.comrade, sys.refitAvailable, comradeRules.call(this), currentCombatRound(game.combat));
}

/** The line's Comrade rules; the Comrade panels are built only for a line that prints them. */
function comradeRules(this: CharacterSheet): ComradeRules {
    const rules = comradeRulesFor(this._resolveGameSystemId() ?? undefined);
    if (rules === null) throw new Error('The Comrade panels are built only for a line with Comrades.');
    return rules;
}

/**
 * OW Orders panel (#152, #153): the line's Orders, each resolved against the
 * Comrade now (alive, pinned or fleeing, Cohesion, actions left this Turn), and
 * any currently-active sweeping Orders with their applied-member counts.
 */
function prepareOwOrdersPanel(this: CharacterSheet): OwOrdersPanelContext {
    const sys = this.actor.system;
    const available = orderPanelRows(
        comradeOrdersFor(this._resolveGameSystemId() ?? undefined),
        sys.comrade,
        comradeRules.call(this),
        currentCombatRound(game.combat),
    );
    const sweepingActive = sys.activeOrders
        .filter((o) => o.sweeping)
        .map((o) => ({
            orderId: o.orderId,
            appliedCount: o.appliedToMemberIds.length,
        }));
    return { available, sweepingActive };
}

/**
 * OW Logistics panel (#154). Surfaces the Squad Logistics Rating
 * baseline + Munitorum flag + GM situational modifier.
 */
export function prepareOwLogisticsPanel(this: CharacterSheet): OwLogisticsPanelContext {
    const sys = this.actor.system;
    return {
        rating: sys.logisticsRating === 0 ? OW_DEFAULT_LOGISTICS_RATING : sys.logisticsRating,
        munitorum: sys.munitorum,
        situational: sys.situational,
    };
}

/**
 * BC Chaos Ritual panel (#179). The only persisted slot is the
 * ritualist's Daemonic Mastery rating; per-ritual selections are
 * dialog-scoped state and never leak to the panel.
 */
export function prepareBcRitualPanel(this: CharacterSheet): BcRitualPanelContext {
    return { ritualMastery: this.actor.system.ritualMastery };
}

/**
 * BC Gifts of the Gods panel (#180). The actor's Gifts are its owned
 * mutation items with category `gift` (catalogue: compendium, Direction
 * #7); each is resolved against the current Chaos Alignment by
 * `buildBcGiftsPanel`. The characteristic / skill changes themselves are
 * applied in data prep (`CreatureTemplate._computeItemModifiers`); this
 * only lays them out.
 */
function prepareBcGiftsPanel(this: CharacterSheet): BcGiftsPanelContext {
    const sys = this.actor.system;
    const items: GiftPanelItem[] = [];
    for (const item of this.actor.items.contents) {
        if (isGiftItem(item)) items.push(item);
    }
    return buildBcGiftsPanel({
        alignment: sys.chaosAlignment,
        items,
        characteristicLabel: (key) => labelOf(sys.characteristics, key),
        skillLabel: (key) => labelOf(sys.skills, key),
        grantName: (uuid) => uuidNameCache.getName(uuid),
    });
}

/**
 * BC Supplement Mechanics panel (#181). Surfaces the Daemon Engine
 * rage bonus (computed against a conservative `turnsSinceLastDamage`
 * baseline of 0 — the actual delta is dialog-scoped per encounter).
 */
function prepareBcSupplementsPanel(this: CharacterSheet): BcSupplementsPanelContext {
    const rating = this.actor.system.daemonEngineRating;
    const daemonEngineActive = rating > 0;
    const turnsSinceLastDamage = 0;
    const rageBonus = daemonEngineActive ? daemonEngineRageBonus({ rating, turnsSinceLastDamage }) : 0;
    return {
        daemonEngineRating: rating,
        daemonEngineActive,
        turnsSinceLastDamage,
        daemonEngineRageBonus: rageBonus,
    };
}

/**
 * BC apotheosis panel (#182). Reads the persisted record off
 * `system.daemonPrinceAscension` and reports the eligibility readout: the
 * claim at 100 Corruption, the GM's Infamy threshold, and the fate (Daemon
 * Prince or Chaos Spawn) met — or faced, before the claim.
 */
function prepareBcDaemonPrincePanel(this: CharacterSheet): BcDaemonPrincePanelContext {
    const sys = this.actor.system;
    const record = sys.daemonPrinceAscension;
    const ascendedAt = record.ascendedAt;
    const ascension = ascendedAt === null ? null : { ascendedAt, alignmentAtAscension: record.alignmentAtAscension, outcome: record.outcome };
    const ascended = isAscended(ascension);
    const infamy = sys.infamy;
    const corruption = sys.corruption;
    const infamyThreshold = WH40KSettings.getApotheosisInfamyThreshold();
    const readout = resolveApotheosis({ corruption, infamy, infamyThreshold });
    const outcome = ascension === null ? readout.outcome : ascension.outcome;
    return {
        ascended,
        ascendedAt,
        alignmentAtAscension: record.alignmentAtAscension,
        infamy,
        corruption,
        infamyThreshold,
        corruptionThreshold: APOTHEOSIS_CORRUPTION,
        canAscend: !ascended && readout.claimed,
        isDaemonPrince: outcome === 'daemonPrince',
    };
}

/**
 * DW Distinctions panel (#171). Lists every owned special-ability item —
 * speciality, Advanced Special Ability, Distinction, Mark — with its
 * category, required Renown rank, Renown reward and XP cost, ordered by
 * category then name, and folds the borne Marks' grants through
 * `mergeMarkGrants`. All values come from the items themselves.
 */
function prepareDwDistinctionPanel(this: CharacterSheet): DwDistinctionPanelContext {
    const actorRenownRank = getRenownRank(this.actor.system.renown);
    const abilities: DwDistinctionPanelContext['abilities'] = [];
    const marks: MarkGrantSource[] = [];
    for (const item of this.actor.items) {
        const ability = readSpecialAbility(item);
        if (ability === null) continue;
        if (ability.category === 'mark') marks.push(ability.markGrant);
        abilities.push({
            id: item.id,
            name: item.name,
            category: ability.category,
            categoryLabel: game.i18n.localize(specialAbilityCategoryLabelKey(ability.category)),
            renownRequired: ability.renownRequired === null ? '' : game.i18n.localize(renownRankLabelKey(ability.renownRequired)),
            renownReward: ability.renownReward,
            cost: ability.cost,
            rankTooLow: !canGainSpecialAbility({ ability, actorRenownRank }).allowed,
        });
    }
    const categoryOrder = (category: SpecialAbilityCategory): number => SPECIAL_ABILITY_CATEGORIES.indexOf(category);
    abilities.sort((a, b) => categoryOrder(a.category) - categoryOrder(b.category) || a.name.localeCompare(b.name, game.i18n.lang));

    const merged = mergeMarkGrants(marks);
    return {
        abilities,
        merged: {
            characteristicDelta: Object.keys(merged.characteristicDelta)
                .sort()
                .map((key) => {
                    const value = merged.characteristicDelta[key] ?? 0;
                    return { key, value, displayValue: formatSigned(value) };
                }),
            traits: merged.traits.map((uuid) => uuidNameCache.getName(uuid)),
        },
    };
}

/**
 * DW Special-Issue Ammunition panel (#172). Reads the actor-level
 * selected ammo id and builds the option list against the canonical
 * `DW_SELECTED_AMMO_CHOICES`. The detail readout consumes
 * `DW_SPECIAL_AMMO_EFFECTS` directly; `'standard'` yields `null`.
 */
function prepareDwAmmoPanel(this: CharacterSheet): DwAmmoPanelContext {
    const sys = this.actor.system;
    const selected: DwSelectedAmmoId = sys.selectedAmmo;
    const labelFor = (id: DwSelectedAmmoId): string => game.i18n.localize(`WH40K.DW.SpecialAmmo.Ammo.${titleCase(id)}`);
    const effect = selected === 'standard' ? null : DW_SPECIAL_AMMO_EFFECTS[selected];
    return {
        selected,
        selectedLabel: labelFor(selected),
        options: DW_SELECTED_AMMO_CHOICES.map((id) => ({
            id,
            label: labelFor(id),
            selected: id === selected,
        })),
        effect,
    };
}

/**
 * DW Mission Oath panel (#168). Surfaces the leader marker, the
 * active oath id (or null), and the swear/release gates. The active
 * oath display label resolves from the compendium UUID cache at
 * panel render time; without a sync lookup we fall back to the id
 * string so the panel still renders a meaningful readout.
 */
function prepareDwOathPanel(this: CharacterSheet): DwOathPanelContext {
    const sys = this.actor.system;
    const activeOathId = sys.activeOathId;
    const active = isOathActive(activeOathId);
    return {
        isLeader: sys.isLeader,
        active,
        activeOathId,
        activeLabel: active && activeOathId !== null ? activeOathId : null,
        canSwear: sys.isLeader && !active,
        canRelease: active,
    };
}

/**
 * DW Mission framework panel (#169). When `activeMission === null`
 * the panel renders the empty-state placeholder; otherwise we map
 * the persisted record into the localized labels the template
 * consumes.
 */
function prepareDwMissionPanel(this: CharacterSheet): DwMissionPanelContext {
    const sys = this.actor.system;
    const active = sys.activeMission;
    if (active === null) {
        return { hasMission: false, mission: null };
    }
    return {
        hasMission: true,
        mission: {
            id: active.id,
            name: active.name,
            rating: active.rating,
            ratingLabel: game.i18n.localize(`WH40K.DW.Mission.Rating.${titleCase(active.rating)}`),
            objectives: active.objectives.map((o) => ({
                id: o.id,
                description: o.description,
                renownReward: o.renownReward,
                xpReward: o.xpReward,
                status: o.status,
                statusLabel: game.i18n.localize(`WH40K.DW.Mission.Objective.Status.${titleCase(o.status)}`),
            })),
            complications: active.complications.map((c) => ({
                id: c.id,
                description: c.description,
                renownPenalty: c.renownPenalty,
                triggered: c.triggered,
            })),
        },
    };
}

/**
 * OW Mission Assignment Gear panel (#155). Stateless apart from the
 * "last outcome" readout; the request-gear action gathers the
 * mission-gear modifiers at click time via a DialogV2 prompt.
 */
function prepareOwMissionGearPanel(this: CharacterSheet): OwMissionGearPanelContext {
    const sys = this.actor.system;
    const last = sys.lastGearOutcome;
    if (last === null) {
        return { hasOutcome: false, outcomeKey: null };
    }
    return {
        hasOutcome: true,
        outcomeKey: `WH40K.OW.MissionGear.Outcome.${titleCase(last)}`,
    };
}

/** OW Vehicle Movement panel (#156). */
function prepareOwVehicleMovementPanel(this: CharacterSheet): OwVehicleMovementPanelContext {
    const sys = this.actor.system;
    const chase = sys.chaseState;
    const actions = [
        { id: 'evasive-manoeuvring', timing: 'half' },
        { id: 'floor-it', timing: 'full' },
        { id: 'hit-and-run', timing: 'full' },
        { id: 'jink', timing: 'reaction' },
        { id: 'tactical-manoeuvring', timing: 'half' },
    ].map((a) => ({
        actionId: a.id,
        timing: a.timing,
        nameKey: `WH40K.OW.VehicleMovement.Action.${titleCase(a.id)}`,
        timingKey: `WH40K.OW.VehicleMovement.Timing.${capitalize(a.timing)}`,
        descriptionKey: `WH40K.OW.VehicleMovement.Description.${titleCase(a.id)}`,
    }));
    return {
        actions,
        // Template gates the chase readout on `chaseState` being non-null and
        // reads pursuerDistance/dangerZone/turnCount off it; pass the live
        // tracker straight through (null when no chase is active).
        chaseState: chase === null ? null : { pursuerDistance: chase.pursuerDistance, dangerZone: chase.dangerZone, turnCount: chase.turnCount },
    };
}

function prepareOwMountPanel(this: CharacterSheet): OwMountPanelContext {
    const mountedOn = owSystemRecord(this)['mountedOn'] as { mountId?: string; traits?: string[] } | null | undefined;
    const mount =
        mountedOn != null && typeof mountedOn.mountId === 'string' && mountedOn.mountId !== ''
            ? {
                  mountId: mountedOn.mountId,
                  mountName: uuidNameCache.getName(mountedOn.mountId),
                  traits: (mountedOn.traits ?? []).map((id) => ({ id, labelKey: `WH40K.OW.Mount.Trait.${titleCase(id)}` })),
              }
            : null;
    const actions = MOUNTED_ACTIONS.map((a) => ({
        actionId: a.id,
        timing: a.timing,
        nameKey: `WH40K.OW.Mount.Action.${titleCase(a.id)}`,
        descriptionKey: `WH40K.OW.Mount.Description.${titleCase(a.id)}`,
        timingKey: `WH40K.OW.Mount.Timing.${titleCase(a.timing)}`,
    }));
    return { mount, actions };
}

/**
 * OW Comrade Healing panel (#157). The values come from the rules layer's
 * `buildComradeHealingPanel`; the sheet only passes the persisted state through.
 */
function prepareOwComradeHealingPanel(this: CharacterSheet): OwComradeHealingPanelContext {
    const sys = this.actor.system;
    return buildComradeHealingPanel({
        state: sys.comrade.state,
        recoveryDays: sys.comradeRecoveryDays,
        refitAvailable: sys.refitAvailable,
        medicaeUsed: sys.comradeMedicaeUsed,
    });
}

/** Confer a medal chosen from the compendiums (the Battlefield panel's Add Award). */
export async function owAddAward(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    const uuid = await chooseCompendiumAward();
    if (uuid === null) {
        this._notify('warning', game.i18n.localize('WH40K.OW.RegimentalAward.NoneAvailable'));
        return;
    }
    await recordRegimentalAward.call(this, uuid, cachedRefName(uuid));
}

/** Add a drawback chosen from the compendiums (the panel's Add Drawback). */
export async function owAddDrawback(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    const uuid = await chooseCompendiumDrawback();
    if (uuid === null) {
        this._notify('warning', game.i18n.localize('WH40K.OW.RegimentDrawback.NoneAvailable'));
        return;
    }
    await recordRegimentalDrawback.call(this, uuid, cachedRefName(uuid));
}

/**
 * The per-line panels the character sheet builds into its render context
 * (`CharacterSheet.SYSTEM_PANELS`, #282). Lives with the builders it calls (#716).
 */
export const PANEL_BUILDERS: SystemPanels = {
    bc: [
        { key: 'alignmentPanel', build: (s) => prepareBcAlignmentPanel.call(s) },
        { key: 'psychicPanel', build: (s) => prepareBcPsychicPanel.call(s) },
        { key: 'ritualPanel', build: (s) => prepareBcRitualPanel.call(s) },
        { key: 'giftsPanel', build: (s) => prepareBcGiftsPanel.call(s) },
        { key: 'supplementsPanel', build: (s) => prepareBcSupplementsPanel.call(s) },
        { key: 'daemonPrincePanel', build: (s) => prepareBcDaemonPrincePanel.call(s) },
    ],
    dw: [
        { key: 'cohesionPanel', build: (s) => prepareDwCohesionPanel.call(s) },
        { key: 'modePanel', build: (s) => prepareDwModePanel.call(s) },
        { key: 'renownPanel', build: (s) => prepareDwRenownPanel.call(s) },
        { key: 'requisitionPanel', build: (s) => prepareDwRequisitionPanel.call(s) },
        { key: 'astartesPanel', build: (s) => prepareDwAstartesPanel.call(s) },
        { key: 'oathPanel', build: (s) => prepareDwOathPanel.call(s) },
        { key: 'missionPanel', build: (s) => prepareDwMissionPanel.call(s) },
        { key: 'distinctionPanel', build: (s) => prepareDwDistinctionPanel.call(s) },
        { key: 'ammoPanel', build: (s) => prepareDwAmmoPanel.call(s) },
    ],
    ow: [
        { key: 'regimentPanel', build: (s) => prepareOwRegimentPanel.call(s) },
        { key: 'comradePanel', build: (s) => prepareOwComradePanel.call(s) },
        { key: 'ordersPanel', build: (s) => prepareOwOrdersPanel.call(s) },
        { key: 'logisticsPanel', build: (s) => prepareOwLogisticsPanel.call(s) },
        { key: 'missionGearPanel', build: (s) => prepareOwMissionGearPanel.call(s) },
        { key: 'vehicleMovementPanel', build: (s) => prepareOwVehicleMovementPanel.call(s) },
        { key: 'comradeHealingPanel', build: (s) => prepareOwComradeHealingPanel.call(s) },
        { key: 'craftsmanshipPanel', build: (s) => buildOwCraftsmanshipPanel(Array.from(s.actor.items.values())) },
        { key: 'mountPanel', build: (s) => prepareOwMountPanel.call(s) },
        {
            key: 'drawbackPanel',
            // The persisted slot holds bare ids; the panel template reads rows
            // (`drawback.id` / `.description` / `.refund`). Handing it the raw
            // string array rendered every row blank AND left the remove control's
            // `data-drawback-id` empty, which `owToggleDrawback` no-ops on — so
            // the control did nothing (#160). Project through the engine.
            build: (s) => {
                const record = owSystemRecord(s);
                const ids = Array.isArray(record['regimentDrawbacks']) ? (record['regimentDrawbacks'] as string[]) : [];
                const roster = (record['multiComradeRoster'] ?? null) as MultiComradeRoster | null;
                // Each id is a drawback document UUID, shown by its name (#160). Its refund
                // is the item's Regiment Creation Points, resolved before the panels build;
                // a drawback that has not recorded them reads as unknown.
                return buildDrawbackPanel(ids, roster, (id) => owDrawbackDescriptor.call(s, id), cachedRefName, REGIMENT_BUDGET);
            },
        },
        {
            key: 'battlefieldPanel',
            // Same defect as drawbackPanel above: the persisted slots hold a bare id
            // array and a cooldown number, but the template reads five fields —
            // `availableAwards[]` rows, the `merged.*` readout, `cooldownActive` and
            // `canRequestSupport`. Three were absent. Because the template gates the
            // button on `{{#unless canRequestSupport}}` and undefined is falsy, the
            // Request Support button was PERMANENTLY disabled — the feature could
            // never be used — while the badge (`{{#if cooldownActive}}`, also always
            // false) showed the green "ready" state beside it. Project through the
            // engine.
            build: (s) => {
                const record = owSystemRecord(s);
                const ids = Array.isArray(record['regimentalAwards']) ? (record['regimentalAwards'] as string[]) : [];
                const cooldown = typeof record['supportCooldown'] === 'number' ? record['supportCooldown'] : 0;
                // Award descriptors come from the conferred medal items (Direction #7),
                // resolved before the panels build; an id that no longer resolves is
                // still shown by its document's name (or "Unknown award", never the id),
                // and keeps its id so it toggles off.
                return buildBattlefieldPanel(ids, cooldown, (id) => owAwardDescriptor.call(s, id), awardRefName);
            },
        },
    ],
};
