// Minimal Obsidian API stubs for testing

export class Plugin {
  app: App;
  manifest: any;
  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }
  registerView() {}
  registerExtensions() {}
  addRibbonIcon() { return document.createElement('div'); }
  addCommand() {}
  addSettingTab() {}
  loadData() { return Promise.resolve(null); }
  saveData() { return Promise.resolve(); }
  registerEvent() {}
  registerDomEvent() {}
  registerInterval() { return 0; }
}

export class App {
  vault = new Vault();
  workspace = new Workspace();
  metadataCache = {};
}

export class Vault {
  getAbstractFileByPath(_path: string) { return null; }
  read(_file: any) { return Promise.resolve(''); }
  cachedRead(_file: any) { return Promise.resolve(''); }
  adapter = { exists: () => Promise.resolve(false), read: () => Promise.resolve(''), write: () => Promise.resolve() };
}

export class Workspace {
  getLeavesOfType() { return []; }
  getActiveViewOfType() { return null; }
  on() { return { id: '' }; }
  off() {}
  revealLeaf() {}
  getLeaf() { return new WorkspaceLeaf(); }
}

export class WorkspaceLeaf {
  view: any = null;
  getViewState() { return {}; }
  setViewState() { return Promise.resolve(); }
  detach() {}
  open() { return Promise.resolve(); }
}

export class MarkdownView {
  editor: any = null;
  file: TFile | null = null;
  getViewType() { return 'markdown'; }
}

export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = '';
  parent = null;
  stat = { mtime: 0, ctime: 0, size: 0 };
}

export class TAbstractFile {
  path = '';
  name = '';
  parent = null;
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
  hide() {}
}

export class Component {
  load() {}
  unload() {}
  addChild<T extends Component>(child: T) { return child; }
  registerEvent() {}
  registerDomEvent() {}
  registerInterval() { return 0; }
}

export class ItemView extends Component {
  contentEl = document.createElement('div');
  leaf: WorkspaceLeaf;
  constructor(leaf: WorkspaceLeaf) {
    super();
    this.leaf = leaf;
  }
  getViewType() { return ''; }
  getDisplayText() { return ''; }
  onOpen() { return Promise.resolve(); }
  onClose() { return Promise.resolve(); }
}

export class TextComponent {
  inputEl = document.createElement('input');
  constructor(_containerEl: HTMLElement) {}
  setValue(_value: string) { return this; }
  setPlaceholder(_placeholder: string) { return this; }
  onChange(_callback: (value: string) => any) { return this; }
  getValue() { return ''; }
}

export class ToggleComponent {
  toggleEl = document.createElement('div');
  constructor(_containerEl: HTMLElement) {}
  setValue(_on: boolean) { return this; }
  onChange(_callback: (value: boolean) => any) { return this; }
  getValue() { return false; }
}

export class Setting {
  settingEl = document.createElement('div');
  nameEl = document.createElement('div');
  descEl = document.createElement('div');
  controlEl = document.createElement('div');
  constructor(_containerEl: HTMLElement) {}
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addText(_cb: (text: TextComponent) => any) { return this; }
  addToggle(_cb: (toggle: ToggleComponent) => any) { return this; }
  addButton(_cb: (button: any) => any) { return this; }
  addDropdown(_cb: (dropdown: any) => any) { return this; }
  setClass(_cls: string) { return this; }
}

export class Modal {
  contentEl = document.createElement('div');
  modalEl = document.createElement('div');
  constructor(_app: App) {}
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export function setIcon(_el: HTMLElement, _iconId: string) {}
export function setTooltip(_el: HTMLElement, _tooltip: string) {}
export function normalizePath(path: string) { return path; }

export const moment = () => ({
  format: (fmt: string) => fmt,
  toDate: () => new Date(),
});
