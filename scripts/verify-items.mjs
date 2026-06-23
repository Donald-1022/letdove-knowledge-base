import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/items/list.js";
import { onRequestPost } from "../functions/api/items/save.js";

const objects = new Map();
const env = {
  ADMIN_PASS: "adminissimon",
  ADMIN_USER: "admin",
  LETDOVE_IMAGES: {
    async get(key) {
      const value = objects.get(key);

      return value ? { text: async () => value.body, uploaded: new Date(value.updatedAt) } : null;
    },
    async head(key) {
      const value = objects.get(key);

      return value ? { size: value.body.length } : null;
    },
    async put(key, body, options) {
      objects.set(key, {
        body: String(body),
        contentType: options?.httpMetadata?.contentType,
        updatedAt: new Date().toISOString()
      });
    }
  }
};

const token = await createToken("admin", Date.now() + 60_000, env.ADMIN_PASS);
const items = [
  {
    created_at: "2026-06-22",
    description: "Unified data test",
    id: "ld_test",
    letdove_code: "T01_Q01",
    cover: "letdove/t01_q01/cover.png",
    images: ["letdove/t01_q01/cover.png"],
    status: "published",
    title: "Unified Metadata",
    updated_at: "2026-06-22T00:00:00.000Z"
  }
];

const emptyList = await onRequestGet({
  env,
  request: new Request("http://localhost/api/items/list")
});
const emptyPayload = await emptyList.json();
assert.equal(emptyList.status, 403);
assert.equal(emptyPayload.success, false);
assert.equal(emptyPayload.environment, "local");
assert.deepEqual(emptyPayload.items, []);

const previewSave = await onRequestPost({
  env: { ...env, CF_PAGES_ENVIRONMENT: "preview" },
  request: new Request("https://preview.letdove.pages.dev/api/items/save", {
    body: JSON.stringify({ items }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    method: "POST"
  })
});
const previewSavePayload = await previewSave.json();
assert.equal(previewSave.status, 403);
assert.equal(previewSavePayload.success, false);
assert.equal(previewSavePayload.environment, "preview");

const unauthorized = await onRequestPost({
  env,
  request: new Request("https://letdove.uk/api/items/save", {
    body: JSON.stringify({ items }),
    headers: { "content-type": "application/json" },
    method: "POST"
  })
});
assert.equal(unauthorized.status, 401);

const save = await onRequestPost({
  env,
  request: new Request("https://letdove.uk/api/items/save", {
    body: JSON.stringify({ items }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    method: "POST"
  })
});
const savePayload = await save.json();
assert.equal(save.status, 200);
assert.equal(savePayload.success, true);
assert.equal(savePayload.count, 1);
assert.equal(savePayload.key, "letdove/data/items.json");

const list = await onRequestGet({
  env,
  request: new Request("https://letdove.uk/api/items/list")
});
const listPayload = await list.json();
assert.equal(list.status, 200);
assert.equal(listPayload.success, true);
assert.equal(listPayload.environment, "production");
assert.equal(listPayload.items.length, 1);
assert.equal(listPayload.items[0].letdove_code, "T01_Q01");
assert.deepEqual(listPayload.items[0].images, ["letdove/t01_q01/cover.png"]);
assert.equal(listPayload.items[0].cover, "letdove/t01_q01/cover.png");
assert.deepEqual(Object.keys(listPayload.items[0]).sort(), [
  "cover",
  "created_at",
  "description",
  "id",
  "images",
  "letdove_code",
  "status",
  "title",
  "updated_at"
]);

console.log("R2 metadata list/save functions verified.");

async function createToken(username, expiresAt, secret) {
  const payload = `${username}:${expiresAt}`;
  const signature = await sign(payload, secret);

  return btoa(`${payload}:${signature}`);
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
