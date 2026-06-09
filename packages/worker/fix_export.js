const fs = require('fs');
let data = fs.readFileSync('db_export.sql', 'utf8');
data = data.replace(/REFERENCES "users_old"\(id\)/g, 'REFERENCES users(id)');
data = data.replace(/CREATE TABLE ([a-zA-Z0-9_]+) \(/g, 'DROP TABLE IF EXISTS $1;\nCREATE TABLE $1 (');
fs.writeFileSync('db_export_fixed.sql', data);
