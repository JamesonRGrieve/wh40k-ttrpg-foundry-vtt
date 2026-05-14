/**
 * @file NPCSheet - NPC actor sheet.
 * Extends the PC CharacterSheet so NPCs render in the same horizontal-tab layout;
 * overrides PARTS to point at NPC-specific tab templates under templates/actor/npc/
 * and adds a sixth "NPC" tab containing all NPC-unique controls
 * (horde, barter/transactions, tags, combat tracker, faction, GM tools, stat-block I/O).
 */

import type { GameSystemId, SidebarHeaderField } from '../../config/game-systems/types.ts';
import type { WH40KNPC } from '../../documents/npc.ts';
import { TransactionManager } from '../../transactions/transaction-manager.ts';
import CombatPresetDialog from '../npc/combat-preset-dialog.ts';
import StatBlockExporter from '../npc/stat-block-exporter.ts';
import StatBlockParser from '../npc/stat-block-parser.ts';
import NPCThreatScalerDialog from '../npc/threat-scaler-dialog.ts';
import type { SkillLike } from './base-actor-sheet.ts';
import CharacterSheet from './character-sheet.ts';

/** Local trained-skill shape used by skill mutation handlers (loose superset of the schema). */
interface NPCV2TrainedSkillData {
    name?: string;
    characteristic?: string;
    trained?: boolean;
    plus10?: boolean;
    plus20?: boolean;
    plus30?: boolean;
    bonus?: number;
}

/** Mapping from WH40K skill key to its governing characteristic key. */
const NPC_SKILL_CHAR_MAP: Readonly<Record<string, string>> = {
    acrobatics: 'agility',
    athletics: 'strength',
    awareness: 'perception',
    charm: 'fellowship',
    command: 'fellowship',
    commerce: 'fellowship',
    deceive: 'fellowship',
    dodge: 'agility',
    inquiry: 'fellowship',
    interrogation: 'willpower',
    intimidate: 'strength',
    logic: 'intelligence',
    medicae: 'intelligence',
    parry: 'weaponSkill',
    psyniscience: 'perception',
    scrutiny: 'perception',
    security: 'intelligence',
    sleightOfHand: 'agility',
    stealth: 'agility',
    survival: 'perception',
    techUse: 'intelligence',
} as const;

/** Pick characteristic from existing state or fall back to the map default. */
function resolveSkillChar(existing: NPCV2TrainedSkillData | undefined, skillKey: string): string {
    const fromState = existing?.characteristic;
    return fromState !== undefined && fromState !== '' ? fromState : NPC_SKILL_CHAR_MAP[skillKey] ?? 'perception';
}

/** Build a trained-skill entry at the requested level, preserving characteristic and bonus from the prior state. */
function buildSkillEntry(skillKey: string, level: 'trained' | 'plus10' | 'plus20', prior: NPCV2TrainedSkillData | undefined): NPCV2TrainedSkillData {
    return {
        name: skillKey,
        characteristic: resolveSkillChar(prior, skillKey),
        trained: true,
        plus10: level !== 'trained',
        plus20: level === 'plus20',
        bonus: prior?.bonus ?? 0,
    };
}

/* eslint-disable no-restricted-syntax -- boundary: render-context types interop with Foundry's untyped Handlebars context */
/** Typed shape of a prepared item entry on the NPC sheet context. */
type NPCItemContext = {
    type: string;
    id: string;
    [key: string]: unknown;
};

/** Typed shape of a hit-location entry on the NPC sheet context. */
type NPCHitLocation = {
    key: string;
    label: string;
    short?: string;
    range?: string;
    value: number;
    dr?: number;
    [key: string]: unknown;
};

/** Typed shape of context['horde'] on the NPC sheet. */
type NPCHordeContext = {
    enabled?: unknown;
    magnitude?: number;
    magnitudeMax?: number;
    magnitudePercent?: number;
    damageMultiplier?: number;
    sizeModifier?: number;
    isHorde?: unknown;
    destroyed?: boolean;
    barClass?: string;
    [key: string]: unknown;
};
/* eslint-enable no-restricted-syntax */

/**
 * Typed projection of `context['system']` as set by `_prepareContext` /
 * CharacterSheet.  Only the fields NPCSheet actually reads are listed;
 * the index signature keeps the type open for additional fields.
 */
/* eslint-disable no-restricted-syntax -- boundary: render-context types interop with Foundry's untyped Handlebars context */
type NPCSystemContext = {
    characteristics: Record<
        string,
        {
            label: string;
            short: string;
            base: number;
            modifier: number;
            unnatural: number;
            total: number;
            bonus: number;
        }
    >;
    trainedSkills: Record<
        string,
        | {
              name?: string;
              characteristic?: string;
              trained?: boolean;
              plus10?: boolean;
              plus20?: boolean;
              bonus?: number;
          }
        | undefined
    >;
    trainedSkillsList?: Array<Record<string, unknown>>;
    horde?: {
        enabled?: unknown;
        magnitude?: { current?: number; max?: number };
        damageMultiplier?: number;
        sizeModifier?: number;
    };
    armour: {
        mode: string;
        total: number;
        locations?: {
            head?: number;
            body?: number;
            leftArm?: number;
            rightArm?: number;
            leftLeg?: number;
            rightLeg?: number;
            [key: string]: number | undefined;
        };
    };
    wounds?: { value?: number; max?: number; critical?: number };
    movement?: Record<string, unknown>;
    initiative?: Record<string, unknown>;
    isHorde?: boolean;
    magnitudePercent?: number;
    hordeDestroyed?: boolean;
    pinnedAbilities?: string[];
    tags?: string[];
    source?: string;
    template?: string;
    specialAbilities?: unknown;
    threatTier?: unknown;
    threatLevel?: unknown;
    type?: string;
    role?: string;
    faction?: string;
    getSkillTarget?: (key: string) => number | string;
    [key: string]: unknown;
};
/* eslint-enable no-restricted-syntax */

/**
 * Actor sheet for npc type actors.
 * Inherits the PC layout (horizontal tabs, shared tabs.hbs nav) and supplies
 * NPC-specific tab templates plus a dedicated NPC tab.
 *
 * @extends {CharacterSheet}
 */
export default class NPCSheet extends CharacterSheet {
    declare isEditable: boolean;
    declare _notify: (message: string, type?: string) => void;
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2.render options shape is mixin-erased to Record<string,unknown>.
    declare render: (options?: Record<string, unknown> | boolean) => Promise<this>;

    /** NPC sheets default to EDIT mode for GM convenience. */
    override _mode = 2;

    /** Sheet display mode constants (PLAY=1, EDIT=2). */
    static MODES = { PLAY: 1, EDIT: 2 } as const;

    /** The actor cast to its NPC document type for NPC-specific API access. */
    protected get npcActor(): WH40KNPC {
        // eslint-disable-next-line no-restricted-syntax -- boundary: parent sheet types actor narrowly (acolyte); NPCs use the npc subtype at runtime
        return this.actor as unknown as WH40KNPC;
    }

    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        ...CharacterSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'actor', 'player', 'npc'],
        position: {
            width: 1050,
            height: 800,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...(CharacterSheet.DEFAULT_OPTIONS.actions ?? {}),
            // NPC-specific actions (later keys override parent where they collide)
            // Horde actions
            toggleHordeMode: NPCSheet.#toggleHordeMode,
            applyMagnitudeDamage: NPCSheet.#applyMagnitudeDamage,
            restoreMagnitude: NPCSheet.#restoreMagnitude,
            // Roll actions (rollCharacteristic & rollSkill kept for NPC-specific roll paths)
            rollCharacteristic: NPCSheet.#rollCharacteristic,
            rollSkill: NPCSheet.#rollSkill,
            rollInitiative: NPCSheet.#rollInitiative,
            // Weapon actions
            reloadWeapon: NPCSheet.#reloadWeapon,
            // Armour actions
            toggleArmourMode: NPCSheet.#toggleArmourMode,
            // Skill actions
            addTrainedSkill: NPCSheet.#addTrainedSkill,
            removeTrainedSkill: NPCSheet.#removeTrainedSkill,
            toggleFavoriteSkill: NPCSheet.#toggleFavoriteSkill,
            setSkillLevel: NPCSheet.#setSkillLevel,
            cycleSkillLevel: NPCSheet.#cycleSkillLevel,
            // Ability actions
            pinAbility: NPCSheet.#pinAbility,
            unpinAbility: NPCSheet.#unpinAbility,
            toggleFavoriteTalent: NPCSheet.#toggleFavoriteTalent,
            // GM utility actions
            setupToken: NPCSheet.#setupToken,
            duplicateNPC: NPCSheet.#duplicateNPC,
            scaleToThreat: NPCSheet.#scaleToThreat,
            exportStatBlock: NPCSheet.#exportStatBlock,
            importStatBlock: NPCSheet.#importStatBlock,
            calculateDifficulty: NPCSheet.#calculateDifficulty,
            saveCombatPreset: NPCSheet.#saveCombatPreset,
            loadCombatPreset: NPCSheet.#loadCombatPreset,
            deleteNPC: NPCSheet.#deleteNPC,
            editImage: NPCSheet.#editImage,
            applyDamage: NPCSheet.#applyDamage,
            healWounds: NPCSheet.#healWounds,
            applyCustomDamage: NPCSheet.#applyCustomDamage,
            healCustomWounds: NPCSheet.#healCustomWounds,
            // Combat tracker actions
            rerollInitiative: NPCSheet.#rerollInitiative,
            addToCombat: NPCSheet.#addToCombat,
            removeFromCombat: NPCSheet.#removeFromCombat,
            removeItem: NPCSheet.#removeItem,
            // Tag actions
            addTag: NPCSheet.#addTag,
            removeTag: NPCSheet.#removeTag,
            // UI actions
            toggleEditSection: NPCSheet.#toggleEditSection,
            toggleEditMode: NPCSheet.#toggleEditMode,
            toggleGMTools: NPCSheet.#toggleGMTools,
            toggleAbilityDesc: NPCSheet.#toggleAbilityDesc,
            setTransactionMode: NPCSheet.#setTransactionMode,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /* -------------------------------------------- */

    /**
     * PARTS for the NPC sheet — inherits the PC sidebar layout (header + tabs
     * containers, body parts) from CharacterSheet, drops the PC-only Overview
     * and Powers tabs, and adds an "npc" tab under templates/actor/npc/ for
     * NPC-unique panels (horde, barter, tags, combat tracker, GM tools, etc.).
     * The sidebar accent colour is overridden via --wh40k-sidebar-accent in
     * _npc-sheet.css so NPCs read --npc-accent-primary while PCs keep gold.
     * @override
     */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = (() => {
        const parent = CharacterSheet.PARTS;
        const inherited: Record<string, ApplicationV2Config.PartConfiguration> = {};
        for (const key of ['header', 'tabs', 'skills', 'combat', 'equipment', 'biography'] as const) {
            const part = parent[key] ?? undefined;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: part is undefined when key is absent from parent Record
            if (part !== undefined) inherited[key] = part;
        }
        return {
            ...inherited,
            npc: {
                template: 'systems/wh40k-rpg/templates/actor/npc/tab-npc.hbs',
                container: { classes: ['wh40k-body'], id: 'tab-body' },
                scrollable: [''],
            },
        };
    })();

    /* -------------------------------------------- */

    /**
     * TABS — NPCs omit the PC-focused Overview (Fate/XP/Origin dashboard);
     * Skills opens by default. The final NPC tab carries NPC-only controls
     * (horde, barter, tags, combat tracker, GM tools).
     * @override
     */
    static override TABS = [
        { tab: 'skills', label: 'WH40K.Tabs.Skills', group: 'primary', cssClass: 'tab-skills' },
        { tab: 'combat', label: 'WH40K.Tabs.Combat', group: 'primary', cssClass: 'tab-combat' },
        { tab: 'equipment', label: 'WH40K.Tabs.Equipment', group: 'primary', cssClass: 'tab-equipment' },
        { tab: 'biography', label: 'WH40K.Tabs.Biography', group: 'primary', cssClass: 'tab-biography' },
        { tab: 'npc', label: 'WH40K.Tabs.NPC', group: 'primary', cssClass: 'tab-npc' },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups = {
        primary: 'skills',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext signature contract
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        // Let CharacterSheet populate favoriteSkills, favoriteTalents,
        // equippedWeapons, loadout data, combat data, and the rest of the PC
        // fields the shared player/*.hbs templates read.
        const context = await super._prepareContext(options);

        // Flag — every PC template gates PC-only widgets (Fate, Fatigue,
        // Lift/Push, XP, Origin Path, Influence/Requisition/Gelt) with
        // {{#unless isNPC}}. isGM is now inherited from BaseActorSheet.
        context['isNPC'] = true;

        // Header + NPC-tab additions
        context['threatTier'] = this.npcActor.system.threatTier;
        context['npcTypeOptions'] = {
            troop: 'Troop',
            elite: 'Elite',
            master: 'Master',
            horde: 'Horde',
            swarm: 'Swarm',
            creature: 'Creature',
            daemon: 'Daemon',
            xenos: 'Xenos',
        };
        context['npcRoleOptions'] = {
            bruiser: 'Bruiser',
            sniper: 'Sniper',
            caster: 'Caster',
            support: 'Support',
            commander: 'Commander',
            specialist: 'Specialist',
        };
        context['weaponClassOptions'] = {
            melee: 'Melee',
            pistol: 'Pistol',
            basic: 'Basic',
            heavy: 'Heavy',
            thrown: 'Thrown',
        };
        context['transactionProfile'] = TransactionManager.getProfile(this.actor);

        // NPC-flavoured preparation on top of the PC context.
        this._prepareCharacteristicsContext(context);
        this._prepareWeaponsContext(context);
        this._prepareHordeContext(context);
        this._prepareItems(context);

        return context;
    }

    protected override _getSidebarHeaderFields(_gameSystem: GameSystemId | null): SidebarHeaderField[] {
        const npcActor = this.npcActor;
        // eslint-disable-next-line no-restricted-syntax -- boundary: threatTier is untyped in the NPC DataModel; narrowed via typeof guard below.
        const tierRaw: unknown = npcActor.system.threatTier;
        const threatTier = (typeof tierRaw === 'object' && tierRaw !== null ? tierRaw : {}) as { color?: string; label?: string };
        const threatColor = threatTier.color;
        const threatLabel = threatTier.label;
        return [
            {
                label: 'Threat',
                name: 'system.threatLevel',
                type: 'number' as const,
                value: npcActor.system.threatLevel,
                min: 1,
                max: 30,
                icon: 'fa-solid fa-skull',
                rowClass: 'wh40k-threat-row',
                inputClass: 'wh40k-threat-input',
                ...(threatColor !== undefined ? { borderColor: threatColor, valueColor: threatColor } : {}),
                ...(threatLabel !== undefined ? { valueLabel: threatLabel } : {}),
                valueClass: 'wh40k-threat-tier',
            },
            {
                label: 'Type',
                name: 'system.type',
                type: 'select' as const,
                value: npcActor.system.type,
                options: {
                    troop: 'Troop',
                    elite: 'Elite',
                    master: 'Master',
                    horde: 'Horde',
                    swarm: 'Swarm',
                    creature: 'Creature',
                    daemon: 'Daemon',
                    xenos: 'Xenos',
                },
            },
            {
                label: 'Role',
                name: 'system.role',
                type: 'select' as const,
                value: npcActor.system.role,
                options: {
                    bruiser: 'Bruiser',
                    sniper: 'Sniper',
                    caster: 'Caster',
                    support: 'Support',
                    commander: 'Commander',
                    specialist: 'Specialist',
                },
            },
            {
                label: 'Faction',
                name: 'system.faction',
                type: 'text' as const,
                value: npcActor.system.faction,
                placeholder: 'Faction',
            },
        ];
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristics data for display.
     * Creates a 3x3 grid of 9 characteristics (excludes Influence for NPCs).
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareCharacteristicsContext(context: Record<string, unknown>): void {
        const sys = context['system'] as NPCSystemContext;
        const chars = sys.characteristics;
        const charArray = [];

        // Define the 9 characteristics for NPCs (exclude Influence)
        const npcCharKeys = ['weaponSkill', 'ballisticSkill', 'strength', 'toughness', 'agility', 'intelligence', 'perception', 'willpower', 'fellowship'];

        for (const key of npcCharKeys) {
            const char = chars[key];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: chars is Record-indexed so entries may be absent at runtime
            if (char === undefined) continue;
            charArray.push({
                key,
                label: char.label,
                short: char.short,
                base: char.base,
                modifier: char.modifier,
                unnatural: char.unnatural,
                total: char.total,
                bonus: char.bonus,
                hasUnnatural: char.unnatural >= 2,
            });
        }

        context['characteristicsArray'] = charArray;
    }

    /* -------------------------------------------- */

    /**
     * Prepare weapons data for display.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareWeaponsContext(context: Record<string, unknown>): void {
        // Embedded weapons (from items dragged onto the NPC)
        const items = context['items'] as NPCItemContext[];
        context['embeddedWeapons'] = items.filter((i) => i.type === 'weapon');
    }

    /* -------------------------------------------- */

    /**
     * Prepare horde data for display.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareHordeContext(context: Record<string, unknown>): void {
        const sys = context['system'] as NPCSystemContext;
        const horde = sys.horde ?? {};
        const isHorde = sys.isHorde;

        const hordeCtx: NPCHordeContext = {
            enabled: horde.enabled,
            magnitude: horde.magnitude?.current ?? 30,
            magnitudeMax: horde.magnitude?.max ?? 30,
            magnitudePercent: sys.magnitudePercent ?? 100,
            damageMultiplier: horde.damageMultiplier ?? 1,
            sizeModifier: horde.sizeModifier ?? 0,
            isHorde,
            destroyed: sys.hordeDestroyed ?? false,
        };

        // Magnitude bar styling
        const pct = hordeCtx.magnitudePercent ?? 100;
        hordeCtx.barClass = pct > 66 ? 'high' : pct > 33 ? 'medium' : 'low';
        context['horde'] = hordeCtx;
    }

    /* -------------------------------------------- */

    /* -------------------------------------------- */

    /**
     * Part-context dispatch. Since NPCs reuse the PC templates, we must let
     * CharacterSheet's switch populate every field those templates read
     * (favoriteSkills, favoriteTalents, equippedWeapons, tab metadata, etc.).
     * Then we layer NPC-specific additions on top (sparse skills list, simple
     * weapons, horde/threat/barter state for the npc tab).
     * @override
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._preparePartContext signature uses Record<string,unknown> per Foundry's mixin-erased contract.
    override async _preparePartContext(partId: string, context: Record<string, unknown>, options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const partContext = await super._preparePartContext(partId, context, options);

        // The npc tab isn't in CharacterSheet's switch — set tab metadata by hand.
        if (partId === 'npc') {
            const ctor = this.constructor as typeof NPCSheet;
            type TabConfig = { tab: string; label: string; group: string; cssClass: string };
            const tabConfig = (ctor.TABS as TabConfig[]).find((t) => t.tab === 'npc');
            if (tabConfig) {
                const groups: Record<string, string> = this.tabGroups;
                partContext['tab'] = {
                    id: tabConfig.tab,
                    group: tabConfig.group,
                    cssClass: tabConfig.cssClass,
                    label: game.i18n.localize(tabConfig.label),
                    active: groups[tabConfig.group] === tabConfig.tab,
                };
            }
        }

        // NPC-flavoured data prep (sparse skills, simple weapons, horde, notes).
        switch (partId) {
            case 'overview':
                this._prepareOverviewContext(partContext);
                this._prepareAbilitiesContext(partContext);
                break;
            case 'skills':
                this._prepareSkillsContext(partContext);
                break;
            case 'combat':
            case 'equipment':
                this._prepareCombatContext(partContext);
                break;
            case 'biography':
                this._prepareNotesContext(partContext);
                break;
            case 'npc':
                this._prepareNotesContext(partContext);
                this._prepareAbilitiesContext(partContext);
                break;
        }

        return partContext;
    }

    /* -------------------------------------------- */

    /**
     * Prepare overview tab context.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context and return value are the mixin-erased sheet→template payload Record<string,unknown>.
    override _prepareOverviewContext(context: Record<string, unknown>, _options: Record<string, unknown> = {}): Record<string, unknown> {
        const sys = context['system'] as NPCSystemContext;

        // Ensure items array exists
        if (context['items'] === undefined) {
            context['items'] = Array.from(this.actor.items);
        }
        const items = context['items'] as NPCItemContext[];

        // Pinned abilities for overview
        const pinnedIds = sys.pinnedAbilities ?? [];
        context['pinnedAbilities'] = items.filter((i) => pinnedIds.includes(i.id) && (i.type === 'talent' || i.type === 'trait'));

        // Favorite Skills
        const favoriteSkillKeys = (this.actor.getFlag('wh40k-rpg', 'favoriteSkills') as string[] | undefined) ?? [];
        context['favoriteSkills'] = favoriteSkillKeys
            .map((key: string) => {
                // sys.trainedSkills is a sparse map; lookup is genuinely optional at runtime
                const skillData = sys.trainedSkills[key];
                if (skillData === undefined) return null;

                // Get characteristic for this skill
                const charMap: Record<string, string> = {
                    acrobatics: 'agility',
                    athletics: 'strength',
                    awareness: 'perception',
                    charm: 'fellowship',
                    command: 'fellowship',
                    commerce: 'fellowship',
                    deceive: 'fellowship',
                    dodge: 'agility',
                    inquiry: 'fellowship',
                    interrogation: 'willpower',
                    intimidate: 'strength',
                    logic: 'intelligence',
                    medicae: 'intelligence',
                    parry: 'weaponSkill',
                    psyniscience: 'perception',
                    scrutiny: 'perception',
                    security: 'intelligence',
                    sleightOfHand: 'agility',
                    stealth: 'agility',
                    survival: 'perception',
                    techUse: 'intelligence',
                };
                const charKey = charMap[key] ?? 'intelligence';
                const char = sys.characteristics[charKey];
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics is Record-indexed so entries may be absent at runtime
                if (char === undefined) return null;
                const target = sys.getSkillTarget ? sys.getSkillTarget(key) : char.total;

                return {
                    key,
                    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
                    charShort: char.short,
                    target,
                    isFavorite: true,
                };
            })
            .filter((s) => s !== null);

        // Favorite Talents
        const favoriteTalentIds = (this.actor.getFlag('wh40k-rpg', 'favoriteTalents') as string[] | undefined) ?? [];
        context['favoriteTalents'] = items.filter((i) => favoriteTalentIds.includes(i.id) && i.type === 'talent');

        // Armour data
        context['armour'] = {
            mode: sys.armour.mode,
            isSimple: sys.armour.mode === 'simple',
            isLocations: sys.armour.mode === 'locations',
            total: sys.armour.total,
            locations: sys.armour.locations,
        };

        // Hit locations for location-based armour
        context['hitLocations'] = [
            { key: 'head', label: 'Head', value: sys.armour.locations?.head ?? 0 },
            { key: 'body', label: 'Body', value: sys.armour.locations?.body ?? 0 },
            { key: 'leftArm', label: 'Left Arm', value: sys.armour.locations?.leftArm ?? 0 },
            { key: 'rightArm', label: 'Right Arm', value: sys.armour.locations?.rightArm ?? 0 },
            { key: 'leftLeg', label: 'Left Leg', value: sys.armour.locations?.leftLeg ?? 0 },
            { key: 'rightLeg', label: 'Right Leg', value: sys.armour.locations?.rightLeg ?? 0 },
        ];

        // Combat summary
        context['combatSummary'] = {
            initiative: sys.initiative,
            dodge: sys.getSkillTarget ? sys.getSkillTarget('dodge') : '—',
            parry: sys.getSkillTarget ? sys.getSkillTarget('parry') : '—',
            armour: sys.armour.mode === 'simple' ? sys.armour.total : 'By Location',
        };

        // Toughness bonus for armor display
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics is Record-indexed
        context['toughnessBonus'] = sys.characteristics['toughness']?.bonus ?? 0;

        // Threat tier
        context['threatTier'] = sys.threatTier;

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare combat tab context.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareCombatContext(context: Record<string, unknown>): void {
        const sys = context['system'] as NPCSystemContext;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics is Record-indexed
        const tb = sys.characteristics['toughness']?.bonus ?? 0;
        context['toughnessBonus'] = tb;

        // Armour data
        const armourMode = sys.armour.mode;
        const armourTotal = sys.armour.total;
        const locs: Record<string, number | undefined> = sys.armour.locations ?? {};
        context['armour'] = {
            mode: armourMode,
            isSimple: armourMode === 'simple',
            isLocations: armourMode === 'locations',
            total: armourTotal,
            locations: locs,
        };

        // Hit locations with roll ranges (always show, use total AP for simple mode)
        const getAP = (key: string): number => (armourMode === 'simple' ? armourTotal : locs[key] ?? 0);
        const hitLocations: NPCHitLocation[] = [
            { key: 'head', label: 'Head', short: 'Head', range: '01–10', value: getAP('head'), dr: getAP('head') + tb },
            { key: 'body', label: 'Body', short: 'Body', range: '31–70', value: getAP('body'), dr: getAP('body') + tb },
            { key: 'leftArm', label: 'Left Arm', short: 'L.Arm', range: '21–30', value: getAP('leftArm'), dr: getAP('leftArm') + tb },
            { key: 'rightArm', label: 'Right Arm', short: 'R.Arm', range: '11–20', value: getAP('rightArm'), dr: getAP('rightArm') + tb },
            { key: 'leftLeg', label: 'Left Leg', short: 'L.Leg', range: '86–00', value: getAP('leftLeg'), dr: getAP('leftLeg') + tb },
            { key: 'rightLeg', label: 'Right Leg', short: 'R.Leg', range: '71–85', value: getAP('rightLeg'), dr: getAP('rightLeg') + tb },
        ];
        context['hitLocations'] = hitLocations;

        // Keyed map for body silhouette template access
        const hitLocMap: Record<string, NPCHitLocation> = {};
        for (const loc of hitLocations) {
            hitLocMap[loc.key] = loc;
        }
        context['hitLocMap'] = hitLocMap;

        // Movement
        context['movement'] = sys.movement;

        // Combat summary (skill targets for action cards)
        context['combatSummary'] = {
            dodge: sys.getSkillTarget ? sys.getSkillTarget('dodge') : '—',
            parry: sys.getSkillTarget ? sys.getSkillTarget('parry') : '—',
        };

        // Gear items (non-weapon embedded items for inventory section)
        if (context['items'] === undefined) {
            context['items'] = Array.from(this.actor.items);
        }
        const items = context['items'] as NPCItemContext[];
        context['gearItems'] = items.filter((i) => !['weapon', 'talent', 'trait', 'psychicPower', 'specialAbility'].includes(i.type));

        // All items for inventory table (weapons, armour, gear, ammo, cybernetics, etc.)
        context['allItems'] = items.filter(
            (i) => !['talent', 'trait', 'psychicPower', 'specialAbility', 'condition', 'criticalInjury', 'mutation'].includes(i.type),
        );

        // Flag for weapon rows in actions grid (used for empty state)
        const embeddedWeapons = context['embeddedWeapons'] as NPCItemContext[] | undefined;
        context['combatWeaponRows'] = (embeddedWeapons?.length ?? 0) > 0;
    }

    /* -------------------------------------------- */

    /**
     * Prepare skills tab context.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    _prepareSkillsContext(context: Record<string, unknown>): void {
        const sys = context['system'] as NPCSystemContext;
        // Get trained skills list from data model
        context['trainedSkillsList'] = sys.trainedSkillsList ?? [];

        // Get favorite skills
        const favoriteSkillKeys = (this.actor.getFlag('wh40k-rpg', 'favoriteSkills') as string[] | undefined) ?? [];

        // Define all basic skills with their characteristics
        const allBasicSkills = [
            { key: 'acrobatics', name: 'Acrobatics', char: 'Ag', category: 'stealth' },
            { key: 'athletics', name: 'Athletics', char: 'S', category: 'combat' },
            { key: 'awareness', name: 'Awareness', char: 'Per', category: 'stealth' },
            { key: 'charm', name: 'Charm', char: 'Fel', category: 'social' },
            { key: 'command', name: 'Command', char: 'Fel', category: 'social' },
            { key: 'commerce', name: 'Commerce', char: 'Fel', category: 'social' },
            { key: 'deceive', name: 'Deceive', char: 'Fel', category: 'social' },
            { key: 'dodge', name: 'Dodge', char: 'Ag', category: 'combat' },
            { key: 'inquiry', name: 'Inquiry', char: 'Fel', category: 'social' },
            { key: 'interrogation', name: 'Interrogation', char: 'WP', category: 'social' },
            { key: 'intimidate', name: 'Intimidate', char: 'S', category: 'social' },
            { key: 'logic', name: 'Logic', char: 'Int', category: 'technical' },
            { key: 'medicae', name: 'Medicae', char: 'Int', category: 'technical' },
            { key: 'parry', name: 'Parry', char: 'WS', category: 'combat' },
            { key: 'psyniscience', name: 'Psyniscience', char: 'Per', category: 'technical' },
            { key: 'scrutiny', name: 'Scrutiny', char: 'Per', category: 'social' },
            { key: 'security', name: 'Security', char: 'Int', category: 'technical' },
            { key: 'sleightOfHand', name: 'Sleight of Hand', char: 'Ag', category: 'stealth' },
            { key: 'stealth', name: 'Stealth', char: 'Ag', category: 'stealth' },
            { key: 'survival', name: 'Survival', char: 'Per', category: 'stealth' },
            { key: 'techUse', name: 'Tech-Use', char: 'Int', category: 'technical' },
        ];

        // Characteristic key mapping
        const charKeyMap: Record<string, string> = {
            WS: 'weaponSkill',
            BS: 'ballisticSkill',
            S: 'strength',
            T: 'toughness',
            Ag: 'agility',
            Int: 'intelligence',
            Per: 'perception',
            WP: 'willpower',
            Fel: 'fellowship',
            Inf: 'influence',
        };

        // Build basic skills list with training states
        context['basicSkillsList'] = allBasicSkills.map((skill) => {
            const trainedData = sys.trainedSkills[skill.key];
            const charKey = charKeyMap[skill.char] ?? 'intelligence';
            const charData = sys.characteristics[charKey];
            const isTrained = trainedData !== undefined;

            // Calculate target
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics is Record-indexed
            let target = charData?.total ?? 0;
            if (trainedData !== undefined) {
                if (trainedData.plus20 === true) target += 20;
                else if (trainedData.plus10 === true) target += 10;
                target += trainedData.bonus ?? 0;
            } else {
                target = Math.floor(target / 2); // Untrained: half characteristic
            }

            // Proficiency cycle display data
            const plus10 = trainedData?.plus10 ?? false;
            const plus20 = trainedData?.plus20 ?? false;
            let levelClass = 'untrained';
            let levelTooltip = 'Untrained (click to train)';
            if (plus20) {
                levelClass = 'plus20';
                levelTooltip = '+20 Expert (click to remove)';
            } else if (plus10) {
                levelClass = 'plus10';
                levelTooltip = '+10 Experienced (click for +20)';
            } else if (isTrained) {
                levelClass = 'trained';
                levelTooltip = 'Trained (click for +10)';
            }

            return {
                ...skill,
                isTrained,
                trained: isTrained,
                plus10,
                plus20,
                target,
                levelClass,
                levelTooltip,
                isFavorite: favoriteSkillKeys.includes(skill.key),
            };
        });

        // Trained skill count for display
        const basicSkillsList = context['basicSkillsList'] as Array<{ isTrained: boolean; key: string }>;
        context['trainedSkillCount'] = basicSkillsList.filter((s) => s.isTrained).length;

        // Mark favorite status on trained skills list
        // eslint-disable-next-line no-restricted-syntax -- boundary: trainedSkillsList has untyped extra fields used by the Handlebars template.
        const trainedSkillsList = context['trainedSkillsList'] as Array<{ key: string } & Record<string, unknown>>;
        context['trainedSkillsList'] = trainedSkillsList.map((skill) => ({
            ...skill,
            isFavorite: favoriteSkillKeys.includes(skill.key),
        }));

        // Skills by category for quick-add
        const trainedKeys = Object.keys(sys.trainedSkills);

        context['combatSkills'] = allBasicSkills.filter((s) => s.category === 'combat').map((s) => ({ ...s, added: trainedKeys.includes(s.key) }));

        context['socialSkills'] = allBasicSkills.filter((s) => s.category === 'social').map((s) => ({ ...s, added: trainedKeys.includes(s.key) }));

        context['stealthSkills'] = allBasicSkills.filter((s) => s.category === 'stealth').map((s) => ({ ...s, added: trainedKeys.includes(s.key) }));

        context['technicalSkills'] = allBasicSkills.filter((s) => s.category === 'technical').map((s) => ({ ...s, added: trainedKeys.includes(s.key) }));
    }

    /* -------------------------------------------- */

    /**
     * Prepare abilities tab context.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context and return value are the mixin-erased sheet→template payload Record<string,unknown>.
    override _prepareAbilitiesContext(context: Record<string, unknown>, _options: Record<string, unknown> = {}): Record<string, unknown> {
        const sys = context['system'] as NPCSystemContext;

        // Ensure items array exists
        if (context['items'] === undefined) {
            context['items'] = Array.from(this.actor.items);
        }
        const items = context['items'] as NPCItemContext[];

        const pinnedIds = sys.pinnedAbilities ?? [];

        // Talents
        context['talents'] = items
            .filter((i) => i.type === 'talent')
            .map((t) => ({
                ...t,
                isPinned: pinnedIds.includes(t.id),
            }));

        // Traits
        context['traits'] = items
            .filter((i) => i.type === 'trait')
            .map((t) => ({
                ...t,
                isPinned: pinnedIds.includes(t.id),
            }));

        // Psychic powers
        context['psychicPowers'] = items.filter((i) => i.type === 'psychicPower');

        // Other abilities (special abilities from HTML field)
        context['hasSpecialAbilities'] = sys.specialAbilities !== undefined && sys.specialAbilities !== null && sys.specialAbilities !== '';

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare notes tab context.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context and return value are the mixin-erased sheet→template payload Record<string,unknown>.
    override _prepareNotesContext(context: Record<string, unknown>, _options: Record<string, unknown> = {}): Record<string, unknown> {
        const sys = context['system'] as NPCSystemContext;

        // Tags
        context['tags'] = sys.tags ?? [];

        // Source reference
        context['source'] = sys.source ?? '';

        // Template info
        context['templateUuid'] = sys.template ?? '';

        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle toggling horde mode.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #toggleHordeMode(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.npcActor.system.toggleHordeMode();
    }

    /* -------------------------------------------- */

    /**
     * Handle characteristic roll.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #rollCharacteristic(this: NPCSheet, event: Event, target: HTMLElement): void {
        event.preventDefault();
        const charKey = target.dataset['characteristic'];
        if (charKey === undefined || charKey === '') return;
        this.npcActor.rollCharacteristic(charKey);
    }

    /* -------------------------------------------- */

    /**
     * Handle weapon attack roll.
    /**
     * Reload an embedded weapon using the ReloadActionManager.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #reloadWeapon(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const closest = target.closest<HTMLElement>('[data-item-id]');
        const itemId = closest?.dataset['itemId'] ?? target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;
        const weapon = this.actor.items.get(itemId);
        if (!weapon) return;
        const { ReloadActionManager } = await import('../../actions/reload-action-manager.ts');
        const result = await ReloadActionManager.reloadWeapon(weapon, { skipValidation: (event as MouseEvent).shiftKey });
        if (result.success) {
            ui.notifications.info(result.message);
            await ReloadActionManager.sendReloadToChat(this.actor, weapon, result);
        } else {
            ui.notifications.warn(result.message);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle applying magnitude damage.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #applyMagnitudeDamage(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const amount = parseInt(target.dataset['amount'] ?? '1', 10);
        await this.npcActor.system.applyMagnitudeDamage(amount, 'Manual');
    }

    /* -------------------------------------------- */

    /**
     * Handle restoring magnitude.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #restoreMagnitude(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const amount = parseInt(target.dataset['amount'] ?? '1', 10);
        await this.npcActor.system.restoreMagnitude(amount, 'Manual');
    }

    /* -------------------------------------------- */

    /**
     * Handle skill roll.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollSkill(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const skillKey = target.dataset['skill'];
        if (skillKey === undefined || skillKey === '') return;
        await this.actor.rollSkill(skillKey);
    }

    /* -------------------------------------------- */

    /**
     * Handle initiative roll.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rollInitiative(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        // Roll initiative using the system's initiative formula
        const initChar = this.npcActor.system.initiative.characteristic;
        const char = this.npcActor.system.characteristics[initChar];

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics is Record-indexed
        const formula = `1d10 + ${char?.bonus ?? 0}`;
        const roll = new Roll(formula);
        await roll.evaluate();

        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            flavor: 'Initiative Roll',
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling armour mode.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #toggleArmourMode(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const currentMode = this.npcActor.system.armour.mode;
        const newMode = currentMode === 'simple' ? 'locations' : 'simple';
        await this.npcActor.system.switchArmourMode(newMode);
    }

    /* -------------------------------------------- */

    /**
     * Handle adding a trained skill.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #addTrainedSkill(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const skillKey = target.dataset['skill'];
        if (skillKey === undefined || skillKey === '') {
            // Show skill selection dialog
            const skills = [
                { key: 'acrobatics', name: 'Acrobatics' },
                { key: 'athletics', name: 'Athletics' },
                { key: 'awareness', name: 'Awareness' },
                { key: 'charm', name: 'Charm' },
                { key: 'command', name: 'Command' },
                { key: 'commerce', name: 'Commerce' },
                { key: 'deceive', name: 'Deceive' },
                { key: 'dodge', name: 'Dodge' },
                { key: 'inquiry', name: 'Inquiry' },
                { key: 'interrogation', name: 'Interrogation' },
                { key: 'intimidate', name: 'Intimidate' },
                { key: 'logic', name: 'Logic' },
                { key: 'medicae', name: 'Medicae' },
                { key: 'parry', name: 'Parry' },
                { key: 'psyniscience', name: 'Psyniscience' },
                { key: 'scrutiny', name: 'Scrutiny' },
                { key: 'security', name: 'Security' },
                { key: 'sleightOfHand', name: 'Sleight of Hand' },
                { key: 'stealth', name: 'Stealth' },
                { key: 'survival', name: 'Survival' },
                { key: 'techUse', name: 'Tech-Use' },
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- trainedSkills is a sparse Record; indexer is genuinely optional at runtime
            ].filter((s) => this.npcActor.system.trainedSkills[s.key] === undefined);

            const options = skills.map((s) => `<option value="${s.key}">${s.name}</option>`).join('');

            const content = `
        <form class="wh40k-skill-add-dialog">
          <div class="wh40k-form-group">
            <label class="wh40k-form-label">Skill</label>
            <select name="skill" class="wh40k-form-select">${options}</select>
          </div>
          <div class="wh40k-form-group">
            <label class="wh40k-form-label">Training Level</label>
            <select name="level" class="wh40k-form-select">
              <option value="trained">Trained</option>
              <option value="plus10">+10 (Experienced)</option>
              <option value="plus20">+20 (Expert)</option>
            </select>
          </div>
        </form>
      `;

            const dialog = new foundry.applications.api.DialogV2({
                window: { title: 'Add Trained Skill', icon: 'fa-solid fa-book-open' },
                content,
                classes: ['wh40k-rpg', 'wh40k-dialog-skill'],
                position: { width: 320 },
                buttons: [
                    {
                        action: 'add',
                        label: 'Add Skill',
                        icon: 'fa-solid fa-plus',
                        default: true,
                        callback: async (_event: Event, button: HTMLButtonElement, _dialog: foundry.applications.api.DialogV2) => {
                            const form = (button as HTMLButtonElement & { form: HTMLFormElement }).form;
                            const skill = (form.querySelector('[name="skill"]') as HTMLSelectElement).value;
                            const level = (form.querySelector('[name="level"]') as HTMLSelectElement).value;
                            await this.npcActor.system.addTrainedSkill(skill, null, level);
                        },
                    },
                    {
                        action: 'cancel',
                        label: 'Cancel',
                        icon: 'fa-solid fa-xmark',
                    },
                ],
            });
            void dialog.render(true);
            return;
        }
        await this.npcActor.system.addTrainedSkill(skillKey);
    }

    /* -------------------------------------------- */

    /**
     * Handle removing a trained skill.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #removeTrainedSkill(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const skillKey = target.dataset['skill'];
        if (skillKey === undefined || skillKey === '') return;
        await this.npcActor.system.removeSkill(skillKey);
    }

    /* -------------------------------------------- */

    /**
     * Handle setting skill training level.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #setSkillLevel(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const skillKey = target.dataset['skill'];
        const level = target.dataset['level'];
        if (skillKey === undefined || skillKey === '' || level === undefined || level === '') return;

        if (level === 'untrained') {
            await this.actor.update({ [`system.trainedSkills.-=${skillKey}`]: null });
            return;
        }

        const currentSkills: Record<string, NPCV2TrainedSkillData> = foundry.utils.deepClone(this.npcActor.system.trainedSkills);
        const prior = currentSkills[skillKey];

        currentSkills[skillKey] = NPCSheet.#resolveSkillLevelToggle(skillKey, level, prior);
        await this.actor.update({ 'system.trainedSkills': currentSkills });
    }

    /** Compute the next skill-entry state when the user clicks a level button. */
    static #resolveSkillLevelToggle(skillKey: string, level: string, prior: NPCV2TrainedSkillData | undefined): NPCV2TrainedSkillData {
        switch (level) {
            case 'trained':
                return buildSkillEntry(skillKey, 'trained', prior);
            case 'plus10':
                // Toggle +10: if already at +10 (and not +20), drop to trained; otherwise set to +10
                return prior?.plus10 === true && prior.plus20 !== true
                    ? buildSkillEntry(skillKey, 'trained', prior)
                    : buildSkillEntry(skillKey, 'plus10', prior);
            case 'plus20':
                // Toggle +20: if already at +20, drop to +10; otherwise set to +20
                return prior?.plus20 === true ? buildSkillEntry(skillKey, 'plus10', prior) : buildSkillEntry(skillKey, 'plus20', prior);
            default:
                return prior ?? { name: skillKey };
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle cycling skill training level (proficiency cycle).
     * Click cycles: Untrained → Trained → +10 → +20 → Untrained
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #cycleSkillLevel(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const skillKey = target.dataset['skill'];
        if (skillKey === undefined || skillKey === '') return;

        const currentSkills: Record<string, NPCV2TrainedSkillData> = foundry.utils.deepClone(this.npcActor.system.trainedSkills);
        const current = currentSkills[skillKey];

        // Determine current level and cycle to next
        // Untrained → Trained → +10 → +20 → Untrained
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: currentSkills is Record-indexed so entries may be absent at runtime
        if (current === undefined) {
            // Untrained → Trained
            currentSkills[skillKey] = buildSkillEntry(skillKey, 'trained', undefined);
            await this.actor.update({ 'system.trainedSkills': currentSkills });
        } else if (current.trained === true && current.plus10 !== true && current.plus20 !== true) {
            // Trained → +10
            currentSkills[skillKey] = buildSkillEntry(skillKey, 'plus10', current);
            await this.actor.update({ 'system.trainedSkills': currentSkills });
        } else if (current.plus10 === true && current.plus20 !== true) {
            // +10 → +20
            currentSkills[skillKey] = buildSkillEntry(skillKey, 'plus20', current);
            await this.actor.update({ 'system.trainedSkills': currentSkills });
        } else {
            // +20 → Untrained (remove)
            await this.actor.update({ [`system.trainedSkills.-=${skillKey}`]: null });
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle pinning an ability.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #pinAbility(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;
        await this.npcActor.system.pinAbility(itemId);
    }

    /* -------------------------------------------- */

    /**
     * Handle unpinning an ability.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #unpinAbility(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;
        await this.npcActor.system.unpinAbility(itemId);
    }

    /* -------------------------------------------- */

    /**
     * Handle editing the actor image.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #editImage(this: NPCSheet, event: Event, _target: HTMLElement): void {
        event.preventDefault();
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.ux.FilePicker is untyped in Foundry V14; constructor options shape is opaque Record.
        const FilePickerCtor = CONFIG.ux.FilePicker as unknown as new (options: Record<string, unknown>) => { browse(): Promise<void> };
        const fp = new FilePickerCtor({
            type: 'image',
            ...(this.actor.img !== null ? { current: this.actor.img } : {}),
            callback: (path: string) => {
                void this.actor.update({ img: path });
            },
        });
        void fp.browse();
    }

    /* -------------------------------------------- */

    /**
     * Handle setting up token configuration automatically.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #setupToken(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const npc = this.npcActor;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document update payload is Record<string,unknown>; token/prototypeToken fields are untyped.
        const updates: Record<string, unknown> = {};

        // Size-based dimensions
        const sizeMap: Record<number, number> = {
            1: 0.5, // Miniscule
            2: 0.75, // Tiny
            3: 1, // Small
            4: 1, // Average
            5: 2, // Hulking
            6: 2, // Enormous
            7: 3, // Massive
            8: 3, // Immense
            9: 4, // Gargantuan
            10: 4, // Colossal
        };
        const npcSize = npc.system.size;
        const tokenSize = sizeMap[npcSize] ?? 1;
        updates['width'] = tokenSize;
        updates['height'] = tokenSize;

        // Type-based vision/detection
        if (npc.system.type === 'daemon' || npc.system.type === 'xenos') {
            updates['sight'] = { enabled: true, range: 60, visionMode: 'darkvision' };
        } else {
            updates['sight'] = { enabled: true, range: 30 };
        }

        // Bars
        updates['bar1'] = { attribute: 'wounds' };
        if (npc.system.horde.enabled) {
            updates['bar2'] = { attribute: 'horde.magnitude' };
        }

        // Disposition - hostile by default
        updates['disposition'] = -1;

        // Display name mode
        updates['displayName'] = 20; // OWNER_HOVER

        await npc.update({ prototypeToken: updates });
        ui.notifications.info(`Token configured for ${npc.name}`);
    }

    /* -------------------------------------------- */

    /**
     * Handle duplicating the NPC.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #duplicateNPC(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.npcActor.duplicate();
        ui.notifications.info(`Created copy of ${this.actor.name}`);
    }

    /* -------------------------------------------- */

    /**
     * Handle scaling to threat level.
     * Opens the NPCThreatScalerDialog for full-featured scaling.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #scaleToThreat(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        await NPCThreatScalerDialog.scale(this.actor);
    }

    /* -------------------------------------------- */

    /**
     * Handle calculating encounter difficulty.
     * Opens the DifficultyCalculatorDialog for full party-based calculation.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #calculateDifficulty(this: NPCSheet, event: Event, _target: HTMLElement): void {
        event.preventDefault();
        const { DifficultyCalculatorDialog: DiffCalcDialog } = game.wh40k.npc;
        DiffCalcDialog.show(this.npcActor);
    }

    /* -------------------------------------------- */

    /**
     * Handle saving a combat preset from current NPC.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #saveCombatPreset(this: NPCSheet, event: Event, _target: HTMLElement): void {
        event.preventDefault();
        CombatPresetDialog.savePreset(this.npcActor);
    }

    /* -------------------------------------------- */

    /**
     * Handle loading a combat preset to current NPC.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #loadCombatPreset(this: NPCSheet, event: Event, _target: HTMLElement): void {
        event.preventDefault();
        CombatPresetDialog.loadPreset(this.npcActor);
    }

    /* -------------------------------------------- */

    /**
     * Handle deleting the NPC.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #deleteNPC(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: 'Delete NPC' },
            content: `<p>Are you sure you want to delete <strong>${this.actor.name}</strong>?</p>`,
            rejectClose: false,
        });

        if (confirmed) {
            await this.actor.delete();
            ui.notifications.info(`Deleted ${this.actor.name}`);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle exporting stat block.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #exportStatBlock(this: NPCSheet, event: Event, _target: HTMLElement): void {
        event.preventDefault();

        // Open the full exporter dialog
        StatBlockExporter.show(this.actor);
    }

    /* -------------------------------------------- */

    /**
     * Handle importing from a stat block.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #importStatBlock(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();

        await StatBlockParser.open({ actor: this.actor });
    }

    /* -------------------------------------------- */

    /**
     * Handle applying damage.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #applyDamage(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const amount = parseInt(target.dataset['amount'] ?? '1', 10);
        const location = target.dataset['location'] ?? 'body';
        await this.npcActor.applyDamage(amount, location);
    }

    /* -------------------------------------------- */

    /**
     * Handle healing wounds.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #healWounds(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const amount = parseInt(target.dataset['amount'] ?? '1', 10);
        await this.npcActor.healWounds(amount);
    }

    /* -------------------------------------------- */

    /**
     * Handle adding a tag.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #addTag(this: NPCSheet, event: Event, _target: HTMLElement): void {
        event.preventDefault();
        const content = `
      <form>
        <div class="form-group">
          <label>Tag Name</label>
          <input type="text" name="tag" placeholder="e.g., Boss, Minion, Ranged" />
        </div>
      </form>
    `;

        const dialog = new foundry.applications.api.DialogV2({
            window: { title: 'Add Tag' },
            content,
            buttons: [
                {
                    action: 'add',
                    label: 'Add',
                    default: true,
                    callback: async (_event: Event, button: HTMLButtonElement, _dialog: foundry.applications.api.DialogV2) => {
                        const { form } = button;
                        if (!form) return;
                        const tagInput = form.querySelector<HTMLInputElement>('[name="tag"]');
                        const tag = tagInput?.value.trim() ?? '';
                        if (tag !== '') {
                            const tags = [...this.npcActor.system.tags, tag];
                            await this.actor.update({ 'system.tags': tags });
                        }
                    },
                },
                {
                    action: 'cancel',
                    label: 'Cancel',
                },
            ],
        });
        void dialog.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Handle removing a tag.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #removeTag(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const tag = target.dataset['tag'];
        if (tag === undefined || tag === '') return;
        const tags = this.npcActor.system.tags.filter((t) => t !== tag);
        await this.actor.update({ 'system.tags': tags });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling edit section visibility.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #toggleEditSection(this: NPCSheet, event: Event, target: HTMLElement): void {
        event.preventDefault();
        const sectionId = target.dataset['target'];
        if (sectionId === undefined || sectionId === '') return;

        // Find the section to toggle
        const section = this.element.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
        if (!section) return;

        // Toggle hidden attribute
        section.hidden = !section.hidden;

        // Toggle button state
        target.classList.toggle('active');
    }

    /* -------------------------------------------- */

    /**
     * Toggle between PLAY and EDIT mode from the sidebar button.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #toggleEditMode(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const { MODES } = this.constructor as typeof NPCSheet;
        this._mode = this._mode === MODES.EDIT ? MODES.PLAY : MODES.EDIT;
        // Keep header slide-toggle in sync if present
        const headerToggle = this.element.querySelector<HTMLInputElement>('.window-header .mode-slider');
        if (headerToggle) headerToggle.checked = this._mode === MODES.EDIT;
        await this.submit();
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Toggle GM tools panel visibility in the sidebar.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #toggleGMTools(event: Event, target: HTMLElement): void {
        event.preventDefault();
        const wrapper = target.closest('.wh40k-gm-tools-wrapper');
        if (!wrapper) return;
        const tools = wrapper.querySelector<HTMLElement>('.wh40k-gm-tools');
        if (!tools) return;
        tools.hidden = !tools.hidden;
        wrapper.classList.toggle('open', !tools.hidden);
    }

    /* -------------------------------------------- */

    /**
     * Toggle ability description visibility (collapsible cards).
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static #toggleAbilityDesc(event: Event, target: HTMLElement): void {
        event.preventDefault();
        const card = target.closest('.wh40k-ability-card');
        if (!card) return;
        const desc = card.querySelector<HTMLElement>('.wh40k-ability-desc');
        if (!desc) return;
        desc.hidden = !desc.hidden;
        // Rotate chevron
        const icon = target.querySelector('i');
        if (icon) icon.classList.toggle('fa-rotate-180');
    }

    /**
     * Configure the actor as a barter or requisition source.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #setTransactionMode(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const mode = (target.dataset['mode'] as 'none' | 'barter' | 'requisition' | undefined) ?? 'none';
        await TransactionManager.setMode(this.npcActor, mode);
        ui.notifications.info(`${this.npcActor.name} source mode set to ${mode}.`);
        await this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling favorite skill.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #toggleFavoriteSkill(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const skillKey = target.dataset['skill'];
        if (skillKey === undefined || skillKey === '') return;

        const currentFavorites = (this.actor.getFlag('wh40k-rpg', 'favoriteSkills') as string[] | undefined) ?? [];
        const isFavorite = currentFavorites.includes(skillKey);

        if (isFavorite) {
            await this.actor.setFlag(
                'wh40k-rpg',
                'favoriteSkills',
                currentFavorites.filter((k) => k !== skillKey),
            );
        } else {
            await this.actor.setFlag('wh40k-rpg', 'favoriteSkills', [...currentFavorites, skillKey]);
        }

        await this.render({ parts: ['overview', 'skills'] });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling favorite talent.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #toggleFavoriteTalent(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;

        const currentFavorites = (this.actor.getFlag('wh40k-rpg', 'favoriteTalents') as string[] | undefined) ?? [];
        const isFavorite = currentFavorites.includes(itemId);

        if (isFavorite) {
            await this.actor.setFlag(
                'wh40k-rpg',
                'favoriteTalents',
                currentFavorites.filter((id) => id !== itemId),
            );
        } else {
            await this.actor.setFlag('wh40k-rpg', 'favoriteTalents', [...currentFavorites, itemId]);
        }

        await this.render({ parts: ['overview', 'abilities'] });
    }

    /* -------------------------------------------- */

    /**
     * Handle applying custom damage amount.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #applyCustomDamage(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const input = this.element.querySelector<HTMLInputElement>('[data-custom-damage]');
        const amount = parseInt(input?.value ?? '1', 10);
        await this.npcActor.applyDamage(amount, 'body');
    }

    /* -------------------------------------------- */

    /**
     * Handle healing custom wounds amount.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #healCustomWounds(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const input = this.element.querySelector<HTMLInputElement>('[data-custom-damage]');
        const amount = parseInt(input?.value ?? '1', 10);
        await this.npcActor.healWounds(amount);
    }

    /* -------------------------------------------- */

    /**
     * Handle rerolling initiative.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #rerollInitiative(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const actorId = this.actor.id;
        const combat = game.combat;
        if (actorId === null || !combat) return;
        const combatant = combat.combatants.find((c) => c.actorId === actorId);
        if (combatant?.id !== undefined) {
            await combat.rollInitiative([combatant.id]);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle adding to combat.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #addToCombat(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        if (!game.combat) {
            ui.notifications.warn(game.i18n.localize('WH40K.Warning.NoActiveCombatEncounter'));
            return;
        }
        // Prevent duplicate combatants
        const actorId = this.actor.id;
        if (actorId === null || this.npcActor.id === null) return;
        const existing = game.combat.combatants.find((c) => c.actorId === actorId);
        if (existing) {
            ui.notifications.info(`${this.actor.name} is already in combat.`);
            return;
        }
        await game.combat.createEmbeddedDocuments('Combatant', [
            {
                actorId: this.npcActor.id,
                tokenId: this.npcActor.token?.id,
            },
        ]);
    }

    /* -------------------------------------------- */

    /**
     * Handle removing from combat.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #removeFromCombat(this: NPCSheet, event: Event, _target: HTMLElement): Promise<void> {
        event.preventDefault();
        const actorId = this.actor.id;
        const combat = game.combat;
        if (actorId === null || !combat) return;
        const combatant = combat.combatants.find((c) => c.actorId === actorId);
        if (combatant?.id !== undefined) {
            await combat.deleteEmbeddedDocuments('Combatant', [combatant.id]);
        }
    }

    /* -------------------------------------------- */

    /**
     * Remove an embedded item from the actor.
     * @param {PointerEvent} event - The triggering event.
     * @param {HTMLElement} target - The target element.
     */
    static async #removeItem(this: NPCSheet, event: Event, target: HTMLElement): Promise<void> {
        event.preventDefault();
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;
        const item = this.actor.items.get(itemId);
        if (item) await item.delete();
    }
    /*  Overrides                                   */
    /* -------------------------------------------- */

    /**
     * Override to skip acolyte-specific preparations.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _context is the mixin-erased sheet→template payload Record<string,unknown>.
    override _prepareCharacteristicsHUD(_context: Record<string, unknown>): void {
        // NPCSheet uses its own characteristic preparation
        // Skip the parent implementation
    }

    /**
     * Build a PC-compatible skillLists structure from the 21 basic WH40K
     * skills plus the NPC's sparse `trainedSkills` map. The shared PC skills
     * panel (templates/actor/panel/skills-panel.hbs) reads
     * `skillLists.standardColumns` — a 2-array of [key, data] entries with
     * augmented display fields. We call the inherited `_augmentSkillData` to
     * attach those fields so every row renders with proper labels, training
     * indicators, current target, and tooltip data.
     * @override
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    override _prepareSkills(context: Record<string, unknown>): void {
        const actor = this.npcActor;
        const characteristics = actor.system.characteristics;
        const trainedSkills = actor.system.trainedSkills;

        // 21 basic WH40K skills with their governing characteristic short names.
        const BASIC_SKILLS: Array<[string, string, string]> = [
            ['acrobatics', 'Acrobatics', 'Ag'],
            ['athletics', 'Athletics', 'S'],
            ['awareness', 'Awareness', 'Per'],
            ['charm', 'Charm', 'Fel'],
            ['command', 'Command', 'Fel'],
            ['commerce', 'Commerce', 'Fel'],
            ['deceive', 'Deceive', 'Fel'],
            ['dodge', 'Dodge', 'Ag'],
            ['inquiry', 'Inquiry', 'Fel'],
            ['interrogation', 'Interrogation', 'WP'],
            ['intimidate', 'Intimidate', 'S'],
            ['logic', 'Logic', 'Int'],
            ['medicae', 'Medicae', 'Int'],
            ['parry', 'Parry', 'WS'],
            ['psyniscience', 'Psyniscience', 'Per'],
            ['scrutiny', 'Scrutiny', 'Per'],
            ['security', 'Security', 'Int'],
            ['sleightOfHand', 'Sleight of Hand', 'Ag'],
            ['stealth', 'Stealth', 'Ag'],
            ['survival', 'Survival', 'Per'],
            ['techUse', 'Tech-Use', 'Int'],
        ];

        const standard: Array<[string, SkillLike]> = BASIC_SKILLS.map((tuple) => {
            const key = tuple[0];
            const label = tuple[1];
            const charShort = tuple[2];
            const t = trainedSkills[key];
            /* eslint-disable @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guards: trainedSkills is Record-indexed so t may be absent at runtime */
            const skill: SkillLike = {
                label,
                characteristic: charShort,
                trained: !!t?.trained,
                plus10: !!t?.plus10,
                plus20: !!t?.plus20,
                bonus: t?.bonus ?? 0,
                advanced: false,
                hidden: false,
            };
            /* eslint-enable @typescript-eslint/no-unnecessary-condition */
            // Compute current target (½ char when untrained, full char + training bonus otherwise).
            const charKey = this._charShortToKey(charShort);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: characteristics is Record-indexed
            const charTotal = characteristics[charKey]?.total ?? 0;
            const level = skill.plus20 === true ? 3 : skill.plus10 === true ? 2 : skill.trained === true ? 1 : 0;
            const trainingBonus = level >= 3 ? 20 : level >= 2 ? 10 : 0;
            skill.current = level > 0 ? charTotal + trainingBonus + (skill.bonus ?? 0) : Math.floor(charTotal / 2) + (skill.bonus ?? 0);
            // Defer to the parent helper for trainingIndicators, breakdown, tooltipData, isGranted, etc.
            this._augmentSkillData(key, skill, characteristics);
            return [key, skill];
        });

        // Sort alphabetically by label — matches PC behavior.
        standard.sort((a, b) => (a[1].label ?? '').localeCompare(b[1].label ?? '', game.i18n.lang));

        const splitIndex = Math.ceil(standard.length / 2);
        const standardColumns = [standard.slice(0, splitIndex), standard.slice(splitIndex)];

        context['skillLists'] = {
            standard,
            trainedStandard: standard, // NPCs don't have the trained/untrained-advanced split
            advancedUntrained: [],
            specialist: [],
            standardColumns,
            hasSpecialistEntries: false,
        };
        // Back-compat for any older code paths that read these.
        context['skills'] = Object.fromEntries(standard);
        context['trainedSkillsList'] = standard.filter(([, d]) => (d.trainingLevel ?? 0) > 0);
    }

    /**
     * Override to skip acolyte-specific item preparation.
     * @param {object} context - The render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: context is the mixin-erased sheet→template payload Record<string,unknown>.
    override _prepareItems(context: Record<string, unknown>): void {
        // NPCSheet uses simplified item system
        const items = context['items'] as NPCItemContext[];
        context['talents'] = items.filter((i) => i.type === 'talent');
        context['traits'] = items.filter((i) => i.type === 'trait');
    }

    /* -------------------------------------------- */
}
