export async function onRequestPost({ request, env }) {
  const environment = getRuntimeEnvironment(request, env);

  try {
    if (!(await isAuthorized(request, env))) {
      return json({ environment, error: "Unauthorized delete request", success: false }, 401);
    }

    if (environment !== "production") {
      return json({ environment, error: "R2 deletes are only allowed in production.", success: false }, 403);
    }

    const bucket = env.LETDOVE_IMAGES;

    if (!bucket || typeof bucket.delete !== "function") {
      return json({ environment, error: "R2 not bound", success: false }, 500);
    }

    const body = await request.json().catch(() => null);
    const key = String(body?.key || "");

    if (!/^letdove\/[a-z0-9_-]+\/[^/]+$/i.test(key)) {
      return json({ environment, error: "Invalid R2 key", success: false }, 400);
    }

    await bucket.delete(key);

    return json({ environment, key, success: true });
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
    const expected = await sign(payload, env.ADMIN_SESSION_SECRET || env.ADMIN_PASS || "letdove-local-admin");

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
