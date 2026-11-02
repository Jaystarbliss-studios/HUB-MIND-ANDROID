$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace HubMind.Interop {
public static class JessWin32 {
 public delegate bool EnumWindowsProc(IntPtr h,IntPtr lp);
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] public struct INPUT{public uint type;public InputUnion U;}
 [StructLayout(LayoutKind.Explicit)] public struct InputUnion{[FieldOffset(0)]public KEYBDINPUT ki;[FieldOffset(0)]public MOUSEINPUT mi;}
 [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT{public ushort vk,scan;public uint flags,time;public IntPtr extra;}
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT{public int dx,dy;public uint data,flags,time;public IntPtr extra;}
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool EnumWindows(EnumWindowsProc cb,IntPtr lp);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi,CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder s,int n);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool BringWindowToTop(IntPtr h);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool ShowWindowAsync(IntPtr h,int n);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int he,bool repaint);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi)]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi,SetLastError=true)]public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi,SetLastError=true)]public static extern bool GetCursorPos(out POINT point);
 [DllImport("user32.dll", CallingConvention=CallingConvention.Winapi,SetLastError=true)]public static extern uint SendInput(uint n,INPUT[] i,int size);
 public static IntPtr[] GetVisibleWindowHandles(){var handles=new System.Collections.Generic.List<IntPtr>();EnumWindows(delegate(IntPtr h,IntPtr lp){if(IsWindowVisible(h))handles.Add(h);return true;},IntPtr.Zero);return handles.ToArray();}
 public static bool SendMouseEvent(uint flags,uint data){var input=new INPUT();input.type=0;input.U.mi=new MOUSEINPUT{dx=0,dy=0,data=data,flags=flags,time=0,extra=IntPtr.Zero};return SendInput(1,new INPUT[]{input},Marshal.SizeOf(typeof(INPUT)))==1;}
 [DllImport("shcore.dll", CallingConvention=CallingConvention.Winapi)]private static extern int SetProcessDpiAwareness(int awareness);
 public static void EnablePerMonitorDpi(){try{SetProcessDpiAwareness(2);}catch{}}
 public const uint KEYUP=2,UNICODE=4,EXTENDED=1;
 public static bool SendVirtualKeys(ushort[] keys,int holdMs) {
  if(keys==null||keys.Length==0) return false;
  var inputs=new INPUT[keys.Length*2];
  for(int i=0;i<keys.Length;i++){
   uint flags=(keys[i]==33||keys[i]==34||keys[i]==35||keys[i]==36||keys[i]==37||keys[i]==38||keys[i]==39||keys[i]==40||keys[i]==45||keys[i]==46||keys[i]==91||keys[i]==92||keys[i]==144||keys[i]==145||keys[i]>=173&&keys[i]<=179)?EXTENDED:0;
   inputs[i]=new INPUT();inputs[i].type=1;inputs[i].U.ki=new KEYBDINPUT{vk=keys[i],scan=0,flags=flags,time=0,extra=IntPtr.Zero};
  }
  System.Threading.Thread.Sleep(Math.Max(0,Math.Min(5000,holdMs)));
  for(int i=0;i<keys.Length;i++){
   ushort key=keys[keys.Length-1-i];
   uint flags=KEYUP;
   if(key==33||key==34||key==35||key==36||key==37||key==38||key==39||key==40||key==45||key==46||key==91||key==92||key==144||key==145||key>=173&&key<=179) flags|=EXTENDED;
   inputs[keys.Length+i]=new INPUT();inputs[keys.Length+i].type=1;inputs[keys.Length+i].U.ki=new KEYBDINPUT{vk=key,scan=0,flags=flags,time=0,extra=IntPtr.Zero};
  }
  return SendInput((uint)inputs.Length,inputs,Marshal.SizeOf(typeof(INPUT)))==(uint)inputs.Length;
 }
}
}
'@
$script:JessFilesystemScans = @{}
function Get-JessSha256([string]$Path) {
  if (!$Path -or $Path.Length -gt 2048) { throw 'A valid file path is required for hashing.' }
  $stream = $null
  $sha = $null
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete))
    $sha = [System.Security.Cryptography.SHA256]::Create()
    return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
  } finally {
    if ($sha) { $sha.Dispose() }
    if ($stream) { $stream.Dispose() }
  }
}
function Get-JessFilesystemScan($a) {
  $rootInput = [string]$a.root
  $thresholdMb = 500
  if ($null -ne $a.largeThresholdMB) { $thresholdMb = [Math]::Max(10,[Math]::Min(1048576,[double]$a.largeThresholdMB)) }
  $inactiveDays = 180
  if ($null -ne $a.inactiveDays) { $inactiveDays = [Math]::Max(1,[Math]::Min(36500,[int]$a.inactiveDays)) }
  $maxSeconds = 300
  if ($null -ne $a.maxSeconds) { $maxSeconds = [Math]::Max(15,[Math]::Min(600,[int]$a.maxSeconds)) }
  $maxFiles = 100000
  if ($null -ne $a.maxFiles) { $maxFiles = [Math]::Max(1000,[Math]::Min(500000,[int]$a.maxFiles)) }
  $detectDuplicates = $true
  if ($null -ne $a.detectDuplicates) { $detectDuplicates = [bool]$a.detectDuplicates }
  $roots = New-Object 'System.Collections.Generic.List[string]'
  if ($rootInput.Trim()) {
    if ($rootInput.Length -gt 2048 -or $rootInput.Contains([char]0)) { throw 'Scan root path is invalid.' }
    $resolvedRoot = [System.IO.Path]::GetFullPath($rootInput)
    if (!(Test-Path -LiteralPath $resolvedRoot -PathType Container)) { throw 'Scan root must be an existing directory.' }
    [void]$roots.Add($resolvedRoot)
  } else {
    foreach ($drive in [System.IO.DriveInfo]::GetDrives()) {
      try { if ($drive.IsReady -and $drive.DriveType -eq [System.IO.DriveType]::Fixed) { [void]$roots.Add($drive.RootDirectory.FullName) } } catch {}
    }
  }
  if ($roots.Count -eq 0) { throw 'No ready local fixed drives were found to scan.' }
  $scanId = 'scan-' + [Guid]::NewGuid().ToString('N').Substring(0,12)
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $walkDeadline = $maxSeconds * 0.72
  $files = New-Object 'System.Collections.Generic.List[object]'
  $directorySizes = @{}
  $sizeGroups = @{}
  $stats = @{
    small = @{ count = [int64]0; bytes = [int64]0 }
    medium = @{ count = [int64]0; bytes = [int64]0 }
    large = @{ count = [int64]0; bytes = [int64]0 }
  }
  $totalBytes = [int64]0
  $directoriesVisited = 0
  $inaccessibleDirectories = 0
  $skippedReparseDirectories = 0
  $skippedReparseFiles = 0
  $fileNumber = 0
  $limited = $false
  $tempRoots = @($env:TEMP, (Join-Path $env:WINDIR 'Temp'), (Join-Path $env:LOCALAPPDATA 'Temp')) | Where-Object { $_ } | ForEach-Object { ([string]$_).TrimEnd([char]'\') }
  $tempExtensions = @('.tmp','.temp','.bak','.old','.dmp','.etl','.crdownload','.part','.download','.cache')
  $cutoff = [DateTime]::UtcNow.AddDays(-$inactiveDays)
  $smallCutoff = [int64](10 * 1MB)
  $largeCutoff = [int64]($thresholdMb * 1MB)

  foreach ($scanRoot in $roots) {
    $stack = New-Object 'System.Collections.Generic.Stack[string]'
    [void]$stack.Push($scanRoot)
    $boundary = ([System.IO.Path]::GetFullPath($scanRoot)).TrimEnd([char]'\')
    while ($stack.Count -gt 0) {
      if ($timer.Elapsed.TotalSeconds -ge $walkDeadline -or $files.Count -ge $maxFiles) { $limited = $true; break }
      $current = $stack.Pop()
      $directoriesVisited++
      try { $entries = @(Get-ChildItem -LiteralPath $current -Force -ErrorAction Stop) }
      catch { $inaccessibleDirectories++; continue }
      foreach ($entry in $entries) {
        if ($timer.Elapsed.TotalSeconds -ge $walkDeadline -or $files.Count -ge $maxFiles) { $limited = $true; break }
        $isReparsePoint = $false
        try { $isReparsePoint = (([int]$entry.Attributes -band [int][System.IO.FileAttributes]::ReparsePoint) -ne 0) } catch { $isReparsePoint = $true }
        if ($isReparsePoint) {
          if ($entry.PSIsContainer) { $skippedReparseDirectories++ } else { $skippedReparseFiles++ }
          continue
        }
        if ($entry.PSIsContainer) {
          try { [void]$stack.Push($entry.FullName) } catch { $skippedReparseDirectories++ }
          continue
        }
        try {
          $length = [int64]$entry.Length
          $writeUtc = $entry.LastWriteTimeUtc
          $accessUtc = $entry.LastAccessTimeUtc
          $parent = [System.IO.Path]::GetDirectoryName($entry.FullName)
          $walkParent = $parent
          while ($walkParent) {
            $normalParent = $walkParent.TrimEnd([char]'\')
            if (!($normalParent.Equals($boundary,[StringComparison]::OrdinalIgnoreCase) -or $walkParent.StartsWith(($boundary + '\'),[StringComparison]::OrdinalIgnoreCase))) { break }
            if (!$directorySizes.ContainsKey($walkParent)) { $directorySizes[$walkParent] = [int64]0 }
            $directorySizes[$walkParent] += $length
            if ($normalParent.Equals($boundary,[StringComparison]::OrdinalIgnoreCase)) { break }
            $parentInfo = [System.IO.Directory]::GetParent($walkParent)
            if (!$parentInfo) { break }
            $walkParent = $parentInfo.FullName
          }
          if ($length -lt $smallCutoff) { $category = 'small' }
          elseif ($length -ge $largeCutoff) { $category = 'large' }
          else { $category = 'medium' }
          $stats[$category].count++
          $stats[$category].bytes += $length
          $totalBytes += $length
          $fileNumber++
          $fileId = 'F' + $fileNumber.ToString('D6')
          $fullPath = [string]$entry.FullName
          $inTempPath = $false
          foreach ($tempRoot in $tempRoots) {
            if ($fullPath.StartsWith(($tempRoot + '\'),[StringComparison]::OrdinalIgnoreCase)) { $inTempPath = $true; break }
          }
          $isTemp = $inTempPath -or ($tempExtensions -contains ([string]$entry.Extension).ToLowerInvariant())
          $isInactive = ($writeUtc -le $cutoff -and $accessUtc -le $cutoff)
          $reasons = New-Object 'System.Collections.Generic.List[string]'
          if ($isTemp) { [void]$reasons.Add('temporary') }
          if ($isInactive) { [void]$reasons.Add('inactive') }
          $record = @{
            id = $fileId; path = $fullPath; name = [string]$entry.Name; sizeBytes = $length
            sizeFormatted = ('{0:N1} MB' -f ($length / 1MB)); category = $category
            lastWriteTimeUtc = $writeUtc.ToString('o'); lastAccessTimeUtc = $accessUtc.ToString('o')
            lastWriteTicks = [int64]$writeUtc.Ticks; sha256 = ''; reasons = @($reasons.ToArray())
            cleanupEligible = $isTemp; temp = $isTemp; inactive = $isInactive
          }
          [void]$files.Add($record)
          $sizeKey = [string]$length
          if (!$sizeGroups.ContainsKey($sizeKey)) { $sizeGroups[$sizeKey] = New-Object 'System.Collections.Generic.List[object]' }
          [void]$sizeGroups[$sizeKey].Add($record)
        } catch { continue }
      }
      if ($limited) { break }
    }
    if ($limited) { break }
  }

  $hashRecords = New-Object 'System.Collections.Generic.List[object]'
  $duplicateGroups = New-Object 'System.Collections.Generic.List[object]'
  $hashBudget = [int64](2 * 1GB)
  $hashFiles = 0
  $hashingFailures = 0
  $lastHashError = ''
  $hashingTruncated = $false
  $duplicateSizeGroups = @($files | Group-Object -Property { [string]$_.sizeBytes } | Where-Object { @($_.Group).Length -gt 1 })
  $sameSizeGroupCount = $duplicateSizeGroups.Count
  if ($detectDuplicates) {
    foreach ($sizeGroup in $duplicateSizeGroups) {
      $sameSize = @($sizeGroup.Group)
      if ($sameSize.Length -lt 2) { continue }
      foreach ($item in $sameSize) {
        if ($timer.Elapsed.TotalSeconds -ge $maxSeconds -or $hashFiles -ge 1500 -or $hashBudget -le 0) { $hashingTruncated = $true; break }
        if ([int64]$item.sizeBytes -gt 536870912) { $hashingTruncated = $true; continue }
        try {
          $hash = Get-JessSha256 ([string]$item.path)
          $item.sha256 = $hash
          $hashFiles++
          $hashBudget -= [int64]$item.sizeBytes
          [void]$hashRecords.Add($item)
        } catch {
          $hashingFailures++
          if (!$lastHashError) { $lastHashError = ([string]$_.Exception.Message).Substring(0, [Math]::Min(300, ([string]$_.Exception.Message).Length)) }
        }
      }
      if ($timer.Elapsed.TotalSeconds -ge $maxSeconds -or $hashFiles -ge 1500 -or $hashBudget -le 0) { $hashingTruncated = $true; break }
    }
    $hashedGroups = @($hashRecords | Group-Object -Property { [string]$_.sha256 } | Where-Object { $_.Name -and @($_.Group).Length -gt 1 })
    foreach ($hashGroup in $hashedGroups) {
      $sameContent = @($hashGroup.Group)
      if ($sameContent.Length -lt 2) { continue }
      $ordered = @($sameContent | Sort-Object -Property path)
      $keeper = $ordered[0]
      $duplicateIds = New-Object 'System.Collections.Generic.List[string]'
      $duplicatePaths = New-Object 'System.Collections.Generic.List[string]'
      for ($i = 1; $i -lt $ordered.Length; $i++) {
        $duplicate = $ordered[$i]
        if (!($duplicate.reasons -contains 'duplicate')) { $duplicate.reasons = @($duplicate.reasons + 'duplicate') }
        $duplicate.cleanupEligible = $true
        [void]$duplicateIds.Add([string]$duplicate.id)
        [void]$duplicatePaths.Add([string]$duplicate.path)
      }
      if ($duplicateIds.Count -gt 0 -and $duplicateGroups.Count -lt 100) {
        [void]$duplicateGroups.Add(@{sha256=$hashGroup.Name;sizeBytes=[int64]$keeper.sizeBytes;keepPath=$keeper.path;candidateIds=@($duplicateIds.ToArray());duplicatePaths=@($duplicatePaths.ToArray());count=$duplicateIds.Count})
      }
    }
  }
  $hashBucketsCount = @($hashRecords | Group-Object -Property { [string]$_.sha256 } | Where-Object {$_.Name}).Count
  $candidateCache = @{}
  foreach ($item in $files) {
    if ($item.cleanupEligible -or $item.inactive) {
      $candidateCache[[string]$item.id] = @{
        id = [string]$item.id; path = [string]$item.path; sizeBytes = [int64]$item.sizeBytes
        lastWriteTicks = [int64]$item.lastWriteTicks; sha256 = [string]$item.sha256
        reasons = @($item.reasons); eligible = [bool]$item.cleanupEligible
      }
    }
  }
  $eligibleCandidatePreview = @($candidateCache.Values | Where-Object {$_.eligible} | Sort-Object -Property sizeBytes -Descending | Select-Object -First 150)
  $inactiveOnlyPreview = @($candidateCache.Values | Where-Object {!$_.eligible} | Sort-Object -Property sizeBytes -Descending | Select-Object -First 50)
  $candidatePreview = @(($eligibleCandidatePreview + $inactiveOnlyPreview) | ForEach-Object {
    @{candidateId=$_.id;path=$_.path;sizeBytes=$_.sizeBytes;sizeFormatted=('{0:N1} MB' -f ($_.sizeBytes / 1MB));reasons=$_.reasons;cleanupEligible=$_.eligible;lastWriteTimeUtc=([DateTime]::new([int64]$_.lastWriteTicks,[DateTimeKind]::Utc)).ToString('o')}
  })
  $cleanupEligibleCount = @($candidateCache.Values | Where-Object {$_.eligible}).Count
  $largest = @($files | Sort-Object -Property sizeBytes -Descending | Select-Object -First 100 | ForEach-Object {@{id=$_.id;path=$_.path;sizeBytes=$_.sizeBytes;sizeFormatted=$_.sizeFormatted;category=$_.category;lastWriteTimeUtc=$_.lastWriteTimeUtc}})
  $mediumSample = @($files | Where-Object {$_.category -eq 'medium'} | Sort-Object -Property sizeBytes -Descending | Select-Object -First 40 | ForEach-Object {@{id=$_.id;path=$_.path;sizeBytes=$_.sizeBytes;sizeFormatted=$_.sizeFormatted;lastWriteTimeUtc=$_.lastWriteTimeUtc}})
  $smallSample = @($files | Where-Object {$_.category -eq 'small'} | Sort-Object -Property sizeBytes -Descending | Select-Object -First 40 | ForEach-Object {@{id=$_.id;path=$_.path;sizeBytes=$_.sizeBytes;sizeFormatted=$_.sizeFormatted;lastWriteTimeUtc=$_.lastWriteTimeUtc}})
  $inactiveSample = @($files | Where-Object {$_.inactive} | Sort-Object -Property lastWriteTimeUtc | Select-Object -First 100 | ForEach-Object {@{candidateId=$_.id;path=$_.path;sizeBytes=$_.sizeBytes;sizeFormatted=$_.sizeFormatted;lastWriteTimeUtc=$_.lastWriteTimeUtc;lastAccessTimeUtc=$_.lastAccessTimeUtc;cleanupEligible=$_.cleanupEligible}})
  $tempSample = @($files | Where-Object {$_.temp} | Sort-Object -Property sizeBytes -Descending | Select-Object -First 100 | ForEach-Object {@{candidateId=$_.id;path=$_.path;sizeBytes=$_.sizeBytes;sizeFormatted=$_.sizeFormatted;reasons=$_.reasons;cleanupEligible=$true}})
  $largestDirectories = @($directorySizes.GetEnumerator() | Sort-Object -Property Value -Descending | Select-Object -First 30 | ForEach-Object {@{path=$_.Key;sizeBytes=[int64]$_.Value;sizeFormatted=('{0:N1} GB' -f ($_.Value / 1GB))}})
  $scan = @{
    scanId = $scanId; createdAtUtc = [DateTime]::UtcNow.ToString('o'); roots = @($roots.ToArray())
    candidateCache = $candidateCache; filesScanned = $files.Count; truncated = $limited -or $hashingTruncated
  }
  $script:JessFilesystemScans[$scanId] = $scan
  while ($script:JessFilesystemScans.Count -gt 5) { $oldest = $script:JessFilesystemScans.GetEnumerator() | Sort-Object { $_.Value.createdAtUtc } | Select-Object -First 1; if (!$oldest) { break }; $script:JessFilesystemScans.Remove($oldest.Key) }
  $timer.Stop()
  $completionReason = if ($limited) { 'time_or_file_limit' } elseif ($hashingTruncated) { 'duplicate_hash_budget_or_time_limit' } else { 'completed' }
  $note = 'Inactive candidates require both last-write and last-access timestamps to be older than the selected age. Windows may disable last-access timestamp updates, so treat age as advisory. Temporary filenames and identical hashes are candidates, not a guarantee that files are useless. Cleanup only supports explicitly selected temporary/duplicate files and always moves them to the Recycle Bin after a separate confirmation dialog.'
  return @{
    ok = $true; verified = $true
    evidence = @{
      scanId = $scanId; roots = @($roots.ToArray()); scanDurationSeconds = [Math]::Round($timer.Elapsed.TotalSeconds,2)
      filesScanned = $files.Count; directoriesVisited = $directoriesVisited; inaccessibleDirectories = $inaccessibleDirectories
      skippedReparsePointDirectories = $skippedReparseDirectories; skippedReparsePointFiles = $skippedReparseFiles; partial = ($limited -or $hashingTruncated); completionReason = $completionReason
      totalSizeBytes = $totalBytes; totalSizeFormatted = ('{0:N2} GB' -f ($totalBytes / 1GB))
      categoryStats = @{
        small = @{count=$stats.small.count;bytes=$stats.small.bytes;definition='under 10 MiB'}
        medium = @{count=$stats.medium.count;bytes=$stats.medium.bytes;definition=('10 MiB up to '+$thresholdMb+' MiB')}
        large = @{count=$stats.large.count;bytes=$stats.large.bytes;definition=('at least '+$thresholdMb+' MiB')}
      }
      largestFiles = $largest; mediumFilesSample = $mediumSample; smallFilesSample = $smallSample
      largestDirectories = $largestDirectories; inactiveFilesSample = $inactiveSample; temporaryFilesSample = $tempSample
      duplicateGroups = @($duplicateGroups.ToArray()); sameSizeGroupsCount = $sameSizeGroupCount; hashBucketsCount = $hashBucketsCount; hashesComputed = $hashFiles; hashRecordsCount = $hashRecords.Count; hashingFailures = $hashingFailures; lastHashError = $lastHashError; duplicateHashingLimited = $hashingTruncated; detectDuplicatesEnabled = $detectDuplicates
      candidateCount = $candidateCache.Count; cleanupEligibleCount = $cleanupEligibleCount; candidates = $candidatePreview; candidatesTruncated = ($candidateCache.Count -gt $candidatePreview.Count)
      inactiveDays = $inactiveDays; largeThresholdMB = $thresholdMb; maxFiles = $maxFiles; maxSeconds = $maxSeconds; note = $note
    }
  }
}
function Invoke-JessFilesystemClean($a) {
  $scanId = [string]$a.scanId
  if (!$scanId -or !$script:JessFilesystemScans.ContainsKey($scanId)) { throw 'Scan ID was not found or expired. Run a new storage scan first.' }
  $candidateIds = @($a.candidateIds)
  if ($candidateIds.Count -lt 1 -or $candidateIds.Count -gt 100) { throw 'Select between 1 and 100 exact candidate IDs from a recent scan.' }
  $cache = $script:JessFilesystemScans[$scanId].candidateCache
  $selected = New-Object 'System.Collections.Generic.List[object]'
  $seen = @{}
  foreach ($candidateIdValue in $candidateIds) {
    $candidateId = [string]$candidateIdValue
    if (!$candidateId -or !$cache.ContainsKey($candidateId) -or $seen.ContainsKey($candidateId)) { throw ('Candidate ID is invalid, duplicated, or was not returned by this scan: ' + $candidateId) }
    $seen[$candidateId] = $true
    $candidate = $cache[$candidateId]
    if (!$candidate.eligible -or !(($candidate.reasons -contains 'temporary') -or ($candidate.reasons -contains 'duplicate'))) { throw ('Candidate is for review only and cannot be cleaned automatically: ' + $candidate.path) }
    if (!(Test-Path -LiteralPath $candidate.path -PathType Leaf)) { throw ('Candidate file no longer exists: ' + $candidate.path) }
    $fullPath = [System.IO.Path]::GetFullPath([string]$candidate.path)
    $protectedRoots = @($env:WINDIR,$env:ProgramFiles,[Environment]::GetEnvironmentVariable('ProgramFiles(x86)'),$env:ProgramData,(Join-Path $env:SystemDrive 'System Volume Information'),(Join-Path $env:SystemDrive '$Recycle.Bin')) | Where-Object { $_ } | ForEach-Object { ([string]$_).TrimEnd([char]'\') }
    foreach ($protectedRoot in $protectedRoots) {
      if ($fullPath.Equals($protectedRoot,[StringComparison]::OrdinalIgnoreCase) -or $fullPath.StartsWith(($protectedRoot + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw ('Refusing to clean a file inside a protected Windows/system directory: ' + $fullPath) }
    }
    $info = Get-Item -LiteralPath $fullPath -ErrorAction Stop
    if ([int64]$info.Length -ne [int64]$candidate.sizeBytes -or [int64]$info.LastWriteTimeUtc.Ticks -ne [int64]$candidate.lastWriteTicks) { throw ('Candidate changed after the scan; scan again before cleaning: ' + $fullPath) }
    if ($candidate.reasons -contains 'duplicate') {
      if (!$candidate.sha256 -or (Get-JessSha256 $fullPath) -ne $candidate.sha256) { throw ('Duplicate candidate content changed after the scan: ' + $fullPath) }
    }
    [void]$selected.Add(@{id=$candidateId;path=$fullPath;sizeBytes=[int64]$candidate.sizeBytes;reasons=@($candidate.reasons)})
  }
  $totalBytes = [int64]0
  foreach ($item in $selected) { $totalBytes += [int64]$item.sizeBytes }
  if ($a.previewOnly -eq $true) {
    return @{ok=$true;verified=$true;evidence=@{scanId=$scanId;count=$selected.Count;totalBytes=$totalBytes;items=@($selected.ToArray())}}
  }
  if ($a.confirmedByDesktop -ne $true) { throw 'Cleanup requires confirmation through the trusted desktop confirmation dialog.' }
  Add-Type -AssemblyName Microsoft.VisualBasic
  $results = New-Object 'System.Collections.Generic.List[object]'
  foreach ($item in $selected) {
    try {
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile([string]$item.path,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)
      $gone = !(Test-Path -LiteralPath $item.path)
      [void]$results.Add(@{id=$item.id;path=$item.path;ok=$gone;sentToRecycleBin=$gone;permanentDelete=$false;sizeBytes=$item.sizeBytes;reasons=$item.reasons})
      if ($gone) { $cache.Remove([string]$item.id) }
    } catch {
      [void]$results.Add(@{id=$item.id;path=$item.path;ok=$false;sentToRecycleBin=$false;error=$_.Exception.Message;permanentDelete=$false;sizeBytes=$item.sizeBytes})
    }
  }
  $succeeded = @($results | Where-Object {$_.ok}).Count
  return @{ok=($succeeded -eq $selected.Count);verified=($succeeded -eq $selected.Count);evidence=@{scanId=$scanId;requested=$selected.Count;recycled=$succeeded;failed=($selected.Count-$succeeded);totalBytes=$totalBytes;results=@($results.ToArray());permanentDelete=$false;note='Selected files were moved to the Windows Recycle Bin, not permanently deleted.'}}
}
function Get-Windows {
 $items=New-Object System.Collections.Generic.List[object]
 foreach($h in [HubMind.Interop.JessWin32]::GetVisibleWindowHandles()){
  try{
   $sb=New-Object System.Text.StringBuilder 1024
   [void][HubMind.Interop.JessWin32]::GetWindowText($h,$sb,$sb.Capacity)
   $title=$sb.ToString().Trim()
   if(!$title){continue}
   $processId=[uint32]0
   [void][HubMind.Interop.JessWin32]::GetWindowThreadProcessId($h,[ref]$processId)
   $r=New-Object HubMind.Interop.JessWin32+RECT
   [void][HubMind.Interop.JessWin32]::GetWindowRect($h,[ref]$r)
   $proc=''
   try{$proc=(Get-Process -Id $processId -ErrorAction Stop).ProcessName}catch{}
   try{$mon=[System.Windows.Forms.Screen]::FromHandle($h)}catch{$mon=[System.Windows.Forms.Screen]::PrimaryScreen}
   if(!$mon){$mon=[System.Windows.Forms.Screen]::AllScreens|Select-Object -First 1}
   $mb=$mon.Bounds;$mw=$mon.WorkingArea
   $items.Add([pscustomobject]@{handle=$h.ToInt64();title=$title;process=$proc;pid=$processId;bounds=@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top};monitor=@{deviceName=$mon.DeviceName;primary=$mon.Primary;bounds=@{x=$mb.X;y=$mb.Y;width=$mb.Width;height=$mb.Height};workingArea=@{x=$mw.X;y=$mw.Y;width=$mw.Width;height=$mw.Height}};state=$(if([HubMind.Interop.JessWin32]::IsIconic($h)){'minimized'}elseif([HubMind.Interop.JessWin32]::IsZoomed($h)){'maximized'}else{'normal'});foreground=($h -eq [HubMind.Interop.JessWin32]::GetForegroundWindow())})
  }catch{}
 }
 return ,([object[]]$items.ToArray())
}
function Find-Window($a){
 $ws=Get-Windows
 if($null -ne $a.handle -and [string]$a.handle -ne ''){
  $handleMatches=@($ws|Where-Object{[string]$_.handle -eq [string]$a.handle})
  if($handleMatches.Count -eq 1){return $handleMatches[0]}
  return $null
 }
 if($a.title){
  $needle=[string]$a.title
  $exact=@($ws|Where-Object{[string]::Equals([string]$_.title,$needle,[StringComparison]::OrdinalIgnoreCase)})
  if($exact.Count -eq 1){return $exact[0]}
  if($exact.Count -gt 1){throw 'Window title is ambiguous; provide the exact window handle.'}
  $titleMatches=@($ws|Where-Object{$_.title.IndexOf($needle,[StringComparison]::OrdinalIgnoreCase) -ge 0})
  if($titleMatches.Count -eq 1){return $titleMatches[0]}
  if($titleMatches.Count -gt 1){throw 'Window title is ambiguous; provide the exact window handle.'}
 }
 return $null
}
function Send-Key($key, $holdMs = 45){
  $map=@{ENTER=13;ESC=27;TAB=9;SPACE=32;BACKSPACE=8;DELETE=46;INSERT=45;HOME=36;END=35;PAGEUP=33;PAGEDOWN=34;UP=38;DOWN=40;LEFT=37;RIGHT=39;CTRL=17;ALT=18;SHIFT=16;WIN=91;F1=112;F2=113;F3=114;F4=115;F5=116;F6=117;F7=118;F8=119;F9=120;F10=121;F11=122;F12=123;F13=124;F14=125;F15=126;F16=127;F17=128;F18=129;F19=130;F20=131;F21=132;F22=133;F23=134;F24=135;VOLUME_MUTE=173;VOLUME_DOWN=174;VOLUME_UP=175;MEDIA_NEXT=176;MEDIA_PREVIOUS=177;MEDIA_STOP=178;MEDIA_PLAY_PAUSE=179}
  $vks=New-Object System.Collections.Generic.List[uint16];foreach($p in $key.ToUpperInvariant().Split('+')){$v=$map[$p];if(!$v -and $p.Length -eq 1){$v=[int][char]$p};if(!$v){throw ('Unsupported key '+$p)};$vks.Add([uint16]$v)}
  $ok=[HubMind.Interop.JessWin32]::SendVirtualKeys($vks.ToArray(),[Math]::Max(0,[Math]::Min(5000,[int]$holdMs)))
  if(-not $ok){throw 'Windows SendInput did not accept the complete key sequence.'}
}
function Invoke-Action($q){
 $a=$q.args
 switch($q.method){
 'show_desktop' {Send-Key 'WIN+D';Start-Sleep -Milliseconds 200;return @{ok=$true;verified=$false;evidence=@{action='show_desktop';note='Windows desktop shortcut delivered; verify with a follow-up screenshot'}}}
 'minimize_all' {Send-Key 'WIN+M';Start-Sleep -Milliseconds 200;return @{ok=$true;verified=$false;evidence=@{action='minimize_all';note='Windows minimize-all shortcut delivered; verify with a follow-up screenshot'}}}
 'start_menu' {Send-Key 'WIN';Start-Sleep -Milliseconds 180;return @{ok=$true;verified=$false;evidence=@{action='start_menu';note='Windows key delivered to open Start; verify with a follow-up screenshot'}}}
 'switch_window' {$w=Find-Window $a;if($w){[void][HubMind.Interop.JessWin32]::ShowWindowAsync([IntPtr]$w.handle,9);[void][HubMind.Interop.JessWin32]::BringWindowToTop([IntPtr]$w.handle);[void][HubMind.Interop.JessWin32]::SetForegroundWindow([IntPtr]$w.handle);Start-Sleep -Milliseconds 180;$active=([HubMind.Interop.JessWin32]::GetForegroundWindow().ToInt64() -eq [int64]$w.handle);return @{ok=$active;verified=$active;evidence=@{window=$w;foreground=([HubMind.Interop.JessWin32]::GetForegroundWindow().ToInt64())}}};Send-Key 'ALT+TAB';Start-Sleep -Milliseconds 180;return @{ok=$true;verified=$false;evidence=@{action='switch_window';note='Alt+Tab was sent; the selected window requires follow-up verification'}}}
 'list_windows' {return @{ok=$true;verified=$true;evidence=(Get-Windows)}}
 'focus_window' {$w=Find-Window $a;if(!$w){throw 'Window not found'};[void][HubMind.Interop.JessWin32]::ShowWindowAsync([IntPtr]$w.handle,9);[void][HubMind.Interop.JessWin32]::BringWindowToTop([IntPtr]$w.handle);[void][HubMind.Interop.JessWin32]::SetForegroundWindow([IntPtr]$w.handle);Start-Sleep -Milliseconds 250;$ok=([HubMind.Interop.JessWin32]::GetForegroundWindow().ToInt64() -eq [int64]$w.handle);return @{ok=$ok;verified=$ok;evidence=@{window=$w;foreground=([HubMind.Interop.JessWin32]::GetForegroundWindow().ToInt64())}}}
 {$_ -in 'close_window','minimize_window','maximize_window','restore_window','move_window','resize_window','snap_window'} {$w=Find-Window $a;if(!$w){throw 'Window not found'};$h=[IntPtr]$w.handle;switch($q.method){'close_window'{[void][HubMind.Interop.JessWin32]::PostMessage($h,0x0010,[IntPtr]::Zero,[IntPtr]::Zero);Start-Sleep -Milliseconds 300;$exists=[HubMind.Interop.JessWin32]::IsWindow($h);return @{ok=(-not $exists);verified=(-not $exists);evidence=@{window=$w;windowHandleStillExists=$exists}}}'minimize_window'{[void][HubMind.Interop.JessWin32]::ShowWindowAsync($h,6)}'maximize_window'{[void][HubMind.Interop.JessWin32]::ShowWindowAsync($h,3)}'restore_window'{[void][HubMind.Interop.JessWin32]::ShowWindowAsync($h,9)}default{$r=$w.bounds;$x=[int]$r.x;$y=[int]$r.y;$ww=[int]$r.width;$hh=[int]$r.height;if($q.method -eq 'move_window'){$x=[int]$a.x;$y=[int]$a.y};if($q.method -eq 'resize_window'){$ww=[Math]::Max(200,[int]$a.width);$hh=[Math]::Max(150,[int]$a.height)};if($q.method -eq 'snap_window'){$monitor=$null;if($a.monitorId){$monitor=[System.Windows.Forms.Screen]::AllScreens|Where-Object{$_.DeviceName -eq [string]$a.monitorId}|Select-Object -First 1;if(!$monitor){throw 'Requested monitor was not found'}}else{$monitor=[System.Windows.Forms.Screen]::FromHandle($h)};$area=$monitor.WorkingArea;switch([string]$a.position){'left'{$x=$area.X;$y=$area.Y;$ww=[int]($area.Width/2);$hh=$area.Height}'left-third'{$x=$area.X;$y=$area.Y;$ww=[int]($area.Width/3);$hh=$area.Height}'center-third'{$x=$area.X+[int]($area.Width/3);$y=$area.Y;$ww=[int]($area.Width/3);$hh=$area.Height}'right-third'{$x=$area.X+2*[int]($area.Width/3);$y=$area.Y;$ww=$area.Width-2*[int]($area.Width/3);$hh=$area.Height}'right'{$x=$area.X+[int]($area.Width/2);$y=$area.Y;$ww=[int]($area.Width/2);$hh=$area.Height}'top-right'{$x=$area.X+[int]($area.Width/2);$y=$area.Y;$ww=[int]($area.Width/2);$hh=[int]($area.Height/2)}'top-left'{$x=$area.X;$y=$area.Y;$ww=[int]($area.Width/2);$hh=[int]($area.Height/2)}'bottom-right'{$x=$area.X+[int]($area.Width/2);$y=$area.Y+[int]($area.Height/2);$ww=[int]($area.Width/2);$hh=[int]($area.Height/2)}'bottom-left'{$x=$area.X;$y=$area.Y+[int]($area.Height/2);$ww=[int]($area.Width/2);$hh=[int]($area.Height/2)}default{throw 'Unsupported snap position'}}};[void][HubMind.Interop.JessWin32]::ShowWindowAsync($h,9);if(-not [HubMind.Interop.JessWin32]::MoveWindow($h,$x,$y,$ww,$hh,$true)){throw 'MoveWindow failed'}}};Start-Sleep -Milliseconds 180;$after=Find-Window @{handle=$w.handle};$verified=$false;if($after){switch($q.method){'minimize_window'{$verified=$after.state -eq 'minimized'}'maximize_window'{$verified=$after.state -eq 'maximized'}'restore_window'{$verified=$after.state -ne 'minimized'}'move_window'{$verified=([Math]::Abs([int]$after.bounds.x-[int]$a.x) -le 4 -and [Math]::Abs([int]$after.bounds.y-[int]$a.y) -le 4)}'resize_window'{$verified=([Math]::Abs([int]$after.bounds.width-[int]$a.width) -le 12 -and [Math]::Abs([int]$after.bounds.height-[int]$a.height) -le 12)}'snap_window'{$verified=([Math]::Abs([int]$after.bounds.width-[int]$ww) -le 12 -and [Math]::Abs([int]$after.bounds.height-[int]$hh) -le 12)}}};return @{ok=$verified;verified=$verified;evidence=@{before=$w;after=$after;expected=@{x=$x;y=$y;width=$ww;height=$hh}}}}
  'mouse_move' {if(-not [HubMind.Interop.JessWin32]::SetCursorPos([int]$a.x,[int]$a.y)){throw ('SetCursorPos failed. Win32 error: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())};return @{ok=$true;verified=$true;evidence=@{x=$a.x;y=$a.y;note='Cursor position requested'}}}
  {$_ -in 'click','double_click','right_click'} {if(-not [HubMind.Interop.JessWin32]::SetCursorPos([int]$a.x,[int]$a.y)){throw ('SetCursorPos failed. Win32 error: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())};$down=[uint]2;$up=[uint]4;if($q.method -eq 'right_click'){$down=[uint]8;$up=[uint]16};$count=1;if($q.method -eq 'double_click'){$count=2};1..$count|ForEach-Object{if(-not [HubMind.Interop.JessWin32]::SendMouseEvent($down,[uint]0)){throw 'SendInput rejected the mouse-button down event'};if(-not [HubMind.Interop.JessWin32]::SendMouseEvent($up,[uint]0)){throw 'SendInput rejected the mouse-button up event'};Start-Sleep -Milliseconds 70};return @{ok=$true;verified=$false;evidence=@{x=$a.x;y=$a.y;note='Mouse events sent through SendInput; UI effect not independently confirmed'}}}
  'cursor_position' {$p=New-Object HubMind.Interop.JessWin32+POINT;if(-not [HubMind.Interop.JessWin32]::GetCursorPos([ref]$p)){throw ('GetCursorPos failed. Win32 error: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())};return @{ok=$true;verified=$true;evidence=@{x=$p.X;y=$p.Y}}}
  'scroll' {$delta=[int]$a.delta;$wheelData=[BitConverter]::ToUInt32([BitConverter]::GetBytes($delta),0);if(-not [HubMind.Interop.JessWin32]::SetCursorPos([int]$a.x,[int]$a.y)){throw ('SetCursorPos failed. Win32 error: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())};if(-not [HubMind.Interop.JessWin32]::SendMouseEvent([uint]0x0800,$wheelData)){throw 'SendInput rejected the vertical scroll event'};if($null -ne $a.horizontalDelta -and [int]$a.horizontalDelta -ne 0){$horizontal=[BitConverter]::ToUInt32([BitConverter]::GetBytes([int]$a.horizontalDelta),0);if(-not [HubMind.Interop.JessWin32]::SendMouseEvent([uint]0x1000,$horizontal)){throw 'SendInput rejected the horizontal scroll event'}};return @{ok=$true;verified=$false;evidence=@{x=$a.x;y=$a.y;delta=$delta;horizontalDelta=[int]$a.horizontalDelta}}}
  'drag' {if(-not [HubMind.Interop.JessWin32]::SetCursorPos([int]$a.fromX,[int]$a.fromY)){throw ('SetCursorPos failed at drag origin. Win32 error: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())};if(-not [HubMind.Interop.JessWin32]::SendMouseEvent([uint]2,[uint]0)){throw 'SendInput rejected the drag-start event'};$steps=12;try{for($i=1;$i -le $steps;$i++){$x=[int]($a.fromX+($a.toX-$a.fromX)*$i/$steps);$y=[int]($a.fromY+($a.toY-$a.fromY)*$i/$steps);if(-not [HubMind.Interop.JessWin32]::SetCursorPos($x,$y)){throw ('SetCursorPos failed during drag. Win32 error: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())};Start-Sleep -Milliseconds 12}}finally{if(-not [HubMind.Interop.JessWin32]::SendMouseEvent([uint]4,[uint]0)){throw 'SendInput rejected the drag-end event'}};return @{ok=$true;verified=$false;evidence=@{from=@{x=$a.fromX;y=$a.fromY};to=@{x=$a.toX;y=$a.toY};note='Drag input sent through SendInput; target effect not independently confirmed'}}}
 'type_text' {$text=[string]$a.text;if($text.Length -gt 10000){throw 'Text limited to 10,000 characters'};foreach($ch in $text.ToCharArray()){$i=New-Object HubMind.Interop.JessWin32+INPUT;$i.type=1;$i.U.ki.scan=[uint16][char]$ch;$i.U.ki.flags=4;$up=$i;$up.U.ki.flags=6;$arr=@($i,$up);[void][HubMind.Interop.JessWin32]::SendInput(2,$arr,[Runtime.InteropServices.Marshal]::SizeOf([type][HubMind.Interop.JessWin32+INPUT]))};return @{ok=$true;verified=$false;evidence=@{characters=$text.Length;note='Unicode input sent; field content not independently verified'}}}
 'press_keys' {$hold=45;if($null -ne $a.holdMs){$hold=[int]$a.holdMs};Send-Key ([string]$a.keys) $hold;return @{ok=$true;verified=$false;evidence=@{keys=$a.keys;holdMs=$hold;note='C# SendInput accepted the key down/up sequence; target effect requires a screen or UI readback'}}}
  'media_key' {
   $action=[string]$a.action
   if($action -in @('brightness_up','brightness_down')){
    $monitor=@(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue|Select-Object -First 1)
    $method=@(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue|Select-Object -First 1)
    if(!$monitor -or !$method){throw 'Windows does not expose a controllable WMI brightness interface for this display.'}
    $current=[int]$monitor[0].CurrentBrightness
    $target=[Math]::Max(0,[Math]::Min(100,($current + $(if($action -eq 'brightness_up'){10}else{-10}))))
    $change=Invoke-CimMethod -InputObject $method[0] -MethodName WmiSetBrightness -Arguments @{Timeout=[uint32]1;Brightness=[byte]$target} -ErrorAction Stop
    if([int]$change.ReturnValue -ne 0){throw ('WmiSetBrightness failed with return code '+$change.ReturnValue)}
    Start-Sleep -Milliseconds 300
    $after=@(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction SilentlyContinue|Select-Object -First 1)
    $actual=$null;if($after.Count -gt 0){$actual=[int]$after[0].CurrentBrightness}
    $verified=($null -ne $actual -and $actual -eq $target)
    return @{ok=$true;verified=$verified;evidence=@{action=$action;before=$current;requested=$target;actual=$actual;interface='WMI WmiMonitorBrightnessMethods';note='Brightness change request accepted; verification depends on display-driver readback.'}}
   }
   $map=@{volume_up=175;volume_down=174;volume_mute=173}
   if(!$map.ContainsKey($action)){throw 'Unsupported media action'}
   $vk=[uint16]$map[$action]
   $down=New-Object HubMind.Interop.JessWin32+INPUT;$down.type=1;$down.U.ki.vk=$vk
   $up=New-Object HubMind.Interop.JessWin32+INPUT;$up.type=1;$up.U.ki.vk=$vk;$up.U.ki.flags=[HubMind.Interop.JessWin32]::KEYUP
   $arr=@($down,$up)
   $sent=[HubMind.Interop.JessWin32]::SendInput(2,$arr,[Runtime.InteropServices.Marshal]::SizeOf([type][HubMind.Interop.JessWin32+INPUT]))
   if($sent -ne 2){throw ('Windows SendInput accepted '+$sent+' of 2 media-key events')}
   return @{ok=$true;verified=$false;evidence=@{action=$action;virtualKey=$vk;note='Windows media key events submitted; the actual system volume should be read back to verify.'}}
  }
  'find_ui_element' {
    $name=[string]$a.name
    if(!$name -or $name.Length -gt 200){throw 'A UI element name under 200 characters is required'}
    $foreground=[HubMind.Interop.JessWin32]::GetForegroundWindow()
    if($foreground -eq [IntPtr]::Zero){throw 'No foreground window is available'}
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($foreground)
    $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsControlElementProperty,$true)
    $all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)
    $exact=@();$partial=@()
    for($i=0;$i -lt [Math]::Min($all.Count,3000);$i++){
      try{$e=$all.Item($i);$c=$e.Current;if(!$c.IsOffscreen -and $c.IsEnabled -and $c.Name){$r=$c.BoundingRectangle;if($r.Width -gt 0 -and $r.Height -gt 0){$item=@{name=$c.Name;automationId=$c.AutomationId;controlType=$c.ControlType.ProgrammaticName;bounds=@{x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height};isEnabled=$c.IsEnabled};if([string]::Equals($c.Name,$name,[StringComparison]::OrdinalIgnoreCase)){$exact+=@($item)}elseif($c.Name.IndexOf($name,[StringComparison]::OrdinalIgnoreCase)-ge 0){$partial+=@($item)}}}}catch{}
    }
    $resolvedMatches=if($exact.Count -gt 0){$exact}else{$partial}
    if($resolvedMatches.Count -eq 0){return @{ok=$false;verified=$false;error=('No visible accessible UI element matched "'+$name+'"');evidence=@{windowTitle=$root.Current.Name;query=$name;source='Microsoft UI Automation'}}}
    return @{ok=$true;verified=$true;evidence=@{windowTitle=$root.Current.Name;query=$name;matches=@($resolvedMatches|Select-Object -First 25);count=$resolvedMatches.Count;source='Microsoft UI Automation';note='If multiple controls match, use a unique visible name or the numbered list before activating a control.'}}
  }
  'set_ui_value' {
    $name=[string]$a.name;$value=[string]$a.value
    if(!$name -or $name.Length -gt 200){throw 'A UI element name under 200 characters is required'}
    if($value.Length -gt 10000){throw 'UI value is limited to 10,000 characters'}
    $foreground=[HubMind.Interop.JessWin32]::GetForegroundWindow()
    if($foreground -eq [IntPtr]::Zero){throw 'No foreground window is available'}
    $root=[System.Windows.Automation.AutomationElement]::FromHandle($foreground)
    $cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsControlElementProperty,$true)
    $all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond)
    $exact=@();$partial=@()
    for($i=0;$i -lt [Math]::Min($all.Count,3000);$i++){
      try{$e=$all.Item($i);$c=$e.Current;if(!$c.IsOffscreen -and $c.IsEnabled -and $c.Name){if([string]::Equals($c.Name,$name,[StringComparison]::OrdinalIgnoreCase)){$exact+=@($e)}elseif($c.Name.IndexOf($name,[StringComparison]::OrdinalIgnoreCase)-ge 0){$partial+=@($e)}}}catch{}
    }
    $resolvedMatches=if($exact.Count -gt 0){$exact}else{$partial}
    if($resolvedMatches.Count -eq 0){throw ('No visible accessible UI element matched "'+$name+'"')}
    if($resolvedMatches.Count -ne 1){throw ('UI element name is ambiguous ('+$resolvedMatches.Count+' matches). Use a more specific name or the numbered UI list.')}
    $target=$resolvedMatches[0]
    $pattern=$target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if($pattern.Current.IsReadOnly){throw ('The UI element is read-only: '+$target.Current.Name)}
    $pattern.SetValue($value)
    Start-Sleep -Milliseconds 100
    $actual=$target.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
    return @{ok=($actual -ceq $value);verified=($actual -ceq $value);evidence=@{name=$target.Current.Name;automationId=$target.Current.AutomationId;value=$actual;action='ValuePattern.SetValue';source='Microsoft UI Automation'}}
  }
  'list_ui_elements' {$foreground=[HubMind.Interop.JessWin32]::GetForegroundWindow();if($foreground -eq [IntPtr]::Zero){throw 'No foreground window is available'};$root=[System.Windows.Automation.AutomationElement]::FromHandle($foreground);$windowTitle=[string]$root.Current.Name;$cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsControlElementProperty,$true);$all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond);$items=@();for($i=0;$i -lt [Math]::Min($all.Count,3000);$i++){try{$e=$all.Item($i);$c=$e.Current;if(!$c.IsOffscreen -and $c.IsEnabled -and $c.Name){$r=$c.BoundingRectangle;if($r.Width -gt 0 -and $r.Height -gt 0){$items+=@{index=($items.Count+1);name=$c.Name;automationId=$c.AutomationId;controlType=$c.ControlType.ProgrammaticName;bounds=@{x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height};isEnabled=$c.IsEnabled};if($items.Count -ge 50){break}}}}catch{}};return @{ok=($items.Count -gt 0);verified=($items.Count -gt 0);evidence=@{windowTitle=$windowTitle;elements=$items;count=$items.Count;source='Windows UI Automation';note='Indices are temporary. Pass the expectedName when invoking a numbered element.'}}}
  'invoke_ui_element' {$name=[string]$a.name;$index=0;if($null -ne $a.index){$index=[int]$a.index;if($index -lt 1 -or $index -gt 50){throw 'Element index must be between 1 and 50'}};$expectedName=[string]$a.expectedName;if($index -gt 0 -and !$expectedName){throw 'A numbered UI element must include expectedName to prevent stale-target activation'};$foreground=[HubMind.Interop.JessWin32]::GetForegroundWindow();if($foreground -eq [IntPtr]::Zero){throw 'No foreground window is available'};$root=[System.Windows.Automation.AutomationElement]::FromHandle($foreground);$cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsControlElementProperty,$true);$all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond);$target=$null;if($index -gt 0){$visible=@();for($i=0;$i -lt [Math]::Min($all.Count,3000);$i++){try{$e=$all.Item($i);$c=$e.Current;if(!$c.IsOffscreen -and $c.IsEnabled -and $c.Name){$r=$c.BoundingRectangle;if($r.Width -gt 0 -and $r.Height -gt 0){$visible+=@{element=$e;name=$c.Name};if($visible.Count -ge 50){break}}}}catch{}};if($index -gt $visible.Count){throw 'Numbered UI target is no longer available; list UI elements again'};$target=$visible[$index-1].element;if($target.Current.Name -cne $expectedName){throw 'Numbered UI target changed; list UI elements again before invoking'}}else{if(!$name){throw 'Element name or a numbered index with expectedName is required'};for($i=0;$i -lt [Math]::Min($all.Count,3000);$i++){try{$e=$all.Item($i);if(!$e.Current.IsOffscreen -and $e.Current.IsEnabled -and ($e.Current.Name -ceq $name -or $e.Current.Name -like ('*'+$name+'*'))){$target=$e;break}}catch{}}};if(!$target){throw ('No accessible UI element found matching '+$name)};try{$pattern=$target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern);$pattern.Invoke();Start-Sleep -Milliseconds 150;return @{ok=$true;verified=$false;evidence=@{name=$target.Current.Name;automationId=$target.Current.AutomationId;index=$(if($index -gt 0){$index}else{$null});action='InvokePattern';note='InvokePattern called; verify resulting UI state with a follow-up screen read'}}}catch{try{$pattern=$target.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern);$pattern.Select();Start-Sleep -Milliseconds 150;return @{ok=$true;verified=$false;evidence=@{name=$target.Current.Name;automationId=$target.Current.AutomationId;index=$(if($index -gt 0){$index}else{$null});action='SelectionItemPattern';note='Selection requested; verify resulting UI state'}}}catch{try{$pattern=$target.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern);$pattern.Toggle();Start-Sleep -Milliseconds 150;return @{ok=$true;verified=$false;evidence=@{name=$target.Current.Name;automationId=$target.Current.AutomationId;index=$(if($index -gt 0){$index}else{$null});action='TogglePattern';note='Toggle requested; verify resulting UI state'}}}catch{try{$pattern=$target.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern);$state=$pattern.Current.ExpandCollapseState;if($state -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed -or $state -eq [System.Windows.Automation.ExpandCollapseState]::PartiallyExpanded){$pattern.Expand();$action='ExpandCollapsePattern.Expand'}else{$pattern.Collapse();$action='ExpandCollapsePattern.Collapse'};Start-Sleep -Milliseconds 150;return @{ok=$true;verified=$false;evidence=@{name=$target.Current.Name;automationId=$target.Current.AutomationId;index=$(if($index -gt 0){$index}else{$null});action=$action;note='Expand/collapse requested; verify resulting UI state'}}}catch{throw ('Element does not support Invoke, SelectionItem, Toggle or ExpandCollapse patterns: '+$target.Current.Name)}}}}}
 'read_screen_text' {$root=[System.Windows.Automation.AutomationElement]::RootElement;$cond=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsControlElementProperty,$true);$all=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$cond);$lines=New-Object System.Collections.Generic.List[string];for($i=0;$i -lt [Math]::Min($all.Count,2500);$i++){try{$name=$all.Item($i).Current.Name;if($name){$lines.Add($name)}}catch{}};$text=$lines -join [Environment]::NewLine;return @{ok=$true;verified=($text.Length -gt 0);evidence=@{text=$text.Substring(0,[Math]::Min(20000,$text.Length));source='Windows UI Automation';elements=$lines.Count}}}
 'screenshot' {
  Add-Type -AssemblyName System.Windows.Forms
  $requestedMonitor = [string]$a.monitorName
  if (!$requestedMonitor) { $requestedMonitor = 'primary' }
  $detail = [string]$a.detail
  if (!$detail) { $detail = 'standard' }
  if ($detail -notin @('standard','high')) { throw 'Screenshot detail must be standard or high.' }
  $screens = @([System.Windows.Forms.Screen]::AllScreens)
  if ($requestedMonitor -eq 'all') {
    if ($detail -eq 'high') { throw 'High-detail capture must target one monitor by name to keep the native bridge response bounded.' }
    if ($screens.Count -gt 4) { throw 'All-monitor capture is limited to four monitors; request one monitor by name for additional displays.' }
    $selectedScreens = $screens
  } elseif ($requestedMonitor -eq 'primary') {
    $selectedScreens = @($screens | Where-Object { $_.Primary } | Select-Object -First 1)
  } else {
    $selectedScreens = @($screens | Where-Object { [string]::Equals($_.DeviceName,$requestedMonitor,[StringComparison]::OrdinalIgnoreCase) })
    if ($selectedScreens.Count -ne 1) { throw ('Monitor "' + $requestedMonitor + '" was not found. Use list_windows to inspect monitor names or request the primary monitor.') }
  }
  if ($selectedScreens.Count -eq 0) { throw 'No display monitor is available for screenshot capture.' }
  $quality = if ($detail -eq 'high') { 92 } else { 82 }
  $maxDimension = if ($detail -eq 'high') { 3200 } else { 1920 }
  $result = @()
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
  if (!$jpegCodec) { throw 'The Windows JPEG encoder is unavailable.' }
  foreach ($s in $selectedScreens) {
    $bounds = $s.Bounds
    $sourceBitmap = $null; $outputBitmap = $null; $graphics = $null; $memory = $null; $encoderParams = $null; $encoderParam = $null
    try {
      $sourceBitmap = New-Object System.Drawing.Bitmap($bounds.Width,$bounds.Height)
      $captureGraphics = [System.Drawing.Graphics]::FromImage($sourceBitmap)
      try { $captureGraphics.CopyFromScreen($bounds.X,$bounds.Y,0,0,$sourceBitmap.Size) } finally { $captureGraphics.Dispose() }
      $scale = [Math]::Min(1.0, [double]$maxDimension / [Math]::Max($bounds.Width,$bounds.Height))
      $imageWidth = [Math]::Max(1,[int][Math]::Round($bounds.Width * $scale))
      $imageHeight = [Math]::Max(1,[int][Math]::Round($bounds.Height * $scale))
      $outputBitmap = New-Object System.Drawing.Bitmap($imageWidth,$imageHeight)
      $graphics = [System.Drawing.Graphics]::FromImage($outputBitmap)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($sourceBitmap,0,0,$imageWidth,$imageHeight)
      $memory = New-Object System.IO.MemoryStream
      $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $encoderParam = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality,[long]$quality)
      $encoderParams.Param[0] = $encoderParam
      $outputBitmap.Save($memory,$jpegCodec,$encoderParams)
      if ($detail -eq 'high' -and $memory.Length -gt 8MB) { throw 'Screenshot exceeded the 8 MB image limit. Retry with standard detail or a lower-resolution display.' }
      if ($detail -eq 'standard' -and $memory.Length -gt 2MB) { throw 'Standard screenshot exceeded the 2 MB per-monitor image limit. Request high detail for one monitor or use OCR/UI Automation.' }
      $result += @{
        monitor=$s.DeviceName
        bounds=@{x=$bounds.X;y=$bounds.Y;width=$bounds.Width;height=$bounds.Height}
        primary=$s.Primary
        detail=$detail
        jpegQuality=$quality
        width=$imageWidth
        height=$imageHeight
        originalWidth=$bounds.Width
        originalHeight=$bounds.Height
        imageBase64=[Convert]::ToBase64String($memory.ToArray())
      }
    } finally {
      if ($encoderParam) { $encoderParam.Dispose() }
      if ($encoderParams) { $encoderParams.Dispose() }
      if ($memory) { $memory.Dispose() }
      if ($graphics) { $graphics.Dispose() }
      if ($outputBitmap) { $outputBitmap.Dispose() }
      if ($sourceBitmap) { $sourceBitmap.Dispose() }
    }
  }
  return @{ok=$true;verified=($result.Count -gt 0);evidence=@{monitors=$result;detail=$detail;captureMode='bounded-high-fidelity';note='High detail captures one named monitor at up to 3200 pixels on its longest edge. Standard captures are capped at 1920 pixels and may include all monitors.'}}
}
 'get_time' {return @{ok=$true;verified=$true;evidence=@{localTime=(Get-Date).ToString('o');timeZone=[TimeZoneInfo]::Local.Id}}}
 'system_info' {return @{ok=$true;verified=$true;evidence=@{computer=$env:COMPUTERNAME;user=$env:USERNAME;os=[Environment]::OSVersion.VersionString;architecture=$env:PROCESSOR_ARCHITECTURE}}}
 'launch_app' {
   $name=[string]$a.name
   if(!$name -or $name.Length -gt 160 -or $name -match '[\r\n;&|<>]'){throw 'Invalid application name or URI'}
   if($name -match '^(https?|mailto|ms-settings|ms-windows-store|msteams|zoommtg|spotify):'){
    Start-Process -FilePath $name -ErrorAction Stop;Start-Sleep -Milliseconds 600
    return @{ok=$true;verified=$false;evidence=@{uri=$name;scheme=($name -split ':',2)[0];note='URI handler invoked; verify the opened app or page with list_windows or a screenshot'}}
   }
   $apps=@(Get-StartApps -ErrorAction SilentlyContinue)
   $app=$apps|Where-Object{[string]::Equals($_.Name,$name,[StringComparison]::OrdinalIgnoreCase)-or[string]::Equals($_.AppID,$name,[StringComparison]::OrdinalIgnoreCase)}|Select-Object -First 1
   if(!$app){
    $resolvedMatches=@($apps|Where-Object{$_.Name.IndexOf($name,[StringComparison]::OrdinalIgnoreCase)-ge 0-or$_.AppID.IndexOf($name,[StringComparison]::OrdinalIgnoreCase)-ge 0})
    if($resolvedMatches.Count -eq 1){$app=$resolvedMatches[0]}elseif($resolvedMatches.Count -gt 1){throw ('Application name is ambiguous. Use an exact Start Menu name or AppUserModelID. Candidates: '+(($resolvedMatches|Select-Object -First 8|ForEach-Object{$_.Name+' ['+$_.AppID+']'}) -join '; '))}
   }
   if($app){
    $before=@(Get-Windows|ForEach-Object{[string]$_.handle})
    Start-Process -FilePath 'explorer.exe' -ArgumentList @('shell:AppsFolder\'+$app.AppID) -ErrorAction Stop
    Start-Sleep -Milliseconds 1000
    $w=Get-Windows|Where-Object{$_.title.IndexOf([string]$app.Name,[StringComparison]::OrdinalIgnoreCase)-ge 0}|Select-Object -First 1
    return @{ok=$true;verified=($null -ne $w);evidence=@{resolver='StartMenu/AppUserModelID';app=$app;window=$w;beforeWindowCount=$before.Count}}
   }
   $leaf=$name;if(!$leaf.EndsWith('.exe',[StringComparison]::OrdinalIgnoreCase)){$leaf=$leaf+'.exe'}
   $appPath=$null
   foreach($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths','HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths')){
    foreach($candidate in @($name,$leaf)){
     try{$key=Get-ItemProperty -LiteralPath (Join-Path $root $candidate) -ErrorAction Stop;$raw=[string]$key.'(default)';if($raw -match '^\"([^\"]+)\"'){$raw=$resolvedMatches[1]}else{$raw=$raw.Trim()};if($raw -and (Test-Path -LiteralPath $raw -PathType Leaf)){$appPath=$raw;break}}catch{}
    }
    if($appPath){break}
   }
   if(!$appPath){$cmd=Get-Command -Name $name -CommandType Application -ErrorAction SilentlyContinue|Select-Object -First 1;if($cmd){$appPath=$cmd.Source}}
   if(!$appPath){throw ('Could not resolve installed app, App Paths entry, PATH executable or supported URI scheme: '+$name)}
   $proc=Start-Process -FilePath $appPath -PassThru -ErrorAction Stop
   Start-Sleep -Milliseconds 900
   $w=Get-Windows|Where-Object{$_.pid -eq $proc.Id -or $_.process -eq [System.IO.Path]::GetFileNameWithoutExtension($appPath)}|Select-Object -First 1
   return @{ok=$true;verified=($null -ne $w);evidence=@{resolver=$(if($appPath){'App Paths/PATH'}else{'unknown'});path=$appPath;processId=$proc.Id;window=$w}}
  }
 'open_path' {$target=[string]$a.path;if(!$target -or $target.Length -gt 2048 -or $target.Contains([char]0)){throw 'Invalid file path'};$resolved=[System.IO.Path]::GetFullPath($target);if(!(Test-Path -LiteralPath $resolved)){throw 'File or folder does not exist'};$leaf=[System.IO.Path]::GetFileName($resolved);$before=@(Get-Windows|ForEach-Object{[string]$_.handle});Start-Process -FilePath $resolved;Start-Sleep -Milliseconds 700;$after=Get-Windows;$new=$after|Where-Object{($before -notcontains [string]$_.handle) -or ($leaf -and $_.title -like ('*'+$leaf+'*'))}|Select-Object -First 1;if($new){[void][HubMind.Interop.JessWin32]::ShowWindowAsync([IntPtr]$new.handle,9);[void][HubMind.Interop.JessWin32]::SetForegroundWindow([IntPtr]$new.handle);Start-Sleep -Milliseconds 120};$verified=($null -ne $new -and [HubMind.Interop.JessWin32]::GetForegroundWindow().ToInt64() -eq [int64]$new.handle);return @{ok=($null -ne $new);verified=$verified;evidence=@{path=$resolved;window=$new;note='Default Windows handler was invoked; visibility verification depends on a matching window'}}}
 'system_power_action' {
   $action=[string]$a.action
   switch($action){
    'lock' {$proc=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\rundll32.exe') -ArgumentList 'user32.dll,LockWorkStation' -PassThru -ErrorAction Stop;Start-Sleep -Milliseconds 250;return @{ok=$true;verified=$false;evidence=@{action='lock';processId=$proc.Id;note='Windows lock request was launched; lock state must be verified on the device'}}}
    'shutdown' {$proc=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\shutdown.exe') -ArgumentList '/s /t 15 /c "Jess confirmed shutdown; cancel with shutdown /a"' -PassThru -ErrorAction Stop;Start-Sleep -Milliseconds 250;return @{ok=$true;verified=$false;evidence=@{action='shutdown';scheduledDelaySeconds=15;cancelCommand='shutdown /a';processId=$proc.Id;note='Shutdown was scheduled for 15 seconds from now, not verified as completed'}}}
    'restart' {$proc=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\shutdown.exe') -ArgumentList '/r /t 15 /c "Jess confirmed restart; cancel with shutdown /a"' -PassThru -ErrorAction Stop;Start-Sleep -Milliseconds 250;return @{ok=$true;verified=$false;evidence=@{action='restart';scheduledDelaySeconds=15;cancelCommand='shutdown /a';processId=$proc.Id;note='Restart was scheduled for 15 seconds from now, not verified as completed'}}}
    'cancel_shutdown' {$proc=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\shutdown.exe') -ArgumentList '/a' -PassThru -ErrorAction Stop;Start-Sleep -Milliseconds 250;$exit=$proc.ExitCode;return @{ok=($exit -eq 0);verified=($exit -eq 0);evidence=@{action='cancel_shutdown';exitCode=$exit;note='Windows cancellation command returned; it may report failure if no shutdown/restart was pending'}}}
    default {throw 'Unsupported Windows power action'}
   }
  }
 'clipboard_action' {
   Add-Type -AssemblyName System.Windows.Forms
   $action=[string]$a.action;$text=[string]$a.text
   switch($action){
    'read' {$value='';if([System.Windows.Forms.Clipboard]::ContainsText()){ $value=[System.Windows.Forms.Clipboard]::GetText() };if($value.Length -gt 100000){$value=$value.Substring(0,100000)};return @{ok=$true;verified=$true;evidence=@{text=$value;characterCount=$value.Length;truncated=($value.Length -ge 100000)}}}
    'write' {if($text.Length -gt 100000){throw 'Clipboard text exceeds the 100,000-character limit'};[System.Windows.Forms.Clipboard]::SetText($text);$readback=[System.Windows.Forms.Clipboard]::GetText();$same=$readback -ceq $text;return @{ok=$same;verified=$same;evidence=@{characterCount=$text.Length;readbackMatches=$same}}}
    'clear' {[System.Windows.Forms.Clipboard]::Clear();$empty=-not [System.Windows.Forms.Clipboard]::ContainsText();return @{ok=$empty;verified=$empty;evidence=@{clipboardTextCleared=$empty}}}
    'paste' {Send-Key 'CTRL+V';Start-Sleep -Milliseconds 100;return @{ok=$true;verified=$false;evidence=@{action='paste';note='Ctrl+V sent to the focused application; target insertion requires readback'}}}
    default {throw 'Unsupported clipboard action'}
   }
  }
 'filesystem_scan' { return (Get-JessFilesystemScan $a) }
 'filesystem_clean' { return (Invoke-JessFilesystemClean $a) }
 'file_action' {
   $action=[string]$a.action;$target=[string]$a.path;$destination=[string]$a.destination;$content=[string]$a.content;$pattern=[string]$a.pattern
   if(!$target -or $target.Length -gt 2048 -or $target.Contains([char]0)){throw 'A valid local path is required'}
   $resolved=[System.IO.Path]::GetFullPath($target)
   switch($action){
    'list' {if(!(Test-Path -LiteralPath $resolved -PathType Container)){throw 'List requires an existing folder'};$items=@(Get-ChildItem -LiteralPath $resolved -Force -ErrorAction Stop|Select-Object -First 300|ForEach-Object{@{name=$_.Name;path=$_.FullName;type=$(if($_.PSIsContainer){'directory'}else{'file'});length=$(if($_.PSIsContainer){$null}else{$_.Length});lastWriteTime=$_.LastWriteTimeUtc.ToString('o')}});return @{ok=$true;verified=$true;evidence=@{path=$resolved;items=$items;truncated=($items.Count -ge 300)}}}
    'read' {if(!(Test-Path -LiteralPath $resolved -PathType Leaf)){throw 'Read requires an existing file'};$info=Get-Item -LiteralPath $resolved;if($info.Length -gt 1048576){throw 'File exceeds the 1 MiB read limit'};$text=[System.IO.File]::ReadAllText($resolved,[System.Text.Encoding]::UTF8);$offset=0;if($null -ne $a.offset){$offset=[int]$a.offset};$offset=[Math]::Max(0,[Math]::Min($text.Length,$offset));$limit=100000;if($null -ne $a.limit){$limit=[Math]::Max(1000,[Math]::Min(100000,[int]$a.limit))};$count=[Math]::Min($limit,$text.Length-$offset);$chunk=$text.Substring($offset,$count);$next=$offset+$count;return @{ok=$true;verified=$true;evidence=@{path=$resolved;content=$chunk;bytes=$info.Length;encoding='UTF-8';offset=$offset;nextOffset=$next;characterCount=$text.Length;truncated=($next -lt $text.Length)}}}
    'write' {if($content.Length -gt 500000){throw 'File content exceeds the 500,000-character write limit'};$parent=[System.IO.Path]::GetDirectoryName($resolved);if(!(Test-Path -LiteralPath $parent -PathType Container)){throw 'Parent folder does not exist'};[System.IO.File]::WriteAllText($resolved,$content,[System.Text.UTF8Encoding]::new($false));$info=Get-Item -LiteralPath $resolved;$same=[System.IO.File]::ReadAllText($resolved,[System.Text.Encoding]::UTF8) -ceq $content;return @{ok=$same;verified=$same;evidence=@{path=$resolved;bytes=$info.Length;contentMatches=$same}}}
    'copy' {if(!(Test-Path -LiteralPath $resolved -PathType Leaf)){throw 'Copy source must be an existing file'};if(!$destination -or $destination.Length -gt 2048){throw 'Copy requires a destination path'};$dest=[System.IO.Path]::GetFullPath($destination);if(Test-Path -LiteralPath $dest){throw 'Destination already exists; refusing to overwrite'};Copy-Item -LiteralPath $resolved -Destination $dest -ErrorAction Stop;$ok=(Test-Path -LiteralPath $dest -PathType Leaf) -and ((Get-JessSha256 $resolved) -ceq (Get-JessSha256 $dest));return @{ok=$ok;verified=$ok;evidence=@{source=$resolved;destination=$dest;hashVerified=$ok}}}
    'move' {if(!(Test-Path -LiteralPath $resolved)){throw 'Move source does not exist'};if(!$destination -or $destination.Length -gt 2048){throw 'Move requires a destination path'};$dest=[System.IO.Path]::GetFullPath($destination);if(Test-Path -LiteralPath $dest){throw 'Destination already exists; refusing to overwrite'};Move-Item -LiteralPath $resolved -Destination $dest -ErrorAction Stop;$ok=(Test-Path -LiteralPath $dest) -and !(Test-Path -LiteralPath $resolved);return @{ok=$ok;verified=$ok;evidence=@{source=$resolved;destination=$dest;sourceRemains=(Test-Path -LiteralPath $resolved)}}}
    'rename' {if(!(Test-Path -LiteralPath $resolved)){throw 'Rename source does not exist'};if(!$destination -or $destination.Length -gt 255 -or $destination -match '[\\/:*?"<>|]'){throw 'Provide a simple new filename, not a path'};$parent=[System.IO.Path]::GetDirectoryName($resolved);$dest=Join-Path $parent $destination;if(Test-Path -LiteralPath $dest){throw 'A file with that name already exists'};Rename-Item -LiteralPath $resolved -NewName $destination -ErrorAction Stop;$ok=Test-Path -LiteralPath $dest;return @{ok=$ok;verified=$ok;evidence=@{source=$resolved;destination=$dest}}}
    'search' {if(!(Test-Path -LiteralPath $resolved -PathType Container)){throw 'Search root must be an existing folder'};if(!$pattern -or $pattern.Length -gt 120 -or $pattern -match '[\\/:]'){throw 'Search requires a filename pattern such as *.pdf'};$items=@(Get-ChildItem -LiteralPath $resolved -Filter $pattern -File -Recurse -ErrorAction SilentlyContinue|Select-Object -First 100|ForEach-Object{@{name=$_.Name;path=$_.FullName;length=$_.Length;lastWriteTime=$_.LastWriteTimeUtc.ToString('o')}});return @{ok=$true;verified=$true;evidence=@{root=$resolved;pattern=$pattern;items=$items;limit=100;truncated=($items.Count -ge 100)}}}
    'recycle' {if(!(Test-Path -LiteralPath $resolved -PathType Leaf)){throw 'Recycle action currently supports files only'};Add-Type -AssemblyName Microsoft.VisualBasic;[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($resolved,[Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,[Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin);$gone=!(Test-Path -LiteralPath $resolved);return @{ok=$gone;verified=$gone;evidence=@{path=$resolved;sentToRecycleBin=$gone;permanentDelete=$false}}}
    default {throw 'Unsupported file action'}
   }
  }
 'run_command' {
   $command=[string]$a.command
   if($command.Length -gt 4000){throw 'Command limited to 4,000 characters'}
   if($a.allowUnrestricted -ne $true) {
     $blocked='(?i)\b(remove-item|format-volume|format-disk|clear-disk|diskpart|bcdedit|shutdown|restart-computer|stop-computer|set-executionpolicy|reg\s+delete|cipher\s+/w)\b'
     if($command -match $blocked -or $command -match '\.(ps1|bat|cmd|vbs|js|hta)\b' -or $command -match '(?i)\b(invoke-expression|iex|start-process\s+.*-verb\s+runas)\b'){throw 'Potentially destructive or elevated command blocked. Enable advanced shell commands in Jess settings to run it as the current Windows user.'}
   } elseif ($command -match '(?i)\b(start-process\s+.*-verb\s+runas|runas\.exe)\b') {
     throw 'Jess cannot launch an elevated command. Run the command as the current Windows user or approve any elevation directly in Windows.'
   }
   $timeoutMs=30000;if($null -ne $a.timeoutMs){$timeoutMs=[Math]::Max(1000,[Math]::Min(120000,[int]$a.timeoutMs))}
   $encoded=[Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($command))
   $stamp=[Guid]::NewGuid().ToString('N');$outFile=Join-Path $env:TEMP ('jess-command-'+$stamp+'.out');$errFile=Join-Path $env:TEMP ('jess-command-'+$stamp+'.err');$proc=$null
   try{
    $proc=Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',$encoded) -PassThru -WindowStyle Hidden -RedirectStandardOutput $outFile -RedirectStandardError $errFile -ErrorAction Stop
    $exited=$proc.WaitForExit($timeoutMs)
    if(!$exited){try{& taskkill.exe /PID $proc.Id /T /F 2>$null|Out-Null}catch{};try{[void]$proc.WaitForExit(2000)}catch{};$out='';$err='';if(Test-Path -LiteralPath $outFile){$out=[System.IO.File]::ReadAllText($outFile)};if(Test-Path -LiteralPath $errFile){$err=[System.IO.File]::ReadAllText($errFile)};return @{ok=$false;verified=$false;evidence=@{output=$out.Substring(0,[Math]::Min(10000,$out.Length));stderr=$err.Substring(0,[Math]::Min(2000,$err.Length));exitCode=$null;timeout=true;timeoutMs=$timeoutMs;note='Command timed out and the process tree was terminated'}}}
    $out='';$err='';if(Test-Path -LiteralPath $outFile){$out=[System.IO.File]::ReadAllText($outFile)};if(Test-Path -LiteralPath $errFile){$err=[System.IO.File]::ReadAllText($errFile)}
    $exitCode=$proc.ExitCode
    return @{ok=($exitCode -eq 0);verified=$false;evidence=@{output=$out.Substring(0,[Math]::Min(10000,$out.Length));stderr=$err.Substring(0,[Math]::Min(2000,$err.Length));exitCode=$exitCode;timeout=false;timeoutMs=$timeoutMs;note='Output captured; side effects are not independently verified'}}
   }finally{if($proc){$proc.Dispose()};Remove-Item -LiteralPath $outFile,$errFile -Force -ErrorAction SilentlyContinue}
  }
 default {throw ('Unknown method: '+$q.method)}
 }
}
[Console]::Out.WriteLine('{"type":"ready"}');[Console]::Out.Flush()
while($true){$line=[Console]::ReadLine();if($null -eq $line){break};try{$q=ConvertFrom-Json $line;$r=Invoke-Action $q;$o=@{id=$q.id;result=$r}}catch{$message=[string]$_.Exception.Message;$where='';$stack='';try{$where=[string]$_.InvocationInfo.PositionMessage}catch{};try{$stack=[string]$_.ScriptStackTrace}catch{};$detail=($where+([Environment]::NewLine)+$stack).Trim();if($detail.Length -gt 1600){$detail=$detail.Substring(0,1600)};$o=@{id=$q.id;result=@{ok=$false;verified=$false;evidence=$null;error=$message;errorType=$_.Exception.GetType().FullName;diagnostic=$detail}}};try{[Console]::Out.WriteLine((ConvertTo-Json -InputObject $o -Depth 12 -Compress));[Console]::Out.Flush()}catch{}}
