import assert from "node:assert/strict";
import { onRequestGet, onRequestPost } from "../functions/api/images/upload.js";

const puts = [];
const env = {
  LETDOVE_IMAGES: {
    async delete(key) {
      const index = puts.findIndex((entry) => entry.key === key);

      if (index >= 0) {
        puts.splice(index, 1);
      }
    },
    async head(key) {
      const put = puts.find((entry) => entry.key === key);

      return put ? { size: put.size } : null;
    },
    async put(key, body, options) {
      puts.push({
        key,
        contentType: options?.httpMetadata?.contentType,
        hasBody: Boolean(body),
        size: 5
      });
    }
  }
};

async function postUpload({ files, letdoveCode, startIndex }) {
  const formData = new FormData();

  files.forEach((file) => {
    formData.append(
      "file",
      new File([file.bytes ?? "image"], file.name, { type: file.type })
    );
  });

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
  files: [{ name: "hero.jpg", type: "image/jpeg" }],
  letdoveCode: "P01_Q01",
  startIndex: 3
});

assert.equal(single.status, 200);
assert.equal(single.payload.success, true);
assert.equal(single.payload.environment, "production");
assert.equal(single.payload.key, "letdove/p01_q01/hero.jpg");
assert.deepEqual(single.payload.keys, ["letdove/p01_q01/hero.jpg"]);
assert.equal(single.payload.size, 5);
assert.equal("url" in single.payload, false);
assert.equal("urls" in single.payload, false);

const getResponse = await onRequestGet({
  request: new Request("http://localhost/api/images/upload")
});
const getPayload = await getResponse.json();
assert.equal(getResponse.status, 200);
assert.equal(getPayload.success, true);
assert.equal(getPayload.environment, "local");

const localWrite = await onRequestPost({
  env,
  request: new Request("http://localhost/api/images/upload", {
    body: new FormData(),
    method: "POST"
  })
});
const localWritePayload = await localWrite.json();
assert.equal(localWrite.status, 403);
assert.equal(localWritePayload.success, false);
assert.equal(localWritePayload.environment, "local");

const multi = await postUpload({
  files: [
    { name: "first.png", type: "image/png" },
    { name: "second.webp", type: "image/webp" }
  ],
  letdoveCode: "S01_G02",
  startIndex: 1
});

assert.equal(multi.status, 200);
assert.equal(multi.payload.success, true);
assert.equal(multi.payload.key, "letdove/s01_g02/first.png");
assert.equal(puts.length, 2);
assert.deepEqual(
  puts.map((put) => put.contentType),
  ["image/jpeg", "image/png"]
);

for (let index = 0; index < 20; index += 1) {
  const response = await postUpload({
    files: [{ name: `image-${index}.png`, type: "image/png" }],
    letdoveCode: "P01_Q01",
    startIndex: index + 1
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.success, true);
  assert.equal(response.payload.key, `letdove/p01_q01/image-${index}.png`);
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

console.log("Cloudflare Pages upload function verified: 20 consecutive uploads returned R2 keys only.");
