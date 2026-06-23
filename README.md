# LetDove Library

A Cloudflare Pages deployable Next.js static site for the LetDove Library content system.

## Architecture Lock

The system is split into strict layers:

```text
UI Layer
  -> Adapter Layer
  -> Cloudflare Pages Functions
  -> R2 objects + metadata JSON
```

Hard rules:

- UI renders view models only.
- R2 and metadata store keys only, never public URLs.
- URLs are generated only in `src/lib/letdove-adapter.ts`.
- Production is the only environment allowed to write R2 or metadata.
- Preview can read metadata, but cannot write.
- Local is UI-only and cannot access or write R2.

## Storage

R2 bucket:

```text
letdove-images
```

R2 binding:

```text
LETDOVE_IMAGES
```

Allowed object key format:

```text
letdove/{letdove_code}/{filename}
```

Example:

```text
letdove/a01_q01/01_cover.png
```

Metadata object:

```text
letdove/data/items.json
```

## URL Adapter

Public URLs are generated only by the adapter:

```text
R2_PUBLIC_BASE_URL + "/" + key
```

Production base URL:

```text
https://img.letdove.uk
```

The API returns keys only. It does not return image URLs.

## Admin Flow

```text
Create/edit item
  -> upload image in production
  -> API returns R2 key
  -> admin attaches key to item.images
  -> admin saves metadata JSON
  -> frontend reads same metadata
  -> adapter builds display URLs
```

If metadata saving fails after upload, the admin attempts to roll back the uploaded key through `/api/images/delete`.

## API Contracts

Upload:

```text
POST /api/images/upload
```

Success:

```json
{
  "environment": "production",
  "success": true,
  "key": "letdove/a01_q01/01_cover.png",
  "keys": ["letdove/a01_q01/01_cover.png"],
  "size": 182341
}
```

Save metadata:

```text
POST /api/items/save
```

List metadata:

```text
GET /api/items/list
```

Delete rollback object:

```text
POST /api/images/delete
```

## Data Model

Stored items use keys, not URLs:

```json
{
  "id": "a01_q01",
  "letdove_code": "A01_Q01",
  "title": "",
  "description": "",
  "images": ["letdove/a01_q01/01_cover.png"],
  "cover": "letdove/a01_q01/01_cover.png",
  "status": "draft",
  "created_at": "",
  "updated_at": ""
}
```

Allowed status values:

```text
draft
published
processing
failed
```

## Cloudflare Pages

Build command:

```bash
npm run build
```

Output directory:

```text
out
```

`wrangler.toml` owns the Pages configuration:

```toml
pages_build_output_dir = "out"

[[r2_buckets]]
binding = "LETDOVE_IMAGES"
bucket_name = "letdove-images"

[vars]
ADMIN_USER = "admin"
ADMIN_PASS = "adminissimon"
R2_PUBLIC_BASE_URL = "https://img.letdove.uk"
```

## Local Development

Frontend-only work:

```bash
npm run dev:next
```

Static build:

```bash
npm run build
```

Local and preview environments are intentionally protected from writes. Test production uploads from the deployed production Pages site.

## Verification

```bash
npm run build
npm run verify:items
npm run verify:upload
git diff --check
```
