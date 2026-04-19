/**
 * CharacterDocBase — shared document class for all PC actors.
 * Historically called WH40KAcolyte; kept as an alias so existing code that
 * imports WH40KAcolyte keeps working during the migration.
 */

import { WH40KAcolyte } from '../acolyte.ts';

export default class CharacterDocBase extends WH40KAcolyte {}
