/**
 * @file The schema sheets of the item types that had none of their own (#731).
 * Each is `defineSchemaItemSheet` over the type's layout in `schema-sheet-layouts.ts`.
 */
import defineSchemaItemSheet from './define-schema-item-sheet.ts';
import {
    BACKPACK_LAYOUT,
    NAVIGATOR_POWER_LAYOUT,
    OATH_LAYOUT,
    ORDER_LAYOUT,
    RITUAL_LAYOUT,
    SHIP_ROLE_LAYOUT,
    VEHICLE_TRAIT_LAYOUT,
    VEHICLE_UPGRADE_LAYOUT,
} from './schema-sheet-layouts.ts';

export const BackpackSheet = defineSchemaItemSheet(BACKPACK_LAYOUT, 'BackpackSheet');
export const NavigatorPowerSheet = defineSchemaItemSheet(NAVIGATOR_POWER_LAYOUT, 'NavigatorPowerSheet');
export const OathSheet = defineSchemaItemSheet(OATH_LAYOUT, 'OathSheet');
export const OrderSheet = defineSchemaItemSheet(ORDER_LAYOUT, 'OrderSheet');
export const RitualSheet = defineSchemaItemSheet(RITUAL_LAYOUT, 'RitualSheet');
export const ShipRoleSheet = defineSchemaItemSheet(SHIP_ROLE_LAYOUT, 'ShipRoleSheet');
export const VehicleTraitSheet = defineSchemaItemSheet(VEHICLE_TRAIT_LAYOUT, 'VehicleTraitSheet');
export const VehicleUpgradeSheet = defineSchemaItemSheet(VEHICLE_UPGRADE_LAYOUT, 'VehicleUpgradeSheet');
