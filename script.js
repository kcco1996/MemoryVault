<<<<<<< HEAD
/* Memory Vault — localStorage-based starter app */

const STORAGE_KEY = "memoryVault.entries.v1";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  entries: [],
  draftPhotos: [],        // array of { name, dataUrl }
  editingId: null,
  modalId: null
};

// ---------- Utilities ----------
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleString();
}

function safeText(v) {
  return (v ?? "").toString().trim();
}

function parseTags(tagStr) {
  return safeText(tagStr)
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 25);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

// ---------- Storage ----------
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.entries = raw ? JSON.parse(raw) : [];
  } catch {
    state.entries = [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  $("#statSaved").textContent = nowStamp();
  $("#statEntries").textContent = state.entries.length.toString();
}

// ---------- Navigation / Views ----------
function setView(viewName) {
  $$(".nav__item").forEach(b => b.classList.toggle("is-active", b.dataset.view === viewName));
  $$(".view").forEach(v => v.classList.toggle("is-active", v.dataset.view === viewName));

  const titles = {
    add: ["Add Entry", "Capture the moment — not the to-do list."],
    browse: ["Browse", "Search your memories like an archive."],
    backup: ["Backup", "Export and import your archive safely."],
    about: ["About", "A place for your life story."]
  };

  $("#viewTitle").textContent = titles[viewName]?.[0] ?? "Memory Vault";
  $("#viewSubtitle").textContent = titles[viewName]?.[1] ?? "";
  if (viewName === "browse") renderList();
}

$$(".nav__item").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

// ---------- Photos (stored as data URLs) ----------
async function filesToDataUrls(fileList) {
  const files = Array.from(fileList || []);
  const results = [];

  for (const f of files) {
    // soft safety limit: avoid huge images filling storage
    if (f.size > 3_000_000) {
      notify(`#formNotice`, `Skipped ${f.name} (too large). Try a smaller image.`);
      continue;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Failed to read file"));
      r.readAsDataURL(f);
    });
    results.push({ name: f.name, dataUrl });
  }

  return results;
}

function renderThumbs() {
  const thumbs = $("#thumbs");
  thumbs.innerHTML = "";
  state.draftPhotos.forEach(p => {
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.alt = p.name;
    img.src = p.dataUrl;
    div.appendChild(img);
    thumbs.appendChild(div);
  });
}

$("#photos").addEventListener("change", async (e) => {
  const picked = await filesToDataUrls(e.target.files);
  state.draftPhotos = [...state.draftPhotos, ...picked].slice(0, 12);
  renderThumbs();
  $("#photos").value = "";
});

// ---------- Form ----------
const felt = $("#felt");
const feltText = $("#feltText");

function updateFeltText() {
  feltText.textContent = `${felt.value} / 5`;
}
felt.addEventListener("input", updateFeltText);

$("#btnQuickToday").addEventListener("click", () => {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  $("#date").value = iso;
});

$("#btnNewEntry").addEventListener("click", () => {
  clearForm();
  notify("#formNotice", "New entry ready.");
});

$("#btnDeleteDraft").addEventListener("click", () => {
  clearForm();
  notify("#formNotice", "Cleared.");
});

function clearForm() {
  state.editingId = null;
  state.draftPhotos = [];
  $("#entryForm").reset();
  felt.value = "3";
  updateFeltText();
  renderThumbs();
  $("#btnSave").textContent = "Save Memory";
}

function fillFormFromEntry(entry) {
  state.editingId = entry.id;
  $("#category").value = entry.category || "";
  $("#title").value = entry.title || "";
  $("#date").value = entry.date || "";
  $("#location").value = entry.location || "";
  $("#story").value = entry.story || "";
  $("#felt").value = String(entry.felt ?? 3);
  $("#tags").value = (entry.tags || []).join(", ");
  state.draftPhotos = entry.photos || [];
  updateFeltText();
  renderThumbs();
  $("#btnSave").textContent = "Update Memory";
}

$("#entryForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const entry = {
    id: state.editingId || uid(),
    category: safeText($("#category").value),
    title: safeText($("#title").value),
    date: safeText($("#date").value),
    location: safeText($("#location").value),
    story: safeText($("#story").value),
    felt: Number($("#felt").value),
    tags: parseTags($("#tags").value),
    photos: state.draftPhotos,
    createdAt: state.editingId ? undefined : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!entry.category || !entry.title) {
    notify("#formNotice", "Please add a Category and Title.");
    return;
  }

  // preserve createdAt on update
  if (state.editingId) {
    const idx = state.entries.findIndex(x => x.id === state.editingId);
    if (idx !== -1) {
      entry.createdAt = state.entries[idx].createdAt || new Date().toISOString();
      state.entries[idx] = entry;
    }
    notify("#formNotice", "Updated ✅");
  } else {
    state.entries.push(entry);
    notify("#formNotice", "Saved ✅");
  }

  saveEntries();
  clearForm();
});

// ---------- Browse / List ----------
$("#filterCategory").addEventListener("change", renderList);
$("#search").addEventListener("input", renderList);
$("#sortBy").addEventListener("change", renderList);

function matchesSearch(entry, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  const blob = [
    entry.title, entry.story, entry.location,
    (entry.tags || []).join(" "),
    entry.category
  ].join(" ").toLowerCase();
  return blob.includes(s);
}

function sortEntries(list, mode) {
  const copy = [...list];
  if (mode === "oldest") copy.sort((a,b) => (a.date || a.createdAt || "").localeCompare(b.date || b.createdAt || ""));
  if (mode === "newest") copy.sort((a,b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));
  if (mode === "feltHigh") copy.sort((a,b) => (b.felt ?? 0) - (a.felt ?? 0));
  if (mode === "feltLow") copy.sort((a,b) => (a.felt ?? 0) - (b.felt ?? 0));
  return copy;
}

function renderList() {
  const filterCat = safeText($("#filterCategory").value);
  const q = safeText($("#search").value);
  const sortBy = $("#sortBy").value;

  let filtered = state.entries.filter(e => !filterCat || e.category === filterCat);
  filtered = filtered.filter(e => matchesSearch(e, q));
  filtered = sortEntries(filtered, sortBy);

  const list = $("#entriesList");
  list.innerHTML = "";

  $("#emptyState").style.display = filtered.length ? "none" : "block";

  filtered.forEach(entry => {
    const div = document.createElement("div");
    div.className = "item";
    div.tabIndex = 0;

    const left = document.createElement("div");

    const h = document.createElement("p");
    h.className = "item__title";
    h.textContent = entry.title || "Untitled";

    const meta = document.createElement("div");
    meta.className = "item__meta";
    meta.textContent = `${fmtDate(entry.date)} • ${entry.location || "No location"} • Felt: ${entry.felt ?? "—"}/5`;

    left.appendChild(h);
    left.appendChild(meta);

    const badge = document.createElement("div");
    badge.className = "item__badge";
    badge.textContent = entry.category || "Uncategorised";

    div.appendChild(left);
    div.appendChild(badge);

    div.addEventListener("click", () => openModal(entry.id));
    div.addEventListener("keypress", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") openModal(entry.id);
    });

    list.appendChild(div);
  });

  $("#statEntries").textContent = state.entries.length.toString();
}

// ---------- Modal ----------
const modal = $("#modal");

function openModal(id) {
  state.modalId = id;
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  $("#modalKicker").textContent = entry.category || "Memory";
  $("#modalTitle").textContent = entry.title || "Untitled";

  const meta = `${fmtDate(entry.date)} • ${entry.location || "No location"} • Felt: ${entry.felt ?? "—"}/5`;
  $("#modalMeta").textContent = meta;

  const tagsWrap = $("#modalTags");
  tagsWrap.innerHTML = "";
  (entry.tags || []).forEach(t => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = t;
    tagsWrap.appendChild(chip);
  });

  $("#modalStory").textContent = entry.story || "";

  const gallery = $("#modalGallery");
  gallery.innerHTML = "";
  (entry.photos || []).forEach(p => {
    const img = document.createElement("img");
    img.alt = p.name || "Photo";
    img.src = p.dataUrl;
    gallery.appendChild(img);
  });

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  state.modalId = null;
}

$("#modalClose").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target?.dataset?.close === "true") closeModal();
});

// Edit / Delete from modal
$("#btnEdit").addEventListener("click", () => {
  const entry = state.entries.find(e => e.id === state.modalId);
  if (!entry) return;
  closeModal();
  setView("add");
  fillFormFromEntry(entry);
  notify("#formNotice", "Editing…");
});

$("#btnDelete").addEventListener("click", () => {
  const entry = state.entries.find(e => e.id === state.modalId);
  if (!entry) return;

  const ok = confirm(`Delete "${entry.title}"? This cannot be undone.`);
  if (!ok) return;

  state.entries = state.entries.filter(e => e.id !== state.modalId);
  saveEntries();
  closeModal();
  renderList();
});

// ---------- Backup ----------
function download(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("#btnExport").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    entries: state.entries
  };
  download(`memory-vault-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2));
  notify("#backupNotice", "Exported ✅");
});

$("#importFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  try {
    const text = await f.text();
    const json = JSON.parse(text);
    const incoming = Array.isArray(json) ? json : json.entries;

    if (!Array.isArray(incoming)) throw new Error("Invalid backup format");

    // merge by id (incoming overwrites)
    const map = new Map(state.entries.map(x => [x.id, x]));
    incoming.forEach(x => {
      if (x && x.id) map.set(x.id, x);
    });
    state.entries = Array.from(map.values());

    saveEntries();
    notify("#backupNotice", "Imported ✅");
  } catch (err) {
    notify("#backupNotice", "Import failed. Check the JSON file format.");
  } finally {
    $("#importFile").value = "";
  }
});

$("#btnWipe").addEventListener("click", () => {
  const ok = confirm("Wipe ALL Memory Vault data from this browser? Export first if you want a backup.");
  if (!ok) return;
  state.entries = [];
  saveEntries();
  renderList();
  notify("#backupNotice", "Wiped ✅");
});

// ---------- Notifications ----------
function notify(sel, msg) {
  const el = $(sel);
  if (!el) return;
  el.textContent = msg;
  window.clearTimeout(el.__t);
  el.__t = window.setTimeout(() => (el.textContent = ""), 4500);
}

// ---------- Init ----------
function init() {
  loadEntries();
  $("#statEntries").textContent = state.entries.length.toString();
  $("#statSaved").textContent = "—";
  updateFeltText();
  renderThumbs();
  renderList();
  setView("add");
}

init();
=======
/* Memory Vault — localStorage-based starter app */

const STORAGE_KEY = "memoryVault.entries.v1";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  entries: [],
  draftPhotos: [],        // array of { name, dataUrl }
  editingId: null,
  modalId: null
};

// ---------- Utilities ----------
function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleString();
}

function safeText(v) {
  return (v ?? "").toString().trim();
}

function parseTags(tagStr) {
  return safeText(tagStr)
    .split(",")
    .map(t => t.trim())
    .filter(Boolean)
    .slice(0, 25);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return iso;
  }
}

// ---------- Storage ----------
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.entries = raw ? JSON.parse(raw) : [];
  } catch {
    state.entries = [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.entries));
  $("#statSaved").textContent = nowStamp();
  $("#statEntries").textContent = state.entries.length.toString();
}

// ---------- Navigation / Views ----------
function setView(viewName) {
  $$(".nav__item").forEach(b => b.classList.toggle("is-active", b.dataset.view === viewName));
  $$(".view").forEach(v => v.classList.toggle("is-active", v.dataset.view === viewName));

  const titles = {
    add: ["Add Entry", "Capture the moment — not the to-do list."],
    browse: ["Browse", "Search your memories like an archive."],
    backup: ["Backup", "Export and import your archive safely."],
    about: ["About", "A place for your life story."]
  };

  $("#viewTitle").textContent = titles[viewName]?.[0] ?? "Memory Vault";
  $("#viewSubtitle").textContent = titles[viewName]?.[1] ?? "";
  if (viewName === "browse") renderList();
}

$$(".nav__item").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

// ---------- Photos (stored as data URLs) ----------
async function filesToDataUrls(fileList) {
  const files = Array.from(fileList || []);
  const results = [];

  for (const f of files) {
    // soft safety limit: avoid huge images filling storage
    if (f.size > 3_000_000) {
      notify(`#formNotice`, `Skipped ${f.name} (too large). Try a smaller image.`);
      continue;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Failed to read file"));
      r.readAsDataURL(f);
    });
    results.push({ name: f.name, dataUrl });
  }

  return results;
}

function renderThumbs() {
  const thumbs = $("#thumbs");
  thumbs.innerHTML = "";
  state.draftPhotos.forEach(p => {
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.alt = p.name;
    img.src = p.dataUrl;
    div.appendChild(img);
    thumbs.appendChild(div);
  });
}

$("#photos").addEventListener("change", async (e) => {
  const picked = await filesToDataUrls(e.target.files);
  state.draftPhotos = [...state.draftPhotos, ...picked].slice(0, 12);
  renderThumbs();
  $("#photos").value = "";
});

// ---------- Form ----------
const felt = $("#felt");
const feltText = $("#feltText");

function updateFeltText() {
  feltText.textContent = `${felt.value} / 5`;
}
felt.addEventListener("input", updateFeltText);

$("#btnQuickToday").addEventListener("click", () => {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  $("#date").value = iso;
});

$("#btnNewEntry").addEventListener("click", () => {
  clearForm();
  notify("#formNotice", "New entry ready.");
});

$("#btnDeleteDraft").addEventListener("click", () => {
  clearForm();
  notify("#formNotice", "Cleared.");
});

function clearForm() {
  state.editingId = null;
  state.draftPhotos = [];
  $("#entryForm").reset();
  felt.value = "3";
  updateFeltText();
  renderThumbs();
  $("#btnSave").textContent = "Save Memory";
}

function fillFormFromEntry(entry) {
  state.editingId = entry.id;
  $("#category").value = entry.category || "";
  $("#title").value = entry.title || "";
  $("#date").value = entry.date || "";
  $("#location").value = entry.location || "";
  $("#story").value = entry.story || "";
  $("#felt").value = String(entry.felt ?? 3);
  $("#tags").value = (entry.tags || []).join(", ");
  state.draftPhotos = entry.photos || [];
  updateFeltText();
  renderThumbs();
  $("#btnSave").textContent = "Update Memory";
}

$("#entryForm").addEventListener("submit", (e) => {
  e.preventDefault();

  const entry = {
    id: state.editingId || uid(),
    category: safeText($("#category").value),
    title: safeText($("#title").value),
    date: safeText($("#date").value),
    location: safeText($("#location").value),
    story: safeText($("#story").value),
    felt: Number($("#felt").value),
    tags: parseTags($("#tags").value),
    photos: state.draftPhotos,
    createdAt: state.editingId ? undefined : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!entry.category || !entry.title) {
    notify("#formNotice", "Please add a Category and Title.");
    return;
  }

  // preserve createdAt on update
  if (state.editingId) {
    const idx = state.entries.findIndex(x => x.id === state.editingId);
    if (idx !== -1) {
      entry.createdAt = state.entries[idx].createdAt || new Date().toISOString();
      state.entries[idx] = entry;
    }
    notify("#formNotice", "Updated ✅");
  } else {
    state.entries.push(entry);
    notify("#formNotice", "Saved ✅");
  }

  saveEntries();
  clearForm();
});

// ---------- Browse / List ----------
$("#filterCategory").addEventListener("change", renderList);
$("#search").addEventListener("input", renderList);
$("#sortBy").addEventListener("change", renderList);

function matchesSearch(entry, q) {
  if (!q) return true;
  const s = q.toLowerCase();
  const blob = [
    entry.title, entry.story, entry.location,
    (entry.tags || []).join(" "),
    entry.category
  ].join(" ").toLowerCase();
  return blob.includes(s);
}

function sortEntries(list, mode) {
  const copy = [...list];
  if (mode === "oldest") copy.sort((a,b) => (a.date || a.createdAt || "").localeCompare(b.date || b.createdAt || ""));
  if (mode === "newest") copy.sort((a,b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));
  if (mode === "feltHigh") copy.sort((a,b) => (b.felt ?? 0) - (a.felt ?? 0));
  if (mode === "feltLow") copy.sort((a,b) => (a.felt ?? 0) - (b.felt ?? 0));
  return copy;
}

function renderList() {
  const filterCat = safeText($("#filterCategory").value);
  const q = safeText($("#search").value);
  const sortBy = $("#sortBy").value;

  let filtered = state.entries.filter(e => !filterCat || e.category === filterCat);
  filtered = filtered.filter(e => matchesSearch(e, q));
  filtered = sortEntries(filtered, sortBy);

  const list = $("#entriesList");
  list.innerHTML = "";

  $("#emptyState").style.display = filtered.length ? "none" : "block";

  filtered.forEach(entry => {
    const div = document.createElement("div");
    div.className = "item";
    div.tabIndex = 0;

    const left = document.createElement("div");

    const h = document.createElement("p");
    h.className = "item__title";
    h.textContent = entry.title || "Untitled";

    const meta = document.createElement("div");
    meta.className = "item__meta";
    meta.textContent = `${fmtDate(entry.date)} • ${entry.location || "No location"} • Felt: ${entry.felt ?? "—"}/5`;

    left.appendChild(h);
    left.appendChild(meta);

    const badge = document.createElement("div");
    badge.className = "item__badge";
    badge.textContent = entry.category || "Uncategorised";

    div.appendChild(left);
    div.appendChild(badge);

    div.addEventListener("click", () => openModal(entry.id));
    div.addEventListener("keypress", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") openModal(entry.id);
    });

    list.appendChild(div);
  });

  $("#statEntries").textContent = state.entries.length.toString();
}

// ---------- Modal ----------
const modal = $("#modal");

function openModal(id) {
  state.modalId = id;
  const entry = state.entries.find(e => e.id === id);
  if (!entry) return;

  $("#modalKicker").textContent = entry.category || "Memory";
  $("#modalTitle").textContent = entry.title || "Untitled";

  const meta = `${fmtDate(entry.date)} • ${entry.location || "No location"} • Felt: ${entry.felt ?? "—"}/5`;
  $("#modalMeta").textContent = meta;

  const tagsWrap = $("#modalTags");
  tagsWrap.innerHTML = "";
  (entry.tags || []).forEach(t => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = t;
    tagsWrap.appendChild(chip);
  });

  $("#modalStory").textContent = entry.story || "";

  const gallery = $("#modalGallery");
  gallery.innerHTML = "";
  (entry.photos || []).forEach(p => {
    const img = document.createElement("img");
    img.alt = p.name || "Photo";
    img.src = p.dataUrl;
    gallery.appendChild(img);
  });

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  state.modalId = null;
}

$("#modalClose").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target?.dataset?.close === "true") closeModal();
});

// Edit / Delete from modal
$("#btnEdit").addEventListener("click", () => {
  const entry = state.entries.find(e => e.id === state.modalId);
  if (!entry) return;
  closeModal();
  setView("add");
  fillFormFromEntry(entry);
  notify("#formNotice", "Editing…");
});

$("#btnDelete").addEventListener("click", () => {
  const entry = state.entries.find(e => e.id === state.modalId);
  if (!entry) return;

  const ok = confirm(`Delete "${entry.title}"? This cannot be undone.`);
  if (!ok) return;

  state.entries = state.entries.filter(e => e.id !== state.modalId);
  saveEntries();
  closeModal();
  renderList();
});

// ---------- Backup ----------
function download(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("#btnExport").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    entries: state.entries
  };
  download(`memory-vault-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2));
  notify("#backupNotice", "Exported ✅");
});

$("#importFile").addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  try {
    const text = await f.text();
    const json = JSON.parse(text);
    const incoming = Array.isArray(json) ? json : json.entries;

    if (!Array.isArray(incoming)) throw new Error("Invalid backup format");

    // merge by id (incoming overwrites)
    const map = new Map(state.entries.map(x => [x.id, x]));
    incoming.forEach(x => {
      if (x && x.id) map.set(x.id, x);
    });
    state.entries = Array.from(map.values());

    saveEntries();
    notify("#backupNotice", "Imported ✅");
  } catch (err) {
    notify("#backupNotice", "Import failed. Check the JSON file format.");
  } finally {
    $("#importFile").value = "";
  }
});

$("#btnWipe").addEventListener("click", () => {
  const ok = confirm("Wipe ALL Memory Vault data from this browser? Export first if you want a backup.");
  if (!ok) return;
  state.entries = [];
  saveEntries();
  renderList();
  notify("#backupNotice", "Wiped ✅");
});

// ---------- Notifications ----------
function notify(sel, msg) {
  const el = $(sel);
  if (!el) return;
  el.textContent = msg;
  window.clearTimeout(el.__t);
  el.__t = window.setTimeout(() => (el.textContent = ""), 4500);
}

// ---------- Init ----------
function init() {
  loadEntries();
  $("#statEntries").textContent = state.entries.length.toString();
  $("#statSaved").textContent = "—";
  updateFeltText();
  renderThumbs();
  renderList();
  setView("add");
}

init();
>>>>>>> 227ef05d1cd1596664221ea0f5a44babedfa806b
