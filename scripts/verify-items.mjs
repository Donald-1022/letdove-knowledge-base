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
    category_l1: "prompt",
    category_l2: "product",
    created_at: "2026-06-22",
    description: "Unified data test",
    id: "ld_test",
    letdove_code: "T01_Q01",
    media: {
      cover: "https://img.letdove.uk/letdove/prompt/t01_q01/cover.png",
      gallery: ["https://img.letdove.uk/letdove/prompt/t01_q01/cover.png"]
    },
    search_index: "",
    series: "Test Series",
    status: "published",
    tags: ["AI", "Sync"],
    title: "Unified Metadata",
    visible: true
  }
];

const emptyList = await onRequestGet({
  env,
  request: new Request("http://localhost/api/items/list")
});
const emptyPayload = await emptyList.json();
assert.equal(emptyList.status, 200);
assert.equal(emptyPayload.success, true);
assert.equal(emptyPayload.environment, "local");
assert.deepEqual(emptyPayload.items, []);

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
assert.equal(listPayload.items[0].search_index.includes("Unified Metadata"), true);

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
