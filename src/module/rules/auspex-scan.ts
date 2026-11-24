/**
 * @file An auspex scan (#759): which contacts a scanner finds from where it stands.
 *
 * Every line that prints an auspex gives it the same shape: a Tech-Use test reveals
 * life signs, motion and emissions within a range, and a wall thicker than the scanner
 * can see through (or a shielding material) hides what is behind it. The range, the
 * test and the thickness are content data on the scanner item (`GearData.scanner`).
 *
 * Foundry walls have no thickness of their own, so a wall carries what a scan needs
 * as flags the GM sets: its thickness in centimetres, and whether it shields. A wall
 * with neither is treated as thin and does not block a scan.
 *
 * Pure: points are in canvas pixels, distances come back in metres.
 */

/** A point on the canvas, in pixels. */
export interface ScanPoint {
    x: number;
    y: number;
}

/** What a contact reads as on the scanner. */
export type ContactKind = 'life' | 'machine';

/** The scanner item's data (`GearData.scanner`). */
export interface ScannerData {
    range: number;
    testSkill: string;
    wallPenetration: number;
    poorWallPenetration: number | null;
    perRound: number | null;
}

/** How far a scan reaches and how much wall it sees through. */
export interface ScannerReach {
    /** Metres. */
    range: number;
    /** Centimetres of wall it sees through. */
    wallPenetration: number;
}

/** A wall between the scanner and a contact. */
export interface ScanWall {
    a: ScanPoint;
    b: ScanPoint;
    /** Thickness in centimetres, or null when the GM has not set one (a thin wall). */
    thickness: number | null;
    /** A shielding material that blocks any scan. */
    shielded: boolean;
}

/** A token the scan might find. */
export interface ScanCandidate {
    id: string;
    name: string;
    center: ScanPoint;
    kind: ContactKind;
}

/** A contact the scan found. */
export interface ScanContact {
    id: string;
    name: string;
    kind: ContactKind;
    /** Metres from the scanner, to one decimal. */
    distance: number;
    /** Bearing from the scanner in degrees clockwise from north (canvas up), 0–359. */
    bearing: number;
    center: ScanPoint;
}

/** The scanner's reach for its craftsmanship, or null when the item is not a scanner. */
export function scannerReach(scanner: ScannerData, craftsmanship: string): ScannerReach | null {
    if (scanner.range <= 0) return null;
    const poor = craftsmanship === 'poor' && scanner.poorWallPenetration !== null;
    return { range: scanner.range, wallPenetration: poor ? scanner.poorWallPenetration ?? scanner.wallPenetration : scanner.wallPenetration };
}

/** Whether a wall stops a scan with this reach: it shields, or it is thicker than the scanner sees through. */
export function wallBlocksScan(wall: ScanWall, reach: ScannerReach): boolean {
    return wall.shielded || (wall.thickness !== null && wall.thickness > reach.wallPenetration);
}

/** Orientation of the turn p → q → r: positive, negative or 0 when collinear. */
function orientation(p: ScanPoint, q: ScanPoint, r: ScanPoint): number {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

/** Whether the segments p1–p2 and p3–p4 cross (touching at an end counts). */
export function segmentsCross(p1: ScanPoint, p2: ScanPoint, p3: ScanPoint, p4: ScanPoint): boolean {
    const d1 = orientation(p3, p4, p1);
    const d2 = orientation(p3, p4, p2);
    const d3 = orientation(p1, p2, p3);
    const d4 = orientation(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0) || d3 === 0 || d4 === 0);
}

/** Bearing from one point to another, degrees clockwise from canvas up. */
function bearingOf(from: ScanPoint, to: ScanPoint): number {
    const degrees = (Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI;
    return Math.round((degrees + 360) % 360);
}

/**
 * The contacts a scan from `origin` finds: every candidate within the reach's range
 * whose line from the scanner crosses no wall that blocks it, nearest first.
 * `pixelsPerMetre` converts canvas distances to metres.
 */
export function scanContacts(
    origin: ScanPoint,
    candidates: readonly ScanCandidate[],
    walls: readonly ScanWall[],
    pixelsPerMetre: number,
    reach: ScannerReach,
): ScanContact[] {
    const blocking = walls.filter((wall) => wallBlocksScan(wall, reach));
    const contacts: ScanContact[] = [];
    for (const candidate of candidates) {
        const metres = Math.hypot(candidate.center.x - origin.x, candidate.center.y - origin.y) / pixelsPerMetre;
        if (metres > reach.range) continue;
        if (blocking.some((wall) => segmentsCross(origin, candidate.center, wall.a, wall.b))) continue;
        contacts.push({
            id: candidate.id,
            name: candidate.name,
            kind: candidate.kind,
            distance: Math.round(metres * 10) / 10,
            bearing: bearingOf(origin, candidate.center),
            center: candidate.center,
        });
    }
    return contacts.sort((a, b) => a.distance - b.distance);
}

/** The round a scanner last scanned in. */
export interface ScanStamp {
    combatId: string;
    round: number;
}

/** Whether a scan may be made now: outside combat always; in combat, not twice in a round when the scanner is limited. */
export function scanAllowed(last: ScanStamp | null, combat: ScanStamp | null, perRound: number | null): boolean {
    if (perRound === null || combat === null || last === null) return true;
    return last.combatId !== combat.combatId || last.round !== combat.round;
}

/** Actor types that read as machines on a scanner (vehicles and craft); every other actor is a life sign. */
export function contactKindFor(actorType: string): ContactKind {
    return /(?:vehicle|terracraft|aircraft|watercraft|voidcraft|starship)$/.test(actorType) ? 'machine' : 'life';
}
