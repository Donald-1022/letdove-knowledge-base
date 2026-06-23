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
import { useEffect, useMemo, useRef, useState } from "react";
import seedItems from "@/data/letdove.json";
import type { LetDoveItem } from "@/lib/letdove";

const authKey = "letdove-admin-token";
const storageKey = "letdove-admin-json";
const maxUploadAttempts = 3;
const dataSourcePath = "/api/items/list";

type AdminStatus = "published" | "draft";
type AdminView = "upload" | "notes" | "drafts";
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
  | { environment?: "local" | "production"; key?: string; size?: number; success: true; url?: string; urls: string[] }
  | { environment?: "local" | "production"; error: string; success: false; urls: string[] };

type ItemsListResponse =
  | { count?: number; environment?: "local" | "production"; items: LetDoveItem[]; key?: string; source?: string; success: true; updatedAt?: string | null }
  | { environment?: "local" | "production"; error: string; items: LetDoveItem[]; success: false };

type ItemsSaveResponse =
  | { count: number; environment?: "local" | "production"; key: string; success: true; updatedAt: string }
  | { environment?: "local" | "production"; error: string; success: false };

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
  uploadEnvironment?: "local" | "production";
  uploadedSize?: number;
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
  const [activeView, setActiveView] = useState<AdminView>("upload");
  const [notice, setNotice] = useState("");
  const [mediaDrafts, setMediaDrafts] = useState<MediaDraft[]>([]);
  const [previewDraft, setPreviewDraft] = useState<MediaDraft | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [noteDragIndex, setNoteDragIndex] = useState<number | null>(null);
  const [dataEnvironment, setDataEnvironment] = useState<"local" | "production" | "unknown">("unknown");
  const [dataStatus, setDataStatus] = useState<"loading" | "local-backup" | "unsaved" | "saving" | "saved" | "error">("loading");
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [saveError, setSaveError] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(authKey) ?? "";
    setToken(storedToken);
    setAuthenticated(Boolean(storedToken));

    const stored = window.localStorage.getItem(storageKey);
    const nextItems = stored ? normalizeItems(JSON.parse(stored) as LetDoveItem[]) : normalizeItems(seedItems as LetDoveItem[]);

    setItems(nextItems);
    setSelectedId(nextItems[0]?.id ?? "");
    setDataStatus(stored ? "local-backup" : "loading");

    if (storedToken) {
      void loadItemsFromServer(storedToken);
    }

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
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

  const draftCount = useMemo(() => items.filter((item) => item.status === "draft").length, [items]);
  const publishedCount = useMemo(() => items.filter((item) => item.status === "published").length, [items]);
  const visibleManagerItems = useMemo(
    () => activeView === "drafts" ? sortedItems.filter((item) => item.status === "draft") : filteredItems,
    [activeView, filteredItems, sortedItems]
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
    void loadItemsFromServer(payload.token);
  }

  function logout() {
    window.localStorage.removeItem(authKey);
    setAuthenticated(false);
    setToken("");
  }

  function persist(nextItems: AdminItem[], message = "Saved JSON draft.", saveMode: "debounced" | "immediate" = "debounced") {
    const normalized = normalizeItems(nextItems);
    setItems(normalized);
    window.localStorage.setItem(storageKey, JSON.stringify(normalized, null, 2));
    setNotice(message);
    setDataStatus("unsaved");
    setSaveError("");

    if (saveMode === "immediate") {
      void saveItemsToServer(normalized);
      return;
    }

    scheduleSave(normalized);
  }

  async function loadItemsFromServer(authToken = token) {
    setDataStatus("loading");
    setSaveError("");

    try {
      const response = await fetch(dataSourcePath, {
        headers: authToken ? { authorization: `Bearer ${authToken}` } : {}
      });
      const payload = await response.json().catch(() => null) as ItemsListResponse | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload && "error" in payload ? payload.error : `Load failed with HTTP ${response.status}`);
      }

      setDataEnvironment(payload.environment ?? "production");
      setLastLoadedAt(new Date().toLocaleString());

      if (payload.items.length) {
        const normalized = normalizeItems(payload.items);
        setItems(normalized);
        window.localStorage.setItem(storageKey, JSON.stringify(normalized, null, 2));
        setSelectedId((current) => current && normalized.some((item) => item.id === current) ? current : normalized[0]?.id ?? "");
        setNotice(`Loaded ${normalized.length} cards from R2 metadata.`);
        setDataStatus("saved");
        return;
      }

      setDataStatus("local-backup");
      setNotice("R2 metadata is empty. Using bundled seed/local backup until you save.");
    } catch (error) {
      setDataStatus("error");
      setSaveError(error instanceof Error ? error.message : "Failed to load R2 metadata.");
      setNotice("Could not load R2 metadata. Using local backup.");
    }
  }

  function scheduleSave(nextItems: AdminItem[]) {
    if (!token) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void saveItemsToServer(nextItems);
    }, 800);
  }

  async function saveItemsToServer(nextItems: AdminItem[] = items) {
    if (!token) {
      setDataStatus("local-backup");
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setDataStatus("saving");
    setSaveError("");

    try {
      const response = await fetch("/api/items/save", {
        body: JSON.stringify({ items: nextItems }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json().catch(() => null) as ItemsSaveResponse | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload && "error" in payload ? payload.error : `Save failed with HTTP ${response.status}`);
      }

      setDataEnvironment(payload.environment ?? "production");
      setLastSavedAt(new Date(payload.updatedAt).toLocaleString());
      setDataStatus("saved");
      setNotice(`Saved ${payload.count} cards to R2 metadata.`);
    } catch (error) {
      setDataStatus("error");
      setSaveError(error instanceof Error ? error.message : "Failed to save R2 metadata.");
      setNotice("Save failed. Local backup is still preserved in this browser.");
    }
  }

  function updateSelected(patch: Partial<AdminItem>, saveMode: "debounced" | "immediate" = "debounced") {
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
      "Draft updated. Syncing metadata to R2.",
      saveMode
    );
  }

  function createNew() {
    const nextItem = createItem(items.length + 1);
    clearLocalMedia();
    persist([nextItem, ...items], "Created new draft card.", "immediate");
    setSelectedId(nextItem.id);
  }

  function saveDraft() {
    updateSelected({ status: "draft", visible: true }, "immediate");
    setNotice("Draft saved to R2 metadata.");
  }

  function publish() {
    const pending = mediaDrafts.filter((draft) => draft.source === "local" && draft.status !== "uploaded");

    if (pending.length) {
      setNotice("Upload or remove pending local images before publishing.");
      return;
    }

    updateSelected({ status: "published", visible: true }, "immediate");
    setNotice("Card marked as published and saved to R2 metadata.");
  }

  function deleteSelected() {
    if (!selectedItem) {
      return;
    }

    clearLocalMedia();
    const nextItems = items.filter((item) => item.id !== selectedItem.id);
    persist(nextItems, `Deleted ${selectedItem.letdove_code}.`, "immediate");
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
      persist(imported, "Imported JSON and syncing to R2 metadata.", "immediate");
      setSelectedId(imported[0]?.id ?? "");
    } catch {
      setNotice("Import failed. Please choose a valid LetDove JSON file.");
    }
  }

  async function importPublishJson(file: File | undefined) {
    if (!file || !selectedItem) {
      return;
    }

    try {
      const data = JSON.parse(await file.text()) as {
        caption?: string;
        hashtags?: string[];
        post_title?: string;
        publish_status?: string;
      };

      updateSelected({
        description: data.caption ?? selectedItem.description,
        status: data.publish_status === "draft" ? "draft" : selectedItem.status,
        tags: Array.isArray(data.hashtags) ? data.hashtags.map((tag) => tag.replace(/^#/, "")) : selectedItem.tags,
        title: data.post_title ?? selectedItem.title
      }, "immediate");
      setNotice("publish.json imported into the current note fields.");
    } catch {
      setNotice("publish.json import failed. Please choose a valid publish JSON file.");
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
        markDraft(draft.id, {
          key: result.key,
          progress: 100,
          publicUrl: result.url,
          status: "uploaded",
          uploadEnvironment: result.environment,
          uploadedSize: result.size
        });
        appendUploadedUrl(item.id, result.url);
        setNotice(
          result.environment === "local"
            ? `${draft.name} uploaded to local Wrangler R2. The CDN URL may 404 until the same key is uploaded in production.`
            : `${draft.name} uploaded to production R2. Key: ${result.key}`
        );
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
    setItems((currentItems) => {
      const nextItems = normalizeItems(currentItems.map((item) => {
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
      }));

      window.localStorage.setItem(storageKey, JSON.stringify(nextItems, null, 2));
      void saveItemsToServer(nextItems);
      return nextItems;
    });
    setNotice("Uploaded image URL saved to R2 metadata.");
  }

  async function uploadFile(file: File, item: AdminItem, startIndex: number, authToken: string) {
    if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
      return { error: "Invalid file input.", ok: false as const };
    }

    let response: Response;

    try {
      response = await fetch("/api/images/upload", {
        body: file,
        headers: {
          ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
          "content-type": file.type || "application/octet-stream",
          "x-letdove-category": item.category_l1 || "",
          "x-letdove-code": item.letdove_code || "",
          "x-letdove-file-name": encodeURIComponent(file.name || `image_${Date.now()}`),
          "x-letdove-start-index": String(startIndex)
        },
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

    const url = parsed.data.urls?.[0];

    if (!url || !isPersistableImageUrl(url)) {
      return { error: "Upload API did not return a confirmed public R2 URL.", ok: false as const };
    }

    return {
      environment: parsed.data.environment ?? "production",
      key: parsed.data.key ?? getImageName(url),
      ok: true as const,
      size: parsed.data.size,
      url
    };
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

  function reorderNote(targetIndex: number) {
    if (noteDragIndex === null || noteDragIndex === targetIndex) {
      setNoteDragIndex(null);
      return;
    }

    const source = [...visibleManagerItems];
    const [dragged] = source.splice(noteDragIndex, 1);
    source.splice(targetIndex, 0, dragged);
    const orderMap = new Map(source.map((item, index) => [item.id, index + 1]));
    const nextItems = items.map((item) => normalizeItem({
      ...item,
      display_order: orderMap.get(item.id) ?? item.display_order,
      order: orderMap.get(item.id) ?? item.order
    }));

    persist(nextItems, "Note order updated.");
    setNoteDragIndex(null);
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
    <main className="admin-xhs-shell">
      <aside className="admin-xhs-sidebar">
        <div className="admin-xhs-brand">
          <span>LetDove</span>
          <strong>创作服务平台</strong>
        </div>
        <button className="admin-xhs-publish" onClick={() => {
          createNew();
          setActiveView("upload");
        }} type="button"><Plus size={15} />发布笔记</button>
        <nav className="admin-xhs-nav">
          <button data-active={activeView === "upload"} onClick={() => setActiveView("upload")} type="button"><ImagePlus size={16} />上传图文</button>
          <button data-active={activeView === "notes"} onClick={() => setActiveView("notes")} type="button"><FileJson size={16} />笔记管理<span>{publishedCount}</span></button>
          <button data-active={activeView === "drafts"} onClick={() => setActiveView("drafts")} type="button"><Save size={16} />草稿箱<span data-dot>{draftCount}</span></button>
        </nav>
        <div className="admin-xhs-sidebar-tools">
          <button onClick={() => loadItemsFromServer()} type="button"><Download size={15} />从 R2 重新加载</button>
          <button onClick={() => saveItemsToServer()} type="button"><UploadCloud size={15} />同步到 R2</button>
          <button onClick={() => downloadJson("letdove.json", items)} type="button"><Download size={15} />导出 JSON</button>
          <label><FileJson size={15} />导入 JSON<input accept="application/json" hidden onChange={(event) => importJson(event.target.files?.[0])} type="file" /></label>
          <button onClick={logout} type="button"><LogOut size={15} />退出登录</button>
        </div>
      </aside>

      <section className="admin-xhs-main">
        <header className="admin-xhs-topbar">
          <div className="admin-xhs-tabs">
            <button data-active={activeView === "upload"} onClick={() => setActiveView("upload")} type="button">上传图文</button>
            <button data-active={activeView === "notes"} onClick={() => setActiveView("notes")} type="button">笔记管理</button>
            <button data-active={activeView === "drafts"} onClick={() => setActiveView("drafts")} type="button">草稿箱({draftCount})</button>
          </div>
          <div className="admin-xhs-data-status" data-state={dataStatus}>
            <strong>{getDataStatusLabel(dataStatus)}</strong>
            <span>Source {dataSourcePath}</span>
            <span>Env {dataEnvironment}</span>
            {lastLoadedAt && <span>Loaded {lastLoadedAt}</span>}
            {lastSavedAt && <span>Saved {lastSavedAt}</span>}
            {saveError && <span>{saveError}</span>}
          </div>
        </header>

        {activeView === "upload" && selectedItem && (
          <section className="admin-xhs-compose">
            <div className="admin-xhs-upload-card">
              {allMedia.length ? (
                <div className="admin-xhs-media-grid">
                  {allMedia.map((draft, index) => (
                    <article
                      className="admin-xhs-media-card"
                      data-status={draft.status}
                      draggable
                      key={draft.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDragStart={() => setDragIndex(index)}
                      onDrop={() => reorderMedia(index)}
                    >
                      <img alt="" src={draft.previewUrl} />
                      <button aria-label="Preview image" className="admin-xhs-preview" onClick={() => setPreviewDraft(draft)} type="button"><Maximize2 size={15} /></button>
                      <span className="admin-xhs-drag"><GripVertical size={15} /></span>
                      <MediaStatusBadge draft={draft} />
                      {draft.status === "uploading" && <progress max={100} value={draft.progress} />}
                      <strong>{draft.name}</strong>
                      <small>{draft.publicUrl ?? formatBytes(draft.size)}</small>
                      {draft.uploadEnvironment && (
                        <small>{draft.uploadEnvironment === "local" ? "Local Wrangler R2" : `Production R2${draft.uploadedSize ? ` · ${formatBytes(draft.uploadedSize)}` : ""}`}</small>
                      )}
                      <div>
                        {draft.source === "local" && draft.status !== "uploaded" && <button onClick={() => uploadStagedImages([draft.id])} type="button"><UploadCloud size={14} />上传</button>}
                        <button onClick={() => removeMedia(draft)} type="button"><Trash2 size={14} /></button>
                      </div>
                      {draft.error && <p>{draft.error}</p>}
                    </article>
                  ))}
                  <label className="admin-xhs-add-tile">
                    <ImagePlus size={26} />
                    <span>继续添加</span>
                    <input accept="image/*" hidden multiple onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      void stageFiles(files);
                      event.currentTarget.value = "";
                    }} type="file" />
                  </label>
                </div>
              ) : (
                <label className="admin-xhs-dropzone">
                  <ImagePlus size={68} />
                  <strong>上传图片，或拖入图文素材</strong>
                  <span>先本地预览，再上传至 R2；推荐 3:4 到 2:1，最大 15MB</span>
                  <input accept="image/*" hidden multiple onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    void stageFiles(files);
                    event.currentTarget.value = "";
                  }} type="file" />
                </label>
              )}
              <div className="admin-xhs-upload-footer">
                <button disabled={!mediaDrafts.some((draft) => draft.status === "local" || draft.status === "error")} onClick={() => uploadStagedImages()} type="button"><UploadCloud size={15} />批量上传到 R2</button>
                <span data-state={uploadSummary.errors ? "error" : uploadSummary.uploading ? "uploading" : "idle"}>{uploadSummary.uploading ? "上传中..." : uploadSummary.errors ? `${uploadSummary.errors} 个错误待处理` : "R2 就绪"}</span>
              </div>
            </div>

            <aside className="admin-xhs-editor">
              <div>
                <span>填写内容</span>
                <h2>{selectedItem.title}</h2>
              </div>
              <label className="admin-xhs-json-import">
                <FileJson size={15} />
                导入 publish.json 到当前笔记
                <input accept="application/json" hidden onChange={(event) => importPublishJson(event.target.files?.[0])} type="file" />
              </label>
              <Field label="标题" value={selectedItem.title} onChange={(value) => updateSelected({ title: value })} />
              <Field label="LetDove code" value={selectedItem.letdove_code} onChange={(value) => updateSelected({ letdove_code: value })} />
              <Field label="描述" multiline value={selectedItem.description} onChange={(value) => updateSelected({ description: value })} />
              <Field label="标签" value={selectedItem.tags.join(", ")} onChange={(value) => updateSelected({ tags: splitCsv(value) })} />
              <div className="admin-xhs-two">
                <Field label="一级分类" value={selectedItem.category_l1} onChange={(value) => updateSelected({ category_l1: value })} />
                <Field label="二级分类" value={selectedItem.category_l2} onChange={(value) => updateSelected({ category_l2: value })} />
              </div>
              <Field label="系列" value={selectedItem.series} onChange={(value) => updateSelected({ series: value })} />
              <label className="admin-v3-field">
                <span>状态</span>
                <select value={selectedItem.status} onChange={(event) => updateSelected({ status: event.target.value as AdminStatus })}>
                  <option value="draft">draft</option>
                  <option value="published">published</option>
                </select>
              </label>
              {notice && <p className="admin-xhs-alert">{notice}</p>}
              <div className="admin-xhs-editor-actions">
                <button onClick={saveDraft} type="button"><Save size={15} />存草稿</button>
                <button onClick={publish} type="button"><Send size={15} />发布</button>
              </div>
            </aside>
          </section>
        )}

        {(activeView === "notes" || activeView === "drafts") && (
          <section className="admin-xhs-notes">
            <div className="admin-xhs-notes-head">
              <div>
                <h2>{activeView === "drafts" ? "草稿箱" : "笔记管理"}</h2>
                <span>{visibleManagerItems.length} 篇 · 支持拖拽排序</span>
              </div>
              <input aria-label="Search notes" onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、code、标签" value={query} />
            </div>
            <div className="admin-xhs-note-grid">
              {visibleManagerItems.map((item, index) => (
                <article
                  className="admin-xhs-note-card"
                  draggable
                  key={item.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setNoteDragIndex(index)}
                  onDrop={() => reorderNote(index)}
                >
                  {item.media.cover ? <img alt="" src={item.media.cover} /> : <span>No image</span>}
                  <section>
                    <code>{item.letdove_code}</code>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <small>{item.status} · order {item.display_order}</small>
                    <div>
                      <button onClick={() => {
                        clearLocalMedia();
                        setSelectedId(item.id);
                        setActiveView("upload");
                      }} type="button">编辑</button>
                    </div>
                  </section>
                </article>
              ))}
            </div>
          </section>
        )}
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
    <main className="admin-xhs-login-shell">
      <form
        className="admin-xhs-login-card"
        onSubmit={(event) => {
          event.preventDefault();
          void onLogin(new FormData(event.currentTarget));
        }}
      >
        <div className="admin-xhs-login-brand">
          <span>LetDove</span>
          <strong>创作服务平台</strong>
        </div>
        <h1>Admin Login</h1>
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

function getDataStatusLabel(status: "loading" | "local-backup" | "unsaved" | "saving" | "saved" | "error") {
  if (status === "loading") {
    return "Loading data";
  }

  if (status === "local-backup") {
    return "Local backup";
  }

  if (status === "unsaved") {
    return "Unsaved changes";
  }

  if (status === "saving") {
    return "Saving...";
  }

  if (status === "error") {
    return "Sync error";
  }

  return "Saved to R2";
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
