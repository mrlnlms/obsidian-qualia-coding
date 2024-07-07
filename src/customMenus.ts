import { Editor as CodeMirrorEditor } from 'codemirror';
import { Menu, Editor, TFile, ToggleComponent, TextComponent, MenuItem, Notice, MarkdownView } from 'obsidian';
import MyPlugin, { MenuOption } from '../main';
import { ApplyCodeModal } from './CodingModals';
import { Highlight } from './Highlights';

interface EditorPosition {
    line: number;
    ch: number;
}
export class customMenus {
    
    plugin: MyPlugin;
    //static app: any;
    static handleEnterKey: ((evt: KeyboardEvent) => void) | null = null;
    static lastMouseEvent: MouseEvent | null = null;
    static cleanupCallbacks: (() => void)[] = [];
    static focusCallbacks: (() => void)[] = [];


    constructor(plugin: MyPlugin) {
        this.plugin = plugin;
    }

    static async showCustomMenu(evt: MouseEvent, plugin: MyPlugin) {
        
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;
        
        const editor = view.editor;
        if (!editor.hasFocus()) return;

        if (evt.type === 'mouseover') {
            // Ação para o evento mouseover
            new Notice("Mouseover event detected");
            await this.createEditorCodingMenu(editor, evt, plugin);
            //return;
            return; // Se não quiser abrir o menu no mouseover, retorne aqui
        }

        const selectedText = editor.getSelection();
        if (!selectedText){
            this.cleanupCallbacks.forEach(callback => callback());
            return;
        }
        
        if (!plugin.codingMenuOpened && !plugin.menuStayOpen){
            if (plugin.currentMenu){
                await this.resetMenu(plugin);
            }
            // Adicione esta parte ao seu código onde a inicialização do editor acontece
            const editor2 = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
            if (editor) {
                console.log("FOIIIII")
                //customMenus.initializeClickEvent(editor);
            }
            //customMenus.initializeClickEvent(editor);
            await this.createEditorCodingMenu(editor, evt, plugin);
            return;
        }

    }


     // Converte um índice em uma posição de linha e coluna
     static indexToPos(editor: Editor, index: number): EditorPosition {
        const content = editor.getValue();
        const lines = content.split('\n');
        let currentPos = 0;

        for (let line = 0; line < lines.length; line++) {
            const lineLength = lines[line].length + 1; // +1 para o \n
            if (index < currentPos + lineLength) {
                return { line, ch: index - currentPos };
            }
            currentPos += lineLength;
        }

        return { line: lines.length - 1, ch: lines[lines.length - 1].length };
    }

    static posToIndex(editor: Editor, pos: EditorPosition): number {
        const content = editor.getValue();
        const lines = content.split('\n');
        let index = 0;

        for (let line = 0; line < pos.line; line++) {
            index += lines[line].length + 1; // +1 para o \n
        }

        return index + pos.ch;
    }

    static getCursorPosition(editor: Editor): { start: EditorPosition, end: EditorPosition } {
        const start = editor.getCursor("from");
        const end = editor.getCursor("to");
        return { start, end };
    }
    
    static lastClickPosition: { line: number, ch: number } | null = null;

    /* static getClickPosition(event: MouseEvent, editor: Editor): EditorPosition {
        const cm = (editor as any).cm;
        const coords = { line: event.clientX, ch: event.clientY };
        //const pos = cm.coordsChar(coords, "window");
        //return { line: pos.line, ch: pos.ch };
        //const newPos = this.posToIndex(editor,coords);

        //return {line: newPos, ch: newPos};
    } */

    /* static initializeClickEvent(editor: Editor) {
        document.addEventListener('mousedown', (event: MouseEvent) => {
            console.log("UNO")
            //if ((event.target as HTMLElement).closest('.CodeMirror')) {
                console.log("DOES")
                //const clickPosition = customMenus.getClickPosition(event, editor);
                //console.log("Click Position:", clickPosition); // Para verificar a posição capturada
                //customMenus.lastClickPosition = clickPosition; // Armazena a posição do clique
           // }
        });
    } */

    static setCursorToLastClickPosition(editor: Editor) {
        if (customMenus.lastClickPosition) {
            editor.setCursor(customMenus.lastClickPosition);
            editor.focus();
        }
    }



    static setCursorSelection(editor: Editor, start: EditorPosition, end: EditorPosition) {
        editor.setSelections([{ anchor: start, head: end }]);
    }

    // Nova função para definir o cursor em uma posição específica
    static setCursorPosition(editor: Editor, position: EditorPosition) {
        editor.setCursor(position);
    }

    static async removeHtmlTags(editor: Editor, regex: RegExp, originText: string, mySelectionHTML: string, evt: Event)  {
        let content = editor.getValue();
        let match;
        const selections = [];
        let offset = 0;
        
        const openingTagLength = `<span class="coded-text aa" data-code="aa">`.length;
        const closingTagLength = `</span>`.length;
        const total = openingTagLength+closingTagLength;

        //new Notice (`${total}`)

        while ((match = regex.exec(content)) !== null) {
            
            const innerContent = match[1];
            //console.log(innerContent)
            const startIndex = match.index;// + offset;
            new Notice(`${startIndex}`)
            
            console.log("startIndex");
            console.log(startIndex);

            //console.log("startIndex: "+startIndex)
            const endIndex = startIndex + match[0].length + total;
            //const endIndex = startIndex + originText + total;
            new Notice(`> ${endIndex}`)
            // Substituir o conteúdo dentro das tags HTML pelo texto interno
            //content = content.substring(0, startIndex) + innerContent + content.substring(endIndex);
            
            // Calcular o novo offset
            offset += innerContent.length - match[0].length;

            // Calcular as novas posições com base no conteúdo modificado
            const startPos = this.indexToPos(editor, startIndex);
            const endPos = this.indexToPos(editor, endIndex);//startIndex + innerContent.length);
            selections.push({ anchor: startPos, head: endPos });
            console.log("selections")
            console.log(selections)
        }

        if (selections.length > 0) {
            
            const selectionStartIndex = this.posToIndex(editor, selections[0].anchor);// - openingTagLength;
            const selectionEndIndex = selectionStartIndex + originText.length + openingTagLength + closingTagLength;
            console.log("selectionStartIndex")
            console.log(selectionStartIndex)
            //console.log(selectionStartIndex, selectionEndIndex)
            const startPos = this.indexToPos(editor, selectionStartIndex);
            const endPos = this.indexToPos(editor, selectionEndIndex);
            //const startPos = this.indexToPos(editor, selectionStartIndex);
            //const endPos = this.indexToPos(editor, selectionEndIndex);
            //customMenus.setCursorSelection(editor, selections[0].anchor, selections[0].head);
            const cursorPosition = this.getCursorPosition(editor);



           

            const cursorIndex = this.posToIndex(editor, cursorPosition.start)
            const cursorFinal = this.indexToPos(editor, cursorIndex)



            
            
            /* console.log("cursorPosition: "+cursorPosition)
            console.log(cursorPosition.end.ch)
            console.log(cursorPosition.end.line)
            console.log("----");
            console.log("endPos: "+endPos)
            console.log(endPos.ch)
            console.log(endPos.line) */
            
            
            /* if(endPos.ch > cursorFinal.ch){
                customMenus.setCursorSelection(editor, startPos, endPos);
            } else {
                customMenus.setCursorSelection(editor, startPos, cursorFinal);
            } */
            
            // Verifica se a linha final da seleção (endPos) é maior que a linha do cursor final (cursorFinal)
            // Ou se está na mesma linha, mas a posição do caractere (ch) final da seleção é maior que a posição do cursor final
            //editor.replaceSelection(originText);
            if(endPos.line < cursorFinal.line) {
                console.log("Clicou ABAIXO do texto selecionado")
                customMenus.setCursorSelection(editor, startPos, endPos);
                editor.replaceSelection(originText);
                customMenus.setCursorPosition(editor,cursorFinal)

            } else if(endPos.line > cursorFinal.line) {
                console.log("Clicou ACIMA do texto selecionado")
                customMenus.setCursorSelection(editor, startPos, endPos);

                editor.replaceSelection(originText);
                customMenus.setCursorPosition(editor,cursorFinal)

            } else if(endPos.line === cursorFinal.line) {
                console.log("Mesma linha")
                if (endPos.ch < cursorFinal.ch){
                    console.log("DEPOIS da seleção")
                    
                    customMenus.setCursorSelection(editor, startPos, endPos);
                    editor.replaceSelection(originText);
                    const point = cursorIndex - total;
                    const newCursorPosition = this.indexToPos(editor, point);
                
                    //console.log(newCursorPosition)
                    // Substituir seleção com novos valores
                    //this.setCursorSelection(editor, newCursorPosition, newCursorPosition);
                    //customMenus.setCursorPosition(editor,cursorFinal)
                    this.setCursorPosition(editor, newCursorPosition);

                } else if (endPos.ch > cursorFinal.ch){
                    //evt.stopPropagation();
                    //evt.preventDefault();
                    customMenus.setCursorSelection(editor, startPos, endPos);
                    editor.replaceSelection(originText);
                    //customMenus.setCursorPosition(editor, cursorFinal);
                    customMenus.setCursorPosition(editor,cursorFinal)
                    console.log("ANTES da seleção")
                } else {

                     if(!editor.hasFocus){
                        console.log("SEM FOCO")	
                    } else {
                        console.log("SAIU")	
                    }
                    //evt.stopPropagation();
                    //evt.preventDefault();
                    console.log("No meio do TEXTO.");
                    
                    console.log(endPos)
                    console.log(endPos.ch-total)
                    console.log(cursorFinal.ch)
                    this.setCursorSelection(editor, startPos, endPos);
                    editor.replaceSelection(originText);
                    //this.setCursorSelection(editor, endPos, endPos);
                    //this.setCursorSelection(editor, startPos, startPos);
                    //evt.stopPropagation();
                    //evt.preventDefault();
                    //editor.focus();
                    //editor.setCursor({line: 0, ch: 0});
                    
                    //this.setCursorPosition(editor, {line: 0, ch: 0});
                    
                    const lineNumber = startPos.line; //startPos.anchor;//1; // replace with your desired line number
                    const line = editor.getLine(lineNumber);
                    //console.log("LIJNE: "+line)
                    //const position = line.indexOf("[ ]");
                    const position = line.indexOf(originText);
                    console.log("position: "+position)
                    endPos.ch = endPos.ch - total;
                    this.setCursorSelection(editor, startPos, endPos);
                    //editor.setCursor({ch: position, line: lineNumber});
                    //editor.replaceRange(originText, { line: lineNumber, ch: position }, { line: lineNumber, ch: position + mySelectionHTML.length});
                    //editor.replaceRange(originText, { line: lineNumber, ch: position }, { line: lineNumber, ch: position});
                    //console.log("passou!")
                    
                    //const position2 = line.indexOf(originText);
                    /* setTimeout(() => {
                        console.log("entrouu!!")
                        let cursorsrs= editor.getCursor();
                        editor.setCursor({ch: 0, line: 0});
                    }) */
                    
                    
                    //const point = cursorIndex - total;
                    //const newCursorPosition = this.indexToPos(editor, point);



                    //selections[0].head = startPos;                    
                    //this.setCursorSelection(editor, newCursorPosition, newCursorPosition);
                    //this.setCursorSelection(editor, newCursorPosition, newCursorPosition);
                    //editor.setSelection(newCursorPosition)
                    
                    //this.setCursorPosition(editor,newCursorPosition)
                     //customMenus.setCursorPosition(editor,cursorFinal)
                    
                    /* 
                    const cursorPosition = this.getCursorPosition(editor);
                    const cursorPositionIndex = this.posToIndex(editor, cursorPosition.start)
                    console.log("Aqui::::")
                    console.log(cursorPosition)
                    console.log(cursorPositionIndex)
                    const point = cursorPositionIndex;// - total;
                    const newCursorPosition = this.indexToPos(editor, point);
                    
                    ///console.log(newCursorPosition)
                    // Substituir seleção com novos valores
                    this.setCursorSelection(editor, newCursorPosition, newCursorPosition);
                    this.setCursorPosition(editor, newCursorPosition);
 */

                    //customMenus.setCursorToLastClickPosition(editor);

                    //this.setCursorSelection(editor, startPos, endPos);
                    
                    
                    
                    //console.log(point);

                    //editor.focus();
                    //if(editor.hasFocus()){
                    //    console.log("FOCO")
                    //} else {
                    //    console.log("nao foco")
                   // }
                    //console.log(`> ${cursorIndex} - ${total}, ${point}`)
                    console.log(editor.getSelection())
                    
                    //this.setCursorPosition(editor, {line: 0, ch: 0});
                    //customMenus.setCursorPosition(editor, newCursorPosition);
                    
                    //console.log(newCursorPosition);
                    
                    //customMenus.setCursorPosition(editor,newCursorPosition)
                    
                }
            }
            
            return selections;

            if (endPos.line > cursorFinal.line || (endPos.line === cursorFinal.line && endPos.ch > cursorFinal.ch)) {
                // Se a condição for verdadeira, define a seleção no editor entre startPos e endPos
                
                //customMenus.setCursorSelection(editor, startPos, endPos);
                console.log("situação 1")
                console.log("startPos")
                console.log(startPos.ch)
                console.log(startPos.line)
                console.log("---")
                console.log("endPos")
                console.log(endPos.ch)
                console.log(endPos.line)
                console.log("---")
                console.log("cursorFinal")
                console.log(cursorFinal.ch)
                console.log(cursorFinal.line)
                console.log("-----------------------")
            } else {
                //customMenus.setCursorSelection(editor, startPos, cursorFinal);
                console.log("startPos")
                console.log(startPos.ch)
                console.log(startPos.line)
                console.log("---")
                console.log("endPos")
                console.log(endPos.ch)
                console.log(endPos.line)
                console.log("---")
                console.log("cursorFinal")
                console.log(cursorFinal.ch)
                console.log(cursorFinal.line)
                console.log("-----------------------")
                
                //return;
                
            }

            //editor.replaceSelection(originText);
            if (startPos.line > cursorFinal.line || (startPos.line === cursorFinal.line && endPos.ch > cursorFinal.ch)) {
            //if (endPos.line > cursorFinal.line || (endPos.line === cursorFinal.line && endPos.ch > cursorFinal.ch)) {
                //customMenus.setCursorPosition(editor, endPos);
                
                console.log("situação 2")
                console.log("startPos")
                console.log(startPos.ch)
                console.log(startPos.line)
                console.log("---")
                console.log("endPos")
                console.log(endPos.ch)
                console.log(endPos.line)
                console.log("---")
                console.log("cursorFinal")
                console.log(cursorFinal.ch)
                console.log(cursorFinal.line)
                console.log("-----------------------")
            } else {
                //customMenus.setCursorPosition(editor, cursorFinal);
                console.log("situação 4")
                console.log("startPos")
                console.log(startPos.ch)
                console.log(startPos.line)
                console.log("---")
                console.log("endPos")
                console.log(endPos.ch)
                console.log(endPos.line)
                console.log("---")
                console.log("cursorFinal")
                console.log(cursorFinal.ch)
                console.log(cursorFinal.line)
                console.log("-----------------------")
            }
            //customMenus.setCursorSelection(editor, startPos, endPos);
            /* editor.replaceSelection(originText);      
            if(endPos.ch > cursorFinal.ch){                
                customMenus.setCursorPosition(editor,endPos)
            }else{
                customMenus.setCursorPosition(editor,cursorFinal)
            } */
            //customMenus.setCursorPosition(editor,cursorFinal)


           /*  if (endPos.line > cursorFinal.line || (endPos.line === cursorFinal.line && endPos.ch > cursorFinal.ch)) {
                customMenus.setCursorSelection(editor, startPos, endPos);
                console.log("situação 1")
            } else {
                customMenus.setCursorSelection(editor, startPos, cursorFinal);
                console.log("situação 2")
                
                //return;
                
            }

            editor.replaceSelection(originText);

            if (endPos.line > cursorFinal.line || (endPos.line === cursorFinal.line && endPos.ch > cursorFinal.ch)) {
                customMenus.setCursorPosition(editor, endPos);
                console.log("situação 3")
            } else {
                customMenus.setCursorPosition(editor, cursorFinal);
                console.log("situação 4")
            } */
        } 

        //editor.setValue(content);
        //return selections;
    }

    static async createEditorCodingMenu(editor: Editor, evt: MouseEvent, plugin: MyPlugin) {


        const submenu = new Menu();
        const selectedText = editor.getSelection();
        const cursorPosition = this.getCursorPosition(editor);
        //const start = editor.getCursor("from");
        //const end = editor.getCursor("to");

        let mark = new Highlight(app,editor,selectedText);
        //mark.onOpen();
        //const myCustomMenu = plugin.menuOptions;
        plugin.myCustomMenu.forEach((option, index) => {
            
    
        //Object.values(plugin.myCustomMenu).forEach(option => {
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

                    (item as any).dom.addEventListener('click', (evt: MouseEvent) => {
                        evt.stopPropagation();
                        const currentValue = toggleComponent.getValue();
                        toggleComponent.setValue(!currentValue);
                    });
                });
                
                
                if (index === 1 + (plugin.menuCodesReduced.length-1)) {
                    submenu.addSeparator();
                }

            } else if (option.isTextField) {
                submenu.addItem((item) => {
                    const textComponent = new TextComponent((item as any).dom);
                    textComponent.setPlaceholder('Enter text...');
                    textComponent.onChange((value) => {
                        option.action(plugin);
                    });
                    item.setTitle(option.title)
                        .setIcon(option.icon);
                    (item as any).dom.classList.add('menu-item-textfield');

                    (item as any).dom.addEventListener('click', (evt: MouseEvent) => {
                        evt.stopPropagation();
                        evt.preventDefault();
                        
                        
                        
                        textComponent.inputEl.focus();
                        /* if(plugin.menuStayOpen){
                            mark.onOpen();
                        } */
                    });

                    const handleEnterKey = (evt: KeyboardEvent) => {
                        if (evt.key === 'Enter') {
                            evt.stopPropagation();
                            evt.preventDefault();

                            if (this.lastMouseEvent) {
                                this.cleanupCallbacks.forEach(callback => callback());
                                this.addItemToEditorCodingMenu(textComponent.inputEl.value, plugin, editor, submenu, this.lastMouseEvent)
                            }
                        }
                    };

                    this.cleanupCallbacks.push(() => {
                        window.removeEventListener('keydown', handleEnterKey, true);
                    });
                    this.focusCallbacks.push(() => {
                        
                        textComponent.inputEl.focus();
                        if(!plugin.menuStayOpen){
                            mark.onOpen();
                        }
                        
                    });
                    
                    window.addEventListener('keydown', handleEnterKey, true);
                    
                });
            } else {
                submenu.addItem((item) => {
                    item.setTitle(option.title)
                        .setIcon(option.icon)
                        .onClick(() => {
                            option.action(plugin);
                            this.resetMenu(plugin); // Fechar menu para itens não-toggle
                        });
                });
            }
        });

        submenu.onHide(async () => {
            plugin.codingMenuOpened = false;
            plugin.menuStayOpen = true;    
            this.resetMenu(plugin);
            mark.remove(plugin, evt);
        });
        
        plugin.codingMenuOpened = true;
        
        submenu.showAtPosition({ x: evt.pageX, y: evt.pageY });
        this.focusCallbacks.forEach(callback => callback());
        this.focusCallbacks = [];
        this.lastMouseEvent = evt;
        plugin.currentMenu = submenu;
        //editor.focus();
        //mark.onOpen();
}

static addItemToEditorCodingMenu(value: string, plugin: MyPlugin, editor: Editor, submenu: Menu, originalEvent: MouseEvent) {
    
    if (value.trim() !== '') {
        const newOption = {
            title: value,
            icon: 'tag',
            action: (plugin: MyPlugin) => {
                new Notice(`Toggle ${value} executed`);
            },
            isToggle: true,
            isEnabled: true
        };
        plugin.menuCodes.unshift(newOption);
        submenu.hide();
        this.createEditorCodingMenu(editor, originalEvent, plugin);
        plugin.codingMenuOpened = true;
    }
}

static async resetMenu(plugin: MyPlugin, hideMenu: boolean = true) {

    if (plugin.currentMenu) {
        plugin.currentMenu.hide();
        this.destroyMenu(plugin.currentMenu);
        plugin.currentMenu = null;
    }
    
    plugin.codingMenuOpened = false;
    plugin.menuStayOpen = false; // Adicionado
}

static destroyMenu(menu: Menu) {
    if (menu && (menu as any).dom) {
        const menuDom = (menu as any).dom;
        if (menuDom.parentNode) {
            menuDom.parentNode.removeChild(menuDom);
        }
    }
}
}

