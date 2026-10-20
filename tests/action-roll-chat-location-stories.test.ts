/**
 * Runs the attack card's hit-location stories under Vitest (#682): a vehicle target
 * names its vehicle location, a creature target its hit location.
 */
import { describe } from 'vitest';
import * as actionRollChat from '../src/templates/chat/action-roll-chat.stories.ts';
import { namedStoryPlayTests } from './lib/story-runner.ts';

describe('#682 attack card hit-location stories', () => {
    namedStoryPlayTests(actionRollChat, ['VehicleTargetLocation', 'CreatureTargetLocation']);
});
