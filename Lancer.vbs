Dim objShell, strDir
Set objShell = CreateObject("WScript.Shell")
strDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
objShell.Run "cmd /c cd /d """ & strDir & """ && set ELECTRON_RUN_AS_NODE= && node node_modules\electron\cli.js .", 0, False
Set objShell = Nothing
