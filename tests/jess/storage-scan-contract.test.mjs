import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Jess registers storage scanning as a read-only native desktop tool', async () => {
  const [tools, names, runtime, main, agent] = await Promise.all([
    read('../../src/lib/jessTools.ts'),
    read('../../src/shared/jessNativeToolNames.ts'),
    read('../../src/services/jessExecutionRuntime.ts'),
    read('../../electron/main.cjs'),
    read('../../electron/jess-agent.ps1'),
  ]);
  assert.ok(tools.includes("name: 'scan_windows_storage'"));
  assert.ok(tools.includes("method = 'filesystem_scan'"));
  assert.ok(names.includes("'scan_windows_storage'"));
  assert.ok(runtime.includes("'scan_windows_storage'"));
  assert.ok(main.includes("'filesystem_scan'"));
  assert.ok(agent.includes("function Get-JessFilesystemScan($a)"));
});

test('storage scan covers ready fixed drives, categorizes files, aggregates directories and detects duplicates within budgets', async () => {
  const agent = await read('../../electron/jess-agent.ps1');
  assert.ok(agent.includes('[System.IO.DriveType]::Fixed'));
  assert.ok(agent.includes('LastWriteTimeUtc'));
  assert.ok(agent.includes('LastAccessTimeUtc'));
  assert.ok(agent.includes('$directorySizes[$walkParent] += $length'));
  assert.ok(agent.includes("categoryStats = @{"));
  assert.ok(agent.includes("small = @{count=$stats.small.count;bytes=$stats.small.bytes"));
  assert.ok(agent.includes("mediumFilesSample = $mediumSample"));
  assert.ok(agent.includes("largestDirectories = $largestDirectories"));
  assert.ok(agent.includes('function Get-JessSha256([string]$Path)'));
  assert.ok(agent.includes('$hash = Get-JessSha256 ([string]$item.path)'));
  assert.ok(agent.includes('$hashingFailures++'));
  assert.ok(agent.includes('lastHashError = $lastHashError'));
  assert.ok(agent.includes('$hashBudget = [int64](2 * 1GB)'));
  assert.ok(agent.includes('hashBucketsCount = $hashBucketsCount'));
  assert.ok(agent.includes('Get-JessSha256 $fullPath'));
  assert.ok(agent.includes('[System.IO.FileAttributes]::ReparsePoint'));
  assert.ok(agent.includes('filesScanned = $files.Count'));
  assert.ok(agent.includes('completionReason = $completionReason'));
  assert.ok(agent.includes('maxSeconds = $maxSeconds'));
  assert.ok(agent.includes('maxFiles = $maxFiles'));
});

test('storage cleanup only accepts scanned temp/hash-verified duplicate IDs and requires the desktop confirmation gate', async () => {
  const [agent, main, tools, names] = await Promise.all([
    read('../../electron/jess-agent.ps1'),
    read('../../electron/main.cjs'),
    read('../../src/lib/jessTools.ts'),
    read('../../src/shared/jessNativeToolNames.ts'),
  ]);
  assert.ok(agent.includes("if (!$candidate.eligible"));
  assert.ok(agent.includes("if ($a.confirmedByDesktop -ne $true)"));
  assert.ok(agent.includes('SendToRecycleBin'));
  assert.ok(agent.includes('permanentDelete=$false'));
  assert.ok(agent.includes("Candidate is for review only and cannot be cleaned automatically"));
  assert.ok(main.includes("title: 'Confirm Windows storage cleanup'"));
  assert.ok(main.includes("if (choice.response !== 1)"));
  assert.ok(main.includes("{ ...cleanRequest, confirmedByDesktop: true }"));
  assert.ok(main.includes("method !== 'filesystem_clean'"));
  assert.ok(tools.includes("name: 'clean_windows_storage_candidates'"));
  assert.ok(tools.includes("method = 'filesystem_clean'"));
  assert.ok(names.includes("'clean_windows_storage_candidates'"));
});

test('cleanup validation rejects malformed scan IDs and duplicated or oversized candidate lists', async () => {
  const main = await read('../../electron/main.cjs');
  assert.ok(main.includes("!/^scan-[a-f0-9]{12}$/.test(safeArgs.scanId)"));
  assert.ok(main.includes('safeArgs.candidateIds.length > 100'));
  assert.ok(main.includes("new Set(safeArgs.candidateIds).size !== safeArgs.candidateIds.length"));
  assert.ok(main.includes("!/^F\\d{6}$/.test(id)"));
  assert.ok(main.includes('Candidate IDs must be unique IDs copied from the scan report.'));
});


test('Jess settings expose local access controls and conversational style choices', async () => {
  const [settings, main, assistant, live, tools] = await Promise.all([
    read('../../src/pages/JessSettings.tsx'),
    read('../../electron/main.cjs'),
    read('../../src/components/JessFloatingAssistant.tsx'),
    read('../../src/services/liveAudioClient.ts'),
    read('../../src/lib/jessTools.ts'),
  ]);
  for (const key of ['allowSystemWideFileScan','allowAutomatedFileManagement','allowShellCommands','moodAdaptiveTone','conversationStyle']) {
    assert.ok(settings.includes(key), 'Jess settings missing ' + key);
    assert.ok(main.includes(key), 'main-process preferences missing ' + key);
  }
  assert.ok(main.includes('Advanced shell commands are disabled in Jess settings'));
  assert.ok(main.includes('allowUnrestricted: allowEverything || jessPreferences.allowShellCommands === true'));
  assert.ok(assistant.includes('run a high-impact Windows command as your current user'));
  assert.ok(live.includes('MOOD ADAPTATION:'));
  assert.ok(live.includes("new Set(['search_web', 'google_search', 'desktop_open_website'])"));
  assert.ok(tools.includes("name: 'google_search'"));
});
