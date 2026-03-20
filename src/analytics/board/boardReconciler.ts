import type { CodeDefinitionRegistry } from '../../core/codeDefinitionRegistry';
import type { ConsolidatedData } from '../data/dataTypes';
import type { App } from 'obsidian';

export interface ReconcileResult {
  colorsUpdated: number;
  namesUpdated: number;
  countsUpdated: number;
  codesMarkedDeleted: number;
  excerptsOrphaned: number;
  arrowsRemoved: number;
  clustersUpdated: number;
}

export function reconcileBoard(
  canvas: { getObjects(): any[]; remove(...objs: any[]): void },
  registry: CodeDefinitionRegistry,
  data: ConsolidatedData,
  app: App,
): ReconcileResult {
  const result: ReconcileResult = {
    colorsUpdated: 0, namesUpdated: 0, countsUpdated: 0,
    codesMarkedDeleted: 0, excerptsOrphaned: 0, arrowsRemoved: 0, clustersUpdated: 0,
  };

  // Pre-compute marker counts per code
  const markerCounts = new Map<string, number>();
  const markerSources = new Map<string, Set<string>>();
  for (const m of data.markers) {
    for (const c of m.codes) {
      markerCounts.set(c, (markerCounts.get(c) ?? 0) + 1);
      if (!markerSources.has(c)) markerSources.set(c, new Set());
      markerSources.get(c)!.add(m.source);
    }
  }

  const objects = canvas.getObjects();

  // Collect all boardIds for arrow validation
  const boardIds = new Set<string>();
  for (const obj of objects) {
    if (obj.boardId) boardIds.add(obj.boardId);
  }

  const toRemove: any[] = [];

  for (const obj of objects) {
    switch (obj.boardType) {
      case 'codeCard':
        reconcileCodeCard(obj, registry, markerCounts, markerSources, result);
        break;
      case 'excerpt':
        reconcileExcerpt(obj, registry, app, result);
        break;
      case 'arrow-line':
        if (!boardIds.has(obj.boardFromId) || !boardIds.has(obj.boardToId)) {
          toRemove.push(obj);
          // Also remove matching arrow-head
          for (const other of objects) {
            if (other.boardType === 'arrow-head' && other.boardId === obj.boardId) {
              toRemove.push(other);
            }
          }
          result.arrowsRemoved++;
        }
        break;
      case 'cluster-frame':
        reconcileCluster(obj, registry, canvas, toRemove, result);
        break;
    }
  }

  if (toRemove.length > 0) {
    canvas.remove(...toRemove);
  }

  return result;
}

function reconcileCodeCard(
  card: any,
  registry: CodeDefinitionRegistry,
  counts: Map<string, number>,
  sources: Map<string, Set<string>>,
  result: ReconcileResult,
): void {
  // Already marked deleted — skip
  if (card.boardDeleted) return;

  const def = registry.getByName(card.boardCodeName);

  if (!def) {
    // Code was deleted
    card.boardCodeName = `(deletado) ${card.boardCodeName}`;
    card.boardColor = '#888';
    card.boardDeleted = true;
    card.boardMarkerCount = 0;
    card.boardSources = [];
    result.codesMarkedDeleted++;
    return;
  }

  // Color changed
  if (def.color !== card.boardColor) {
    card.boardColor = def.color;
    result.colorsUpdated++;
  }

  // Count changed
  const currentCount = counts.get(card.boardCodeName) ?? 0;
  if (currentCount !== card.boardMarkerCount) {
    card.boardMarkerCount = currentCount;
    result.countsUpdated++;
  }

  // Sources changed
  const currentSources = Array.from(sources.get(card.boardCodeName) ?? []).sort();
  const oldSources = [...(card.boardSources ?? [])].sort();
  if (JSON.stringify(currentSources) !== JSON.stringify(oldSources)) {
    card.boardSources = currentSources;
  }
}

function reconcileExcerpt(
  excerpt: any,
  registry: CodeDefinitionRegistry,
  app: App,
  result: ReconcileResult,
): void {
  // Check file exists
  if (!excerpt.boardOrphaned) {
    const file = app.vault.getAbstractFileByPath(excerpt.boardFile);
    if (!file) {
      excerpt.boardOrphaned = true;
      result.excerptsOrphaned++;
    }
  }

  // Reconcile code chips
  const codes: string[] = excerpt.boardCodes ?? [];
  const colors: string[] = excerpt.boardCodeColors ?? [];
  const newCodes: string[] = [];
  const newColors: string[] = [];
  let changed = false;

  for (let i = 0; i < codes.length; i++) {
    const def = registry.getByName(codes[i]!);
    if (!def) {
      // Code deleted — remove from chips
      changed = true;
      continue;
    }
    newCodes.push(def.name);
    // Update color if changed
    if (colors[i] !== def.color) {
      changed = true;
    }
    newColors.push(def.color);
  }

  if (changed) {
    excerpt.boardCodes = newCodes;
    excerpt.boardCodeColors = newColors;
  }
}

function reconcileCluster(
  cluster: any,
  registry: CodeDefinitionRegistry,
  canvas: { remove(...objs: any[]): void },
  toRemove: any[],
  result: ReconcileResult,
): void {
  const names: string[] = cluster.boardCodeNames ?? [];
  const filtered = names.filter((n: string) => registry.getByName(n));

  if (filtered.length !== names.length) {
    result.clustersUpdated++;
    if (filtered.length === 0) {
      toRemove.push(cluster);
    } else {
      cluster.boardCodeNames = filtered;
    }
  }
}

export function buildSummary(r: ReconcileResult): string {
  const parts: string[] = [];
  if (r.colorsUpdated > 0) parts.push(`${r.colorsUpdated} cores`);
  if (r.namesUpdated > 0) parts.push(`${r.namesUpdated} nomes`);
  if (r.countsUpdated > 0) parts.push(`${r.countsUpdated} contagens`);
  if (r.codesMarkedDeleted > 0) parts.push(`${r.codesMarkedDeleted} cards deletados`);
  if (r.excerptsOrphaned > 0) parts.push(`${r.excerptsOrphaned} excertos orfaos`);
  if (r.arrowsRemoved > 0) parts.push(`${r.arrowsRemoved} arrows removidas`);
  if (r.clustersUpdated > 0) parts.push(`${r.clustersUpdated} clusters atualizados`);
  if (parts.length === 0) return '';
  return `Board atualizado: ${parts.join(', ')}`;
}

export function hasChanges(r: ReconcileResult): boolean {
  return Object.values(r).some(v => v > 0);
}
