export class CodeTooltip {
	element: HTMLElement;
	constructor() {
		this.element = document.createElement('div');
		this.element.className = 'code-tooltip';
		this.element.innerHTML = `
			<div class="tooltip-content">
				<span class="color-circle"></span>
				<span class="code-name"></span>
				<button class="remove-code">x</button>
			</div>
		`;
		document.body.appendChild(this.element);

		const removeButton = this.element.querySelector('.remove-code');
		if (removeButton) {
			removeButton.addEventListener('click', () => {
				this.removeCode();
			});
		}
	}

	show(target: HTMLElement, code: string, color: string) {
		const rect = target.getBoundingClientRect();
		this.element.style.top = `${rect.top - 30}px`;
		this.element.style.left = `${rect.left}px`;

		const colorCircle = this.element.querySelector('.color-circle');
		if (colorCircle) {
			(colorCircle as HTMLElement).style.backgroundColor = color;
		}

		const codeNameElement = this.element.querySelector('.code-name');
		if (codeNameElement) {
			codeNameElement.textContent = code;
		}

		this.element.style.display = 'block';
	}

	hide() {
		this.element.style.display = 'none';
	}

	removeCode() {
		const selection = window.getSelection();
		if (selection && selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			const span = range.commonAncestorContainer.parentElement;
			if (span && span.classList.contains('coded-text')) {
				const cleanedText = span.innerHTML;
				span.outerHTML = cleanedText;
			}
		}
		this.hide();
	}
}