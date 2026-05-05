import { hasIcon, icon, type IconOptions } from './icon.ts';

interface HandlebarsHelperOptions {
    hash?: Record<string, unknown>;
}

/**
 * Register the `{{iconSvg}}` Handlebars helper. Keep the registration narrow —
 * the helper accepts the same shape as the `icon(key, opts)` TS function.
 *
 *   {{iconSvg "fa:dice-d20" class="tw-w-4 tw-h-4 tw-text-bronze"}}
 *   {{iconSvg "lucide:settings" label="Settings"}}
 *
 * The name is `iconSvg` (not bare `icon`) to avoid collision with the existing
 * convention of passing an `icon` *variable* into partials (e.g.
 * `(#>) panel.hbs label="Armour" icon="fa-shield-alt"` followed by
 * `{{#if icon}}<i class="fas {{icon}}">`). Handlebars resolves a registered
 * helper before a context variable of the same name, so a bare `icon` helper
 * would silently break every existing partial that takes `icon` as a hash arg.
 *
 * For a misspelled or unbundled key, the helper logs a console warning and
 * renders an empty string. The build-time generator (`scripts/gen-icons.mjs`)
 * is responsible for ensuring referenced keys are bundled, and the typed
 * `IconKey` union catches misspellings in TS call sites.
 */
export function registerIconHelper(): void {
    Handlebars.registerHelper('iconSvg', function iconHelper(key: unknown, options: HandlebarsHelperOptions) {
        if (typeof key !== 'string' || !hasIcon(key)) {
            // eslint-disable-next-line no-console
            console.warn(`[wh40k-icons] unknown icon key: ${String(key)}`);
            return new Handlebars.SafeString('');
        }
        const hash: Record<string, unknown> = options.hash ?? {};
        const opts: IconOptions = {};
        if (typeof hash.class === 'string') opts.class = hash.class;
        if (typeof hash.label === 'string') opts.label = hash.label;
        if (typeof hash.size === 'string' || typeof hash.size === 'number') {
            opts.size = hash.size;
        }
        return new Handlebars.SafeString(icon(key, opts));
    });
}
