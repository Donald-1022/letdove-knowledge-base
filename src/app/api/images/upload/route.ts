type R2BucketBinding = {
  put: (
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    }
  ) => Promise<unknown>;
};

type UploadEnv = {
  LETDOVE_IMAGES?: R2BucketBinding;
  R2_PUBLIC_BASE_URL?: string;
};

export async function GET() {
  return Response.json({
    success: true,
    message: "Upload API route registered"
  });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    console.log("formData keys:", [...formData.keys()]);
    const file = formData.get("file");
    console.log("file:", file);

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "Invalid file input" }, { status: 400 });
    }

    const env = getUploadEnv();

    if (!env.LETDOVE_IMAGES) {
      return Response.json({ error: "R2 not bound" }, { status: 500 });
    }

    const category = sanitizePathSegment(formData.get("category") || "general");
    const letdoveCode = sanitizePathSegment(formData.get("letdove_code") || "uncategorized");
    const fileBuffer = await file.arrayBuffer();
    const key = `letdove/${category}/${letdoveCode}/image_${Date.now()}.png`;

    console.log("R2 KEY:", key);

    await env.LETDOVE_IMAGES.put(key, fileBuffer, {
      httpMetadata: {
        contentType: file.type
      }
    });

    const R2_PUBLIC_BASE_URL = (env.R2_PUBLIC_BASE_URL || "https://img.letdove.uk").replace(/\/$/, "");
    const publicUrl = `${R2_PUBLIC_BASE_URL}/${key}`;

    console.log("UPLOAD SUCCESS:", publicUrl);

    return Response.json({
      success: true,
      url: publicUrl,
      key
    });
  } catch (err) {
    return Response.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

function getUploadEnv() {
  const globalValue = globalThis as typeof globalThis & {
    env?: UploadEnv;
    LETDOVE_IMAGES?: R2BucketBinding;
  };

  return {
    R2_PUBLIC_BASE_URL: process.env.R2_PUBLIC_BASE_URL || globalValue.env?.R2_PUBLIC_BASE_URL,
    LETDOVE_IMAGES: globalValue.env?.LETDOVE_IMAGES || globalValue.LETDOVE_IMAGES
  };
}

function sanitizePathSegment(value: FormDataEntryValue | string) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
