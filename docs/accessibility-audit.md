# Accessibility audit: screen-reader and keyboard use, WCAG 2.2 AA

Audited 2026-11-02 at commit `79a34de` (main). Report only: nothing was fixed and no issues were created. The issue drafts at the end are for the user to review, triage and file.

## Summary

PencilMark's markup is a good base: native `<button>`s throughout, `aria-pressed` on toggles, `aria-expanded` on collapsibles, labelled navigation, decorative glyphs hidden, timers not live. axe-core found few automatic violations. The real problems are the ones axe cannot see: what happens to **focus** and to **announcements** when the screen changes, and one **feature with no discoverable keyboard path** (Item flags).

| # | Finding | Severity | Main WCAG 2.2 criteria |
|---|---|---|---|
| F1 | Item flags are opened only by a long-press or a context-menu gesture | High | 2.1.1, 4.1.2, 3.3.2 |
| F2 | Nothing is announced: no live region anywhere | High | 4.1.3 |
| F3 | Focus is dropped (to `<body>`) after route changes, closing dialogs, self-removing buttons, nav jumps | High | 2.4.3, 3.2.2 |
| F4 | Dialogs are `aria-modal` but do not trap focus or hide the page behind | Medium | 2.4.3, 4.1.2 |
| F5 | Formulas are exposed as raw TeX | Medium | 1.1.1, 1.3.1 |
| F6 | Text contrast below 4.5:1 on the Review page's result tiles (light mode) and the flag-meanings link | Medium | 1.4.3 |
| F7 | The fixed top bar covers focused controls in the portrait layout | Medium | 2.4.11 (new in 2.2) |
| F8 | The file picker cannot be reached by keyboard; the import textarea has no label | Medium | 2.1.1, 3.3.2, 1.3.1 |
| F9 | Page title never changes; the Answering page has no heading; heading levels skip | Medium | 2.4.2, 2.4.6, 1.3.1 |
| F10 | The top bar's Question toggle shows "Q1/10" but is named "Question 1 of 10" | Medium | 2.5.3 |
| F11 | Question text is not marked with its own language; `lang` residuals | Medium | 3.1.2, 3.1.1 |
| F12 | Option state and correctness carried by colour or bare symbols; selection is a toggle, not a choice | Low | 1.4.1, 1.3.1, 4.1.2 |
| F13 | Some targets under 24 px; borders of text fields and Options at 1.4:1 | Low | 2.5.8, 1.4.11 |
| F14 | The Timers update every second and the interface offers no way to hide them | Low | 2.2.2 |
| F15 | 14 Tab stops before the first Option in the side-column layout | Low | 2.4.1 (met by landmarks), best practice |

### The four suspected gaps

| Suspected gap | Verdict | Where |
|---|---|---|
| Formulas are unreadable | **Refuted as stated; confirmed as poor.** A formula has an accessible name: the TeX source, via `role="math"` and `aria-label` (`src/render/maths.ts:61`). The browser's accessibility tree shows `math "400 \div 80 = 5"`. What a screen reader makes of raw TeX is the weakness. | F5 |
| Item flags need a long-press or right-click | **Confirmed, with one nuance.** In Chromium the Menu key and Shift+F10 on a focused Option do open the menu (the `onContextMenu` handler fires), but nothing says so: the on-screen text says only "Long-press", Mac keyboards have no Menu key, and focus does not move into the menu. Holding Enter or Space does nothing. | F1 |
| `<html lang>` is fixed at `zh-CN` | **Refuted.** `index.html` has `zh-CN`, but `applyLanguage` (`src/i18n/i18n.ts:27`) overwrites it on the first render and on every language change (verified: `en` for an English browser, `zh-CN` after choosing 中文 and after reload). Residual issues are real but smaller. | F11 |
| Nothing is announced: no `aria-live` region | **Confirmed.** 0 elements with `aria-live`, `role="status"`, `role="alert"` or `role="log"` in the running app, and focus is lost on most screen changes. | F2, F3 |

## Method and limits

- Built with `npm run build`, served with `vite preview`, driven by Playwright (the preinstalled Chromium) with axe-core injected. Rule tags: wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice.
- axe was run on Home (empty, import preview open, with a Set), the Answering page (plain, Marks and Notes area open, Item flag menu open, top-bar navigation open, Submit dialog), the Review page (plain, Marks and Notes area open) and the Showcase page. That is 10 states in each of 2 languages (en, zh) and 2 layouts (landscape 1024×700, side column; portrait 390×844, top bar): 40 scans. Contrast was also run in dark mode (`prefers-color-scheme: dark`) with no axe violations, and computed by hand for the tinted result tiles (below).
- The keyboard walk used only Tab, Shift+Tab, Enter, Space, Escape and the Menu key: open Home, import the sample Set from its preview, Start, answer, set Item flags, open the Marks and Notes area, open a Hint, write a Note, Save and collapse, move through Questions, Submit, then read the Review page and use its navigation.
- Other probes: target sizes, 320 px reflow, focus obscured by the top bar (Shift+Tab through the portrait Review page, 79 stops), the accessibility tree via `ariaSnapshot`, `lang` at load, after switching and after reload.
- **Not done:** no real screen reader (NVDA, JAWS, VoiceOver, TalkBack) was run, so statements about how a screen reader speaks something are inferences from the accessibility tree and from how those products usually behave. Only Chromium was used; Firefox and Safari differ on context-menu keys and focus rules. Automatic tools find roughly a third of WCAG problems; the rest of this report comes from the walk and the code.
- axe results were identical in en and zh, and mostly identical across layouts. Findings below name the layout only when it matters.

### axe-core results (all 40 scans)

| Rule | Where | Impact | Maps to |
|---|---|---|---|
| `region` | Home, all states: the language selector in `.lang-top` sits outside any landmark (`src/ui/App.tsx:56`) | moderate | best practice |
| `page-has-heading-one` | Answering page, all states: no heading at all | moderate | F9 |
| `heading-order` | Review page: the first card's `<h3>` follows the `<h1>` with no `<h2>` (`src/ui/Review.tsx:157`) | moderate | F9 |
| `color-contrast` | `.flag-meanings > summary` 4.34:1 (`src/ui/styles.css:112`); Review/Showcase result tile "wrong" 4.2:1 (`styles.css:196`) | serious | F6 |
| `label-content-name-mismatch` | Portrait Answering page: `.question-toggle` (`src/ui/Player.tsx:258`) | serious | F10 |

Dark mode: no axe violations; the dark "ungraded" tile computes at 4.29:1 (F6).

### What already works

- Every control is a real `<button>`, `<a>`, `<select>` or `<textarea>`; Enter and Space work everywhere. No keyboard trap in the strict sense (WCAG 2.1.2).
- Toggles carry `aria-pressed` (Options, Flags, Confidence, Item flags); collapsibles carry `aria-expanded`.
- The Question navigation buttons are named with their state ("Question 3, answered, flagged"; "Question 5, wrong") and `aria-current="step"`; the ⚑ and ⚠ glyphs are `aria-hidden`.
- The Timers are not live regions (right: a ticking timer must not be announced), and the short top-bar timers have full `aria-label`s.
- Escape closes dialogs and the top-bar navigation.
- Layout reflows at 320 px wide with no horizontal scroll; the viewport is not locked against zoom.
- `lang` follows the interface language at run time.
- Text entries have `aria-label`s that include the Note or entry number.
- Formulas have a name (F5), and KaTeX's visual markup is `aria-hidden`, so a formula is not read twice.

---

## Findings

### F1. Item flags: no discoverable path without a long-press (High)

**Who:** keyboard-only users, switch and voice-control users, screen-reader users on touch devices (the long-press is a double-tap-and-hold gesture), anyone who does not know the browser's context-menu key.

**Where:** `useLongPress` and `ItemFlagMenu` in `src/ui/Marks.tsx:148-213`; `OptionButton` in `src/ui/Player.tsx:44`; the instruction string `itemFlags.instruction` ("Long-press an Option to mark it…") in `src/i18n/en.ts:123` and `zh.ts`. The Review page shows Item flags read-only (`ItemFlagMarks`), so only the Answering page is affected.

**What was verified (Chromium):**
- Focus on an Option, press Menu or Shift+F10: the menu opens, because `onContextMenu` is wired. Holding Enter or Space for 900 ms does not open it (it selects).
- The instruction never mentions the keyboard or a right-click. A user who does not know the gesture cannot find the feature. Mac keyboards have no Menu key; Shift+F10 is not universal.
- Opening the menu does not move focus into it, and nothing is announced. The menu is the next element after the Option, so a screen-reader user who opened it by accident, or on purpose, hears nothing.
- Once set, the Item flag's mark is the glyph `✕`, `✕?`, `✓` or `?` inside the Option's button; the meaning is only in a `title` attribute. The Option's accessible name becomes "A Influenza mutates… ✕".
- Escape does not close the menu (only the "Close" button does).

**Criteria:** 2.1.1 Keyboard (A): a function whose only documented trigger is a pointer gesture; 4.1.2 Name, Role, Value; 3.3.2 Labels or Instructions.

**Fix:**
1. Give each Option a visible, focusable control that opens the Item flag menu ("Mark…", or the ⋯ glyph with an `aria-label` naming the Option), beside the Option, not inside its button. Keep the long-press and right-click as shortcuts. This also helps pointer users who never discover the long-press.
2. Move focus to the first button of the menu when it opens; Escape and Close return it to the control that opened it.
3. Replace the instruction with one that names every way in.
4. Give the marks a text alternative: visually hidden text ("eliminated") in place of reliance on `title`, so the Option's name reads "A, …, eliminated".

### F2. Nothing is announced (High)

**Who:** screen-reader users; also anyone with a magnifier who is looking at another part of the screen.

**Where:** the whole app. `grep` finds no `aria-live`, `role="status"`, `role="alert"` or `aria-busy` in `src/`; the running DOM has none.

**What is silent today:**
- the Item flag menu opening (F1);
- a Hint opening (the button re-labels, the Hint text appears above it, `src/ui/Marks.tsx:238-251`);
- a Text entry's autosave, the character counter turning red, "Too long" (`src/ui/TextEntries.tsx:105,125`);
- the import result (`<p class="ok">` on Home), pack errors (`.errors`), "Copied" and the copy-failed fallback (`src/ui/CopyButton.tsx`), "Download failed" on the Review page;
- the Raw log integrity failure (`<p class="bad">` on the Answering page) and the storage-unavailable warning, both rendered after load;
- moving to another Question (the Question changes under the user; the top-bar toggle text changes silently);
- submitting, and arrival on the Review page;
- a Flag or Challenge saved on the Review page, where the controls are disabled while the mark is recorded (`disabled={marking}`).

**Criteria:** 4.1.3 Status Messages (AA).

**Fix:** one polite status region (`role="status"`) and one assertive alert region, rendered once in `App`, fed by a small helper (`announce(key, params)`) that takes a translation key, so no interface text enters components. Announce the items above. Do **not** make the Timers live. Associate the character counter with its textarea (`aria-describedby`).

### F3. Focus is not managed; it falls to `<body>` (High)

**Who:** keyboard and screen-reader users, who restart from the top of the page every time.

**Verified (all landed on `<body>`):**
1. **Route changes.** Home → Start (Answering page) → Submit (Review page): focus on `<body>`, `document.title` still "PencilMark", the page not announced (`src/ui/App.tsx:23-26`, hash routes).
2. **Closing a dialog.** `Dialog` returns focus to the opener (`src/ui/Dialog.tsx:14-18`), but the opener is disabled while the dialog is open (`disabled={preview !== undefined}` on the sample button; `disabled={confirming}` on Submit; `disabled={leaving !== undefined}` on Leave), and a disabled button cannot take focus. Confirmed on Home: Escape, Cancel and a finished import all leave focus on `<body>`.
3. **Buttons that remove themselves.** "Save and collapse" (`src/ui/TextEntries.tsx:108-118`) swaps the textarea for the saved text; focus goes to `<body>`. The same pattern applies to Edit, Delete, Restore and "Add another", and to the last "Show hint" button, which unmounts after the last Hint (`src/ui/Marks.tsx:246`).
4. **Top-bar navigation (portrait).** Choosing a Question from the dropped-down navigation closes it (`goTo` → `setNavOpen(false)`); focus was on a button that is now `display:none`, so it falls to `<body>` (verified).
5. **Review navigation.** Enter on a Question's navigation square scrolls to its card (`jumpTo`, `src/ui/Review.tsx:275`) but focus stays on the square; the next Tab goes to the next square, not into the card. The same holds for "Jump to Feedback" and "Read the full Feedback".
6. **Suspected, not run:** on the Review page a focused Flag button is `disabled` while the mark is recorded (`disabled={marking}`); a focused element that becomes disabled drops focus.

**Criteria:** 2.4.3 Focus Order (A), 3.2.2 On Input (A) for the dropdown; 4.1.3 in combination (F2).

**Fix:**
- On each route, set `document.title` (F9) and move focus to the page's `<h1>` (give it `tabindex="-1"`), or to `<main>`.
- Do not disable the opener while its dialog is open (the backdrop already blocks the pointer), or keep a ref to the opener and restore after the disabled state clears.
- After a control removes itself, move focus to its replacement: the saved text's Edit button; the textarea after Edit; the next control after the last Hint.
- After picking a Question in the dropdown, focus the toggle button or the new Question's start.
- After a Review jump, give the target card `tabindex="-1"` and focus it (with `preventScroll`, since `scrollIntoView` already moved the view).
- Use `aria-disabled` or a pending state that keeps focus while a mark is recorded.

### F4. Dialogs are not modal for keyboard users (Medium)

**Where:** `src/ui/Dialog.tsx`.

**Verified:** `role="alertdialog" aria-modal="true"`, but Tab leaves the dialog: from the Submit dialog, Tab reaches "Submit", "Cancel", then the language selector and `<body>`; the same on the import preview. The page behind stays operable by keyboard (a user can, for instance, press Next while the Submit dialog is up). Focus lands on the dialog container, which is fine; it is a `<div tabindex="-1">` named by `aria-label` only.

**Also:** `alertdialog` suits short confirmations; the import preview is long, interactive content (radio groups, lists) and should be `dialog`. There is no `aria-describedby`, so a message that is not the label is not announced when the dialog opens.

**Criteria:** 2.4.3, 4.1.2.

**Fix:** trap Tab and Shift+Tab inside the dialog, and set `inert` on `#app` (or the siblings of the dialog) while it is open, which also stops background reading in browse mode. Use `role="dialog"` with `aria-labelledby` the heading and `aria-describedby` the message; keep `alertdialog` for the two-button confirmations only. Keep the opener restoration (F3).

### F5. Formulas are exposed as raw TeX (Medium)

**Who:** blind and low-vision users on any Question with maths; Chinese-interface users hear TeX in English letters.

**Where:** `src/render/maths.ts:55-62`, `src/render/sanitise.ts`.

**What is true today:**
- KaTeX runs with `output: "html"`; the sanitiser removes MathML (`mathMl: false`). The comment in `maths.ts` explains why.
- A formula is wrapped in `<span role="math" aria-label="TeX">`. DOMPurify keeps both attributes; KaTeX's visual markup is `aria-hidden="true"`. The accessibility tree shows `math "400 \\div 80 = 5"`. So the formula **is** reachable and not read twice. The suspected gap ("unreadable") is not what happens.
- But the name is source code. A screen reader may speak "400 backslash div 80 equals 5", and for `\frac{a+b}{2}` or `\sqrt[3]{x}` it speaks braces and backslashes, or drops punctuation and runs the symbols together. The user cannot step through a formula, and cannot get MathML into a maths-aware screen reader (NVDA with MathCAT, JAWS, VoiceOver).
- The same string is used for formulas inside Options (buttons), Hints and word-difference runs.
- Only 1 of the sample pack's 10 Questions has a formula (`samples/general-science.json`), so this audit could not exercise complex notation.

**Criteria:** 1.1.1 Non-text Content and 1.3.1 Info and Relationships; the failing grade is the spoken quality, not the presence of a name.

**Fix options and the security trade-off:**

| Option | Gain | Cost / risk |
|---|---|---|
| A. Keep `aria-label` = TeX (today) | No change to the sanitiser's design | Poor speech for anything beyond `a + b`; no structure; no braille |
| B. `aria-label` = a spoken form, made by a small in-house TeX→words function covering common constructs (fractions, powers, roots, Greek letters, `\times`, `\div`, subscripts, units), falling back to the TeX; per interface language | Good speech for the common case; **no sanitiser change**; still plain text in an attribute | A converter to write and maintain; wrong for rare constructs, so the fallback must stay |
| C. KaTeX `htmlAndMathml`, with MathML kept by the sanitiser through an allow-list of the element and attribute names KaTeX emits (`math`, `semantics`, `mrow`, `mi`, `mn`, `mo`, `msup`, `msub`, `mfrac`, `msqrt`, `mroot`, `mtext`, `mspace`, `annotation[encoding]`…) | Maths-aware screen readers get real structure and braille | The one thing the sanitiser's design chose to avoid: MathML and SVG are the namespaces behind most DOMPurify mutation-XSS bypasses, so the allow-list needs a pinned DOMPurify version, a test with known mXSS payloads, and a decision on `annotation` (the reason `output: "html"` was chosen) |
| D. Build the MathML after sanitising: take KaTeX's MathML string, parse it, and **rebuild** it node by node from the fixed element and attribute list above, text content only, inserted outside the sanitiser | MathML without trusting DOMPurify's MathML handling | New security-critical code, and `RichText` is meant to be the only place HTML reaches the page |

Recommendation: **B now** (it fixes the common case with no change to the security design), and treat C or D as a later decision once there is a Question pack with heavy notation. Whichever is chosen, keep `role="math"` and the `aria-hidden` visual layer, and test formulas inside Option buttons.

[NEEDS CLARIFICATION: is a spoken form for formulas in both interface languages worth maintaining, or should the first version speak the TeX in English only?]

[NEEDS CLARIFICATION: do the user's Question packs use maths heavily enough that structured MathML (option C or D) is wanted, which would reopen the sanitiser's MathML decision?]

### F6. Text contrast below 4.5:1 (Medium)

**Where:** `src/ui/styles.css:195-199` (Review/Showcase navigation squares), `:112` (the "What do these mean?" link), `:105`.

Measured, normal-weight text of about 14 px:

| Element | Light | Dark |
|---|---|---|
| Right tile (`--ok` on its 18% tint) | **4.03** | 5.60 |
| Wrong tile (`--bad` on tint) | **4.20** (axe) | 5.33 |
| Partial tile (`--partial` on tint) | **2.55** | 5.67 |
| Ungraded tile (`--muted` on tint) | **4.21** | **4.29** |
| `.flag-meanings summary` (`--flag-mark` on the 8% tint) | **4.34** (axe) | 5.86 |

axe reported one node only, because it cannot always resolve the tint behind a `color-mix()`; the figures above come from computing the mix. Everything else measured passes (muted text 4.8-6.4, links 6.9, buttons 6.6).

**Who:** low-vision users, and anyone in sunlight. The tiles are the Review page's main navigation, and the colour is also the only visual cue of the result (their `aria-label`s carry it for screen readers).

**Criteria:** 1.4.3 Contrast (Minimum) (AA).

**Fix:** darken the foreground in light mode (a deeper `--ok`, `--bad` and `--partial` for text, kept for borders), or lower the tint, or use the text colour `--fg` and keep the hue in the border and fill; give `.flag-meanings summary` a darker `--flag-mark` text variant. Pair the colour with a second cue (a small glyph for right/wrong), which also covers F12.

### F7. The fixed top bar covers focused controls (Medium)

**Who:** keyboard users in the portrait layout (windows narrower than 600 px or taller than wide), and anyone zoomed in.

**Where:** `.answer-panel` is `position: fixed` at the top (`styles.css:147`); only Review cards get `scroll-margin-top`.

**Verified:** Shift+Tab upward through the portrait Review page: 9 of 79 focus stops had their centre under the bar (the Marks and Notes area header, the ✎ buttons and others at y = 0-31 px, bar height 56 px).

**Criteria:** 2.4.11 Focus Not Obscured (Minimum) (AA, new in WCAG 2.2).

**Fix:** `html { scroll-padding-top: calc(var(--bar-h) + 8px); }` in the portrait layout (and the same value for `scroll-margin-top` on the Answering page's focusable regions); check the landscape side column, which does not overlap content.

### F8. File picker unreachable; import textarea unlabelled (Medium)

**Where:** `label.file input { display: none }` (`src/ui/styles.css:92`), `src/ui/ImportForm.tsx:316`; the textarea at `:303`.

- "Choose a file" is a `<label>` around an `<input type="file">` that is `display: none`. It is not in the Tab order (verified: not among Home's tab stops), and the label itself is not focusable. A keyboard user cannot import from a file. Pasting into the textarea still works, which is why this is Medium and not High.
- The import textarea has a placeholder and no label; some assistive technology uses a placeholder as a name, but it disappears on typing and is not a label (3.3.2).

**Criteria:** 2.1.1 Keyboard (A); 3.3.2 Labels or Instructions (A); 1.3.1.

**Fix:** hide the file input visually (clip, 1 px) but keep it focusable, with `:focus-within` styling on the label, or render a real `<button>` that calls `input.click()`. Add a visible `<label for>` or `aria-label` to the textarea. The sample-pack button and the preview already work by keyboard.

### F9. Page title, headings and landmarks (Medium)

**Where:** `index.html:6`, `src/ui/App.tsx`, `src/ui/Player.tsx:253-266`, `src/ui/Review.tsx:157,342`.

- `document.title` is "PencilMark" on every route (verified). Window and tab switchers, history entries and screen readers on page load announce the same name for Home, the Answering page, the Review page and the Showcase page. **2.4.2 Page Titled (A)**: the title should describe the page.
- The Answering page has no heading at all (axe `page-has-heading-one`); the Question number is a `<p>`. Screen-reader users who navigate by headings find nothing. **2.4.6 Headings and Labels**, best practice.
- On the Review page the `<h1>` is followed by each Question's `<h3>` (`heading-order`); the `<h3>` also contains the ✎ button, so its name reads "Question 1 Wrong ✎ Override result".
- The language selector sits outside any landmark (`region`), and moves from the top of Home to the footer on other pages.

**Fix:** set `document.title` per route from translation keys ("Question 3 of 10 · Set title · PencilMark", "Review · …"); on the Answering page add an `<h1>` (the Set's title, visually hidden in the side-column layout) and make the Question number an `<h2>`; use `<h2>` for the Review cards; move the ✎ buttons out of the headings; wrap the language selector in `<header>` or `<nav aria-label>`.

### F10. Label in Name on the top bar's Question toggle (Medium)

**Where:** `src/ui/Player.tsx:258-265` (toggle at `:259`); introduced with commit `79a34de`, which fixed the visible text to "Q1/10 ▾" in both languages as requested.

The visible text is "Q1/10 ▾" and the `aria-label` is "Question 1 of 10" (axe `label-content-name-mismatch`, portrait). A voice-control user who says "click Q1 slash 10" is not understood; a screen-reader user hears something different from what is on screen.

**Criteria:** 2.5.3 Label in Name (A).

**Fix:** keep the user's visible text and put it at the start of the name: `aria-label="Q1/10, Question 1 of 10"` (translation key with both parameters), or drop `aria-label` and add visually hidden text. The Review page's toggle has no `aria-label` and passes.

### F11. Language of parts, and `lang` residuals (Medium)

**Where:** `src/i18n/i18n.ts:27`, `index.html:2`, `src/ui/RichText.tsx`.

- **Question text has no language.** `lang` follows the *interface*. The sample Set is English; a user with the interface in Chinese hears English Questions, Options and Explanations read with a Chinese voice (and the reverse). **3.1.2 Language of Parts (AA).** The Question pack format has no language field, so there is nothing to mark parts with today.
- `index.html` still says `zh-CN`, correct only until `applyLanguage` runs. The page is empty until JavaScript runs (everything is inline in the single-file build), so no content is read in the wrong language; it matters to anything reading the file without running it.
- A browser set to Traditional Chinese (`zh-TW`, `zh-HK`) gets the Simplified interface and `lang="zh-CN"` (`browserLanguage` matches on the primary subtag).
- While the stored language preference loads, the first render follows the browser; a user whose stored language differs sees (and a screen reader speaks) the wrong language briefly, then the page switches.

**Fix:** (1) wrap Question content in `lang` set from the Question or Question pack; (2) change the static `lang` to `en`, or remove it and let `applyLanguage` set it before first render; (3) map `zh-TW`/`zh-HK` to `zh-TW`/`zh-HK` for `lang` while keeping the one Chinese translation, or leave and accept; (4) read the stored preference before first paint.

[NEEDS CLARIFICATION: should a Question pack declare the language of its Questions (a new field in the Question pack format, which needs a name and a glossary term), or should PencilMark detect it, or should every Question be assumed to be in the interface language?]

### F12. Options: state and correctness, and toggle semantics (Low)

**Where:** `src/ui/Player.tsx:44-54`, `src/ui/Review.tsx:384`, `src/ui/ImportForm.tsx:47-62`, `styles.css:72-74`.

- On the Review page the right Options and the user's wrong choice differ by border colour only (`.option.answer`, `.option.chosen-wrong`). The "Your answer: A" and "Correct answer: C" lines carry the same information in text, so 1.4.1 is met, but a screen-reader user reading Option by Option hears nothing about which is which. Add visually hidden "correct" / "your answer" text, or a visible glyph.
- A selected Option is shown by border colour and 1 px of inset shadow; pressed state is correct for assistive technology. Single-answer and multiple-answer Questions are the same toggle buttons in an unlabelled `div`; whether one or several may be chosen is only visible text (`player.multipleAnswerInstruction`). Consider `role="radiogroup"` / radio semantics for single-answer and a labelled `role="group"` for multiple-answer.
- The import preview's word differences use `<del>`, `<ins>` and green/red (`.diff`); the legend explains the colours, but not every screen reader announces insertions and deletions. Add visually hidden "removed:" / "added:" or brackets.

### F13. Target size and non-text contrast (Low)

- **2.5.8 Target Size (Minimum) (AA):** the ✎ buttons measure 11-12 × 21-23 px, the "What do these mean?" summary 23 px high, the language select 19 px high. The spacing exception probably covers the ✎ buttons (no other target within 24 px of their centres), but the buttons sit inside text and are hard to hit; `min-width`/`min-height: 24px` (44 px preferred on touch) removes the doubt. Everything else measured is 24 px or larger.
- **1.4.11 Non-text Contrast (AA):** the `--border` colour is 1.38:1 (light) and 1.43:1 (dark) against the card. The textareas and number input are identified by that border alone. Use a border of at least 3:1 for text fields. Buttons with text are exempt; the unselected Option border is decorative since the Option has text.

### F14. Timers cannot be hidden (Low)

**Where:** `Timers` in `src/ui/Player.tsx:84`; the preferences `sessionTimer` and `questionTimer` exist (`src/domain/settings.ts`) but the settings screen is issue #14 and does not exist, so only the language can be changed.

The Session timer and Question timer update every second (every 100 ms with millisecond precision) beside the Question. 2.2.2 Pause, Stop, Hide (A) asks for a way to hide information that updates automatically for more than five seconds, unless essential. They are not live regions, so screen readers are not flooded; the issue is movement for users with attention or vestibular needs, and `prefers-reduced-motion` is not read.

[NEEDS CLARIFICATION: should hiding the Timers be offered on the Answering page itself before the settings screen (#14) exists, or is waiting for #14 acceptable?]

### F15. Bypassing the side column (Low)

In the side-column layout the `<aside>` comes first in the DOM: 14 Tab presses (timers' ✎, 10 navigation squares, Submit, Leave…) before the first Option, and 12 before the first control of the first card on the Review page. Landmarks (`aside`, `nav`, `main`) satisfy 2.4.1 Bypass Blocks, so this is not a failure, but a keyboard user pays it on every Question. Add a "Skip to the Question" link as the first element on the Answering and Review pages, or give the side column's navigation a way to collapse.

---

## Draft issues

Not created. Each is written in glossary terms; every one changes the UI and so ends with `## Acceptance`. Suggested label for all: `needs-triage`; a draft that carries a `[NEEDS CLARIFICATION]` marker is not `ready-for-agent`. Strings are translation keys in both `en.ts` and `zh.ts`, as the project rules require. None of these touches the three test seams (Derivation, Importer, Recorder); the UI has no automated tests, so each is checked by its Acceptance steps.

### Issue 1: Open an Item flag menu without a long-press

**Body.** On the Answering page an Item flag can only be set by long-pressing or right-clicking an Option. Keyboard, switch, voice-control and screen-reader users have no stated way in (the Menu key works in Chromium but is not mentioned). Give every Option a visible, focusable control that opens its Item flag menu; keep the long-press as a shortcut. When the menu opens, focus moves into it; Escape and Close return focus to the control. The marks on an Option (`ItemFlagMarks`) get text alternatives instead of relying on `title`. Update `itemFlags.instruction` to name every way in. See F1 in `docs/accessibility-audit.md`.

## Acceptance
1. Open the Answering page. Tab to the first Option, then Tab once more. Expected: focus lands on a visible control for that Option named "Item flags for Option A" (and its Chinese equivalent in the Chinese interface).
2. Press Enter on it. Expected: the Item flag menu opens, focus is on its first button, and a screen reader says the menu's name.
3. Press Space on "Eliminated". Expected: the button shows pressed; Escape closes the menu and focus returns to the control from step 1.
4. Tab back to the Option's button. Expected: its name ends with "eliminated" (spoken as text, not the glyph ✕ alone); the Option is still not selected.
5. With the mouse, long-press and right-click another Option. Expected: the menu still opens.
6. Read the instruction above the Options. Expected: it mentions the control, the long-press and the right-click.
7. Repeat steps 1-4 in the other interface language and in the portrait layout (window 390 px wide).

### Issue 2: Announce status changes

**Body.** Nothing in PencilMark is announced (no live region). Add one polite status region and one assertive alert region, fed by one helper that takes a translation key. Announce: a Hint opened; an Item flag menu opened and an Item flag set or cleared; a Text entry saved, deleted or restored and the counter nearing its limit; moving to another Question; import result and pack errors; Copied, copy failed and download failed; the Raw log integrity failure and the storage warning; a Flag or Challenge recorded on the Review page. The Timers are not announced. See F2.

## Acceptance
1. With a screen reader running, open the Answering page and open Hint 1. Expected: the Hint's text is announced once.
2. Press Next. Expected: "Question 2 of 10" (or the equivalent in the interface language) is announced; nothing is announced when the Timers tick.
3. Write a Note and press "Save and collapse". Expected: "Note saved" is announced.
4. Type until fewer than 200 characters remain. Expected: a warning is announced once when the counter turns red, not on every keystroke.
5. On Home, paste invalid text and press Check. Expected: the error heading is announced assertively.
6. On the Review page, set a Flag. Expected: "Flag saved" is announced.
7. Repeat steps 1-3 in the other interface language. Expected: announcements are in that language.

### Issue 3: Keep focus where the user is

**Body.** Focus falls to `<body>` after route changes, closing a dialog, buttons that replace themselves, choosing a Question from the top bar's navigation, and jumping on the Review page. Move it deliberately: to the page's heading on a new route; back to the opener of a dialog (which must not be disabled while the dialog is open); to the replacement of a control that removes itself; to the Question after the top-bar navigation; to the target card after a Review jump. A Flag button stays focused while a mark is recorded. See F3.

## Acceptance
1. On Home press Enter on "Import the sample Set", then Escape. Expected: focus is on "Import the sample Set".
2. Open it again and confirm the import. Expected: focus moves to the new Set's "Start" button (the sample button is gone).
3. Press Enter on "Start". Expected: focus is on the Answering page's heading, and a screen reader announces it.
4. Open the Marks and Notes area, write a Note, Tab to "Save and collapse", press Enter. Expected: focus is on the saved entry's Edit button.
5. Press Enter on Edit. Expected: focus is in the textarea.
6. In the window 390 px wide, open the top-bar navigation, choose Question 2 with Enter. Expected: focus is on the navigation toggle, which now reads Q2/10.
7. Submit. Expected: focus is on the Review page's heading.
8. Press Enter on a Question's navigation square. Expected: the page scrolls to that card and focus is on the card's heading; Tab goes to the first control inside the card.
9. On the Review page, press Space on a Flag. Expected: focus stays on that button.

### Issue 4: Make dialogs modal for the keyboard

**Body.** Tab leaves every dialog and the page behind stays operable. Trap Tab and Shift+Tab inside the open dialog and mark the rest of the page `inert`. The long import preview becomes `role="dialog"` named by its heading; the short confirmations stay `alertdialog` and gain `aria-describedby`. See F4.

## Acceptance
1. Open the Submit dialog. Press Tab repeatedly. Expected: focus cycles between Submit and Cancel and never reaches the language selector or the page behind; Shift+Tab cycles backwards.
2. With the dialog open, try clicking Next in the page behind. Expected: nothing happens.
3. Press Escape. Expected: the dialog closes and focus returns to the Submit button.
4. Open the import preview on Home. Expected: a screen reader announces it as a dialog with the heading as its name; Tab stays inside, including the radio groups of Similar Questions.
5. Repeat step 1 in the other interface language.

### Issue 5: Read formulas aloud properly

**Body.** A formula's accessible name is its raw TeX. Replace it with a spoken form for the common constructs, in the interface language, falling back to the TeX; leave the sanitiser unchanged. Keep `role="math"` and the hidden visual layer. Larger option (structured MathML) stays a later decision. See F5 for the options and the security trade-off.
[NEEDS CLARIFICATION: is a spoken form for formulas in both interface languages worth maintaining, or should the first version speak the TeX in English only?]
[NEEDS CLARIFICATION: do the user's Question packs use maths heavily enough that structured MathML (option C or D in F5) is wanted, which would reopen the sanitiser's MathML decision?]

## Acceptance
1. Open the Showcase page and go to Question 1's Explanation (it contains $400 \div 80 = 5$). With a screen reader, read the sentence. Expected: it speaks "400 divided by 80 equals 5", not "backslash".
2. Import a Question pack with `$\frac{a+b}{2}$` in an Option and open it on the Answering page. Expected: the Option's name reads "fraction a plus b over 2" (or the chosen wording); the formula is not read twice.
3. Import a pack with a formula KaTeX cannot parse. Expected: the source shows in red as today and is read as text.
4. Switch to the other interface language and repeat step 1. Expected: the spoken form is in that language, or in English if the first version is English only.

### Issue 6: Raise text contrast on result tiles and the flag-meanings link

**Body.** In light mode the Review page's navigation squares measure 4.03 (right), 4.20 (wrong), 2.55 (partial) and 4.21 (ungraded) against their tint, and 4.29 (ungraded) in dark mode; the "What do these mean?" link is 4.34. All need 4.5:1. Darken the text colours (keep the hue in border and fill) and add a second cue besides colour for right and wrong. See F6.

## Acceptance
1. Open the Review page of a Session with right, wrong, partial and unanswered Questions, in light mode. Expected: the numbers in every navigation square are readable; a contrast checker reports 4.5:1 or more for each state.
2. Repeat in dark mode (`prefers-color-scheme: dark`).
3. Open a Marks and Notes area and look at "What do these mean?". Expected: 4.5:1 or more in both modes.
4. Look at a right and a wrong square with colour removed (greyscale). Expected: they are still told apart.

### Issue 7: Keep focused controls clear of the top bar

**Body.** In the top-bar layout the fixed bar covers 9 of 79 focus stops when moving upward through the Review page. Add scroll padding equal to the bar's height. See F7.

## Acceptance
1. Make the window 390 px wide. Open the Review page and scroll to the bottom.
2. Press Shift+Tab repeatedly up the page. Expected: every focused control is fully visible below the top bar, including the Marks and Notes area header and the ✎ buttons.
3. On the Answering page, Tab to the Marks and Notes area header at the foot of a long Question. Expected: it is not under the bar.
4. Make the window 1024 px wide and repeat step 2. Expected: no change in behaviour.

### Issue 8: Let keyboard users choose a file to import, and label the textarea

**Body.** "Choose a file" is a label around a `display:none` input that Tab never reaches. Make it keyboard-operable and give the import textarea a real label. See F8.

## Acceptance
1. On Home press Tab until "Choose a file". Expected: it is reachable and shows a focus indicator.
2. Press Enter or Space. Expected: the file dialog opens; choose a Question pack. Expected: its text fills the textarea.
3. Tab to the textarea. Expected: a screen reader announces a name (for example "Question pack") and not only the placeholder; type a character and check the name is unchanged.
4. Repeat in the other interface language.

### Issue 9: Page titles and headings

**Body.** The title is "PencilMark" everywhere; the Answering page has no heading; the Review page skips from `<h1>` to `<h3>`. Set the title per route, add the headings, and move the language selector into a landmark. See F9.

## Acceptance
1. On Home, check the tab or window title. Expected: it names Home.
2. Start a Session. Expected: the title names the Set and "Question 1 of 10", and changes when you go to Question 2.
3. With a screen reader's heading list on the Answering page. Expected: a level-1 heading (the Set) and a level-2 heading (the Question).
4. Submit; on the Review page list headings. Expected: h1, then h2 for each Question, with no skipped level, and no ✎ in a heading's name.
5. List landmarks on Home. Expected: the language selector is inside one.
6. Repeat in the other interface language.

### Issue 10: Name the top bar's Question toggle by its visible text

**Body.** The toggle shows "Q1/10 ▾" and is named "Question 1 of 10". Make the accessible name start with the visible text. See F10.

## Acceptance
1. Make the window 390 px wide and open the Answering page.
2. With voice control, say "click Q1 slash 10". Expected: the toggle activates.
3. With a screen reader, focus the toggle. Expected: the name begins "Q1/10" followed by the full wording.
4. Repeat in the other interface language. Expected: the same.

### Issue 11: Mark the language of Question text

**Body.** The `lang` attribute follows the interface, so Questions written in the other language are read in the wrong voice. Questions need a language. Also: set the static `lang` correctly, treat Traditional Chinese browsers as such for `lang`, and read the stored language before the first render. See F11.
[NEEDS CLARIFICATION: should a Question pack declare the language of its Questions (a new field in the Question pack format, which needs a name and a glossary term), or should PencilMark detect it, or should every Question be assumed to be in the interface language?]

## Acceptance
1. Set the interface to Chinese and open the sample Set (English Questions). With a screen reader, read a Question. Expected: it is read with an English voice and the surrounding interface with a Chinese voice.
2. Inspect the page. Expected: the Question's wrapper carries `lang="en"` while `<html>` carries `lang="zh-CN"`.
3. Reload with the stored language Chinese in an English browser. Expected: there is no moment when the page is shown or spoken in English.
4. Open Home in a browser set to `zh-TW`. Expected: `<html lang>` is `zh-TW` (or the decision recorded in the issue).

### Issue 12: State Option correctness and selection in words

**Body.** On the Review page the right Options and the user's wrong choice differ by colour only; single-answer and multiple-answer Questions are unlabelled toggle groups; the import preview's differences are colour only. Add text alternatives and group semantics. See F12.

## Acceptance
1. On the Review page with a screen reader, read a wrong Question Option by Option. Expected: the right Option is announced "correct" and the user's wrong choice "your answer".
2. On the Answering page, move into the Options of a single-answer Question. Expected: they are announced as one choice among several, and as "choose all that apply" for a multiple-answer Question.
3. Open the import preview with a Similar Question. Expected: removed and added text is announced as such.
4. Repeat in the other interface language.

### Issue 13: Larger targets and visible field borders

**Body.** The ✎ buttons, the flag-meanings summary and the language selector are under 24 px; text fields are outlined at 1.4:1. Give targets at least 24 px and field borders at least 3:1. See F13.

## Acceptance
1. Inspect the ✎ button beside the Question timer, the "What do these mean?" summary and the language selector. Expected: each is at least 24 × 24 px.
2. Look at the Home textarea and the Note textarea in light and dark mode. Expected: the border is distinguishable from the card at 3:1 or more.
3. On a phone-sized window, tap the ✎ buttons without touching neighbours. Expected: no mis-taps.

### Issue 14: Let the learner hide the Timers

**Body.** The Session timer and Question timer update every second and the interface has no way to hide them, though the preferences exist. Offer a control, and respect reduced-motion. See F14.
[NEEDS CLARIFICATION: should hiding the Timers be offered on the Answering page itself before the settings screen (#14) exists, or is waiting for #14 acceptable?]

## Acceptance
1. On the Answering page find the control to hide the Timers. Expected: it is reachable by keyboard and named.
2. Activate it. Expected: both Timers disappear and nothing is announced; the Session's recorded times are unchanged on the Review page.
3. Reload and start another Session. Expected: the choice is kept.

### Issue 15: Skip the side column

**Body.** The side column's 14 Tab stops come before the first Option. Add a "Skip to the Question" link as the first element on the Answering page and the Review page. See F15.

## Acceptance
1. Open the Answering page in the side-column layout and press Tab once. Expected: a "Skip to the Question" link appears.
2. Press Enter. Expected: focus is on the Question's heading; Tab goes to the first Option.
3. Repeat on the Review page. Expected: the link skips to the first Question card.
4. Repeat in the portrait layout and in the other interface language.
