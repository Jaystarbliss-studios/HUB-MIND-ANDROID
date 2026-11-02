import fs from 'node:fs';
import path from 'node:path';

const BACKUP_DIR = path.resolve(process.cwd(), 'jess_ai_backup');
const MANIFEST_PATH = path.resolve(BACKUP_DIR, 'manifest.json');

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error('❌ No Jess AI backup found in /jess_ai_backup.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
console.log(`🛡️ Restoring Jess AI Core from snapshot (${manifest.timestamp})...`);

let count = 0;
for (const relPath of manifest.files) {
  const src = path.resolve(BACKUP_DIR, relPath);
  const dest = path.resolve(process.cwd(), relPath);

  if (fs.existsSync(src)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    console.log(` 🔄 Restored: ${relPath}`);
    count++;
  } else {
    console.warn(` ⚠️ Backup missing file: ${relPath}`);
  }
}

console.log(`\n🎉 Successfully restored ${count} Jess AI Core files. Personality, tools, and actions are intact!`);
