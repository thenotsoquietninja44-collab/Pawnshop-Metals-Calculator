'use strict';
const WIDGET_URL = 'https://widgets.apmex.com/widget/spotprice/?w=330&h=230&mtls=GSPL&arf=False&rint=5&srf=False&tId=1&wId=1';
const text = html => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/\s+/g, ' ').trim();
function money(value) {
  const s = text(value);
  if (!/^\$\d{1,3}(,\d{3})*(\.\d{2})$/.test(s) && !/^\$\d+\.\d{2}$/.test(s)) throw Error('APMEX returned an unrecognized price.');
  const n = s.replace(/[$,]/g, '');
  if (Number(n) <= 0 || Number(n) > 1000000) throw Error('APMEX returned an invalid price.');
  return n;
}
function parseTimestamp(value) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2}) (AM|PM) (CST|CDT)$/);
  if (!m) throw Error('APMEX timestamp is missing or unrecognized.');
  const [, month, day, year, hour, minute, second, ampm, zone] = m;
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31 || +hour < 1 || +hour > 12 || +minute > 59 || +second > 59) throw Error('Invalid APMEX timestamp.');
  const utcHour = (+hour % 12) + (ampm === 'PM' ? 12 : 0) + (zone === 'CST' ? 6 : 5);
  return new Date(Date.UTC(+year, +month - 1, +day, utcHour, +minute, +second)).toISOString();
}
function parseWidget(html) {
  const table = html.match(/<table\b[^>]*class=["'][^"']*\bspotprice\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!table) throw Error('APMEX price table is unavailable. Manual spot entry is available.');
  const prices = {};
  for (const row of table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x => x[1]);
    const name = cells[0] ? text(cells[0]) : '';
    if (!['Gold', 'Silver', 'Platinum'].includes(name)) continue;
    if (prices[name] || cells.length < 3) throw Error('APMEX price table changed.');
    prices[name] = { bid: money(cells[1]), ask: money(cells[2]) };
    if (Number(prices[name].bid) > Number(prices[name].ask)) throw Error('APMEX bid exceeds ask.');
  }
  if (Object.keys(prices).length !== 3) throw Error('APMEX did not return all three metals.');
  const header = html.match(/<div\b[^>]*class=["'][^"']*widget-header[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const timestamp = header?.[1].match(/<span\b[^>]*>([\s\S]*?)<\/span>/i);
  const sourceTime = timestamp ? text(timestamp[1]) : '';
  return { prices, sourceTime, asOf: parseTimestamp(sourceTime), fetchedAt: new Date().toISOString() };
}
function freshness(snapshot, now = Date.now()) {
  if (!snapshot) return { fresh: false, reason: 'No APMEX prices received.' };
  const age = now - Date.parse(snapshot.asOf);
  if (!Number.isFinite(age) || age < -120000) return { fresh: false, reason: 'Price timestamp is invalid or ahead of this computer.' };
  if (age > 15 * 60000) return { fresh: false, reason: 'APMEX price is over 15 minutes old. Market may be closed.' };
  return { fresh: true, reason: 'APMEX widget price received within 15 minutes.' };
}
module.exports = { WIDGET_URL, parseWidget, parseTimestamp, freshness };
