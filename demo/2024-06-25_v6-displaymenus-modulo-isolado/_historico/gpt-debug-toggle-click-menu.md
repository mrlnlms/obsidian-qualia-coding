
Entendi, copiei e usei seu código mas infelizmente o obsidian não respondeu como eu gostaria. Vou encaminhar para você o código onde eu trabalho com os eventos de mouse para você analisar se há algum problema nesta parte ao invés da lógica que você construiu para o toggle.



```js
if ((evt.target as HTMLElement).closest('.menu-item-toggle')) {
			if(!this.codingtMenuOpened){
				new Notice("Entrouuu")
            	resetMenu(plugin, false);
				this.contextMenuOpened = false;
				this.codingMenuOpened = true; // Neste caso precisa ser true para não exibir de novo após o menu de contexto ser clicado por alguma opção.
				return;
        	}
		}

```
