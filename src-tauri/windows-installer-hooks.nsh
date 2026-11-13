; Rename only this application's old shortcuts/registration. Never touch its data directory.
Var NilsonLegacyDir
!macro NSIS_HOOK_PREINSTALL
  StrCpy $NilsonLegacyDir ""
  ReadRegStr $R8 HKCU "Software\${MANUFACTURER}\G-s- Gestão de Depósito" ""
  ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\G-s- Gestão de Depósito" "MainBinaryName"
  ${If} $R8 != ""
  ${AndIf} $R9 == "gs_deposito.exe"
  ${AndIf} ${FileExists} "$R8\gs_deposito.exe"
    StrCpy $NilsonLegacyDir $R8
    !insertmacro CheckIfAppIsRunning "$NilsonLegacyDir\gs_deposito.exe" "G-s- Gestão de Depósito"
  ${EndIf}
!macroend
!macro NSIS_HOOK_POSTINSTALL
  ${If} $NilsonLegacyDir != ""
    !insertmacro IsShortcutTarget "$DESKTOP\G-s- Gestão de Depósito.lnk" "$NilsonLegacyDir\gs_deposito.exe"
    Pop $R8
    ${If} $R8 = 1
      Delete "$DESKTOP\G-s- Gestão de Depósito.lnk"
    ${EndIf}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\G-s- Gestão de Depósito.lnk" "$NilsonLegacyDir\gs_deposito.exe"
    Pop $R8
    ${If} $R8 = 1
      Delete "$SMPROGRAMS\G-s- Gestão de Depósito.lnk"
    ${EndIf}
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\G-s- Gestão de Depósito"
    DeleteRegKey HKCU "Software\${MANUFACTURER}\G-s- Gestão de Depósito"
    ${If} $NilsonLegacyDir != $INSTDIR
      Delete "$NilsonLegacyDir\gs_deposito.exe"
      Delete "$NilsonLegacyDir\uninstall.exe"
      RMDir "$NilsonLegacyDir"
    ${EndIf}
  ${EndIf}
!macroend
