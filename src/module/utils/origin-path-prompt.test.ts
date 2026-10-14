/**
 * The "Origin Path Incomplete" prompt gate (#541): an unbuilt character is
 * prompted; an NPC, a built character, a dismissed prompt and an authored-build
 * pregen are not. The pregen is recognised by its `sheetSource` flag alone.
 */

import { describe, expect, it } from 'vitest';
import {
    AUTHORED_BUILD_SHEET_SOURCE,
    isAuthoredBuildSheet,
    type OriginPromptFacts,
    originPathPromptContent,
    shouldPromptOriginPath,
} from './origin-path-prompt.ts';

function facts(overrides: Partial<OriginPromptFacts> = {}): OriginPromptFacts {
    return {
        isOwner: true,
        promptEnabled: true,
        actorType: 'dh2-character',
        originPath: { homeWorld: '', background: '', role: '' },
        dismissed: false,
        sheetSource: undefined,
        ...overrides,
    };
}

describe('shouldPromptOriginPath', () => {
    it('prompts the owner of a genuinely unbuilt character', () => {
        expect(shouldPromptOriginPath(facts())).toBe(true);
    });

    it('prompts a partly-built character', () => {
        expect(shouldPromptOriginPath(facts({ originPath: { homeWorld: 'Hive World', background: '', role: '' } }))).toBe(true);
    });

    it('never prompts an authored-build pregen, however unbuilt its origin path', () => {
        expect(shouldPromptOriginPath(facts({ sheetSource: AUTHORED_BUILD_SHEET_SOURCE }))).toBe(false);
    });

    it('keys on the marker, not the name: any other sheet source still prompts', () => {
        expect(shouldPromptOriginPath(facts({ sheetSource: 'compendium' }))).toBe(true);
    });

    it('never prompts an NPC of any line', () => {
        for (const type of ['dh2-npc', 'dh1-npc', 'bc-npc', 'dw-npc', 'ow-npc', 'rt-npc']) {
            expect(shouldPromptOriginPath(facts({ actorType: type }))).toBe(false);
        }
    });

    it('does not prompt a character whose three core steps are set', () => {
        expect(shouldPromptOriginPath(facts({ originPath: { homeWorld: 'Hive World', background: 'Adeptus Arbites', role: 'Warrior' } }))).toBe(false);
    });

    it('respects "don’t show again", a non-owner, and the world setting', () => {
        expect(shouldPromptOriginPath(facts({ dismissed: true }))).toBe(false);
        expect(shouldPromptOriginPath(facts({ isOwner: false }))).toBe(false);
        expect(shouldPromptOriginPath(facts({ promptEnabled: false }))).toBe(false);
    });

    it('treats a non-string stored step as unset', () => {
        expect(shouldPromptOriginPath(facts({ originPath: { homeWorld: 'Hive World', background: 'Adeptus Arbites', role: null } }))).toBe(true);
    });
});

describe('isAuthoredBuildSheet', () => {
    it('is true only for the authored-build marker', () => {
        expect(isAuthoredBuildSheet('authored-build')).toBe(true);
        expect(isAuthoredBuildSheet(undefined)).toBe(false);
        expect(isAuthoredBuildSheet('Authored-Build')).toBe(false);
    });
});

describe('originPathPromptContent', () => {
    it('carries the message and a named "don’t show again" checkbox', () => {
        const host = document.createElement('div');
        host.innerHTML = originPathPromptContent('Build it now?', 'Don’t show again');
        expect(host.querySelector('p')?.textContent).toBe('Build it now?');
        expect(host.querySelector<HTMLInputElement>('input[name="dontShowAgain"]')?.type).toBe('checkbox');
        expect(host.textContent).toContain('Don’t show again');
    });
});
