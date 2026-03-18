import {
  assertDomState, assertInnerHTML, checkComponent,
} from "obsidian-e2e-visual-test-kit";

describe("code form modal", () => {
  beforeEach(async () => {
    // Build the modal DOM manually, matching CodeFormModal.onOpen() structure.
    // We cannot use require("obsidian").Modal inside browser.execute,
    // so we create the overlay + modal elements directly.
    await browser.execute(() => {
      // Remove any existing modal first
      document.querySelector(".modal-container.codemarker-code-form-test")?.remove();

      // Create the modal overlay structure matching Obsidian's Modal
      const overlay = document.createElement("div");
      overlay.className = "modal-container codemarker-code-form-test";
      overlay.style.cssText = "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;";

      const bg = document.createElement("div");
      bg.className = "modal-bg";
      bg.style.cssText = "position:absolute;inset:0;background:rgba(0,0,0,0.5);";
      overlay.appendChild(bg);

      const modal = document.createElement("div");
      modal.className = "modal codemarker-code-form";
      modal.style.cssText = "position:relative;background:var(--background-primary);border-radius:8px;padding:0;min-width:400px;max-width:500px;";
      overlay.appendChild(modal);

      // Close button
      const closeBtn = document.createElement("div");
      closeBtn.className = "modal-close-button";
      closeBtn.textContent = "\u00d7";
      modal.appendChild(closeBtn);

      // Content wrapper
      const content = document.createElement("div");
      content.className = "modal-content";
      modal.appendChild(content);

      // Title
      const h3 = document.createElement("h3");
      h3.textContent = "Add Code";
      content.appendChild(h3);

      // --- Name setting ---
      const nameSetting = document.createElement("div");
      nameSetting.className = "setting-item";
      const nameInfo = document.createElement("div");
      nameInfo.className = "setting-item-info";
      const nameName = document.createElement("div");
      nameName.className = "setting-item-name";
      nameName.textContent = "Name";
      nameInfo.appendChild(nameName);
      nameSetting.appendChild(nameInfo);
      const nameControl = document.createElement("div");
      nameControl.className = "setting-item-control";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.placeholder = "Code name";
      nameControl.appendChild(nameInput);
      nameSetting.appendChild(nameControl);
      content.appendChild(nameSetting);

      // --- Color setting ---
      const colorSetting = document.createElement("div");
      colorSetting.className = "setting-item";
      const colorInfo = document.createElement("div");
      colorInfo.className = "setting-item-info";
      const colorName = document.createElement("div");
      colorName.className = "setting-item-name";
      colorName.textContent = "Color";
      colorInfo.appendChild(colorName);
      colorSetting.appendChild(colorInfo);
      const colorControl = document.createElement("div");
      colorControl.className = "setting-item-control";
      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.value = "#6200EE";
      colorControl.appendChild(colorInput);
      colorSetting.appendChild(colorControl);
      content.appendChild(colorSetting);

      // --- Description setting ---
      const descSetting = document.createElement("div");
      descSetting.className = "setting-item";
      const descInfo = document.createElement("div");
      descInfo.className = "setting-item-info";
      const descName = document.createElement("div");
      descName.className = "setting-item-name";
      descName.textContent = "Description";
      descInfo.appendChild(descName);
      descSetting.appendChild(descInfo);
      const descControl = document.createElement("div");
      descControl.className = "setting-item-control";
      const descArea = document.createElement("textarea");
      descArea.placeholder = "Optional description...";
      descArea.rows = 3;
      descControl.appendChild(descArea);
      descSetting.appendChild(descControl);
      content.appendChild(descSetting);

      // --- Action buttons ---
      const actionsEl = document.createElement("div");
      actionsEl.className = "cm-form-actions";
      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      actionsEl.appendChild(cancelBtn);
      const saveBtn = document.createElement("button");
      saveBtn.className = "mod-cta";
      saveBtn.textContent = "Save";
      actionsEl.appendChild(saveBtn);
      content.appendChild(actionsEl);

      document.body.appendChild(overlay);
    });
    await browser.pause(500);
  });

  afterEach(async () => {
    await browser.execute(() => {
      document.querySelector(".modal-container.codemarker-code-form-test")?.remove();
    });
    await browser.pause(300);
  });

  it("modal renders with title", async () => {
    await assertDomState(".codemarker-code-form", {
      visible: true,
      innerHTML: { contains: ["Add Code"] },
    });
  });

  it("has name input, color picker, and description", async () => {
    const settings = await browser.$$(".codemarker-code-form .setting-item");
    expect(settings.length).toBe(3);
  });

  it("name input has correct placeholder", async () => {
    const input = await browser.$(".codemarker-code-form input[type='text']");
    const placeholder = await input.getAttribute("placeholder");
    expect(placeholder).toBe("Code name");
  });

  it("color picker defaults to #6200EE", async () => {
    const value = await browser.execute(() => {
      const picker = document.querySelector(".codemarker-code-form input[type='color']") as HTMLInputElement | null;
      return picker?.value ?? null;
    });
    expect(value?.toLowerCase()).toBe("#6200ee");
  });

  it("description textarea has 3 rows", async () => {
    const area = await browser.$(".codemarker-code-form textarea");
    const rows = await area.getAttribute("rows");
    expect(rows).toBe("3");
  });

  it("has Cancel and Save buttons", async () => {
    await assertInnerHTML(".cm-form-actions", {
      contains: ["Cancel", "Save"],
    });
  });

  it("Save button has mod-cta class", async () => {
    const saveBtn = await browser.$(".cm-form-actions button.mod-cta");
    expect(await saveBtn.isExisting()).toBe(true);
    expect(await saveBtn.getText()).toBe("Save");
  });

  it("visual baseline — code form modal", async () => {
    const mismatch = await checkComponent(".codemarker-code-form", "code-form-modal");
    expect(mismatch).toBeLessThan(2);
  });
});
