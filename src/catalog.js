(function (root) {
  'use strict';
  const source = 'https://www.ngccoin.com/price-guide/coin-melt-values.aspx?BaseMetal=US-Silver-Coin&MeltCategoryID=2';
  const mint = 'https://www.usmint.gov/american-eagle-2025-one-ounce-silver-uncirculated-coin-25EG.html';
  function defaults(premiums = { Silver: '25', Gold: '0', Platinum: '0' }) {
    const gross = [
      ['roosevelt-dime','Roosevelt Silver Dime (1946-1964)','2.5','90'],
      ['mercury-dime','Mercury Dime (1916-1945)','2.5','90'],
      ['barber-dime','Barber Dime (1892-1916)','2.5','90'],
      ['washington-quarter','Washington Silver Quarter (1932-1964)','6.25','90'],
      ['standing-quarter','Standing Liberty Quarter (1916-1930)','6.25','90'],
      ['barber-quarter','Barber Quarter (1892-1916)','6.25','90'],
      ['walking-half','Walking Liberty Half Dollar (1916-1947)','12.5','90'],
      ['franklin-half','Franklin Half Dollar (1948-1963)','12.5','90'],
      ['kennedy-1964','Kennedy Half Dollar (1964)','12.5','90'],
      ['kennedy-40','Kennedy Silver Half Dollar (1965-1970)','11.5','40'],
      ['morgan-dollar','Morgan Silver Dollar (1878-1904, 1921)','26.73','90'],
      ['peace-dollar','Peace Silver Dollar (1921-1935)','26.73','90'],
      ['war-nickel','Wartime Silver Nickel (1942-1945, large mint mark)','5','35'],
      ['ike-silver','Eisenhower Silver Dollar (1971-1976 silver issues only)','24.59','40']
    ].map(([id,name,weight,purity]) => ({ id, name, weight, purity, metal:'Silver', unit:'g', weightMode:'gross', karat:'', premiumType:'percent', premium:premiums.Silver,
      notes:'Original mint weight, before wear. Confirm date and composition; not every issue is silver.', source }));
    return [{ id:'silver-eagle', name:'American Silver Eagle (1 fine ozt)', metal:'Silver', weight:'1', unit:'ozt', weightMode:'fine', purity:'99.9', karat:'', premiumType:'percent', premium:premiums.Silver,
      notes:'One fine troy ounce of silver. The .999 fineness is informational; do not subtract purity again.', source:mint }, ...gross,
      ...['Silver','Gold','Platinum'].map(metal => ({ id:'generic-'+metal.toLowerCase(), name:'Generic 1 fine oz '+metal+' Coin / Round', metal, weight:'1', unit:'ozt', weightMode:'fine', purity:'100', karat:'', premiumType:'percent', premium:premiums[metal], notes:'Enter the actual fine content for your product.', source:'' }))];
  }
  function validateCoin(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw Error('Invalid coin record.');
    const string = (field, max, allowEmpty = false) => {
      if (typeof c[field] !== 'string' || c[field].length > max || (!allowEmpty && !c[field].trim())) throw Error('Invalid coin '+field+'.');
      return c[field].trim();
    };
    const id = string('id',80), name = string('name',160);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('Invalid coin identifier.');
    if (!['Silver','Gold','Platinum'].includes(c.metal) || !['g','ozt','dwt'].includes(c.unit) || !['fine','gross'].includes(c.weightMode) || !['percent','dollars'].includes(c.premiumType)) throw Error('Invalid coin options.');
    const clean = { id, name, metal:c.metal, unit:c.unit, weightMode:c.weightMode, premiumType:c.premiumType,
      weight:string('weight',24), purity:string('purity',24), premium:string('premium',24), karat:string('karat',8,true), notes:string('notes',1000,true), source:string('source',500,true) };
    if (clean.source && !/^https:\/\//.test(clean.source)) throw Error('Coin source must be an HTTPS URL.');
    const pricing = typeof module !== 'undefined' ? require('./pricing') : root.Pricing;
    pricing.calculate({ ...clean, spot:'1', quantity:'1', purity:clean.weightMode === 'fine' ? '100' : clean.purity, karat:clean.weightMode === 'gross' && clean.metal === 'Gold' ? clean.karat : '' });
    // Even informational purity must remain valid for later editing.
    if (!/^\d+(\.\d{1,8})?$/.test(clean.purity) || +clean.purity <= 0 || +clean.purity > 100) throw Error('Coin purity must be between 0 and 100.');
    return clean;
  }
  function validateCoins(coins) {
    if (!Array.isArray(coins) || coins.length > 500) throw Error('A catalog can contain up to 500 coins.');
    const result = coins.map(validateCoin), ids = new Set(result.map(c=>c.id));
    if (ids.size !== result.length) throw Error('Duplicate coin identifiers.');
    return result;
  }
  function validateConfig(value) {
    if (!value || !['bid','ask'].includes(value.side) || typeof value.autoRefresh !== 'boolean') throw Error('Invalid shop rules.');
    const premiums = {};
    for (const metal of ['Silver','Gold','Platinum']) {
      const p = value.premiums?.[metal];
      if (typeof p !== 'string' || !/^\d{1,4}(\.\d{1,8})?$/.test(p) || +p > 1000) throw Error('Invalid default metal premium.');
      premiums[metal] = p;
    }
    const coins=validateCoins(value.coins), ids=new Set(coins.map(c=>c.id));
    const selected=value.compactCoinIds === undefined ? [] : value.compactCoinIds;
    if (!Array.isArray(selected) || selected.length > 500 || selected.some(id=>typeof id !== 'string')) throw Error('Invalid compact list selection.');
    const compactCoinIds=[...new Set(selected)].filter(id=>ids.has(id));
    return { premiums, side:value.side, autoRefresh:value.autoRefresh, coins, compactCoinIds };
  }
  function exportSetup(config) {
    return { format:'pawnshop-metals-setup', version:1, exportedAt:new Date().toISOString(), config:validateConfig(config) };
  }
  function importSetup(data) {
    if (!data || data.format !== 'pawnshop-metals-setup' || data.version !== 1) throw Error('This is not a supported Pawnshop Metals setup file.');
    return validateConfig(data.config);
  }
  const api = { defaults, validateCoin, validateCoins, validateConfig, exportSetup, importSetup };
  if (typeof module !== 'undefined') module.exports = api; else root.Catalog = api;
})(typeof window !== 'undefined' ? window : globalThis);
