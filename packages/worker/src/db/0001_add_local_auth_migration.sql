PRAGMA foreign_keys=off;

-- 1. Rename existing users table
ALTER TABLE users RENAME TO users_old;

-- 2. Create new users table with all required constraints
CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    google_id       TEXT UNIQUE,
    email           TEXT UNIQUE,
    name            TEXT,
    avatar_url      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Copy data, using email (or id as fallback) for dummy username for old Google users
INSERT INTO users (id, username, password_hash, google_id, email, name, avatar_url, created_at, updated_at)
SELECT 
    id, 
    COALESCE(email, id) as username, 
    'oauth_only_user' as password_hash, 
    google_id, 
    email, 
    name, 
    avatar_url, 
    created_at, 
    updated_at 
FROM users_old;

-- 4. Drop the old table
DROP TABLE users_old;

PRAGMA foreign_keys=on;
