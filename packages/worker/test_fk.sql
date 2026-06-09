PRAGMA foreign_keys=OFF;
PRAGMA defer_foreign_keys=TRUE;
DROP TABLE IF EXISTS t1;
CREATE TABLE t1 (id TEXT REFERENCES virtual_folders(id));
INSERT INTO t1 VALUES ('1');
