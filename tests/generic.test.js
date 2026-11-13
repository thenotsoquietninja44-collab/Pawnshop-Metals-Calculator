const {test}=require('node:test');const assert=require('node:assert/strict');
const Catalog=require('../src/catalog');const Pricing=require('../src/pricing');const Compact=require('../src/compact');
const premiums={Silver:'25',Gold:'0',Platinum:'0'};
test('dated U.S. generic groups use the correct standard weights and silver percentages',()=>{
  const expected={
    'generic-us-90-dimes':['2.5','90','1892-1964'],
    'generic-us-90-quarters':['6.25','90','1892-1964'],
    'generic-us-90-halves':['12.5','90','1892-1964'],
    'generic-us-90-dollars':['26.73','90','1878-1904, 1921-1935'],
    'generic-us-40-halves':['11.5','40','1965-1970'],
    'generic-us-40-dollars':['24.59','40','1971-1974, 1976'],
    'generic-us-35-nickels':['5','35','1942-1945']
  };
  const generics=Catalog.validateCoins(Catalog.genericDefaults());assert.equal(generics.length,7);
  for(const coin of generics){const [weight,purity,years]=expected[coin.id];assert.equal(coin.weight,weight);assert.equal(coin.purity,purity);assert.ok(coin.name.includes(years));assert.equal(Catalog.isGeneric(coin),true);}
  assert.ok(generics.find(c=>c.id==='generic-us-40-dollars').name.includes('silver issues only'));
  assert.ok(generics.find(c=>c.id==='generic-us-35-nickels').name.includes('large mint mark'));
});
test('generic dimes group with individual standard dimes at the same premium',()=>{
  const ids=['generic-us-90-dimes','roosevelt-dime','mercury-dime','barber-dime'];
  const rows=Compact.groupCoins(Catalog.defaults(),ids,{Silver:{value:'51.02',label:'Manual'}});
  assert.equal(rows.length,1);assert.equal(rows[0].result.each,'4.61');assert.equal(rows[0].coins.length,4);
  assert.ok(rows[0].coins.some(c=>c.name.includes('1892-1964')));
});
test('upgrade appends generic presets without changing existing coins or premiums',()=>{
  const old=Catalog.defaults().filter(c=>!c.id.startsWith('generic-us-'));
  old[1].premiumType='dollars';old[1].premium='1';
  const upgraded=Catalog.upgradeGenericPresets(old,{...premiums,Silver:'30'},0);
  assert.equal(upgraded.coins.length,old.length+7);assert.deepEqual(upgraded.coins[1],old[1]);
  assert.equal(upgraded.coins.find(c=>c.id==='generic-us-90-dimes').premium,'30');assert.equal(upgraded.catalogVersion,1);
});
test('upgrades preserve edited generic presets and do not re-add deleted ones',()=>{
  const coins=Catalog.defaults();const dime=coins.find(c=>c.id==='generic-us-90-dimes');dime.premium='45';
  const upgraded=Catalog.upgradeGenericPresets(coins,premiums,0);
  assert.equal(upgraded.coins.filter(c=>c.id===dime.id).length,1);assert.equal(upgraded.coins.find(c=>c.id===dime.id).premium,'45');
  const deleted=upgraded.coins.filter(c=>c.id!==dime.id);
  assert.deepEqual(Catalog.upgradeGenericPresets(deleted,premiums,1).coins,deleted);
});
test('custom 60% alloy groups remain editable and share their own name and years',()=>{
  const custom={...Catalog.genericDefaults()[0],id:'custom-60-dime',name:'Shop custom 60% dime (country and years verified by shop)',purity:'60',source:''};
  const config={coins:[custom],premiums,side:'ask',autoRefresh:true,compactCoinIds:[custom.id],catalogVersion:1};
  const restored=Catalog.importSetup(Catalog.exportSetup(config));assert.deepEqual(restored,config);
  assert.equal(Pricing.calculate({...restored.coins[0],spot:'51.02',quantity:'1'}).fineGrams,'1.5');
  assert.equal(Catalog.genericDefaults().some(c=>c.purity==='60'),false);
});
test('normal individual coins stay classified separately from generic groups',()=>{
  const coins=Catalog.defaults();assert.equal(Catalog.isGeneric(coins.find(c=>c.id==='roosevelt-dime')),false);
  assert.equal(Catalog.isGeneric(coins.find(c=>c.id==='generic-silver')),true);
});
