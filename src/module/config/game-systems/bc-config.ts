/**
 * @file Black Crusade system configuration.
 * Aptitude-based advancement with 4 skill ranks + Chaos alignment cost modifiers.
 *
 * BC uses the same base aptitude system as DH2e/OW, but each advance also has a
 * Chaos alignment (Khorne/Nurgle/Slaanesh/Tzeentch/Unaligned). When the advance's
 * alignment matches the character's, costs are reduced. Opposed alignments cost more.
 */

import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { OriginStepConfig, ChaosAlignment } from './types.ts';

/** Alignment opposition map: each god opposes another */
const ALIGNMENT_OPPOSITIONS: Record<string, string> = {
    khorne: 'slaanesh',
    slaanesh: 'khorne',
    nurgle: 'tzeentch',
    tzeentch: 'nurgle',
};

export class BCSystemConfig extends AptitudeBasedSystemConfig {
    readonly id = 'bc' as const;
    readonly label = 'WH40K.System.BlackCrusade';
    readonly cssClass = 'black-crusade';

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
                'bc-core-races',
                'bc-core-archetypes',
                'bc-core-prides',
                'bc-core-disgraces',
                'bc-core-motivations',
                'bc-blood-archetypes',
                'bc-decay-archetypes',
                'bc-excess-archetypes',
                'bc-fate-archetypes',
            ],
        };
    }

    /** BC characteristic aptitude pairs */
    getCharacteristicAptitudes(charKey: string): [string, string] {
        const map: Record<string, [string, string]> = {
            weaponSkill:    ['Weapon Skill', 'Offence'],
            ballisticSkill: ['Ballistic Skill', 'Finesse'],
            strength:       ['Strength', 'Offence'],
            toughness:      ['Toughness', 'Defence'],
            agility:        ['Agility', 'Finesse'],
            intelligence:   ['Intelligence', 'Knowledge'],
            perception:     ['Perception', 'Fieldcraft'],
            willpower:      ['Willpower', 'Psyker'],
            fellowship:     ['Fellowship', 'Social'],
        };
        return map[charKey] ?? ['General', 'General'];
    }

    /** BC skill aptitude pairs — same base table as DH2e */
    getSkillAptitudeTable(): Record<string, [string, string]> {
        return {
            acrobatics:     ['Agility', 'General'],
            athletics:      ['Strength', 'General'],
            awareness:      ['Perception', 'Fieldcraft'],
            charm:          ['Fellowship', 'Social'],
            command:        ['Fellowship', 'Leadership'],
            commerce:       ['Intelligence', 'Knowledge'],
            commonLore:     ['Intelligence', 'General'],
            deceive:        ['Fellowship', 'Social'],
            dodge:          ['Agility', 'Defence'],
            forbiddenLore:  ['Intelligence', 'Knowledge'],
            inquiry:        ['Fellowship', 'Social'],
            interrogation:  ['Willpower', 'Social'],
            intimidate:     ['Strength', 'General'],
            linguistics:    ['Intelligence', 'General'],
            logic:          ['Intelligence', 'Knowledge'],
            medicae:        ['Intelligence', 'Fieldcraft'],
            navigate:       ['Intelligence', 'Fieldcraft'],
            operate:        ['Agility', 'Fieldcraft'],
            parry:          ['Weapon Skill', 'Defence'],
            psyniscience:   ['Perception', 'Psyker'],
            scholasticLore: ['Intelligence', 'Knowledge'],
            scrutiny:       ['Perception', 'General'],
            security:       ['Intelligence', 'Tech'],
            sleightOfHand:  ['Agility', 'Knowledge'],
            stealth:        ['Agility', 'Fieldcraft'],
            survival:       ['Perception', 'Fieldcraft'],
            techUse:        ['Intelligence', 'Tech'],
            trade:          ['Intelligence', 'General'],
        };
    }

    // ── Alignment System ─────────────────────────────────────────

    /**
     * Get the character's current Chaos alignment.
     */
    getCharacterAlignment(actor: any): ChaosAlignment {
        return actor.system?.chaosAlignment ?? 'unaligned';
    }

    /**
     * Compute alignment cost modifier.
     *
     * BC rules:
     * - Advance alignment matches character: standard cost (multiplier 1.0)
     * - Advance is Unaligned: standard cost for everyone
     * - Character is Unaligned, advance is Aligned: +50% surcharge
     * - Advance alignment opposes character alignment: +100% surcharge (doubled)
     * - Advance alignment is non-opposing but different: +50% surcharge
     */
    getAlignmentCostModifier(
        characterAlignment: ChaosAlignment,
        advanceAlignment: ChaosAlignment,
    ): number {
        // Unaligned advances always cost the standard amount
        if (advanceAlignment === 'unaligned') return 1.0;

        // Matching alignment: no modifier
        if (characterAlignment === advanceAlignment) return 1.0;

        // Unaligned character buying aligned advance: +50%
        if (characterAlignment === 'unaligned') return 1.5;

        // Opposed alignment: double cost
        if (ALIGNMENT_OPPOSITIONS[characterAlignment] === advanceAlignment) return 2.0;

        // Non-opposing, non-matching: +50%
        return 1.5;
    }

    // ── Cost Overrides ───────────────────────────────────────────

    override getSkillAdvanceCost(
        actor: any,
        skillKey: string,
        currentRank: number,
        context?: Record<string, unknown>,
    ): number | null {
        const baseCost = super.getSkillAdvanceCost(actor, skillKey, currentRank, context);
        if (baseCost == null) return null;

        const advAlignment = (context?.advanceAlignment as ChaosAlignment) ?? 'unaligned';
        const charAlignment = this.getCharacterAlignment(actor);
        const modifier = this.getAlignmentCostModifier(charAlignment, advAlignment);

        return Math.ceil(baseCost * modifier);
    }

    override getTalentAdvanceCost(
        actor: any,
        talent: any,
        context?: Record<string, unknown>,
    ): number | null {
        const baseCost = super.getTalentAdvanceCost(actor, talent, context);
        if (baseCost == null) return null;

        const advAlignment = (context?.advanceAlignment as ChaosAlignment)
            ?? talent.system?.chaosAlignment
            ?? 'unaligned';
        const charAlignment = this.getCharacterAlignment(actor);
        const modifier = this.getAlignmentCostModifier(charAlignment, advAlignment);

        return Math.ceil(baseCost * modifier);
    }
}
