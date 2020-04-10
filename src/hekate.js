// TODO: General ace settings - ideally on change intercept, failing that use onbeforeunload
// ideally would save ace settings directly into config, rather than hand coding a shim
// editor.onChangeMode may be what we need for this (may also want to save session data, so undo/redo
// preserves across reloads)

// TODO: sub to event for editor content changed (once files loaded) 
// and mark tab as changed if appropriate (compare to save lasted value on tab)

// TODO: Store editor session data and restore when switching between tabs 
// TODO: Ability to reorder Tabs
// TODO: Fix tab display issue when too many tabs!

// TODO: Consider backup process which saves config and back-ups of unsaved changes in case of 
// crash - currently config saves only on reload and exit

// TODO: Would be kinda nice to be able to load ace and electron documentation inside this editor
// Would also be nice to have markdown / HTML preview windows - feels like if we can render arbitary 
// pages in tabs we can easily build an editor - should we be using the main program to control this?
// It would be nice to be able to have deattachable separate windows, and the ability to merge and split.

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

var getFileNamesInDir = function(path) {
	let files = fs.opendirSync(path, "utf-8");
	let file = files.readSync();

	let fileNames = [];
	while (file && file.isFile()) {
		fileNames.push(file.name);
		file = files.readSync();
	}
	return fileNames;
};

var getFileExtension = function(filePath) {
    // https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript/12900504#12900504
    return filePath.slice((filePath.lastIndexOf(".") - 1 >>> 0) + 2);  
};

var getFileName = function(filePath) {
    return filePath.slice(filePath.lastIndexOf("/") + 1);
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

var setFileModeDisplay = function(filePath, editor) {
    let extension = getFileExtension(filePath);
    let fileMode = "";
    switch(extension)
	{
        case "js":
            editor.session.setMode("ace/mode/javascript");
            fileMode = "JavaScript";
            break;
        case "json":
            editor.session.setMode("ace/mode/json");
            fileMode = "JSON";
            break;
        case "htm":
        case "html":
            editor.session.setMode("ace/mode/html");
            fileMode = "HTML";
            break;
        case "glsl":
            editor.session.setMode("ace/mode/glsl");
            fileMode = "GLSL";
            break;
        case "markdown":
        case "md":
            editor.session.setMode("ace/mode/markdown");
            fileMode = "Markdown";
            break;
        case "css":
            editor.session.setMode("ace/mode/css");
            fileMode = "CSS";
            break;
        default:
            editor.session.setMode("ace/mode/text");
            fileMode = "Plain Text"
            break;
    }
    updateFileModeDisplay(fileMode);
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
        
        // TODO: Save Session Data instead and swap it
        // but do this if no session data exists
        tab.editor.setValue(tab.dataCache);
		tab.editor.selection.clearSelection();
		tab.editor.selection.moveCursorTo(0, 0, false);
		tab.editor.session.$undoManager.reset(); 
		// ^^ This feels they don't want us to use this what with the $

        currentTabIndex = tabIndex;
        currentFilePath = tab.filePath;
        setFileModeDisplay(tab.filePath, tab.editor);
        logMessage(tabIndex, tab.lastMessage);
    }
};

var createBlankTab = function() {
    let index = createNewTab();
    switchToTab(index);
};


/* File Save / Load */ 
var openDialog = function() {
    // https://www.electronjs.org/docs/api/dialog
	let files = dialog.showOpenDialogSync(currentWindow, {
		title: "Open File",
		defaultPath: currentFilePath ? getPath(currentFilePath) : getUserDocumentsPath(),
		properties: [ "openFile" ]
	});
	if (files && files[0]) {
	    let foundPath = false;
	    for(let i = 0, l = tabs.length; i < l; i++) {
	        if (tabs[i].filePath == files[0]) {
	            foundPath = true;
	            if (currentTabIndex != i) {
    	            switchToTab(i);
	            }
	            break;
	        }
	    }
	    if (!foundPath) {
	        let index = createNewTab(files[0]);
    	    loadIntoTab(index, files[0], function() {
    	        switchToTab(index);
    	    });
	    }
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
            // TODO: Better default state
            editor.setValue("");
            setFileModeDisplay("", editor);
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
        			    setFileModeDisplay(tab.filePath, tab.editor);
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

/* Folder Manangement Function  */
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
                openDialog();
                break;
            case "F4":
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
    // ^^ Should bring these under on beforeunload method on config class
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