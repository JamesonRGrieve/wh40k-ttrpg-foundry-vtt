import type { Page } from '@playwright/test';

/** A Foundry colour scheme for applications and the interface. */
export type ColorScheme = 'dark' | 'light';

/** Core's `uiConfig` client setting, as far as a scheme switch reads it. */
export interface UiConfig {
    colorScheme: { applications: string; interface: string };
}

interface SettingsGlobal {
    game: { settings: { get: (scope: string, key: string) => UiConfig; set: (scope: string, key: string, value: UiConfig) => Promise<object> } };
}

/**
 * Set the client's colour scheme for applications and the interface (`null` for the
 * default), or put back a config `previous` returned. Returns the config it replaced.
 */
export async function setColorScheme(page: Page, scheme: ColorScheme | null, previous?: UiConfig): Promise<UiConfig> {
    return page.evaluate(
        async ({ value, restore }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
            const { settings } = (globalThis as unknown as SettingsGlobal).game;
            const current = settings.get('core', 'uiConfig');
            const next = restore ?? { ...current, colorScheme: { applications: value ?? '', interface: value ?? '' } };
            await settings.set('core', 'uiConfig', next);
            return current;
        },
        { value: scheme, restore: previous },
    );
}
