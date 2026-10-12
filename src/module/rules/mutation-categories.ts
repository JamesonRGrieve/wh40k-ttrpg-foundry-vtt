import { GIFT_MUTATION_CATEGORY } from './bc-gifts.ts';

/**
 * The `mutation.category` vocabulary — the single list both the MutationData
 * schema `choices` and the mutation sheet's category select read, so the two
 * can never drift (a select missing a stored value rewrites it on submit).
 * `gift` marks a Black Crusade Gift of the Gods (#180).
 */
export const MUTATION_CATEGORIES = ['minor', 'major', 'malignancy', GIFT_MUTATION_CATEGORY] as const;

/** A mutation category. */
export type MutationCategory = (typeof MUTATION_CATEGORIES)[number];
