import { ConventionalCraftData } from './vehicle.ts';

/**
 * Data model for land-going conventional vehicles (tanks, walkers, bikes,
 * ground transports). The default conventional craft — it adds no fields
 * beyond `ConventionalCraftData` and inherits the base `locomotion` default
 * (`wheeled`); the land craft class is the actor `type` (`*-terracraft`).
 */
export default class TerracraftData extends ConventionalCraftData {}
