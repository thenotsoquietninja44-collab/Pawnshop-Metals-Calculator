'use strict';
const { app, BrowserWindow, ipcMain, shell, net, dialog, Menu, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');
const { WIDGET_URL, parseWidget, freshness } = require('./spot');
const Catalog = require('./catalog');
const Backup = require('./backup');
const os=require('node:os');
const smokeMode=process.argv.includes('--smoke-test') || process.argv.includes('--backup-smoke-test');
if(smokeMode)app.setPath('userData',fs.mkdtempSync(path.join(os.tmpdir(),'pawnshop-smoke-')));
autoUpdater.autoInstallOnAppQuit=false;
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
app.on('second-instance',()=>{if(win && !win.isDestroyed()){if(win.isMinimized())win.restore();win.focus();}});
let win, settings, snapshot = null, spotError = '', busy = false, updateBusy = false, downloaded = false;
let downloadedVersion='',operationBusy=false,allowQuit=false;
let backupState={busy:false,message:'A verified full app and shop-data backup is required before each in-app update.',lastPath:null};
let updateState = { status: 'idle', message: 'Automatic update checks enabled.' };
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const defaults = () => ({ premiums: { Silver: '25', Gold: '0', Platinum: '0' }, side: 'ask', autoRefresh: true, coins:Catalog.defaults(), compactCoinIds:[], catalogVersion:1 });
function loadSettings() {
  settings = defaults();
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (['bid', 'ask'].includes(saved.side)) settings.side = saved.side;
    if (typeof saved.autoRefresh === 'boolean') settings.autoRefresh = saved.autoRefresh;
    for (const metal of Object.keys(settings.premiums)) {
      const p = String(saved.premiums?.[metal]);
      if (/^\d{1,4}(\.\d{1,8})?$/.test(p) && Number(p) <= 1000) settings.premiums[metal] = p;
    }
    settings.coins = saved.coins === undefined ? Catalog.defaults(settings.premiums) : Catalog.validateCoins(saved.coins);
    settings.compactCoinIds=Catalog.validateConfig({...settings,compactCoinIds:saved.compactCoinIds}).compactCoinIds;
    Object.assign(settings,Catalog.upgradeGenericPresets(settings.coins,settings.premiums,saved.catalogVersion || 0));
  } catch (e) { if (e.code !== 'ENOENT') spotError = 'Saved settings could not be read; defaults loaded.'; }
}
function saveSettings(value) {
  if(operationBusy)throw Error('Wait for the backup or restore operation to finish.');
  const clean = Catalog.validateConfig(value);
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath() + '.tmp', JSON.stringify(clean, null, 2));
  fs.renameSync(settingsPath() + '.tmp', settingsPath());
  settings = clean;
  return settings;
}
const priceState = () => ({ snapshot, error: spotError, busy, ...freshness(snapshot) });
async function exportSetup() {
  const result = await dialog.showSaveDialog(win, { title:'Export saved coin catalog and shop rules', defaultPath:'Pawnshop-Metals-Setup.json', filters:[{name:'Shop setup',extensions:['json']}] });
  if (result.canceled) return { canceled:true };
  fs.writeFileSync(result.filePath, JSON.stringify(Catalog.exportSetup(settings),null,2),'utf8');
  return { canceled:false, count:settings.coins.length };
}
async function importSetup() {
  const selected = await dialog.showOpenDialog(win, { title:'Import coin catalog and shop rules', properties:['openFile'], filters:[{name:'Shop setup',extensions:['json']}] });
  if (selected.canceled) return { canceled:true };
  const file = selected.filePaths[0];
  if (fs.statSync(file).size > 2 * 1024 * 1024) throw Error('Setup file is too large (maximum 2 MB).');
  const incoming = Catalog.importSetup(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));
  // Import exactly the reviewed catalog; do not inject presets into an older share file on next startup.
  incoming.catalogVersion=1;
  const result = await dialog.showMessageBox(win, { type:'question', title:'Review imported setup',
    message:`Import ${incoming.coins.length} coin setups and their shop rules?`,
    detail:`${incoming.coins.slice(0,6).map(c=>c.name).join('\n')}${incoming.coins.length > 6 ? '\n...' : ''}\n\nReplace uses exactly this catalog. Merge retains other local coins and updates coins with matching IDs. Both apply imported default premiums, bid/ask selection and auto-refresh preference. Current settings are backed up first. Live and manual prices are not imported.`,
    buttons:['Replace catalog and rules','Merge catalog and rules','Cancel'], defaultId:2, cancelId:2 });
  if (result.response === 2) return { canceled:true };
  if (result.response === 1) {
    const merged = new Map(settings.coins.map(c=>[c.id,c]));
    incoming.coins.forEach(c=>merged.set(c.id,c)); incoming.coins = [...merged.values()];
    incoming.compactCoinIds=[...new Set([...settings.compactCoinIds,...incoming.compactCoinIds])];
    Catalog.validateConfig(incoming);
  }
  if (fs.existsSync(settingsPath())) fs.copyFileSync(settingsPath(),settingsPath()+'.before-import-'+Date.now()+'.json');
  return { canceled:false, settings:saveSettings(incoming) };
}
const send = (channel, value) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };
function setBackup(patch){backupState={...backupState,...patch};send('backup',backupState);}
function installedAppDir(){
  if(!app.isPackaged)throw Error('Full application backups require the installed Windows app.');
  const directory=path.dirname(app.getPath('exe'));
  if(path.relative(path.join(directory,'resources','app.asar'),path.resolve(app.getAppPath()))!=='')throw Error('Installed application location is unrecognized.');
  return directory;
}
async function makeBackup(session={},reason='manual',includeApplication=true) {
  const backup=await Backup.createBackup({userDataDir:app.getPath('userData'),appDir:includeApplication?installedAppDir():null,executableName:path.basename(app.getPath('exe')),
    version:app.getVersion(),targetVersion:reason==='before-update'?downloadedVersion:'',settings,session,reason,
    onProgress:p=>setBackup({busy:true,message:`${p.phase==='copying'?'Backing up':'Verifying backup'}: ${p.done}/${p.total} files. Please keep the app open.`})});
  setBackup({lastPath:backup.directory,message:'Verified backup saved: '+backup.directory});
  return backup;
}
async function manualBackup(session){
  if(operationBusy)throw Error('A backup or update is already running.');
  operationBusy=true;setBackup({busy:true,message:'Creating a full application and shop-data backup...'});
  try{return {directory:(await makeBackup(session)).directory};}
  catch(e){setBackup({message:'Backup failed: '+e.message});throw e;}
  finally{operationBusy=false;setBackup({busy:false});}
}
async function protectedUpdate(session){
  if(!downloaded || operationBusy)return;
  operationBusy=true;
  try{
    const decision=await dialog.showMessageBox(win,{type:'question',buttons:['Back up and install','Later'],defaultId:1,cancelId:1,title:'Install update safely',message:`Install version ${downloadedVersion}?`,detail:'First, the complete current application, saved shop data and current unsaved form values will be copied and verified. If backup verification fails, installation is blocked. The app restarts after a successful backup.'});
    if(decision.response!==0)return;
    setBackup({busy:true,message:'Backing up before installation...'});
    await Backup.installAfterBackup({create:()=>makeBackup(session,'before-update',true),
      install:()=>{allowQuit=true;setUpdate('installing','Verified backup complete. Restarting to install the update...');autoUpdater.quitAndInstall();}});
  }catch(e){allowQuit=false;setBackup({message:'Update paused; backup or installation failed: '+e.message});setUpdate('ready','Update paused. Resolve the backup error and try again.');await dialog.showMessageBox(win,{type:'error',title:'Update was not installed',message:'The update could not proceed safely.',detail:e.message+'\nYour current app remains installed. You can retry after resolving the problem.'});}
  finally{if(!allowQuit){operationBusy=false;setBackup({busy:false});}}
}
async function restoreBackup(){
  if(operationBusy)throw Error('Wait for the current backup or update to finish.');
  const selected=await dialog.showOpenDialog(win,{title:'Restore saved shop data from backup',defaultPath:Backup.backupRoot(app.getPath('userData')),properties:['openFile'],filters:[{name:'Backup manifest (backup.json)',extensions:['json']}]});
  if(selected.canceled)return {canceled:true};
  operationBusy=true;setBackup({busy:true,message:'Verifying the selected backup...'});
  try{
    const checked=await Backup.verifyBackup(path.dirname(selected.filePaths[0]));
    const decision=await dialog.showMessageBox(win,{type:'question',buttons:['Restore saved shop data','Cancel'],defaultId:1,cancelId:1,title:'Restore shop data',message:`Restore the saved shop data from version ${checked.manifest.appVersion}?`,detail:`Backup created: ${checked.manifest.createdAt}\nThis restores coins, premiums, chosen-list selections and saved settings. Current shop data will be backed up first. The application executable and unsaved quote drafts are not restored by this action.`});
    if(decision.response!==0)return {canceled:true};
    await makeBackup({},'before-restore',false);
    operationBusy=false;settings=saveSettings({...checked.settings,catalogVersion:1});operationBusy=true;
    setBackup({message:'Saved shop data restored. Current data was backed up first.'});
    return {canceled:false,settings};
  }catch(e){setBackup({message:'Restore failed; current settings retained: '+e.message});throw e;}
  finally{operationBusy=false;setBackup({busy:false});}
}
async function refresh() {
  if (busy) return priceState();
  busy = true;
  send('prices', priceState());
  try {
    const response = await net.fetch(WIDGET_URL, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (!response.ok) throw Error(`APMEX returned HTTP ${response.status}.`);
    const html = await response.text();
    if (html.length > 2000000) throw Error('APMEX response is unexpectedly large.');
    snapshot = parseWidget(html);
    spotError = '';
  } catch (e) { spotError = `Refresh failed: ${e.message}. Last prices retained; manual entry is available.`; }
  finally { busy = false; send('prices', priceState()); }
  return priceState();
}
function setUpdate(status, message) {
  updateState = { status, message }; send('update', updateState);
}
async function checkUpdates() {
  if (!app.isPackaged) { setUpdate('idle', 'Updates are available in the installed Windows app.'); return updateState; }
  if (updateBusy || downloaded || operationBusy) return updateState;
  updateBusy = true;
  setUpdate('checking', 'Checking GitHub for updates…');
  try { await autoUpdater.checkForUpdates(); }
  catch (e) { setUpdate('error', `Update check failed: ${e.message}`); }
  finally { updateBusy = false; }
  return updateState;
}
function secureWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', e => e.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
}
app.whenReady().then(async () => {
  if(!primaryInstance)return;
  loadSettings();
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1180, height: 900, minWidth: 900, minHeight: 700,
    backgroundColor: '#101820', title: 'Pawnshop Metals Calculator', show:!process.argv.includes('--backup-smoke-test'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  secureWindow(win);
  win.on('close',e=>{if(operationBusy && !allowQuit)e.preventDefault();});
  ipcMain.handle('initial', () => ({ settings, prices: priceState(), update: updateState, backup:backupState, version: app.getVersion() }));
  ipcMain.handle('refresh', () => refresh());
  ipcMain.handle('settings', (_event, value) => saveSettings(value));
  ipcMain.handle('copy-text', async (_event,text) => {
    if(typeof text !== 'string' || text.length > 1000000) throw Error('Invalid clipboard text.');
    await clipboard.writeText(text);
  });
  ipcMain.handle('export-setup', () => exportSetup());
  ipcMain.handle('import-setup', () => importSetup());
  ipcMain.handle('check-update', () => checkUpdates());
  ipcMain.handle('install-update', (_event,session) => protectedUpdate(session));
  ipcMain.handle('backup-now',(_event,session)=>manualBackup(session));
  ipcMain.handle('restore-backup',()=>restoreBackup());
  ipcMain.handle('open-backups',async()=>{const folder=Backup.backupRoot(app.getPath('userData'));await fs.promises.mkdir(folder,{recursive:true});const error=await shell.openPath(folder);if(error)throw Error(error);});
  ipcMain.handle('open-source', () => shell.openExternal('https://www.apmex.com/widgets/gold-silver-spot-price-tracker'));
  ipcMain.handle('open-widget', () => shell.openExternal(WIDGET_URL));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', e => {
    if(allowQuit){allowQuit=false;operationBusy=false;setBackup({busy:false,message:'The backup is safe, but update installation failed: '+e.message});}
    setUpdate(downloaded?'ready':'error', `Updates unavailable: ${e.message}`);
  });
  autoUpdater.on('update-available', info => setUpdate('downloading', `Downloading version ${info.version}…`));
  autoUpdater.on('update-not-available', () => setUpdate('current', 'You have the latest version.'));
  autoUpdater.on('download-progress', p => setUpdate('downloading', `Downloading update: ${Math.round(p.percent)}%`));
  autoUpdater.on('update-downloaded', info => { downloaded = true; downloadedVersion=info.version; setUpdate('ready', `Version ${info.version} is ready. Back up and install when convenient.`); });
  await win.loadFile(path.join(__dirname, 'index.html'));
  if(process.argv.includes('--backup-smoke-test')){
    try{
      if(!app.isPackaged)throw Error('This check must run from the packaged Windows app.');
      settings.premiums.Silver='31';settings.compactCoinIds=['generic-us-90-dimes'];saveSettings(settings);
      const session=await win.webContents.executeJavaScript('(async()=>{await startup;return collectBackupSession();})()');
      let installed=false;downloadedVersion='next-version-test';
      const full=await Backup.installAfterBackup({create:()=>makeBackup(session,'before-update',true),install:checked=>{
        if(checked.settings.premiums.Silver!=='31' || !checked.settings.compactCoinIds.includes('generic-us-90-dimes'))throw Error('Shop data did not survive the full backup.');
        installed=true;
      }});
      if(!installed || !full.manifest.files.some(f=>f.path==='application/resources/app.asar'))throw Error('Full backup gate failed.');
      const data=Backup.backupRoot(app.getPath('userData'));
      console.log('Packaged Windows full-app backup verified:',full.manifest.files.length,'files. Root:',data);
      await fs.promises.writeFile(path.join(process.cwd(),'backup-validation.json'),JSON.stringify({passed:true,version:app.getVersion(),files:full.manifest.files.length,application:full.manifest.includesApplication,coins:full.settings.coins.length,installHookReachedAfterVerification:installed},null,2));
      app.exit(0);
    }catch(e){console.error(e);app.exit(1);}return;
  }
  if (process.argv.includes('--smoke-test')) {
    try {
      const result = await win.webContents.executeJavaScript(`(async () => {
        await startup;
        const set = (id,value) => { const el=document.getElementById(id); el.value=value; el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('input',{bubbles:true})); };
        set('mode','manual'); set('manual','51.02');
        if (document.querySelector('#each').textContent !== '$63.78') throw Error('Manual quote failed');
        set('quantity','10');
        if (document.querySelector('#total').textContent !== '$637.80') throw Error('Quantity total failed');
        set('quantity','1');
        const snapshot={ prices:{Silver:{bid:'47.60',ask:'51.02'},Gold:{bid:'2300.00',ask:'2400.00'},Platinum:{bid:'1450.00',ask:'1500.00'}}, sourceTime:'TEST FIXTURE', asOf:new Date().toISOString() };
        showPrices({snapshot,fresh:true,error:''}); set('mode','live');
        if (document.querySelector('#each').textContent !== '$63.78') throw Error('Live quote failed');
        showPrices({snapshot,fresh:false,error:''});
        if (!document.querySelector('#copy').disabled || document.querySelector('#each').textContent !== '—') throw Error('Stale quote was not blocked');
        set('mode','manual');
        showPrices({fresh:false,error:'Offline test; manual spot remains available.'});
        applyCoin(settings.coins.find(c=>c.id==='roosevelt-dime'));
        if(document.querySelector('#each').textContent !== '$4.61') throw Error('Dime percentage quote failed');
        if(!document.querySelector('#formula').textContent.includes('2.25 g')) throw Error('Fine grams missing from equation');
        set('premiumType','dollars'); set('premium','1');
        if(document.querySelector('#each').textContent !== '$4.69') throw Error('Dime dollar premium failed');
        const draft=coinDraft();
        const saved=await desktop.saveSettings({...settings,coins:settings.coins.map(c=>c.id===draft.id?draft:c)});
        if(saved.coins.find(c=>c.id===draft.id).premiumType !== 'dollars') throw Error('Coin save failed');
        settings=saved;
        const roundtrip=Catalog.importSetup(JSON.parse(JSON.stringify(Catalog.exportSetup(settings))));
        if(roundtrip.coins.find(c=>c.id===draft.id).premium!=='1') throw Error('Setup sharing failed');
        settings.coins.push({...draft,id:'custom-smoke-coin',name:'Custom test coin'});
        settings=await desktop.saveSettings(settings);
        applyCoin(settings.coins.find(c=>c.id==='morgan-dollar'));
        if(document.querySelector('#weight').value!=='26.73') throw Error('Morgan selection failed');
        applyCoin(settings.coins.find(c=>c.id==='roosevelt-dime'));
        return { price:document.querySelector('#each').textContent, error:document.querySelector('#error').textContent };
      })()`);
      if (result.price !== '$4.69' || result.error) throw Error(JSON.stringify(result));
      const compactCheck=await win.webContents.executeJavaScript(`(async()=>{
        const ids=['silver-eagle','roosevelt-dime','mercury-dime','barber-dime','washington-quarter','standing-quarter','barber-quarter','walking-half','franklin-half','kennedy-1964','morgan-dollar','peace-dollar'];
        settings.coins=settings.coins.map(c=>ids.includes(c.id)?{...c,premium:'25',premiumType:'percent'}:c);
        settings=await desktop.saveSettings(settings);
        chosenDraft=new Set(ids);await saveChosenList();
        const reloaded=await desktop.initial();
        if(reloaded.settings.compactCoinIds.length!==12)throw Error('Chosen coins did not persist');
        if(Catalog.importSetup(Catalog.exportSetup(reloaded.settings)).compactCoinIds.length!==12)throw Error('Chosen list did not share');
        document.querySelector('#compactMode').value='manual';document.querySelector('#compactSilver').value='51.02';
        showView('compact');drawChoices();renderCompact();
        const rows=[...document.querySelectorAll('#compactRows tr')];
        if(rows.length!==5)throw Error('Expected five grouped rows, got '+rows.length);
        const dimes=rows.find(r=>r.dataset.members.includes('roosevelt-dime'));
        if(!dimes || dimes.querySelectorAll('.compact-name').length!==3 || !dimes.textContent.includes('$4.61'))throw Error('Dime group failed');
        const equation=dimes.querySelector('.compact-equation').textContent;
        if(!equation.includes('2.5') || !equation.includes('90/100') || !equation.includes('31.1034768'))throw Error('Compact equation missing numbers');
        if(document.querySelector('#copyList').disabled)throw Error('Valid list cannot be copied');
        document.querySelector('#compactMode').value='live';renderCompact();
        if(!document.querySelector('#copyList').disabled || [...document.querySelectorAll('#compactRows tr')].some(r=>r.lastElementChild.textContent!=='-'))throw Error('Stale compact prices not blocked');
        document.querySelector('#compactMode').value='manual';renderCompact();
        document.querySelector('#compactMessage').textContent='Example list using a manually entered $51.02 silver spot price.';
        document.querySelector('#coinChooser').open=false;
        document.querySelector('#compactKind').value='generic';drawChoices();
        const genericInputs=[...document.querySelectorAll('#coinChoices input')];
        if(!genericInputs.some(el=>el.value==='generic-us-90-dimes') || genericInputs.some(el=>!Catalog.isGeneric(settings.coins.find(c=>c.id===el.value))))throw Error('Generic chooser filter failed');
        chosenDraft=new Set(['generic-us-90-dimes','generic-us-90-quarters','generic-us-90-halves','generic-us-90-dollars','generic-us-40-halves']);await saveChosenList();renderCompact();
        if(document.querySelectorAll('#compactRows tr').length!==5)throw Error('Generic list expected five rows');
        const genericDime=[...document.querySelectorAll('#compactRows tr')].find(r=>r.dataset.members==='generic-us-90-dimes');
        if(!genericDime || !genericDime.querySelector('.compact-name').textContent.includes('1892-1964') || !genericDime.textContent.includes('$4.61'))throw Error('Generic dime years or value missing');
        if(!(await desktop.initial()).settings.compactCoinIds.includes('generic-us-90-dimes'))throw Error('Generic choices not saved');
        document.querySelector('#compactMessage').textContent='Generic groups with years. Example: manually entered $51.02 silver spot price.';
        document.querySelector('#compactPriceControls').open=false;
        if(document.querySelector('#compactRows tr').getBoundingClientRect().top>=innerHeight)throw Error('Compact coin rows are below the visible window');
        document.querySelector('#compactView').scrollIntoView({block:'start'});
        return rows.length;
      })()`);
      console.log('Compact list renderer checks passed:',compactCheck,'grouped rows');
      await win.webContents.executeJavaScript('desktop.copyText(compactText)');
      if(!(await clipboard.readText()).includes('MY COIN PRICE LIST')) throw Error('List clipboard copy failed');
      console.log('Windows renderer smoke test passed:', result.price);
      await win.webContents.executeJavaScript(`(()=>{
        if(!document.querySelector('#backupNow') || !document.querySelector('#restoreBackup') || !document.querySelector('#openBackups'))throw Error('Backup controls missing');
        showBackup({busy:true,message:'TEST backup in progress'});
        if(!document.querySelector('main').inert || document.querySelector('#backupOverlay').hidden)throw Error('Backup did not protect editing');
        showBackup({busy:false,message:'Before installing an update, the full current app and shop data are backed up and verified.'});
        if(document.querySelector('main').inert)throw Error('Backup lock was not released');
        document.querySelector('#updateCenter').open=true;document.querySelector('#updateCenter').scrollIntoView({block:'start'});
      })()`);
      const preview = await win.webContents.capturePage();
      fs.writeFileSync(path.join(process.cwd(), 'app-preview.png'), preview.toPNG());
      app.exit(0);
    } catch (e) { console.error(e); app.exit(1); }
    return;
  }
  refresh(); checkUpdates();
  setInterval(() => { if (settings.autoRefresh) refresh(); }, 5 * 60000).unref();
  setInterval(() => send('prices', priceState()), 30000).unref();
  setInterval(checkUpdates, 4 * 60 * 60000).unref();
});
app.on('window-all-closed', () => app.quit());
