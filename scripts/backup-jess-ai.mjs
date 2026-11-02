import fs from 'node:fs';
import path from 'node:path';

const CORE_FILES = [
  'src/lib/jessTools.ts',
  'src/services/liveAudioClient.ts',
  'src/services/memoryService.ts',
  'src/services/sentimentService.ts',
  'src/services/jessBackgroundTasks.ts',
  'src/services/contextScannerService.ts',
  'src/lib/jessDocumentBridge.ts',
  'src/lib/jessContext.ts',
  'src/components/JessFloatingAssistant.tsx',
  'src/components/JessOrbVisualizer.tsx',
  'server.ts',
  'netlify/functions/chat.ts',
  'netlify/functions/live-token.mjs',
  'netlify.toml'
];

const BACKUP_DIR = path.resolve(process.cwd(), 'jess_ai_backup');

console.log('🛡️ Creating snapshot backup of Jess AI Core configuration...');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const manifest = {
  timestamp: new Date().toISOString(),
  files: []
};

for (const relPath of CORE_FILES) {
  const src = path.resolve(process.cwd(), relPath);
  if (fs.existsSync(src)) {
    const dest = path.resolve(BACKUP_DIR, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    manifest.files.push(relPath);
    console.log(` ✅ Backed up: ${relPath}`);
  } else {
    console.warn(` ⚠️ Source not found: ${relPath}`);
  }
}

fs.writeFileSync(
  path.resolve(BACKUP_DIR, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf-8'
);

console.log(`\n🎉 Snapshot created successfully in /jess_ai_backup (${manifest.files.length} core files protected).`);
