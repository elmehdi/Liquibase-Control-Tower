
Set objShell = CreateObject("Shell.Application")
Set objFolder = objShell.BrowseForFolder(0, "Select a folder", 0)
If objFolder Is Nothing Then
  WScript.Quit(1)
Else
  WScript.Echo objFolder.Self.Path
  WScript.Quit(0)
End If
          