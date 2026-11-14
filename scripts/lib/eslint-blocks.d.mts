/** Lines inside block eslint-disables, and the 1-based line of one that never closes (null when all close). */
export function scanBlocks(source: string): { covered: number; unclosed: number | null };
