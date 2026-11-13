import { registerIconHelper } from '../icons/helper.ts';
import { registerHandlebarsHelpers } from './handlebars-helpers.ts';

/**
 * Registers the system's Handlebars helpers.
 *
 * Templates are not loaded here. The bundle carries every template's source and
 * registers each as a partial before `init` (`template-sources.ts`, #708), so a
 * template no longer has to be listed anywhere to resolve at runtime.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: stable API surface with many callers across the codebase
export class HandlebarManager {
    static registerHelpers(): void {
        registerHandlebarsHelpers();
        registerIconHelper();
    }
}
