const { app, BrowserWindow, Menu, ipcMain, desktopCapturer, session } = require('electron');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    }
  });

  win.maximize();

  // 1. Grant standard media permissions (Camera, Mic)
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ['media', 'display-capture', 'notifications'].includes(permission);
  });
  session.defaultSession.setDevicePermissionHandler(() => true);

  // 2. Handle Screen Sharing (getDisplayMedia) inside the webview
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      // Select the primary screen (entire screen)
      if (sources && sources.length > 0) {
        callback({ video: sources[0] });
      } else {
        callback({});
      }
    } catch (err) {
      console.error('Screen capture request failed:', err);
      callback({});
    }
  });

  // Handle prompt() / alert() inside webviews
  win.webContents.on('did-attach-webview', (event, webContents) => {
    webContents.on('ipc-message', (e, channel) => {});
  });
  // Application Menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Toolbar',
          accelerator: 'CmdOrCtrl+H',
          click: () => {
            win.webContents.send('toggle-toolbar-from-menu');
          }
        },
        {
          label: 'Toggle Classroom Drawer',
          accelerator: 'F2',
          click: () => {
            win.webContents.send('toggle-classroom-view');
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'F1',
          click: () => {
            win.webContents.send('show-shortcuts-modal');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  win.loadFile('index.html');
}

// Screenshot capture bridge
ipcMain.on('capture-browser-window', async (event, bounds) => {
  try {
    const image = bounds 
      ? await win.capturePage(bounds) 
      : await win.capturePage();
    event.sender.send('browser-captured', image.toDataURL());
  } catch (err) {
    console.error('Capture failed:', err);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});