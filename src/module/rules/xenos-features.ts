/**
 * Ace role engine constant.
 *
 * The Right Stuff Fate spend's applicable skills — the canonical source for the
 * role ability's skill set, read by `ace-role.ts` and the Right Stuff dialog.
 */

/** Right Stuff Fate spend: auto-succeed on Operate/Survival with DoS = AgB. */
export const RIGHT_STUFF = {
    applicableSkills: ['operate', 'survival'] as const,
};
