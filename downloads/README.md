# Case PDF bundles

One ZIP per case, containing that case's PDFs. Nothing here is loaded until a
visitor actually clicks **Download PDFs (.zip)** in the case pop-up.

## Adding a bundle

1. Drop the ZIP in this folder, named after the case:

   ```
   downloads/
     turnabout-squared.zip
     turnabout-crimson-manor.zip
   ```

   Keep the file name lowercase with hyphens instead of spaces — it is what the
   browser saves the file as.

2. Point the case at it in `cases.json`:

   ```json
   "pdf_zip_url": "downloads/turnabout-squared.zip"
   ```

That's it. The red **Download PDFs (.zip)** button in that case's pop-up
starts working. Cases with `"pdf_zip_url": null` (the default) show
the same button greyed out as *No PDFs available yet*, so there is never a
broken download link.

A ZIP hosted somewhere else works too — give the full URL
(`https://drive.google.com/...`) and the button opens it in a new tab instead
of downloading directly.

## Don't

- Don't put several cases' PDFs in one shared ZIP. Each case gets its own.
- Don't set `pdf_zip_url` before the ZIP actually exists — the button would
  404.
