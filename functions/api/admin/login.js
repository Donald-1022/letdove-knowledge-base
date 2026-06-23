export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    const adminUser = env.ADMIN_USER;
    const adminPass = env.ADMIN_PASS;

    if (!adminUser || !adminPass) {
      return json({ success: false, error: "Admin credentials are not configured." }, 500);
    }

    if (username !== adminUser || password !== adminPass) {
      return json({ success: false, error: "Invalid username or password." }, 401);
    }

    const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
    const payload = `${username}:${expiresAt}`;
    const signature = await sign(payload, getSessionSecret(env));
    const token = btoa(`${payload}:${signature}`);

    return json({ success: true, token });
  } catch (error) {
    return json({ success: false, error: String(error) }, 500);
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

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    status
  });
}
