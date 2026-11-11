Set oFSO = CreateObject("Scripting.FileSystemObject")
scriptDir = oFSO.GetParentFolderName(WScript.ScriptFullName)
Set oShell = CreateObject("WScript.Shell")
cmd = "powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\gui.ps1"""
oShell.Run cmd, 0, False
