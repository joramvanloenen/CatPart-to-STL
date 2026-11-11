Option Explicit
' Requires a running and licensed CATIA V5 Windows installation.
Dim fso, pathIn, pathOut, catia, doc
If WScript.Arguments.Count <> 2 Then
  WScript.Echo "Usage: cscript //nologo catia-export.vbs input.CATPart output.stl"
  WScript.Quit 2
End If
Set fso = CreateObject("Scripting.FileSystemObject")
pathIn = fso.GetAbsolutePathName(WScript.Arguments(0))
pathOut = fso.GetAbsolutePathName(WScript.Arguments(1))
If Not fso.FileExists(pathIn) Then
  WScript.Echo "CATPart file does not exist."
  WScript.Quit 3
End If
On Error Resume Next
Set catia = GetObject(, "CATIA.Application")
If Err.Number <> 0 Then
  WScript.Echo "CATIA V5 is not running or cannot be automated."
  WScript.Quit 4
End If
Err.Clear
Set doc = catia.Documents.Open(pathIn)
If Err.Number <> 0 Then
  WScript.Echo "CATIA cannot open this CATPart: " & Err.Description
  WScript.Quit 5
End If
Err.Clear
doc.ExportData pathOut, "stl"
If Err.Number <> 0 Then
  WScript.Echo "CATIA cannot export this file to STL: " & Err.Description
  doc.Close
  WScript.Quit 6
End If
doc.Close
If Not fso.FileExists(pathOut) Then
  WScript.Echo "CATIA did not generate an STL file."
  WScript.Quit 7
End If
WScript.Echo "Wrote: " & pathOut
