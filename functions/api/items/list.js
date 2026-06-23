const DATA_KEY = "letdove/data/items.json";

export async function onRequestGet({ request, env }) {
  const environment = getRuntimeEnvironment(request);

  try {
    const bucket = env.R2_BUCKET || env.LETDOVE_IMAGES;

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
  const gallery = Array.isArray(item?.media?.gallery)
    ? item.media.gallery.map(normalizeImageUrl).filter(Boolean)
    : [];
  const cover = normalizeImageUrl(item?.media?.cover) || gallery[0] || "";

  return {
    ...item,
    media: {
      cover,
      gallery
    }
  };
}

function normalizeImageUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/^https:\/\/pub-[a-z0-9]+\.r2\.dev\//i, "https://img.letdove.uk/")
    .replace(/^https:\/\/letdove\.uk\/letdove\//i, "https://img.letdove.uk/letdove/");
}

function getRuntimeEnvironment(request) {
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
