CREATE TABLE users (id TEXT PRIMARY KEY);
CREATE TABLE items (id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id));
PRAGMA foreign_keys=off;
ALTER TABLE users RENAME TO users_old;
CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
DROP TABLE users_old;
-- Now items points to users_old
PRAGMA writable_schema = ON;
UPDATE sqlite_master SET sql = replace(sql, '"users_old"(id)', 'users(id)') WHERE type = 'table';
PRAGMA writable_schema = OFF;
