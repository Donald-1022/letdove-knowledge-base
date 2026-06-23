import items from "@/data/letdove.json";
import Fuse from "fuse.js";
import { adaptItem, adaptItems, getItemImageUrls, normalizeStoredKey } from "@/lib/letdove-adapter";

export type LetDoveCardBlock = {
  label: string;
  body: string;
};

export type LetDoveLink = {
  label: string;
  url: string;
};

export type LetDoveItem = {
  id: string;
  letdove_code: string;
  title: string;
  description: string;
  images: string[];
  cover: string;
  status: "draft" | "published" | "processing" | "failed";
  created_at: string;
  updated_at: string;
  search_index?: string;
  cards?: LetDoveCardBlock[];
  links?: LetDoveLink[];
  order?: number;
  display_order?: number;
  pinned?: boolean;
  visible?: boolean;
  version?: number;
  sop?: string;
  internal_links?: string[];
};

const letDoveItems = (items as Partial<LetDoveItem>[]).map(normalizeLetDoveItem);
const letDoveViewItems = adaptItems(letDoveItems);
const fuseOptions = {
  threshold: 0.34,
  ignoreLocation: true,
  keys: [
    { name: "title", weight: 0.28 },
    { name: "description", weight: 0.24 },
    { name: "letdove_code", weight: 0.28 },
    { name: "search_index", weight: 0.2 }
  ]
};

export function getLetDoveItems() {
  return letDoveViewItems;
}

export function getLetDoveItem(id: string) {
  const item = letDoveItems.find((entry) => entry.letdove_code === id || entry.id === id);

  return item ? adaptItem(item) : undefined;
}

export function getLetDoveItemByCode(letdoveCode: string) {
  const item = letDoveItems.find((entry) => entry.letdove_code === letdoveCode);

  return item ? adaptItem(item) : undefined;
}

export function getItemImages(item: LetDoveItem) {
  return getItemImageUrls(item);
}

export function searchLetDoveItems(query: string, source: LetDoveItem[]) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return source;
  }

  const exactCodeMatches = source.filter((item) => item.letdove_code.toLowerCase() === normalized);

  if (exactCodeMatches.length) {
    return exactCodeMatches;
  }

  const sourceIds = new Set(source.map((item) => item.id));
  const fuzzyResults = new Fuse(source, fuseOptions).search(normalized).map((result) => result.item);
  const matchedIds = new Set<string>();
  const results: LetDoveItem[] = [];

  fuzzyResults.forEach((item) => {
    if (sourceIds.has(item.id)) {
      matchedIds.add(item.id);
      results.push(item);
    }
  });

  source.forEach((item) => {
    const searchable = [
      item.title,
      item.description,
      item.letdove_code,
      item.search_index
    ]
      .join(" ")
      .toLowerCase();

    if (!matchedIds.has(item.id) && searchable.includes(normalized)) {
      results.push(item);
    }
  });

  return results;
}

export function normalizeLetDoveItem(item: Partial<LetDoveItem>): LetDoveItem {
  const images = (item.images ?? [])
    .map((image) => normalizeStoredKey(image, item.letdove_code || item.id || ""))
    .filter(Boolean);
  const cover = normalizeStoredKey(item.cover || images[0] || "", item.letdove_code || item.id || "");
  const letdoveCode = String(item.letdove_code || item.id || `LD_${Date.now()}`).trim();
  const status = ["draft", "published", "processing", "failed"].includes(String(item.status))
    ? item.status as LetDoveItem["status"]
    : "draft";

  return {
    id: String(item.id || letdoveCode).trim().toLowerCase(),
    letdove_code: letdoveCode,
    title: item.title ?? "",
    description: item.description ?? "",
    images: images.length ? images : cover ? [cover] : [],
    cover,
    status,
    created_at: item.created_at ?? new Date().toISOString().slice(0, 10),
    updated_at: item.updated_at ?? new Date().toISOString(),
    search_index: [
      item.title,
      item.description,
      item.letdove_code
    ].filter(Boolean).join(" "),
    cards: item.cards ?? [],
    links: item.links ?? [],
    order: item.order,
    display_order: item.display_order,
    pinned: item.pinned,
    visible: item.visible,
    version: item.version,
    sop: item.sop,
    internal_links: item.internal_links
  };
}
