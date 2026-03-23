
import type { FilterConfig } from "../../data/dataTypes";
import type { AnalyticsViewContext } from "../analyticsViewContext";
import { isLightColor, buildCsv } from "../shared/chartHelpers";
import { readAllData } from "../../data/dataReader";
import { extractRelationEdges, extractRelationNodes } from "../../data/relationsEngine";
import type { RelationEdge } from "../../../core/relationHelpers";
import type { CodeDefinition, BaseMarker } from "../../../core/types";

// ─── Helpers ───

function collectAllMarkers(ctx: AnalyticsViewContext): BaseMarker[] {
	const raw = readAllData(ctx.plugin.dataManager);
	const markers: BaseMarker[] = [];
	for (const fileMarkers of Object.values(raw.markdown.markers)) markers.push(...fileMarkers);
	// Engine-specific types lack markerType; cast to extract relation data
	markers.push(...(raw.csv.segmentMarkers as unknown as BaseMarker[]));
	markers.push(...(raw.csv.rowMarkers as unknown as BaseMarker[]));
	markers.push(...(raw.image.markers as unknown as BaseMarker[]));
	markers.push(...(raw.pdf.markers as unknown as BaseMarker[]));
	markers.push(...(raw.pdf.shapes as unknown as BaseMarker[]));
	for (const af of raw.audio.files) markers.push(...(af.markers as unknown as BaseMarker[]));
	for (const vf of raw.video.files) markers.push(...(vf.markers as unknown as BaseMarker[]));
	return markers;
}

function collectAllDefinitions(ctx: AnalyticsViewContext): CodeDefinition[] {
	const raw = readAllData(ctx.plugin.dataManager);
	const defs = raw.markdown.codeDefinitions;
	return Object.values(defs);
}

// ─── Options section ───

export function renderRelationsNetworkOptions(ctx: AnalyticsViewContext): void {
	const section = ctx.configPanelEl!.createDiv({ cls: "codemarker-config-section" });
	section.createDiv({ cls: "codemarker-config-section-title", text: "Relations Network options" });

	// Level dropdown
	const levelRow = section.createDiv({ cls: "codemarker-config-row" });
	levelRow.createSpan({ text: "Level" });
	const levelSel = levelRow.createEl("select", { cls: "codemarker-config-select" });
	levelSel.style.marginLeft = "auto";
	const optCode = levelSel.createEl("option", { value: "code", text: "Code-level" });
	const optBoth = levelSel.createEl("option", { value: "both", text: "Code + Segments" });
	levelSel.value = ctx.relationsLevel;
	levelSel.addEventListener("change", () => {
		ctx.relationsLevel = levelSel.value as 'code' | 'both';
		ctx.scheduleUpdate();
	});

	// Edge labels toggle
	const labelRow = section.createDiv({ cls: "codemarker-config-row" });
	const labelCb = labelRow.createEl("input", { type: "checkbox" });
	labelCb.checked = ctx.showEdgeLabels;
	labelRow.createSpan({ text: "Show edge labels" });
	labelCb.addEventListener("change", () => {
		ctx.showEdgeLabels = labelCb.checked;
		ctx.scheduleUpdate();
	});
	labelRow.addEventListener("click", (e) => {
		if (e.target !== labelCb) { labelCb.checked = !labelCb.checked; labelCb.dispatchEvent(new Event("change")); }
	});

	// suppress unused variable warnings
	void optCode; void optBoth;
}

// ─── Arrowhead helper ───

function drawArrowhead(
	c2d: CanvasRenderingContext2D,
	x1: number, y1: number,
	x2: number, y2: number,
	nodeRadius: number,
	color: string,
): void {
	const angle = Math.atan2(y2 - y1, x2 - x1);
	// tip of arrowhead at the edge of the target node
	const tipX = x2 - Math.cos(angle) * nodeRadius;
	const tipY = y2 - Math.sin(angle) * nodeRadius;
	const arrowLen = 10;
	const arrowAngle = Math.PI / 6;

	c2d.beginPath();
	c2d.moveTo(tipX, tipY);
	c2d.lineTo(
		tipX - arrowLen * Math.cos(angle - arrowAngle),
		tipY - arrowLen * Math.sin(angle - arrowAngle),
	);
	c2d.lineTo(
		tipX - arrowLen * Math.cos(angle + arrowAngle),
		tipY - arrowLen * Math.sin(angle + arrowAngle),
	);
	c2d.closePath();
	c2d.fillStyle = color;
	c2d.fill();
}

// ─── Point-to-segment distance ───

function distPointToSegment(
	px: number, py: number,
	ax: number, ay: number,
	bx: number, by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - ax, py - ay);
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// ─── Main render ───

export function renderRelationsNetwork(ctx: AnalyticsViewContext, filters: FilterConfig): void {
	if (!ctx.chartContainer) return;

	const allDefs = collectAllDefinitions(ctx);
	const allMarkers = collectAllMarkers(ctx);

	// Filter definitions by enabled codes (using names; we need ids from data)
	const filteredDefs = allDefs.filter(d => !filters.excludeCodes.includes(d.name));

	const edges = extractRelationEdges(filteredDefs, allMarkers, ctx.relationsLevel);

	if (edges.length === 0) {
		ctx.chartContainer.createDiv({
			cls: "codemarker-analytics-empty",
			text: "No relation edges found. Define relations on codes or code applications.",
		});
		return;
	}

	// Build frequency map (code id → count) from consolidated data
	const freqMap = new Map<string, number>();
	if (ctx.data) {
		for (const m of ctx.data.markers) {
			for (const codeNameOrId of m.codes) {
				const existing = freqMap.get(codeNameOrId) ?? 0;
				freqMap.set(codeNameOrId, existing + 1);
			}
		}
		// Also build by code id by matching name → id
		const nameToId = new Map(allDefs.map(d => [d.name, d.id]));
		const freqById = new Map<string, number>();
		for (const [nameOrId, count] of freqMap) {
			const id = nameToId.get(nameOrId) ?? nameOrId;
			freqById.set(id, (freqById.get(id) ?? 0) + count);
		}
		freqMap.clear();
		for (const [id, count] of freqById) freqMap.set(id, count);
	}

	const nodes = extractRelationNodes(filteredDefs, edges, freqMap);
	const n = nodes.length;

	// Canvas setup
	const wrapper = ctx.chartContainer.createDiv();
	wrapper.style.position = "relative";
	wrapper.style.width = "100%";
	wrapper.style.height = "100%";

	const canvas = wrapper.createEl("canvas");
	const rect = ctx.chartContainer.getBoundingClientRect();
	const W = Math.max(600, rect.width - 32);
	const H = Math.max(400, rect.height - 32);
	canvas.width = W;
	canvas.height = H;
	canvas.style.width = `${W}px`;
	canvas.style.height = `${H}px`;

	const c2d = canvas.getContext("2d")!;
	const isDark = document.body.classList.contains("theme-dark");
	const styles = getComputedStyle(document.body);
	const textColor = styles.getPropertyValue("--text-normal").trim() || (isDark ? "#dcddde" : "#1a1a1a");

	// Node sizing based on frequency
	const maxFreq = Math.max(...nodes.map(nd => nd.weight), 1);
	const minRadius = 16;
	const maxRadius = 40;

	// Index nodes
	const nodeIndex = new Map(nodes.map((nd, i) => [nd.id, i]));

	interface SimNode { x: number; y: number; vx: number; vy: number; radius: number; }
	const simNodes: SimNode[] = nodes.map((nd, i) => {
		const angle = (2 * Math.PI * i) / n;
		const spread = Math.min(W, H) * 0.35;
		const radius = minRadius + ((nd.weight / maxFreq) * (maxRadius - minRadius));
		return {
			x: W / 2 + Math.cos(angle) * spread,
			y: H / 2 + Math.sin(angle) * spread,
			vx: 0, vy: 0,
			radius,
		};
	});

	// Map edges to indices
	interface SimEdge { si: number; ti: number; edge: RelationEdge; }
	const simEdges: SimEdge[] = [];
	for (const edge of edges) {
		const si = nodeIndex.get(edge.source);
		const ti = nodeIndex.get(edge.target);
		if (si === undefined || ti === undefined) continue;
		simEdges.push({ si, ti, edge });
	}

	// Force-directed simulation
	const iterations = 200;
	const repulsion = 5000;
	const attraction = 0.01;
	const damping = 0.9;
	const centerGravity = 0.01;

	for (let iter = 0; iter < iterations; iter++) {
		// Repulsion between all pairs
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				const dx = simNodes[i]!.x - simNodes[j]!.x;
				const dy = simNodes[i]!.y - simNodes[j]!.y;
				const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
				const force = repulsion / (dist * dist);
				const fx = (dx / dist) * force;
				const fy = (dy / dist) * force;
				simNodes[i]!.vx += fx;
				simNodes[i]!.vy += fy;
				simNodes[j]!.vx -= fx;
				simNodes[j]!.vy -= fy;
			}
		}

		// Attraction along edges
		for (const se of simEdges) {
			const ni = simNodes[se.si]!;
			const nj = simNodes[se.ti]!;
			const dx = nj.x - ni.x;
			const dy = nj.y - ni.y;
			const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
			const force = dist * attraction;
			const fx = (dx / dist) * force;
			const fy = (dy / dist) * force;
			ni.vx += fx;
			ni.vy += fy;
			nj.vx -= fx;
			nj.vy -= fy;
		}

		// Center gravity + damping
		for (const node of simNodes) {
			node.vx += (W / 2 - node.x) * centerGravity;
			node.vy += (H / 2 - node.y) * centerGravity;
			node.vx *= damping;
			node.vy *= damping;
			node.x += node.vx;
			node.y += node.vy;
			node.x = Math.max(node.radius + 5, Math.min(W - node.radius - 5, node.x));
			node.y = Math.max(node.radius + 5, Math.min(H - node.radius - 5, node.y));
		}
	}

	// ── Draw ──

	const edgeBaseColor = isDark ? "rgba(180, 180, 200, {a})" : "rgba(80, 80, 100, {a})";

	// Edges
	for (const se of simEdges) {
		const ni = simNodes[se.si]!;
		const nj = simNodes[se.ti]!;
		const edge = se.edge;
		const thickness = Math.min(1 + edge.weight, 8);
		const opacity = 0.5;
		const color = edgeBaseColor.replace("{a}", String(opacity));

		c2d.save();
		c2d.beginPath();
		c2d.strokeStyle = color;
		c2d.lineWidth = thickness;

		// Dash style by level
		if (edge.level === 'segment') {
			c2d.setLineDash([6, 4]);
		} else if (edge.level === 'merged') {
			c2d.setLineDash([10, 3, 3, 3]);
		} else {
			c2d.setLineDash([]);
		}

		c2d.moveTo(ni.x, ni.y);
		c2d.lineTo(nj.x, nj.y);
		c2d.stroke();
		c2d.setLineDash([]);
		c2d.restore();

		// Arrowhead for directed edges
		if (edge.directed) {
			drawArrowhead(c2d, ni.x, ni.y, nj.x, nj.y, simNodes[se.ti]!.radius, color);
		}

		// Edge label
		if (ctx.showEdgeLabels && edge.label) {
			const mx = (ni.x + nj.x) / 2;
			const my = (ni.y + nj.y) / 2;
			c2d.font = "10px sans-serif";
			c2d.fillStyle = isDark ? "rgba(180,180,200,0.85)" : "rgba(80,80,100,0.85)";
			c2d.textAlign = "center";
			c2d.textBaseline = "middle";
			c2d.fillText(edge.label, mx, my - 6);
		}
	}

	// Nodes
	for (let i = 0; i < n; i++) {
		const node = simNodes[i]!;
		const nd = nodes[i]!;

		c2d.save();
		c2d.shadowColor = "rgba(0,0,0,0.2)";
		c2d.shadowBlur = 6;
		c2d.shadowOffsetX = 0;
		c2d.shadowOffsetY = 2;

		c2d.beginPath();
		c2d.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
		c2d.fillStyle = nd.color;
		c2d.fill();
		c2d.restore();

		c2d.beginPath();
		c2d.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
		c2d.strokeStyle = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
		c2d.lineWidth = 1.5;
		c2d.stroke();

		const label = nd.name.length > 12 ? nd.name.slice(0, 11) + "\u2026" : nd.name;
		c2d.font = `bold ${Math.max(10, Math.min(13, node.radius * 0.5))}px sans-serif`;
		c2d.textAlign = "center";
		c2d.textBaseline = "middle";
		c2d.fillStyle = isLightColor(nd.color) ? "#1a1a1a" : "#f0f0f0";
		c2d.fillText(label, node.x, node.y);
	}

	// Tooltip on hover (edges)
	const tooltip = wrapper.createDiv({ cls: "codemarker-analytics-tooltip" });
	tooltip.style.position = "absolute";
	tooltip.style.display = "none";
	tooltip.style.pointerEvents = "none";
	tooltip.style.background = isDark ? "rgba(30,30,40,0.92)" : "rgba(255,255,255,0.95)";
	tooltip.style.border = "1px solid " + (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)");
	tooltip.style.borderRadius = "6px";
	tooltip.style.padding = "6px 10px";
	tooltip.style.fontSize = "12px";
	tooltip.style.color = textColor;
	tooltip.style.whiteSpace = "pre";
	tooltip.style.zIndex = "100";
	tooltip.style.maxWidth = "260px";

	const HIT_THRESHOLD = 6;

	canvas.addEventListener("mousemove", (e) => {
		const cr = canvas.getBoundingClientRect();
		const mx = e.clientX - cr.left;
		const my = e.clientY - cr.top;

		// Check nodes first
		for (let i = 0; i < n; i++) {
			const node = simNodes[i]!;
			const dx = mx - node.x;
			const dy = my - node.y;
			if (dx * dx + dy * dy <= node.radius * node.radius) {
				const nd = nodes[i]!;
				const connections = simEdges
					.filter(se => se.si === i || se.ti === i)
					.map(se => {
						const otherId = se.si === i ? nodes[se.ti]?.id : nodes[se.si]?.id;
						const otherName = nodes.find(nd2 => nd2.id === otherId)?.name ?? otherId ?? "?";
						const arrow = se.edge.directed ? (se.si === i ? "→" : "←") : "↔";
						return `  ${arrow} ${otherName} [${se.edge.label}]`;
					});
				let text = `${nd.name} (freq: ${nd.weight})`;
				if (connections.length > 0) text += `\n${connections.join("\n")}`;
				tooltip.textContent = text;
				tooltip.style.display = "";
				tooltip.style.left = `${mx + 14}px`;
				tooltip.style.top = `${my + 14}px`;
				canvas.style.cursor = "pointer";
				return;
			}
		}

		// Check edges
		for (const se of simEdges) {
			const ni = simNodes[se.si]!;
			const nj = simNodes[se.ti]!;
			const dist = distPointToSegment(mx, my, ni.x, ni.y, nj.x, nj.y);
			if (dist <= HIT_THRESHOLD) {
				const edge = se.edge;
				const srcName = nodes[se.si]?.name ?? edge.source;
				const tgtName = nodes[se.ti]?.name ?? edge.target;
				const arrow = edge.directed ? "→" : "↔";
				const levelStr = edge.level.charAt(0).toUpperCase() + edge.level.slice(1);
				tooltip.textContent = `${srcName} ${arrow} ${tgtName}\nLabel: ${edge.label}\nLevel: ${levelStr}\nWeight: ${edge.weight}`;
				tooltip.style.display = "";
				tooltip.style.left = `${mx + 14}px`;
				tooltip.style.top = `${my + 14}px`;
				canvas.style.cursor = "default";
				return;
			}
		}

		tooltip.style.display = "none";
		canvas.style.cursor = "default";
	});

	canvas.addEventListener("mouseleave", () => {
		tooltip.style.display = "none";
		canvas.style.cursor = "default";
	});
}

// ─── CSV export ───

export function exportRelationsNetworkCSV(ctx: AnalyticsViewContext, date: string): void {
	const allDefs = collectAllDefinitions(ctx);
	const allMarkers = collectAllMarkers(ctx);
	const edges = extractRelationEdges(allDefs, allMarkers, ctx.relationsLevel);

	const defMap = new Map(allDefs.map(d => [d.id, d.name]));

	const rows = [["source", "target", "label", "directed", "level", "weight"]];
	for (const edge of edges) {
		rows.push([
			defMap.get(edge.source) ?? edge.source,
			defMap.get(edge.target) ?? edge.target,
			edge.label,
			String(edge.directed),
			edge.level,
			String(edge.weight),
		]);
	}

	const csvContent = buildCsv(rows);
	const blob = new Blob([csvContent], { type: "text/csv" });
	const link = document.createElement("a");
	link.download = `qualia-relations-network-${date}.csv`;
	link.href = URL.createObjectURL(blob);
	link.click();
	URL.revokeObjectURL(link.href);
}
