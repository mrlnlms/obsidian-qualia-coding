import MyPlugin from "main";
import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import { FolderSuggest } from "./suggesters/FolderSuggester";
//import { FileSuggest, FileSuggestMode } from "./suggesters/FileSuggester";
//import { arraymove } from "utils/Utils";

export interface FolderTemplate {
    folder: string;
    template: string;
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
    templates_folder: '',
    enable_folder_templates: true,
    folder_templates: [{ folder: "", template: "" }],
    user_scripts_folder: ""
}

export interface MyPluginSettings {
    
	// apagar?
    mySetting: string;
    templates_folder: string;
    enable_folder_templates: boolean;
    folder_templates: Array<FolderTemplate>;
    user_scripts_folder: string;
}


export class SampleSettingTab extends PluginSettingTab {
	//plugin: MyPlugin;

	constructor(private plugin: MyPlugin) {
		super(app, plugin);
		//this.plugin = plugin;
	}

	display(): void {
		
        const {containerEl} = this;
		containerEl.empty();

        this.add_template_folder_setting()
        //this.add_folder_templates_setting();

	}

    add_template_folder_setting(): void {
        new Setting(this.containerEl)
            .setName("Template folder location")
            .setDesc("Files in this folder will be available as templates.")
            .addSearch((cb) => {
                new FolderSuggest(cb.inputEl);
                cb.setPlaceholder("Example: folder1/folder2")
                    .setValue(this.plugin.settings.templates_folder)
                    .onChange((new_folder) => {
                        this.plugin.settings.templates_folder = new_folder;
                        this.plugin.save_settings();
                    });
                // @ts-ignore
                cb.containerEl.addClass("templater_search");
            });
    }
/* 
    add_folder_templates_setting(): void {
        this.containerEl.createEl("h2", { text: "Folder templates" });
        new Setting(this.containerEl).setName("Folder templates").setHeading();

        const descHeading = document.createDocumentFragment();
        descHeading.append(
            "Folder Templates are triggered when a new ",
            descHeading.createEl("strong", { text: "empty " }),
            "file is created in a given folder.",
            descHeading.createEl("br"),
            "Templater will fill the empty file with the specified template.",
            descHeading.createEl("br"),
            "The deepest match is used. A global default template would be defined on the root ",
            descHeading.createEl("code", { text: "/" }),
            "."
        );

        new Setting(this.containerEl).setDesc(descHeading);

        const descUseNewFileTemplate = document.createDocumentFragment();
        descUseNewFileTemplate.append(
            "When enabled Templater will make use of the folder templates defined below."
        );

        new Setting(this.containerEl)
            .setName("Enable folder templates")
            .setDesc(descUseNewFileTemplate)
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.enable_folder_templates)
                    .onChange((use_new_file_templates) => {
                        this.plugin.settings.enable_folder_templates =
                            use_new_file_templates;
                        this.plugin.save_settings();
                        // Force refresh
                        this.display();
                    });
            });

        if (!this.plugin.settings.enable_folder_templates) {
            return;
        }

        new Setting(this.containerEl)
            .setName("Add new")
            .setDesc("Add new folder template")
            .addButton((button: ButtonComponent) => {
                button
                    .setTooltip("Add additional folder template")
                    .setButtonText("+")
                    .setCta()
                    .onClick(() => {
                        this.plugin.settings.folder_templates.push({
                            folder: "",
                            template: "",
                        });
                        this.plugin.save_settings();
                        this.display();
                    });
            });

        this.plugin.settings.folder_templates.forEach(
            (folder_template, index) => {
                const s = new Setting(this.containerEl)
                    .addSearch((cb) => {
                        new FolderSuggest(cb.inputEl);
                        cb.setPlaceholder("Folder")
                            .setValue(folder_template.folder)
                            .onChange((new_folder) => {
                                if (
                                    new_folder &&
                                    this.plugin.settings.folder_templates.some(
                                        (e) => e.folder == new_folder
                                    )
                                ) {
                                    log_error(
                                        new Notice("This folder already has a template associated with it"
                                        )
                                    );
                                    return;
                                }

                                this.plugin.settings.folder_templates[
                                    index
                                ].folder = new_folder;
                                this.plugin.save_settings();
                            });
                        // @ts-ignore
                        cb.containerEl.addClass("templater_search");
                    })
                    .addSearch((cb) => {
                        new FileSuggest(
                            cb.inputEl,
                            this.plugin,
                            FileSuggestMode.TemplateFiles
                        );
                        cb.setPlaceholder("Template")
                            .setValue(folder_template.template)
                            .onChange((new_template) => {
                                this.plugin.settings.folder_templates[
                                    index
                                ].template = new_template;
                                this.plugin.save_settings();
                            });
                        // @ts-ignore
                        cb.containerEl.addClass("templater_search");
                    })
                    .addExtraButton((cb) => {
                        cb.setIcon("up-chevron-glyph")
                            .setTooltip("Move up")
                            .onClick(() => {
                                arraymove(
                                    this.plugin.settings.folder_templates,
                                    index,
                                    index - 1
                                );
                                this.plugin.save_settings();
                                this.display();
                            });
                    })
                    .addExtraButton((cb) => {
                        cb.setIcon("down-chevron-glyph")
                            .setTooltip("Move down")
                            .onClick(() => {
                                arraymove(
                                    this.plugin.settings.folder_templates,
                                    index,
                                    index + 1
                                );
                                this.plugin.save_settings();
                                this.display();
                            });
                    })
                    .addExtraButton((cb) => {
                        cb.setIcon("cross")
                            .setTooltip("Delete")
                            .onClick(() => {
                                this.plugin.settings.folder_templates.splice(
                                    index,
                                    1
                                );
                                this.plugin.save_settings();
                                this.display();
                            });
                    });
                s.infoEl.remove();
            }
        );
    }
         */
}
