import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { canvasClip } from './lib/canvas-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of attack cues (#594, src/module/rolls/attack-cue-trigger.ts +
 * canvas/attack-cue-canvas.ts) on a live canvas: a real DH2 Lasgun attack (its
 * content-authored `las` preset) plays its procedural cue on the canvas interface
 * layer when the attack card posts, a miss plays one too, and the GM's world switch
 * off plays nothing. The cue settings are shown in Configure Settings.
 *
 * The cues are short animations (250–800 ms), so the capture freezes the canvas a
 * moment after the first cue graphic appears: animation frames are fed a constant
 * timestamp, which stops both the cue's progress and PIXI's ticker on the frame
 * already drawn, and released after the capture.
 *
 * Grid: 100 px = 1 m. Each flow records under `attack-cue.flow`. Keys MUST match
 * ATTACK_CUE_FLOWS in scripts/e2e-coverage.mjs.
 */

const ATTACK_CUE_FLOWS = ['hit-draws-cue', 'miss-draws-cue', 'world-switch-off-draws-nothing', 'settings-listed'] as const;

type FlowName = (typeof ATTACK_CUE_FLOWS)[number];

const LASGUN = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.z3A4b5C6d7E8f9G0';

const TOKENS = [
    {
        key: 'firer',
        name: 'Trooper',
        type: 'dh2-character',
        x: 200,
        y: 300,
        items: [leanWeapon('Lasgun', LASGUN, 30)],
        system: { characteristics: { ballisticSkill: { base: 50 } } },
    },
    { key: 'target', name: 'Heretic', type: 'dh2-npc', x: 800, y: 300 },
];

const FIRER_CENTRE = { x: 250, y: 350 };
const TARGET_CENTRE = { x: 850, y: 350 };
/** How long after the first cue graphic appears the frame is frozen, in ms. */
const FREEZE_AFTER_MS = 120;
/** How long to watch for a cue graphic after the attack resolves, in ms. */
const CUE_WATCH_MS = 1500;

interface CueProbeGlobals {
    canvas: { interface: { addChild: (...children: object[]) => object } };
    PIXI: { Graphics: abstract new (...a: never[]) => object };
}

interface CueProbe {
    drawn: number;
    frozen: boolean;
    release: () => void;
    reset: (freeze: boolean) => void;
}

declare global {
    // eslint-disable-next-line no-var -- a global installed at runtime must be declared with `var` to land on globalThis
    var wh40kCueProbe: CueProbe | undefined;
}

/** Count the cue graphics added to the interface layer and, when armed, freeze the frame shortly after the first. */
async function installCueProbe(page: Page, freezeAfterMs: number): Promise<void> {
    await page.evaluate((delay: number) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (`canvas`, `PIXI`) are injected by the licensed app; no shipped types
        const g = globalThis as unknown as CueProbeGlobals;
        const realRaf = window.requestAnimationFrame.bind(window);
        let frozenTs: number | null = null;
        let lastTs = 0;
        let armed = false;
        window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
            realRaf((ts) => {
                lastTs = ts;
                cb(frozenTs ?? ts);
            });
        const probe: CueProbe = {
            drawn: 0,
            frozen: false,
            release: () => {
                frozenTs = null;
                probe.frozen = false;
            },
            reset: (freeze: boolean) => {
                probe.drawn = 0;
                armed = freeze;
            },
        };
        const layer = g.canvas.interface;
        const addChild = layer.addChild.bind(layer);
        layer.addChild = (...children: object[]): object => {
            if (children.some((c) => c instanceof g.PIXI.Graphics)) {
                probe.drawn += 1;
                if (armed && probe.drawn === 1) {
                    window.setTimeout(() => {
                        frozenTs = lastTs;
                        probe.frozen = true;
                    }, delay);
                }
            }
            return addChild(...children);
        };
        globalThis.wh40kCueProbe = probe;
    }, freezeAfterMs);
}

/** Attack with the lasgun rolling `face` and report how many cue graphics drew. */
async function fire(page: Page, scene: HarnessScene, face: number, freeze: boolean): Promise<number> {
    await page.evaluate((f: boolean) => globalThis.wh40kCueProbe?.reset(f), freeze);
    await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
        firer: scene.tokens['firer'] ?? '',
        target: scene.tokens['target'] ?? '',
        weaponName: 'Lasgun',
        faces: [[face, 100]] as Array<[number, number]>,
    });
    return page.evaluate(
        async (args: { watch: number; freeze: boolean }) => {
            const { pollUntil } = globalThis.wh40kE2E;
            const probe = globalThis.wh40kCueProbe;
            await pollUntil(() => (probe?.drawn ?? 0) > 0 && (!args.freeze || probe?.frozen === true), args.watch);
            return probe?.drawn ?? 0;
        },
        { watch: CUE_WATCH_MS, freeze },
    );
}

async function releaseFreeze(page: Page): Promise<void> {
    await page.evaluate(() => {
        globalThis.wh40kCueProbe?.release();
    });
}

async function setCues(page: Page, on: boolean): Promise<boolean> {
    return page.evaluate(async (value: boolean) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: { settings: { get: (n: string, k: string) => boolean; set: (n: string, k: string, v: boolean) => Promise<boolean> } };
        };
        const was = g.game.settings.get('wh40k-rpg', 'attack-cues');
        await g.game.settings.set('wh40k-rpg', 'attack-cues', value);
        return was;
    }, on);
}

/** Open Configure Settings on the system's tab, scrolled to the attack-cue settings; returns the app id or null. */
async function openCueSettings(page: Page): Promise<string | null> {
    return page.evaluate(async () => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            foundry: {
                applications: {
                    settings: {
                        SettingsConfig: new () => { id: string; render: (o: { force: boolean }) => Promise<object>; changeTab: (t: string, g: string) => void };
                    };
                };
            };
        };
        const app = new g.foundry.applications.settings.SettingsConfig();
        await app.render({ force: true });
        const { pollUntil, settle } = globalThis.wh40kE2E;
        const field = (): Element | null => document.querySelector(`#${app.id} [name="wh40k-rpg.attack-cues"]`);
        try {
            app.changeTab('system', 'categories');
        } catch {
            /* the category tab id differs; the field lookup below decides */
        }
        if (!(await pollUntil(() => field() !== null))) return null;
        field()?.closest('.form-group')?.scrollIntoView({ block: 'start' });
        await settle(300);
        return app.id;
    });
}

test.describe.serial('attack cues on a live canvas (Tier B, #594)', () => {
    test.setTimeout(scaledMs(240_000));
    test('a resolved attack plays its cue, a miss plays one, and the world switch silences them', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);

        const results = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            results.set(flow, ok ? null : detail);
        };
        const cuesWere = await setCues(page, true);
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1200, height: 800, tokens }), TOKENS);
            await installCueProbe(page, FREEZE_AFTER_MS);
            // Close the floating widgets (In-Universe Time, scene environment) before the
            // frame is frozen, so they do not sit over the firer in the captures.
            await clearScreenOverlays(page);
            const clip = await canvasClip(page, [FIRER_CENTRE, TARGET_CENTRE], 150);

            const hit = await fire(page, scene, 5, true);
            pass('hit-draws-cue', hit > 0, `a hit drew ${hit} cue graphics`);
            await snap(page, 'attack-cue-las-hit', clip === null ? { selector: '#board' } : { clip });
            await releaseFreeze(page);
            await page.waitForTimeout(scaledMs(1200));

            const miss = await fire(page, scene, 90, true);
            pass('miss-draws-cue', miss > 0, `a miss drew ${miss} cue graphics`);
            await snap(page, 'attack-cue-las-miss', clip === null ? { selector: '#board' } : { clip });
            await releaseFreeze(page);
            await page.waitForTimeout(scaledMs(1200));

            await setCues(page, false);
            const silent = await fire(page, scene, 5, false);
            pass('world-switch-off-draws-nothing', silent === 0, `with cues off an attack drew ${silent} cue graphics`);
            await setCues(page, true);

            const settingsId = await openCueSettings(page);
            pass('settings-listed', settingsId !== null, 'the attack-cue setting is not in Configure Settings');
            if (settingsId !== null) await snap(page, 'attack-cue-settings', { selector: `#${settingsId}`, closeWindows: true, keepWindow: settingsId });
        } finally {
            await releaseFreeze(page);
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
            await setCues(page, cuesWere);
        }

        const failures: string[] = [];
        for (const flow of ATTACK_CUE_FLOWS) {
            const detail = results.get(flow);
            if (detail === null) recordCoverage('attack-cue.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
