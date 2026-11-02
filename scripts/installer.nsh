!macro customInstall
  DetailPrint "Registering Hub-Mind elevated startup scheduled task..."
  ExecWait 'schtasks.exe /Create /TN "HubMindElevated" /TR "$INSTDIR\Hub-Mind.exe" /SC ONLOGON /RL HIGHEST /F'
  DetailPrint "Registering Chrome Native Messaging Host in HKLM..."
  WriteRegStr HKLM "Software\Google\Chrome\NativeMessagingHosts\com.jaystarbliss.hubmind" "" "$INSTDIR\resources\com.jaystarbliss.hubmind.json"
!macroend

!macro customUnInstall
  DetailPrint "Removing Hub-Mind elevated startup scheduled task..."
  ExecWait 'schtasks.exe /Delete /TN "HubMindElevated" /F'
  DeleteRegKey HKLM "Software\Google\Chrome\NativeMessagingHosts\com.jaystarbliss.hubmind"
!macroend

