"use client";

import {
  ChevronLeft,
  ChevronRight,
  Images,
  Moon,
  Search,
  Sun
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adaptItems, type LetDoveViewItem } from "@/lib/letdove-adapter";
import { getItemImages, searchLetDoveItems, type LetDoveItem } from "@/lib/letdove";
import { ShareActions } from "@/components/share-actions";

type LexiconExplorerProps = {
  items: LetDoveViewItem[];
};

type ItemsListResponse =
  | { environment?: "local" | "preview" | "production"; items: LetDoveItem[]; success: true; updatedAt?: string | null }
  | { error: string; items: LetDoveItem[]; success: false };

export function LexiconExplorer({
  items
}: LexiconExplorerProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [liveItems, setLiveItems] = useState<LetDoveViewItem[]>(items);
  const [dataNotice, setDataNotice] = useState("");

  const visibleItems = useMemo(() => {
    const publishedItems = liveItems.filter((item) => item.status === "published");

    return searchLetDoveItems(query, publishedItems);
  }, [liveItems, query]);

  const selectedItem = useMemo(
    () => liveItems.find((item) => item.id === selectedId) ?? null,
    [liveItems, selectedId]
  );

  const modalItems = visibleItems.some((item) => item.id === selectedId) ? visibleItems : liveItems;
  const selectedIndex = selectedItem
    ? modalItems.findIndex((item) => item.id === selectedItem.id)
    : -1;

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("letdove-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextTheme = storedTheme === "dark" || (!storedTheme && prefersDark) ? "dark" : "light";

    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("letdove-theme", theme);
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function loadLiveItems() {
      try {
        const response = await fetch("/api/items/list", { cache: "no-store" });
        const payload = await response.json().catch(() => null) as ItemsListResponse | null;

        if (!active || !response.ok || !payload?.success || !payload.items.length) {
          return;
        }

        setLiveItems(adaptItems(payload.items));
        setDataNotice(`Live R2 metadata loaded${payload.environment ? ` · ${payload.environment}` : ""}`);
      } catch {
        if (active) {
          setDataNotice("Using bundled fallback data");
        }
      }
    }

    void loadLiveItems();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setSelectedId(params.get("item"));
    };

    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);

    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }

    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function openItem(id: string) {
    setSelectedId(id);
    const params = new URLSearchParams(window.location.search);
    params.set("item", id);
    window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  function closeModal() {
    setSelectedId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("item");
    const queryString = params.toString();
    window.history.pushState(null, "", `${window.location.pathname}${queryString ? `?${queryString}` : ""}`);
  }

  function moveSelection(direction: -1 | 1) {
    if (!selectedItem || selectedIndex < 0 || modalItems.length < 2) {
      return;
    }

    const nextIndex = (selectedIndex + direction + modalItems.length) % modalItems.length;
    openItem(modalItems[nextIndex].id);
  }

  function resetFilters() {
    setQuery("");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-stack">
          <span className="brand-kicker">LetDove Content System</span>
          <h1 className="brand-title">letdove knowledge base</h1>
          <p className="brand-copy">
            A shared reference library built for quick lookup across L1/L2 categories and LetDove code.
          </p>
        </div>

        <div className="topbar-actions">
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="icon-button theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            type="button"
          >
            {theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>

          <div className="metric-strip" aria-label="Library statistics">
            <div className="metric">
              <span className="metric-value">{liveItems.length}</span>
              <span className="metric-label">cards</span>
            </div>
            <div className="metric">
              <span className="metric-value">{visibleItems.length}</span>
              <span className="metric-label">live</span>
            </div>
            <div className="metric">
              <span className="metric-value">{liveItems.filter((item) => item.status === "draft").length}</span>
              <span className="metric-label">drafts</span>
            </div>
          </div>
        </div>
      </header>

      <section className="toolbar" aria-label="Search and filters">
        <label className="search-field">
            <Search aria-hidden="true" />
            <input
            aria-label="Search title, code, and description"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, code..."
            type="search"
            value={query}
          />
        </label>

      </section>
      <div className="grid-meta">
        <span>
          Showing <code>{visibleItems.length}</code> of <code>{items.length}</code>
          {dataNotice && <span> · {dataNotice}</span>}
        </span>
        {query && (
          <button className="chip" onClick={resetFilters} type="button">
            Reset filters
          </button>
        )}
      </div>

      {visibleItems.length > 0 ? (
        <section
          className="lexicon-grid"
          aria-label="LetDove card grid"
          key={`${query}-${visibleItems.map((item) => item.id).join("-")}`}
        >
          {visibleItems.map((item) => {
            const images = getItemImages(item);

            return (
              <button
                aria-label={`Open ${item.title}`}
                className="lexicon-card"
                key={item.id}
                onClick={() => openItem(item.id)}
                type="button"
              >
                <img alt="" loading="lazy" src={images[0]} />
                <span className="card-wash" />
                {images.length > 1 && (
                  <span className="image-count">
                    <Images aria-hidden="true" size={14} />
                    {images.length}
                  </span>
                )}
                <span className="card-content">
                  <span className="card-title">{item.title}</span>
                  <span className="card-code">{item.letdove_code}</span>
                  <span className="card-description">{item.description}</span>
                </span>
              </button>
            );
          })}
        </section>
      ) : (
        <section className="empty-state">
          <p>No cards match this view. Try a broader title, code, or description.</p>
        </section>
      )}

      {selectedItem && (
        <PostModal
          item={selectedItem}
          onClose={closeModal}
        />
      )}
    </main>
  );
}

type PostModalProps = {
  item: LetDoveViewItem;
  onClose: () => void;
};

function PostModal({ item, onClose }: PostModalProps) {
  const images = getItemImages(item);
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    setImageIndex(0);
  }, [item.id]);

  function moveImage(direction: -1 | 1) {
    setImageIndex((current) => Math.max(0, Math.min(images.length - 1, current + direction)));
  }

  return (
    <div
      aria-label={`${item.title} detail`}
      aria-modal="true"
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
    >
      <article className="post-modal" onClick={(event) => event.stopPropagation()}>
        <div className="post-media">
          <img alt={item.title} key={images[imageIndex]} src={images[imageIndex]} />
          {images.length > 1 && (
            <>
              {imageIndex > 0 && (
                <button
                  aria-label="Previous image"
                  className="media-arrow media-arrow-left"
                  onClick={() => moveImage(-1)}
                  title="Previous image"
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
              )}
              {imageIndex < images.length - 1 && (
                <button
                  aria-label="Next image"
                  className="media-arrow media-arrow-right"
                  onClick={() => moveImage(1)}
                  title="Next image"
                  type="button"
                >
                  <ChevronRight aria-hidden="true" />
                </button>
              )}
              <div className="media-dots" aria-label="Image position">
                {images.map((image, index) => (
                  <span data-active={index === imageIndex} key={image} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="post-panel">
          <header className="post-header">
            <div className="post-heading">
              <h2 className="post-title">{item.title}</h2>
              <div className="post-subrow">
                <span className="post-code">{item.letdove_code}</span>
              </div>
            </div>
          </header>

          <div className="post-scroll">
            <span className="created-note">Created {item.created_at}</span>
            <p className="post-description">{item.description}</p>

            <div className="block-list">
              {(item.cards ?? []).map((card) => (
                <section className="block-item" key={card.label}>
                  <strong className="block-label">{card.label}</strong>
                  <p className="block-body">{card.body}</p>
                </section>
              ))}
            </div>

          </div>

          <footer className="post-footer compact-footer">
                  <ShareActions id={item.letdove_code} iconOnly />
          </footer>
        </div>
      </article>
    </div>
  );
}
