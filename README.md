# LabSearch MVP (Static, GitHub Pages-ready)

A simple Google-style MVP that lets users search for lab tests and view test details.
Static frontend only, powered by a local CSV dataset.

## Features
- Clean white UI with centered search on the home page
- Autocomplete suggestions as you type
- Case-insensitive search by test name and synonyms
- Ranking: exact matches first, then partial matches
- Results cards and a details page/section
- Medical disclaimer shown on results and details pages

## Dataset
Edit `data/tests.csv`.

Required headers:
- id
- test_name
- clinical_purpose
- biomarker_or_parameter
- range_or_values
- meaning_result_interpretation
- general_notes
- synonyms (optional, separated by `|`)

Example synonyms:
`FBC|Complete Blood Count|Full Blood Count`

## Run locally
Option A: Use VS Code Live Server (recommended)
1. Open this folder in VS Code
2. Install the "Live Server" extension
3. Right-click `index.html` -> "Open with Live Server"

Option B: Any simple local server
- Python 3:
  `python -m http.server 8080`
  Then open: http://localhost:8080

## Deploy to GitHub Pages
1. Create a new GitHub repository (public or private).
2. Upload these files to the repo:
   - index.html
   - styles.css
   - app.js
   - data/tests.csv
3. In GitHub:
   - Settings -> Pages
   - Source: Deploy from a branch
   - Branch: `main` (or `master`) and folder `/root`
4. Save. Your site will be available at:
   `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/`

## Notes
- This app is informational only and does not diagnose.
- Reference ranges vary by lab method and population.
