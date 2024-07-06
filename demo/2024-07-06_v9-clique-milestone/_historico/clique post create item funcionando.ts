/// clique post create item funcionando - linha 22 add selectionTriggeredMenu = true;

export async function createEditorCodingMenu(editor: Editor, evt: MouseEvent, plugin: MyPlugin) {
    const selectedText = editor.getSelection();
    if (selectedText && !plugin.selectionTriggeredMenu) {
        plugin.selectionTriggeredMenu = true;

        if (plugin.currentMenu) {
            plugin.currentMenu.hide();
        }

        const submenu = new Menu();

        Object.values(plugin.menuOptions).forEach(option => {
            if (option.isToggle) {
                submenu.addItem((item) => {
                    const toggleComponent = new ToggleComponent((item as any).dom);
                    toggleComponent.setValue(option.isEnabled ?? false);
                    toggleComponent.onChange((value) => {
                        option.isEnabled = value;
                        option.action(plugin);
                        plugin.selectionTriggeredMenu = true; // Manter o menu aberto ao clicar no toggle
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
                            evt.preventDefault();
                            evt.stopPropagation();
                            addItemToEditorCodingMenu(textComponent.inputEl.value, plugin, editor, submenu);
                            textComponent.inputEl.value = ''; // Limpar o campo de texto
                            textComponent.inputEl.focus(); // Garantir o foco no campo de texto
                        }
                    };

                    window.addEventListener('keydown', handleEnterKey, true);
                    textComponent.inputEl.addEventListener('keydown', handleEnterKey, true);

                    submenu.onHide(() => {
                        window.removeEventListener('keydown', handleEnterKey, true);
                        textComponent.inputEl.removeEventListener('keydown', handleEnterKey, true);
                        plugin.selectionTriggeredMenu = false;
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
            if (!plugin.selectionTriggeredMenu) {
                plugin.selectionTriggeredMenu = false;
            }
        });

        submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
        plugin.currentMenu = submenu;
    }
}


function addItemToEditorCodingMenu(value: string, plugin: MyPlugin, editor: Editor, submenu: Menu) {
    if (value.trim() !== '') {
        new Notice(`Text added to editor: ${value}`);
        
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

        // Adicionar novo item ao submenu
        submenu.addItem((item) => {
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

        // Reabrir o submenu atualizado
        submenu.hide();
        submenu.showAtPosition({ x: submenu.posX, y: submenu.posY });
    }
}