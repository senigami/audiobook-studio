# Formatting and Numbering Examples

This file shows where locale-sensitive formatting must replace English punctuation and
hand-built strings.

## Numbers

Use locale-aware number formatting for all counts, totals, and measurements.

Examples:

- English (US): `1,234.56`
- Spanish (Spain): `1.234,56`
- French (France): `1 234,56`

Do not hardcode comma vs period logic in UI text.

## Dates

Use locale-aware date formatting for timestamps, creation dates, and modified dates.

Examples:

- English (US): `6/14/2026`
- Spanish (Spain): `14/6/2026`
- French (France): `14/06/2026`

If a locale prefers month names, use the locale formatter rather than a handwritten string.

## Times

Use locale-aware time formatting for clock times, queue timestamps, and display labels.

Examples:

- English (US): `1:05 PM`
- English (GB): `13:05`
- French (France): `13:05`

If a page needs a compact duration, that should still be formatted through a duration helper,
not by concatenating `m` and `s` manually.

## Durations

Duration formatting should be handled as a first-class locale concern.

Examples:

- `57s`
- `1m 03s`
- `1 h 03 min`

The plan should allow a duration formatter to choose the shortest readable form for the locale
and context.

## Pluralization

Use ICU plural rules, not string concatenation.

Examples:

```json
{
  "book.words": "{count, plural, one {# word} other {# words}}",
  "queue.jobs": "{count, plural, one {# job} other {# jobs}}",
  "book.chapters": "{count, plural, one {# chapter} other {# chapters}}"
}
```

## Units and labels

Any string that combines a value with a unit or label should be split when possible:

- `174 words`
- `956 chars`
- `57s est. gen.`
- `Runtime 1m 3s`

These are all candidates for value formatting + localized label assembly instead of one fixed
string.

