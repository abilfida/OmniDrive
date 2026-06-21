# Spec: S3 Object Storage Compatibility Layer for Omnidrive

This document outlines the design and architecture for adding S3 Object Storage API compatibility to Omnidrive. This allows standard S3 clients (like AWS CLI, rclone, and Cyberduck) to interact with connected Google Drive accounts via virtual workspaces.

## 1. Overview & Goals

Omnidrive operates as a unified Google Drive storage gateway. By exposing an S3-compatible API, users can use standard object storage tools to read and write files.

### Key Goals:
- Map Omnidrive Workspaces to S3 Buckets.
- Implement AWS Signature Version 4 authentication.
- Support S3 Multipart Upload using Google Drive buffering (to prevent high memory usage and satisfy out-of-order chunk uploads).
- Resolve flat S3 keys to relator-based database hierarchies (`workspace_folders` and `files` tables).

---

## 2. Data Model & Credential Management

Each user can generate custom S3 Credentials. The secret access key is stored securely using AES-256-GCM encryption.

### Schema Updates (`packages/worker/src/db/schema.sql`)

```sql
-- Track user generated S3 Credentials
CREATE TABLE IF NOT EXISTS s3_credentials (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_key_id     TEXT UNIQUE NOT NULL,
    secret_key_enc    TEXT NOT NULL, -- Encrypted Secret Access Key (AES-256-GCM)
    description       TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_s3_credentials_access_key ON s3_credentials(access_key_id);

-- Track active S3 multipart uploads
CREATE TABLE IF NOT EXISTS s3_multipart_uploads (
    upload_id          TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    key                TEXT NOT NULL,
    drive_account_id   TEXT NOT NULL REFERENCES drive_accounts(id) ON DELETE CASCADE,
    temp_folder_id     TEXT NOT NULL, -- Google Drive Folder ID containing temp parts
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Track uploaded parts for active multipart uploads
CREATE TABLE IF NOT EXISTS s3_multipart_parts (
    upload_id          TEXT NOT NULL REFERENCES s3_multipart_uploads(upload_id) ON DELETE CASCADE,
    part_number        INTEGER NOT NULL,
    google_file_id     TEXT NOT NULL, -- File ID of the temp part in Google Drive
    etag               TEXT NOT NULL, -- MD5 hash of part content
    size               INTEGER NOT NULL,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (upload_id, part_number)
);
```

### Credentials API Management
- `POST /api/s3-credentials` - Create new access and secret key pair. Displays secret key once.
- `GET /api/s3-credentials` - List active S3 keys (secret key hidden).
- `DELETE /api/s3-credentials/:id` - Revoke S3 key.

---

## 3. S3 Routing & AWS Signature V4 Authentication

The S3 API is exposed under `/s3/*` using Path-style addressing:
`http://<domain>/s3/<bucket-name>/<object-key>`

### S3 Routes (`packages/worker/src/routes/s3.ts`)
- `GET /` - List Buckets (returns workspaces).
- `GET /:bucket` - List Objects (ListObjectsV2).
- `GET /:bucket/:key` - Get Object (downloads file).
- `PUT /:bucket/:key` - Put Object / Upload Part.
- `DELETE /:bucket/:key` - Delete Object.
- `HEAD /:bucket/:key` - Head Object (metadata).
- `POST /:bucket/:key` - Initiate/Complete Multipart Upload.

### AWS Signature V4 Verification
AWS Signature Version 4 verification is performed inside an `s3AuthMiddleware` function:
1. Extract `accessKeyId` from `Authorization` header or query string.
2. Fetch credential row from `s3_credentials` table in D1.
3. Decrypt the secret key using the workspace's encryption key (`TOKEN_ENCRYPTION_KEY`).
4. Recalculate HMAC-SHA256 signature using the Web Crypto API:
   - Construct Canonical Request (method, path, query, headers, body digest).
   - Generate string to sign and signing key.
   - Compute signature and compare with client's.
5. If signature matches, set `c.set('userId', credential.user_id)` and proceed. Otherwise, return XML S3 `SignatureDoesNotMatch` error.

---

## 4. S3 Multipart Upload Flow

Google Drive resumable upload sessions require sequential chunk uploads. S3 allows arbitrary out-of-order and parallel uploads. To solve this, we buffer parts in a temporary Google Drive folder:

1. **Initiate Multipart Upload** (`POST /:bucket/:key?uploads`):
   - Locate workspace (bucket) and check user permissions.
   - Pre-select target Drive Account using `UploadRouter` (based on free quota space).
   - Create a temporary folder inside that Google Drive (`omnidrive_multipart_<uploadId>`).
   - Create a state row in `s3_multipart_uploads`.
   - Return XML with `UploadId`.

2. **Upload Part** (`PUT /:bucket/:key?uploadId=...&partNumber=...`):
   - Verify upload session belongs to the user.
   - Hash stream data on-the-fly using `crypto.subtle` (MD5 digest).
   - Upload the part data directly to Google Drive as a file named `part_<partNumber>` under the `temp_folder_id`.
   - Save the returned Google Drive file ID and MD5 ETag in `s3_multipart_parts` table.
   - Return HTTP 200 with `ETag` header.

3. **Complete Multipart Upload** (`POST /:bucket/:key?uploadId=...`):
   - Retrieve all parts from `s3_multipart_parts` ordered by `part_number` ascending.
   - Verify ETags and completeness.
   - Resolve destination folder in D1 workspace structure.
   - Initiate a new Resumable Upload session for the final file in Google Drive.
   - Stream-concatenate the parts sequentially: download each temporary part file from Google Drive and write its bytes directly to the resumable upload stream.
   - Once completed, register the file in D1 `files` table.
   - Clean up: delete the temporary folder and its files in Google Drive, and remove DB rows.
   - Return XML `CompleteMultipartUploadResult`.

---

## 5. Object Listing & Directory Resolution

Since S3 uses a flat hierarchy and Omnidrive uses relational virtual folders, path translation is required.

### Recursive Key Generation (SQLite CTE)
We use a recursive CTE to construct S3 keys in a single query:

```sql
WITH RECURSIVE folder_path(id, path) AS (
    SELECT id, name || '/' FROM workspace_folders WHERE parent_id IS NULL AND workspace_id = ?
    UNION ALL
    SELECT f.id, fp.path || f.name || '/'
    FROM workspace_folders f
    JOIN folder_path fp ON f.parent_id = fp.id
    WHERE f.workspace_id = ?
)
SELECT f.*, COALESCE(fp.path, '') || f.name as s3_key
FROM files f
LEFT JOIN folder_path fp ON f.workspace_folder_id = fp.id
WHERE f.workspace_id = ? AND f.is_trashed = 0
```

### ListObjectsV2 Translation:
- **Recursive List (no delimiter)**: Filter CTE results using `s3_key LIKE <prefix>%`.
- **Directory List (delimiter = `/`)**:
  - Resolve the folder matching the prefix by walking segments.
  - List immediate folder children as `CommonPrefixes`.
  - List immediate files as `Contents`.

### Dynamic Path Creation:
On `PutObject` or `InitiateMultipart`, we split the object key by `/` (e.g., `folder/subfolder/file.txt`). We walk down the virtual directory tree, automatically creating missing `workspace_folders` in D1 if they do not exist.

---

## 6. Testing Strategy

1. **Unit Tests (Vitest)**:
   - Mock AWS Signature V4 requests and test verification logic.
   - Test recursive CTE resolution with mock D1 database.
   - Test MD5 hashing on-the-fly stream helper.
2. **Integration Tests (rclone/aws-cli)**:
   - Set up `rclone` pointing to local wrangler server `http://localhost:8787/s3`.
   - Test standard operations: `rclone mkdir`, `rclone copy`, `rclone ls`, `rclone sync`.
