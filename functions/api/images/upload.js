export async function onRequestGet() {
  return json({
    success: true,
    message: "Upload API route registered"
  });
}

export async function onRequestPost({ request, env }) {
  try {
    if (!(await isAuthorized(request, env))) {
      return json({ success: false, error: "Unauthorized upload request" }, 401);
    }

    const formData = await request.formData();
    console.log("formData keys:", [...formData.keys()]);
    const file = getUploadFile(formData);
    console.log("file:", file);

    if (!isUploadFile(file)) {
      console.error("Invalid file input", {
        fileType: typeof file,
        constructorName: file?.constructor?.name,
        name: file?.name,
        size: file?.size,
        type: file?.type,
        hasStream: Boolean(file?.stream),
        hasArrayBuffer: Boolean(file?.arrayBuffer),
        entries: getFormDataDebugEntries(formData)
      });
      return json({ success: false, error: "Invalid file input" }, 400);
    }

    if (!env.LETDOVE_IMAGES) {
      console.error("R2 binding missing: LETDOVE_IMAGES");
      return json({ success: false, error: "R2 not bound" }, 500);
    }

    const category = sanitizePathSegment(formData.get("category") || "general");
    const letdoveCode = sanitizePathSegment(formData.get("letdove_code") || "uncategorized");
    const uniqueId = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const extension = getFileExtension(file);
    const key = `letdove/${category}/${letdoveCode}/image_${uniqueId}.${extension}`;
    const body = typeof file.stream === "function" ? file.stream() : await file.arrayBuffer();
    const contentType = typeof file.type === "string" && file.type ? file.type : "application/octet-stream";

    console.log("R2 KEY:", key);

    await env.LETDOVE_IMAGES.put(key, body, {
      httpMetadata: {
        contentType
      }
    });

    const baseUrl = (env.R2_PUBLIC_BASE_URL || "https://letdove.uk").replace(/\/$/, "");
    const publicUrl = `${baseUrl}/${key}`;

    console.log("UPLOAD SUCCESS:", publicUrl);

    return json({
      success: true,
      url: publicUrl,
      key
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return json({ success: false, error: String(err) }, 500);
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

function getUploadFile(formData) {
  return [...formData.getAll("file"), ...formData.getAll("image")].find(isUploadCandidate);
}

function isUploadCandidate(value) {
  return Boolean(value && typeof value === "object" && typeof value !== "string");
}

function sanitizePathSegment(value) {
  const sanitized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return sanitized || "uncategorized";
}

function isUploadFile(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      (typeof value.stream === "function" || typeof value.arrayBuffer === "function")
  );
}

function getFileExtension(file) {
  const nameExtension = typeof file.name === "string" ? file.name.split(".").pop()?.toLowerCase() : "";
  const typeExtension = typeof file.type === "string" ? file.type.split("/").pop()?.toLowerCase() : "";
  const extension = nameExtension || typeExtension || "png";

  return extension.replace(/[^a-z0-9]/g, "") || "png";
}

function getFormDataDebugEntries(formData) {
  return [...formData.entries()].map(([key, value]) => ({
    key,
    valueType: typeof value,
    constructorName: value?.constructor?.name,
    name: value?.name,
    size: value?.size,
    type: value?.type
  }));
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    status
  });
}
