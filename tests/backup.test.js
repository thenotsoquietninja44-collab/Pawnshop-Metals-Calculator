const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const B=require('../src/backup');
const Catalog=require('../src/catalog');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pawnshop-backup-test-'));
  t.after(async()=>{const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('pawnshop-backup-test-'));await fs.rm(resolved,{recursive:true,force:true});});
  const appDir=path.join(root,'installed'),userDataDir=path.join(root,'data');
  await fs.mkdir(path.join(appDir,'resources'),{recursive:true});await fs.mkdir(userDataDir);
  await fs.writeFile(path.join(appDir,'Shop.exe'),'old executable');await fs.writeFile(path.join(appDir,'resources','app.asar'),'old application archive');
  const settings={coins:Catalog.defaults(),premiums:{Silver:'31',Gold:'0',Platinum:'0'},side:'ask',autoRefresh:true,compactCoinIds:['roosevelt-dime'],catalogVersion:1};
  await fs.writeFile(path.join(userDataDir,'settings.json'),JSON.stringify(settings));
  return {root,appDir,userDataDir,executableName:'Shop.exe',version:'0.5.0',targetVersion:'0.6.0',settings,session:{manualSilver:'51.02',draftPremium:'1'},reason:'before-update'};
}
test('full backup preserves program, saved setup and unsaved drafts and verifies before install',async t=>{
  const input=await fixture(t);let installed=false;
  const checked=await B.installAfterBackup({create:()=>B.createBackup(input),install:async backup=>{
    assert.equal(backup.settings.premiums.Silver,'31');assert.deepEqual(backup.settings.compactCoinIds,['roosevelt-dime']);
    assert.equal(await fs.readFile(path.join(backup.directory,'application/resources/app.asar'),'utf8'),'old application archive');installed=true;
  }});
  assert.ok(installed);assert.equal(checked.manifest.targetVersion,'0.6.0');assert.ok(checked.manifest.includesApplication);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(checked.directory,'session-draft.json'),'utf8')),input.session);
  assert.equal(await fs.readFile(path.join(checked.directory,'settings.json'),'utf8'),JSON.stringify(input.settings));
  assert.ok(checked.manifest.files.some(f=>f.path==='RECOVERY.txt'));
});
test('changed backup file prevents installation',async t=>{
  const input=await fixture(t),backup=await B.createBackup(input);let installed=false;
  await fs.writeFile(path.join(backup.directory,'application/Shop.exe'),'tampered');
  await assert.rejects(B.installAfterBackup({create:async()=>backup,install:()=>{installed=true;}}),/verification failed/);assert.equal(installed,false);
});
test('copy failure leaves original intact and publishes no partial backup',async t=>{
  const input=await fixture(t);let installed=false;
  await assert.rejects(B.installAfterBackup({create:()=>B.createBackup({...input,copyFile:async()=>{throw Error('Disk full');}}),install:()=>{installed=true;}}),/Disk full/);
  assert.equal(installed,false);assert.deepEqual(await fs.readdir(B.backupRoot(input.userDataDir)),[]);
  assert.equal(await fs.readFile(path.join(input.appDir,'Shop.exe'),'utf8'),'old executable');
});
test('data-only restore safety snapshot cannot authorize an application update',async t=>{
  const input=await fixture(t),backup=await B.createBackup({...input,appDir:null});let installed=false;
  assert.ok((await B.verifyBackup(backup.directory)).verified);
  await assert.rejects(B.installAfterBackup({create:async()=>backup,install:()=>{installed=true;}}),/full application backup/);assert.equal(installed,false);
});
test('fresh installation without settings file still gets a valid backup',async t=>{
  const input=await fixture(t);await fs.unlink(path.join(input.userDataDir,'settings.json'));
  const result=await B.createBackup(input);assert.equal((await B.verifyBackup(result.directory)).settings.coins.length,25);
});
test('missing application archive fails before update',async t=>{
  const input=await fixture(t);await fs.unlink(path.join(input.appDir,'resources/app.asar'));
  await assert.rejects(B.createBackup(input),/could not be identified/);
});
test('unsafe and duplicate manifest paths are rejected',async t=>{
  const input=await fixture(t),backup=await B.createBackup(input);
  for(const unsafe of ['../outside','/absolute','C:/outside','application/../../outside','a\\b'])assert.throws(()=>B.safeFile(backup.directory,unsafe));
  const manifest=backup.manifest;manifest.files.push(manifest.files[0]);await fs.writeFile(path.join(backup.directory,'backup.json'),JSON.stringify(manifest));
  await assert.rejects(B.verifyBackup(backup.directory),/Invalid backup file record/);
});
