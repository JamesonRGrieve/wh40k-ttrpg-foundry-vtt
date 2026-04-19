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

// Document classes
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KActiveEffect } from '../documents/active-effect.ts';
import type { ChatMessageWH40K } from '../documents/chat-message.ts';
import type { TokenDocumentWH40K } from '../documents/token.ts';
import type { WH40KItem } from '../documents/item.ts';

// Actor data models (concrete per-system classes)
import type {
    DH2CharacterData,
    DH2NPCData,
    DH2VehicleData,
    DH1CharacterData,
    DH1NPCData,
    DH1VehicleData,
    RTCharacterData,
    RTNPCData,
    RTVehicleData,
    RTStarshipData,
    BCCharacterData,
    BCNPCData,
    BCVehicleData,
    OWCharacterData,
    OWNPCData,
    OWVehicleData,
    DWCharacterData,
    DWNPCData,
    DWVehicleData,
} from '../data/actor/_module.ts';

// Item data models
import type {
    WeaponData,
    ArmourData,
    AmmunitionData,
    GearData,
    CyberneticData,
    ForceFieldData,
    BackpackData,
    StorageLocationData,
    TalentData,
    TraitData,
    SkillData,
    OriginPathData,
    ConditionData,
    AptitudeData,
    PeerEnemyData,
    CombatActionData,
    PsychicPowerData,
    NavigatorPowerData,
    RitualData,
    ShipComponentData,
    ShipWeaponData,
    ShipUpgradeData,
    ShipRoleData,
    OrderData,
    VehicleTraitData,
    VehicleUpgradeData,
    WeaponModificationData,
    ArmourModificationData,
    WeaponQualityData,
    AttackSpecialData,
    SpecialAbilityData,
    CriticalInjuryData,
    MutationData,
    MalignancyData,
    MentalDisorderData,
    JournalEntryItemData,
    NPCTemplateData,
} from '../data/item/_module.ts';

declare module 'fvtt-types/configuration' {
    interface DocumentClassConfig {
        // WH40KActorProxy is a Proxy around WH40KBaseActor — its type is typeof WH40KBaseActor
        Actor: typeof WH40KBaseActor;
        Item: typeof WH40KItem;
        ActiveEffect: typeof WH40KActiveEffect;
        ChatMessage: typeof ChatMessageWH40K;
        TokenDocument: typeof TokenDocumentWH40K;
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
            combatAction: typeof CombatActionData;
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
