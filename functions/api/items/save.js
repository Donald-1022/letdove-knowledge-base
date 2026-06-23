const DATA_KEY = "letdove/data/items.json";

export async function onRequestPost({ request, env }) {
  const environment = getRuntimeEnvironment(request, env);

  try {
    if (!(await isAuthorized(request, env))) {
      return json({ environment, error: "Unauthorized save request", success: false }, 401);
    }

    if (environment !== "production") {
      return json({ environment, error: "Metadata writes are only allowed in production.", success: false }, 403);
    }

    const bucket = env.LETDOVE_IMAGES;

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

function normalizeItemForStorage(item) {
  const images = getItemImages(item)
    .map((image) => normalizeStoredKey(image, item?.letdove_code || item?.id || ""))
    .filter(isPersistableImageKey);
  const normalizedCover = normalizeStoredKey(item?.cover, item?.letdove_code || item?.id || "");
  const cover = isPersistableImageKey(normalizedCover) ? normalizedCover : images[0] ?? "";
  const status = ["draft", "published", "processing", "failed"].includes(item?.status) ? item.status : "draft";
  const letdoveCode = String(item?.letdove_code || item?.id || `LD_${Date.now()}`).trim();
  const id = String(item?.id || letdoveCode).trim().toLowerCase();

  return {
    id,
    letdove_code: letdoveCode,
    title: String(item?.title || ""),
    description: String(item?.description || ""),
    images,
    cover,
    status,
    created_at: String(item?.created_at || new Date().toISOString().slice(0, 10)),
    updated_at: new Date().toISOString()
  };
}

function getItemImages(item) {
  if (Array.isArray(item?.images)) {
    return item.images;
  }

  return item?.cover ? [item.cover] : [];
}

function isPersistableImageKey(value) {
  return typeof value === "string" && /^letdove\/[a-z0-9_-]+\/[^/]+$/i.test(value);
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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    status
  });
}
