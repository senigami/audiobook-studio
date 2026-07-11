# Multilingual Interface Examples

This folder is a review aid for the multilingual interface proposal.

What it shows:

- current site text grouped by surface
- proposed translation keys
- where a label should be split into smaller reusable pieces
- locale-sensitive formatting examples for numbers, dates, times, and durations
- first-run language picker text versus later settings-based language changes
- source-catalog JSON snapshots under `locales/en-US/` that map current site text to keys
- a machine-readable sample inventory in `inventory.json`
- a manifest example with locale records, namespace records, and fallback chains

How to read it:

- the `site-text-map.md` file is the main inventory
- the `manifest.json` file describes the example catalog structure
- the `inventory.json` file demonstrates key ownership and dynamic-value splits
- the formatting file shows where English punctuation must not be baked into text
- split candidates are the places where AI-assisted extraction should produce multiple keys instead of one long string

These files are not implementation artifacts. They exist so we can review the mapping before any code or spec work starts.
