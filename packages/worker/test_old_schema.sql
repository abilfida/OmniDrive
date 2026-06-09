CREATE TABLE users (
    id              TEXT PRIMARY KEY,
    google_id       TEXT UNIQUE,
    email           TEXT UNIQUE,
    name            TEXT,
    avatar_url      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO users (id, google_id, email, name) VALUES ('user1', 'g1', 'test@example.com', 'Test');
