/**
 * @file Dark Heresy 1st Edition system configuration.
 * Career-based advancement with 3 skill ranks.
 */

import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import type { BurstActionRules, BurstCapRules } from '../../rules/auto-fire.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import { FATIGUE_MODES } from '../../rules/fatigue.ts';
import type { GrappleRules } from '../../rules/grapple.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import { TRADE_ARMOURER_FITTING_RULES } from './base-system-config.ts';
import { CareerBasedSystemConfig } from './career-based-system-config.ts';
import type { FatigueModelDef, OriginStepConfig, SidebarHeaderField, SystemConfigActor } from './types.ts';

export class DH1eSystemConfig extends CareerBasedSystemConfig {
    readonly id = 'dh1' as const;
    readonly usesMalignancyTest = true;
    // Disciples of the Dark Gods prints its own Malefic powers; its cost rule is unverified.
    readonly maleficCorruptionOnManifest = false;

    /**
     * Influence requisition — Ascension Table 1-5: Availability Modifiers (p. 14).
     * The test "may be modified by the duration of the requisition, the
     * Availability of the Item, or the number of individuals" (p. 16): no
     * craftsmanship modifier.
     */
    readonly inquestRules = null;
    readonly itemRepair = null;
    /** DH1 core Weapon Upgrades: a successful Trade (Armourer) test (#136). */
    readonly weaponModification: WeaponModificationRules = TRADE_ARMOURER_FITTING_RULES;
    /**
     * DH1 core: "The number of extra hits you can score in this manner may not
     * exceed the … rate of fire" (both bursts); Suppressing Fire: "The number of
     * hits scored may not exceed …". DH1 core prints no Storm; Ascension, Daemon
     * Hunter and Blood of Martyrs make every hit "up to the weapon's listed rate
     * of fire" two hits, i.e. twice the ceiling — #607.
     */
    readonly burstRules: BurstCapRules = { burstCap: 'extra', suppressingCap: 'total', stormCap: 'double-rof' };
    /**
     * DH1 core p. 191: "Semi-Auto Burst (Full Action)" "grants a +10 modifier to
     * your Ballistic Skill Test"; p. 190: "Full Auto Burst (Full Action)" "grants a
     * +20 modifier" — #607.
     */
    readonly burstActions: BurstActionRules = {
        semi: { attackModifier: 10, actionCost: 'full' },
        full: { attackModifier: 20, actionCost: 'full' },
    };
    /** DH1 core: "When Dodging Full or Semi-Automatic fire, each degree of success negates an additional hit." — #414. */
    /**
     * DH1 core, Grapple (Full Action): the grappler's one option is an Opposed
     * Strength test to injure; the grappled may break free or take control with an
     * Opposed Strength test, or escape with "a Contortionist Test opposed by the
     * grappler's Strength Test" (Contortionist, Escape Grapple). DH1 prints no Throw
     * Down, Push, Ready, Stand or Use Item.
     */
    readonly grappleRules: GrappleRules = {
        options: [
            { id: 'damage-opponent', role: 'controller', test: { kind: 'opposed-strength' } },
            { id: 'break-free', role: 'target', test: { kind: 'opposed-strength' } },
            { id: 'slip-free', role: 'target', test: { kind: 'opposed-skill', skill: 'contortionist' } },
            { id: 'take-control', role: 'target', test: { kind: 'opposed-strength' } },
        ],
        thrownDownBonus: 0,
    };

    readonly evasionRules: EvasionRules = {
        multiHitActions: ['Semi-Auto Burst', 'Full Auto Burst'],
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
        craftsmanship: null,
        // Ascension p. 16: "if the Test fails by four or more degrees, the group loses 1 Influence" —
        // a DH1 degree is each full 10 points of margin (core: "for each full 10 points by which you fail").
        failureLoss: { kind: 'flat', minDegrees: 4, loss: 1, counting: 'fullTens' },
    };
    readonly label = 'WH40K.SETTINGS.PrimaryGameSystem.Choices.dh1';
    readonly cssClass = 'dark-heresy-1e';
    readonly theme = {
        primary: 'gold-raw',
        accent: 'gold-raw-l5',
        chatAccent: 'gold-raw-d25',
        border: 'gold-raw-d15',
    } as const;

    /** DH1 uses the halving fatigue model (errata: TB+WPB threshold, 2× death) — #114. */
    override getFatigueModel(): FatigueModelDef {
        return FATIGUE_MODES.halving;
    }

    /**
     * Dark Heresy characters receive 1000 XP at character generation in addition to the
     * starting package. The base config defaults to 0, which left DH1 characters at zero
     * XP after origin path commit while DH2 characters got the canonical 1000. See #14.
     */
    override get startingXP(): number {
        return 1000;
    }

    getOriginStepConfig(): OriginStepConfig {
        // DH1e core character creation is Home World → Career Path. Divination is
        // rolled on the Tarot RollTable (handled separately, not a card step) and
        // "Rank"/role is derived within the chosen career — neither is a builder
        // step. Inquisitor's Handbook home worlds extend the same Home World step.
        // Ascension careers (a post-campaign tier) are intentionally excluded.
        return {
            coreSteps: [
                { key: 'homeWorld', step: 'homeWorld', icon: 'fa-globe', descKey: 'HomeWorldDesc', stepIndex: 1 },
                { key: 'career', step: 'career', icon: 'fa-user-tie', descKey: 'CareerDesc', stepIndex: 2 },
            ],
            optionalStep: null,
            packs: ['dh1-core-origins-homeworlds', 'dh1-inquisitor-origins-homeworlds', 'dh1-core-origins-careers'],
        };
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: matches abstract CareerBasedSystemConfig.getCareerRegistry() return type
    getCareerRegistry(): Record<string, unknown> {
        // DH1e career tables TBD
        return {};
    }

    resolveCareerKey(actor: SystemConfigActor): string | null {
        const career = actor.system.originPath?.['career'];
        return typeof career === 'string' ? career : null;
    }

    getHeaderFields(actor: SystemConfigActor): SidebarHeaderField[] {
        // Divination renders as the italic quote beneath the portrait
        // (sidebar-header), so it is not repeated as a static row here (#226).
        return [
            this.makeOriginField(actor, 'WH40K.OriginPath.HomeWorld', 'homeWorld'),
            this.makeOriginField(actor, 'WH40K.OriginPath.CareerPath', 'career'),
            this.makeOriginField(actor, 'WH40K.Character.Rank', 'role'),
        ];
    }
}
