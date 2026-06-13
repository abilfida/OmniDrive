const Database = require('better-sqlite3');
const db = new Database('/app/data/omnidrive.sqlite');

console.log('Files count:', db.prepare('SELECT COUNT(*) as c FROM files').get().c);
console.log('Drive Folders count:', db.prepare('SELECT COUNT(*) as c FROM drive_folders').get().c);
console.log('Sync State:', db.prepare('SELECT * FROM sync_state').all());

const files = db.prepare('SELECT id, name, user_id, drive_account_id, google_parent_id FROM files LIMIT 5').all();
console.log('Sample files:', files);

const folders = db.prepare('SELECT id, name, drive_account_id, google_parent_id FROM drive_folders LIMIT 5').all();
console.log('Sample folders:', folders);
