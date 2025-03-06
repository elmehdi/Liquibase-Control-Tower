
        var shell = new ActiveXObject("Shell.Application");
        var folder = shell.BrowseForFolder(0, "Select a folder", 0);
        if (folder) {
          WScript.Echo(folder.Self.Path);
        }
      