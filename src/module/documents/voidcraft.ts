import type ShipWeaponData from '../data/item/ship-weapon.ts';
import { t } from '../i18n/t.ts';
import {
    readShipModifierFlag,
    SHIP_MODIFIER_FLAG_KEY,
    SHIP_MODIFIER_FLAG_SCOPE,
    shipModifierEffectSource,
    type ShipEffectView,
    type ShipModifierInput,
} from '../rules/ship-action-effects.ts';
import { shipWeaponChoices, type ShipWeaponChoice } from '../rules/ship-actions.ts';
import { supportsShipAssault, type ShipAssaultShip } from '../rules/ship-assault.ts';
import {
    emptySnapshot,
    isCrippled as isCrippledRule,
    recordCrewMoraleHit,
    recordHullHit,
    reducePriorTurnDamage as reducePriorTurnDamageRule,
    replenishBetweenCombat as replenishBetweenCombatRule,
    type PriorTurnDamageSnapshot,
    type PriorTurnPool,
    type ShipCombatState,
} from '../rules/ship-crew-morale.ts';
import { criticalRollLabelKey, crippledStatChanges, isShipDestroyed } from '../rules/ship-crippled.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';
import { RollTableUtils } from '../utils/roll-table-utils.ts';
import { WH40KBaseActor } from './base-actor.ts';
import type { WH40KItem } from './item.ts';

type VoidcraftSystemData = WH40KBaseActor['system'] & {
    hullType: string;
    hullClass: string;
    gameSystem: string;
    hullIntegrity: { value: number; max: number };
    speed: number;
    manoeuvrability: number;
    detection: number;
    detectionBonus: number;
    armour: number;
    voidShields: number;
    turretRating: number;
    crew: {
        population: number;
        crewRating: number;
        morale: { value: number; max: number };
    };
    power: { used: number; total: number };
    space: { used: number; total: number };
    weaponCapacity: {
        dorsal: number;
        prow: number;
        port: number;
        starboard: number;
        keel: number;
    };
    priorTurnDamage: PriorTurnDamageSnapshot;
    shipStatuses: ShipStatus[];
    /** Derived ship Ballistic Skill (crew rating plus role bonuses, #196). */
    ballisticSkill: number;
    voidShieldsStatus: { active: number; exhausted: number };
};

/** One persistent Critical Hit status recorded on a ship. */
interface ShipStatus {
    /** The drawn table result's id; `critical-<roll>` when the table was unavailable. */
    id: string;
    /** The result's name as the table prints it ("Holed", "Fire!"). */
    name: string;
    rolled: number;
    text: string;
    appliedAt: number;
    /** The drawn result destroys the ship (#187), from the result's `flags['wh40k-rpg'].destroysShip`. */
    destroysShip: boolean;
    /** `rolled` is a Crippled ship's damage past its Armour rather than a 1d5 (#187). */
    pastArmour: boolean;
}

/**
 * The RT Critical Hits chart (RT Core Table 8-12) and the compendium it ships
 * in. Scoping the lookup to the pack keeps another line's same-named table out.
 */
const CRITICAL_HIT_TABLE_NAME = 'Ship Critical Hits';
const CRITICAL_HIT_TABLE_PACK = 'wh40k-rpg.rt-core-rolltables';

/** A weapon's Critical Hit rolls 1d5 on the chart (RT Core, "Starship Weapons"). */
const WEAPON_CRITICAL_DIE = '1d5';

/** The drawn result's fields the status reads. `description` is V13+; `text` the legacy field. */
interface DrawnCriticalResult {
    id?: string | null;
    name?: string | null;
    description?: string | null;
    text?: string | null;
    /** `flags['wh40k-rpg'].destroysShip` marks a result that destroys the ship (#187). */
    flags?: { 'wh40k-rpg'?: { destroysShip?: boolean } } | null;
}

/**
 * Game-system id the RT Crew Population & Morale combat economy is
 * gated on (issue #189). Other systems (BC / DH1 / DH2 / DW / OW / IM)
 * ship without ship-scale crew bookkeeping at this layer; their hulls
 * still take damage but do NOT decrement crew / morale on hit.
 */
const RT_CREW_ECONOMY_GAME_SYSTEM = 'rt';

export class WH40KVoidcraft extends WH40KBaseActor {
    declare system: VoidcraftSystemData;

    protected override async _preCreate(data: never, options: never, user: never): Promise<boolean | undefined> {
        await super._preCreate(data, options, user);
        const dataWithName = data as { name?: string } | undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: updateSource expects typed token delta; Record<string,unknown> is the only viable shape for dot-notation token update paths
        const initData: Record<string, unknown> = {
            'prototypeToken.bar1': { attribute: 'hullIntegrity' },
            'prototypeToken.bar2': { attribute: 'crew.morale' },
            'prototypeToken.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'prototypeToken.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'prototypeToken.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'prototypeToken.name': dataWithName?.name,
        };
        this.updateSource(initData);
        return undefined;
    }

    /** @override */
    override prepareData(): void {
        super.prepareData();
        // Call DataModel's embedded data preparation for component calculations
        this._runEmbeddedDataPrep();
    }

    get hullType(): string {
        return this.system.hullType;
    }

    get hullClass(): string {
        return this.system.hullClass;
    }

    get hullIntegrity(): { value: number; max: number } {
        return this.system.hullIntegrity;
    }

    get speed(): number {
        return this.system.speed;
    }

    get manoeuvrability(): number {
        return this.system.manoeuvrability;
    }

    get detection(): number {
        return this.system.detection;
    }

    get detectionBonus(): number {
        return this.system.detectionBonus || Math.floor(this.detection / 10);
    }

    get armour(): number {
        return this.system.armour;
    }

    get voidShields(): number {
        return this.system.voidShields;
    }

    get turretRating(): number {
        return this.system.turretRating;
    }

    get crew(): { population: number; crewRating: number; morale: { value: number; max: number } } {
        return this.system.crew;
    }

    get power(): { used: number; total: number } {
        return this.system.power;
    }

    get space(): { used: number; total: number } {
        return this.system.space;
    }

    get weaponCapacity(): { dorsal: number; prow: number; port: number; starboard: number; keel: number } {
        return this.system.weaponCapacity;
    }

    /**
     * Is the ship destroyed? A Rogue Trader ship only by a Critical Hit result
     * that destroys it (RT Core Table 8-12); at 0 Hull it is Crippled, not
     * destroyed (#187). Other lines keep the 0-Hull reading.
     * @type {boolean}
     */
    get isDestroyed(): boolean {
        return isShipDestroyed({ gameSystem: this.system.gameSystem, hullIntegrity: this.hullIntegrity, statuses: this.system.shipStatuses });
    }

    /**
     * Get all ship components
     */
    get shipComponents(): WH40KItem[] {
        return this.items.filter((i) => i.type === 'shipComponent');
    }

    /**
     * Get all ship weapons
     */
    get shipWeapons(): WH40KItem[] {
        return this.items.filter((i) => i.type === 'shipWeapon');
    }

    /**
     * Get all ship upgrades
     */
    get shipUpgrades(): WH40KItem[] {
        return this.items.filter((i) => i.type === 'shipUpgrade');
    }

    /**
     * Get ship weapons grouped by location
     */
    get weaponsByLocation(): Record<string, WH40KItem[]> {
        const grouped: Record<string, WH40KItem[]> = {
            prow: [],
            dorsal: [],
            port: [],
            starboard: [],
            keel: [],
        };
        for (const weapon of this.shipWeapons) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ship weapon item.system fields are not typed in this document layer; accessing location requires dynamic lookup
            const loc = (weapon.system as Record<string, unknown>)['location'];
            const locStr = typeof loc === 'string' ? loc : 'dorsal';
            const bucket = grouped[locStr];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: Record index access may be undefined at runtime
            if (bucket !== undefined) bucket.push(weapon);
        }
        return grouped;
    }

    /**
     * Fire a ship weapon
     * @param {string} weaponId - The ID of the weapon to fire
     */
    async fireWeapon(weaponId: string): Promise<void> {
        const weapon = this.items.get(weaponId);
        if (weapon?.type !== 'shipWeapon') {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Voidcraft.Errors.InvalidShipWeapon', { localize: true });
            return;
        }

        // Post the weapon's firing profile; resolving a shot against a target is
        // the voidcraft sheet's Fire dialog (#184).
        const cardData = {
            attackerName: this.name,
            weapon: { name: weapon.name, img: weapon.img ?? '', ...(weapon as WH40KItem & { system: ShipWeaponData }).system.cardProfile },
            gameSystem: this.system.gameSystem,
            _gameSystemId: firstSystemId(this),
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs', cardData);

        await ChatMessage.create({
            user: game.user.id,
            // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker requires Actor.Implementation; WH40KVoidcraft extends it but type narrowing requires cast
            speaker: ChatMessage.getSpeaker({ actor: this as unknown as Actor.Implementation }),
            content: html,
        });
    }

    /* ------------------------------------------------------------------ */
    /*  RT Crew Population & Morale combat economy (issue #189)           */
    /* ------------------------------------------------------------------ */

    /**
     * Is this hull governed by the RT Crew Population / Morale combat
     * economy? Per-system gating so the other six game systems never
     * see crew/morale tick when their ship hulls take damage.
     */
    get usesRTCrewEconomy(): boolean {
        return this.system.gameSystem === RT_CREW_ECONOMY_GAME_SYSTEM;
    }

    /** Current combat-state snapshot consumed by the rules helpers. */
    private _readShipCombatState(): ShipCombatState {
        return {
            hullIntegrity: { ...this.hullIntegrity },
            crew: {
                population: this.crew.population,
                morale: { ...this.crew.morale },
            },
        };
    }

    /** Current prior-turn damage snapshot. Schema defaults all fields to 0 (turn 0 = no snapshot). */
    private _readPriorTurnSnapshot(): PriorTurnDamageSnapshot {
        return this.system.priorTurnDamage;
    }

    /**
     * Look up the current strategic-turn number on the active Combat.
     * Falls back to `1` when no Combat is in progress — the helpers
     * treat turn `0` as "no snapshot", so we must return ≥ 1 here.
     */
    private _currentStrategicTurn(): number {
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.combats typing in fvtt-types is loose
        const combats = (globalThis as unknown as { game?: { combats?: { active?: { round?: number } | null } } }).game?.combats;
        const round = combats?.active?.round;
        return typeof round === 'number' && round > 0 ? round : 1;
    }

    /**
     * Apply a hull-damage event from a void-combat hit. RT only:
     *   • decrements `hullIntegrity.value` (floor 0);
     *   • decrements `crew.population` and `crew.morale.value` by the
     *     same amount of hull lost (floor 0);
     *   • appends the loss to `priorTurnDamage` so a Hold Fast! /
     *     Triage extended action on the *next* strategic turn can
     *     reduce its Morale / Crew Population part.
     *
     * Returns the deltas actually applied so callers (chat cards,
     * tests) can render the breakdown.
     */
    async applyHullDamage(amount: number): Promise<{
        hullLoss: number;
        crewLoss: number;
        moraleLoss: number;
    }> {
        const turn = this._currentStrategicTurn();
        const before = this._readShipCombatState();
        const snap = this._readPriorTurnSnapshot();
        const { next, snapshot } = recordHullHit(before, snap, amount, turn);
        const delta = {
            hullLoss: before.hullIntegrity.value - next.hullIntegrity.value,
            crewLoss: before.crew.population - next.crew.population,
            moraleLoss: before.crew.morale.value - next.crew.morale.value,
        };
        if (delta.hullLoss === 0 && delta.crewLoss === 0 && delta.moraleLoss === 0) {
            return delta;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update accepts dotted-path Record
        const updates: Record<string, unknown> = {
            'system.hullIntegrity.value': next.hullIntegrity.value,
        };
        if (this.usesRTCrewEconomy) {
            updates['system.crew.population'] = next.crew.population;
            updates['system.crew.morale.value'] = next.crew.morale.value;
            updates['system.priorTurnDamage'] = snapshot;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
        await (this as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update(updates);
        return delta;
    }

    /**
     * Can this ship take the RT assault actions (ramming, boarding, Hit and
     * Run)? Explicit per-system gate — the other lines' voidcraft have no
     * such actions.
     */
    get supportsShipAssault(): boolean {
        return supportsShipAssault(this.system.gameSystem);
    }

    /** The stats the assault-action rules read, as a plain snapshot. */
    get assaultProfile(): ShipAssaultShip {
        return {
            name: this.name,
            hullType: this.hullType,
            manoeuvrability: this.manoeuvrability,
            crippledManoeuvrability: crippledStatChanges({ gameSystem: this.system.gameSystem, hullIntegrity: this.hullIntegrity }, this.speed).manoeuvrability,
            armour: this.armour,
            turretRating: this.turretRating,
            crewPopulation: this.crew.population,
            hullIntegrity: this.hullIntegrity.value,
            morale: this.crew.morale.value,
        };
    }

    /**
     * Apply direct Crew Population / Morale damage (a boarding party cutting
     * through the crew, RT Core p.215). RT only; records the losses in the
     * prior-turn snapshot so Hold Fast! / Triage can cancel them next turn.
     * Returns the losses actually applied.
     */
    async applyCrewMoraleDamage(crewDamage: number, moraleDamage: number): Promise<{ crewLoss: number; moraleLoss: number }> {
        if (!this.usesRTCrewEconomy) return { crewLoss: 0, moraleLoss: 0 };
        const before = this._readShipCombatState();
        const { next, snapshot } = recordCrewMoraleHit(before, this._readPriorTurnSnapshot(), crewDamage, moraleDamage, this._currentStrategicTurn());
        const delta = {
            crewLoss: before.crew.population - next.crew.population,
            moraleLoss: before.crew.morale.value - next.crew.morale.value,
        };
        if (delta.crewLoss === 0 && delta.moraleLoss === 0) return delta;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
        await (this as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
            'system.crew.population': next.crew.population,
            'system.crew.morale.value': next.crew.morale.value,
            'system.priorTurnDamage': snapshot,
        });
        return delta;
    }

    /** Void shields currently raised: neither overloaded by incoming hits nor lowered (#184). */
    get activeVoidShields(): number {
        return this.system.voidShieldsStatus.active;
    }

    /**
     * Overload up to `count` raised void shields (#184 — RT Core, "Damage and
     * Defences"): each cancelled one incoming hit and is down until restored.
     * Returns the number of shields that went down.
     */
    async overloadVoidShields(count: number): Promise<number> {
        const { active, exhausted } = this.system.voidShieldsStatus;
        const down = Math.max(0, Math.min(Math.trunc(count), active));
        if (down === 0) return 0;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
        await (this as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
            'system.voidShieldsStatus.active': active - down,
            'system.voidShieldsStatus.exhausted': exhausted + down,
        });
        return down;
    }

    /** Clear one recorded Critical Hit status once it has been repaired (#187). */
    async removeShipStatus(index: number): Promise<void> {
        const statuses = this.system.shipStatuses;
        if (index < 0 || index >= statuses.length) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
        await (this as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
            'system.shipStatuses': statuses.filter((_status, position) => position !== index),
        });
    }

    /**
     * Roll on the Rogue Trader Critical Hit chart (issue #187) and record the
     * result as a persistent ship status, posting the critical-hit chat card.
     *
     * `rolled` pre-selects the result — Hit and Run (#188) rolls 1d5 twice and
     * lets the raider choose, and a Crippled ship's critical is the damage past
     * its Armour (#187; a value past the chart lands on its last result) —
     * otherwise the table rolls its own die. A result whose table entry
     * destroys the ship records `destroysShip`, which `isDestroyed` reads.
     * Resolution order: world `RollTable` "Critical Hit", then the RT
     * ship-combat compendium pack, then a bare 1d5 with the
     * table-unavailable message so the GM applies the effect by hand.
     */
    async rollShipCriticalHit(rolled?: number): Promise<void> {
        // The weapon chart is 1d5, but the table's own formula spans the whole
        // chart (1d11) — so the die is always rolled here, never by the table.
        await this._recordCriticalHit(rolled === undefined ? WEAPON_CRITICAL_DIE : String(rolled), false);
    }

    /**
     * A Crippled ship takes damage past its Armour (RT Core "Crippled Ships",
     * #187): "Compare the value of the damage that exceeded the Armour to the
     * Critical Hit chart." Recorded and posted like any other Critical Hit.
     */
    async takeCrippledCriticalHit(damagePastArmour: number): Promise<void> {
        await this._recordCriticalHit(String(damagePastArmour), true);
    }

    /**
     * Draw `formula` on the Critical Hit chart, record the status and post its
     * card. `pastArmour` marks a Crippled ship's critical, read at its damage
     * past Armour rather than rolled on 1d5, so its label says so.
     */
    protected async _recordCriticalHit(formula: string, pastArmour: boolean): Promise<void> {
        const preRoll = await new Roll(formula).evaluate();
        const result = Math.trunc(preRoll.total);
        const draw = await RollTableUtils.rollTable(CRITICAL_HIT_TABLE_NAME, { displayChat: false, pack: CRITICAL_HIT_TABLE_PACK, roll: preRoll });
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's RollTable#roll returns an untyped TableResult array; reading the drawn result's id, name and text
        const drawn = draw === null ? undefined : (draw.results as unknown as DrawnCriticalResult[]).at(0);
        const resultText = drawn?.description ?? drawn?.text ?? '';
        const found = drawn !== undefined && resultText !== '';
        const drawnName = drawn?.name ?? '';
        const statusLabel = found && drawnName !== '' ? drawnName : t('WH40K.Voidcraft.Critical.ResultLabel', { rolled: result });
        const statusText = found ? resultText : t('WH40K.Voidcraft.Critical.TableUnavailable', { rolled: result });
        const statusId = found ? drawn.id ?? `critical-${result}` : `critical-${result}`;

        // Persistent until cleared by an Emergency Repair or Quick Repair action.
        const destroysShip = found && drawn.flags?.['wh40k-rpg']?.destroysShip === true;
        const next: ShipStatus[] = [
            ...this.system.shipStatuses,
            { id: statusId, name: statusLabel, rolled: result, text: statusText, appliedAt: Date.now(), destroysShip, pastArmour },
        ];
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
        await (this as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({ 'system.shipStatuses': next });

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-critical-hit-chat.hbs', {
            _gameSystemId: firstSystemId(this),
            actorName: this.name,
            resultName: statusLabel,
            resultText: statusText,
            statusLabel,
            rolled: result,
            rollLabel: t(criticalRollLabelKey(pastArmour), { rolled: result }),
            destroyedLabel: destroysShip ? t('WH40K.Voidcraft.Critical.Destroyed', { ship: this.name }) : '',
            image: 'icons/svg/explosion.svg',
            gameSystem: this.system.gameSystem,
        });
        await ChatMessage.create({
            // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker requires Actor.Implementation; WH40KVoidcraft extends it but the typings widen
            speaker: ChatMessage.getSpeaker({ actor: this as unknown as Actor.Implementation }),
            content: html,
        });
    }

    /**
     * Hold Fast! / Triage (RT Core p.218, #189): reduce one pool of the
     * previous turn's damage — Morale or Crew Population — by `amount`, never
     * by more than that pool lost. RT only. Returns the amount restored (0 when
     * nothing was recorded for the previous turn).
     */
    async reducePriorTurnDamage(pool: PriorTurnPool, amount: number): Promise<number> {
        if (!this.usesRTCrewEconomy) return 0;
        const before = this._readShipCombatState();
        const { next, snapshot, restored } = reducePriorTurnDamageRule(before, this._readPriorTurnSnapshot(), pool, amount, this._currentStrategicTurn());
        if (restored === 0) return 0;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
        await (this as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
            'system.crew.population': next.crew.population,
            'system.crew.morale.value': next.crew.morale.value,
            'system.priorTurnDamage': snapshot,
        });
        return restored;
    }

    /**
     * The ship's ActiveEffects as the ship-action modifier collector reads them
     * (#186): each effect's name, whether it is live, and its structured
     * ship-action payload (null for any other effect).
     */
    get shipActionEffects(): ShipEffectView[] {
        return this.effects.map((effect) => ({
            name: effect.name,
            active: effect.active,
            modifier: readShipModifierFlag(
                // eslint-disable-next-line no-restricted-syntax -- boundary: ActiveEffect#flags is Foundry's untyped per-module flag bag (getFlag only types the 'core' scope); readShipModifierFlag type-guards the value
                (effect.flags as Record<string, Record<string, unknown> | undefined>)[SHIP_MODIFIER_FLAG_SCOPE]?.[SHIP_MODIFIER_FLAG_KEY],
            ),
        }));
    }

    /** The ship's Weapon Components, for choosing the one Lock on Target aims (#186). */
    get shipWeaponChoices(): ShipWeaponChoice[] {
        return shipWeaponChoices(this.shipWeapons.map((weapon) => ({ id: weapon.id ?? '', name: weapon.name, sort: weapon.sort })));
    }

    /**
     * Store a timed ship-action modifier (Lock on Target, Aid the Machine
     * Spirit, Evasive Manoeuvres …, #186) as an ActiveEffect on the ship. RT
     * only; the effect lapses on its V14 expiry event.
     */
    async applyShipActionModifier(input: ShipModifierInput): Promise<void> {
        if (!this.usesRTCrewEconomy) return;
        const source = shipModifierEffectSource(input, CONST.ACTIVE_EFFECT_MODES.ADD);
        // eslint-disable-next-line no-restricted-syntax -- boundary: createEmbeddedDocuments accepts Foundry's untyped embedded-document create schema
        await this.createEmbeddedDocuments('ActiveEffect', [source] as unknown as Parameters<typeof this.createEmbeddedDocuments<'ActiveEffect'>>[1]);
    }

    /**
     * Replenish between combats — restores Morale to its max. Crew
     * Population is intentionally NOT restored (RAW — recruitment is
     * an Endeavour, off-screen). Clears the prior-turn damage snapshot
     * since we've left combat entirely.
     */
    async replenishBetweenCombat(): Promise<void> {
        if (!this.usesRTCrewEconomy) return;
        const before = this._readShipCombatState();
        const next = replenishBetweenCombatRule(before);
        if (next.crew.morale.value === before.crew.morale.value && this.system.priorTurnDamage.turn === 0) {
            return;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
        await (this as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
            'system.crew.morale.value': next.crew.morale.value,
            'system.priorTurnDamage': emptySnapshot(0),
        });
    }

    /**
     * Override the base `isCrippled` getter to delegate to the rules
     * helper — keeps the threshold composition test-reachable without
     * a Foundry runtime.
     */
    get isCrippled(): boolean {
        return isCrippledRule(this.hullIntegrity);
    }

    /**
     * Roll ship initiative (RAW: `1d10 + Detection Bonus`) through Foundry's
     * combat tracker (#196).
     *
     * Previously this posted a standalone chat card and returned `null`, so the
     * result never reached a Combatant and the ship never took a place in the
     * turn order — which also meant it was invisible to the RT strategic-round
     * flow, whose turn counter is the active Combat's `round`
     * (see `_currentStrategicTurn`). Delegating to `Actor#rollInitiative`
     * creates the Combatant (default `createCombatants: true`, matching the
     * terracraft/aircraft sheet button) and writes the rolled total onto it.
     *
     * The dice expression itself is not passed here: `WH40KCombatant`
     * resolves it from `VoidcraftData.initiativeFormula`, so a ship rolled from
     * the tracker's own "roll all" / "roll NPCs" controls gets the same RAW
     * formula as one rolled from the sheet button. The chat card's flavour
     * names the Detection Bonus so the card carries the modifier's provenance
     * alongside Foundry's rendered `1d10 + N` formula.
     *
     * @param options Standard Foundry roll-initiative options; callers may
     *                override `createCombatants` / `rerollInitiative`.
     * @returns The Combat the ship was rolled into, or `null` when no encounter
     *          exists and the user cannot create one.
     */
    override async rollInitiative(options?: Actor.RollInitiativeOptions): Promise<Combat.Implementation | null> {
        const flavor = t('WH40K.Voidcraft.Combat.InitiativeFlavor', { bonus: this.detectionBonus });
        return super.rollInitiative({
            createCombatants: true,
            ...options,
            initiativeOptions: {
                messageOptions: { flavor },
                ...options?.initiativeOptions,
            },
        });
    }
}
