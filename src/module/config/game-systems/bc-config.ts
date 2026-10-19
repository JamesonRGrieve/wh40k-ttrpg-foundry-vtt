/**
 * @file Black Crusade system configuration.
 *
 * BC has no aptitudes and no career ranks (`bc/core/core.md` :2557). Cost
 * is a flat True / Allied / Opposed × tier matrix (Tables 2-6 / 2-7 / 2-9)
 * over 4 characteristic tiers, 4 skill ranks, and 3 talent tiers. Alignment
 * is derived from the actor's `chaosAdvancements` log via
 * `bc-alignment-derivation.ts`, re-evaluated at every 10-CP threshold
 * (`core.md` :2569).
 *
 * BC remains an `AptitudeBasedSystemConfig` subclass so that the shared
 * skill-bonus formula in `creature.ts` (which switches on `usesAptitudes`)
 * keeps its current behavior across all seven systems. Only the cost
 * dispatch and alignment derivation are replaced — the aptitude-based
 * skill-bonus plumbing is content-agnostic and unaffected by this change.
 */

import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import {
    type ChaosAdvanceEntry,
    deriveAlignmentFromTally,
    nextAlignmentCheckpoint,
    psykerLockedByAlignment,
    shouldRecheckAlignment,
    tallyAdvancesByAlignment,
    type AlignmentTally,
} from '../../rules/bc-alignment-derivation.ts';
import { DISPOSITION_MODELS } from '../../rules/disposition.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import type { GrappleRules } from '../../rules/grapple.ts';
import { capitalize } from '../../utils/format.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import { printedGrappleRules } from './base-system-config.ts';
import {
    BC_CHARACTERISTIC_TIERS,
    BC_INFAMY_ADVANCE_CAP,
    BC_INFAMY_ADVANCE_COST,
    BC_INFAMY_INCREMENT,
    characteristicAdvanceCost,
    characteristicAffiliation,
    infamyAdvanceCost,
    skillAdvanceCost,
    talentAdvanceCost,
} from './bc-advancement-config.ts';
import type {
    AdvanceCostResult,
    CharacteristicTierDef,
    ChaosAlignment,
    DispositionModelDef,
    OriginStepConfig,
    SidebarHeaderField,
    SystemConfigActor,
} from './types.ts';

/** Subset of system.* that BC config reads off the actor. Avoids `any` casts. */
interface BcCharacterSystem {
    chaosAlignment?: ChaosAlignment;
    chaosAdvancements?: ChaosAdvanceEntry[];
    alignmentCheckpoint?: number;
    corruption?: number;
    infamy?: number;
}

function readBcSystem(actor: SystemConfigActor): BcCharacterSystem {
    // BC fields are declared on CharacterData but typed as a union with
    // NPC data on the actor; this narrow cast is the documented Foundry
    // boundary (Record-cast policy in CLAUDE.md).
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is a per-document-type union; narrowing to the BC subset for read-only access
    return actor.system as unknown as BcCharacterSystem;
}

export class BCSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'bc' as const;
    readonly usesMalignancyTest = false;
    readonly maleficCorruptionOnManifest = false;

    /**
     * Infamy Acquisition Test — core Table 9-11: Acquisition Test Modifiers
     * (p. 306). (Table 5-20's ladder on p. 200 is daemon-weapon crafting, not
     * acquisition.)
     */
    readonly inquestRules = null;
    readonly itemRepair = null;
    /** BC core p. 169: upgrades are "applied by characters with the Tech Skill", with no test printed (#136). */
    readonly weaponModification = null;
    /**
     * BC core: "The number of extra hits scored in this manner cannot exceed the
     * weapon's … rate of fire" (both bursts); Suppressing Fire: "The number of
     * hits scored may not exceed …"; Storm: "to a maximum of twice the weapon's
     * Full Automatic rate of fire" — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'extra', suppressingCap: 'total', stormCap: 'double-rof' };
    /**
     * BC core, Combat Actions: Semi-Auto Burst (Type: Half Action) "with a +0
     * bonus"; Full Auto Burst (Type: Half Action) "with a −10 bonus to his
     * attack" — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 0, actionCost: 'half' },
        full: { attackModifier: -10, actionCost: 'half' },
    };
    /**
     * BC core: "When Evading Full Auto or Semi-Auto Bursts, each Degree of Success
     * on the Dodge Test negates one additional hit. When Evading Swift or Lightning
     * Attacks, each Degree of Success on the Dodge or Parry Test negates one
     * additional hit." No Storm or Twin-Linked rule — #414.
     */
    /**
     * BC core, Grapple: Slip Free prints "a Challenging (+0) Contortionist Skill
     * Test", and BC's Contortionist is a special use of Acrobatics ("Characters may
     * also use Acrobatics to escape from a grapple", BC core, Special Uses for
     * Acrobatics), so it rolls Acrobatics. Throw Down only makes the opponent Prone.
     */
    readonly grappleRules: GrappleRules = printedGrappleRules('acrobatics', 0);

    readonly evasionRules: EvasionRules = {
        multiHitActions: ['Semi-Auto Burst', 'Full Auto Burst', 'Swift Attack', 'Lightning Attack'],
        twinLinked: false,
        anyMultiHit: false,
        stormTwoPerDegree: false,
    };
    readonly acquisitionLadder: AcquisitionLadder = {
        availability: {
            ubiquitous: 70,
            abundant: 50,
            plentiful: 30,
            common: 20,
            average: 10,
            scarce: 0,
            rare: -10,
            veryRare: -20,
            extremelyRare: -30,
            nearUnique: -50,
            unique: -70,
        },
        craftsmanship: { poor: 10, common: 0, good: -10, best: -20 },
        // p. 306: "If he fails, he does not" obtain it — no Infamy is lost.
        failureLoss: null,
    };

    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.bc';
    readonly cssClass = 'black-crusade';
    readonly theme = {
        primary: 'crimson',
        // Accent is text on the dark sheet: crimson-light measured 2.3:1, below WCAG AA.
        accent: 'crimson-l40',
        chatAccent: 'crimson',
        border: 'crimson-dark',
    } as const;

    /** BC starting xp: Disciples of Chaos 1,000; Chaos Space Marines 500. Default to the larger pool. */
    override get startingXP(): number {
        return 1000;
    }

    /** BC Dispositions are the seven-step ladder; a success gains one step per degree (p. 276, Table 8–2) — #73. */
    override getDispositionModel(): DispositionModelDef {
        return DISPOSITION_MODELS.ladderDegrees;
    }

    getOriginStepConfig(): OriginStepConfig {
        return {
            coreSteps: [
                { key: 'race', step: 'race', icon: 'fa-skull-crossbones', descKey: 'RaceDesc', stepIndex: 1 },
                { key: 'archetype', step: 'archetype', icon: 'fa-helmet-battle', descKey: 'ArchetypeDesc', stepIndex: 2 },
                { key: 'pride', step: 'pride', icon: 'fa-crown', descKey: 'PrideDesc', stepIndex: 3 },
                { key: 'disgrace', step: 'disgrace', icon: 'fa-chain-broken', descKey: 'DisgraceDesc', stepIndex: 4 },
                { key: 'motivation', step: 'motivation', icon: 'fa-fire', descKey: 'MotivationDesc', stepIndex: 5 },
            ],
            optionalStep: null,
            packs: [
                'bc-core-origins-races',
                'bc-core-origins-archetypes',
                'bc-core-origins-prides',
                'bc-core-origins-disgraces',
                'bc-core-origins-motivations',
                'bc-blood-origins-archetypes',
                'bc-decay-origins-archetypes',
                'bc-excess-origins-archetypes',
                'bc-fate-origins-archetypes',
            ],
        };
    }

    // ── BC Tier Definitions ─────────────────────────────────────

    /**
     * BC uses a 4-tier characteristic ladder
     * (Simple / Intermediate / Trained / Expert — `core.md` :2581).
     * The aptitude-based default ladder is 5-tier (DH2-style); BC overrides.
     */
    override getCharacteristicTiers(): CharacteristicTierDef[] {
        return BC_CHARACTERISTIC_TIERS.map((key) => ({
            key,
            label: `WH40K.BC.Advancement.Tier.${capitalize(key)}`,
        }));
    }

    /**
     * BC uses a 4-rank skill ladder (Known / Trained / Experienced / Veteran
     * — `core.md` :2677) with DH2-style schema slot keys and RAW labels that
     * match DH2 byte-for-byte, so `getSkillRanks` is inherited unchanged from
     * `AptitudeBasedSystemConfig`.
     *
     * BC psyker unlock is the "Psyker" archetype. Aligned-to-Khorne
     * characters lose Psyker Trait counts even while owning the archetype
     * (`core.md` :2750-2754).
     */
    override isPsyker(actor: SystemConfigActor): boolean {
        if (!this.ownsOriginPathItem(actor, 'archetype', 'psyker')) return false;
        return !psykerLockedByAlignment(this.getCharacterAlignment(actor));
    }

    getHeaderFields(actor: SystemConfigActor): SidebarHeaderField[] {
        return [
            // BC's first origin step is Race; it is stored in the shared `homeWorld` slot.
            this.makeOriginField(actor, 'WH40K.OriginPath.Race', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Archetype', 'role'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Pride', 'background'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Disgrace', 'trialsAndTravails'),
            this.makeOriginField(actor, 'WH40K.OriginPath.Motivation', 'motivation'),
        ];
    }

    /**
     * BC has no aptitudes, so it has no universal one either (#631). Advance cost
     * is set by the advance's Chaos alignment against the character's — True,
     * Allied or Opposed (core p.76, Tables 2-4 / 2-5) — and an adversary profile
     * lists characteristics, skills, talents, traits and weapons with no
     * aptitudes (core p.352). The inherited `['General']` would put a lone
     * "General" pill on every BC sheet's Aptitudes panel.
     */
    override readonly universalAptitudes: readonly string[] = [];

    // Characteristic + skill aptitude pairs are inherited from AptitudeBasedSystemConfig (#298).
    // BC uses them only for the shared skill-bonus display formula (gated on `usesAptitudes`);
    // its advancement cost runs through the True/Allied/Opposed matrix, not these tables.

    // ── Alignment System ─────────────────────────────────────────

    /**
     * Get the character's current Chaos alignment. Prefers the recorded
     * `chaosAlignment` slot (last result of a 10-CP re-evaluation); the
     * advance-tally-derived alignment is exposed separately via
     * `deriveAlignmentFor` for UI surfaces and update-time refresh.
     */
    getCharacterAlignment(actor: SystemConfigActor): ChaosAlignment {
        return readBcSystem(actor).chaosAlignment ?? 'unaligned';
    }

    /**
     * Pure tally of the actor's `chaosAdvancements` log. Exposed for UI.
     */
    getAlignmentTally(actor: SystemConfigActor): AlignmentTally {
        const advances = readBcSystem(actor).chaosAdvancements ?? [];
        return tallyAdvancesByAlignment(advances);
    }

    /**
     * Compute the alignment this character WOULD have if re-checked now.
     * Does not mutate the actor; callers compare to `getCharacterAlignment`
     * to detect a pending flip.
     */
    deriveAlignmentFor(actor: SystemConfigActor): ChaosAlignment {
        return deriveAlignmentFromTally(this.getAlignmentTally(actor));
    }

    /**
     * Whether the actor should re-check Alignment right now (crossed a
     * fresh 10-CP threshold since the last recorded checkpoint).
     */
    shouldRecheckAlignment(actor: SystemConfigActor): boolean {
        const sys = readBcSystem(actor);
        return shouldRecheckAlignment(sys.corruption ?? 0, sys.alignmentCheckpoint ?? 0);
    }

    /**
     * Compute the checkpoint value to persist after a re-evaluation
     * actually fires (the floor of the actor's current corruption to a
     * 10-CP multiple).
     */
    nextCheckpointFor(actor: SystemConfigActor): number {
        return nextAlignmentCheckpoint(readBcSystem(actor).corruption ?? 0);
    }

    /** Whether this actor is currently psyker-locked by their Alignment. */
    isAlignmentBlockingPsyker(actor: SystemConfigActor): boolean {
        return psykerLockedByAlignment(this.getCharacterAlignment(actor));
    }

    // ── BC Cost Dispatch ────────────────────────────────────────

    /**
     * Resolve the alignment of a characteristic for cost purposes.
     * Per `core.md` :2586 only Str/Tou/Fel/WP have non-Unaligned
     * affiliations.
     */
    getCharacteristicAlignment(charKey: string): ChaosAlignment {
        return characteristicAffiliation(charKey);
    }

    /**
     * Black Crusade characteristic cost: True/Allied/Opposed × tier
     * (Table 2-6). The aptitude-based base method is bypassed — BC has no
     * aptitudes (`core.md` :2557).
     */
    override getCharacteristicAdvanceCost(actor: SystemConfigActor, charKey: string, currentTier: number): AdvanceCostResult | null {
        const charAlignment = this.getCharacterAlignment(actor);
        const advAlignment = this.getCharacteristicAlignment(charKey);
        const cost = characteristicAdvanceCost(charAlignment, advAlignment, currentTier);
        if (cost === null) return null;
        const tierKey: (typeof BC_CHARACTERISTIC_TIERS)[number] | undefined = BC_CHARACTERISTIC_TIERS[currentTier];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- tsconfig.test parser lacks noUncheckedIndexedAccess; main tsconfig has it and requires this guard
        if (tierKey === undefined) return null;
        return { cost, tier: tierKey };
    }

    /**
     * Black Crusade skill cost: True/Allied/Opposed × rank (Table 2-7).
     * The skill's per-advance alignment is supplied by callers in
     * `context.advanceAlignment`. When omitted, defaults to 'unaligned'
     * (which is Allied for every alignment, matching the RAW "unaligned
     * advances" treatment in :2599).
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context matches abstract base signature; advanceAlignment is extracted and narrowed below
    override getSkillAdvanceCost(actor: SystemConfigActor, _skillKey: string, currentRank: number, context?: Record<string, unknown>): number | null {
        const advAlignment = this.#extractAdvanceAlignment(context) ?? 'unaligned';
        return skillAdvanceCost(this.getCharacterAlignment(actor), advAlignment, currentRank);
    }

    /**
     * Black Crusade talent cost: True/Allied/Opposed × tier (Table 2-9).
     * The talent's alignment and tier come from the talent item's system
     * data (compendium content); callers may override via `context`.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: talent and context match abstract base signature; both are validated through narrowed reads below
    override getTalentAdvanceCost(actor: SystemConfigActor, talent: unknown, context?: Record<string, unknown>): number | null {
        const talentSystem = this.#readTalentSystem(talent);
        const advAlignment = this.#extractAdvanceAlignment(context) ?? talentSystem?.chaosAlignment ?? 'unaligned';
        const ctxTier = typeof context?.['tier'] === 'number' ? context['tier'] : undefined;
        const tier = ctxTier ?? talentSystem?.tier ?? 1;
        return talentAdvanceCost(this.getCharacterAlignment(actor), advAlignment, tier);
    }

    /**
     * Infamy advance cost. Returns null when Infamy is at or above 40
     * (`core.md` :2667). Independent of Alignment — Infamy is unaligned
     * (`core.md` :2586).
     */
    getInfamyAdvanceCost(actor: SystemConfigActor): number | null {
        return infamyAdvanceCost(readBcSystem(actor).infamy ?? 0);
    }

    /** Per-advance Infamy increment exposed for UI / order-handlers. */
    get infamyAdvanceIncrement(): number {
        return BC_INFAMY_INCREMENT;
    }

    /** Infamy cap exposed for UI. */
    get infamyAdvanceCap(): number {
        return BC_INFAMY_ADVANCE_CAP;
    }

    /** Flat XP cost of an Infamy advance (exposed for UI). */
    get infamyAdvanceFlatCost(): number {
        return BC_INFAMY_ADVANCE_COST;
    }

    // ── Helpers ─────────────────────────────────────────────────

    // eslint-disable-next-line no-restricted-syntax -- boundary: context flows in from abstract base signature, narrowed via string-literal comparison below
    #extractAdvanceAlignment(context: Record<string, unknown> | undefined): ChaosAlignment | null {
        const raw = context?.['advanceAlignment'];
        if (raw === 'khorne' || raw === 'nurgle' || raw === 'slaanesh' || raw === 'tzeentch' || raw === 'unaligned') {
            return raw;
        }
        // Return null (not 'unaligned') so callers' `?? talentSystem?.chaosAlignment`
        // fallback chains actually fire when no context override is supplied.
        return null;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: talent flows in from abstract base signature (Foundry Item / raw compendium entry), validated by typeof guards before access
    #readTalentSystem(talent: unknown): { chaosAlignment?: ChaosAlignment; tier?: number } | null {
        if (talent === null || typeof talent !== 'object') return null;
        // eslint-disable-next-line no-restricted-syntax -- boundary: talent.system is per-talent-type-keyed; narrowing to the two BC fields we use
        const sys = (talent as { system?: unknown }).system;
        if (sys === null || typeof sys !== 'object') return null;
        // eslint-disable-next-line no-restricted-syntax -- boundary: talent.system is per-talent-type-keyed; narrowing to the two BC fields we use
        const s = sys as { chaosAlignment?: unknown; tier?: unknown };
        const out: { chaosAlignment?: ChaosAlignment; tier?: number } = {};
        if (
            s.chaosAlignment === 'khorne' ||
            s.chaosAlignment === 'nurgle' ||
            s.chaosAlignment === 'slaanesh' ||
            s.chaosAlignment === 'tzeentch' ||
            s.chaosAlignment === 'unaligned'
        ) {
            out.chaosAlignment = s.chaosAlignment;
        }
        if (typeof s.tier === 'number') out.tier = s.tier;
        return out;
    }
}
