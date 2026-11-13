const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseWidget, parseTimestamp, freshness } = require('../src/spot');
// Structure and values captured from the public APMEX widget on November 12, 2026.
const fixture = `<div class="widget-header"><h2>Precious Metal Prices</h2><span>11/12/2026 6:32:52 PM CST</span></div>
<table class="spotprice"><thead><tr><th>Metal</th><th>Bid</th><th>Ask</th><th>Change</th></tr></thead><tbody>
<tr><td class="metal-name">Gold</td><td>$3,844.20</td><td>$3,904.80<img alt="up"></td><td>$7.30</td></tr>
<tr class="filler"><td colspan="5"></td></tr><tr><td>Silver</td><td>$47.60</td><td>$51.01<img alt="up"></td><td>$0.05</td></tr>
<tr><td>Platinum</td><td>$1,479.60</td><td>$1,538.60</td><td>$3.80</td></tr></tbody></table>`;
test('reads ask independently of bid and change', () => {
  const data = parseWidget(fixture);
  assert.deepEqual(data.prices.Silver, { bid: '47.60', ask: '51.01' });
  assert.equal(data.prices.Gold.ask, '3904.80'); assert.equal(data.prices.Platinum.ask, '1538.60');
  assert.equal(data.asOf, '2026-11-13T00:32:52.000Z');
});
test('CST, CDT, midnight and noon timestamps', () => {
  assert.equal(parseTimestamp('7/1/2026 12:00:00 AM CDT'), '2026-07-01T05:00:00.000Z');
  assert.equal(parseTimestamp('7/1/2026 12:00:00 PM CDT'), '2026-07-01T17:00:00.000Z');
});
test('stale response remains stale even when freshly downloaded', () => {
  const data = parseWidget(fixture), now = Date.parse(data.asOf);
  assert.equal(freshness(data, now + 60000).fresh, true);
  assert.equal(freshness(data, now + 16 * 60000).fresh, false);
  assert.equal(freshness(data, now - 3 * 60000).fresh, false);
});
test('missing metal, invalid price and changed markup fail closed', () => {
  assert.throws(() => parseWidget(fixture.replace('Platinum', 'Unknown')));
  assert.throws(() => parseWidget(fixture.replace('$51.01', '$0.00')));
  assert.throws(() => parseWidget(fixture.replace('$47.60', '$99.00')));
  assert.throws(() => parseWidget(fixture.replace('spotprice', 'changed')));
  assert.throws(() => parseWidget(fixture.replace('PM CST', 'PM XYZ')));
});
