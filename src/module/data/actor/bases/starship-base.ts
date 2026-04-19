/**
 * @file StarshipBaseData — shared data model for all Starships.
 *
 * Only Rogue Trader ships starships today, but the base class exists here so
 * future expansion (Deathwatch strike cruisers, etc.) can extend it without
 * code duplication.
 */

import StarshipData from '../starship.ts';

export default class StarshipBaseData extends StarshipData {}
