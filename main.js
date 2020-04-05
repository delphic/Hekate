const { app, BrowserWindow } = require('electron');

var createWindow = function() {
	let browserWindow = new BrowserWindow({
		width: 800,
		height: 600,
		webPreferences: {
			nodeIntegration: true
		}
	});
	
	browserWindow.loadFile('index.html');
};

app.whenReady().then(createWindow);