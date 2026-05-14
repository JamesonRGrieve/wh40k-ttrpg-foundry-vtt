/**
 * @file Black Crusade system configuration.
 * Aptitude-based advancement with 4 skill ranks + Chaos alignment cost modifiers.
 *
 * BC uses the same base aptitude system as DH2e/OW, but each advance also has a
 * Chaos alignment (Khorne/Nurgle/Slaanesh/Tzeentch/Unaligned). When the advance's
 * alignment matches the character's, costs are reduced. Opposed alignments cost more.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
import type { OriginStepConfig, ChaosAlignment, SidebarHeaderField } from './types.ts';

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
    readonly theme = {
        primary: 'crimson',
        accent: 'crimson-light',
        border: 'crimson-dark',
    } as const;

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

    /**
     * BC: psyker unlock is the "Psyker" archetype (step='archetype').
     * Compendium item: bc-core-archetypes/psyker.
     */
    override isPsyker(actor: WH40KBaseActor): boolean {
        return actor.items.some((i) => i.isOriginPath && (i.system as { step?: string }).step === 'archetype' && i.name.toLowerCase() === 'psyker');
    }

    getHeaderFields(actor: WH40KBaseActor): SidebarHeaderField[] {
        const originPath = (actor.system.originPath as Record<string, string | number> | undefined) ?? {};
        return [
            this.makeField('Home World', 'system.originPath.homeWorld', originPath['homeWorld'] ?? ''),
            this.makeField('Archetype', 'system.originPath.role', originPath['role'] ?? '', 'Archetype'),
            this.makeField('Pride', 'system.originPath.background', originPath['background'] ?? ''),
            this.makeField('Disgrace', 'system.originPath.trialsAndTravails', originPath['trialsAndTravails'] ?? '', 'Disgrace'),
            this.makeField('Motivation', 'system.originPath.motivation', originPath['motivation'] ?? ''),
        ];
    }

    /** BC characteristic aptitude pairs */
    getCharacteristicAptitudes(charKey: string): [string, string] {
        const map: Record<string, [string, string]> = {
            weaponSkill: ['Weapon Skill', 'Offence'],
            ballisticSkill: ['Ballistic Skill', 'Finesse'],
            strength: ['Strength', 'Offence'],
            toughness: ['Toughness', 'Defence'],
            agility: ['Agility', 'Finesse'],
            intelligence: ['Intelligence', 'Knowledge'],
            perception: ['Perception', 'Fieldcraft'],
            willpower: ['Willpower', 'Psyker'],
            fellowship: ['Fellowship', 'Social'],
        };
        return map[charKey] ?? ['General', 'General'];
    }

    /** BC skill aptitude pairs — same base table as DH2e */
    getSkillAptitudeTable(): Record<string, [string, string]> {
        return {
            acrobatics: ['Agility', 'General'],
            athletics: ['Strength', 'General'],
            awareness: ['Perception', 'Fieldcraft'],
            charm: ['Fellowship', 'Social'],
            command: ['Fellowship', 'Leadership'],
            commerce: ['Intelligence', 'Knowledge'],
            commonLore: ['Intelligence', 'General'],
            deceive: ['Fellowship', 'Social'],
            dodge: ['Agility', 'Defence'],
            forbiddenLore: ['Intelligence', 'Knowledge'],
            inquiry: ['Fellowship', 'Social'],
            interrogation: ['Willpower', 'Social'],
            intimidate: ['Strength', 'General'],
            linguistics: ['Intelligence', 'General'],
            logic: ['Intelligence', 'Knowledge'],
            medicae: ['Intelligence', 'Fieldcraft'],
            navigate: ['Intelligence', 'Fieldcraft'],
            operate: ['Agility', 'Fieldcraft'],
            parry: ['Weapon Skill', 'Defence'],
            psyniscience: ['Perception', 'Psyker'],
            scholasticLore: ['Intelligence', 'Knowledge'],
            scrutiny: ['Perception', 'General'],
            security: ['Intelligence', 'Tech'],
            sleightOfHand: ['Agility', 'Knowledge'],
            stealth: ['Agility', 'Fieldcraft'],
            survival: ['Perception', 'Fieldcraft'],
            techUse: ['Intelligence', 'Tech'],
            trade: ['Intelligence', 'General'],
        };
    }

    // ── Alignment System ─────────────────────────────────────────

    /**
     * Get the character's current Chaos alignment.
     */
    getCharacterAlignment(actor: WH40KBaseActor): ChaosAlignment {
        // eslint-disable-next-line no-restricted-syntax -- boundary: chaosAlignment is untyped system data
        return ((actor.system as Record<string, unknown>)['chaosAlignment'] as ChaosAlignment | undefined) ?? 'unaligned';
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
    getAlignmentCostModifier(characterAlignment: ChaosAlignment, advanceAlignment: ChaosAlignment): number {
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

    // eslint-disable-next-line no-restricted-syntax -- boundary: context matches abstract base signature; advanceAlignment extracted and typed below
    override getSkillAdvanceCost(actor: WH40KBaseActor, skillKey: string, currentRank: number, context?: Record<string, unknown>): number | null {
        const baseCost = super.getSkillAdvanceCost(actor, skillKey, currentRank, context);
        if (baseCost === null) return null;

        const advAlignment = (context?.['advanceAlignment'] as ChaosAlignment | undefined) ?? 'unaligned';
        const charAlignment = this.getCharacterAlignment(actor);
        const modifier = this.getAlignmentCostModifier(charAlignment, advAlignment);

        return Math.ceil(baseCost * modifier);
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: talent and context match abstract base signature; talent cast below; context validated by extractContextAptitudes
    override getTalentAdvanceCost(actor: WH40KBaseActor, talent: unknown, context?: Record<string, unknown>): number | null {
        const baseCost = super.getTalentAdvanceCost(actor, talent, context);
        if (baseCost === null) return null;

        // eslint-disable-next-line no-restricted-syntax -- boundary: talent is untyped external data cast for property access
        const talentData = talent as Record<string, unknown>;
        const advAlignment =
            (context?.['advanceAlignment'] as ChaosAlignment | undefined) ??
            // eslint-disable-next-line no-restricted-syntax -- boundary: talentData.system is untyped
            ((talentData['system'] as Record<string, unknown> | undefined)?.['chaosAlignment'] as ChaosAlignment | undefined) ??
            'unaligned';
        const charAlignment = this.getCharacterAlignment(actor);
        const modifier = this.getAlignmentCostModifier(charAlignment, advAlignment);

        return Math.ceil(baseCost * modifier);
    }
}
