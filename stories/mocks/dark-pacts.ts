/**
 * Dark Pact fixtures for the pact item sheet and Dark Pacts panel stories (#84).
 *
 * Two of the DH2 pacts, with the identifiers, names, terms and mechanics their
 * compendium documents author, under neutral fixture pack UUIDs. The rules text
 * lives only in the private packs, so each entry's description here is a
 * placeholder, not the book's words.
 *
 * `registerPactNames()` seeds `uuidNameCache` with the pact and granted-item
 * names and registers the `uuid-name` helper exactly as the runtime does
 * (`handlebars-helpers.ts`), so the stories render names through the cache.
 */
import HandlebarsLib from 'handlebars';
import type { PactDefinitionView } from '../../src/module/applications/item/dark-pact-view.ts';
import type { DarkPactEntry, DarkPactTerms, PactRecord } from '../../src/module/rules/dark-pact.ts';
import { uuidNameCache } from '../../src/module/utils/uuid-name-cache.ts';

export const PACT_OF_MIGHT = 'Compendium.wh40k-rpg.dh2-dark-pacts.Item.EB2PactMight0001';
export const PACT_OF_KNOWLEDGE = 'Compendium.wh40k-rpg.dh2-dark-pacts.Item.EB2PactKnowl0001';
/** A pact whose compendium document is gone: its row must still render (as unresolved) so the GM can remove it. */
export const PACT_MISSING = 'Compendium.wh40k-rpg.dh2-dark-pacts.Item.Missing000000001';

const UNNATURAL = 'Compendium.wh40k-rpg.dh2-traits.Item.UnnatCharDh2TrX1';
const FRENZY = 'Compendium.wh40k-rpg.dh2-talents.Item.DH2aTlnt00000011';
const COMBAT_MASTER = 'Compendium.wh40k-rpg.dh2-talents.Item.DH2aTlnt00000031';
const COUNTER_ATTACK = 'Compendium.wh40k-rpg.dh2-talents.Item.DH2aTlnt00000006';
const STEP_ASIDE = 'Compendium.wh40k-rpg.dh2-talents.Item.DH2aTlnt00000055';

/** The book's terms, shared by every example pact. */
export const BOOK_TERMS: DarkPactTerms = { dispositionBase: 15, addsCorruption: true, testModifier: -20 };
export const CORRUPTION_FORMULA = '2d10+10';

function entry(identifier: string, name: string, extra: Partial<Pick<DarkPactEntry, 'modifiers' | 'grants'>> = {}): DarkPactEntry {
    return { identifier, name, description: '<p>Rules text lives in the pack.</p>', modifiers: {}, grants: [], ...extra };
}

export const MIGHT: PactDefinitionView = {
    boons: [
        entry('mighty', 'Mighty', { grants: [{ uuid: UNNATURAL, specialization: 'Strength', level: 2 }] }),
        entry('lord-of-battle', 'Lord of Battle', { modifiers: { characteristics: { weaponSkill: 5 } } }),
        entry('reaver', 'Reaver', { grants: [{ uuid: FRENZY, specialization: '', level: null }] }),
        entry('unassailable', 'Unassailable', {
            grants: [COMBAT_MASTER, COUNTER_ATTACK, STEP_ASIDE].map((uuid) => ({ uuid, specialization: '', level: null })),
        }),
    ],
    banes: [entry('aspect-of-war', 'Aspect of War'), entry('blood-rage', 'Blood Rage'), entry('bloodthirsty', 'Bloodthirsty')],
};

export const KNOWLEDGE: PactDefinitionView = {
    boons: [
        entry('blasphemous-knowledge', 'Blasphemous Knowledge'),
        entry('dark-genius', 'Dark Genius', { modifiers: { characteristics: { intelligence: 5 } } }),
        entry('seer', 'Seer'),
        entry('true-savant', 'True Savant'),
    ],
    banes: [
        entry('detached', 'Detached', { modifiers: { characteristics: { fellowship: -10 } } }),
        entry('terrible-truths', 'Terrible Truths'),
        entry('unquenchable-thirst', 'Unquenchable Thirst'),
    ],
};

/** Each fixture pact's content by UUID, as `darkPactDefinitions` resolves it (`null` = no longer resolves). */
export const PACT_DEFINITIONS: ReadonlyMap<string, PactDefinitionView | null> = new Map([
    [PACT_OF_MIGHT, MIGHT],
    [PACT_OF_KNOWLEDGE, KNOWLEDGE],
    [PACT_MISSING, null],
]);

/** A struck pact record, defaulting to a fresh bargain at the book's starting Disposition for 10 Corruption. */
export function pactRecord(pactUuid: string, extra: Partial<PactRecord> = {}): PactRecord {
    return { pactUuid, discovered: false, disposition: 25, paymentCurrent: true, boons: [], banes: [], ...extra };
}

const NAMES: ReadonlyArray<[string, string]> = [
    [PACT_OF_MIGHT, 'Pact of Might'],
    [PACT_OF_KNOWLEDGE, 'Pact of Knowledge'],
    [UNNATURAL, 'Unnatural Characteristic (X)'],
    [FRENZY, 'Frenzy'],
    [COMBAT_MASTER, 'Combat Master'],
    [COUNTER_ATTACK, 'Counter Attack'],
    [STEP_ASIDE, 'Step Aside'],
];

/** Seed `uuidNameCache` with the fixture names and register the runtime `uuid-name` helper over it. */
export function registerPactNames(): void {
    for (const [uuid, name] of NAMES) uuidNameCache.set(uuid, name);
    HandlebarsLib.registerHelper('uuid-name', (uuid: string | undefined): string =>
        typeof uuid === 'string' && uuid !== '' ? uuidNameCache.getName(uuid) : '',
    );
}
