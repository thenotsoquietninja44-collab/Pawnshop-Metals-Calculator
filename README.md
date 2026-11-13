# Pawnshop Metals Calculator

A Windows desktop app for pricing silver, gold and platinum coins, bullion and jewelry.

## Install

Download `Pawnshop-Metals-Calculator-Setup-0.2.0.exe` from [Releases](https://github.com/thenotsoquietninja44-collab/Pawnshop-Metals-Calculator/releases/latest).
The Windows installer is unsigned. Windows 10/11 x64 is the initial target.

## Coin catalog and shop sharing

Select a coin, change its numbers, and choose **Save this coin setup**. Each saved coin has its own weight, purity and premium. **Add coin** starts a new record; **Duplicate** makes a separate editable copy. Search finds names and notes. Saved weights can be reduced to account for wear.

The starter catalog includes American Silver Eagles, Morgan and Peace dollars, Walking Liberty/Franklin/Kennedy/Barber halves, Washington/Standing Liberty/Barber quarters, Roosevelt/Mercury/Barber dimes, wartime silver nickels, silver Eisenhower issues, and generic silver/gold/platinum fine-ounce coins.

Historical original-mint weights and compositions are based on [NGC's silver-coin specification table](https://www.ngccoin.com/price-guide/coin-melt-values.aspx?BaseMetal=US-Silver-Coin&MeltCategoryID=2). The Silver Eagle uses [U.S. Mint guaranteed fine content](https://www.usmint.gov/american-eagle-2025-one-ounce-silver-uncirculated-coin-25EG.html): **1 fine troy ounce**, without a second purity deduction. A 1964-and-earlier dime uses 2.5 g gross at 90%, or 2.25 g fine. At a manually entered $51.02 spot, its selling price is **$4.61 at +25%**, or **$4.69 at +$1 per coin**.

**Spot + percentage** multiplies the unrounded melt value by (1 + premium/100). **Spot + dollars per coin** adds that dollar amount to the unrounded melt value of each coin. The displayed equation includes the entered weight, purity, troy conversion, premium, rounding and quantity total. Displayed intermediate figures are rounded to eight decimal places; calculations retain exact rational values.

To share a shop's setup:

1. Save coin edits, then choose **Export setup** and save the JSON file.
2. Copy the file to the other shop computer by USB, shared folder or another method you use.
3. In the app on that computer, choose **Import setup** and select the file.
4. Review the import and choose **Replace** for an identical catalog, or **Merge** to keep additional local coins. Matching IDs use imported settings. A backup is made before applying an import.

Exports include saved coins and default shop rules. They exclude spot snapshots, manual prices and current quote quantities. This is file-based sharing, not continuous synchronization. Both PCs fetch APMEX independently. Existing 0.1.0 rules are retained on upgrade and used to initialize the new catalog.

## Quote rules

`fine troy ounces × spot per troy ounce × (1 + premium / 100)`

The app rounds the per-item selling price to the nearest cent, half up, then multiplies by quantity. The example `$51.02 × 1 × 1.25 = $63.775` gives **$63.78 per item**. Ten items total **$637.80**.

- Silver starts at **25%**. Gold and platinum start at **0%** because shop premiums have not been specified.
- Save separate premiums under Shop pricing rules. The current quote's premium can also be overridden without saving a new rule.
- **Fine metal content:** for a coin containing one fine troy ounce, use 1 ozt. Do not reduce it by purity again.
- **Gross weight:** for jewelry or a weighed coin, enter metal-only weight and apply purity or a gold karat override. Remove stones/non-metal parts from weight.
- One troy ounce = 31.1034768 grams = 20 pennyweights. Ordinary avoirdupois ounces are intentionally not offered.
- All quotes are before tax and exclude collector premiums unless entered in the premium field.

## APMEX widget

Source: [APMEX spot price widget](https://www.apmex.com/widgets/gold-silver-spot-price-tracker).
The application reads the widget's `spotprice` table and its published timestamp over HTTPS. It uses **ask** by default, with **bid** selectable in saved settings. It never substitutes the change column or another provider.

Prices refresh on startup and every five minutes when enabled. APMEX's timestamp is shown in its original CST/CDT form. Data older than 15 minutes, future timestamps beyond two minutes, incomplete tables and failed refreshes block automatic quotes. Manual spot mode remains usable and is explicitly labeled. An unchanged market-closed quote can therefore require manual verification. Prices are not carried across app restarts.

The source widget and its Terms of Use remain accessible through the APMEX links. This app is independent of APMEX, which does not guarantee continuous availability. APMEX changes may require a parser update.

## Updates and releases

Installed copies use `electron-updater` and the public GitHub Releases feed. Checks run on startup, every four hours, and through Check for updates. Downloads happen automatically; installation requires choosing Restart and update. The app does not embed GitHub credentials.

The Windows workflow tests the financial calculations and parser, launches the renderer for a manual-price smoke test, builds NSIS, uploads build artifacts and publishes a new version if its release is absent. Bump `package.json` version and update `RELEASE_NOTES.md` for each release. Existing version assets are not overwritten.

Shop rules are saved atomically to `settings.json` in Electron's per-user app-data directory. They survive installer updates. Live quotes are not saved or transmitted to a shop server. Network requests go to APMEX for prices and GitHub for updates; opening source links uses your default browser.

## Develop

Install Node.js 22+ and run:

```powershell
npm install
npm test
npm start
npm run dist -- --publish never
```

`npm run smoke` launches the actual Electron renderer and verifies the $63.78 example without relying on the live feed.
The update-install path must be tested between two published versions; a first release alone cannot prove an end-to-end upgrade.
