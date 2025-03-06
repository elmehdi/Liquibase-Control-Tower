
Add-Type -AssemblyName System.Windows.Forms
$folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
$folderBrowser.Description = "Select a folder"
$folderBrowser.ShowNewFolderButton = $true
$folderBrowser.RootFolder = "MyComputer"

if ($folderBrowser.ShowDialog() -eq "OK") {
    Write-Output $folderBrowser.SelectedPath
} else {
    exit 1
}
        