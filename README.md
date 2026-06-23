# letdove knowledge base

A Cloudflare Pages deployable Next.js static site for the LetDove Content System.

## What It Is

letdove knowledge base is a structured content lexicon, not a blog. Each entry is an atomic visual card with:

- `letdove_code`, such as `P01_Q01` or `S01_G02`
- L1/L2 category hierarchy
- series grouping
- tags used for search
- 4:5 rounded visual card preview
- one or more images per card
- structured card blocks instead of long article content
- a static detail URL that can be copied and shared
- light and dark display modes

## Local Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000/letdove`.

Admin editor:

```text
http://localhost:3000/admin
```

The admin editor is protected by a localStorage login gate.

```text
username: admin
password: admin
```

After login, `/admin` renders a three-panel CMS: content list, editor, and live 4:5 card preview. It saves JSON drafts to localStorage, supports JSON import/export, batch image uploads to R2, drag image reorder, image deletion, cover selection, create/update/delete, display ordering, and published/draft status.

Admin upload writes are atomic in the browser CMS layer:

```text
select image file
  -> POST /api/images/upload
  -> receive public R2 URL
  -> append URL to media.gallery
  -> update media.cover
  -> regenerate search_index
  -> persist JSON draft
```

If upload fails, the JSON draft is rolled back and no base64, blob URL, or preview URL is saved.

## Build

```bash
npm run build
```

The static frontend is exported to `out/`. The upload API is a Cloudflare Pages Function in `functions/api/images/upload.js`.

For local admin uploads, run the Cloudflare Pages preview server, not the plain Next.js dev server:

```bash
npm run dev
```

This command builds the static site and starts `wrangler pages dev out`, so `/api/images/upload` is served by Cloudflare Pages Functions with the `LETDOVE_IMAGES` R2 binding. Use `npm run dev:next` only for frontend-only UI work; R2 upload will not work there.

## Cloudflare Deployment

Use Cloudflare Pages for production:

- Build command: `npm run build`
- Output directory: `out`
- Functions directory: `functions`
- R2 binding: `LETDOVE_IMAGES -> letdove-images`
- Wrangler vars: `ADMIN_USER`, `ADMIN_PASS`, `R2_PUBLIC_BASE_URL=https://letdove.uk`
- Optional secret: `ADMIN_SESSION_SECRET`

The upload endpoint is served by Cloudflare Pages Functions at `/api/images/upload`.

The admin login endpoint is served by Cloudflare Pages Functions at `/api/admin/login`. Credentials are read from the Cloudflare runtime `env`, not from the static frontend. Configure non-sensitive vars in `wrangler.toml`:

```text
[vars]
ADMIN_USER = "admin"
ADMIN_PASS = "adminissimon"
R2_PUBLIC_BASE_URL = "https://letdove.uk"
```

Optionally set a separate session signing secret with `wrangler pages secret put ADMIN_SESSION_SECRET`.

Wrangler uses:

```text
pages_build_output_dir = "out"
binding = "LETDOVE_IMAGES"
```

## Cloudflare R2 Images

The admin image uploader first tries:

```text
POST /api/images/upload
```

That endpoint is implemented as a Cloudflare Pages Function:

```text
functions/api/images/upload.js
```

Cloudflare configuration:

- R2 bucket name: `letdove-images`
- R2 binding name: `LETDOVE_IMAGES`
- Environment variable: `R2_PUBLIC_BASE_URL`

`R2_PUBLIC_BASE_URL` should be `https://letdove.uk`. The Pages Function reads R2 through `env.LETDOVE_IMAGES` and uploads with `env.LETDOVE_IMAGES.put()`. The admin uploader refuses to save base64 image data; failed uploads leave the existing media unchanged.

Single-file upload success response:

```json
{
  "success": true,
  "url": "https://letdove.uk/letdove/prompt/p01_q01/image_001.jpg",
  "key": "letdove/prompt/p01_q01/image_001.jpg"
}
```

Multi-file uploads return:

```json
{
  "success": true,
  "images": [
    {
      "url": "https://letdove.uk/letdove/prompt/p01_q01/image_001.jpg",
      "key": "letdove/prompt/p01_q01/image_001.jpg"
    }
  ]
}
```

`wrangler.toml` includes the OpenNext worker entry, static asset binding, R2 binding, and public R2 URL variable.

## Data Source

Initial data lives in:

```text
src/data/letdove.json
```

Required fields for each item:

```json
{
  "id": "ld_001",
  "letdove_code": "P01_Q01",
  "title": "Product Hero Prompt",
  "description": "Short searchable summary",
  "media": {
    "cover": "https://letdove.uk/letdove/prompt/p01_q01/image_001.jpg",
    "gallery": [
      "https://letdove.uk/letdove/prompt/p01_q01/image_001.jpg",
      "https://letdove.uk/letdove/prompt/p01_q01/image_002.jpg"
    ]
  },
  "category_l1": "prompt",
  "category_l2": "product",
  "series": "P01 Product Visuals",
  "tags": ["AI", "Prompt", "Product"],
  "search_index": "AI prompt product visual structured writing",
  "cards": [
    {
      "label": "Intent",
      "body": "Structured card content"
    }
  ],
  "links": [],
  "created_at": "2026-06-22",
  "updated_at": "2026-06-22",
  "status": "published",
  "version": 1
}
```

Future migration path:

```text
Admin UI -> Cloudflare Pages Function -> Cloudflare R2 -> letdove.uk CDN -> JSON -> Frontend lexicon
```
