' Fully detached VisionSetil watchdog (survives agent shells / closed terminals)
Set sh = CreateObject("WScript.Shell")
Dim root
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
root = CreateObject("Scripting.FileSystemObject").GetParentFolderName(root)
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File """ & root & "\scripts\dev-watchdog.ps1"""
sh.Run cmd, 0, False
