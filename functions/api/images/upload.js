export async function onRequestGet() {
  return json({
    success: true,
    message: "Upload API route registered"
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const formData = await request.formData();
    console.log("formData keys:", [...formData.keys()]);
    const file = formData.get("file");
    console.log("file:", file);

    if (!isUploadFile(file)) {
      console.error("Invalid file input", {
        fileType: typeof file,
        constructorName: file?.constructor?.name,
        hasStream: Boolean(file?.stream),
        hasArrayBuffer: Boolean(file?.arrayBuffer)
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
    const key = `letdove/${category}/${letdoveCode}/image_${uniqueId}.png`;

    console.log("R2 KEY:", key);

    await env.LETDOVE_IMAGES.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type
      }
    });

    const baseUrl = (env.R2_PUBLIC_BASE_URL || "https://img.letdove.uk").replace(/\/$/, "");
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

function sanitizePathSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isUploadFile(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.stream === "function" &&
      typeof value.arrayBuffer === "function" &&
      typeof value.type === "string"
  );
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    status
  });
}
