// # ./src/DisplayMenus.ts

import { Menu, Editor, TFile, Notice, MenuItem, Plugin, ToggleComponent, TextComponent } from 'obsidian';
import MyPlugin from '../main';
//import { addNewCode,addExistingCode,removeCode,removeAllCodes } from './Coding';
/*
* Melhorias:
* - Edição dos ícones e labels;
* 
*/ 

/** Cria os botões principais para interação com usuário, 
 * enquanto as outras funções são gerenciadas pelos Events.ts
 * 
 */
export function createCodingsMenu(plugin: MyPlugin){
	createRibbonButtons(plugin);
	createCommands(plugin);
}

/** Criando os botões ribbon
 * 
 */ 
function createRibbonButtons(plugin: MyPlugin): void {

	
	Object.values(plugin.menuOptions).forEach(option => {
		plugin.addRibbonIcon(option.icon, option.title, () => option.action(plugin));
	});

}

/** Cria os commands
 * 
 */
function createCommands(plugin: MyPlugin): void {
	Object.values(plugin.menuOptions).forEach(option => {
		plugin.addCommand({
			id: option.title.toLowerCase().replace(/ /g, '-'),
			name: option.title,
			callback: () => option.action(plugin)
		});
	});
}

/**
 * Essas funções abaixo são chamadas por meio dos Eventos Registrados no arquivo `Events.ts`. 
 * Elas criam os menus no editor ou no file-menu dinamicamente, ou seja, após o clique do usuário
 * em determinadas áreas da aplicação, citadas acima.
 **/


/** Cria o menu no menu contextual lateral superior direito (ao lado do título) e no file-menu. 
* Esta opção insere o mesmo menu contextual (click-right) no menu de arquivos;
* 
* * Melhorias:
* - Criar nova função `files-menu` e add ou remover codes que estão nos arquivos selecionados
* -- Talvez seja uma feature mais avançada que possa abrir pelo code e então remover dos arquivos
* 
*/
export function createFileMenu(menu: Menu, file: TFile, plugin: MyPlugin): void {
	
	createDefaultObsidianMenus(menu, plugin);
}


/** Cria o menu contextual (click-right) no Editor com as opções do plugin;
* 
*/
export function createEditorMenu(menu: Menu, plugin: MyPlugin): void {
	
	createDefaultObsidianMenus(menu, plugin);
}

/** Constrói a exibição do menu contextual do pluginque exibe as opções do plugin durante a seleção de trechos de texto
 * 
 */

/*
export async function createEditorCodingMenu(editor: Editor, evt: MouseEvent, plugin: MyPlugin) {
    const selectedText = editor.getSelection();
    if (selectedText && !plugin.selectionTriggeredMenu) {
        plugin.selectionTriggeredMenu = true;

        if (plugin.currentMenu) {
            plugin.currentMenu.hide();
        }

        const submenu = new Menu();

        plugin.menuOptions.forEach(option => {
            if (option.isToggle) { 
                submenu.addItem((item) => {
                    const toggleComponent = new ToggleComponent((item as any).dom);
                    toggleComponent.setValue(option.isEnabled ?? false);
                    toggleComponent.onChange((value) => {
                        option.isEnabled = value;
                        option.action(plugin);
                        plugin.selectionTriggeredMenu = false;
                        resetMenu(plugin, false); // Mantém o menu aberto ao clicar no toggle
                    });
                    item.setTitle(option.title)
                        .setIcon(option.icon);
                        (item as any).dom.classList.add('menu-item-toggle'); // Adicionar classe para identificação
                });
            }  else if (option.isTextField) {
                submenu.addItem((item) => {
                    const textComponent = new TextComponent((item as any).dom);
                    textComponent.setPlaceholder('Enter text....');
                    textComponent.onChange((value) => {
                        new Notice(`Entered text: ${value}`);
                        option.action(plugin);
                        //plugin.selectionTriggeredMenu = false;
                    });
                    item.setTitle(option.title)
                        .setIcon(option.icon);
                    (item as any).dom.classList.add('menu-item-textfield');
                });
            }else {
                submenu.addItem((item) => {
                    item.setTitle(option.title)
                        .setIcon(option.icon)
                        .onClick(() => {
                            option.action(plugin);
                            plugin.selectionTriggeredMenu = false;
                            resetMenu(plugin); // Fechar menu para itens não-toggle
                        });
                });
            } 
        });
        submenu.onHide(() => {
            
            // Só redefinir se o menu não foi interagido com um toggle
            if (!plugin.selectionTriggeredMenu) {
                new Notice("Foi 2")
                plugin.selectionTriggeredMenu = false;
            }
        });

        submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
        plugin.currentMenu = submenu;
    }
}

*/

/*
export async function createEditorCodingMenu(editor: Editor, evt: MouseEvent, plugin: MyPlugin) { 
	//new Notice(plugin.menuOptions)
	const selectedText = editor.getSelection();
	if (selectedText && !plugin.selectionTriggeredMenu) {
		plugin.selectionTriggeredMenu = true;
		
		if (plugin.currentMenu) {
			plugin.currentMenu.hide();
		}

		const submenu = new Menu();

		Object.values(plugin.menuOptions).forEach(option => {
			submenu.addItem((item) => {
				item.setTitle(option.title)
					.setIcon(option.icon)
					.onClick(() => {
                        if(option.title !== "Toggle Example"){
                            option.action(plugin);
                            resetMenu(plugin); 
                        } else {
                            new Notice("Será?")
                        }
						//option.action(plugin);
						//resetMenu(plugin);
					});
			});
		});

		submenu.onHide(() => {
			plugin.selectionTriggeredMenu = false;
		});

		submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
		plugin.currentMenu = submenu;
	}
} */

    export async function createEditorCodingMenu(editor: Editor, evt: MouseEvent, plugin: MyPlugin) {
        const selectedText = editor.getSelection();
        if (selectedText && !plugin.selectionTriggeredMenu) {
            plugin.selectionTriggeredMenu = true;
    
            if (plugin.currentMenu) {
                plugin.currentMenu.hide();
            }
    
            const submenu = new Menu();
    
            plugin.menuOptions.forEach(option => {
                if (option.isToggle) {
                    submenu.addItem((item) => {
                        const toggleComponent = new ToggleComponent((item as any).dom);
                        toggleComponent.setValue(option.isEnabled ?? false);
                        toggleComponent.onChange((value) => {
                            option.isEnabled = value;
                            option.action(plugin);
                        });
                        item.setTitle(option.title)
                            .setIcon(option.icon);
                        (item as any).dom.classList.add('menu-item-toggle');
    
                        // Adicionar event listener ao item inteiro para alterar o estado do toggle
                        (item as any).dom.addEventListener('click', (evt: MouseEvent) => {
                            evt.stopPropagation();
                            const currentValue = toggleComponent.getValue();
                            toggleComponent.setValue(!currentValue);
                        });
                    });
                } else if (option.isTextField) {
                    submenu.addItem((item) => {
                        const textComponent = new TextComponent((item as any).dom);
                        textComponent.setPlaceholder('Enter text...');
                        textComponent.onChange((value) => {
                            new Notice(`Entered text: ${value}`);
                            option.action(plugin);
                        });
                        item.setTitle(option.title)
                            .setIcon(option.icon);
                        (item as any).dom.classList.add('menu-item-textfield');
    
                        // Adicionar event listener para impedir o fechamento do menu e focar no campo de texto
                        (item as any).dom.addEventListener('click', (evt: MouseEvent) => {
                            evt.stopPropagation();
                            textComponent.inputEl.focus();
                        });
    
                        // Função para lidar com a tecla Enter
                        const handleEnterKey = (evt: KeyboardEvent) => {
                            if (evt.key === 'Enter') {
                                console.log('Enter key pressed');
                                try {
                                    console.log('Attempting to prevent default behavior');
                                    evt.preventDefault(); // Evitar comportamento padrão
                                    console.log('Default behavior prevented');
                                } catch (error) {
                                    console.error('Error preventing default behavior:', error);
                                }
    
                                try {
                                    console.log('Attempting to stop propagation');
                                    evt.stopPropagation(); // Impedir propagação do evento
                                    console.log('Propagation stopped');
                                } catch (error) {
                                    console.error('Error stopping propagation:', error);
                                }
    
                                //addItemToEditorCodingMenu(textComponent.inputEl.value, plugin, editor);
                                addItemToEditorCodingMenu(textComponent.inputEl.value, plugin, editor, submenu);
                                textComponent.inputEl.value = ''; // Limpar o campo de texto
                                textComponent.inputEl.focus(); // Garantir o foco no campo de texto
                            }
                        };
    
                        // Adicionar event listeners ao document e window
                        window.addEventListener('keydown', handleEnterKey, true);
                        //document.addEventListener('keydown', handleEnterKey, true);
                        textComponent.inputEl.addEventListener('keydown', handleEnterKey, true);

                        // Override the menu's default behavior
                        const originalHide = submenu.hide.bind(submenu);
                        submenu.hide = () => {
                            const isEnterPressed = window.event && (window.event as KeyboardEvent).key === 'Enter';
                            if (!isEnterPressed) {
                                return originalHide();
                            }
                            return submenu; // Return the submenu object to match the expected return type
                        };

                        // Remover os event listeners quando o menu fechar
                        submenu.onHide(() => {
                            window.removeEventListener('keydown', handleEnterKey, true);
                            textComponent.inputEl.removeEventListener('keydown', handleEnterKey, true);
                            submenu.hide = originalHide; // Restore original hide function
                        });
                    });
                } else {
                    submenu.addItem((item) => {
                        item.setTitle(option.title)
                            .setIcon(option.icon)
                            .onClick(() => {
                                option.action(plugin);
                                resetMenu(plugin); // Fechar menu para itens não-toggle
                            });
                    });
                }
            });
    
            submenu.onHide(() => {
                
                // Só redefinir se o menu não foi interagido com um toggle
                if (!plugin.selectionTriggeredMenu) {
                    //new Notice("Foi 2")
                    plugin.selectionTriggeredMenu = false;
                }
            });
    
            submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
            plugin.currentMenu = submenu;
        }
    }

/** Remove o menu contextual do plugin em diversos cenários, gerenciado pelos eventos;
* 
*
*/
export function resetMenu(plugin: MyPlugin, hideMenu: boolean = true) {
	
	if (plugin.currentMenu) {
		plugin.currentMenu.hide();
		plugin.currentMenu = null;
	}
	plugin.selectionTriggeredMenu = false;
	plugin.contextMenuOpened = false;
}

// Função que carrega um menu padronizado para ambos `file-menu` e `editor-menu`.
function createDefaultObsidianMenus(menu: Menu, plugin:MyPlugin){
	menu.addSeparator();

	menu.addItem((item) => {
		item.setTitle('Code Options')
			.setIcon('dice');

		const submenu = item.setSubmenu();
		Object.values(plugin.menuOptions).forEach(option => {
			submenu.addItem((subItem) => {
				subItem.setTitle(option.title)
					.setIcon(option.icon)
					.onClick(() => option.action(plugin));
			});
		});
	});
}

export function toggleExample(plugin: MyPlugin) {
    const toggleOption = plugin.menuOptions.find(option => option.title === 'Toggle Example');
    if (toggleOption) {
        new Notice(`Toggle is now ${toggleOption.isEnabled ? 'enabled' : 'disabled'}`);
    }
}

/*function addItemToEditorCodingMenu(value: string, plugin: MyPlugin, editor: Editor, submenu: Menu) {
    // Função que será chamada ao pressionar ENTER no campo de texto
    if (value.trim() !== '') {
        new Notice(`Text added to editor: ${value}`);
        
        // Adicionar nova opção ao menu
        const newOption = {
            title: value,
            icon: 'tag',
            action: (plugin: MyPlugin) => {
                new Notice(`Toggle ${value} executed`);
            },
            isToggle: true,
            isEnabled: false
        };
        new Notice(`${plugin.menuOptions.length}`)
        plugin.menuOptions.push(newOption);
        new Notice(`${plugin.menuOptions.length}`)
        // Adicionar novo item ao submenu
        //console.log(submenu.)
        submenu.addItem((item) => {
            console.log(item)
            const toggleComponent = new ToggleComponent((item as any).dom);
            toggleComponent.setValue(newOption.isEnabled ?? false);
            toggleComponent.onChange((toggleValue) => {
                newOption.isEnabled = toggleValue;
                newOption.action(plugin);
            });
            item.setTitle(newOption.title)
                .setIcon(newOption.icon);
            (item as any).dom.classList.add('menu-item-toggle');

            (item as any).dom.addEventListener('click', (evt: MouseEvent) => {
                evt.stopPropagation();
                const currentValue = toggleComponent.getValue();
                toggleComponent.setValue(!currentValue);
            });
        });
    }
}*/
function addItemToEditorCodingMenu(value: string, plugin: MyPlugin, editor: Editor, submenu: Menu) {
    // Função que será chamada ao pressionar ENTER no campo de texto
    if (value.trim() !== '') {
        new Notice(`Text added to editor: ${value}`);
        
        // Adicionar nova opção ao menu
        const newOption = {
            title: value,
            icon: 'tag',
            action: (plugin: MyPlugin) => {
                new Notice(`Toggle ${value} executed`);
            },
            isToggle: true,
            isEnabled: false
        };

        plugin.menuOptions.push(newOption);

        // Manipular diretamente o submenu para adicionar o novo item
        const menuItem = document.createElement('div');
        menuItem.className = 'menu-item';
        const toggleComponent = new ToggleComponent(menuItem);
        toggleComponent.setValue(newOption.isEnabled ?? false);
        toggleComponent.onChange((toggleValue) => {
            newOption.isEnabled = toggleValue;
            newOption.action(plugin);
        });

        const iconEl = document.createElement('div');
        iconEl.className = 'menu-item-icon';
        iconEl.innerHTML = '<svg><use href="icons.svg#tag"></use></svg>';

        const titleEl = document.createElement('div');
        titleEl.className = 'menu-item-title';
        titleEl.textContent = newOption.title;

        menuItem.appendChild(iconEl);
        menuItem.appendChild(titleEl);

        menuItem.addEventListener('click', (evt: MouseEvent) => {
            evt.stopPropagation();
            const currentValue = toggleComponent.getValue();
            toggleComponent.setValue(!currentValue);
        });

        (submenu as any).dom.appendChild(menuItem);

        // Exibir novamente o submenu atualizado
        //submenu.showAtPosition({ x: submenu.posX, y: submenu.posY });
    }
}
