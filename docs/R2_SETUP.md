# Cloudflare R2 Setup — Cover Image Storage

Cover images are downloaded from OpenLibrary at import time and stored permanently
in a Cloudflare R2 bucket. Once stored, images are served from your own R2 bucket
instead of the external CDN.

---

## Step 1 — Create the bucket

1. In the Cloudflare dashboard, click **R2** in the left sidebar
2. Click **Create bucket**
3. Name it `sf-fantasy-shelf-covers` (or any name — you'll use it as `R2_BUCKET_NAME`)
4. Leave location as automatic
5. Click **Create bucket**

---

## Step 2 — Enable public access

Covers must be publicly readable so the browser can load them without authentication.

1. Open the bucket you just created
2. Click the **Settings** tab
3. Under **Public access**, click **Allow Access**
4. Confirm — Cloudflare shows a public URL like `https://pub-xxxxxxxxxxxxxxxx.r2.dev`
5. **Copy that URL** — this is your `R2_PUBLIC_URL`

---

## Step 3 — Create an API token

1. Back on the R2 overview page, click **Manage R2 API Tokens** (top right)
2. Click **Create API Token**
3. Name it `sf-fantasy-shelf`
4. Permissions: **Object Read & Write**
5. Bucket: select your specific bucket (not "All buckets")
6. Click **Create API Token**
7. Copy both values — **you only see them once**:
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`

---

## Step 4 — Find your Account ID

Look at the URL in your Cloudflare dashboard:
`https://dash.cloudflare.com/{account-id}/r2/...`

Or find it in the right sidebar of the R2 overview page under **Account ID**.

That value is your `R2_ACCOUNT_ID`.

---

## Step 5 — Add env vars to Railway backend service

Railway → backend service → **Variables** tab → add all five:

| Variable | Value |
|---|---|
| `R2_ACCOUNT_ID` | your Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | from Step 3 |
| `R2_SECRET_ACCESS_KEY` | from Step 3 |
| `R2_BUCKET_NAME` | `sf-fantasy-shelf-covers` |
| `R2_PUBLIC_URL` | `https://pub-xxxxxxxxxxxxxxxx.r2.dev` from Step 2 |

Railway redeploys the backend automatically after saving variables.

---

## How it works

- **At import time** — after a book is added, a background job fetches the cover
  from OpenLibrary and uploads it to R2, then updates `books.cover_url` in the DB
- **All subsequent loads** — the image is served from your R2 bucket, not OpenLibrary
- **If R2 vars are missing** — the job skips silently; the OpenLibrary URL is kept

## Backfilling existing books

Books added before R2 was configured still point to OpenLibrary URLs. To backfill,
ask Claude to add a one-time `/api/admin/backfill-covers` endpoint that loops through
all books with non-R2 `cover_url` values and runs the download-and-store job for each.
