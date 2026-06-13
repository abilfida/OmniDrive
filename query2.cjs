const Database = require('better-sqlite3');
const db = new Database('/app/data/omnidrive.sqlite');
console.log('drive_accounts:', db.prepare('SELECT id, email, user_id FROM drive_accounts').all());
console.log('drive_folders:', db.prepare('SELECT * FROM drive_folders').all());
