/**
 * Module augmentation for fvtt-types.
 *
 * Registers the system's document classes and data model subtypes with
 * the fvtt-types configuration interfaces so that TypeScript can resolve
 * Actor.system / Item.system to the correct DataModel type.
 *
 * This file must be kept in sync with the runtime registrations in
 * hooks-manager.ts (CONFIG.Actor.documentClass, CONFIG.Item.documentClass,
 * CONFIG.Actor.dataModels, CONFIG.Item.dataModels).
 */

// Actor data models (concrete per-system classes)
import type {
    BCCharacterData,
    BCNPCData,
    BCVehicleData,
    DH1CharacterData,
    DH1NPCData,
    DH1VehicleData,
    DH2CharacterData,
    DH2NPCData,
    DH2VehicleData,
    DWCharacterData,
    DWNPCData,
    DWVehicleData,
    OWCharacterData,
    OWNPCData,
    OWVehicleData,
    RTCharacterData,
    RTNPCData,
    RTStarshipData,
    RTVehicleData,
} from '../data/actor/_module.ts';
// Item data models
import type {
    AmmunitionData,
    AptitudeData,
    ArmourData,
    ArmourModificationData,
    AttackSpecialData,
    BackpackData,
    ConditionData,
    CriticalInjuryData,
    CyberneticData,
    ForceFieldData,
    GearData,
    JournalEntryItemData,
    MalignancyData,
    MentalDisorderData,
    MutationData,
    NavigatorPowerData,
    NPCTemplateData,
    OrderData,
    OriginPathData,
    PeerEnemyData,
    PsychicPowerData,
    RitualData,
    ShipComponentData,
    ShipRoleData,
    ShipUpgradeData,
    ShipWeaponData,
    SkillData,
    SpecialAbilityData,
    StorageLocationData,
    TalentData,
    TraitData,
    VehicleTraitData,
    VehicleUpgradeData,
    WeaponData,
    WeaponModificationData,
    WeaponQualityData,
} from '../data/item/_module.ts';
// Document classes
import type { WH40KActiveEffect } from '../documents/active-effect.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { ChatMessageWH40K } from '../documents/chat-message.ts';
import type { WH40KItem } from '../documents/item.ts';
import type { TokenDocumentWH40K } from '../documents/token.ts';

declare module 'fvtt-types/configuration' {
    interface SystemNameConfig {
        name: 'wh40k-rpg';
    }

    interface SettingConfig {
        [key: `wh40k-rpg.${string}`]: foundry.helpers.ClientSettings.Type;
    }

    /* eslint-disable no-restricted-syntax -- boundary: Foundry FlagConfig requires Record<string,unknown> shapes per fvtt-types interface */
    interface FlagConfig {
        Actor: {
            'wh40k-rpg': Record<string, unknown>;
            'rt'?: Record<string, unknown>;
        };
        Item: {
            'wh40k-rpg': Record<string, unknown>;
            'rt'?: Record<string, unknown>;
        };
        ChatMessage: {
            'wh40k-rpg': Record<string, unknown>;
        };
        User: {
            'wh40k-rpg': Record<string, unknown>;
        };
    }
    /* eslint-enable no-restricted-syntax */

    interface DocumentClassConfig {
        // WH40KActorProxy is a Proxy around WH40KBaseActor — its type is typeof WH40KBaseActor
        Actor: typeof WH40KBaseActor;
        Item: typeof WH40KItem;
        ActiveEffect: typeof WH40KActiveEffect;
        ChatMessage: typeof ChatMessageWH40K;
        TokenDocument: typeof TokenDocumentWH40K;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- type param required by fvtt-types parent interface; body maps to single document type
    interface ConfiguredActor<SubType extends Actor.SubType> {
        document: WH40KBaseActor;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- type param required by fvtt-types parent interface; body maps to single document type
    interface ConfiguredItem<SubType extends Item.SubType> {
        document: WH40KItem;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- type param required by fvtt-types parent interface; body maps to single document type
    interface ConfiguredActiveEffect<SubType extends ActiveEffect.SubType> {
        document: WH40KActiveEffect;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- type param required by fvtt-types parent interface; body maps to single document type
    interface ConfiguredChatMessage<SubType extends ChatMessage.SubType> {
        document: ChatMessageWH40K;
    }

    interface DataModelConfig {
        Actor: {
            'dh2-character': typeof DH2CharacterData;
            'dh2-npc': typeof DH2NPCData;
            'dh2-vehicle': typeof DH2VehicleData;
            'dh1-character': typeof DH1CharacterData;
            'dh1-npc': typeof DH1NPCData;
            'dh1-vehicle': typeof DH1VehicleData;
            'rt-character': typeof RTCharacterData;
            'rt-npc': typeof RTNPCData;
            'rt-vehicle': typeof RTVehicleData;
            'rt-starship': typeof RTStarshipData;
            'bc-character': typeof BCCharacterData;
            'bc-npc': typeof BCNPCData;
            'bc-vehicle': typeof BCVehicleData;
            'ow-character': typeof OWCharacterData;
            'ow-npc': typeof OWNPCData;
            'ow-vehicle': typeof OWVehicleData;
            'dw-character': typeof DWCharacterData;
            'dw-npc': typeof DWNPCData;
            'dw-vehicle': typeof DWVehicleData;
        };
        Item: {
            weapon: typeof WeaponData;
            armour: typeof ArmourData;
            ammunition: typeof AmmunitionData;
            gear: typeof GearData;
            consumable: typeof GearData;
            tool: typeof GearData;
            drug: typeof GearData;
            cybernetic: typeof CyberneticData;
            forceField: typeof ForceFieldData;
            backpack: typeof BackpackData;
            storageLocation: typeof StorageLocationData;
            talent: typeof TalentData;
            trait: typeof TraitData;
            skill: typeof SkillData;
            originPath: typeof OriginPathData;
            aptitude: typeof AptitudeData;
            peer: typeof PeerEnemyData;
            enemy: typeof PeerEnemyData;
            condition: typeof ConditionData;
            psychicPower: typeof PsychicPowerData;
            navigatorPower: typeof NavigatorPowerData;
            ritual: typeof RitualData;
            shipComponent: typeof ShipComponentData;
            shipWeapon: typeof ShipWeaponData;
            shipUpgrade: typeof ShipUpgradeData;
            shipRole: typeof ShipRoleData;
            order: typeof OrderData;
            vehicleTrait: typeof VehicleTraitData;
            vehicleUpgrade: typeof VehicleUpgradeData;
            weaponModification: typeof WeaponModificationData;
            armourModification: typeof ArmourModificationData;
            weaponQuality: typeof WeaponQualityData;
            attackSpecial: typeof AttackSpecialData;
            specialAbility: typeof SpecialAbilityData;
            criticalInjury: typeof CriticalInjuryData;
            mutation: typeof MutationData;
            malignancy: typeof MalignancyData;
            mentalDisorder: typeof MentalDisorderData;
            journalEntry: typeof JournalEntryItemData;
            npcTemplate: typeof NPCTemplateData;
        };
    }
}
