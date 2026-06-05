import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomEnrichers } from './enrichers.ts';

/**
 * DOM-shape guard for the #300 enricher-prologue/span extraction. The enrich
 * functions are module-internal, so we capture them the way Foundry does — via
 * the `CONFIG.TextEditor.enrichers.push(...)` registration — then invoke each
 * against a stub actor and snapshot the produced element's `outerHTML`. The
 * refactor must keep this byte-identical (classes, dataset, tooltip JSON,
 * innerHTML, title).
 */

type EnricherFn = (match: RegExpMatchArray, options?: { relativeTo?: object }) => Promise<HTMLElement>;

interface Registered {
    pattern: RegExp;
    enricher: EnricherFn;
}

const STUB_ACTOR = {
    documentName: 'Actor',
    uuid: 'Actor.testactor0001',
    system: {
        characteristics: {
            weaponSkill: { label: 'Weapon Skill', total: 35, bonus: 3, base: 30, advance: 5, modifier: 0, unnatural: 0 },
        },
        skills: {
            dodge: { label: 'Dodge', current: 40, characteristic: 'agility', trained: true, plus10: false, plus20: false, bonus: 0 },
            commonLore: {
                label: 'Common Lore',
                current: 30,
                characteristic: 'intelligence',
                trained: true,
                plus10: false,
                plus20: false,
                bonus: 0,
                entries: [{ name: 'Imperium', current: 35, trained: true, plus10: false, plus20: false, bonus: 0 }],
            },
        },
        armour: {
            head: { total: 4, toughnessBonus: 3, value: 1, traitBonus: 0 },
            body: { total: 5, toughnessBonus: 3, value: 2, traitBonus: 0 },
            leftArm: { total: 4, toughnessBonus: 3, value: 1, traitBonus: 0 },
            rightArm: { total: 4, toughnessBonus: 3, value: 1, traitBonus: 0 },
            leftLeg: { total: 3, toughnessBonus: 3, value: 0, traitBonus: 0 },
            rightLeg: { total: 3, toughnessBonus: 3, value: 0, traitBonus: 0 },
        },
    },
};

function registered(): Registered[] {
    const enrichers: Registered[] = [];
    vi.stubGlobal('CONFIG', { TextEditor: { enrichers } });
    registerCustomEnrichers();
    return enrichers;
}

/** Run the enricher whose pattern matches `text`, return its element's outerHTML. */
async function enrich(text: string, options?: { relativeTo?: object }): Promise<string> {
    const hit = registered().find(({ pattern }) => {
        pattern.lastIndex = 0;
        return pattern.test(text);
    });
    if (hit === undefined) throw new Error(`no enricher matched: ${text}`);
    hit.pattern.lastIndex = 0;
    const match = hit.pattern.exec(text);
    if (match === null) throw new Error(`no enricher matched: ${text}`);
    const el = await hit.enricher(match, options);
    return el.outerHTML;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('enrichers — DOM-shape guard (#300)', () => {
    it('registers four enrichers in order', () => {
        expect(registered()).toHaveLength(4);
    });

    it('characteristic (short code) → click-to-roll span', async () => {
        expect(await enrich('[[/characteristic ws]]', { relativeTo: STUB_ACTOR })).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-characteristic" data-enricher-type="characteristic" data-enricher-config="weaponSkill" data-actor-uuid="Actor.testactor0001" data-tooltip="{&quot;label&quot;:&quot;Weapon Skill&quot;,&quot;total&quot;:35,&quot;bonus&quot;:3,&quot;base&quot;:30,&quot;advance&quot;:5,&quot;modifier&quot;:0,&quot;unnatural&quot;:0}" title="Click to roll Weapon Skill"><i class="fas fa-dice-d20"></i> Weapon Skill (35)</span>"`,
        );
    });

    it('characteristic with explicit label', async () => {
        expect(await enrich('[[/characteristic weaponSkill]]{WS check}', { relativeTo: STUB_ACTOR })).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-error" title="Unknown characteristic: weaponskill">[[/characteristic weaponSkill]]{WS check}</span>"`,
        );
    });

    it('characteristic with no actor context → error span', async () => {
        expect(await enrich('[[/characteristic ws]]')).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-error" title="No actor context">[[/characteristic ws]]</span>"`,
        );
    });

    it('skill (plain) → click-to-roll span', async () => {
        expect(await enrich('[[/skill dodge]]', { relativeTo: STUB_ACTOR })).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-skill" data-enricher-type="skill" data-enricher-config="dodge" data-actor-uuid="Actor.testactor0001" data-tooltip="{&quot;label&quot;:&quot;Dodge&quot;,&quot;current&quot;:40,&quot;characteristic&quot;:&quot;agility&quot;,&quot;trained&quot;:true,&quot;plus10&quot;:false,&quot;plus20&quot;:false,&quot;bonus&quot;:0}" title="Click to roll Dodge"><i class="fas fa-dice-d100"></i> Dodge (40%)</span>"`,
        );
    });

    it('skill (specialist) → click-to-roll span', async () => {
        expect(await enrich('[[/skill commonLore:imperium]]', { relativeTo: STUB_ACTOR })).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-error" title="Unknown skill: commonlore">[[/skill commonLore:imperium]]</span>"`,
        );
    });

    it('skill unknown → error span', async () => {
        expect(await enrich('[[/skill nonsense]]', { relativeTo: STUB_ACTOR })).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-error" title="Unknown skill: nonsense">[[/skill nonsense]]</span>"`,
        );
    });

    it('modifier (positive) → no-actor span', async () => {
        expect(await enrich('[[/modifier strength +10]]')).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-modifier positive" data-enricher-type="modifier" data-enricher-config="strength +10"><i class="fas fa-arrow-up"></i> strength +10</span>"`,
        );
    });

    it('modifier (negative) → no-actor span', async () => {
        expect(await enrich('[[/modifier agility -5]]')).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-modifier negative" data-enricher-type="modifier" data-enricher-config="agility -5"><i class="fas fa-arrow-down"></i> agility -5</span>"`,
        );
    });

    it('armor (all) → range span', async () => {
        expect(await enrich('[[/armor all]]', { relativeTo: STUB_ACTOR })).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-armor" data-enricher-type="armor" data-enricher-config="all" data-actor-uuid="Actor.testactor0001" data-tooltip="{&quot;head&quot;:{&quot;total&quot;:4,&quot;toughnessBonus&quot;:3,&quot;value&quot;:1},&quot;body&quot;:{&quot;total&quot;:5,&quot;toughnessBonus&quot;:3,&quot;value&quot;:2},&quot;leftArm&quot;:{&quot;total&quot;:4,&quot;toughnessBonus&quot;:3,&quot;value&quot;:1},&quot;rightArm&quot;:{&quot;total&quot;:4,&quot;toughnessBonus&quot;:3,&quot;value&quot;:1},&quot;leftLeg&quot;:{&quot;total&quot;:3,&quot;toughnessBonus&quot;:3,&quot;value&quot;:0},&quot;rightLeg&quot;:{&quot;total&quot;:3,&quot;toughnessBonus&quot;:3,&quot;value&quot;:0}}"><i class="fas fa-shield-alt"></i> 3-5 AP</span>"`,
        );
    });

    it('armor (single location) → AP span', async () => {
        expect(await enrich('[[/armor head]]', { relativeTo: STUB_ACTOR })).toMatchInlineSnapshot(
            `"<span class="wh40k-enricher wh40k-enricher-armor" data-enricher-type="armor" data-enricher-config="head" data-actor-uuid="Actor.testactor0001" data-tooltip="{&quot;location&quot;:&quot;head&quot;,&quot;total&quot;:4,&quot;toughnessBonus&quot;:3,&quot;traitBonus&quot;:0,&quot;value&quot;:1}"><i class="fas fa-shield-alt"></i> 4 AP</span>"`,
        );
    });
});
