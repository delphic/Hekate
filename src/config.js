var fs = require('fs');

var Config = module.exports = function() {
	// TODO Add watcher check for external changes and reload (can have multiple instances open)
	var exports = {};
	var load = exports.load = function(configPath) {
		let config;
		try {
			config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
			if (!config.hasOwnProperty("openFilePaths")) {
				config.openFilePaths = [];
			}
			if (!config.hasOwnProperty("lastOpenedFilePath")) {
				config.lastOpenedFilePath = null;
			}
			if (!config.hasOwnProperty("aceThemePath")) {
				config.aceThemePath = "ace/theme/monokai";
			}
			if (!config.hasOwnProperty("lastFocusedTab")) {
				config.lastFocusedTab = 0;
			}
			if (!config.hasOwnProperty("openDirectory")) {
				config.openDirectory = null;
			}
			if (!config.hasOwnProperty("projectFilePaths")) {
				config.projectFilePaths = {};
			}
			if (config.openDirectory) {
				config.projectFilePaths[config.openDirectory] = config.openFilePaths;
			}
		} catch (error) {
			// TODO: confirm error is that file doesn't exist
			config = {
				openFilePaths: [],
				openDirectory: "",
				lastFocusedTab: 0,
				lastOpenedFilePath: "",
				projectFilePaths: {},
				aceThemePath: "ace/theme/monokai", // Obviously the best default theme
			};
		}
		
		config.update = function(params) {
			if (params.openedFilePath) {
				if (!config.openFilePaths.includes(params.openedFilePath)) {
					config.openFilePaths.push(params.openedFilePath);
				}
				config.lastOpenedFilePath = params.openedFilePath;
			}
			if (params.closedFilePath) {
				let configIndex = config.openFilePaths.indexOf(params.closedFilePath);
				if (configIndex >= 0) {
					config.openFilePaths.splice(configIndex, 1);
				}
			}
			if (params.focusedTab) {
				config.lastFocusedTab = params.focusedTab;
			}
			if (params.aceThemePath) {
				config.aceThemePath = params.aceThemePath;
			}
			if (params.openDirectory) {
				config.openDirectory = params.openDirectory;
				if (config.projectFilePaths.hasOwnProperty(config.openDirectory)) {
					config.openFilePaths = config.projectFilePaths[config.openDirectory];
				} else {
					config.openFilePaths = [];
					config.projectFilePaths[config.openDirectory] = config.openFilePaths;
				}
			}
		};
		
		config.save = function() {
			fs.writeFile(configPath, JSON.stringify(config), function(error) { });
		};
		
		return config;
	};
	
	return exports;
}();