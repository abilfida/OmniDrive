PRAGMA writable_schema = ON;
UPDATE sqlite_schema SET sql = replace(sql, '"users_old"(id)', 'users(id)') WHERE type = 'table';
PRAGMA writable_schema = OFF;
