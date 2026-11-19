; Uninstall keeps the race database and Credential Manager entries unless the
; director checks "Delete the application data". Upgrades pass /UPDATE and
; must not delete either.
;
; keyring 3 stores a Windows generic credential whose target name is
; `{account}.{service}`. SERVICE in credentials.rs is "MWHE Race Scorer".
; The packaged-shell test checks that these target strings stay in sync.

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    StrCpy $R8 "$TEMP\mwhe-race-scorer-clear-credentials.ps1"
    ClearErrors
    FileOpen $R9 $R8 w
    IfErrors mwhe_cred_done
    FileWrite $R9 "Add-Type -Namespace MwheClear -Name Cred -MemberDefinition '[DllImport($\qadvapi32.dll$\q, SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool CredDelete(string target, int type, int flags);'$\r$\n"
    FileWrite $R9 "[MwheClear.Cred]::CredDelete('site-bearer-token.MWHE Race Scorer', 1, 0) | Out-Null$\r$\n"
    FileWrite $R9 "[MwheClear.Cred]::CredDelete('rider-private-key.MWHE Race Scorer', 1, 0) | Out-Null$\r$\n"
    FileClose $R9
    ExecWait '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$R8"'
    Delete "$R8"
    mwhe_cred_done:
  ${EndIf}
!macroend
