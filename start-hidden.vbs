Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)

' Monta o caminho relativo para seu arquivo JS
nodeScript = fso.BuildPath(scriptPath, "dist\main.js")

Set shell = CreateObject("WScript.Shell")
shell.Run "node """ & nodeScript & """", 0, False
