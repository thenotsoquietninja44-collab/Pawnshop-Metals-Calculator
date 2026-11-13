'use strict';
const $ = id => document.getElementById(id);
const metals = ['Silver', 'Gold', 'Platinum'];
let settings = { premiums: { Silver: '25', Gold: '0', Platinum: '0' }, side: 'ask', autoRefresh: true };
let priceState = {}, result = null, quoteText = '';
let currentCoinId = null;
let genericDraft=false;
let chosenDraft=null, compactText='';
function drawCatalog() {
  const query = $('coinSearch').value.toLowerCase();
  const kind=$('catalogKind').value;
  $('coinList').replaceChildren(...(settings.coins || []).filter(c=>(kind==='all' || Catalog.isGeneric(c)===(kind==='generic')) && (c.name+' '+c.notes).toLowerCase().includes(query)).map(c=>{
    const option = document.createElement('option'); option.value=c.id;
    option.textContent=c.name+' | +'+c.premium+(c.premiumType === 'percent' ? '%' : ' USD/coin');
    option.selected=c.id === currentCoinId; return option;
  }));
  if (currentCoinId) $('coinList').value=currentCoinId;
  drawChoices(); renderCompact();
}
function applyCoin(coin) {
  currentCoinId=coin?.id || null;
  if (!coin) return;
  genericDraft=Catalog.isGeneric(coin);
  for (const id of ['metal','weight','unit','weightMode','purity','karat','premiumType','premium']) $(id).value=coin[id];
  $('coinName').value=coin.name; $('coinNotes').value=coin.notes; $('quantity').value='1';
  $('coinInfo').textContent=coin.notes;
  $('catalogMessage').textContent='Saved coin loaded. Edit any numbers below, then save to keep your changes.';
  drawCatalog(); calculate();
}
function coinDraft() {
  const old=(settings.coins || []).find(c=>c.id===currentCoinId);
  return Catalog.validateCoin({ id:currentCoinId || 'custom-'+crypto.randomUUID(), name:$('coinName').value,
    ...Object.fromEntries(['metal','weight','unit','weightMode','purity','karat','premiumType','premium'].map(id=>[id,$(id).value])), ...(genericDraft?{genericGroup:true}:{}), notes:$('coinNotes').value, source:old?.source || '' });
}
function loadRules() {
  if(chosenDraft===null) chosenDraft=new Set(settings.compactCoinIds || []);
  $('side').value=settings.side; $('autoRefresh').checked=settings.autoRefresh;
  for (const m of metals) $('rule'+m).value=settings.premiums[m];
}
const usd = value => {
  const [whole, fraction = ''] = String(value).split('.');
  return '$' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
};
function showPrices(state) {
  priceState = state;
  $('cards').replaceChildren(...metals.map(metal => {
    const card = document.createElement('article'); card.className = 'metal-card';
    const h = document.createElement('h3'); h.textContent = metal.toUpperCase();
    const price = state.snapshot?.prices?.[metal];
    const strong = document.createElement('strong'); strong.textContent = price ? usd(price[settings.side]) : '—';
    const small = document.createElement('small'); small.textContent = price ? `Bid ${usd(price.bid)} / Ask ${usd(price.ask)}` : 'Waiting for APMEX';
    card.append(h, strong, small); return card;
  }));
  $('feed').textContent = state.error || (state.snapshot ? `${state.fresh ? 'Received' : 'STALE'} · ${state.snapshot.sourceTime} · ${settings.side.toUpperCase()} selected` : 'No APMEX prices yet. You can enter spot manually.');
  $('refresh').disabled = !!state.busy;
  $('refresh').textContent = state.busy ? 'Refreshing…' : 'Refresh prices';
  calculate();
  renderCompact();
}
function calculate() {
  result = null; quoteText = '';
  const metal = $('metal').value, manual = $('mode').value === 'manual', gross = $('weightMode').value === 'gross';
  const useKarat = gross && metal === 'Gold' && $('karat').value;
  const dollarPremium = $('premiumType').value === 'dollars';
  $('premiumLabel').textContent=dollarPremium ? 'Dollars added per coin ($)' : 'Premium above spot (%)';
  $('manual').disabled = !manual; $('karat').disabled = !gross || metal !== 'Gold'; $('purity').disabled = !gross || !!useKarat;
  $('weightHint').textContent = gross ? 'Use metal-only gross weight. Remove stones and non-metal parts before weighing. Purity is applied once.' : 'For a coin containing 1 fine troy ounce, enter 1 ozt. Purity is already accounted for.';
  $('error').textContent = ''; $('quoteStatus').textContent = '';
  $('copy').disabled = true;
  try {
    let spot;
    if (manual) {
      spot = $('manual').value;
      $('quoteStatus').textContent = 'MANUAL SPOT — APMEX refreshes will not change this quote.';
    } else {
      if (!priceState.snapshot) throw Error('Waiting for APMEX. Choose manual spot to quote without the feed.');
      if (!priceState.fresh || priceState.error) throw Error('APMEX data is stale or refresh failed. Refresh successfully or enter a verified manual spot price.');
      spot = priceState.snapshot.prices[metal][settings.side];
      $('quoteStatus').textContent = `APMEX ${settings.side.toUpperCase()} · ${priceState.snapshot.sourceTime}`;
    }
    result = Pricing.calculate({ spot, weight: $('weight').value, unit: $('unit').value,
      purity: gross ? $('purity').value : '100', karat: useKarat || '', premium: $('premium').value, premiumType:$('premiumType').value, quantity: $('quantity').value });
    $('each').textContent = usd(result.each); $('total').textContent = usd(result.total);
    $('fine').textContent = `${result.fineGrams} g / ${result.fineOzt} ozt`; $('melt').textContent = usd(result.melt); $('count').textContent = result.quantity;
    const factor=useKarat ? `${$('karat').value}/24` : `${gross ? $('purity').value : '100'}/100`;
    const conversion=$('unit').value==='g' ? ' / 31.1034768' : $('unit').value==='dwt' ? ' / 20' : '';
    const content=`(${$('weight').value}${conversion} x ${factor})`;
    const base=`${content} x ${usd(spot)}`;
    const sale=dollarPremium ? `(${base}) + $${$('premium').value}` : `(${base}) x (1 + ${$('premium').value}/100)`;
    $('formula').textContent = `${$('coinName').value || metal}\nFine content: ${result.fineGrams} g = approximately ${result.fineOzt} ozt\nMelt: ${base} = approximately $${result.unroundedMelt}\nSell: ${sale}\nRound to cents: approximately $${result.unroundedSell} -> ${usd(result.each)} per coin\nTotal: ${result.quantity} x ${usd(result.each)} = ${usd(result.total)}`;
    quoteText = $('formula').textContent + `\nSpot source: ${manual ? 'manual' : 'APMEX '+settings.side+' '+priceState.snapshot.sourceTime}\nPremium: ${dollarPremium ? '$'+$('premium').value+' per coin' : $('premium').value+'%'}\nBefore tax. Fine-content figures shown to 8 decimals; calculations use full precision. Quantity multiplies the rounded unit price.`;
    $('copy').disabled = false;
  } catch (e) {
    $('error').textContent = e.message;
    for (const id of ['each', 'total', 'fine', 'melt']) $(id).textContent = '—';
    $('formula').textContent = 'Enter valid values to calculate'; $('count').textContent = $('quantity').value;
  }
}
$('quote').addEventListener('submit', e => e.preventDefault());
$('quote').addEventListener('input', e => { if (!['manual','quantity'].includes(e.target.id)) $('catalogMessage').textContent='Unsaved coin edits. Save this coin setup before switching or exporting.'; calculate(); });
$('quote').addEventListener('change', e => { if (e.target.id === 'metal' && !currentCoinId) $('premium').value = settings.premiums[$('metal').value]; calculate(); });
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  $('metal').value = button.dataset.preset[0].toUpperCase() + button.dataset.preset.slice(1);
  $('weight').value = '1'; $('unit').value = 'ozt'; $('weightMode').value = 'fine'; $('quantity').value = '1'; $('karat').value = '';
  $('premium').value = settings.premiums[$('metal').value]; calculate();
}));
$('refresh').addEventListener('click', async () => { try { showPrices(await desktop.refresh()); } catch (e) { $('feed').textContent = e.message; } });
$('save').addEventListener('click', async () => {
  try {
    settings = await desktop.saveSettings({ ...settings, premiums: Object.fromEntries(metals.map(m => [m, $('rule' + m).value])), side: $('side').value, autoRefresh: $('autoRefresh').checked });
    $('saved').textContent = 'Default rules saved. Existing per-coin premiums are unchanged.'; showPrices(priceState);
  } catch (e) { $('saved').textContent = 'Could not save: ' + e.message; }
});
$('copy').addEventListener('click', async () => {
  try { await desktop.copyText(quoteText); $('quoteStatus').textContent = 'Quote copied.'; }
  catch { $('quoteStatus').textContent = 'Clipboard unavailable.'; }
});
$('source').addEventListener('click', () => desktop.openSource());
$('widget').addEventListener('click', () => desktop.openWidget());
function showUpdate(state) {
  $('updateMessage').textContent = state.message; $('install').hidden = state.status !== 'ready'; $('updates').disabled = ['checking', 'downloading','installing'].includes(state.status);
  if(['ready','error','installing'].includes(state.status))$('updateCenter').open=true;
}
$('updates').addEventListener('click', async () => showUpdate(await desktop.checkUpdate()));
$('install').addEventListener('click', async () => {try{await desktop.installUpdate(collectBackupSession());}catch(e){$('backupMessage').textContent='Update could not start: '+e.message;}});
function collectBackupSession(){
  const quote=Object.fromEntries(['metal','weight','unit','weightMode','purity','karat','premiumType','premium','quantity','manual','mode','coinName','coinNotes'].map(id=>[id,$(id).value]));
  return {capturedAt:new Date().toISOString(),quote,currentCoinId,genericDraft,pendingChosenCoinIds:[...(chosenDraft || [])],
    compactMode:$('compactMode').value,manualCompactSpots:Object.fromEntries(metals.map(m=>[m,$('compact'+m).value])),
    note:'Unsaved form snapshot for recovery. Verify historical manual spot prices before using them.'};
}
function showBackup(state){
  $('backupMessage').textContent=state.message;
  $('backupOverlay').hidden=!state.busy;$('backupOverlayMessage').textContent=state.message;
  document.querySelector('main').inert=!!state.busy;document.querySelector('header').inert=!!state.busy;
  if(state.busy || state.lastPath)$('updateCenter').open=true;
}
$('headerUpdates').addEventListener('click',()=>{$('updateCenter').open=true;$('updateCenter').scrollIntoView({behavior:'smooth',block:'start'});});
$('backupNow').addEventListener('click',async()=>{try{await desktop.backupNow(collectBackupSession());}catch(e){$('backupMessage').textContent='Backup failed: '+e.message;}});
$('openBackups').addEventListener('click',async()=>{try{await desktop.openBackups();}catch(e){$('backupMessage').textContent='Could not open backups: '+e.message;}});
$('restoreBackup').addEventListener('click',async()=>{
  try{const restored=await desktop.restoreBackup();if(restored.canceled)return;
    settings=restored.settings;chosenDraft=null;currentCoinId=null;$('coinSearch').value='';loadRules();
    if(settings.coins.length)applyCoin(settings.coins[0]);else{drawCatalog();$('addCoin').click();}
    showPrices(priceState);$('backupMessage').textContent='Saved shop data restored. Previous settings were backed up first.';
  }catch(e){$('backupMessage').textContent='Could not restore shop data: '+e.message;}
});
desktop.onPrices(showPrices); desktop.onUpdate(showUpdate);
desktop.onBackup(showBackup);
$('coinSearch').addEventListener('input',drawCatalog);
$('catalogKind').addEventListener('change',drawCatalog);
$('coinList').addEventListener('change',()=>applyCoin(settings.coins.find(c=>c.id===$('coinList').value)));
$('saveCoin').addEventListener('click',async()=>{
  try {
    const coin=coinDraft(), coins=settings.coins.filter(c=>c.id!==coin.id);
    const index=settings.coins.findIndex(c=>c.id===coin.id);
    coins.splice(index < 0 ? coins.length : index,0,coin);
    settings=await desktop.saveSettings({...settings,coins}); currentCoinId=coin.id;
    drawCatalog(); $('catalogMessage').textContent='Coin setup saved. It will be included in exports.';
    $('coinInfo').textContent=coin.notes;
  } catch(e) { $('catalogMessage').textContent='Could not save coin: '+e.message; }
});
$('addCoin').addEventListener('click',()=>{
  genericDraft=false;
  currentCoinId=null; $('coinName').value='New coin'; $('coinNotes').value=''; $('weight').value='1'; $('unit').value='ozt';
  $('weightMode').value='fine'; $('purity').value='100'; $('karat').value=''; $('premiumType').value='percent';
  $('premium').value=settings.premiums[$('metal').value]; $('coinInfo').textContent='';
  drawCatalog(); $('coinList').selectedIndex=-1; calculate(); $('catalogMessage').textContent='New coin draft. Enter its specifications and save.'; $('coinName').focus();
});
$('duplicateCoin').addEventListener('click',()=>{
  currentCoinId=null; $('coinName').value+=' (copy)'; drawCatalog(); $('coinList').selectedIndex=-1;
  $('catalogMessage').textContent='Duplicate draft. Edit it and save as a new coin.'; calculate();
});
$('addGeneric').addEventListener('click',()=>{
  $('addCoin').click();genericDraft=true;$('metal').value='Silver';$('weightMode').value='gross';$('unit').value='g';$('weight').value='1';$('purity').value='90';
  $('coinName').value='Generic silver group (enter country and years)';
  $('coinNotes').value='Custom group: enter the verified country, date range, gross weight and silver percentage for the coins covered.';
  $('premium').value=settings.premiums.Silver;calculate();
  $('catalogMessage').textContent='New generic group. Set its weight, purity, country and years, then save.';
});
$('deleteCoin').addEventListener('click',async()=>{
  if(!currentCoinId) return;
  const coin=settings.coins.find(c=>c.id===currentCoinId);
  if(!confirm('Remove '+coin.name+' from the saved catalog?')) return;
  try {
    settings=await desktop.saveSettings({...settings,coins:settings.coins.filter(c=>c.id!==currentCoinId)});
    currentCoinId=null; $('coinSearch').value='';
    if(settings.coins.length) applyCoin(settings.coins[0]); else { drawCatalog(); $('addCoin').click(); }
    $('catalogMessage').textContent='Coin removed.';
  } catch(e) { $('catalogMessage').textContent=e.message; }
});
$('exportSetup').addEventListener('click',async()=>{
  try { const r=await desktop.exportSetup(); if(!r.canceled) $('shareMessage').textContent=`Exported ${r.count} saved coins and shop rules. Copy that JSON file to the other PC and choose Import setup.`; }
  catch(e){ $('shareMessage').textContent='Export failed: '+e.message; }
});
$('importSetup').addEventListener('click',async()=>{
  try { const r=await desktop.importSetup(); if(r.canceled) return;
    settings=r.settings; chosenDraft=null; currentCoinId=null; $('coinSearch').value=''; loadRules();
    if(settings.coins.length) applyCoin(settings.coins[0]); else { drawCatalog(); $('addCoin').click(); }
    showPrices(priceState); $('shareMessage').textContent=`Imported ${settings.coins.length} saved coins and shop rules. Previous settings were backed up.`;
  } catch(e){ $('shareMessage').textContent='Import failed; current setup retained: '+e.message; }
});
const startup = desktop.initial().then(initial => {
  settings=initial.settings; loadRules();
  $('version').textContent='v'+initial.version;
  if(settings.coins.length) applyCoin(settings.coins[0]);
  else { $('coinName').value='Custom coin'; drawCatalog(); }
  showPrices(initial.prices); showUpdate(initial.update);
  showBackup(initial.backup);
}).catch(e => { $('error').textContent='App could not initialize: '+e.message; });
initializeCompactView();
