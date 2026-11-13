'use strict';
const $ = id => document.getElementById(id);
const metals = ['Silver', 'Gold', 'Platinum'];
let settings = { premiums: { Silver: '25', Gold: '0', Platinum: '0' }, side: 'ask', autoRefresh: true };
let priceState = {}, result = null, quoteText = '';
const usd = value => {
  const [whole, fraction = ''] = String(value).split('.');
  return '$' + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + fraction.padEnd(2, '0');
};
function showPrices(state) {
  priceState = state;
  $('cards').replaceChildren(...metals.map(metal => {
    const card = document.createElement('article'); card.className = 'metal-card';
    const h = document.createElement('h3'); h.textContent = metal.toUpperCase();
    const price = state.snapshot?.prices?.[metal];
    const strong = document.createElement('strong'); strong.textContent = price ? usd(price[settings.side]) : '—';
    const small = document.createElement('small'); small.textContent = price ? `Bid ${usd(price.bid)} / Ask ${usd(price.ask)}` : 'Waiting for APMEX';
    card.append(h, strong, small); return card;
  }));
  $('feed').textContent = state.error || (state.snapshot ? `${state.fresh ? 'Received' : 'STALE'} · ${state.snapshot.sourceTime} · ${settings.side.toUpperCase()} selected` : 'No APMEX prices yet. You can enter spot manually.');
  $('refresh').disabled = !!state.busy;
  $('refresh').textContent = state.busy ? 'Refreshing…' : 'Refresh prices';
  calculate();
}
function calculate() {
  result = null; quoteText = '';
  const metal = $('metal').value, manual = $('mode').value === 'manual', gross = $('weightMode').value === 'gross';
  const useKarat = gross && metal === 'Gold' && $('karat').value;
  $('manual').disabled = !manual; $('karat').disabled = !gross || metal !== 'Gold'; $('purity').disabled = !gross || !!useKarat;
  $('weightHint').textContent = gross ? 'Use metal-only gross weight. Remove stones and non-metal parts before weighing. Purity is applied once.' : 'For a coin containing 1 fine troy ounce, enter 1 ozt. Purity is already accounted for.';
  $('error').textContent = ''; $('quoteStatus').textContent = '';
  $('copy').disabled = true;
  try {
    let spot;
    if (manual) {
      spot = $('manual').value;
      $('quoteStatus').textContent = 'MANUAL SPOT — APMEX refreshes will not change this quote.';
    } else {
      if (!priceState.snapshot) throw Error('Waiting for APMEX. Choose manual spot to quote without the feed.');
      if (!priceState.fresh || priceState.error) throw Error('APMEX data is stale or refresh failed. Refresh successfully or enter a verified manual spot price.');
      spot = priceState.snapshot.prices[metal][settings.side];
      $('quoteStatus').textContent = `APMEX ${settings.side.toUpperCase()} · ${priceState.snapshot.sourceTime}`;
    }
    result = Pricing.calculate({ spot, weight: $('weight').value, unit: $('unit').value,
      purity: gross ? $('purity').value : '100', karat: useKarat || '', premium: $('premium').value, quantity: $('quantity').value });
    $('each').textContent = usd(result.each); $('total').textContent = usd(result.total);
    $('fine').textContent = `${result.fineOzt} ozt`; $('melt').textContent = usd(result.melt); $('count').textContent = result.quantity;
    $('formula').textContent = `${usd(spot)} × fine metal weight × (1 + ${$('premium').value}%)`;
    quoteText = `${metal} selling quote\n${result.quantity} × ${usd(result.each)} = ${usd(result.total)}\nFine content/item: ${result.fineOzt} ozt\nSpot: ${usd(spot)}/ozt (${manual ? 'manual' : 'APMEX ' + settings.side})\nPremium: ${$('premium').value}%\nBefore tax; unit price rounded half up to nearest cent.`;
    $('copy').disabled = false;
  } catch (e) {
    $('error').textContent = e.message;
    for (const id of ['each', 'total', 'fine', 'melt']) $(id).textContent = '—';
    $('formula').textContent = 'Enter valid values to calculate'; $('count').textContent = $('quantity').value;
  }
}
$('quote').addEventListener('submit', e => e.preventDefault());
$('quote').addEventListener('input', calculate);
$('quote').addEventListener('change', e => { if (e.target.id === 'metal') $('premium').value = settings.premiums[$('metal').value]; calculate(); });
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  $('metal').value = button.dataset.preset[0].toUpperCase() + button.dataset.preset.slice(1);
  $('weight').value = '1'; $('unit').value = 'ozt'; $('weightMode').value = 'fine'; $('quantity').value = '1'; $('karat').value = '';
  $('premium').value = settings.premiums[$('metal').value]; calculate();
}));
$('refresh').addEventListener('click', async () => { try { showPrices(await desktop.refresh()); } catch (e) { $('feed').textContent = e.message; } });
$('save').addEventListener('click', async () => {
  try {
    settings = await desktop.saveSettings({ premiums: Object.fromEntries(metals.map(m => [m, $('rule' + m).value])), side: $('side').value, autoRefresh: $('autoRefresh').checked });
    $('premium').value = settings.premiums[$('metal').value]; $('saved').textContent = 'Pricing rules saved.'; showPrices(priceState);
  } catch (e) { $('saved').textContent = 'Could not save: ' + e.message; }
});
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(quoteText); $('quoteStatus').textContent = 'Quote copied.'; }
  catch { $('quoteStatus').textContent = 'Clipboard unavailable.'; }
});
$('source').addEventListener('click', () => desktop.openSource());
$('widget').addEventListener('click', () => desktop.openWidget());
function showUpdate(state) { $('updateMessage').textContent = state.message; $('install').hidden = state.status !== 'ready'; $('updates').disabled = ['checking', 'downloading'].includes(state.status); }
$('updates').addEventListener('click', async () => showUpdate(await desktop.checkUpdate()));
$('install').addEventListener('click', () => desktop.installUpdate());
desktop.onPrices(showPrices); desktop.onUpdate(showUpdate);
const startup = desktop.initial().then(initial => {
  settings = initial.settings; $('side').value = settings.side; $('autoRefresh').checked = settings.autoRefresh;
  for (const m of metals) $('rule' + m).value = settings.premiums[m];
  $('premium').value = settings.premiums[$('metal').value]; $('version').textContent = 'v' + initial.version;
  showPrices(initial.prices); showUpdate(initial.update);
}).catch(e => { $('error').textContent = 'App could not initialize: ' + e.message; });
