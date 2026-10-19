/**
 * Runs the #120 / #665 grapple stories' `play` assertions under vitest, so the
 * panel's per-line, per-role options, the option card (its push and named item),
 * the Damage Opponent damage card and the push / item dialogs are checked on every
 * test run, not only in the Storybook browser suite.
 */
import { describe } from 'vitest';
import * as optionCard from '../src/templates/chat/grapple-opposed-chat.stories.ts';
import * as dialogs from '../src/templates/prompt/grapple-dialogs.stories.ts';
import * as panel from '../stories/actor-panels/grapple-controller-panel.stories.ts';
import * as damageCard from '../stories/chat-cards/grapple-damage-card.stories.ts';
import { storyPlayTests } from './lib/story-runner.ts';

describe('#120 grapple panel stories', () => {
    storyPlayTests(panel, ['Controller', 'Target', 'GameMaster', 'PerLineRoles']);
});

describe('#120 grapple option card stories', () => {
    storyPlayTests(optionCard, [
        'ControllerWins',
        'ThrownDownBonus',
        'TakeControlWins',
        'ContortionistEscape',
        'ReadyDeclared',
        'PushWon',
        'PushCapped',
        'PushLost',
        'UseItemNamed',
        'PerSystem',
    ]);
});

describe('#665 grapple damage card stories', () => {
    storyPlayTests(damageCard, ['DamageOpponentHit', 'DH1RolledLocation', 'NoFatigueRow', 'PerSystem']);
});

describe('#665 grapple dialog stories', () => {
    storyPlayTests(dialogs, ['PushDialog', 'PushLetGo', 'ItemDialog']);
});
