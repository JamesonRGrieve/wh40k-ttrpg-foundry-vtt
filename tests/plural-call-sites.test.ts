/**
 * Regression (#663, after #414): player-facing strings hedged their plural with
 * "(s)" ("Restored 1 wound(s)."). Each is now a langpack group with a `One` and an
 * `Other` form, and its call site picks the form through `pluralKey`.
 *
 * - No `en.json` value may contain "(s)".
 * - Every plural group's two forms carry the same placeholders.
 * - For each call site, a count of 1 reads the `One` form and 2 the `Other` form,
 *   and the call site asks `pluralKey` for that group (the sheets, dialogs and
 *   chat templates can't load under happy-dom, so the call is checked in source;
 *   Tier B plural-messages.spec.ts renders the dialog and chat ones live).
 */

import { describe, expect, it } from 'vitest';
import { pluralKey } from '../src/module/i18n/plural.ts';
import { readRepoFile } from './lib/repo-file.ts';

type LangNode = string | { [key: string]: LangNode };

const lang = JSON.parse(readRepoFile('src/lang/en.json')) as { [key: string]: LangNode };

/** Every string value in the langpack, with its dotted key. */
function strings(node: LangNode, path: string): Array<[string, string]> {
    if (typeof node === 'string') return [[path, node]];
    return Object.entries(node).flatMap(([key, child]) => strings(child, path === '' ? key : `${path}.${key}`));
}

const ALL = new Map(strings(lang, ''));

/** `key`'s text with `{name}` placeholders filled. */
function format(key: string, params: Record<string, string>): string {
    const text = ALL.get(key);
    if (text === undefined) throw new Error(`missing langpack key ${key}`);
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
}

/** The placeholders a string uses, sorted. */
function placeholders(text: string): string[] {
    return Array.from(text.matchAll(/\{(?<name>\w+)\}/g), (m) => m.groups?.['name'] ?? '').sort();
}

/**
 * Whether `file` picks `base`'s form through pluralKey: a template's `(pluralKey "…")`
 * subexpression, or in TypeScript the key as a pluralKey argument (directly or as one
 * arm of a ternary) or the variable handed to it.
 */
function callsPluralKey(file: string, base: string): boolean {
    const source = readRepoFile(file);
    if (file.endsWith('.hbs')) return source.includes(`(pluralKey "${base}"`);
    const asArgument = new RegExp(`pluralKey\\([^;]*'${base.replace(/\./g, '\\.')}'`).test(source);
    return asArgument || (source.includes(`'${base}'`) && source.includes('pluralKey(base'));
}

/** One plural call site: its group, the parameter carrying the count, and the file that formats it. */
interface PluralSite {
    base: string;
    count: string;
    file: string;
}

const SITES: readonly PluralSite[] = [
    { base: 'WH40K.Notify.OriginPath.SelectionLimit', count: 'count', file: 'src/module/applications/character-creation/origin-path-choice-dialog.ts' },
    { base: 'WH40K.Notify.Xp.BatchAdded', count: 'count', file: 'src/module/applications/prompts/batch-xp-dialog.ts' },
    { base: 'WH40K.Notify.Xp.BatchRemoved', count: 'count', file: 'src/module/applications/prompts/batch-xp-dialog.ts' },
    { base: 'WH40K.Notify.Transfer.Gave', count: 'count', file: 'src/module/applications/actor/character-sheet.ts' },
    { base: 'WH40K.Notify.Transfer.GiveTo', count: 'count', file: 'src/module/applications/actor/character-sheet.ts' },
    { base: 'WH40K.Warning.HydrationFailed', count: 'count', file: 'src/module/compendium-hydrate.ts' },
    { base: 'WH40K.SkillUse.HealedWounds', count: 'wounds', file: 'src/module/rolls/action-data.ts' },
    { base: 'WH40K.SkillUse.ResolvedCritical', count: 'tiers', file: 'src/module/rolls/action-data.ts' },
    { base: 'WH40K.SkillUse.Interrogation.Lockout', count: 'days', file: 'src/module/rolls/action-data.ts' },
    { base: 'WH40K.SkillUse.Social.Shift', count: 'bands', file: 'src/module/rolls/action-data.ts' },
    { base: 'WH40K.SkillUse.Buff.BlatherHeld', count: 'rounds', file: 'src/module/rolls/action-data.ts' },
    { base: 'WH40K.Opposed.Margin', count: 'margin', file: 'src/module/rolls/action-data.ts' },
    { base: 'WH40K.Psychic.OpposedOvercome', count: 'margin', file: 'src/module/rolls/action-data.ts' },
    { base: 'WH40K.Combat.HandBudgetExceeded', count: 'cost', file: 'src/module/applications/actor/character-sheet.ts' },
    { base: 'WH40K.GrenadeRider.DurationBasePerDegree', count: 'base', file: 'src/module/applications/prompts/grenade-throw-view.ts' },
    { base: 'WH40K.GrenadeRider.ConditionRounds', count: 'rounds', file: 'src/module/applications/prompts/grenade-rider-results-view.ts' },
    { base: 'WH40K.Daemonology.Summoning.Bound', count: 'hours', file: 'src/templates/chat/daemonology-ritual-chat.hbs' },
    { base: 'WH40K.Voidcraft.Boarding.Winner', count: 'degrees', file: 'src/templates/chat/ship-boarding-chat.hbs' },
    { base: 'WH40K.Voidcraft.Boarding.ChoiceLegend', count: 'degrees', file: 'src/module/applications/ship-assault/boarding-flow.ts' },
    { base: 'WH40K.Voidcraft.Boarding.Component.ChargeDegrees', count: 'degrees', file: 'src/module/applications/ship-assault/boarding-flow.ts' },
    { base: 'WH40K.Voidcraft.HitAndRun.RaidSucceeds', count: 'degrees', file: 'src/templates/chat/ship-hit-and-run-chat.hbs' },
    { base: 'WH40K.Voidcraft.HitAndRun.Component.NetDegrees', count: 'degrees', file: 'src/module/applications/ship-assault/hit-and-run-flow.ts' },
    { base: 'WH40K.Voidcraft.Build.NotifyMissingSlots', count: 'count', file: 'src/module/applications/actor/voidcraft-sheet.ts' },
    { base: 'WH40K.Vehicle.UnfilledCrew', count: 'count', file: 'src/templates/actor/craft/tab-crew.hbs' },
    { base: 'WH40K.Prompt.BatchXp.ToCharacters', count: 'count', file: 'src/templates/prompt/batch-xp-prompt.hbs' },
    { base: 'WH40K.Effects.RemainingRounds', count: 'n', file: 'src/module/documents/active-effect.ts' },
    { base: 'WH40K.Effects.RemainingTurns', count: 'n', file: 'src/module/documents/active-effect.ts' },
    { base: 'WH40K.InventoryGenerator.Applied', count: 'count', file: 'src/module/managers/inventory-generator-manager.ts' },
];

describe('langpack plurals (#663)', () => {
    it('no en.json value hedges a plural with "(s)"', () => {
        expect([...ALL].filter(([, text]) => text.includes('(s)')).map(([key]) => key)).toEqual([]);
    });

    it('every plural group’s two forms carry the same placeholders', () => {
        const groups = [...ALL.keys()].filter((key) => key.endsWith('.One')).map((key) => key.slice(0, -'.One'.length));
        const mismatched = groups.filter((base) => placeholders(ALL.get(`${base}.One`) ?? '').join() !== placeholders(ALL.get(`${base}.Other`) ?? '').join());
        expect(groups.length).toBeGreaterThanOrEqual(SITES.length);
        expect(mismatched).toEqual([]);
    });
});

describe.each(SITES)('$base', ({ base, count, file }) => {
    it('reads the One form for 1 and the Other form for 2', () => {
        const one = format(pluralKey(base, 1, 'en'), { [count]: '1' });
        const two = format(pluralKey(base, 2, 'en'), { [count]: '2' });
        expect(one).toContain('1');
        expect(two).toContain('2');
        expect(one.replace('1', 'N')).not.toBe(two.replace('2', 'N'));
    });

    it('its call site picks the form through pluralKey', () => {
        expect(callsPluralKey(file, base), `${file} calls pluralKey for ${base}`).toBe(true);
    });
});
