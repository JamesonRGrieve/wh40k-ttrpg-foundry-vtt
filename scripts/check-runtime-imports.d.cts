export function bareImports(source: string): string[];
export function relativeImports(source: string): string[];
export function findBareRuntimeImports(moduleRoot: string): Array<{ file: string; specifier: string }>;
export function isTestOnly(relPath: string): boolean;
