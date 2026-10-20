# Local fonts

Unmodified WOFF2 files from Fontsource variable font packages 5.3.0:

- `@fontsource-variable/montserrat`: Cyrillic and Latin normal subsets, weights 100–900.
- `@fontsource-variable/unbounded`: Cyrillic normal subset (including space), weights 200–900. Used only for the Russian service name on Home. Other glyphs fall back to Montserrat.

Three files total 93,208 bytes (about 91 KiB). No runtime font package or third-party font requests.

Both families are distributed under SIL Open Font License 1.1. Original copyright notices and complete licenses are included in `Montserrat-OFL.txt` and `Unbounded-OFL.txt`.

Sources: https://fontsource.org/fonts/montserrat and https://fontsource.org/fonts/unbounded.

`src/styles/fonts.css` declares Unicode subsets, swap loading and metric-adjusted local fallback faces. `index.html` preloads the two UI subsets with Vite's `%BASE_URL%` so paths work on GitHub Pages. Unbounded is requested only when Home uses it. Body/UI use Montserrat 400/500/600/700. Unbounded is limited to the Home title at 500; existing `font-black` UI headings use 700 via Tailwind.
