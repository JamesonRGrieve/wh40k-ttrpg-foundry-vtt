/**
 * Guard (#718): ApplicationV2 action and form handlers are private static
 * methods that Foundry calls with `this` bound to the application. ESLint's
 * `@typescript-eslint/unbound-method` is configured with `ignoreStatic` so
 * registering one (`advanceHour: WorldTimeWidget.#advanceHour`) needs no
 * suppression. The rule stays on for instance methods, where detaching really
 * does lose `this`.
 *
 * This test pins the option and fails if an `unbound-method` suppression
 * returns on a static action or handler registration.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

/** A static method referenced through its class: `Class.#name` or `Class.name`, as an action or `handler:` entry. */
const STATIC_REGISTRATION = /^\s*(?:#?[\w-]+|'[^']+'|"[^"]+"):\s*[A-Z]\w*\.#?\w+\b/;
const SUPPRESSION = /eslint-(?:disable|enable)(?:-next-line|-line)?[^\n]*@typescript-eslint\/unbound-method/;

function tsFilesUnder(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return tsFilesUnder(path);
        return entry.name.endsWith('.ts') ? [path] : [];
    });
}

interface UnboundMethodRuleOptions {
    ignoreStatic?: boolean;
}

type RuleSetting = string | [string, UnboundMethodRuleOptions];

interface EslintConfigShape {
    overrides: Array<{ files: string[]; rules?: Record<string, RuleSetting> }>;
}

/** The `unbound-method` setting in the override block that lints `.ts` files. */
function unboundMethodSetting(): RuleSetting | undefined {
    const config = JSON.parse(readFileSync(resolve(ROOT, '.eslintrc.json'), 'utf8')) as EslintConfigShape;
    const tsBlock = config.overrides.find((block) => block.files.includes('**/*.ts'));
    return tsBlock?.rules?.['@typescript-eslint/unbound-method'];
}

/** `file:line: text` for every `unbound-method` suppression on, or wrapping, a static registration. */
function suppressedStaticRegistrations(): string[] {
    return tsFilesUnder(resolve(ROOT, 'src/module')).flatMap((file) => {
        const lines = readFileSync(file, 'utf8').split('\n');
        // A block `/* eslint-disable … */` around an action map, or a
        // next-line disable on a registration, both count.
        return lines
            .map((line, index) => ({ line, index }))
            .filter(({ line }) => SUPPRESSION.test(line))
            .filter(
                ({ line, index }) =>
                    /\/\*\s*eslint-(?:disable|enable)\s/.test(line) || lines.slice(index, index + 3).some((candidate) => STATIC_REGISTRATION.test(candidate)),
            )
            .map(({ line, index }) => `${relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
    });
}

describe('unbound-method on static ApplicationV2 handlers (#718)', () => {
    it('is configured with ignoreStatic and stays an error', () => {
        expect(unboundMethodSetting()).toEqual(['error', { ignoreStatic: true }]);
    });

    it('has no suppression on a static action or handler registration', () => {
        expect(suppressedStaticRegistrations()).toEqual([]);
    });
});
