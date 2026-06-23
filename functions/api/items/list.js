const DATA_KEY = "letdove/data/items.json";

export async function onRequestGet({ request, env }) {
  const environment = getRuntimeEnvironment(request, env);

  try {
    if (environment === "local") {
      return json({ environment, error: "Local API is UI-only and cannot access R2.", items: [], success: false }, 403);
    }

    const bucket = env.LETDOVE_IMAGES;

    if (!bucket) {
      return json({ environment, error: "R2 not bound", items: [], success: false }, 500);
    }

    const object = await bucket.get(DATA_KEY);

    if (!object) {
      return json({
        environment,
        items: [],
        key: DATA_KEY,
        source: "r2",
        success: true
      });
    }

    const text = await object.text();
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : parsed.items;

    if (!Array.isArray(items)) {
      return json({ environment, error: "Invalid R2 items JSON", items: [], success: false }, 500);
    }

    const normalizedItems = items.map(normalizeItemForOutput);

    return json({
      count: normalizedItems.length,
      environment,
      items: normalizedItems,
      key: DATA_KEY,
      source: "r2",
      success: true,
      updatedAt: parsed.updatedAt ?? object.uploaded?.toISOString?.() ?? null
    });
  } catch (error) {
    return json({ environment, error: String(error), items: [], success: false }, 500);
  }
}

function normalizeItemForOutput(item) {
  const images = getItemImages(item)
    .map((image) => normalizeStoredKey(image, item?.letdove_code || item?.id || ""))
    .filter(Boolean);
  const cover = normalizeStoredKey(item?.cover, item?.letdove_code || item?.id || "") || images[0] || "";
  const status = ["draft", "published", "processing", "failed"].includes(item?.status) ? item.status : "draft";
  const letdoveCode = String(item?.letdove_code || item?.id || "").trim();

  return {
    id: String(item?.id || letdoveCode).trim().toLowerCase(),
    letdove_code: letdoveCode,
    title: String(item?.title || ""),
    description: String(item?.description || ""),
    images,
    cover,
    status,
    created_at: String(item?.created_at || ""),
    updated_at: String(item?.updated_at || "")
  };
}

function getItemImages(item) {
  if (Array.isArray(item?.images)) {
    return item.images;
  }

  return item?.cover ? [item.cover] : [];
}

function normalizeStoredKey(value, code = "") {
  if (typeof value !== "string") {
    return "";
  }

  const cleaned = value.trim();

  if (cleaned.startsWith("letdove/")) {
    return cleaned;
  }

  return "";
}

function getRuntimeEnvironment(request, env = {}) {
  if (env.CF_PAGES_ENVIRONMENT === "preview") {
    return "preview";
  }

  if (env.CF_PAGES_ENVIRONMENT === "production") {
    return "production";
  }

  try {
    const host = new URL(request.url).hostname;

    return host === "localhost" || host === "127.0.0.1" || host === "::1" ? "local" : "production";
  } catch {
    return "production";
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    status
  });
}
