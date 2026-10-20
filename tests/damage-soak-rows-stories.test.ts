/**
 * Runs the damage card soak-row story under Vitest (#248): the Effective line prints
 * each armour part, Penetration and TB as its own row.
 */
import { describe } from 'vitest';
import * as soakRowsCard from '../stories/chat-cards/damage-soak-rows.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('#248 damage card soak rows', () => {
    storyPlayTests(soakRowsCard, ['MachineOverWornArmour']);
});
