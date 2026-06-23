const DATA_KEY = "letdove/data/items.json";

export async function onRequestPost({ request, env }) {
  const environment = getRuntimeEnvironment(request);

  try {
    if (!(await isAuthorized(request, env))) {
      return json({ environment, error: "Unauthorized save request", success: false }, 401);
    }

    const bucket = env.R2_BUCKET || env.LETDOVE_IMAGES;

    if (!bucket) {
      return json({ environment, error: "R2 not bound", success: false }, 500);
    }

    const body = await request.json();
    const incomingItems = Array.isArray(body) ? body : body.items;

    if (!Array.isArray(incomingItems)) {
      return json({ environment, error: "Invalid items payload", success: false }, 400);
    }

    const items = incomingItems.map(normalizeItemForStorage);
    const updatedAt = new Date().toISOString();
    const payload = JSON.stringify({ items, updatedAt }, null, 2);

    await bucket.put(DATA_KEY, payload, {
      httpMetadata: {
        contentType: "application/json; charset=utf-8"
      }
    });

    if (typeof bucket.head === "function") {
      const writtenObject = await bucket.head(DATA_KEY);

      if (!writtenObject) {
        return json({ environment, error: `R2 write did not produce an object for key: ${DATA_KEY}`, success: false }, 500);
      }
    }

    return json({
      count: items.length,
      environment,
      key: DATA_KEY,
      success: true,
      updatedAt
    });
  } catch (error) {
    return json({ environment, error: String(error), success: false }, 500);
  }
}

async function isAuthorized(request, env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASS) {
    return true;
  }

  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return false;
  }

  try {
    const decoded = atob(token);
    const parts = decoded.split(":");
    const signature = parts.pop();
    const expiresAt = Number(parts.pop());
    const username = parts.join(":");
    const payload = `${username}:${expiresAt}`;
    const expected = await sign(payload, getSessionSecret(env));

    return username === env.ADMIN_USER && expiresAt > Date.now() && signature === expected;
  } catch {
    return false;
  }
}

async function sign(payload, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getSessionSecret(env) {
  return env.ADMIN_SESSION_SECRET || env.ADMIN_PASS || "letdove-local-admin";
}

function getRuntimeEnvironment(request) {
  try {
    const host = new URL(request.url).hostname;

    return host === "localhost" || host === "127.0.0.1" || host === "::1" ? "local" : "production";
  } catch {
    return "production";
  }
}

function normalizeItemForStorage(item) {
  const gallery = Array.isArray(item?.media?.gallery)
    ? item.media.gallery.filter(isPersistableImageUrl)
    : [];
  const cover = isPersistableImageUrl(item?.media?.cover) ? item.media.cover : gallery[0] ?? "";

  return {
    ...item,
    media: {
      cover,
      gallery
    },
    search_index: buildSearchIndex(item),
    updated_at: new Date().toISOString()
  };
}

function buildSearchIndex(item) {
  return [
    item?.title,
    item?.description,
    ...(Array.isArray(item?.tags) ? item.tags : []),
    item?.category_l1,
    item?.category_l2,
    item?.letdove_code,
    item?.series
  ]
    .filter(Boolean)
    .join(" ");
}

function isPersistableImageUrl(value) {
  return typeof value === "string" && /^https?:\/\/.+/i.test(value) && !value.startsWith("data:") && !value.startsWith("blob:");
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    status
  });
}
