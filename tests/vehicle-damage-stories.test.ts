/**
 * Runs the vehicle-damage stories' `play` assertions under Vitest (content#28): the
 * damage card's facing / location / armour / force-field / Righteous Fury rows, the
 * assign card's Integrity and Reinforced-Armour-halved Critical rows, the area card's
 * sheltered crew and the assign dialog for a vehicle.
 */
import { describe } from 'vitest';
import * as vehicleDamage from '../stories/chat-cards/vehicle-damage-card.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('content#28 vehicle damage card stories', () => {
    storyPlayTests(vehicleDamage, [
        'FrontVersusRear',
        'TurretRedirectedToHull',
        'ForceFieldNullifies',
        'ForceFieldOverloads',
        'ForceFieldBypassed',
        'RighteousFuryOnTheChart',
        'DamageControlOffered',
        'DamageControlRerolled',
        'IntegrityLoss',
        'ReinforcedArmourHalvesCrit',
        'ChartMissing',
        'PerSystem',
        'CrewSheltered',
        'AssignPromptForAVehicle',
    ]);
});
