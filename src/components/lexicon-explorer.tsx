"use client";

import {
  ChevronLeft,
  ChevronRight,
  Hash,
  Images,
  Layers,
  Moon,
  Search,
  Sun
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getItemImages, searchLetDoveItems, type LetDoveItem } from "@/lib/letdove";
import { ShareActions } from "@/components/share-actions";

type LexiconExplorerProps = {
  items: LetDoveItem[];
  categoryL1Options: string[];
  categoryL2Options: string[];
  series: string[];
};

const ALL = "all";

type ItemsListResponse =
  | { environment?: "local" | "production"; items: LetDoveItem[]; success: true; updatedAt?: string | null }
  | { error: string; items: LetDoveItem[]; success: false };

export function LexiconExplorer({
  items,
  categoryL1Options,
  categoryL2Options,
  series
}: LexiconExplorerProps) {
  const [query, setQuery] = useState("");
  const [categoryL1, setCategoryL1] = useState(ALL);
  const [categoryL2, setCategoryL2] = useState(ALL);
  const [selectedSeries, setSelectedSeries] = useState(ALL);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [liveItems, setLiveItems] = useState(items);
  const [dataNotice, setDataNotice] = useState("");

  const liveCategoryL1Options = useMemo(
    () => Array.from(new Set(liveItems.map((item) => item.category_l1))).sort(),
    [liveItems]
  );
  const liveCategoryL2Options = useMemo(
    () => Array.from(new Set(liveItems.map((item) => item.category_l2))).sort(),
    [liveItems]
  );
  const liveSeries = useMemo(
    () => Array.from(new Set(liveItems.map((item) => item.series))).sort(),
    [liveItems]
  );

  const l2Options = useMemo(() => {
    if (categoryL1 === ALL) {
      return liveCategoryL2Options.length ? liveCategoryL2Options : categoryL2Options;
    }

    return Array.from(
      new Set(
        liveItems
          .filter((item) => item.category_l1 === categoryL1)
          .map((item) => item.category_l2)
      )
    ).sort();
  }, [categoryL1, categoryL2Options, liveCategoryL2Options, liveItems]);

  const visibleItems = useMemo(() => {
    const categoryFiltered = liveItems.filter((item) => {
      const l1Match = categoryL1 === ALL || item.category_l1 === categoryL1;
      const l2Match = categoryL2 === ALL || item.category_l2 === categoryL2;
      const seriesMatch = selectedSeries === ALL || item.series === selectedSeries;
      const visibleMatch = item.visible !== false && item.status !== "draft";

      return l1Match && l2Match && seriesMatch && visibleMatch;
    });

    return searchLetDoveItems(query, categoryFiltered);
  }, [categoryL1, categoryL2, liveItems, query, selectedSeries]);

  const selectedItem = useMemo(
    () => liveItems.find((item) => item.id === selectedId) ?? null,
    [liveItems, selectedId]
  );

  const modalItems = visibleItems.some((item) => item.id === selectedId) ? visibleItems : liveItems;
  const selectedIndex = selectedItem
    ? modalItems.findIndex((item) => item.id === selectedItem.id)
    : -1;

  const allTags = useMemo(
    () => Array.from(new Set(liveItems.flatMap((item) => item.tags))).sort().slice(0, 12),
    [liveItems]
  );

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

        setLiveItems(payload.items);
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
    if (categoryL2 !== ALL && !l2Options.includes(categoryL2)) {
      setCategoryL2(ALL);
    }
  }, [categoryL2, l2Options]);

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
    setCategoryL1(ALL);
    setCategoryL2(ALL);
    setSelectedSeries(ALL);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-stack">
          <span className="brand-kicker">LetDove Content System</span>
          <h1 className="brand-title">letdove knowledge base</h1>
          <p className="brand-copy">
            A shared reference library built for quick lookup across L1/L2 categories, tags, and LetDove code.
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
              <span className="metric-value">{liveCategoryL1Options.length || categoryL1Options.length}</span>
              <span className="metric-label">L1</span>
            </div>
            <div className="metric">
              <span className="metric-value">{liveCategoryL2Options.length || categoryL2Options.length}</span>
              <span className="metric-label">L2</span>
            </div>
          </div>
        </div>
      </header>

      <section className="toolbar" aria-label="Search and filters">
        <label className="search-field">
          <Search aria-hidden="true" />
          <input
            aria-label="Search title, tags, code, and description"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, tags, code..."
            type="search"
            value={query}
          />
        </label>

        <label className="select-shell">
          <Layers aria-hidden="true" />
          <select
            aria-label="Filter by L1 category"
            onChange={(event) => setCategoryL1(event.target.value)}
            value={categoryL1}
          >
            <option value={ALL}>All L1</option>
            {(liveCategoryL1Options.length ? liveCategoryL1Options : categoryL1Options).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="select-shell">
          <Layers aria-hidden="true" />
          <select
            aria-label="Filter by L2 category"
            onChange={(event) => setCategoryL2(event.target.value)}
            value={categoryL2}
          >
            <option value={ALL}>All L2</option>
            {l2Options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="select-shell">
          <Layers aria-hidden="true" />
          <select
            aria-label="Filter by series"
            onChange={(event) => setSelectedSeries(event.target.value)}
            value={selectedSeries}
          >
            <option value={ALL}>All series</option>
            {(liveSeries.length ? liveSeries : series).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

      </section>

      <section className="tag-search-row" aria-label="Search tags">
        <span className="tag-search-label">Search tags</span>
        {allTags.map((tag) => (
          <button
            className="chip"
            data-active={query.toLowerCase() === tag.toLowerCase()}
            key={tag}
            onClick={() => setQuery(tag)}
            type="button"
          >
            <Hash aria-hidden="true" size={13} />
            {tag}
          </button>
        ))}
      </section>

      <div className="grid-meta">
        <span>
          Showing <code>{visibleItems.length}</code> of <code>{items.length}</code>
          {dataNotice && <span> · {dataNotice}</span>}
        </span>
        {(query || categoryL1 !== ALL || categoryL2 !== ALL || selectedSeries !== ALL) && (
          <button className="chip" onClick={resetFilters} type="button">
            Reset filters
          </button>
        )}
      </div>

      {visibleItems.length > 0 ? (
        <section
          className="lexicon-grid"
          aria-label="LetDove card grid"
          key={`${query}-${categoryL1}-${categoryL2}-${visibleItems.map((item) => item.id).join("-")}`}
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
                  <span className="card-tags">
                    {item.tags.slice(0, 3).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      ) : (
        <section className="empty-state">
          <p>No cards match this view. Try a broader code, tag, L1, L2, or series.</p>
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
  item: LetDoveItem;
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

            <div className="taxonomy-line">
              <span>L1 {item.category_l1}</span>
              <span>/</span>
              <span>L2 {item.category_l2}</span>
              <span>·</span>
              <span>{item.series}</span>
            </div>

            <div className="block-list">
              {item.cards.map((card) => (
                <section className="block-item" key={card.label}>
                  <strong className="block-label">{card.label}</strong>
                  <p className="block-body">{card.body}</p>
                </section>
              ))}
            </div>

            <div className="tag-list" aria-label="Search tags">
              {item.tags.map((tag) => (
                <span className="tag-pill" key={tag}>
                  #{tag}
                </span>
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
