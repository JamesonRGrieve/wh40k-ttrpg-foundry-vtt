import { describe, expect, it, vi } from 'vitest';
import type { ApplicationV2Ctor } from '../src/module/applications/api/application-types.ts';
import type { Constructor } from '../src/module/testing/app-v2-stub.ts';

interface FakeApplicationApi {
    HandlebarsApplicationMixin: <T extends Constructor>(base: T) => T;
}

function installFoundryStubs(): void {
    const api: FakeApplicationApi = {
        HandlebarsApplicationMixin<T extends Constructor>(base: T): T {
            return class extends base {
                static DEFAULT_OPTIONS = {};

                async _onFirstRender(): Promise<void> {}

                async _onRender(): Promise<void> {}

                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's ApplicationV2._prepareContext returns the template-context object whose shape is sheet-defined; the framework type is open.
                async _prepareContext(): Promise<Record<string, unknown>> {
                    return Promise.resolve({});
                }

                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's ApplicationV2._preparePartContext returns the per-part context whose shape is sheet-defined.
                async _preparePartContext(): Promise<Record<string, unknown>> {
                    return Promise.resolve({});
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for mixin-class constructors; matches Foundry's ApplicationV2.
    constructor(...args: any[]) {
        this.element = args[0] as HTMLElement;
    }
}

describe('ApplicationV2Mixin', () => {
    it('rebuilds shared part containers on subsequent renders', async () => {
        installFoundryStubs();
        vi.resetModules();

        const { default: ApplicationV2Mixin } = await import('../src/module/applications/api/application-v2-mixin.ts');

        // eslint-disable-next-line no-restricted-syntax -- boundary: bridging the structural BaseTestApplication into Foundry's ApplicationV2Ctor shape for the mixin.
        class TestApplication extends ApplicationV2Mixin(BaseTestApplication as unknown as ApplicationV2Ctor) {
            static PARTS = {
                header: { template: '', container: { id: 'sidebar', classes: ['wh40k-sidebar'] } },
                tabs: { template: '', container: { id: 'sidebar', classes: ['wh40k-sidebar'] } },
                equipment: { template: '', container: { id: 'tab-body', classes: ['wh40k-body'] } },
            };
        }

        const renderMarkup = (): string => `
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
