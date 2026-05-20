import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Weapon Quality chat card (#57 completion).
 *
 * Renders the `weapon-quality-effect-chat.hbs` card through Foundry's
 * deployed Handlebars runtime against a representative payload for each
 * bespoke-visible quality (Spray cone, Flame burning, Graviton
 * knockdown, Lance pen×DoS, Maximal recharge, Power Field parry-
 * destroy, Scatter range bands, Shocking stun). Each render is mounted
 * under a `.wh40k-rpg` ancestor (Gotcha 3a) and snapped; the card
 * remains visible through `snap()` and is torn down between cases.
 */

interface QualityCase {
    name: string;
    qualityKey: string;
    iconClass: string;
    accentClass: string;
    payload: Record<string, unknown>;
}

const QUALITY_CASES: ReadonlyArray<QualityCase> = [
    {
        name: 'spray-cone',
        qualityKey: 'spray',
        iconClass: 'fa-fan',
        accentClass: 'tw-text-orange-300',
        payload: {
            templateShape: 'cone',
            saveCharacteristic: 'agility',
            saveTarget: 35,
            failEffectKey: 'WH40K.Quality.FailEffect.hit',
        },
    },
    {
        name: 'flame-burning',
        qualityKey: 'flame',
        iconClass: 'fa-fire',
        accentClass: 'tw-text-red-400',
        payload: {
            saveCharacteristic: 'agility',
            saveTarget: 35,
            failEffectKey: 'WH40K.Quality.FailEffect.burning',
        },
    },
    {
        name: 'graviton-knockdown',
        qualityKey: 'graviton',
        iconClass: 'fa-arrow-down',
        accentClass: 'tw-text-violet-300',
        payload: {
            saveCharacteristic: 'strength',
            saveTarget: 40,
            bonusDamage: 5,
            failEffectKey: 'WH40K.Quality.FailEffect.prone',
        },
    },
    {
        name: 'lance-pen-by-dos',
        qualityKey: 'lance',
        iconClass: 'fa-bolt-lightning',
        accentClass: 'tw-text-sky-300',
        payload: { bonusPenetration: 8 },
    },
    {
        name: 'maximal-recharge',
        qualityKey: 'maximal',
        iconClass: 'fa-explosion',
        accentClass: 'tw-text-amber-300',
        payload: {
            bonusDamageDice: '1d10',
            bonusPenetration: 2,
            appliesOverheats: true,
            triggersRecharge: true,
        },
    },
    {
        name: 'power-field-parry-destroy',
        qualityKey: 'power-field',
        iconClass: 'fa-shield-halved',
        accentClass: 'tw-text-cyan-300',
        payload: { powerFieldDestroyed: true },
    },
    {
        name: 'scatter-point-blank',
        qualityKey: 'scatter',
        iconClass: 'fa-burst',
        accentClass: 'tw-text-amber-200',
        payload: { rangeBand: 'Point Blank', rangeBandDelta: 3 },
    },
    {
        name: 'scatter-long-range',
        qualityKey: 'scatter',
        iconClass: 'fa-burst',
        accentClass: 'tw-text-amber-200',
        payload: { rangeBand: 'Long Range', rangeBandDelta: -3 },
    },
    {
        name: 'shocking-stun',
        qualityKey: 'shocking',
        iconClass: 'fa-bolt',
        accentClass: 'tw-text-yellow-300',
        payload: {
            saveCharacteristic: 'toughness',
            saveTarget: 40,
            stunRounds: 2,
            fatigue: 1,
            failEffectKey: 'WH40K.Quality.FailEffect.stunned',
        },
    },
];

function capitalize(s: string): string {
    if (s.length === 0) return s;
    return s
        .split('-')
        .map((part) => (part.length === 0 ? part : (part[0]?.toUpperCase() ?? '') + part.slice(1)))
        .join('');
}

test.describe.serial('WeaponQualityEffectChat (Tier B)', () => {
    for (const qcase of QUALITY_CASES) {
        test(`renders quality card: ${qcase.name}`, async ({ page }) => {
            const joined = await joinAsGM(page);
            test.skip(!joined, 'GM join failed');

            const pageErrors: string[] = [];
            const listener = (err: Error): void => {
                pageErrors.push(err.message);
            };
            page.on('pageerror', listener);

            try {
                const payloadJson = JSON.stringify(qcase.payload);
                const labelKey = `WH40K.Quality.${capitalize(qcase.qualityKey)}.Name`;
                const descKey = `WH40K.Quality.${capitalize(qcase.qualityKey)}.Description`;
                const renderInputs = {
                    qualityKey: qcase.qualityKey,
                    iconClass: qcase.iconClass,
                    accentClass: qcase.accentClass,
                    payloadJson,
                    labelKey,
                    descKey,
                };

                const result = await page.evaluate(async (inputs) => {
                    /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                    const templatePath = '/systems/wh40k-rpg/templates/chat/weapon-quality-effect-chat.hbs';
                    let error: string | null = null;
                    let rendered = false;
                    let hasCardRoot = false;
                    let hasSystemAttr = false;
                    let hasWh40kAncestor = false;
                    let hasQualityKeyAttr = false;

                    try {
                        const g = globalThis as any;
                        const renderTemplate = g.foundry?.applications?.handlebars?.renderTemplate as
                            | ((path: string, ctx: object) => Promise<string>)
                            | undefined;
                        if (typeof renderTemplate !== 'function') {
                            return {
                                rendered,
                                hasCardRoot,
                                hasSystemAttr,
                                hasWh40kAncestor,
                                hasQualityKeyAttr,
                                error: 'renderTemplate unavailable',
                            };
                        }

                        const ctx = {
                            gameSystem: 'dh2e',
                            qualityKey: inputs.qualityKey,
                            qualityLabelKey: inputs.labelKey,
                            qualityDescKey: inputs.descKey,
                            accentClass: inputs.accentClass,
                            iconClass: inputs.iconClass,
                            payload: JSON.parse(inputs.payloadJson),
                        };

                        let html = '';
                        try {
                            html = await renderTemplate(templatePath, ctx);
                        } catch (err) {
                            error = String((err as Error)?.message ?? err);
                        }

                        if (html) {
                            // Mount under a .wh40k-rpg ancestor so the
                            // Tailwind utility scoping (important:
                            // '.wh40k-rpg') cascades the way it would in a
                            // live chat message (CLAUDE.md Gotcha 3a).
                            const host = document.createElement('div');
                            host.id = '__c9qualcard';
                            host.className = 'wh40k-rpg';
                            host.style.position = 'fixed';
                            host.style.top = '40px';
                            host.style.left = '40px';
                            host.style.width = '460px';
                            host.style.zIndex = '99999';
                            host.innerHTML = html;
                            document.body.appendChild(host);

                            const card = host.querySelector('.wh40k-quality-card');
                            rendered = card instanceof HTMLElement;
                            hasCardRoot = card !== null;
                            hasSystemAttr = card?.getAttribute('data-wh40k-system') === 'dh2e';
                            hasWh40kAncestor = card?.closest('.wh40k-rpg') !== null;
                            hasQualityKeyAttr = card?.getAttribute('data-quality-key') === inputs.qualityKey;
                        }
                    } catch (err) {
                        error = String((err as Error)?.message ?? err);
                    }

                    return {
                        rendered,
                        hasCardRoot,
                        hasSystemAttr,
                        hasWh40kAncestor,
                        hasQualityKeyAttr,
                        error,
                    };
                    /* eslint-enable @typescript-eslint/no-explicit-any */
                }, renderInputs);

                // Card is left mounted; snap() captures the live DOM.
                await snap(page, `weapon-quality-${qcase.name}`);

                // Tear down so we don't leak between iterations.
                await page.evaluate(() => {
                    document.getElementById('__c9qualcard')?.remove();
                });

                expect(result.error, `card probe error: ${result.error ?? ''}`).toBeNull();
                expect(result.rendered, 'card root did not render').toBe(true);
                expect(result.hasCardRoot, 'expected .wh40k-quality-card element').toBe(true);
                expect(result.hasSystemAttr, 'expected data-wh40k-system="dh2e"').toBe(true);
                expect(result.hasWh40kAncestor, 'card needs .wh40k-rpg ancestor for Tailwind scoping (Gotcha 3a)').toBe(true);
                expect(result.hasQualityKeyAttr, `expected data-quality-key="${qcase.qualityKey}"`).toBe(true);
                expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

                recordCoverage('chat.card-render', `weapon-quality-${qcase.qualityKey}`);
            } finally {
                page.off('pageerror', listener);
            }
        });
    }
});
