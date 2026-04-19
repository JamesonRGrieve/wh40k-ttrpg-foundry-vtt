/**
 * @file VehicleBaseData — shared data model for all Vehicles.
 *
 * Vehicles are shared across DH2/DH1/OW/BC/DW/RT. Each system's vehicle
 * variant extends this class with system-specific fields (OW's regimental
 * loadout, RT's explorator fittings, etc.).
 */

import VehicleData from '../vehicle.ts';

export default class VehicleBaseData extends VehicleData {}
