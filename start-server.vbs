Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d YOUR_FOLDER_PATH_HERE && node server.js", 0, False
