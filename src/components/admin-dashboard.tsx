"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileJson,
  GripVertical,
  ImagePlus,
  Loader2,
  LogOut,
  Maximize2,
  Plus,
  Save,
  Send,
  Trash2,
  UploadCloud,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import seedItems from "@/data/letdove.json";
import type { LetDoveItem } from "@/lib/letdove";

const authKey = "letdove-admin-token";
const storageKey = "letdove-admin-json";
const maxUploadAttempts = 3;

type AdminStatus = "published" | "draft";
type MediaStatus = "local" | "uploading" | "uploaded" | "error";
type AdminItem = LetDoveItem & {
  display_order: number;
  status: AdminStatus;
  visible: boolean;
};

type LoginResponse =
  | { success: true; token: string }
  | { success: false; error: string };

type UploadResponse =
  | { success: true; key: string; url: string }
  | { success: false; error: string };

type MediaDraft = {
  aspectRatio?: number;
  error?: string;
  file?: File;
  id: string;
  key?: string;
  name: string;
  previewUrl: string;
  progress: number;
  publicUrl?: string;
  size: number;
  source: "local" | "r2";
  status: MediaStatus;
};

type UploadFailureKind = "network" | "json" | "server" | "r2" | "invalid-response" | "invalid-file";

type ParsedUploadResponse =
  | { data: UploadResponse; ok: true; text: string }
  | { error: string; kind: UploadFailureKind; ok: false; text: string };

export function AdminDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState("");
  const [loginError, setLoginError] = useState("");
  const [items, setItems] = useState<AdminItem[]>(() => normalizeItems(seedItems as LetDoveItem[]));
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AdminStatus>("all");
  const [notice, setNotice] = useState("");
  const [mediaDrafts, setMediaDrafts] = useState<MediaDraft[]>([]);
  const [previewDraft, setPreviewDraft] = useState<MediaDraft | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(authKey) ?? "";
    setToken(storedToken);
    setAuthenticated(Boolean(storedToken));

    const stored = window.localStorage.getItem(storageKey);
    const nextItems = stored ? normalizeItems(JSON.parse(stored) as LetDoveItem[]) : normalizeItems(seedItems as LetDoveItem[]);

    setItems(nextItems);
    setSelectedId(nextItems[0]?.id ?? "");

    return () => {
      mediaDrafts.forEach((draft) => {
        if (draft.source === "local") {
          URL.revokeObjectURL(draft.previewUrl);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.display_order - b.display_order),
    [items]
  );

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sortedItems.filter((item) => {
      const statusMatch = filter === "all" || item.status === filter;
      const searchable = [
        item.letdove_code,
        item.title,
        item.category_l1,
        item.category_l2,
        item.series,
        ...item.tags
      ].join(" ").toLowerCase();

      return statusMatch && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [filter, query, sortedItems]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? filteredItems[0] ?? items[0],
    [filteredItems, items, selectedId]
  );

  const allMedia = useMemo(() => {
    const existing = (selectedItem?.media.gallery ?? []).map((url, index): MediaDraft => ({
      id: `r2-${url}-${index}`,
      name: getImageName(url),
      previewUrl: url,
      progress: 100,
      publicUrl: url,
      size: 0,
      source: "r2",
      status: "uploaded"
    }));

    return [...existing, ...mediaDrafts];
  }, [mediaDrafts, selectedItem]);

  const uploadSummary = useMemo(() => {
    const total = mediaDrafts.length;
    const uploaded = mediaDrafts.filter((draft) => draft.status === "uploaded").length;
    const uploading = mediaDrafts.some((draft) => draft.status === "uploading");
    const errors = mediaDrafts.filter((draft) => draft.status === "error").length;

    return { errors, total, uploaded, uploading };
  }, [mediaDrafts]);

  async function login(formData: FormData) {
    setLoginError("");

    const response = await fetch("/api/admin/login", {
      body: JSON.stringify({
        password: String(formData.get("password") ?? ""),
        username: String(formData.get("username") ?? "")
      }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
    const payload = await response.json().catch(() => ({ success: false, error: "Login endpoint did not return JSON." })) as LoginResponse;

    if (!response.ok || !payload.success) {
      setLoginError(payload.success ? "Login failed." : payload.error);
      return;
    }

    window.localStorage.setItem(authKey, payload.token);
    setToken(payload.token);
    setAuthenticated(true);
  }

  function logout() {
    window.localStorage.removeItem(authKey);
    setAuthenticated(false);
    setToken("");
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
      items.map((item) => item.id === selectedItem.id
        ? normalizeItem({
          ...item,
          ...patch,
          order: patch.display_order ?? patch.order ?? item.order,
          display_order: patch.display_order ?? patch.order ?? item.display_order,
          updated_at: new Date().toISOString()
        })
        : item
      ),
      "Draft updated in browser storage."
    );
  }

  function createNew() {
    const nextItem = createItem(items.length + 1);
    clearLocalMedia();
    persist([nextItem, ...items], "Created new draft card.");
    setSelectedId(nextItem.id);
  }

  function saveDraft() {
    updateSelected({ status: "draft", visible: true });
    setNotice("Draft saved. Export JSON to publish this data file.");
  }

  function publish() {
    const pending = mediaDrafts.filter((draft) => draft.source === "local" && draft.status !== "uploaded");

    if (pending.length) {
      setNotice("Upload or remove pending local images before publishing.");
      return;
    }

    updateSelected({ status: "published", visible: true });
    setNotice("Card marked as published. Export JSON to update src/data/letdove.json.");
  }

  function deleteSelected() {
    if (!selectedItem) {
      return;
    }

    clearLocalMedia();
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

    try {
      const imported = normalizeItems(JSON.parse(await file.text()) as LetDoveItem[]);
      clearLocalMedia();
      persist(imported, "Imported JSON draft.");
      setSelectedId(imported[0]?.id ?? "");
    } catch {
      setNotice("Import failed. Please choose a valid LetDove JSON file.");
    }
  }

  async function stageFiles(files: File[]) {
    const staged = await Promise.all(Array.from(files).map(createMediaDraft));
    const accepted = staged.filter((draft) => draft.status !== "error");
    const rejected = staged.length - accepted.length;

    setMediaDrafts((current) => [...current, ...staged]);
    setNotice(rejected ? `${accepted.length} staged, ${rejected} rejected by validation.` : `${accepted.length} image${accepted.length === 1 ? "" : "s"} staged for preview.`);
  }

  async function createMediaDraft(file: File): Promise<MediaDraft> {
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const previewUrl = URL.createObjectURL(file);
    const baseDraft: MediaDraft = {
      file,
      id,
      name: file.name || "image",
      previewUrl,
      progress: 0,
      size: file.size,
      source: "local",
      status: "local"
    };

    if (!file.type.startsWith("image/")) {
      return { ...baseDraft, error: "Only image files are supported.", status: "error" };
    }

    if (file.size > 15 * 1024 * 1024) {
      return { ...baseDraft, error: "Image must be smaller than 15MB.", status: "error" };
    }

    try {
      const dimensions = await readImageDimensions(previewUrl);
      const aspectRatio = dimensions.width / dimensions.height;

      if (aspectRatio < 0.55 || aspectRatio > 1.8) {
        return {
          ...baseDraft,
          aspectRatio,
          error: "Recommended image ratio is near 4:5, square, or portrait.",
          status: "error"
        };
      }

      return { ...baseDraft, aspectRatio };
    } catch {
      return { ...baseDraft, error: "Could not read image preview.", status: "error" };
    }
  }

  async function uploadStagedImages(targetIds?: string[]) {
    if (!selectedItem) {
      return;
    }

    const queue = mediaDrafts.filter((draft) =>
      draft.source === "local" &&
      draft.file &&
      draft.status !== "uploaded" &&
      draft.status !== "uploading" &&
      (!targetIds || targetIds.includes(draft.id))
    );

    if (!queue.length) {
      setNotice("No staged images are ready to upload.");
      return;
    }

    for (const draft of queue) {
      await uploadOneDraft(draft, selectedItem);
    }
  }

  async function uploadOneDraft(draft: MediaDraft, item: AdminItem) {
    if (!draft.file) {
      markDraft(draft.id, { error: "Missing local file.", status: "error" });
      return;
    }

    markDraft(draft.id, { error: undefined, progress: 12, status: "uploading" });

    let lastError = "Upload failed.";

    for (let attempt = 1; attempt <= maxUploadAttempts; attempt += 1) {
      const result = await uploadFile(draft.file, item, item.media.gallery.length + mediaDrafts.filter((entry) => entry.status === "uploaded").length + 1, token);

      if (result.ok) {
        markDraft(draft.id, { key: result.key, progress: 100, publicUrl: result.url, status: "uploaded" });
        appendUploadedUrl(item.id, result.url);
        setNotice(`${draft.name} uploaded to R2.`);
        return;
      }

      lastError = result.error;
      markDraft(draft.id, { error: `${result.error}${attempt < maxUploadAttempts ? " Retrying..." : ""}`, progress: Math.min(85, 18 + attempt * 24), status: "uploading" });

      if (attempt < maxUploadAttempts) {
        await wait(500 * attempt);
      }
    }

    markDraft(draft.id, { error: lastError, progress: 0, status: "error" });
  }

  function appendUploadedUrl(itemId: string, url: string) {
    const nextItems = items.map((item) => {
      if (item.id !== itemId || item.media.gallery.includes(url)) {
        return item;
      }

      const gallery = [...item.media.gallery, url];

      return normalizeItem({
        ...item,
        media: {
          cover: item.media.cover || url,
          gallery
        },
        updated_at: new Date().toISOString()
      });
    });

    persist(nextItems, "Uploaded image URL saved to media.gallery.");
  }

  async function uploadFile(file: File, item: AdminItem, startIndex: number, authToken: string) {
    if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
      return { error: "Invalid file input.", ok: false as const };
    }

    const formData = new FormData();
    formData.append("file", file, file.name || `image_${Date.now()}`);
    formData.append("category", item.category_l1 || "");
    formData.append("letdove_code", item.letdove_code || "");
    formData.append("start_index", String(startIndex));

    let response: Response;

    try {
      response = await fetch("/api/images/upload", {
        body: formData,
        headers: authToken ? { authorization: `Bearer ${authToken}` } : undefined,
        method: "POST"
      });
    } catch (error) {
      return {
        error: `Network upload failed: ${error instanceof Error ? error.message : "request could not be sent"}`,
        ok: false as const
      };
    }

    const parsed = await readUploadResponse(response);

    if (!parsed.ok) {
      return { error: parsed.error, ok: false as const };
    }

    if (!response.ok || !parsed.data.success) {
      return {
        error: parsed.data.success ? `R2 upload failed with HTTP ${response.status}.` : parsed.data.error,
        ok: false as const
      };
    }

    if (!parsed.data.url || !isPersistableImageUrl(parsed.data.url)) {
      return { error: "Upload succeeded but did not return a usable public URL.", ok: false as const };
    }

    return { key: parsed.data.key, ok: true as const, url: parsed.data.url };
  }

  async function readUploadResponse(response: Response): Promise<ParsedUploadResponse> {
    const text = await response.text();

    try {
      return { data: JSON.parse(text) as UploadResponse, ok: true, text };
    } catch {
      const isServerActionText = text.startsWith("Server") || text.includes("Failed to find Server Action");
      const isHtml = /^\s*<!doctype html|^\s*<html/i.test(text);

      return {
        error: isServerActionText
          ? "Current server is Next dev. Use npm run dev so Cloudflare Pages Functions handle uploads."
          : isHtml
            ? `Upload endpoint returned HTML with HTTP ${response.status}.`
            : `Upload endpoint did not return JSON: ${text.slice(0, 160) || `HTTP ${response.status}`}`,
        kind: isServerActionText ? "server" : "json",
        ok: false,
        text
      };
    }
  }

  function reorderMedia(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex || !selectedItem) {
      setDragIndex(null);
      return;
    }

    const existingCount = selectedItem.media.gallery.length;

    if (dragIndex < existingCount && targetIndex < existingCount) {
      const gallery = [...selectedItem.media.gallery];
      const [dragged] = gallery.splice(dragIndex, 1);
      gallery.splice(targetIndex, 0, dragged);
      updateSelected({
        media: {
          cover: gallery.includes(selectedItem.media.cover) ? selectedItem.media.cover : gallery[0] ?? "",
          gallery
        }
      });
    } else if (dragIndex >= existingCount && targetIndex >= existingCount) {
      const local = [...mediaDrafts];
      const [dragged] = local.splice(dragIndex - existingCount, 1);
      local.splice(targetIndex - existingCount, 0, dragged);
      setMediaDrafts(local);
    }

    setDragIndex(null);
  }

  function removeMedia(draft: MediaDraft) {
    if (draft.source === "r2" && selectedItem) {
      const gallery = selectedItem.media.gallery.filter((url) => url !== draft.publicUrl);
      updateSelected({
        media: {
          cover: gallery.includes(selectedItem.media.cover) ? selectedItem.media.cover : gallery[0] ?? "",
          gallery
        }
      });
      return;
    }

    setMediaDrafts((current) => current.filter((item) => item.id !== draft.id));
    if (draft.source === "local") {
      URL.revokeObjectURL(draft.previewUrl);
    }
  }

  function setCover(url: string | undefined) {
    if (!url) {
      return;
    }

    updateSelected({
      media: {
        cover: url,
        gallery: selectedItem?.media.gallery ?? []
      }
    });
  }

  function markDraft(id: string, patch: Partial<MediaDraft>) {
    setMediaDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
  }

  function clearLocalMedia() {
    mediaDrafts.forEach((draft) => {
      if (draft.source === "local") {
        URL.revokeObjectURL(draft.previewUrl);
      }
    });
    setMediaDrafts([]);
  }

  if (!authenticated) {
    return <AdminLogin error={loginError} onLogin={login} />;
  }

  return (
    <main className="admin-v3-shell">
      <header className="admin-v3-topbar">
        <div>
          <span>LetDove CMS</span>
          <h1>Content Manager</h1>
        </div>
        <div className="admin-v3-actions">
          <button onClick={createNew} type="button"><Plus size={15} />Create</button>
          <button onClick={() => downloadJson("letdove.json", items)} type="button"><Download size={15} />Export</button>
          <label><FileJson size={15} />Import<input accept="application/json" hidden onChange={(event) => importJson(event.target.files?.[0])} type="file" /></label>
          <button onClick={logout} type="button"><LogOut size={15} />Logout</button>
        </div>
      </header>

      <section className="admin-v3-grid">
        <aside className="admin-v3-panel admin-v3-left">
          <div className="admin-v3-panel-head">
            <strong>Content list</strong>
            <span>{filteredItems.length} / {items.length}</span>
          </div>
          <input
            aria-label="Search cards"
            className="admin-v3-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search code, title, tags..."
            value={query}
          />
          <div className="admin-v3-tabs">
            {(["all", "published", "draft"] as const).map((option) => (
              <button data-active={filter === option} key={option} onClick={() => setFilter(option)} type="button">{option}</button>
            ))}
          </div>
          <div className="admin-v3-list">
            {filteredItems.map((item) => (
              <button className="admin-v3-list-item" data-active={item.id === selectedItem?.id} key={item.id} onClick={() => {
                clearLocalMedia();
                setSelectedId(item.id);
              }} type="button">
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

        <section className="admin-v3-panel admin-v3-center">
          {selectedItem ? (
            <>
              <div className="admin-v3-editor-title">
                <div>
                  <span>Metadata editor</span>
                  <h2>{selectedItem.title}</h2>
                </div>
                <button className="admin-v3-danger" onClick={deleteSelected} type="button"><Trash2 size={15} />Delete</button>
              </div>

              <div className="admin-v3-form-grid">
                <Field label="title" value={selectedItem.title} onChange={(value) => updateSelected({ title: value })} />
                <Field label="letdove_code" value={selectedItem.letdove_code} onChange={(value) => updateSelected({ letdove_code: value })} />
                <Field label="id" value={selectedItem.id} onChange={(value) => updateSelected({ id: value })} />
                <Field label="series" value={selectedItem.series} onChange={(value) => updateSelected({ series: value })} />
                <Field label="category_l1" value={selectedItem.category_l1} onChange={(value) => updateSelected({ category_l1: value })} />
                <Field label="category_l2" value={selectedItem.category_l2} onChange={(value) => updateSelected({ category_l2: value })} />
                <Field label="tags" value={selectedItem.tags.join(", ")} onChange={(value) => updateSelected({ tags: splitCsv(value) })} />
                <label className="admin-v3-field">
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

              {notice && <p className="admin-v3-notice">{notice}</p>}

              <div className="admin-v3-fixed-actions">
                <button onClick={saveDraft} type="button"><Save size={15} />Save draft</button>
                <button onClick={publish} type="button"><Send size={15} />Publish</button>
              </div>
            </>
          ) : (
            <div className="admin-v3-empty">Create a card to start editing.</div>
          )}
        </section>

        <aside className="admin-v3-panel admin-v3-media">
          <div className="admin-v3-panel-head">
            <div>
              <strong>Media editor</strong>
              <span>{allMedia.length} image{allMedia.length === 1 ? "" : "s"} · {uploadSummary.uploaded}/{uploadSummary.total || 0} staged uploaded</span>
            </div>
            <label className="admin-v3-upload-button">
              <ImagePlus size={16} />
              Add
              <input accept="image/*" hidden multiple onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                void stageFiles(files);
                event.currentTarget.value = "";
              }} type="file" />
            </label>
          </div>

          <div className="admin-v3-media-stage">
            {allMedia.length ? (
              <div className="admin-v3-media-grid">
                {allMedia.map((draft, index) => (
                  <article
                    className="admin-v3-media-tile"
                    data-status={draft.status}
                    draggable
                    key={draft.id}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={() => setDragIndex(index)}
                    onDrop={() => reorderMedia(index)}
                  >
                    <img alt="" src={draft.previewUrl} />
                    <button aria-label="Preview image" className="admin-v3-media-preview" onClick={() => setPreviewDraft(draft)} type="button"><Maximize2 size={15} /></button>
                    <span className="admin-v3-grip"><GripVertical size={15} /></span>
                    <MediaStatusBadge draft={draft} />
                    {draft.status === "uploading" && <progress max={100} value={draft.progress} />}
                    <div className="admin-v3-media-meta">
                      <strong>{draft.name}</strong>
                      <small>{draft.publicUrl ?? formatBytes(draft.size)}</small>
                    </div>
                    <div className="admin-v3-media-controls">
                      <button disabled={!draft.publicUrl} onClick={() => setCover(draft.publicUrl)} type="button"><Eye size={14} />Cover</button>
                      {draft.source === "local" && draft.status !== "uploaded" && (
                        <button onClick={() => uploadStagedImages([draft.id])} type="button"><UploadCloud size={14} />Upload</button>
                      )}
                      {draft.status === "error" && draft.file && (
                        <button onClick={() => uploadStagedImages([draft.id])} type="button">Retry</button>
                      )}
                      <button onClick={() => removeMedia(draft)} type="button"><Trash2 size={14} /></button>
                    </div>
                    {draft.error && <p>{draft.error}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <label className="admin-v3-dropzone">
                <ImagePlus size={32} />
                <strong>Select images to preview</strong>
                <span>Images are staged locally first, then uploaded to R2.</span>
                <input accept="image/*" hidden multiple onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  void stageFiles(files);
                  event.currentTarget.value = "";
                }} type="file" />
              </label>
            )}
          </div>

          <div className="admin-v3-media-footer">
            <button disabled={!mediaDrafts.some((draft) => draft.status === "local" || draft.status === "error")} onClick={() => uploadStagedImages()} type="button">
              <UploadCloud size={15} />
              Batch upload to R2
            </button>
            <span data-state={uploadSummary.errors ? "error" : uploadSummary.uploading ? "uploading" : "idle"}>
              {uploadSummary.uploading ? "Uploading..." : uploadSummary.errors ? `${uploadSummary.errors} need attention` : "R2 ready"}
            </span>
          </div>
        </aside>
      </section>

      {previewDraft && (
        <div className="admin-v3-modal" role="dialog" aria-modal="true" onClick={() => setPreviewDraft(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            <button aria-label="Close preview" onClick={() => setPreviewDraft(null)} type="button"><X size={18} /></button>
            <img alt="" src={previewDraft.previewUrl} />
            <section>
              <strong>{previewDraft.name}</strong>
              <span>{previewDraft.publicUrl ?? "Local preview, not uploaded yet"}</span>
            </section>
          </div>
        </div>
      )}
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
          void onLogin(new FormData(event.currentTarget));
        }}
      >
        <h1>LetDove Admin Login</h1>
        <label>
          <span>Username</span>
          <input autoComplete="username" name="username" />
        </label>
        <label>
          <span>Password</span>
          <input autoComplete="current-password" name="password" type="password" />
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
    <label className="admin-v3-field">
      <span>{label}</span>
      {multiline ? (
        <textarea onChange={(event) => onChange(event.target.value)} readOnly={readOnly} rows={5} value={value} />
      ) : (
        <input onChange={(event) => onChange(event.target.value)} readOnly={readOnly} type={type} value={value} />
      )}
    </label>
  );
}

function MediaStatusBadge({ draft }: { draft: MediaDraft }) {
  if (draft.status === "uploaded") {
    return <span className="admin-v3-status" data-status="uploaded"><CheckCircle2 size={13} />R2</span>;
  }

  if (draft.status === "uploading") {
    return <span className="admin-v3-status" data-status="uploading"><Loader2 size={13} />Uploading</span>;
  }

  if (draft.status === "error") {
    return <span className="admin-v3-status" data-status="error"><AlertCircle size={13} />Check</span>;
  }

  return <span className="admin-v3-status" data-status="local"><Eye size={13} />Preview</span>;
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

function readImageDimensions(url: string) {
  return new Promise<{ height: number; width: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
    image.onerror = reject;
    image.src = url;
  });
}

function getImageName(url: string) {
  return decodeURIComponent(url.split("/").pop() || "image");
}

function formatBytes(size: number) {
  if (!size) {
    return "R2 image";
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isPersistableImageUrl(value: string) {
  return /^https?:\/\/.+/i.test(value) && !value.startsWith("data:") && !value.startsWith("blob:");
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
