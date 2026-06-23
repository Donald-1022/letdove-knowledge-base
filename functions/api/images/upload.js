export async function onRequestGet({ request }) {
  return json({
    environment: getRuntimeEnvironment(request),
    success: true,
    urls: []
  });
}

export async function onRequestPost({ request, env }) {
  const environment = getRuntimeEnvironment(request);

  try {
    if (!(await isAuthorized(request, env))) {
      return json({ environment, success: false, urls: [], error: "Unauthorized upload request" }, 401);
    }

    const upload = await readUploadInput(request);

    if (!upload) {
      console.error("Invalid file input", {
        contentType: request.headers.get("content-type"),
        fileName: request.headers.get("x-letdove-file-name")
      });
      return json({ environment, success: false, urls: [], error: "Invalid file input" }, 400);
    }

    const bucket = env.R2_BUCKET || env.LETDOVE_IMAGES;

    if (!bucket) {
      console.error("R2 binding missing", {
        hasLETDOVE_IMAGES: Boolean(env.LETDOVE_IMAGES),
        hasR2_BUCKET: Boolean(env.R2_BUCKET)
      });
      return json({ environment, success: false, urls: [], error: "R2 not bound" }, 500);
    }

    const category = sanitizePathSegment(upload.category || "general");
    const letdoveCode = sanitizePathSegment(upload.letdoveCode || "uncategorized");
    const key = `letdove/${category}/${letdoveCode}/${getSafeFileName(upload.name)}`;

    const baseUrl = (env.R2_PUBLIC_BASE_URL || "https://img.letdove.uk").replace(/\/$/, "");
    const publicUrl = `${baseUrl}/${encodeR2Key(key)}`;

    console.log("UPLOAD KEY:", key);
    console.log("BUCKET:", bucket);
    console.log("FINAL URL:", publicUrl);
    console.log("R2 WRITE START", key);

    try {
      await bucket.put(key, upload.body, {
        httpMetadata: {
          contentType: upload.contentType
        }
      });
    } catch (error) {
      console.error("R2 WRITE FAILED", key, error);
      return json({ environment, success: false, urls: [], error: `R2 write failed: ${String(error)}` }, 500);
    }

    console.log("R2 WRITE SUCCESS", key);

    let writtenSize = upload.size ?? 0;

    if (typeof bucket.head === "function") {
      const writtenObject = await bucket.head(key);

      if (!writtenObject) {
        console.error("R2 HEAD FAILED", key);
        return json({ environment, success: false, urls: [], error: `R2 write did not produce an object for key: ${key}` }, 500);
      }

      writtenSize = writtenObject.size ?? writtenSize;
      console.log("R2 HEAD SUCCESS", key, writtenObject.size ?? "unknown-size");
    }

    return json({
      environment,
      key,
      size: writtenSize,
      success: true,
      url: publicUrl,
      urls: [publicUrl]
    });
  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    return json({ environment, success: false, urls: [], error: String(err) }, 500);
  }
}

async function readUploadInput(request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    console.log("formData keys:", [...formData.keys()]);
    const file = getUploadFile(formData);
    console.log("file:", file);

    if (!isUploadFile(file)) {
      console.error("Invalid multipart file input", {
        entries: getFormDataDebugEntries(formData)
      });
      return null;
    }

    return {
      body: typeof file.stream === "function" ? file.stream() : await file.arrayBuffer(),
      category: String(formData.get("category") || ""),
      contentType: typeof file.type === "string" && file.type ? file.type : "application/octet-stream",
      letdoveCode: String(formData.get("letdove_code") || ""),
      name: typeof file.name === "string" ? file.name : "image",
      size: typeof file.size === "number" ? file.size : 0
    };
  }

  const fileName = request.headers.get("x-letdove-file-name") || "image";
  const body = request.body ?? await request.arrayBuffer();

  if (!body) {
    return null;
  }

  return {
    body,
    category: request.headers.get("x-letdove-category") || "",
    contentType: contentType || "application/octet-stream",
    letdoveCode: request.headers.get("x-letdove-code") || "",
    name: fileName,
    size: Number(request.headers.get("content-length") || 0)
  };
}

function getRuntimeEnvironment(request) {
  try {
    const host = new URL(request.url).hostname;

    return host === "localhost" || host === "127.0.0.1" || host === "::1" ? "local" : "production";
  } catch {
    return "production";
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
  const typeExtension = typeof file.contentType === "string" ? file.contentType.split("/").pop()?.toLowerCase() : "";
  const extension = nameExtension || typeExtension || "png";

  return extension.replace(/[^a-z0-9]/g, "") || "png";
}

function getSafeFileName(name) {
  const decoded = safeDecodeURIComponent(name || "image");
  const cleaned = decoded
    .replace(/[\\/\u0000-\u001f\u007f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = `image_${Date.now()}.png`;

  return cleaned && cleaned.includes(".") ? cleaned : fallback;
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeR2Key(key) {
  return key.split("/").map((segment) => encodeURIComponent(segment)).join("/");
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
