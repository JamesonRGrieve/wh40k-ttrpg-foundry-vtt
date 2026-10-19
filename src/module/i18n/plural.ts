/**
 * Plural langpack keys (#414). A count-bearing string is a langpack group with a
 * `One` and an `Other` form ("1 hit incoming" / "3 hits incoming") rather than
 * one string hedging with "hit(s)". `pluralKey` names the form the count takes in
 * the active language, through the platform's plural rules; a language whose rules
 * have more categories (few, many, …) falls back to `Other`.
 */

/** The plural forms a langpack group carries. */
const PLURAL_FORMS = { one: 'One', other: 'Other' } as const;

/** The two keys of the plural group `B`; with a literal base, both are typed langpack keys. */
export type PluralKey<B extends string> = `${B}.One` | `${B}.Other`;

/** The key of the form of the plural group `base` that `count` takes in `locale`. */
export function pluralKey<B extends string>(base: B, count: number, locale: string): PluralKey<B> {
    const category = new Intl.PluralRules(locale).select(Number.isFinite(count) ? count : 0);
    return category === 'one' ? `${base}.${PLURAL_FORMS.one}` : `${base}.${PLURAL_FORMS.other}`;
}
