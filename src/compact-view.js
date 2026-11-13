// Loaded after the editor renderer; uses the same validated saved settings and spot state.
'use strict';
function showView(view) {
  document.body.classList.toggle('compact-active',view==='compact');
  $('marketDetails').open=view==='editor';
  $('compactView').hidden=view!=='compact'; $('editorView').hidden=view!=='editor';
  $('showCompact').setAttribute('aria-pressed',String(view==='compact'));
  $('showEditor').setAttribute('aria-pressed',String(view==='editor'));
}
function drawChoices() {
  if(chosenDraft===null) return;
  const ids=new Set((settings.coins || []).map(c=>c.id));
  chosenDraft=new Set([...chosenDraft].filter(id=>ids.has(id)));
  const query=$('compactSearch').value.toLowerCase();
  $('coinChoices').replaceChildren(...(settings.coins || []).filter(c=>(c.name+' '+c.notes).toLowerCase().includes(query)).map(coin=>{
    const label=document.createElement('label'); label.className='coin-choice';
    const check=document.createElement('input'); check.type='checkbox'; check.value=coin.id; check.checked=chosenDraft.has(coin.id);
    const name=document.createElement('span'); name.textContent=coin.name;
    const premium=document.createElement('small'); premium.textContent='Spot + '+coin.premium+(coin.premiumType==='percent'?'%':' USD / coin'); name.append(premium);
    check.addEventListener('change',()=>{
      if(check.checked) chosenDraft.add(coin.id); else chosenDraft.delete(coin.id);
      $('compactMessage').textContent='Choices changed. Save chosen list to keep them and include them in setup exports.';
      renderCompact();
    });
    label.append(check,name); return label;
  }));
}
function compactSpots() {
  const manual=$('compactMode').value==='manual', spots={};
  for(const metal of metals) {
    $('compact'+metal).disabled=!manual;
    if(manual) spots[metal]={value:$('compact'+metal).value,label:'MANUAL '+metal,error:'Enter a manual '+metal.toLowerCase()+' spot price.'};
    else if(priceState.snapshot && priceState.fresh && !priceState.error) spots[metal]={value:priceState.snapshot.prices[metal]?.[settings.side],label:'APMEX '+settings.side.toUpperCase()};
    else spots[metal]={error:priceState.error || 'APMEX is unavailable or stale. Refresh or choose manual prices.'};
  }
  $('compactSource').textContent=manual?'MANUAL PRICES - entered separately for each metal. APMEX refreshes will not overwrite these values.':`APMEX ${settings.side.toUpperCase()} - ${priceState.snapshot?.sourceTime || 'Waiting for prices'}${priceState.fresh && !priceState.error?'':' - automatic quotes blocked'}`;
  $('compactPriceSummary').textContent=manual?'Manual spot prices (change)':'APMEX '+settings.side.toUpperCase()+' spot prices (change)';
  $('compactRefresh').disabled=!!priceState.busy;
  return spots;
}
function renderCompact() {
  if(chosenDraft===null) return;
  const groups=Compact.groupCoins(settings.coins || [],[...chosenDraft],compactSpots());
  $('chosenCount').textContent=`${chosenDraft.size} chosen coins / ${groups.length} grouped rows`;
  $('compactEmpty').hidden=groups.length>0;
  $('compactRows').replaceChildren(...groups.map(group=>{
    const tr=document.createElement('tr'); tr.dataset.members=group.coins.map(c=>c.id).join(',');
    const names=document.createElement('td'), aliases=document.createElement('div'); aliases.className='compact-aliases';
    for(const coin of group.coins) {
      const button=document.createElement('button'); button.className='compact-name';
      button.textContent=coin.name.replace(/\s*\([^)]*\)/g,''); button.title=coin.name+' - click to edit';
      button.addEventListener('click',()=>{ applyCoin(coin); showView('editor'); $('coinName').focus(); }); aliases.append(button);
    }
    names.append(aliases);
    const content=document.createElement('td'); content.textContent=group.contentLabel;
    const calc=document.createElement('td'), equation=document.createElement('div'); equation.className='compact-equation'; equation.textContent=group.equation; calc.append(equation);
    if(group.error) { const error=document.createElement('p'); error.className='compact-row-error'; error.textContent=group.error; calc.append(error); }
    const price=document.createElement('td'); price.textContent=group.result?usd(group.result.each):'-';
    tr.append(names,content,calc,price); return tr;
  }));
  const valid=groups.length>0 && groups.every(g=>g.result && !g.error);
  $('copyList').disabled=!valid;
  compactText=valid?['MY COIN PRICE LIST', $('compactSource').textContent,...groups.map(g=>`${g.coins.map(c=>c.name).join(' / ')}\n${g.contentLabel} | ${g.equation}`),'Prices per coin, USD, before tax. Rounded half up to cents; calculations use exact original inputs.'].join('\n\n'):'';
}
async function saveChosenList() {
  settings=await desktop.saveSettings({...settings,compactCoinIds:[...chosenDraft]});
  chosenDraft=new Set(settings.compactCoinIds); renderCompact();
  $('compactMessage').textContent='Chosen list saved. Your selection is included when you export the shop setup.';
  $('coinChooser').open=false;
}
function initializeCompactView() {
showView('compact');
$('compactRefresh').addEventListener('click',async()=>{try{showPrices(await desktop.refresh());}catch(e){$('compactMessage').textContent=e.message;}});
$('showCompact').addEventListener('click',()=>{showView('compact');renderCompact();});
$('showEditor').addEventListener('click',()=>showView('editor'));
$('chooseCoins').addEventListener('click',()=>{$('coinChooser').open=!$('coinChooser').open;});
$('compactSearch').addEventListener('input',drawChoices);
$('chooseAll').addEventListener('click',()=>{chosenDraft=new Set(settings.coins.map(c=>c.id));drawChoices();renderCompact();$('compactMessage').textContent='All coins chosen. Save chosen list to keep these choices.';});
$('chooseNone').addEventListener('click',()=>{chosenDraft=new Set();drawChoices();renderCompact();$('compactMessage').textContent='Choices cleared. Save chosen list to keep this change.';});
$('saveChoices').addEventListener('click',async()=>{try{await saveChosenList();}catch(e){$('compactMessage').textContent='Could not save choices: '+e.message;}});
$('compactMode').addEventListener('change',renderCompact);
for(const metal of metals) $('compact'+metal).addEventListener('input',renderCompact);
$('copyList').addEventListener('click',async()=>{try{await desktop.copyText(compactText);$('compactMessage').textContent='Compact price list copied.';}catch{$('compactMessage').textContent='Clipboard unavailable.';}});
startup.then(()=>{drawChoices();renderCompact();$('coinChooser').open=chosenDraft?.size===0;});
}
