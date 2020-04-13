"use strict"; // Prevent "Too Many Errors" issue with JSHint - see https://github.com/ajaxorg/ace/issues/2955

// NOTE: Requires 'ace' defined in global scope

const { app, dialog } = require('electron').remote;
const currentWindow = require('electron').remote.getCurrentWindow();

var fs = require('fs');
var FileTab = require('./src/fileTab');

var lastOpenedFilePath = "";
var currentFilePath = "";

var configPath = app.getPath('userData') + "/config.json";
var config = require('./src/config').load(configPath);

var tabs = [];
var tabElements = [];
var currentTabIndex = -1;

var editor = ace.edit("editor");

/* Utils */
var removeAllChildNodes = function(element) {
  while (element && element.firstChild) {
      element.removeChild(element.firstChild);
  } 
};

var getDirectoryStructure = function(path) {
    // TODO: Options for include hidden files and folders
    // default right now is show hidden files, but not folders
	let dirents = fs.opendirSync(path, "utf-8");
	let next = dirents.readSync();

	let entry = { name: getDirectoryName(path) + "/", entries: [], path: path };
	while (next) {
	    if (next.isFile()) {
    		entry.entries.push({ name: next.name });
	    } else if (next.isDirectory()) {
	        if (next.name[0] != '.') {
    	        entry.entries.push(getDirectoryStructure(path + "/" + next.name));
	        }
	    }
		next = dirents.readSync();
	}
	entry.entries.sort(function(a,b) {
	    if (a.entries && !b.entries) {
	        return -1;
	    }
	    else if (b.entries && !a.entries) {
	        return 1;
	    }
	    else {
	       if (a.name > b.name) { return 1; }
	       if (a.name < b.name) { return -1; }
	       return 0;
	    }
	});
	return entry;
};

var getFileExtension = function(filePath) {
    // https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript/12900504#12900504
    return filePath.slice((filePath.lastIndexOf(".") - 1 >>> 0) + 2);  
};

var getFileName = function(filePath) {
    return filePath.slice(filePath.lastIndexOf("/") + 1);
};

var getDirectoryName = function(dirPath) {
    // Check to see if the direcoty path includes a trailing "/"
    // it shouldn't but it's an easy mistake to make
    if (dirPath.lastIndexOf("/") == dirPath.length - 1) {
        dirPath = dirPath.slice(0, dirPath.lastIndexOf("/"));
    }
    return dirPath.slice(dirPath.lastIndexOf("/") + 1);
};

var getPath = function(filePath) {
    return filePath.slice(0, filePath.lastIndexOf("/"));
};

var getUserDocumentsPath = function() {
    return "/home/pi/Documents/"; // TODO: Don't hardcode this!
};

/* Editor Display Updates */
var logMessage = function(index, message) {
    // TODO: should probably escape this
    if (index >= 0 && index < tabs.length) {
        tabs[index].lastMessage = message;
    }
    document.getElementById("logMessage").innerHTML = message;
    // Clear after timeout?
};

var logError = function(index, error) {
    if (index >= 0 && index < tabs.length) {
        tabs[index].lastMessage = error.message;
    }
    document.getElementById("logMessage").innerHTML = "<span style='color:red'>" + error.message + "</span>";
    console.log(JSON.stringify(error));
};

var getFileModePath = function(filePath) {
    let extension = getFileExtension(filePath);
    switch(extension)
	{
        case "js":
            return "ace/mode/javascript";
        case "json":
            return "ace/mode/json";
        case "htm":
        case "html":
            return "ace/mode/html";
        case "glsl":
            return "ace/mode/glsl";
        case "markdown":
        case "md":
            return "ace/mode/markdown";
        case "css":
            return "ace/mode/css";
	    case "less":
	        return "ace/mode/less";
        default:
            return "ace/mode/text";
    }
};

var setFileModeDisplay = function(fileMode) {
    // Question: What mapping does ace settings panel use for this, can we reuse it?
    let fileModeString = "";
    switch(fileMode)
	{
        case "ace/mode/javascript":
            fileModeString = "JavaScript";
            break;
        case "ace/mode/json":
            fileModeString = "JSON";
            break;
        case "ace/mode/html":
            fileModeString = "HTML";
            break;
        case "ace/mode/glsl":
            fileModeString = "GLSL";
            break;
        case "ace/mode/markdown":
            fileModeString = "Markdown";
            break;
        case "ace/mode/css":
            fileModeString = "CSS";
            break;
        case "ace/mode/less":
            fileModeString = "LESS";
            break;
        default:
            fileModeString = "Plain Text";
            break;
    }
    updateFileModeDisplay(fileModeString);
};

var updateFileModeDisplay = function(fileMode) {
    document.getElementById("fileMode").innerHTML = fileMode;
};

var switchToTab = function(tabIndex, force) {
    if ((currentTabIndex != tabIndex || force) && tabIndex >= 0 && tabIndex < tabs.length) {
    	if (currentTabIndex != tabIndex && currentTabIndex >= 0) {    	
        	tabs[currentTabIndex].dataCache = tabs[currentTabIndex].editor.getValue();
        	tabElements[currentTabIndex].classList.remove("selected"); 
        }

        let tab = tabs[tabIndex];
        if (!tabElements[tabIndex].classList.contains("selected")) {
            tabElements[tabIndex].classList.add("selected");
        }
        
        var fileModePath = getFileModePath(tab.filePath);
	    if (!tab.session) {
	        // TODO: Should do this as part of tab creation
            tab.session = ace.createEditSession(tab.dataCache, fileModePath);
        }
        tab.editor.setSession(tab.session);

        currentTabIndex = tabIndex;
        currentFilePath = tab.filePath;
        setFileModeDisplay(fileModePath);
        logMessage(tabIndex, tab.lastMessage);
    }
};

var createBlankTab = function() {
    let index = createNewTab();
    switchToTab(index);
};

/* File Save / Load */ 
var openFileDialog = function() {
    // https://www.electronjs.org/docs/api/dialog
	let files = dialog.showOpenDialogSync(currentWindow, {
		title: "Open File",
		defaultPath: currentFilePath ? getPath(currentFilePath) : getUserDocumentsPath(),
		properties: [ "openFile" ]
	});
	if (files && files[0]) {
	    openFile(files[0]);
	}
};

var openDirectoryDialog = function() {
    let directories = dialog.showOpenDialogSync(currentWindow, {
        title: "Open Project Folder",
        defaultPath: currentFilePath ? getPath(currentFilePath) : getUserDocumentsPath(),
        properties: [ "openDirectory" ]
    });
    if (directories && directories[0]) {
        openFolder(directories[0]);
    }
}

var openFile = function(filePath) {
    let foundPath = false;
    for(let i = 0, l = tabs.length; i < l; i++) {
        if (tabs[i].filePath == filePath) {
            foundPath = true;
            if (currentTabIndex != i) {
	            switchToTab(i);
            }
            break;
        }
    }
    if (!foundPath) {
        let index = createNewTab(filePath);
	    loadIntoTab(index, filePath, function() {
	        switchToTab(index);
	    });
    }
};

var createNewTab = function(filePath) {
    let tab = FileTab.create({ editor: editor });
    let index = tabs.push(tab) - 1;

    let tabElement = document.createElement("input");
    tabElement.type = "button";
    tabElement.className = "button";
    tabElement.value = filePath ? getFileName(filePath) : "New File";
    tabElements.push(tabElement);

    tabElement.onclick = function() {
        switchToTab(index);
    };

    document.getElementById("tabHolder").appendChild(tabElement);

    return index;
};

var loadIntoTab = function(index, filePath, callback) {
    // Currently reusing editor
    let tab = null;
    if (index >= 0 && index <= tabs.length) {
        tab = tabs[index];
    }
    
    if (tab) {
        tab.loadFile(filePath, function(error, data) {
            if (!error) { 
                logMessage(index, "Loaded " + filePath);
                config.update({ openedFilePath: filePath });
                // TODO: Move to config class
            	// TODO: Watch file and notify of external changes
            	if (callback) {
            	    callback();
            	}
            } else {
    			logError(index, error);
            }
        });        
    } else {
        logError(-1, "No tab to load into");
    }
};

var saveCurrentTab = function() {
	if (currentTabIndex >= 0) {
		saveTab(currentTabIndex);
	} else {
	    // TODO: Disable button in these circumstances
		logError(-1, { message: "No tab to save!" });
	}
};

var closeCurrentTab = function() {
    if (currentTabIndex >= 0) {
        closeTab(currentTabIndex);
    } else {
	    // TODO: Disable button in these circumstances
        logError(-1, { message: "No tab to close!"});
    }
};

var closeTab = function(index) {
    let tab = null;
    if (index >= 0 && index < tabs.length) {
        tab = tabs[index];
    }
    
    if (tab && (tab.lastSavedData == tab.editor.getValue() || confirm("You have unsaved data, are you sure?"))) {
        var element = tabElements[currentTabIndex];
        var filePath = tab.filePath;
        tabs.splice(currentTabIndex, 1);
        tabElements.splice(currentTabIndex, 1);
        document.getElementById("tabHolder").removeChild(element);
        for(let i = 0, l = tabElements.length; i < l; i++) {
            tabElements[i].onclick = function() {
                switchToTab(i);
            };
        }
        if (currentTabIndex >= tabs.length) {
            currentTabIndex -= 1;
        }
        if (currentTabIndex >= 0) {
            switchToTab(currentTabIndex, true);
        } else {
            editor.setValue("");
            editor.session.setValue("");
            editor.session.setMode("ace/mode/text");
            setFileModeDisplay("ace/mode/text");
            logMessage(-1, "");
        }
            
        config.update({ closedFilePath: filePath, focusedTab: currentTabIndex });
    } 
};

var saveTab  = function(index) {
    let tab = null;
    if (index >= 0 && index < tabs.length) {
        tab = tabs[index];
    }
    
    if (tab) {
        let saveAs = false;
    	let filePath = tab.filePath;
    	if (!filePath) {
    	    filePath = dialog.showSaveDialogSync(currentWindow, { 
    	        title: "Save As...",
    	        properties: [ "createDirectory" ]
    	    });
    	    tab.filePath = filePath;
    	    currentFilePath = filePath;
    	    saveAs = true;
    	}
    	
    	if (filePath) {
    	    tab.saveFile(function(error) {
    			if (!error) {
    			    if (saveAs) {
    			        tabElements[index].value = getFileName(filePath);
    			        let fileMode = getFileModePath(tab.filePath);
    			        tab.editor.session.setMode(fileMode);
        			    setFileModeDisplay(fileMode);
        			    config.update({ openedFilePath: tab.filePath });
    			    }
    				logMessage(index, "Saved " + filePath); 
    			} else {
    				logError(index, error);
    			}
    		});
    	}
    }
};

/* Folder Manangement */
var toggleFolderView = function() {
    var wrapper = document.getElementById('mainWrapper');
    if (wrapper.classList.contains("expanded")) {
        wrapper.classList.remove("expanded");
    } else {
        wrapper.classList.add("expanded");
    }
};

var openFolder = function(dirPath) {
    let structure = getDirectoryStructure(dirPath); // Incorperate fold info
    let container = document.getElementById('viewContainer');
    removeAllChildNodes(container);
    var result = buildElementForFolder(structure);
    result.className = ""; // TODO: Set Fold state using store info
    container.appendChild(result);
    config.openDirectory = dirPath;
};

var buildElementForFolder = function(structure) {
    let result = document.createElement('ul');
    result.className = "collapsed";
    let directoryNameSpan = document.createElement('span');
    directoryNameSpan.className = "directory";
    directoryNameSpan.innerHTML = structure.name;
    directoryNameSpan.onclick = function() {
        result.className = result.className === "collapsed" ? "" : "collapsed";
    };
    result.appendChild(directoryNameSpan);
    for(let i = 0, l = structure.entries.length; i < l; i++) {
        let entry = structure.entries[i];
        let li = document.createElement('li');
        if (entry.entries) {
            li.appendChild(buildElementForFolder(entry));
        } else {
            let fileNameSpan = document.createElement('span');
            fileNameSpan.className = "file";
            fileNameSpan.innerHTML = entry.name;
            fileNameSpan.onclick = function() {
                openFile(structure.path + "/" + entry.name);
            };
            li.appendChild(fileNameSpan);
        }
        result.appendChild(li);
    }
    return result;
};

var deleteFile = function(filePath) {
	if (filePath && window.confirm("Are you sure?")) {
		// TODO: Consider Undo over confirm https://alistapart.com/article/neveruseawarning/
		fs.unlink(filePath, function(error) {
			if (error) {
				logError(-1, error);
			} else {
				logMessage(-1, "Deleted " + filePath);
			}
		});
	}
};

/* Tab independent */
/* Set Hotkeys */
var onKeyPress = function(event) {
    if (event.ctrlKey) {
        switch(event.key)
        {
            case "r": 
                config.save();
                break;
            case "n":
                createBlankTab();
                break;
            case "s":
                saveCurrentTab();
                break;
            case "o":
                openFileDialog();
                break;
            case "F4":
                // BUG: this doesnt' work even though as far as I can tell it should
                closeCurrentTab();
                break;
        }
    }
};

// Unload Management
window.addEventListener('beforeunload', function(event) {
    // TODO: Check for unsaved changes and prompt if there are before closing
    /* 
    // To prevent unloading...
    event.preventDefault(); // This is as per spec
    event.returnValue = ''; // This is required by Chrome
    */
    config.aceThemePath = editor.getTheme();
    config.lastFocusedTab = currentTabIndex;
    config.save();
});

// Start-up logic
editor.setTheme(config.aceThemePath);
if (config.openFilePaths.length > 0) {
    let nextToLoadIndex = 0;
    var loadNextTab = function() {
        // Switch to last focused tab ASAP 
        if (nextToLoadIndex - 1 == config.lastFocusedTab) {
            switchToTab(config.lastFocusedTab, true);
        }
        if (nextToLoadIndex < config.openFilePaths.length) {
            let filePath = config.openFilePaths[nextToLoadIndex]; 
            nextToLoadIndex += 1;
            loadIntoTab(createNewTab(filePath), filePath, loadNextTab);
        }
    };
    loadNextTab();
}
if (config.openDirectory) {
    openFolder(config.openDirectory);    
}
