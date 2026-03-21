import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type { CodeDefinition } from './types';
import type { CodeDefinitionRegistry } from './codeDefinitionRegistry';

/**
 * Fuzzy search modal for browsing and selecting code definitions.
 * Uses Obsidian's native FuzzySuggestModal for familiar UX and fuzzy matching.
 */
export class CodeBrowserModal extends FuzzySuggestModal<CodeDefinition> {
	private registry: CodeDefinitionRegistry;
	private onSelectCode: (codeName: string) => void;
	private onDismiss?: () => void;

	constructor(
		app: App,
		registry: CodeDefinitionRegistry,
		onSelect: (codeName: string) => void,
		onDismiss?: () => void
	) {
		super(app);
		this.registry = registry;
		this.onSelectCode = onSelect;
		this.onDismiss = onDismiss;
		this.setPlaceholder('Search codes...');
	}

	getItems(): CodeDefinition[] {
		return this.registry.getAll();
	}

	getItemText(item: CodeDefinition): string {
		return item.description ? `${item.name} — ${item.description}` : item.name;
	}

	renderSuggestion(match: FuzzyMatch<CodeDefinition>, el: HTMLElement): void {
		super.renderSuggestion(match, el);
		const swatch = el.createSpan({ cls: 'codemarker-code-browser-swatch' });
		swatch.style.backgroundColor = match.item.color;
		el.insertBefore(swatch, el.firstChild);
	}

	onChooseItem(item: CodeDefinition): void {
		this.onSelectCode(item.name);
	}

	onClose(): void {
		super.onClose();
		this.onDismiss?.();
	}
}
