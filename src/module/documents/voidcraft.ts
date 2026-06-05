import {
    cancelPriorTurnDamage as cancelPriorTurnDamageRule,
    canCancelPriorTurnDamage as canCancelPriorTurnDamageRule,
    emptySnapshot,
    isCrippled as isCrippledRule,
    recordHullHit,
    replenishBetweenCombat as replenishBetweenCombatRule,
    type PriorTurnDamageSnapshot,
    type ShipCombatState,
} from '../rules/ship-crew-morale.ts';
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
};

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
            'token.bar1': { attribute: 'hullIntegrity' },
            'token.bar2': { attribute: 'crew.morale' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': dataWithName?.name,
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
     * Is the ship destroyed?
     * @type {boolean}
     */
    get isDestroyed(): boolean {
        return this.hullIntegrity.value <= 0;
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

        // Create a chat message with the weapon details
        const cardData = {
            actor: this,
            weapon: weapon,
            crewRating: this.system.crew.crewRating,
            detectionBonus: this.detectionBonus,
            gameSystem: this.system.gameSystem,
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
     *     revert it.
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
     * Hold Fast! / Triage hook. Revert the prior-turn hull + crew +
     * morale losses recorded on the actor. No-op when the snapshot is
     * empty, belongs to the current turn, or this hull is not under
     * the RT crew economy.
     *
     * Returns the deltas actually restored so callers can display a
     * chat card or post a notification.
     */
    async cancelPriorTurnDamage(): Promise<{
        hullRestored: number;
        crewRestored: number;
        moraleRestored: number;
    }> {
        if (!this.usesRTCrewEconomy) {
            return { hullRestored: 0, crewRestored: 0, moraleRestored: 0 };
        }
        const turn = this._currentStrategicTurn();
        const snap = this._readPriorTurnSnapshot();
        if (!canCancelPriorTurnDamageRule(snap, turn)) {
            return { hullRestored: 0, crewRestored: 0, moraleRestored: 0 };
        }
        const before = this._readShipCombatState();
        const { next, snapshot } = cancelPriorTurnDamageRule(before, snap);
        const restored = {
            hullRestored: next.hullIntegrity.value - before.hullIntegrity.value,
            crewRestored: next.crew.population - before.crew.population,
            moraleRestored: next.crew.morale.value - before.crew.morale.value,
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update accepts dotted-path Record
        const updates: Record<string, unknown> = {
            'system.hullIntegrity.value': next.hullIntegrity.value,
            'system.crew.population': next.crew.population,
            'system.crew.morale.value': next.crew.morale.value,
            'system.priorTurnDamage': snapshot,
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
        await (this as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update(updates);
        return restored;
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
     * Roll ship initiative (1d10 + Detection Bonus)
     */
    override async rollInitiative(_options?: Actor.RollInitiativeOptions): Promise<Combat.Implementation | null> {
        const roll = await new Roll(`1d10 + ${this.detectionBonus}`).evaluate();

        const content = `
            <div class="wh40k-hit-location-result">
                <h3><i class="fas fa-satellite-dish"></i> Ship Initiative</h3>
                <div class="wh40k-hit-roll">
                    <span class="wh40k-roll-result">${roll.total}</span>
                </div>
                <div class="wh40k-hit-location">
                    <span class="wh40k-location-armour">1d10 + Detection Bonus (${this.detectionBonus})</span>
                </div>
            </div>
        `;

        await ChatMessage.create({
            // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker requires Actor.Implementation; WH40KVoidcraft extends it but type narrowing requires cast
            speaker: ChatMessage.getSpeaker({ actor: this as unknown as Actor.Implementation }),
            content: content,
            rolls: [roll],
        });

        return null;
    }
}
