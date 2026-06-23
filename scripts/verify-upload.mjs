import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../functions/api/images/upload.js";

const puts = [];
const env = {
  R2_PUBLIC_BASE_URL: "https://letdove.uk",
  LETDOVE_IMAGES: {
    async put(key, body, options) {
      puts.push({
        key,
        contentType: options?.httpMetadata?.contentType,
        hasBody: Boolean(body)
      });
    }
  }
};

async function postUpload({ files, category, letdoveCode, startIndex }) {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append(
      "file",
      new File([file.bytes ?? "image"], file.name, { type: file.type })
    );
  });

  formData.set("category", category);
  formData.set("letdove_code", letdoveCode);
  formData.set("start_index", String(startIndex));

  const request = new Request("https://library.letdove.uk/api/images/upload", {
    body: formData,
    method: "POST"
  });
  const response = await onRequestPost({ request, env });

  return {
    payload: await response.json(),
    status: response.status
  };
}

const single = await postUpload({
  category: "prompt",
  files: [{ name: "hero.jpg", type: "image/jpeg" }],
  letdoveCode: "P01_Q01",
  startIndex: 3
});

assert.equal(single.status, 200);
assert.equal(single.payload.success, true);
assert.match(single.payload.key, /^letdove\/prompt\/p01_q01\/image_\d+_[a-f0-9-]+\.jpg$/);
assert.equal(single.payload.url, `https://letdove.uk/${single.payload.key}`);

const getResponse = await onRequestGet();
const getPayload = await getResponse.json();
assert.equal(getResponse.status, 200);
assert.equal(getPayload.success, true);
assert.equal(getPayload.message, "Upload API route registered");

const multi = await postUpload({
  category: "design system",
  files: [
    { name: "first.png", type: "image/png" },
    { name: "second.webp", type: "image/webp" }
  ],
  letdoveCode: "S01_G02",
  startIndex: 1
});

assert.equal(multi.status, 200);
assert.equal(multi.payload.success, true);
assert.match(multi.payload.key, /^letdove\/design_system\/s01_g02\/image_\d+_[a-f0-9-]+\.png$/);
assert.equal(multi.payload.url, `https://letdove.uk/${multi.payload.key}`);
assert.equal(puts.length, 2);
assert.deepEqual(
  puts.map((put) => put.contentType),
  ["image/jpeg", "image/png"]
);

for (let index = 0; index < 20; index += 1) {
  const response = await postUpload({
    category: "stress",
    files: [{ name: `image-${index}.png`, type: "image/png" }],
    letdoveCode: "P01_Q01",
    startIndex: index + 1
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.success, true);
  assert.ok(response.payload.url.startsWith("https://letdove.uk/"));
}

assert.equal(puts.length, 22);
assert.equal(new Set(puts.map((put) => put.key)).size, puts.length);

const invalidFormData = new FormData();
invalidFormData.set("file", "not-a-file");
const invalidResponse = await onRequestPost({
  env,
  request: new Request("https://library.letdove.uk/api/images/upload", {
    body: invalidFormData,
    method: "POST"
  })
});
const invalidPayload = await invalidResponse.json();

assert.equal(invalidResponse.status, 400);
assert.equal(invalidPayload.success, false);
assert.equal(invalidPayload.error, "Invalid file input");

console.log("Cloudflare Pages upload function verified: 20 consecutive uploads returned public R2 URLs.");
