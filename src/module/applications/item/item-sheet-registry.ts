/**
 * The item sheet each item type opens, registered on `init` by hooks-manager.
 *
 * A table, not inline calls, so a test can check that no item type with fields of
 * its own is left on the BaseItemSheet fallback (#731): under V14 the registered
 * sheets reach `CONFIG.Item.sheetClasses` only once the game is set up.
 */
import {
    AmmoSheet,
    ArmourModSheet,
    ArmourSheet,
    AttackSpecialSheet,
    BackpackSheet,
    BaseItemSheet,
    ConditionSheet,
    CriticalInjurySheet,
    CyberneticSheet,
    DarkPactSheet,
    EndeavourSheet,
    ForceFieldSheet,
    GearSheet,
    JournalEntryItemSheet,
    LeadSheet,
    LocationSheet,
    MalignancySheet,
    MedalSheet,
    MentalDisorderSheet,
    MutationSheet,
    NPCTemplateSheet,
    NavigatorPowerSheet,
    OathSheet,
    OrderSheet,
    OriginPathSheet,
    PeerEnemySheet,
    PsychicPowerSheet,
    RitualSheet,
    ShipComponentSheet,
    ShipRoleSheet,
    ShipUpgradeSheet,
    ShipWeaponSheet,
    SkillSheet,
    SpecialAbilitySheet,
    StorageLocationSheet,
    TalentSheet,
    TraitSheet,
    VehicleTraitSheet,
    VehicleUpgradeSheet,
    WeaponModSheet,
    WeaponQualitySheet,
    WeaponSheet,
} from './_module.ts';

/** One registration: the sheet, the item types it is the default for (none: every type), and its label key. */
export interface ItemSheetRegistration {
    readonly sheet: Parameters<typeof foundry.applications.apps.DocumentSheetConfig.registerSheet>[2];
    readonly types?: string[];
    readonly label: string;
}

export const ITEM_SHEETS: readonly ItemSheetRegistration[] = [
    { sheet: BaseItemSheet, label: 'WH40K.Sheet.Item' }, // default for unspecified types
    { sheet: WeaponSheet, types: ['weapon'], label: 'WH40K.Sheet.Weapon' },
    { sheet: ArmourSheet, types: ['armour'], label: 'WH40K.Sheet.Armour' },
    { sheet: TalentSheet, types: ['talent'], label: 'WH40K.Sheet.Talent' },
    { sheet: TraitSheet, types: ['trait'], label: 'WH40K.Sheet.Trait' },
    { sheet: GearSheet, types: ['gear', 'consumable', 'drug', 'tool', 'miscellaneous'], label: 'WH40K.Sheet.Gear' },
    { sheet: AmmoSheet, types: ['ammunition'], label: 'WH40K.Sheet.Ammunition' },
    { sheet: PsychicPowerSheet, types: ['psychicPower'], label: 'WH40K.Sheet.PsychicPower' },
    { sheet: SkillSheet, types: ['skill'], label: 'WH40K.Sheet.Skill' },
    { sheet: CyberneticSheet, types: ['cybernetic'], label: 'WH40K.Sheet.Cybernetic' },
    { sheet: ForceFieldSheet, types: ['forceField'], label: 'WH40K.Sheet.ForceField' },
    { sheet: CriticalInjurySheet, types: ['criticalInjury'], label: 'WH40K.Sheet.CriticalInjury' },
    { sheet: DarkPactSheet, types: ['darkPact'], label: 'WH40K.Sheet.DarkPact' },
    { sheet: MedalSheet, types: ['medal'], label: 'WH40K.Sheet.Medal' },
    { sheet: ConditionSheet, types: ['condition'], label: 'WH40K.Sheet.Condition' },
    // Content-block sheets (freeform-gated)
    { sheet: SpecialAbilitySheet, types: ['specialAbility'], label: 'WH40K.Sheet.SpecialAbility' },
    { sheet: MalignancySheet, types: ['malignancy'], label: 'WH40K.Sheet.Malignancy' },
    { sheet: MutationSheet, types: ['mutation'], label: 'WH40K.Sheet.Mutation' },
    { sheet: MentalDisorderSheet, types: ['mentalDisorder'], label: 'WH40K.Sheet.MentalDisorder' },
    { sheet: StorageLocationSheet, types: ['storageLocation'], label: 'WH40K.Sheet.StorageLocation' },
    { sheet: LocationSheet, types: ['location'], label: 'WH40K.Sheet.Location' },
    { sheet: PeerEnemySheet, types: ['peer', 'enemy'], label: 'WH40K.Sheet.PeerEnemy' },
    { sheet: JournalEntryItemSheet, types: ['journalEntry'], label: 'WH40K.Sheet.JournalEntry' },
    { sheet: EndeavourSheet, types: ['endeavour'], label: 'WH40K.Sheet.Endeavour' },
    { sheet: LeadSheet, types: ['lead'], label: 'WH40K.Sheet.Lead' },
    { sheet: OriginPathSheet, types: ['originPath'], label: 'WH40K.Sheet.OriginPath' },
    { sheet: WeaponModSheet, types: ['weaponModification'], label: 'WH40K.Sheet.WeaponModification' },
    { sheet: ArmourModSheet, types: ['armourModification'], label: 'WH40K.Sheet.ArmourModification' },
    { sheet: AttackSpecialSheet, types: ['attackSpecial'], label: 'WH40K.Sheet.AttackSpecial' },
    { sheet: WeaponQualitySheet, types: ['weaponQuality'], label: 'WH40K.Sheet.WeaponQuality' },
    { sheet: ShipComponentSheet, types: ['shipComponent'], label: 'WH40K.Sheet.ShipComponent' },
    { sheet: ShipWeaponSheet, types: ['shipWeapon'], label: 'WH40K.Sheet.ShipWeapon' },
    { sheet: ShipUpgradeSheet, types: ['shipUpgrade'], label: 'WH40K.Sheet.ShipUpgrade' },
    { sheet: BackpackSheet, types: ['backpack'], label: 'WH40K.Sheet.Backpack' },
    { sheet: NavigatorPowerSheet, types: ['navigatorPower'], label: 'WH40K.Sheet.NavigatorPower' },
    { sheet: OathSheet, types: ['oath'], label: 'WH40K.Sheet.Oath' },
    { sheet: OrderSheet, types: ['order'], label: 'WH40K.Sheet.Order' },
    { sheet: RitualSheet, types: ['ritual'], label: 'WH40K.Sheet.Ritual' },
    { sheet: ShipRoleSheet, types: ['shipRole'], label: 'WH40K.Sheet.ShipRole' },
    { sheet: VehicleTraitSheet, types: ['vehicleTrait'], label: 'WH40K.Sheet.VehicleTrait' },
    { sheet: VehicleUpgradeSheet, types: ['vehicleUpgrade'], label: 'WH40K.Sheet.VehicleUpgrade' },
    { sheet: NPCTemplateSheet, types: ['npcTemplate'], label: 'WH40K.Sheet.NPCTemplate' },
];
