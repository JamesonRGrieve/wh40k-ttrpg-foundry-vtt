/**
 * Runs the Only War Comrade stories' `play` assertions under Vitest (#152): the
 * Comrade panel's states (Cohesion broken, fleeing, pinned, actions spent, the
 * state track), the Orders panel resolved against the Comrade, the Order card, the
 * Comrade card (a hit on doubles, a recovery Order, Insanity and Corruption) and
 * the damage card stating a hit that struck the Comrade instead.
 */
import { describe } from 'vitest';
import * as comradePanel from '../src/templates/actor/panel/ow-comrade-panel.stories.ts';
import * as ordersPanel from '../src/templates/actor/panel/ow-orders-panel.stories.ts';
import * as comradeChat from '../src/templates/chat/ow-comrade-chat.stories.ts';
import * as ordersChat from '../src/templates/chat/ow-orders-chat.stories.ts';
import * as comradeHitCard from '../stories/chat-cards/comrade-hit-damage-card.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('#152 Comrade panel stories', () => {
    storyPlayTests(comradePanel, ['CohesionBrokenByDistance', 'CohesionBrokenByBarrier', 'Pinned', 'Fleeing', 'ActionsSpent', 'MentalDamage']);
});

describe('#152 Orders panel stories', () => {
    storyPlayTests(ordersPanel, ['InCohesion', 'OutOfCohesion', 'ActionsSpent', 'WoundedCannotRun', 'Pinned', 'OutOfCombat']);
});

describe('#152 Order card stories', () => {
    storyPlayTests(ordersChat, ['RangedVolley', 'NoBenefit', 'NoActionsLeft', 'Pinned']);
});

describe('#152 Comrade card stories', () => {
    storyPlayTests(comradeChat, ['HitTransferWounds', 'Recovered', 'MentalSurvives', 'MentalDeath']);
});

describe('#152 damage card stories', () => {
    storyPlayTests(comradeHitCard, ['StrikesComrade', 'NoComradeHit']);
});
