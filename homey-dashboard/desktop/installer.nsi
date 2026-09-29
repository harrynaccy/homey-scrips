; Installatieprogramma voor Homey Dashboard (Windows, per gebruiker, geen beheerdersrechten nodig)
Unicode true
!include "MUI2.nsh"

!define APPNAME "Homey Dashboard"
!define VERSION "1.1.0"
!define EXE "Homey Dashboard.exe"
!define APPID "nl.ramon.homeydashboard"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}"

Name "${APPNAME}"
OutFile "dist\Homey-Dashboard-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPID}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1043 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1043 "FileDescription" "${APPNAME} installatie"
VIAddVersionKey /LANG=1043 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1043 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1043 "CompanyName" "Ramon"
VIAddVersionKey /LANG=1043 "LegalCopyright" "Ramon"

!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Welkom bij ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Dit installeert ${APPNAME} op je pc.$\r$\n$\r$\nHet programma opent je dashboard dat op je NAS draait, in een eigen venster. Je browser, snelkoppeling en tablet blijven gewoon werken.$\r$\n$\r$\nKlik op Volgende om verder te gaan."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "${APPNAME} nu starten"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Dutch"

Section "Installeren"
  ; draaiend programma eerst sluiten (anders kunnen bestanden niet overschreven worden)
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  SetOutPath "$INSTDIR"
  File /r "dist\win-unpacked\*.*"
  File "/oname=$INSTDIR\icon.ico" "build\icon.ico"
  WriteUninstaller "$INSTDIR\Verwijderen.exe"

  CreateShortcut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico" 0
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico" 0
  CreateShortcut "$SMPROGRAMS\${APPNAME}\${APPNAME} verwijderen.lnk" "$INSTDIR\Verwijderen.exe"

  WriteRegStr HKCU "Software\${APPID}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "Ramon"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\Verwijderen.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${EXE}" /F'
  Delete "$DESKTOP\${APPNAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "Software\${APPID}"
SectionEnd
