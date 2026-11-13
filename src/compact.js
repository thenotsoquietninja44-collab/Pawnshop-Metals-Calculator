(function(root) {
  'use strict';
  const pricing=typeof module !== 'undefined' ? require('./pricing') : root.Pricing;
  const money=value=>{ const [a,b='']=String(value).split('.'); return '$'+a.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'.'+b.padEnd(2,'0'); };
  const args=coin=>({...coin,purity:coin.weightMode==='fine'?'100':coin.purity,karat:coin.weightMode==='gross' && coin.metal==='Gold'?coin.karat:'',quantity:'1'});
  function groupCoins(coins, selectedIds, spots={}) {
    const selected=new Set(selectedIds), groups=new Map();
    for(const coin of coins) {
      if(!selected.has(coin.id)) continue;
      const content=pricing.calculate({...args(coin),spot:'1'});
      const key=[coin.metal,content.contentKey,coin.premiumType,content.premiumKey].join('|');
      if(!groups.has(key)) groups.set(key,{key,metal:coin.metal,coins:[],fineGrams:content.fineGrams,fineOzt:content.fineOzt,content});
      groups.get(key).coins.push(coin);
    }
    return [...groups.values()].map(group=>{
      const coin=group.coins[0], input=spots[group.metal];
      group.premium=coin.premium; group.premiumType=coin.premiumType;
      // Use one member's exact original inputs for the equation, never the rounded fine-gram display.
      const factor=coin.weightMode==='fine'?'1':coin.karat && coin.metal==='Gold'?`(${coin.karat}/24)`:`(${coin.purity}/100)`;
      const conversion=coin.unit==='g'?' / 31.1034768':coin.unit==='dwt'?' / 20':'';
      const fine=`(${coin.weight} x ${factor}${conversion})`;
      const base=`${input?.value ? money(input.value) : 'spot'} x ${fine}`;
      const sale=coin.premiumType==='dollars'?`(${base}) + ${money(coin.premium)}`:`${base} x (1 + ${coin.premium}/100)`;
      group.equation=sale;
      group.contentLabel=`${group.fineGrams} g fine ${group.metal.toLowerCase()}`;
      const sameSpec=group.coins.every(c=>['weight','unit','weightMode','purity','karat'].every(k=>c[k]===coin[k]));
      if(sameSpec && coin.weightMode==='gross') group.contentLabel=`${coin.weight} ${coin.unit} x ${coin.karat && coin.metal==='Gold'?coin.karat+'k':coin.purity+'%'} = ${group.fineGrams} g fine ${group.metal.toLowerCase()}`;
      else if(sameSpec && coin.weightMode==='fine') group.contentLabel=`${coin.weight} ${coin.unit} fine ${group.metal.toLowerCase()}`;
      if(input?.value) {
        try { group.result=pricing.calculate({...args(coin),spot:input.value}); group.equation+=' = '+money(group.result.each); group.source=input.label; }
        catch(e) { group.error=e.message; }
      } else group.error=input?.error || 'No current spot price. Refresh APMEX or enter manual prices.';
      return group;
    });
  }
  const api={groupCoins};
  if(typeof module !== 'undefined') module.exports=api; else root.Compact=api;
})(typeof window !== 'undefined'?window:globalThis);
