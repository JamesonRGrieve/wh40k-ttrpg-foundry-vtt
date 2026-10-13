/**
 * @file Canvas glue for area attacks (#599): place an attack's MeasuredTemplate and
 * read back the tokens inside it.
 *
 * Placement creates one of Foundry's own template documents, so the user then moves or
 * rotates it with the native template tools (drag, Shift+wheel) before resolving. All
 * geometry lives in the pure `rules/area-template.ts`; this module only converts
 * between canvas pixels and scene units and talks to Foundry.
 */

import { t } from '../i18n/t.ts';
import { type AreaPoint, type AreaTemplateSpec, type PlacedArea, areaPlacement, collectInArea } from '../rules/area-template.ts';
import type { ScatterVector } from '../rules/scatter.ts';

type CanvasToken = foundry.canvas.placeables.Token;

/** Where an attack's template lives, so the resolve step finds it again after the user adjusts it. */
export interface AreaTemplateRef {
    sceneId: string;
    templateId: string;
}

/** The template document fields this module reads back. */
interface TemplateGeometry {
    t: string;
    x: number;
    y: number;
    distance: number;
    direction: number;
    angle: number;
}

/** Canvas pixels per scene unit (metre) on the active scene, or null without a canvas. */
function pixelsPerUnit(): number | null {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `canvas.dimensions` is null until a scene is drawn
    const perUnit = canvas.dimensions?.distancePixels;
    return perUnit === undefined || perUnit <= 0 ? null : perUnit;
}

function toUnits(point: { x: number; y: number }, ppu: number): AreaPoint {
    return { x: point.x / ppu, y: point.y / ppu };
}

/** The first token of an actor on the active scene, if any. */
export function activeTokenOf(actor: { getActiveTokens: () => CanvasToken[] } | null | undefined): CanvasToken | null {
    return actor?.getActiveTokens()[0] ?? null;
}

/**
 * Create the attack's template on the active scene and select it so the user can adjust
 * it with the native tools. Returns null (after a warning) when there is no scene.
 *
 * @param spec     The area the attack's quality declares.
 * @param firer    The attacker's token.
 * @param target   The declared target's token, or null.
 * @param scatter  The scatter a missed impact template rolled, or null.
 */
export async function placeAreaTemplate(
    spec: AreaTemplateSpec,
    firer: CanvasToken,
    target: CanvasToken | null,
    scatter: ScatterVector | null,
): Promise<AreaTemplateRef | null> {
    const scene = canvas.scene;
    const ppu = pixelsPerUnit();
    if (scene === null || ppu === null) {
        ui.notifications.warn(t('WH40K.AreaAttack.NoCanvas'));
        return null;
    }
    const { origin, direction } = areaPlacement({
        anchor: spec.anchor,
        firer: toUnits(firer.center, ppu),
        firerRotation: firer.document.rotation,
        target: target === null ? null : toUnits(target.center, ppu),
        scatter,
    });
    const createdDocs = await scene.createEmbeddedDocuments('MeasuredTemplate', [
        {
            t: spec.shape,
            x: origin.x * ppu,
            y: origin.y * ppu,
            distance: spec.distance,
            direction,
            angle: spec.angle,
        },
    ]);
    const created = createdDocs.at(0);
    if (created === undefined) return null;
    created.object?.control({ releaseOthers: true });
    return { sceneId: scene.id, templateId: created.id };
}

/** The placed area of a template document, in scene units. */
function placedArea(doc: TemplateGeometry, ppu: number): PlacedArea {
    return {
        shape: doc.t === 'cone' ? 'cone' : 'circle',
        origin: toUnits(doc, ppu),
        distance: doc.distance,
        direction: doc.direction,
        angle: doc.angle,
    };
}

/**
 * The tokens whose centre lies inside the attack's template as it is now (after any
 * move or rotation), excluding the firer. Null when the template or scene is gone.
 */
export function tokensInAreaTemplate(ref: AreaTemplateRef, exclude: ReadonlySet<string>): CanvasToken[] | null {
    const scene = canvas.scene;
    const ppu = pixelsPerUnit();
    if (scene === null || ppu === null || scene.id !== ref.sceneId) return null;
    const doc = scene.templates.get(ref.templateId);
    if (doc === undefined) return null;
    const candidates = (canvas.tokens?.placeables ?? []).map((token) => ({ id: token.id, center: toUnits(token.center, ppu), token }));
    return collectInArea(placedArea(doc, ppu), candidates, exclude).map((c) => c.token);
}
