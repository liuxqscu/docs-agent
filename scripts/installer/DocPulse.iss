#ifndef MyAppName
  #define MyAppName "DocPulse"
#endif

#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

#ifndef MyAppPublisher
  #define MyAppPublisher "DocPulse"
#endif

#ifndef MyAppExe
  #define MyAppExe "DocPulse.exe"
#endif

#ifndef AppImageDir
  #define AppImageDir "dist\\DocPulse"
#endif

#ifndef OutputDir
  #define OutputDir "dist"
#endif

[Setup]
AppId={{B6CC0ED8-04AA-4D9A-BEAA-45AB8B694A1A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename={#MyAppName}-{#MyAppVersion}-setup
Compression=lzma2/ultra64
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExe}

#ifdef SetupIconFile
SetupIconFile={#SetupIconFile}
#endif

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "{#AppImageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
function IsDriveRoot(const S: string): Boolean;
begin
  Result := ((Length(S) = 2) and (S[2] = ':')) or
            ((Length(S) = 3) and (S[2] = ':') and (S[3] = '\\'));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Dir: string;
begin
  Result := True;
  if CurPageID = wpSelectDir then
  begin
    Dir := WizardForm.DirEdit.Text;
    if IsDriveRoot(Dir) then
      WizardForm.DirEdit.Text := AddBackslash(Dir) + '{#MyAppName}';
  end;
end;
