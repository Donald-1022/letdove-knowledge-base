import items from "@/data/letdove.json";
import Fuse from "fuse.js";

export type LetDoveCardBlock = {
  label: string;
  body: string;
};

export type LetDoveLink = {
  label: string;
  url: string;
};

export type LetDoveMedia = {
  cover: string;
  gallery: string[];
};

export type LetDoveItem = {
  id: string;
  letdove_code: string;
  title: string;
  description: string;
  media: LetDoveMedia;
  category_l1: string;
  category_l2: string;
  series: string;
  tags: string[];
  search_index: string;
  cards: LetDoveCardBlock[];
  links: LetDoveLink[];
  created_at: string;
  order?: number;
  display_order?: number;
  pinned?: boolean;
  visible?: boolean;
  status?: "published" | "draft";
  version?: number;
  updated_at?: string;
  sop?: string;
  internal_links?: string[];
};

const letDoveItems = items as LetDoveItem[];
const fuseOptions = {
  threshold: 0.34,
  ignoreLocation: true,
  keys: [
    { name: "title", weight: 0.28 },
    { name: "description", weight: 0.18 },
    { name: "tags", weight: 0.22 },
    { name: "letdove_code", weight: 0.2 },
    { name: "search_index", weight: 0.12 }
  ]
};

export function getLetDoveItems() {
  return letDoveItems;
}

export function getLetDoveItem(id: string) {
  return letDoveItems.find((item) => item.letdove_code === id || item.id === id);
}

export function getLetDoveItemByCode(letdoveCode: string) {
  return letDoveItems.find((item) => item.letdove_code === letdoveCode);
}

export function getCategoryKeys(item: LetDoveItem) {
  return `${item.category_l1} / ${item.category_l2}`;
}

export function getItemImages(item: LetDoveItem) {
  return item.media.gallery.length ? item.media.gallery : [item.media.cover];
}

export function getCategoryL1Options() {
  return Array.from(new Set(letDoveItems.map((item) => item.category_l1))).sort();
}

export function getCategoryL2Options(categoryL1?: string) {
  const source = categoryL1
    ? letDoveItems.filter((item) => item.category_l1 === categoryL1)
    : letDoveItems;

  return Array.from(new Set(source.map((item) => item.category_l2))).sort();
}

export function getSeriesOptions() {
  return Array.from(new Set(letDoveItems.map((item) => item.series))).sort();
}

export function getCategoryOptions() {
  return Array.from(new Set(letDoveItems.map(getCategoryKeys))).sort();
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
      item.search_index,
      ...item.tags
    ]
      .join(" ")
      .toLowerCase();

    if (!matchedIds.has(item.id) && searchable.includes(normalized)) {
      results.push(item);
    }
  });

  return results;
}
