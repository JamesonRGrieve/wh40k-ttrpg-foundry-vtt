/**
 * dependency-cruiser rules enforcing the 3-layer architecture from CLAUDE.md:
 *   - DataModel (src/module/data/**)  — schema + pure calculations
 *   - Document  (src/module/documents/**)  — Foundry document subclasses + roll API
 *   - Sheet     (src/module/applications/**)  — UI only, no business logic
 *
 * Plus a baseline of hard correctness rules (circular deps, orphans, no
 * direct prod→test imports).
 *
 * All rules start at `warn` because the codebase has pre-existing violations
 * (mostly Documents calling into prompt dialogs). The companion ratchet
 * (scripts/depcruise-ratchet.mjs) holds counts down and auto-flips each rule
 * to `error` once its violation count reaches 0.
 */
module.exports = {
    extends: undefined,
    forbidden: [
        {
            name: 'no-circular',
            severity: 'warn',
            comment: 'Modules should not depend on themselves transitively.',
            from: {},
            to: { circular: true },
        },
        {
            name: 'no-orphans',
            severity: 'warn',
            comment: 'Files imported by nothing.',
            from: {
                orphan: true,
                pathNot: [
                    '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
                    '\\.d\\.ts$',
                    'src/module/wh40k-rpg\\.ts$',
                    'src/module/types/.*\\.d\\.ts$',
                    'src/module/icons/registry\\.generated\\.ts$',
                    '\\.stories\\.ts$',
                    '\\.test\\.ts$',
                ],
            },
            to: {},
        },
        {
            name: 'no-deprecated-core',
            severity: 'warn',
            comment: 'Do not import from deprecated Node core modules.',
            from: {},
            to: { dependencyTypes: ['deprecated'] },
        },
        {
            name: 'no-non-package-json',
            severity: 'warn',
            comment: 'Every npm dependency used in source must be declared in package.json.',
            from: {},
            to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
        },
        {
            name: 'no-test-into-prod',
            severity: 'warn',
            comment: 'Production modules under src/module/ must not import from tests/, stories/, or *.test.ts / *.stories.ts.',
            from: { path: '^src/module/', pathNot: '\\.(test|stories)\\.ts$' },
            to: { path: '(^tests/|^stories/|\\.(test|stories)\\.ts$)' },
        },
        {
            name: 'sheets-must-not-import-data-models-directly',
            severity: 'warn',
            comment:
                "Sheets should consume data through Documents, not reach into DataModel classes. Pure type imports are still fine — go through `import type` if that's all you need.",
            from: { path: '^src/module/applications/' },
            to: {
                path: '^src/module/data/',
                pathNot: '\\.(d\\.ts|types\\.ts)$',
                dependencyTypesNot: ['type-only'],
            },
        },
        {
            name: 'data-must-not-depend-on-applications',
            severity: 'warn',
            comment: 'DataModels are pure logic. They must not import sheet/dialog/HUD code.',
            from: { path: '^src/module/data/' },
            to: { path: '^src/module/applications/' },
        },
        {
            name: 'documents-must-not-depend-on-applications',
            severity: 'warn',
            comment: 'Documents expose API. They must not depend on the UI layer.',
            from: { path: '^src/module/documents/' },
            to: { path: '^src/module/applications/' },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        exclude: {
            path: ['^node_modules', '^dist', '\\.test\\.ts$', '\\.stories\\.ts$', '^src/module/icons/registry\\.generated\\.ts$'],
        },
        includeOnly: '^src/module/',
        tsPreCompilationDeps: true,
        tsConfig: { fileName: 'tsconfig.json' },
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default', 'types'],
            extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.d.ts'],
        },
        reporterOptions: {
            text: { highlightFocused: true },
        },
    },
};
