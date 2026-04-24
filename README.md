# Engineering Portfolio Booklet

A beginner-friendly engineering portfolio booklet website built with plain HTML, CSS, and JavaScript.

It uses the `StPageFlip` library to create a realistic page-turning booklet layout.

## Files

```text
personal-portfolio/
|-- index.html
|-- styles.css
|-- script.js
`-- README.md
```

## Pages Included

- Cover
- About
- Projects overview
- One sample project page
- Media page
- Contact page

## How to Run Locally

1. Open the `personal-portfolio` folder.
2. Start a simple local server in that folder.

Example with Python:

```bash
python -m http.server 8000
```

3. Open your browser and go to:

```text
http://localhost:8000
```

## Notes

- The booklet effect is loaded from the `StPageFlip` CDN in `index.html`.
- If the library does not load, the booklet buttons will be disabled.
- All placeholder content is easy to replace later with real portfolio details.
