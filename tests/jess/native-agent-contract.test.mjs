import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base=path.resolve('electron');
test('native agent uses line-oriented JSON and emits verification fields',()=>{const s=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');assert.match(s,/ConvertFrom-Json/);assert.match(s,/ConvertTo-Json/);assert.match(s,/'list_windows'/);assert.match(s,/'screenshot'/);assert.match(s,/'read_screen_text'/);assert.match(s,/verified=/);assert.match(s,/BitConverter\]::ToUInt32/);assert.match(s,/horizontalDelta/);assert.match(s,/F24=135/);assert.match(s,/SendVirtualKeys/);assert.match(s,/'show_desktop'/);assert.match(s,/'minimize_all'/);assert.match(s,/'start_menu'/);assert.match(s,/'switch_window'/);assert.match(s,/'center-third'/);});
test('Windows UI Automation exposes temporary numbered foreground controls with stale-target protection',async()=>{const [agent,main,tools,registry]=await Promise.all([fs.promises.readFile(path.join(base,'jess-agent.ps1'),'utf8'),fs.promises.readFile(path.resolve('electron/main.cjs'),'utf8'),fs.promises.readFile(path.resolve('src/lib/jessTools.ts'),'utf8'),fs.promises.readFile(path.resolve('src/shared/jessNativeToolNames.ts'),'utf8')]);assert.match(agent,/'list_ui_elements'/);assert.match(agent,/ExpandCollapsePattern/);assert.match(agent,/ExpandCollapsePattern\.Expand/);assert.match(agent,/ExpandCollapsePattern\.Collapse/);assert.match(agent,/IsOffscreen/);assert.match(agent,/expectedName/);assert.match(agent,/Numbered UI target changed/);assert.match(agent,/InvokePattern/);assert.match(agent,/SelectionItemPattern/);assert.match(main,/list_ui_elements/);assert.match(tools,/list_windows_ui_elements/);assert.match(tools,/expectedName/);assert.match(registry,/'list_windows_ui_elements'/);});

test('native bridge does not expose child process or filesystem to renderer',()=>{const s=fs.readFileSync(path.join(base,'preload.cjs'),'utf8');assert.match(s,/contextBridge\.exposeInMainWorld/);assert.doesNotMatch(s,/require\(['"]node:child_process/);assert.doesNotMatch(s,/exec\(/);});

test('native sidecar runtime records lifecycle, timeouts and rejects oversized protocol lines',()=>{const s=fs.readFileSync(path.join(base,'agentBridge.cjs'),'utf8');assert.match(s,/jess-agent-runtime\.jsonl/);assert.match(s,/action-timeout/);assert.match(s,/sidecar-exited/);assert.match(s,/MAX_RESPONSE_LINE_CHARS/);assert.match(s,/action-completed/);});
test('Chrome scroll supports a requested nested container and reports verification evidence',()=>{const s=fs.readFileSync(path.resolve('chrome-extension/service-worker.js'),'utf8');assert.match(s,/case 'chrome_scroll'/);assert.match(s,/const candidates = Array\.from\(document\.querySelectorAll/);assert.match(s,/const target = String\(a\.target/);assert.match(s,/verified: result\?\.result\?\.changed === true/);});

test('local file operations are bounded and deletion uses the Recycle Bin',()=>{const s=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');assert.match(s,/'file_action'/);assert.match(s,/1 MiB read limit/);assert.match(s,/500,000-character write limit/);assert.match(s,/SendToRecycleBin/);assert.match(s,/Destination already exists; refusing to overwrite/);});

test('clipboard operations have bounded text and report clipboard readback',()=>{const s=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');assert.match(s,/'clipboard_action'/);assert.match(s,/100,000-character limit/);assert.match(s,/readbackMatches=\$same/);assert.match(s,/clipboardTextCleared=\$empty/);});

test('screen sharing uses a thumbnail picker outside Allow everything and validates picker IPC sender',async()=>{const [main,html,script,preload]=await Promise.all([fs.promises.readFile(path.resolve('electron/main.cjs'),'utf8'),fs.promises.readFile(path.resolve('electron/screen-share-picker.html'),'utf8'),fs.promises.readFile(path.resolve('electron/screen-share-picker.js'),'utf8'),fs.promises.readFile(path.resolve('electron/screen-share-preload.cjs'),'utf8')]);assert.match(main,/thumbnailSize: \{ width: 320, height: 180 \}/);assert.match(main,/chooseDisplaySource\(unique\)/);assert.match(main,/permissionMode === 'allow-everything'[\s\S]{0,300}callback\(\{ video: primaryScreen \}\)/);assert.match(main,/event\.sender !== screenSharePickerWindow\.webContents/);assert.match(html,/id="sources"/);assert.match(script,/source\.thumbnail/);assert.match(preload,/contextBridge\.exposeInMainWorld/);});

test('app launch resolution includes Start Menu, App Paths, PATH and allowlisted URI schemes',()=>{const s=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');assert.match(s,/Get-StartApps/);assert.match(s,/App Paths/);assert.match(s,/Get-Command -Name \$name -CommandType Application/);assert.match(s,/ms-windows-store/);assert.match(s,/Application name is ambiguous/);assert.match(s,/EnablePerMonitorDpi/);});

test('Chrome native host authenticates the local pipe with a per-user token',async()=>{const [bridge,host,installer]=await Promise.all([fs.promises.readFile(path.resolve('electron/chromeBridge.cjs'),'utf8'),fs.promises.readFile(path.resolve('native/JessChromeNativeHost/Program.cs'),'utf8'),fs.promises.readFile(path.resolve('scripts/install-jess-chrome-bridge.ps1'),'utf8')]);assert.match(bridge,/timingSafeEqual/);assert.match(bridge,/response\?\.type !== 'hello'/);assert.match(bridge,/authenticated/);assert.match(host,/bridge-token/);assert.match(host,/hello-ack/);assert.match(installer,/icacls\.exe/);assert.match(installer,/\/inheritance:r/);assert.match(installer,/currentSid\.Value/);assert.doesNotMatch(installer,/^\s*Set-Acl\b/m, 'installer must not invoke the privileged Set-Acl cmdlet');assert.match(installer,/bridge-token/);});

test('native command execution is user-configurable, time-bounded and Windows power actions have explicit cancellation',()=>{const agent=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');const main=fs.readFileSync(path.resolve('electron/main.cjs'),'utf8');assert.match(agent,/WaitForExit\(\$timeoutMs\)/);assert.match(agent,/taskkill\.exe \/PID/);assert.match(agent,/'system_power_action'/);assert.match(agent,/scheduledDelaySeconds=15/);assert.match(agent,/cancel_shutdown/);assert.match(main,/Advanced shell commands are disabled in Jess settings/);assert.match(main,/Command timeout must be between 1,000 and 120,000 milliseconds/);assert.match(main,/allowShellCommands === true/);});

test('Chrome bridge installer supports optional HKLM registration and force-install policy',async()=>{const [script,manifest]=await Promise.all([fs.promises.readFile(path.resolve('scripts/install-jess-chrome-bridge.ps1'),'utf8'),fs.promises.readFile(path.resolve('chrome-extension/manifest.json'),'utf8')]);assert.match(script,/\[switch\]\$MachineWide/);assert.match(script,/HKLM:\\Software\\Google\\Chrome\\NativeMessagingHosts/);assert.match(script,/\[switch\]\$ForceInstallExtension/);assert.match(script,/ExtensionInstallForcelist/);assert.match(script,/clients2\.google\.com\/service\/update2\/crx/);assert.match(manifest,/"key"/);});

test('file reads support bounded chunks and next-offset continuation',()=>{const s=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');assert.match(s,/nextOffset=\$next/);assert.match(s,/characterCount=\$text\.Length/);assert.match(s,/truncated=\(\$next -lt \$text\.Length\)/);});

test('Chrome screenshot tool returns a bounded compressed preview for the active tab',async()=>{const [worker,manifest,assistant,main]=await Promise.all([fs.promises.readFile(path.resolve('chrome-extension/service-worker.js'),'utf8'),fs.promises.readFile(path.resolve('chrome-extension/manifest.json'),'utf8'),fs.promises.readFile(path.resolve('src/components/JessFloatingAssistant.tsx'),'utf8'),fs.promises.readFile(path.resolve('electron/main.cjs'),'utf8')]);assert.match(worker,/case 'chrome_capture_screenshot'/);assert.match(worker,/OffscreenCanvas/);assert.match(worker,/if \(!tab\.active\)/);assert.match(manifest,/"activeTab"/);assert.match(assistant,/chromeScreenshotPreview/);assert.match(main,/chrome_capture_screenshot/);});

test('native SendInput return count uses matching unsigned types and text entry shares the sidecar',async()=>{
 const [agent,main]=await Promise.all([fs.promises.readFile(path.join(base,'jess-agent.ps1'),'utf8'),fs.promises.readFile(path.join(base,'main.cjs'),'utf8')]);
 assert.match(agent,/SendInput\(\(uint\)inputs\.Length,inputs,Marshal\.SizeOf\(typeof\(INPUT\)\)\)==\(uint\)inputs\.Length/);
 const handler=main.slice(main.indexOf("ipcMain.handle('hubmind:type-text'"),main.indexOf("ipcMain.handle('hubmind:press-shortcut'"));
 assert.match(handler,/nativeAgent\.call\('type_text'/);
 assert.doesNotMatch(handler,/Add-Type -TypeDefinition/);
});

test('native agent announces readiness after startup and uses blittable Win32 point and SendInput mouse events',()=>{
 const agent=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');
 const bridge=fs.readFileSync(path.join(base,'agentBridge.cjs'),'utf8');
 assert.match(agent,/\{"type":"ready"\}/);
  assert.ok(agent.includes('public struct POINT{public int X,Y;}'));
 assert.match(agent,/GetCursorPos\(out POINT point\)/);
 assert.match(agent,/SendMouseEvent\(uint flags,uint data\)/);
 assert.match(agent,/GetVisibleWindowHandles\(\)/);
 assert.doesNotMatch(agent,/mouse_event\(/);
 assert.doesNotMatch(agent,/GetCursorPos\(out System\.Drawing\.Point/);
 assert.match(bridge,/Native helper startup timed out/);
 assert.match(bridge,/sidecar-ready/);
 assert.match(bridge,/-STA/);
 assert.match(bridge,/awaitReady/);
});
test('brightness actions use the WMI monitor brightness interface rather than unrelated keyboard keys',()=>{
 const agent=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');
 assert.match(agent,/WmiMonitorBrightnessMethods/);
 assert.match(agent,/WmiSetBrightness/);
 assert.doesNotMatch(agent,/brightness_up=111;brightness_down=112/);
});

test('Win32 interop uses a unique namespace, explicit Winapi calling convention and typed cursor APIs',()=>{
 const agent=fs.readFileSync(path.join(base,'jess-agent.ps1'),'utf8');
 assert.ok(agent.includes('namespace HubMind.Interop'));
 assert.ok(agent.includes('DllImport("user32.dll", CallingConvention=CallingConvention.Winapi'));
 assert.ok(agent.includes('GetCursorPos(out POINT point)'));
 assert.ok(agent.includes('SetCursorPos(int x,int y)'));
 assert.ok(agent.includes('SendInput(uint n,INPUT[] i,int size)'));
 assert.ok(!agent.includes('mouse_event('));
});
test('dismissed Jess orb can be restored with a global shortcut and tray menu',()=>{
 const main=fs.readFileSync(path.resolve('electron/main.cjs'),'utf8');
 assert.ok(main.includes('Control+Alt+Shift+O'));
 assert.ok(main.includes("label: 'Show Jess character'"));
 assert.ok(main.includes('createCompanionWindow(true)'));
});
