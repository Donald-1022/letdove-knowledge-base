"use client";

import {
  Copy,
  Download,
  Eye,
  FileJson,
  LogOut,
  ExternalLink,
  Plus,
  Save,
  Send,
  Trash2,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import seedItems from "@/data/letdove.json";
import type { LetDoveItem } from "@/lib/letdove";

const authKey = "letdove-admin-auth";
const storageKey = "letdove-admin-json";

type AdminStatus = "published" | "draft";
type UploadState = "idle" | "uploading" | "success" | "error";
type AdminItem = LetDoveItem & {
  display_order: number;
  status: AdminStatus;
  visible: boolean;
};

type UploadResponse =
  | {
      success: true;
      key: string;
      url: string;
    }
  | {
      success: true;
      images: Array<{
        key: string;
        url: string;
      }>;
    }
  | {
      success: false;
      error: string;
    };

export function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [items, setItems] = useState<AdminItem[]>(() => normalizeItems(seedItems as LetDoveItem[]));
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AdminStatus>("all");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [notice, setNotice] = useState("");
  const [failedImages, setFailedImages] = useState<string[]>([]);

  useEffect(() => {
    setAuthenticated(window.localStorage.getItem(authKey) === "true");

    const stored = window.localStorage.getItem(storageKey);
    const nextItems = stored ? normalizeItems(JSON.parse(stored) as LetDoveItem[]) : normalizeItems(seedItems as LetDoveItem[]);

    setItems(nextItems);
    setSelectedId(nextItems[0]?.id ?? "");
  }, []);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.display_order - b.display_order),
    [items]
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortedItems.filter((item) => {
      const statusMatch = filter === "all" || item.status === filter;
      const queryMatch =
        !normalizedQuery ||
        [
          item.letdove_code,
          item.title,
          item.category_l1,
          item.category_l2,
          ...item.tags
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return statusMatch && queryMatch;
    });
  }, [filter, query, sortedItems]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? filteredItems[0] ?? items[0],
    [filteredItems, items, selectedId]
  );

  function login(formData: FormData) {
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    if (username === "admin" && password === "admin") {
      window.localStorage.setItem(authKey, "true");
      setAuthenticated(true);
      setLoginError("");
      return;
    }

    setLoginError("Invalid username or password.");
  }

  function logout() {
    window.localStorage.removeItem(authKey);
    setAuthenticated(false);
  }

  function persist(nextItems: AdminItem[], message = "Saved JSON draft.") {
    const normalized = normalizeItems(nextItems);
    setItems(normalized);
    window.localStorage.setItem(storageKey, JSON.stringify(normalized, null, 2));
    setNotice(message);
  }

  function updateSelected(patch: Partial<AdminItem>) {
    if (!selectedItem) {
      return;
    }

    persist(
      items.map((item) => {
        if (item.id !== selectedItem.id) {
          return item;
        }

        const nextItem = normalizeItem({
          ...item,
          ...patch,
          order: patch.display_order ?? patch.order ?? item.order,
          display_order: patch.display_order ?? patch.order ?? item.display_order,
          updated_at: new Date().toISOString()
        });

        return nextItem;
      }),
      "Unsaved-looking changes are stored in the browser JSON draft."
    );
  }

  function createNew() {
    const nextItem = createItem(items.length + 1);
    persist([nextItem, ...items], "Created new draft card.");
    setSelectedId(nextItem.id);
  }

  function saveDraft() {
    if (!selectedItem) {
      return;
    }

    updateSelected({ status: "draft", visible: true });
    setNotice("Draft saved. Export JSON to publish this data file.");
  }

  function publish() {
    if (!selectedItem) {
      return;
    }

    updateSelected({ status: "published", visible: true });
    setNotice("Card marked as published. Export JSON to update src/data/letdove.json.");
  }

  function deleteSelected() {
    if (!selectedItem) {
      return;
    }

    const nextItems = items.filter((item) => item.id !== selectedItem.id);
    persist(nextItems, `Deleted ${selectedItem.letdove_code}.`);
    setSelectedId(nextItems[0]?.id ?? "");
  }

  function downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File | undefined) {
    if (!file) {
      return;
    }

    const imported = normalizeItems(JSON.parse(await file.text()) as LetDoveItem[]);
    persist(imported, "Imported JSON draft.");
    setSelectedId(imported[0]?.id ?? "");
  }

  async function uploadImages(files: FileList | null) {
    if (!files?.length || !selectedItem) {
      return;
    }

    if (uploadState === "uploading") {
      return;
    }

    const beforeItems = items;
    setUploadState("uploading");
    setNotice("Uploading images to R2...");

    try {
      const urls = await uploadFiles(files, selectedItem);

      if (!urls.length) {
        throw new Error("Upload endpoint did not return public R2 URLs.");
      }

      const nextItems = beforeItems.map((item) => {
        if (item.id !== selectedItem.id) {
          return item;
        }

        const gallery = [...item.media.gallery, ...urls];
        return normalizeItem({
          ...item,
          media: {
            cover: item.media.cover || gallery[0] || "",
            gallery
          },
          updated_at: new Date().toISOString()
        });
      });

      persist(nextItems, `${urls.length} image${urls.length > 1 ? "s" : ""} uploaded. Latest: ${urls[urls.length - 1]}`);
      setUploadState("success");
    } catch (error) {
      setItems(beforeItems);
      window.localStorage.setItem(storageKey, JSON.stringify(beforeItems, null, 2));
      setUploadState("error");
      setNotice(error instanceof Error ? error.message : "Upload failed. JSON was not changed.");
    }
  }

  async function uploadFiles(files: FileList, item: AdminItem) {
    const selectedFiles = Array.from(files).filter((file): file is File => file instanceof File);

    if (!selectedFiles.length) {
      throw new Error("No file selected");
    }

    const urls: string[] = [];

    for (const [index, file] of selectedFiles.entries()) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", item.category_l1 || "");
      formData.append("letdove_code", item.letdove_code || "");
      formData.append("start_index", String((item.media.gallery.length || 0) + index + 1));

      const response = await fetch("/api/images/upload", {
        body: formData,
        method: "POST"
      });

      const payload = await readUploadResponse(response);

      if (!response.ok || !payload.success) {
        throw new Error(!payload.success ? payload.error : "R2 upload failed.");
      }

      if (!("url" in payload) || typeof payload.url !== "string") {
        throw new Error("Upload failed: missing URL");
      }

      urls.push(payload.url);
    }

    return urls.filter((url): url is string => typeof url === "string" && url.startsWith("https://img.letdove.uk/"));
  }

  async function readUploadResponse(response: Response) {
    const text = await response.text();

    try {
      return JSON.parse(text) as UploadResponse;
    } catch {
      throw new Error(
        text.startsWith("Server")
          ? "Upload endpoint returned a Server Action response. Use Cloudflare Pages preview/deploy, not next dev, for R2 uploads."
          : `Upload endpoint did not return JSON: ${text.slice(0, 120)}`
      );
    }
  }

  function reorderImage(targetIndex: number) {
    if (!selectedItem || dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }

    const gallery = [...selectedItem.media.gallery];
    const [dragged] = gallery.splice(dragIndex, 1);
    gallery.splice(targetIndex, 0, dragged);

    updateSelected({
      media: {
        cover: gallery.includes(selectedItem.media.cover) ? selectedItem.media.cover : gallery[0] ?? "",
        gallery
      }
    });
    setDragIndex(null);
  }

  function deleteImage(index: number) {
    if (!selectedItem) {
      return;
    }

    const gallery = selectedItem.media.gallery.filter((_, imageIndex) => imageIndex !== index);
    updateSelected({
      media: {
        cover: gallery.includes(selectedItem.media.cover) ? selectedItem.media.cover : gallery[0] ?? "",
        gallery
      }
    });
  }

  function setCover(url: string) {
    updateSelected({
      media: {
        cover: url,
        gallery: selectedItem?.media.gallery ?? []
      }
    });
  }

  async function copyText(text: string) {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }

    setNotice("Image URL copied.");
  }

  if (!authenticated) {
    return <AdminLogin error={loginError} onLogin={login} />;
  }

  return (
    <main className="admin-v2-shell">
      <header className="admin-v2-topbar">
        <div>
          <span>LetDove CMS</span>
          <h1>Content Manager</h1>
        </div>
        <div className="admin-v2-actions">
          <button onClick={createNew} type="button"><Plus size={15} />Create new</button>
          <button onClick={saveDraft} type="button"><Save size={15} />Save draft</button>
          <button onClick={publish} type="button"><Send size={15} />Publish</button>
          <button onClick={() => downloadJson("letdove.json", items)} type="button"><Download size={15} />Export JSON</button>
          <label><FileJson size={15} />Import JSON<input accept="application/json" hidden onChange={(event) => importJson(event.target.files?.[0])} type="file" /></label>
          <button onClick={logout} type="button"><LogOut size={15} />Logout</button>
        </div>
      </header>

      <section className="admin-v2-grid">
        <aside className="admin-v2-left">
          <div className="admin-v2-panel-head">
            <strong>Content list</strong>
            <span>{filteredItems.length} / {items.length}</span>
          </div>
          <input
            aria-label="Search cards"
            className="admin-v2-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search code, title, tags..."
            value={query}
          />
          <div className="admin-v2-tabs">
            {(["all", "published", "draft"] as const).map((option) => (
              <button data-active={filter === option} key={option} onClick={() => setFilter(option)} type="button">{option}</button>
            ))}
          </div>
          <div className="admin-v2-list">
            {filteredItems.map((item) => (
              <button className="admin-v2-list-item" data-active={item.id === selectedItem?.id} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
                {item.media.cover ? <img alt="" src={item.media.cover} /> : <span>No image</span>}
                <div>
                  <code>{item.letdove_code}</code>
                  <strong>{item.title}</strong>
                  <small>{item.status} · order {item.display_order}</small>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="admin-v2-center">
          {selectedItem ? (
            <>
              <div className="admin-v2-editor-head">
                <div>
                  <span>Editing</span>
                  <h2>{selectedItem.title}</h2>
                </div>
                <button className="admin-v2-danger" onClick={deleteSelected} type="button"><Trash2 size={15} />Delete</button>
              </div>

              <div className="admin-v2-form-grid">
                <Field label="id" value={selectedItem.id} onChange={(value) => updateSelected({ id: value })} />
                <Field label="letdove_code" value={selectedItem.letdove_code} onChange={(value) => updateSelected({ letdove_code: value })} />
                <Field label="title" value={selectedItem.title} onChange={(value) => updateSelected({ title: value })} />
                <Field label="category_l1" value={selectedItem.category_l1} onChange={(value) => updateSelected({ category_l1: value })} />
                <Field label="category_l2" value={selectedItem.category_l2} onChange={(value) => updateSelected({ category_l2: value })} />
                <Field label="series" value={selectedItem.series} onChange={(value) => updateSelected({ series: value })} />
                <Field label="tags" value={selectedItem.tags.join(", ")} onChange={(value) => updateSelected({ tags: splitCsv(value) })} />
                <label className="admin-v2-field">
                  <span>status</span>
                  <select value={selectedItem.status} onChange={(event) => updateSelected({ status: event.target.value as AdminStatus })}>
                    <option value="published">published</option>
                    <option value="draft">draft</option>
                  </select>
                </label>
                <Field label="created_at" type="date" value={selectedItem.created_at} onChange={(value) => updateSelected({ created_at: value })} />
                <Field label="display_order" type="number" value={String(selectedItem.display_order)} onChange={(value) => updateSelected({ display_order: Number(value) || 0, order: Number(value) || 0 })} />
              </div>

              <Field label="description" multiline value={selectedItem.description} onChange={(value) => updateSelected({ description: value })} />
              <Field label="search_index" readOnly value={selectedItem.search_index} onChange={() => undefined} />

              <section className="admin-v2-image-panel">
                <div className="admin-v2-panel-head">
                  <div>
                    <strong>Uploaded images</strong>
                    <span>{selectedItem.media.gallery.length} image{selectedItem.media.gallery.length === 1 ? "" : "s"}</span>
                  </div>
                  <label data-state={uploadState}><Upload size={15} />{uploadState === "uploading" ? "Uploading" : "Batch upload"}<input accept="image/*" disabled={uploadState === "uploading"} hidden multiple onChange={(event) => {
                    const file = event.target.files?.[0];

                    if (!file) {
                      setUploadState("error");
                      setNotice("No file selected");
                      return;
                    }

                    uploadImages(event.target.files);
                    event.target.value = "";
                  }} type="file" /></label>
                </div>
                {selectedItem.media.gallery.length ? <div className="admin-v2-image-grid">
                  {selectedItem.media.gallery.map((image, index) => {
                    const imageFailed = failedImages.includes(image);

                    return (
                    <div
                      className="admin-v2-image"
                      draggable
                      key={`${image}-${index}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() => setDragIndex(index)}
                      onDrop={() => reorderImage(index)}
                    >
                      {imageFailed ? (
                        <div className="admin-v2-image-fallback">Image URL saved, but preview failed to load.</div>
                      ) : (
                        <img alt="" onError={() => setFailedImages((current) => current.includes(image) ? current : [...current, image])} src={image} />
                      )}
                      <code title={image}>{image}</code>
                      <div>
                        <button data-active={selectedItem.media.cover === image} onClick={() => setCover(image)} type="button"><Eye size={14} />Cover</button>
                        <button onClick={() => copyText(image)} type="button"><Copy size={14} /></button>
                        <a href={image} rel="noreferrer" target="_blank"><ExternalLink size={14} /></a>
                        <button onClick={() => deleteImage(index)} type="button"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  )})}
                </div> : <div className="admin-v2-empty">No uploaded images yet.</div>}
                {notice && <p className="admin-v2-notice" data-state={uploadState}>{notice}</p>}
              </section>
            </>
          ) : (
            <div className="admin-v2-empty">Create a card to start editing.</div>
          )}
        </section>

        <aside className="admin-v2-right">
          <div className="admin-v2-panel-head">
            <strong>Live preview</strong>
            <span>4:5 card</span>
          </div>
          {selectedItem && <LivePreview item={selectedItem} />}
        </aside>
      </section>
    </main>
  );
}

function AdminLogin({ error, onLogin }: { error: string; onLogin: (formData: FormData) => void }) {
  return (
    <main className="admin-v2-login-shell">
      <form
        className="admin-v2-login-card"
        onSubmit={(event) => {
          event.preventDefault();
          onLogin(new FormData(event.currentTarget));
        }}
      >
        <h1>LetDove Admin Login</h1>
        <label>
          <span>Username</span>
          <input autoComplete="username" name="username" placeholder="admin" />
        </label>
        <label>
          <span>Password</span>
          <input autoComplete="current-password" name="password" placeholder="admin" type="password" />
        </label>
        {error && <p>{error}</p>}
        <button type="submit">Login</button>
      </form>
    </main>
  );
}

function Field({
  label,
  multiline = false,
  onChange,
  readOnly = false,
  type = "text",
  value
}: {
  label: string;
  multiline?: boolean;
  onChange: (value: string) => void;
  readOnly?: boolean;
  type?: string;
  value: string;
}) {
  return (
    <label className="admin-v2-field">
      <span>{label}</span>
      {multiline ? (
        <textarea onChange={(event) => onChange(event.target.value)} readOnly={readOnly} rows={4} value={value} />
      ) : (
        <input onChange={(event) => onChange(event.target.value)} readOnly={readOnly} type={type} value={value} />
      )}
    </label>
  );
}

function LivePreview({ item }: { item: AdminItem }) {
  return (
    <article className="admin-v2-preview-card">
      <div>
        {item.media.cover ? <img alt="" src={item.media.cover} /> : <span>No cover image</span>}
      </div>
      <section>
        <code>{item.letdove_code}</code>
        <h3>{item.title}</h3>
        <p>{item.description}</p>
        <div>
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </section>
    </article>
  );
}

function normalizeItems(items: LetDoveItem[]) {
  return items.map(normalizeItem).sort((a, b) => a.display_order - b.display_order);
}

function normalizeItem(item: Partial<LetDoveItem> & { display_order?: number }) {
  const displayOrder = item.display_order ?? item.order ?? 1;
  const media = {
    cover: item.media?.cover ?? "",
    gallery: (item.media?.gallery ?? []).filter(
      (url): url is string => typeof url === "string" && !url.startsWith("data:") && !url.startsWith("blob:")
    )
  };

  if (typeof media.cover !== "string" || media.cover.startsWith("data:") || media.cover.startsWith("blob:")) {
    media.cover = media.gallery[0] ?? "";
  }

  return {
    id: item.id ?? `ld_${Date.now()}`,
    letdove_code: item.letdove_code ?? "NEW_CARD",
    title: item.title ?? "Untitled card",
    description: item.description ?? "",
    media,
    category_l1: item.category_l1 ?? "prompt",
    category_l2: item.category_l2 ?? "general",
    series: item.series ?? "Draft Series",
    tags: item.tags ?? [],
    cards: item.cards ?? [],
    links: item.links ?? [],
    created_at: item.created_at ?? new Date().toISOString().slice(0, 10),
    updated_at: item.updated_at ?? new Date().toISOString(),
    order: displayOrder,
    display_order: displayOrder,
    pinned: item.pinned ?? false,
    visible: item.visible ?? true,
    status: item.status === "published" ? "published" : "draft",
    sop: item.sop ?? "",
    internal_links: item.internal_links ?? [],
    version: item.version ?? 1,
    search_index: buildSearchIndex(item)
  } satisfies AdminItem;
}

function createItem(index: number): AdminItem {
  return normalizeItem({
    id: `ld_${String(index).padStart(3, "0")}`,
    letdove_code: `NEW_${String(index).padStart(2, "0")}`,
    title: "Untitled card",
    description: "",
    category_l1: "prompt",
    category_l2: "general",
    series: "Draft Series",
    tags: [],
    status: "draft",
    visible: true,
    display_order: index,
    order: index,
    media: {
      cover: "",
      gallery: []
    }
  });
}

function buildSearchIndex(item: Partial<LetDoveItem>) {
  return [
    item.title,
    item.description,
    ...(item.tags ?? []),
    item.category_l1,
    item.category_l2
  ]
    .filter(Boolean)
    .join(" ");
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
