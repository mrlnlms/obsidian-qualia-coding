/**
 * Stress tests for hierarchy operations.
 *
 * Generates large registries and measures execution time.
 * Thresholds are generous — goal is regression detection, not hard limits.
 *
 * Run with: npx vitest run tests/core/hierarchyStress.test.ts
 */

import { describe, it, expect } from 'vitest';
import { CodeDefinitionRegistry } from '../../src/core/codeDefinitionRegistry';
import { buildFlatTree, buildCountIndex, createExpandedState } from '../../src/core/hierarchyHelpers';
import type { BaseMarker, CodeApplication } from '../../src/core/types';

// ── Helpers ───────────────────────────────────────────────────

function makeMarker(id: string, codes: CodeApplication[]): BaseMarker {
	return { markerType: 'markdown', id, fileId: `file-${id}.md`, codes, createdAt: 0, updatedAt: 0 };
}

function bench(label: string, fn: () => void): number {
	const start = performance.now();
	fn();
	const ms = performance.now() - start;
	return ms;
}

// ── Tests ─────────────────────────────────────────────────────

describe('hierarchy stress tests', () => {
	const results: Array<{ test: string; ms: number }> = [];

	it('buildFlatTree with 5000 flat codes < 100ms', () => {
		const registry = new CodeDefinitionRegistry();
		for (let i = 0; i < 5000; i++) {
			registry.create(`code_${String(i).padStart(5, '0')}`);
		}
		const expanded = createExpandedState();

		const ms = bench('flatTree-5000-flat', () => {
			buildFlatTree(registry, expanded);
		});
		results.push({ test: 'flatTree 5000 flat', ms });
		console.log(`  flatTree 5000 flat: ${ms.toFixed(1)}ms`);
		expect(ms).toBeLessThan(100);
	});

	it('buildFlatTree with 5000 hierarchical codes (200 roots x 25 children) < 100ms', () => {
		const registry = new CodeDefinitionRegistry();
		const rootIds: string[] = [];

		for (let r = 0; r < 200; r++) {
			const root = registry.create(`root_${String(r).padStart(3, '0')}`);
			rootIds.push(root.id);
			for (let c = 0; c < 25; c++) {
				registry.create(`root_${String(r).padStart(3, '0')}/child_${String(c).padStart(2, '0')}`, undefined, undefined, root.id);
			}
		}

		// Expand all roots
		const expanded = createExpandedState();
		for (const id of rootIds) expanded.codes.add(id);

		const ms = bench('flatTree-5000-hierarchical', () => {
			buildFlatTree(registry, expanded);
		});
		results.push({ test: 'flatTree 5000 hierarchical (all expanded)', ms });
		console.log(`  flatTree 5000 hierarchical: ${ms.toFixed(1)}ms`);
		expect(ms).toBeLessThan(100);
	});

	it('buildCountIndex with 5000 codes and 10000 markers < 200ms', () => {
		const registry = new CodeDefinitionRegistry();
		const codeIds: string[] = [];

		// 200 roots x 25 children = 5000
		for (let r = 0; r < 200; r++) {
			const root = registry.create(`count_root_${r}`);
			codeIds.push(root.id);
			for (let c = 0; c < 25; c++) {
				const child = registry.create(`count_root_${r}/child_${c}`, undefined, undefined, root.id);
				codeIds.push(child.id);
			}
		}

		// Generate 10000 markers, each with 1-3 codes
		const markers: BaseMarker[] = [];
		for (let i = 0; i < 10000; i++) {
			const numCodes = 1 + (i % 3);
			const codes: CodeApplication[] = [];
			for (let c = 0; c < numCodes; c++) {
				codes.push({ codeId: codeIds[(i + c) % codeIds.length]! });
			}
			markers.push(makeMarker(`m_${i}`, codes));
		}

		const ms = bench('countIndex-5000-codes-10000-markers', () => {
			buildCountIndex(registry, markers);
		});
		results.push({ test: 'countIndex 5000 codes + 10000 markers', ms });
		console.log(`  countIndex 5000+10000: ${ms.toFixed(1)}ms`);
		expect(ms).toBeLessThan(200);
	});

	it('deep hierarchy (100 levels) does not stack overflow', () => {
		const registry = new CodeDefinitionRegistry();
		let parentId: string | undefined;

		for (let i = 0; i < 100; i++) {
			const def = registry.create(`level_${i}`, undefined, undefined, parentId);
			parentId = def.id;
		}

		// getDepth should return 99 for the deepest node
		const depth = registry.getDepth(parentId!);
		expect(depth).toBe(99);

		// buildFlatTree should not stack overflow
		const expanded = createExpandedState();
		for (const def of registry.getAll()) {
			expanded.codes.add(def.id);
		}
		const tree = buildFlatTree(registry, expanded);
		expect(tree.length).toBe(100);
		expect(tree[99]!.depth).toBe(99);

		console.log('  deep hierarchy (100 levels): OK');
	});

	it('setParent cycle detection with 1000 nodes < 10ms', () => {
		const registry = new CodeDefinitionRegistry();
		const ids: string[] = [];

		// Build a chain: 0 → 1 → 2 → ... → 999
		for (let i = 0; i < 1000; i++) {
			const def = registry.create(`chain_${i}`);
			ids.push(def.id);
		}
		for (let i = 1; i < 1000; i++) {
			registry.setParent(ids[i]!, ids[i - 1]!);
		}

		// Try to create cycle: set node 0's parent to node 999
		const ms = bench('cycleDetection-1000', () => {
			const result = registry.setParent(ids[0]!, ids[999]!);
			expect(result).toBe(false); // should be rejected
		});
		results.push({ test: 'cycle detection 1000-node chain', ms });
		console.log(`  cycle detection 1000-chain: ${ms.toFixed(3)}ms`);
		expect(ms).toBeLessThan(10);
	});

	it('search filter with 5000 codes < 50ms', () => {
		const registry = new CodeDefinitionRegistry();
		for (let i = 0; i < 5000; i++) {
			registry.create(`search_code_${String(i).padStart(5, '0')}`);
		}
		const expanded = createExpandedState();

		const ms = bench('search-5000', () => {
			// Search for a substring that matches ~50 codes
			const result = buildFlatTree(registry, expanded, '00042');
			expect(result.length).toBeGreaterThan(0);
		});
		results.push({ test: 'search filter 5000 codes', ms });
		console.log(`  search filter 5000: ${ms.toFixed(1)}ms`);
		expect(ms).toBeLessThan(50);
	});

	// Print summary
	it('prints stress test summary', () => {
		console.log('\n╔════════════════════════════════════════════════════════╗');
		console.log('║           HIERARCHY STRESS TEST RESULTS               ║');
		console.log('╠════════════════════════════════════════════════════════╣');
		console.log('║ Test                                    │ Time (ms)   ║');
		console.log('╠═════════════════════════════════════════╪═════════════╣');
		for (const r of results) {
			const test = r.test.padEnd(39);
			const ms = r.ms.toFixed(1).padStart(8);
			console.log(`║ ${test} │ ${ms} ms ║`);
		}
		console.log('╚════════════════════════════════════════════════════════╝');
		expect(true).toBe(true);
	});
});
