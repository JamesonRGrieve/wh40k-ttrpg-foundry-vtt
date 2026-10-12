/**
 * Type declarations for `resolve-adventures.cjs`, the build-time Adventure
 * resolver, so `.ts` tests can drive it with full types under `tsconfig.test.json`.
 */
import type { PackJson, PackSourceDoc } from './lib/pack-sublevels.cjs';

/** A pack source document as read from disk (its `_id` not yet checked). */
export interface PackSourceDocument {
    [field: string]: PackJson;
}

/** One document embedded in a compiled Adventure. */
export interface EmbeddedDocument extends PackSourceDoc {
    name: string;
}

/** A compiled Adventure document: the source's fields plus its embedded content sets. */
export interface CompiledAdventure extends PackSourceDoc {
    journal: EmbeddedDocument[];
    actors: EmbeddedDocument[];
    items: EmbeddedDocument[];
    scenes: EmbeddedDocument[];
}

/** One indexed compendium document. */
export interface UuidIndexEntry {
    doc: PackSourceDocument;
    packName: string;
    collection: string;
}

/** Compendium UUID → source document, across every pack under one root. */
export type UuidIndex = Map<string, UuidIndexEntry>;

export const COMPENDIUM_PREFIX: string;

/** Index every pack source document under `packsRoot` by its Compendium UUID. */
export function buildUuidIndex(packsRoot: string, resolveSource: (filePath: string) => PackSourceDocument): UuidIndex;

/** The collection a pack folder holds (`actors`, `items`, `adventures`, …). */
export function collectionForPack(folder: string): string;

/** Resolve a DRY Adventure source into the compiled Adventure document. */
export function resolveAdventure(source: PackSourceDocument, uuidIndex: UuidIndex, sourceLabel: string): CompiledAdventure;

/** The scenario flag payload on any of an adventure's journal pages, or null. */
export function findScenario(journalEntries: readonly PackSourceDocument[]): PackSourceDocument | null;

/** Every Compendium UUID a scenario references, grouped by Adventure field. */
export function collectScenarioUuids(scenario: PackSourceDocument): Record<string, Set<string>>;

/** A source doc's journal content as JournalEntry documents. */
export function normaliseJournal(source: PackSourceDocument): PackSourceDocument[];
