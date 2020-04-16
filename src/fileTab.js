var fs = require('fs');

var FileTab = module.exports = function() {
    var exports = {};
    var prototype = {
        loadFile: function(filePath, callback) {
        	if (filePath) {
        	    let tab = this;
        		fs.readFile(filePath, 'utf-8', function(error, data) {
    				tab.filePath = filePath;
        			if (!error) {
        			    tab.lastSavedData = data;
        				tab.dataCache = data;
        			}
    				callback(error, data);
        		});
	        }
        },
        saveFile: function(callback) {
        	if (this.filePath) {
        	    let tab = this;
        		fs.writeFile(this.filePath, this.editor.getValue(), function(error) {
        		    tab.lastSavedData = tab.editor.getValue();
    		        if (callback) {
    		            callback(error);
    		        }
        		});
        	}
        }
        
    };
    var create = exports.create = function(params) {
        var tab = Object.create(prototype);
        tab.editor = params.editor;
        tab.dataCache = "";
        tab.filePath = "";
        tab.lastSavedData = "";
        tab.lastMessage = "Created new tab";
        return tab;
    };
    
    return exports;
}();