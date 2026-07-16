import type { HordeTrait } from '../data/actor/mixins/horde-template.ts';
import { applyCriticalDamageConditions } from '../rules/active-effects.ts';
import { type CriticalDamageRecord, getCriticalDamageRecord } from '../rules/critical-damage.ts';
import { damageTypeDropdown } from '../rules/damage-type.ts';
import { type BreakCheck, magnitudeLossForHit, resolveBreakCheck } from '../rules/dw-horde-magnitude.ts';
import { hitDropdown } from '../rules/hit-locations.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { postChatCard, resolveGettersForTemplate } from './roll-helpers.ts';

/**
 * Optional horde state surfaced by NPC actors carrying the HordeTemplate
 * mixin. When the target is a horde *and* its owning actor runs on the
 * DW game system, AssignDamageData routes the resolved hit through the
 * RAW "single hit removes 1 Magnitude" branch instead of wounds.
 */
interface ActorHordeState {
    enabled: boolean;
    magnitude: { current: number; max: number };
    /** Trait identifiers (Fearless / Disciplined / …) governing break-check behaviour. */
    traits?: readonly string[];
}

/** Minimal actor shape needed for damage assignment. Exported for tests. */
export interface ActorLike {
    system: {
        armour: Record<string, { value: number; toughnessBonus: number }>;
        wounds: { value: number; critical: number };
        fatigue: { value: number };
        /** Active game-system id from the DataModel (`'dw'`, `'dh2'`, …). */
        gameSystem?: string;
        /** Optional horde state (set on NPC DataModels via the mixin). */
        horde?: ActorHordeState;
    };
    hasTalent: (name: string) => boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.update accepts arbitrary update data; return type is unknown
    update: (data: Record<string, unknown>) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.createEmbeddedDocuments return type is unknown
    createEmbeddedDocuments: (type: string, data: Record<string, unknown>[]) => Promise<unknown>;
}

/** Minimal hit shape needed for damage assignment. */
interface HitLike {
    location: string;
    damageType: string;
    totalDamage: number;
    totalPenetration: number;
    totalFatigue: number;
    /** Cover AP added at the hit location (from active Cover situational modifiers). */
    coverAP?: number;
    /**
     * Number of Righteous Fury triggers on the damage roll. When > 0 and
     * defences fully absorbed the hit (reducedDamage ≤ 0), RAW applies 1
     * point of unarmoured damage anyway (core.md L10398-10414).
     */
    righteousFuryCount?: number;
    /**
     * Whether the source weapon has Explosive (X). When the target is a
     * DW horde, RAW gives +1 Magnitude loss per hit ("Weapons that
     * inflict Explosive Damage … count as having inflicted one
     * additional Hit", core.md p. 359).
     */
    isExplosive?: boolean;
}

export class AssignDamageData {
    locations = hitDropdown();
    actor: ActorLike;
    hit: HitLike;
    damageType = damageTypeDropdown();
    ignoreArmour = false;

    armour = 0;
    /** Cover AP applied on top of the location armour. Surfaced separately for chat-card display. */
    coverAP = 0;
    tb = 0;

    hasFatigueDamage = false;
    fatigueTaken = 0;

    hasDamage = false;
    damageTaken = 0;
    hasCriticalDamage = false;
    criticalDamageTaken = 0;
    criticalEffect = '';
    /**
     * Structured Critical Damage result for the resolved hit (#108) — carries the
     * classified riders that drive condition / ActiveEffect application. Populated
     * in {@link finalize} whenever critical damage is taken; null otherwise.
     */
    criticalRecord: CriticalDamageRecord | null = null;

    /** True when this hit resolved against a DW horde (#166). */
    hasHordeDamage = false;
    /** Magnitude removed by this hit when {@link hasHordeDamage} is true. */
    magnitudeLost = 0;
    /** Pre-hit magnitude (for chat-card display). */
    magnitudeBefore = 0;
    /** Post-hit magnitude (for chat-card display). */
    magnitudeAfter = 0;
    /**
     * Break-check resolution from {@link resolveBreakCheck}, computed when
     * a horde lost Magnitude this hit. Drives the follow-up Willpower
     * test / auto-break narration in the chat card.
     */
    hordeBreakCheck: BreakCheck | undefined = undefined;
    /** True when {@link hordeBreakCheck} is populated; convenience flag for Handlebars. */
    hasHordeBreakCheck = false;
    /**
     * Localised break-check status label (e.g., "Willpower test at -10",
     * "Auto-break"). Empty when no test required.
     */
    hordeBreakLabel = '';

    constructor(actor: ActorLike, hit: HitLike) {
        this.actor = actor;
        this.hit = hit;
    }

    update(): void {
        this.armour = 0;
        this.tb = 0;
        this.coverAP = this.hit.coverAP ?? 0;
        const location = this.hit.location;
        if (location) {
            for (const [name, locationArmour] of Object.entries(this.actor.system.armour)) {
                if (location.replace(/\s/g, '').toUpperCase() === name.toUpperCase()) {
                    this.armour = locationArmour.value;
                    this.tb = locationArmour.toughnessBonus;
                }
            }
        }
        this.armour += this.coverAP;
    }

    /**
     * Preview the effective damage this hit deals to the target: total damage minus
     * the location armour (reduced by penetration, floored at 0) minus the location's
     * Toughness Bonus, with the RAW 1-point minimum when defences fully absorb the hit
     * (core.md L10398-10414). Pure — call after {@link update}; unlike {@link finalize}
     * it neither applies wounds nor posts to chat. Used to surface effective damage on
     * the damage chat card up front (#247). The DW-horde application path diverges at
     * apply time; this reports the standard armour + TB reduction.
     */
    previewReducedDamage(): { effective: number; armour: number; toughnessBonus: number; penetration: number; absorbed: boolean } {
        const totalDamage = Number(this.hit.totalDamage);
        const totalPenetration = Number(this.hit.totalPenetration);
        const usableArmour = this.ignoreArmour ? 0 : Math.max(0, this.armour - totalPenetration);
        const raw = totalDamage - (usableArmour + this.tb);
        const absorbed = raw <= 0;
        return { effective: absorbed ? 1 : raw, armour: usableArmour, toughnessBonus: this.tb, penetration: totalPenetration, absorbed };
    }

    /**
     * DW horde branch (#166): when the target is a horde *and* runs on
     * the DW ruleset, RAW collapses the wounds path entirely. The hit
     * either does damage (after armour + TB) or it doesn't; a damaging
     * hit removes 1 Magnitude (+1 if Explosive). Wounds, criticals,
     * fatigue, Righteous Fury, True Grit all bypass — a horde is an
     * abstract pool, not an actor with anatomy.
     */
    private _isDwHordeTarget(): boolean {
        const horde = this.actor.system.horde;
        if (horde?.enabled !== true) return false;
        return this.actor.system.gameSystem === 'dw';
    }

    /**
     * Read the active horde-trait set from the target actor. Returns a
     * read-only `Set<HordeTrait>` (empty when the horde has no traits or
     * the target isn't a horde). The mixin stores traits as `string[]`
     * to allow forward-compat with unknown trait ids; the cast here
     * preserves that — unknown strings simply never match a `traits.has(…)`
     * check in the resolver.
     */
    private _getHordeTraits(): ReadonlySet<HordeTrait> {
        const traits = this.actor.system.horde?.traits;
        if (traits === undefined) return new Set<HordeTrait>();
        return new Set(traits as readonly HordeTrait[]);
    }

    async finalize(): Promise<void> {
        const totalDamage = Number(this.hit.totalDamage);
        const totalPenetration = Number(this.hit.totalPenetration);

        // Reduce Armour by Penetration
        let usableArmour = this.armour;
        usableArmour = usableArmour - totalPenetration;
        if (usableArmour < 0) {
            usableArmour = 0;
        }
        if (this.ignoreArmour) {
            usableArmour = 0;
        }

        const reduction = usableArmour + this.tb;
        const reducedDamage = totalDamage - reduction;

        // DW horde branch (#166 — core.md p. 359 "Damaging a Horde").
        if (this._isDwHordeTarget()) {
            const horde = this.actor.system.horde;
            if (horde !== undefined) {
                this.hasHordeDamage = true;
                this.magnitudeBefore = horde.magnitude.current;
                // TODO (#166 Part C — defender-side trait damage modifiers):
                //   `applyHordeTraits()` in rules/dw-horde-magnitude.ts is the
                //   *attacker* horde's outgoing-damage hook (Overwhelming /
                //   Brutal Charge). RAW defender traits that affect received
                //   damage (e.g., Heavily Armoured-style cover bumps) aren't
                //   modelled yet — when they are, route the trait-modified
                //   hit-count / damage through here before magnitudeLossForHit.
                //   Disciplined / Fearless DO flow through, but via the
                //   break-check call below (RAW behaviour change).
                const loss = magnitudeLossForHit(reducedDamage, this.hit.isExplosive === true);
                this.magnitudeLost = loss;
                this.magnitudeAfter = Math.max(0, horde.magnitude.current - loss);

                // Resolve break check now so the chat card can render the
                // outcome alongside the magnitude delta. The caller can
                // dispatch the Willpower test from the rendered card.
                if (loss > 0) {
                    const traits = this._getHordeTraits();
                    const breakCheck = resolveBreakCheck({
                        startingMagnitude: horde.magnitude.max,
                        currentMagnitude: this.magnitudeAfter,
                        lostThisTurn: loss,
                        isFearless: traits.has('fearless'),
                        isDisciplined: traits.has('disciplined'),
                    });
                    this.hordeBreakCheck = breakCheck;
                    this.hasHordeBreakCheck = true;
                    this.hordeBreakLabel = this._localiseBreakOutcome(breakCheck);
                }
                return;
            }
        }

        // We have damage to process
        if (reducedDamage > 0) {
            // No Wounds Available
            if (this.actor.system.wounds.value <= 0) {
                // All applied as critical
                this.hasCriticalDamage = true;
                this.criticalDamageTaken = reducedDamage;
            } else if (this.actor.system.wounds.value >= reducedDamage) {
                //Reduce Wounds First
                // Only Wound Damage
                this.damageTaken = reducedDamage;
            } else {
                // Wound and Critical
                this.damageTaken = this.actor.system.wounds.value;
                this.hasCriticalDamage = true;
                this.criticalDamageTaken = reducedDamage - this.damageTaken;
            }
        }

        // Righteous Fury but defences fully absorbed the hit: RAW deals 1
        // point of unarmoured damage anyway (core.md L10398-10414).
        if (reducedDamage <= 0 && (this.hit.righteousFuryCount ?? 0) > 0) {
            if (this.actor.system.wounds.value <= 0) {
                // No wounds left → the 1 lands directly as critical.
                this.hasCriticalDamage = true;
                this.criticalDamageTaken = 1;
            } else {
                this.damageTaken = 1;
            }
        }

        if (this.criticalDamageTaken > 0) {
            // Handle True Grit Talent
            if (this.actor.hasTalent('True Grit')) {
                // Reduces by Toughness Bonus to minimum of 1
                this.criticalDamageTaken = this.criticalDamageTaken - this.tb < 1 ? 1 : this.criticalDamageTaken - this.tb;
            }

            // Resolve the structured Critical Damage record (effect prose + the
            // classified riders) so the applied conditions (#108) come from the
            // same lookup as the chat-card effect text.
            const criticalValue = this.actor.system.wounds.critical + this.criticalDamageTaken;
            this.criticalRecord = await getCriticalDamageRecord(this.hit.damageType, this.hit.location, criticalValue, this.actor.system.gameSystem);
            this.criticalEffect = this.criticalRecord?.effect ?? '';
        }

        if (this.hit.totalFatigue > 0) {
            this.hasFatigueDamage = true;
            this.fatigueTaken = this.hit.totalFatigue;
        }

        if (this.damageTaken > 0) {
            this.hasDamage = true;
        }
    }

    async performActionAndSendToChat(): Promise<void> {
        if (this.hasHordeDamage) {
            // DW horde branch (#166): write Magnitude, skip wound bookkeeping.
            await this.actor.update({
                'system.horde.magnitude.current': this.magnitudeAfter,
            });
        } else {
            // Assign Damage - use dot notation to avoid overwriting sibling properties
            await this.actor.update({
                'system.wounds.value': this.actor.system.wounds.value - this.damageTaken,
                'system.wounds.critical': this.actor.system.wounds.critical + this.criticalDamageTaken,
                'system.fatigue.value': this.actor.system.fatigue.value + this.fatigueTaken,
            });
        }
        game.wh40k.log('performActionAndSendToChat', this);

        // Create critical injury item if critical damage was taken
        if (this.hasCriticalDamage && this.criticalEffect) {
            await this._createCriticalInjuryItem();
        }

        // Apply the crit result's conditions / ActiveEffects (#108): Burning,
        // Blood Loss, Stunned, Prone, Blinded, Deafened, Fatigue, lost limb. Runs
        // whenever critical damage was taken; with no content pack the riders are
        // empty and nothing is applied.
        if (this.hasCriticalDamage && this.criticalRecord !== null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: ActorLike is the damage-apply narrowing of the real target document; the condition applicator needs the full actor surface (effects, createEmbeddedDocuments)
            await applyCriticalDamageConditions(this.actor as unknown as WH40KBaseActorDocument, this.criticalRecord);
        }

        const html = await foundry.applications.handlebars.renderTemplate(
            'systems/wh40k-rpg/templates/chat/assign-damage-chat.hbs',
            resolveGettersForTemplate(this),
        );
        await postChatCard(html);
    }

    /**
     * Translate a {@link BreakCheck} outcome to its localised label. The
     * keys live under `WH40K.DW.Horde.Break.*` to stay co-located with
     * the rest of the horde lang surface.
     */
    private _localiseBreakOutcome(breakCheck: BreakCheck): string {
        // Unit tests construct AssignDamageData without a Foundry runtime,
        // so `game.i18n` may not be defined. Falling back to the bare key
        // keeps the label deterministic in tests; at runtime Foundry
        // resolves the key to a translated string.
        const localize = (key: string): string => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: `game` is the Foundry runtime global; tests run without it
            const i18n = (globalThis as { game?: { i18n?: { localize?: (k: string) => string } } }).game?.i18n;
            return i18n?.localize?.(key) ?? key;
        };
        const outcomeKeys: Record<string, string> = {
            'auto-break': 'WH40K.DW.Horde.Break.AutoBreak',
            'test-penalised': 'WH40K.DW.Horde.Break.TestPenalised',
            'test-normal': 'WH40K.DW.Horde.Break.TestNormal',
            'no-test': 'WH40K.DW.Horde.Break.NoTest',
        };
        return localize(outcomeKeys[breakCheck.outcome] ?? 'WH40K.DW.Horde.Break.NoTest');
    }

    /**
     * Create a criticalInjury item on the actor from the critical damage.
     * @private
     */
    async _createCriticalInjuryItem(): Promise<void> {
        const severity = this.actor.system.wounds.critical + this.criticalDamageTaken;
        const clampedSeverity = Math.min(severity, 10);

        // Normalize location name
        let location = this.hit.location || 'body';
        if (location.toLowerCase().includes('arm')) location = 'Arm';
        else if (location.toLowerCase().includes('leg')) location = 'Leg';
        else if (location.toLowerCase().includes('head')) location = 'Head';
        else location = 'Body';

        // Normalize damage type
        const damageType = (this.hit.damageType || 'impact').toLowerCase();

        const itemData = {
            name: `Critical Injury - ${location} (${damageType.capitalize()})`,
            type: 'criticalInjury',
            system: {
                damageType: damageType,
                bodyPart: location.toLowerCase(),
                severity: clampedSeverity,
                effect: this.criticalEffect || '',
                permanent: clampedSeverity >= 8, // Severity 8+ typically permanent
                notes: `Taken at ${new Date().toLocaleString()}`,
            },
        };

        await this.actor.createEmbeddedDocuments('Item', [itemData]);
    }
}
