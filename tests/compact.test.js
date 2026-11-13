const {test}=require('node:test');
const assert=require('node:assert/strict');
const Catalog=require('../src/catalog');
const {groupCoins}=require('../src/compact');
const spots={Silver:{value:'51.02',label:'MANUAL Silver'}};
const dimeIds=['roosevelt-dime','mercury-dime','barber-dime'];
test('three matching 2.5g 90% silver dimes occupy one compact row',()=>{
  const rows=groupCoins(Catalog.defaults(),dimeIds,spots);
  assert.equal(rows.length,1);assert.equal(rows[0].coins.length,3);assert.equal(rows[0].fineGrams,'2.25');
  assert.equal(rows[0].result.each,'4.61');assert.match(rows[0].contentLabel,/2.5 g x 90% = 2.25 g/);
  assert.match(rows[0].equation,/51.02/);assert.match(rows[0].equation,/31.1034768/);assert.match(rows[0].equation,/25\/100/);
});
test('unchosen catalog coins are excluded and an empty selection stays empty',()=>{
  assert.equal(groupCoins(Catalog.defaults(),[],spots).length,0);
  assert.equal(groupCoins(Catalog.defaults(),['silver-eagle'],spots)[0].coins.length,1);
});
test('different premiums split matching dimes, including dollar versus percent',()=>{
  const coins=Catalog.defaults();coins.find(c=>c.id==='mercury-dime').premium='30';
  const third=coins.find(c=>c.id==='barber-dime');third.premiumType='dollars';third.premium='1';
  const rows=groupCoins(coins,dimeIds,spots);assert.equal(rows.length,3);
  assert.equal(rows.find(g=>g.premiumType==='dollars').result.each,'4.69');
});
test('equivalent numeric formats and unit conversions group exactly',()=>{
  const coin=Catalog.defaults().find(c=>c.id==='roosevelt-dime');
  const equal={...coin,id:'fine-dime',weightMode:'fine',weight:'2.25000000',purity:'100',premium:'25.000'};
  assert.equal(groupCoins([coin,equal],[coin.id,equal.id],spots).length,1);
  const ounce={...coin,id:'ounce',weightMode:'fine',weight:'1',unit:'ozt'};
  const grams={...ounce,id:'grams',weight:'31.1034768',unit:'g'};
  assert.equal(groupCoins([ounce,grams],[ounce.id,grams.id],spots).length,1);
});
test('rounded display equality never merges distinct exact metal contents',()=>{
  const a={...Catalog.defaults()[0],id:'a',weight:'1',unit:'g'};
  const b={...a,id:'b',weight:'1.00000001'};
  assert.equal(groupCoins([a,b],['a','b'],spots).length,2);
});
test('equal prices from different metals or premium rules stay separate',()=>{
  const a={...Catalog.defaults()[0],id:'a',premium:'0'};
  const b={...a,id:'b',premiumType:'dollars'};
  const c={...a,id:'c',metal:'Gold'};
  assert.equal(groupCoins([a,b,c],['a','b','c'],{...spots,Gold:{value:'51.02',label:'MANUAL Gold'}}).length,3);
});
test('missing, stale and invalid prices yield no sell price',()=>{
  for(const input of [{},{Silver:{error:'STALE'}},{Silver:{value:'bad'}},{Silver:{value:'0'}}]) {
    const row=groupCoins(Catalog.defaults(),dimeIds,input)[0];assert.equal(row.result,undefined);assert.ok(row.error);
  }
});
test('selected coins survive sharing and deletion removes dangling selections',()=>{
  const config={coins:Catalog.defaults(),premiums:{Silver:'25',Gold:'0',Platinum:'0'},side:'ask',autoRefresh:true,compactCoinIds:dimeIds};
  const imported=Catalog.importSetup(JSON.parse(JSON.stringify(Catalog.exportSetup(config))));
  assert.deepEqual(imported.compactCoinIds,dimeIds);
  imported.coins=imported.coins.filter(c=>c.id!=='mercury-dime');
  assert.deepEqual(Catalog.validateConfig(imported).compactCoinIds,['roosevelt-dime','barber-dime']);
});
test('older setup files migrate without inventing chosen coins',()=>{
  const old={coins:Catalog.defaults(),premiums:{Silver:'25',Gold:'0',Platinum:'0'},side:'ask',autoRefresh:true};
  assert.deepEqual(Catalog.importSetup({format:'pawnshop-metals-setup',version:1,config:old}).compactCoinIds,[]);
});
