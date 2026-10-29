# The English cards

`content/en/<id>.json` is the English version of `content/<id>.json`, built to `/en/m/<id>`. The Chinese card is the
original; the English card says the same things to an English reader. `content/en/compounding.json` is the reference:
read it next to `content/compounding.json` before translating a card.

## The reader

Someone curious and busy, reading on a phone, who knows no Chinese and no jargon. The Chinese cards are written to be
understood in one reading (`knowledge-compiler/style.md`); the English must be just as easy. Write the way a good
explainer talks: plain words, concrete things, one idea per sentence, the cause spelled out where the reasoning would
otherwise jump. American spelling. No hype, no "fascinating", no "In this card".

## What stays exactly the same

- The structure: every field, every array in the same order and length; `id`, `discipline`, `use.uses[].use`,
  `use.with[].id`, which option is `correct`. Paragraphs (blank lines) and `###` headings: the same number, in order.
- Every formula between `$…$` or `$$…$$`, character for character.
- Facts, numbers, names, years, examples, and the reasoning. Translate; don't add, drop, soften or improve. Where the
  Chinese spells out a step, keep the step.
- In the figure: everything except its words (`kind`, ids, `expr`, `min`/`max`/`step`/`value`, points, tones, layout).

## What changes

- `name`: the model's usual English name (often the old `en` field: "Compounding", "Survivorship Bias").
- `en`: the Chinese name, exactly as `name` in the Chinese card (it shows under the English name).
- `story`: a new field after `one_line`: the card's line from `content/index.json` (`story`) in English, one line,
  no full stop. If the card has a `year` in the index, leave the year out of the line; it is shown on its own.
- `one_line`: the sentence you'd say to a friend about the idea: one idea, about 8–16 words, everyday words, no colon
  or semicolon. Translate its meaning, not its wording.
- Numbers: write them the English way (10,000; 131,000; 4.6 million). 万 and 亿 become thousands, millions, billions
  with the value unchanged. Keep the currency as it is (yuan stays yuan, pounds stay pounds); 度 of electricity is kWh.
  Write money in words, never with `$`: a dollar sign starts a formula (9.99 dollars, 4.6 million dollars).
- Things only a Chinese reader would know: say what they are in plain words (月光族 → someone who spends every
  paycheck; a WeChat group → a group chat). Chinese people, places and books keep their pinyin names, with a few words
  of who or what they are if the Chinese assumes the reader knows. Western names and titles use their usual English
  form (霍夫曼 → Huffman; 《穷查理宝典》 → *Poor Charlie's Almanack*). A quotation from an English source uses the
  original words only if you are sure of them; otherwise translate it without quotation marks.
- Use names in `field` of examples: Business, Biology, Personal life, Investing, Technology and so on.
- The figure's words: `title` (a short claim, like the Chinese), `caption`, labels, names, units, `rows`, `cols`,
  `categories`, cell texts. They are measured: Latin letters take a bit over half the room of a Chinese character, so
  a 12-character Chinese label allows about 20 English letters. Keep them short; the checker says when one is too
  long. `"format": "cn"` becomes `"format": "en"` (it writes k, M, B instead of 万 and 亿).

## Checking

`node scripts/check-en.mjs <id>` checks one card against its original, the way the build does: the same shape and
maths, the figure drawing the same thing and fitting, no Chinese left except `en`, and the story line. Fix every
PROBLEM. Notes about numbers are for you to look at: they list numbers in the original that the translation doesn't
have, which is fine when 13.1 万 became 131,000 and wrong when a number was dropped.
