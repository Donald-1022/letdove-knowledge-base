import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../functions/api/images/upload.js";

const puts = [];
const env = {
  R2_PUBLIC_BASE_URL: "https://img.letdove.uk",
  LETDOVE_IMAGES: {
    async put(key, body, options) {
      puts.push({
        key,
        contentType: options?.httpMetadata?.contentType,
        size: body.byteLength
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
assert.match(single.payload.key, /^letdove\/prompt\/p01_q01\/image_\d+\.png$/);
assert.equal(single.payload.url, `https://img.letdove.uk/${single.payload.key}`);

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
assert.match(multi.payload.key, /^letdove\/design_system\/s01_g02\/image_\d+\.png$/);
assert.equal(multi.payload.url, `https://img.letdove.uk/${multi.payload.key}`);
assert.equal(puts.length, 2);
assert.deepEqual(
  puts.map((put) => put.contentType),
  ["image/jpeg", "image/png"]
);

console.log("Cloudflare Pages upload function verified: R2 put called and public URL returned.");
