'use strict';
let fs;
try{fs=require('original-fs');}catch{fs=require('node:fs');}
const fsp=fs.promises;
const path=require('node:path');
const crypto=require('node:crypto');
const Catalog=require('./catalog');
const backupRoot=userData=>path.join(userData,'Backups');
const contained=(root,target)=>{const rel=path.relative(path.resolve(root),path.resolve(target));return rel!=='' && !rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel);};
function safeFile(root,relative) {
  if(typeof relative!=='string' || !relative || /[\\:\0]/.test(relative) || path.posix.isAbsolute(relative) || relative.split('/').some(p=>!p || p==='.' || p==='..'))throw Error('Unsafe backup file path.');
  const result=path.resolve(root,...relative.split('/'));if(!contained(root,result))throw Error('Backup path escapes its folder.');return result;
}
async function hashFile(file) {
  const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
async function rejectLinks(root,relative) {
  let current=root;
  for(const part of relative.split('/')) {current=path.join(current,part);if((await fsp.lstat(current)).isSymbolicLink())throw Error('Backup contains a symbolic link.');}
}
async function listFiles(root,relative='') {
  const files=[];
  for(const entry of await fsp.readdir(path.join(root,relative),{withFileTypes:true})) {
    const rel=relative?relative+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw Error('Application backup cannot include symbolic links.');
    if(entry.isDirectory())files.push(...await listFiles(root,rel));
    else if(entry.isFile())files.push(rel);else throw Error('Application contains an unsupported file type.');
    if(files.length>20000)throw Error('Application has too many files to back up.');
  }
  return files.sort();
}
async function verifyBackup(directory,onProgress=()=>{}) {
  const manifestFile=path.join(directory,'backup.json');
  if((await fsp.stat(manifestFile)).size>10000000)throw Error('Backup manifest is too large.');
  const manifest=JSON.parse(await fsp.readFile(manifestFile,'utf8'));
  if(manifest.format!=='pawnshop-metals-backup' || manifest.formatVersion!==1 || !Array.isArray(manifest.files) || manifest.files.length>20000)throw Error('Unsupported backup manifest.');
  const paths=new Set();let done=0;
  for(const file of manifest.files) {
    const target=safeFile(directory,file.path);
    if(paths.has(file.path) || !Number.isSafeInteger(file.bytes) || file.bytes<0 || !/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid backup file record.');
    paths.add(file.path);await rejectLinks(directory,file.path);
    const stat=await fsp.stat(target);
    if(!stat.isFile() || stat.size!==file.bytes || await hashFile(target)!==file.sha256)throw Error('Backup verification failed: '+file.path);
    onProgress({phase:'verifying',done:++done,total:manifest.files.length});
  }
  for(const required of ['shop-setup.json','settings.json','session-draft.json'])if(!paths.has(required))throw Error('Backup is missing '+required);
  if(manifest.includesApplication) {
    if(!paths.has('application/resources/app.asar') || typeof manifest.executable!=='string' || !paths.has(manifest.executable))throw Error('Backup does not contain a complete application.');
  }
  const setupFile=path.join(directory,'shop-setup.json');
  if((await fsp.stat(setupFile)).size>2*1024*1024)throw Error('Backed-up shop setup is too large.');
  const settings=Catalog.importSetup(JSON.parse(await fsp.readFile(setupFile,'utf8')));
  return {directory,manifest,settings,verified:true};
}
async function createBackup({userDataDir,appDir=null,executableName='',version,targetVersion='',settings,session={},reason='manual',onProgress=()=>{},copyFile=fsp.copyFile}) {
  const config=Catalog.validateConfig(settings);
  const sessionJson=JSON.stringify(session,null,2);
  if(!sessionJson || Buffer.byteLength(sessionJson)>2*1024*1024)throw Error('Unsaved session is too large to back up.');
  const root=backupRoot(userDataDir);
  if(appDir && (path.resolve(appDir)===path.resolve(userDataDir) || contained(appDir,userDataDir) || contained(root,appDir)))throw Error('Application and backup folders overlap. Install updates from the regular installed app.');
  let applicationFiles=[];
  if(appDir) {
    applicationFiles=await listFiles(appDir);
    if(!applicationFiles.includes('resources/app.asar') || !applicationFiles.includes(executableName))throw Error('Installed application files could not be identified.');
  }
  await fsp.mkdir(root,{recursive:true});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const cleanVersion=String(version).replace(/[^\w.-]/g,'_');
  const directory=path.join(root,`${stamp}_v${cleanVersion}_${crypto.randomUUID().slice(0,8)}`);
  const stage=path.join(root,'.pending-'+crypto.randomUUID());await fsp.mkdir(stage);
  const files=[];let done=0;const total=applicationFiles.length+4;
  async function record(relative) {
    const target=safeFile(stage,relative), stat=await fsp.stat(target);
    files.push({path:relative,bytes:stat.size,sha256:await hashFile(target)});
    onProgress({phase:'copying',done:++done,total});
  }
  async function write(relative,data) {const target=safeFile(stage,relative);await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.writeFile(target,data);await record(relative);}
  try {
    await write('shop-setup.json',JSON.stringify(Catalog.exportSetup(config),null,2));
    let original;
    try{original=await fsp.readFile(path.join(userDataDir,'settings.json'));}catch(e){if(e.code!=='ENOENT')throw e;original=Buffer.from(JSON.stringify(config,null,2));}
    await write('settings.json',original);
    await write('session-draft.json',sessionJson);
    for(const relative of applicationFiles) {
      const from=safeFile(appDir,relative),to=safeFile(stage,'application/'+relative);
      await fsp.mkdir(path.dirname(to),{recursive:true});await copyFile(from,to);
      await record('application/'+relative);
      if(await hashFile(from)!==files[files.length-1].sha256)throw Error('An application file changed during backup: '+relative);
    }
    const manifest={format:'pawnshop-metals-backup',formatVersion:1,createdAt:new Date().toISOString(),appVersion:String(version),targetVersion:String(targetVersion),reason,includesApplication:!!appDir,
      executable:appDir?'application/'+executableName:null,files};
    await write('RECOVERY.txt',`Pawnshop Metals Calculator backup\nVersion: ${version}\nCreated: ${manifest.createdAt}\n\nUse Updates & backups -> Restore shop data, then choose backup.json in this folder.\nThe complete prior application is in application/ when included. Close the app before manually recovering program files, or reinstall that version from GitHub Releases.\nsettings.json preserves the original settings file. shop-setup.json is the validated shop setup. session-draft.json records unsaved form values and pending selections; those drafts are not applied automatically. Verify old manual spot prices before using them.\nKeep this folder and backup.json together.\n`);
    await fsp.writeFile(path.join(stage,'backup.json'),JSON.stringify(manifest,null,2));
    await verifyBackup(stage,onProgress);
    await fsp.rename(stage,directory);
    return {directory,manifest,settings:config,verified:true};
  } catch(e) {
    if(contained(root,stage) && path.basename(stage).startsWith('.pending-'))await fsp.rm(stage,{recursive:true,force:true}).catch(()=>{});
    throw e;
  }
}
async function installAfterBackup({create,install,verify=verifyBackup}) {
  const backup=await create();
  const checked=await verify(backup.directory);
  if(!checked.verified || !checked.manifest.includesApplication)throw Error('A verified full application backup is required before updating.');
  await install(checked);
  return checked;
}
module.exports={backupRoot,safeFile,hashFile,createBackup,verifyBackup,installAfterBackup};
