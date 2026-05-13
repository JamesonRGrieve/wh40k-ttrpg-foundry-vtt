import { describe, expect, it, vi } from 'vitest';
import type { ApplicationV2Ctor } from '../src/module/applications/api/application-types.ts';

type Constructor<T = object> = new (...args: any[]) => T;

interface FakeApplicationApi {
    HandlebarsApplicationMixin<T extends Constructor>(base: T): T;
}

function installFoundryStubs() {
    const api: FakeApplicationApi = {
        HandlebarsApplicationMixin<T extends Constructor>(base: T): T {
            return class extends base {
                static DEFAULT_OPTIONS = {};

                async _onFirstRender(): Promise<void> {}

                async _onRender(): Promise<void> {}

                async _prepareContext(): Promise<Record<string, unknown>> {
                    return {};
                }

                async _preparePartContext(): Promise<Record<string, unknown>> {
                    return {};
                }

                _configureRenderOptions(): void {}

                _replaceHTML(): void {}

                _updateFrame(): void {}
            };
        },
    };

    Object.assign(globalThis, {
        CONFIG: { wh40k: {} },
        foundry: {
            applications: {
                api,
            },
        },
    });
}

class BaseTestApplication {
    static DEFAULT_OPTIONS = {};
    static PARTS = {};

    element: HTMLElement;
    hasFrame = false;
    options = {};

    constructor(...args: any[]) {
        this.element = args[0] as HTMLElement;
    }
}

describe('ApplicationV2Mixin', () => {
    it('rebuilds shared part containers on subsequent renders', async () => {
        installFoundryStubs();
        vi.resetModules();

        const { default: ApplicationV2Mixin } = await import('../src/module/applications/api/application-v2-mixin.ts');

        class TestApplication extends ApplicationV2Mixin(BaseTestApplication as unknown as ApplicationV2Ctor) {
            static PARTS = {
                header: { template: '', container: { id: 'sidebar', classes: ['wh40k-sidebar'] } },
                tabs: { template: '', container: { id: 'sidebar', classes: ['wh40k-sidebar'] } },
                equipment: { template: '', container: { id: 'tab-body', classes: ['wh40k-body'] } },
            };
        }

        const renderMarkup = () => `
            <section data-application-part="header">header</section>
            <nav data-application-part="tabs">tabs</nav>
            <main data-application-part="equipment">equipment</main>
        `;

        const root = document.createElement('div');
        root.innerHTML = renderMarkup();

        const app = new TestApplication(root);
        await app._onRender({}, {});

        let sidebar = root.querySelector<HTMLElement>('[data-container-id="sidebar"]');
        expect(sidebar).not.toBeNull();
        expect(sidebar?.querySelector('[data-application-part="header"]')).not.toBeNull();
        expect(sidebar?.querySelector('[data-application-part="tabs"]')).not.toBeNull();

        root.innerHTML = renderMarkup();
        await app._onRender({}, {});

        const sidebars = root.querySelectorAll('[data-container-id="sidebar"]');
        sidebar = root.querySelector<HTMLElement>('[data-container-id="sidebar"]');
        expect(sidebars).toHaveLength(1);
        expect(sidebar?.children).toHaveLength(2);
        expect(sidebar?.querySelector('[data-application-part="header"]')).not.toBeNull();
        expect(sidebar?.querySelector('[data-application-part="tabs"]')).not.toBeNull();
    });
});
