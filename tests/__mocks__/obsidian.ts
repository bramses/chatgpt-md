// Mock implementation of Obsidian API for testing
export class App {
  workspace = {
    getActiveViewOfType: jest.fn(),
    getActiveFile: jest.fn(),
  };
  vault = {
    getAbstractFileByPath: jest.fn(),
    read: jest.fn(),
    modify: jest.fn(),
    create: jest.fn(),
    rename: jest.fn(),
  };
  metadataCache = {
    getFileCache: jest.fn(),
  };
}

export class Plugin {
  app: App;
  manifest: any;

  constructor(app: App, manifest: any) {
    this.app = app;
    this.manifest = manifest;
  }

  addCommand = jest.fn();
  addStatusBarItem = jest.fn(() => ({
    setText: jest.fn(),
  }));
  addSettingTab = jest.fn();
  registerEvent = jest.fn();
  registerInterval = jest.fn();
  loadData = jest.fn();
  saveData = jest.fn();
}

export class MarkdownView {
  file = {
    path: "test.md",
    basename: "test",
  };
  editor = new Editor();
  getViewData = jest.fn(() => "test content");
  setViewData = jest.fn();
}

export class Editor {
  private content = "";
  private cursor = { line: 0, ch: 0 };

  getValue = jest.fn(() => this.content);
  setValue = jest.fn((value: string) => {
    this.content = value;
  });
  getCursor = jest.fn(() => ({ ...this.cursor }));
  setCursor = jest.fn((pos: any) => {
    this.cursor = { ...pos };
  });
  getLine = jest.fn((line: number) => "");
  lastLine = jest.fn(() => 0);
  replaceRange = jest.fn((text: string, from: any, to?: any) => {
    this.content += "\n" + text;
  });
  replaceSelection = jest.fn((text: string) => {
    this.content += text;
  });
  getSelection = jest.fn(() => "");
}

export class Notice {
  constructor(message: string, timeout?: number) {}
}

export class TFile {
  path: string;
  basename: string;
  extension: string;

  constructor(path: string) {
    this.path = path;
    this.basename =
      path
        .split("/")
        .pop()
        ?.replace(/\.[^/.]+$/, "") || "";
    this.extension = path.split(".").pop() || "";
  }
}

export class TFolder {
  path: string;
  name: string;

  constructor(path: string) {
    this.path = path;
    this.name = path.split("/").pop() || "";
  }
}

export const Platform = {
  isMobile: false,
  isDesktop: true,
};

export class SettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }

  display(): void {}
  hide(): void {}
}

export class Setting {
  settingEl: HTMLElement;
  nameEl: HTMLElement;
  descEl: HTMLElement;
  controlEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    this.nameEl = document.createElement("div");
    this.descEl = document.createElement("div");
    this.controlEl = document.createElement("div");
    containerEl.appendChild(this.settingEl);
  }

  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }

  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }

  addText(cb: (text: any) => void): this {
    const text = {
      setValue: jest.fn(),
      onChange: jest.fn(),
      setPlaceholder: jest.fn(),
    };
    cb(text);
    return this;
  }

  addToggle(cb: (toggle: any) => void): this {
    const toggle = {
      setValue: jest.fn(),
      onChange: jest.fn(),
    };
    cb(toggle);
    return this;
  }

  addDropdown(cb: (dropdown: any) => void): this {
    const dropdown = {
      addOption: jest.fn(),
      setValue: jest.fn(),
      onChange: jest.fn(),
    };
    cb(dropdown);
    return this;
  }

  addTextArea(cb: (text: any) => void): this {
    const text = {
      setValue: jest.fn(),
      onChange: jest.fn(),
      setPlaceholder: jest.fn(),
    };
    cb(text);
    return this;
  }
}
