(function(root){
  'use strict';
  const pricing=typeof module!=='undefined'?require('./pricing'):root.Pricing;
  const presets={
    Silver:[['999 fine','99.9'],['958 Britannia','95.8'],['925 sterling','92.5'],['900 / 90%','90'],['800 / 80%','80'],['40% silver','40'],['35% silver','35'],['Pure reference','100']],
    Gold:[['9k','9'],['10k','10'],['14k','14'],['18k','18'],['21k','21'],['22k','22'],['24k pure reference','24']],
    Platinum:[['850 platinum','85'],['900 platinum','90'],['950 platinum','95'],['999.5 platinum','99.95'],['Pure reference','100']]
  };
  function rows(metal,{spot,fresh=true,error=''}={}){
    if(!presets[metal])throw Error('Unknown metal.');
    return presets[metal].map(([label,value])=>{
      const karat=metal==='Gold'?value:'',purity=karat?'100':value;
      const factor=karat?`${karat}/24`:`${purity}/100`;
      const row={label,purity,karat,factor,equation:`Spot / 31.1034768 x (${factor})`,price:null,error:''};
      try{
        if(!fresh || error)throw Error(error || 'APMEX is stale. Refresh or enter verified manual prices.');
        row.price=pricing.calculate({spot,weight:'1',unit:'g',purity,karat,premium:'0',quantity:'1'}).each;
      }catch(e){row.error=e.message;}
      return row;
    });
  }
  const api={presets,rows};if(typeof module!=='undefined')module.exports=api;else root.Purities=api;
})(typeof window!=='undefined'?window:globalThis);
