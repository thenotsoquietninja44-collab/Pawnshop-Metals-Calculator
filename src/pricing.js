(function (root) {
  'use strict';
  // Exact rational arithmetic: no floating-point currency multiplication.
  function decimal(value) {
    const s = String(value).trim();
    if (!/^\d{1,12}(\.\d{1,8})?$/.test(s)) throw Error('Enter a positive decimal with up to 8 decimal places.');
    const [whole, fraction = ''] = s.split('.');
    return [BigInt(whole + fraction), 10n ** BigInt(fraction.length)];
  }
  const mul = (a, b) => [a[0] * b[0], a[1] * b[1]];
  const div = (a, b) => { if (!b[0]) throw Error('Cannot divide by zero.'); return [a[0] * b[1], a[1] * b[0]]; };
  const round = a => (2n * a[0] + a[1]) / (2n * a[1]);
  const formatCents = cents => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  function calculate({ spot, weight, unit, purity, karat, premium, quantity }) {
    const s = decimal(spot), w = decimal(weight), p = decimal(premium);
    if (!s[0] || !w[0]) throw Error('Spot and weight must be greater than zero.');
    const q = String(quantity);
    if (!/^[1-9]\d{0,5}$/.test(q)) throw Error('Quantity must be a whole number from 1 to 999,999.');
    let fine;
    if (karat) {
      const k = decimal(karat);
      if (!k[0] || k[0] > 24n * k[1]) throw Error('Karat must be greater than 0 and no more than 24.');
      fine = div(k, [24n, 1n]);
    } else {
      const f = decimal(purity);
      if (!f[0] || f[0] > 100n * f[1]) throw Error('Purity must be greater than 0 and no more than 100%.');
      fine = div(f, [100n, 1n]);
    }
    if (p[0] > 1000n * p[1]) throw Error('Premium cannot exceed 1,000%.');
    const units = { ozt: [1n, 1n], g: decimal('31.1034768'), dwt: [20n, 1n] };
    if (!units[unit]) throw Error('Choose troy ounces, grams, or pennyweights.');
    const fineOzt = mul(div(w, units[unit]), fine);
    const melt = mul(s, fineOzt);
    const sell = mul(melt, [100n * p[1] + p[0], 100n * p[1]]);
    const eachCents = round(mul(sell, [100n, 1n]));
    const totalCents = eachCents * BigInt(q);
    return {
      each: formatCents(eachCents), total: formatCents(totalCents),
      melt: formatCents(round(mul(melt, [100n, 1n]))),
      fineOzt: (Number(fineOzt[0]) / Number(fineOzt[1])).toFixed(8),
      quantity: q
    };
  }
  const api = { calculate, decimal };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Pricing = api;
})(typeof window !== 'undefined' ? window : globalThis);
