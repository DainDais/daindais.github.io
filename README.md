# Dais on the Web

A single-page profile (like a dot.cards profile) that runs on GitHub Pages. Plain HTML/CSS/JS, no build step.

```
index.html          page content (name, details, skills, links, documents)
styles.css          all styling
app.js              PDF previews, document viewer (drag / zoom)
faulty-terminal.js  animated site background (React Bits FaultyTerminal, ported to plain JS)
faulty-terminal.css its base styles
assets/vendor/      ogl (WebGL library the background uses)
hints.js            startup hints ("Grab me", "Click to expand")
line-sidebar.js/css expandable section menu (React Bits LineSidebar, ported to plain JS)
tilted-card.js      hover tilt + tooltip on cards and buttons (React Bits TiltedCard, ported to plain JS)
assets/fonts/       Undefined Medium webfont (SIL Open Font License, see OFL.txt)
lanyard-card.js     artwork printed on the 3D lanyard badge (edit name/school/major here)
assets/lanyard/     built React Bits Lanyard bundle + card model (generated — don't edit)
lanyard-src/        Lanyard source; rebuild with `npm install && npm run build` inside it
assets/img/         headshot.jpg (add banner.jpg here if you want a banner image)
assets/docs/        DainDais_RESUME.pdf, Dain_Dais_CV.pdf
assets/contact.vcf  contact card file (not linked from the page right now)
qr/                 QR codes pointing at https://daindais.github.io/
```

## Editing

- **Text, skills, links:** edit `index.html`. Each skill is an `<li>` in the `skills` list.
- **Updating your resume/CV:** replace the PDF in `assets/docs/` with the same file name. The preview image updates automatically.
- **Banner image:** put a wide image at `assets/img/banner.jpg` and add `style="background-image: url('assets/img/banner.jpg')"` to the `<div class="banner">`.

## Preview locally

The PDF previews need a web server (they won't load from a double-clicked file):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Publish on GitHub Pages

1. Create a **public** repo named exactly `daindais.github.io`.
2. Push this folder to it:

   ```bash
   git init -b main
   git add .
   git commit -m "Initial site"
   git remote add origin https://github.com/DainDais/daindais.github.io.git
   git push -u origin main
   ```

3. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
4. After a minute the site is live at **https://daindais.github.io/** — that's the URL the QR codes in `qr/` point to.

If you use a different repo name (e.g. `card`), the URL becomes `https://daindais.github.io/card/` and the QR code must be regenerated for that URL.

## QR code

`qr/profile-qr.svg` is vector (best for print). Scan it with your phone after the site is live to confirm it opens. Keep it at least ~0.8 in (2 cm) wide on the card with the white border intact.
