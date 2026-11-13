const {test}=require('node:test');
const assert=require('node:assert/strict');
const Catalog=require('../src/catalog');
const {calculate}=require('../src/pricing');
const config=()=>({coins:Catalog.defaults(),premiums:{Silver:'25',Gold:'0',Platinum:'0'},side:'ask',autoRefresh:true});
test('catalog contains all named coins with validated specifications',()=>{
  const coins=Catalog.validateCoins(Catalog.defaults());
  for(const id of ['silver-eagle','morgan-dollar','peace-dollar','walking-half','washington-quarter','roosevelt-dime']) assert.ok(coins.find(c=>c.id===id));
  assert.equal(coins.length,18);
});
test('90% dime: 2.5g gross gives 2.25g fine and an exact percentage quote',()=>{
  const dime=Catalog.defaults().find(c=>c.id==='roosevelt-dime');
  const result=calculate({...dime,spot:'51.02',quantity:'1'});
  assert.equal(result.fineGrams,'2.25'); assert.equal(result.each,'4.61');
});
test('dime with spot plus $1 per coin uses melt plus one dollar',()=>{
  const dime=Catalog.defaults().find(c=>c.id==='roosevelt-dime');
  const result=calculate({...dime,spot:'51.02',quantity:'10',premiumType:'dollars',premium:'1'});
  assert.equal(result.each,'4.69'); assert.equal(result.total,'46.90');
});
test('flat dollar premium is per coin, including fractional bullion',()=>{
  assert.equal(calculate({spot:'51.02',weight:'0.5',unit:'ozt',purity:'100',premiumType:'dollars',premium:'1',quantity:'3'}).total,'79.53');
});
test('premium is added to unrounded melt, then price rounds once',()=>{
  assert.equal(calculate({spot:'1.004',weight:'1',unit:'ozt',purity:'100',premiumType:'dollars',premium:'0.004',quantity:'1'}).each,'1.01');
});
test('Eagle fine content is 1 ozt, purity is not applied twice',()=>{
  const eagle=Catalog.defaults()[0];
  assert.equal(calculate({...eagle,purity:eagle.weightMode==='fine'?'100':eagle.purity,spot:'51.02',quantity:'1'}).each,'63.78');
});
test('share format preserves custom coins, weights, notes and dollar premiums',()=>{
  const original=config(); original.coins[1].premiumType='dollars'; original.coins[1].premium='1';
  original.coins.push({...original.coins[1],id:'custom-shop-dime',name:'Shop dime',weight:'2.4',notes:'Wear-adjusted shop weight'});
  const file=JSON.parse(JSON.stringify(Catalog.exportSetup(original)));
  assert.deepEqual(Catalog.importSetup(file),original);
  assert.equal(file.snapshot,undefined); assert.equal(file.config.manual,undefined);
});
test('malformed import does not pass validation',()=>{
  assert.throws(()=>Catalog.importSetup({format:'wrong',version:1,config:config()}));
  const wrong=config(); wrong.coins[0].weight='0'; assert.throws(()=>Catalog.exportSetup(wrong));
  const duplicate=config(); duplicate.coins.push(duplicate.coins[0]); assert.throws(()=>Catalog.exportSetup(duplicate));
  const huge=config(); huge.coins=Array.from({length:501},(_,i)=>({...huge.coins[0],id:'coin-'+i})); assert.throws(()=>Catalog.exportSetup(huge));
  const unknown=config(); unknown.coins[0].premiumType='executable'; assert.throws(()=>Catalog.exportSetup(unknown));
});
