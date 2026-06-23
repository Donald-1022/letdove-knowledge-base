import type { LetDoveItem } from "@/lib/letdove";

const fallbackPublicBaseUrl = "https://img.letdove.uk";

export type LetDoveViewItem = Omit<LetDoveItem, "cover" | "images"> & {
  cover: string;
  coverKey: string;
  imageKeys: string[];
  images: string[];
};

export function getR2PublicBaseUrl() {
  return (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || fallbackPublicBaseUrl).replace(/\/$/, "");
}

export function normalizeCode(code: string) {
  return String(code || "uncategorized")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "uncategorized";
}

export function normalizeKey(code: string, file: string) {
  const fileName = normalizeFileName(file);

  return `letdove/${normalizeCode(code)}/${fileName}`;
}

export function normalizeStoredKey(value: string, code = "") {
  const trimmed = String(value || "").trim();

  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return "";
  }

  const withoutDomain = trimmed
    .replace(/^https:\/\/img\.letdove\.uk\//i, "")
    .replace(/^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i, "")
    .replace(/^https:\/\/letdove\.uk\//i, "");

  if (withoutDomain.startsWith("letdove/")) {
    return withoutDomain;
  }

  return code ? normalizeKey(code, withoutDomain) : "";
}

export function toUrl(key: string) {
  const normalized = normalizeStoredKey(key);

  return normalized ? `${getR2PublicBaseUrl()}/${encodeR2Key(normalized)}` : "";
}

export function adaptItem(item: LetDoveItem): LetDoveViewItem {
  const imageKeys = item.images.map((image) => normalizeStoredKey(image, item.letdove_code)).filter(Boolean);
  const coverKey = normalizeStoredKey(item.cover, item.letdove_code) || imageKeys[0] || "";

  return {
    ...item,
    cover: toUrl(coverKey),
    coverKey,
    imageKeys,
    images: imageKeys.map(toUrl).filter(Boolean)
  };
}

export function adaptItems(items: LetDoveItem[]) {
  return items.map(adaptItem);
}

export function getItemImageUrls(item: LetDoveItem | LetDoveViewItem) {
  if ("imageKeys" in item) {
    return item.images.length ? item.images : item.cover ? [item.cover] : [];
  }

  const adapted = adaptItem(item);

  return adapted.images.length ? adapted.images : adapted.cover ? [adapted.cover] : [];
}

function normalizeFileName(file: string) {
  const cleaned = String(file || "image.png")
    .replace(/[\\/\u0000-\u001f\u007f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "image.png";
}

function encodeR2Key(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}
