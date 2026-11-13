const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculate } = require('../src/pricing');
const base = { spot: '51.02', weight: '1', unit: 'ozt', purity: '100', premium: '25', quantity: '1' };
test('user example rounds 63.775 to 63.78', () => assert.equal(calculate(base).each, '63.78'));
test('exact half-cent rounds half up, not floating-point down', () => assert.equal(calculate({ ...base, spot: '1.005', premium: '0' }).each, '1.01'));
test('quantity multiplies rounded retail unit price', () => assert.equal(calculate({ ...base, quantity: '10' }).total, '637.80'));
test('one troy ounce in grams', () => assert.equal(calculate({ ...base, unit: 'g', weight: '31.1034768' }).each, '63.78'));
test('20 pennyweights equals a troy ounce', () => assert.equal(calculate({ ...base, unit: 'dwt', weight: '20' }).each, '63.78'));
test('sterling purity applied once', () => assert.equal(calculate({ ...base, purity: '92.5' }).each, '58.99'));
test('14k uses exact 14/24 ratio', () => assert.equal(calculate({ ...base, spot: '2400', karat: '14', premium: '0' }).each, '1400.00'));
test('rejects invalid weights, spots, purities, quantity and premium', () => {
  for (const change of [{ spot: '0' }, { weight: '-1' }, { weight: '1e4' }, { purity: '101' }, { quantity: '1.5' }, { quantity: '0' }, { premium: '1001' }, { karat: '25' }, { unit: 'oz' }]) assert.throws(() => calculate({ ...base, ...change }));
});
test('fractional bullion content', () => assert.equal(calculate({ ...base, spot: '4000', weight: '0.1', premium: '10' }).each, '440.00'));
