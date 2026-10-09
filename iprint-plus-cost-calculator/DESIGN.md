# iPrint design tokens

All shared colours, radii, spacing and type sizes live in [`shared/tokens.css`](shared/tokens.css).
Every page loads it as its **first** stylesheet. Page stylesheets keep their own short names
(`--blue`, `--ink`, `--muted`, `--line`) but point them at the tokens, so changing a token changes every page.

This file is a note for developers. It is not published: GitHub Pages and the Hostinger package both
drop `*.md`, and `.htaccess` refuses `.md` requests.

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `--ip-blue` | `#0072d6` | Buttons, links, focus rings. White text on it passes WCAG AA (4.9:1). |
| `--ip-blue-hover` | `#005bb0` | Hover and pressed state of blue buttons and links. |
| `--ip-blue-text` | `#005bb0` | Blue **text** (prices, eyebrows, labels). Passes AA on white and on the light-blue panels. |
| `--ip-blue-bright` | `#0a8cff` | Decoration only: illustrations, glows, large shapes. Never body text: 3.3:1 on white. |
| `--ip-blue-soft` | `#e6f2ff` | Tinted panels and selected states. |
| `--ip-ink` | `#101820` | Headings and body text. |
| `--ip-muted` | `#5d6f80` | Secondary text (5.1:1 on white). |
| `--ip-line` | `#d9e6f2` | Borders and dividers. |
| `--ip-page` / `--ip-surface` | `#eef6ff` / `#ffffff` | Page background / cards and sheets. |
| `--ip-danger` / `--ip-danger-line` / `--ip-danger-soft` | `#b42318` / `#d92d20` / `#fff4f4` | Error text / error borders / error panels. |
| `--ip-success` | `#12a879` | Success accents; pair with text, do not use as text on white. |
| `--ip-line-green` | `#06c755` | The LINE contact button only. |

Rules:
- Text in blue uses `--blue-text` (`color: var(--blue-text)`); backgrounds and borders use `--blue`.
- Check contrast when putting text on a tinted panel: body text needs 4.5:1, text of 24px+ (or 18.66px+ bold) needs 3:1.
- The 3D material preview keeps its warm studio palette (`--bg`, `--accent`, translucent `--line`); only its text colours follow the tokens.

## Radius

`--ip-radius-sm` 8px (inputs, chips) · `--ip-radius-md` 12px (buttons, small cards) · `--ip-radius-lg` 18px (cards, sheets) · `--ip-radius-pill` 999px.

## Spacing

A 4px grid: `--ip-space-1` 4px · `-2` 8px · `-3` 12px · `-4` 16px · `-5` 24px · `-6` 32px · `-7` 48px.
Phone layouts keep a 16px side gutter.

## Type

Fonts come from [`shared/typography.css`](shared/typography.css): Inter + Noto Sans Thai for text, Sora for headings.

| Token | Size | Use |
| --- | --- | --- |
| `--ip-text-xs` | 12px | Labels, captions, eyebrows — the smallest size on any page |
| `--ip-text-sm` | 13px | Secondary text |
| `--ip-text-md` | 15px | Body |
| `--ip-text-lg` | 18px | Lead text, card titles |
| `--ip-text-xl` | 24px | Section headings |
| `--ip-text-2xl` | 32px | Page headings |

Thai headings: keep phrases together with `<span class="keep">…</span>` (`display: inline-block`) where a line break
would split a word on narrow screens.

## Touch and focus

- Touch targets are at least `--ip-tap` (44px) high on phones and touch screens; inline links inside a sentence are exempt.
- Every interactive element shows a visible focus ring (`outline` in `--ip-blue`).
- Form errors appear under the field (`.field-error`), the field gets `aria-invalid="true"` and `aria-describedby`,
  and focus moves to the first invalid field.

## Migration status

Only the token variables were moved. Many hard-coded hex values remain inside the page stylesheets
(`css/app.css` alone has several hundred); replace them with tokens when a rule is next edited, rather than in one sweep.
