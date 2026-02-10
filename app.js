/* LabSearch MVP - Static GitHub Pages-ready
   - Loads tests from ./data/tests.csv (your exact CSV headers)
   - Google-style search UI with autocomplete
   - Case-insensitive search
   - Ranking: exact matches first, then starts-with, then contains
   - Supports synonyms if you add a "Synonyms" column (pipe-separated: A|B|C)
   - Hash routing:
     #/                 -> Home
     #/search?q=term    -> Results
     #/test?id=slug&q=term -> Details
*/

const VIEWS = {
  home: document.getElementById("view-home"),
  results: document.getElementById("view-results"),
  details: document.getElementById("view-details"),
  loading: document.getElementById("view-loading"),
  error: document.getElementById("view-error"),
};

const els = {
  // Home
  qHome: document.getElementById("qHome"),
  suggestionsHome: document.getElementById("suggestionsHome"),
  btnSearchHome: document.getElementById("btnSearchHome"),
  btnClearHome: document.getElementById("btnClearHome"),

  // Results
  qResults: document.getElementById("qResults"),
  suggestionsResults: document.getElementById("suggestionsResults"),
  btnSearchResults: document.getElementById("btnSearchResults"),
  resultsMeta: document.getElementById("resultsMeta"),
  resultsList: document.getElementById("resultsList"),

  // Details
  btnBackToResults: document.getElementById("btnBackToResults"),
  detailsTitle: document.getElementById("detailsTitle"),
  detailsPurpose: document.getElementById("detailsPurpose"),
  detailsBiomarker: document.getElementById("detailsBiomarker"),
  detailsRange: document.getElementById("detailsRange"),
  detailsInterpretation: document.getElementById("detailsInterpretation"),
  detailsNotes: document.getElementById("detailsNotes"),
  detailsSynonyms: document.getElementById("detailsSynonyms"),

  // Error
  errorText: document.getElementById("errorText"),
};

let TESTS = [];
let lastResultsQuery = "";

/* ---------------- CSV parsing ---------------- */
/**
 * Minimal CSV parser:
 * - Supports quoted fields
 * - Supports commas inside quotes
 * - First row = headers
 */
function parseCSV(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map((h) => cleanHeader(h));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return rows;
}

function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out;
}

function cleanHeader(h) {
  // Remove BOM + trim
  return String(h || "").replace(/^\uFEFF/, "").trim();
}

/* ---------------- Helpers ---------------- */
function showView(name) {
  Object.values(VIEWS).forEach((v) => v.classList.add("hidden"));
  VIEWS[name].classList.remove("hidden");
}

function escapeHTML(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(s) {
  return String(s ?? "").toLowerCase().trim();
}

function slugify(s) {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "test";
}

function tokenizeSynonyms(s) {
  return String(s ?? "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
}

function getCI(row, headerName) {
  // Case-insensitive header lookup
  const key = Object.keys(row).find(
    (k) => normalize(k) === normalize(headerName)
  );
  return key ? String(row[key] ?? "").trim() : "";
}

/* ---------------- Search ranking ---------------- */
/**
 * Rank results:
 * 0 = exact test name
 * 1 = exact synonym
 * 2 = starts-with name
 * 3 = starts-with synonym
 * 4 = includes name
 * 5 = includes synonym
 */
function rankTest(test, qNorm) {
  if (!qNorm) return 999;

  const name = normalize(test.test_name);
  const syns = tokenizeSynonyms(test.synonyms).map(normalize);

  if (name === qNorm) return 0;
  if (syns.includes(qNorm)) return 1;

  if (name.startsWith(qNorm)) return 2;
  if (syns.some((s) => s.startsWith(qNorm))) return 3;

  if (name.includes(qNorm)) return 4;
  if (syns.some((s) => s.includes(qNorm))) return 5;

  return 999;
}

function searchTests(query) {
  const qNorm = normalize(query);
  if (!qNorm) return [];

  const scored = TESTS.map((t) => ({ t, score: rankTest(t, qNorm) }))
    .filter((x) => x.score !== 999)
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.t.test_name.localeCompare(b.t.test_name, undefined, { sensitivity: "base" })
    );

  return scored.map((x) => x.t);
}

function buildSuggestions(query, max = 8) {
  const qNorm = normalize(query);
  if (!qNorm) return [];

  const picks = [];

  // 1) name starts-with
  for (const t of TESTS) {
    if (picks.length >= max) break;
    if (normalize(t.test_name).startsWith(qNorm)) picks.push({ t, reason: "name" });
  }

  // 2) name contains
  for (const t of TESTS) {
    if (picks.length >= max) break;
    const name = normalize(t.test_name);
    if (!picks.some((p) => p.t.id === t.id) && name.includes(qNorm)) {
      picks.push({ t, reason: "match" });
    }
  }

  // 3) synonym starts-with
  for (const t of TESTS) {
    if (picks.length >= max) break;
    const syns = tokenizeSynonyms(t.synonyms).map(normalize);
    if (!picks.some((p) => p.t.id === t.id) && syns.some((s) => s.startsWith(qNorm))) {
      picks.push({ t, reason: "synonym" });
    }
  }

  return picks.slice(0, max);
}

/* ---------------- Suggestions UI ---------------- */
function setSuggestions(container, items, onPickById) {
  if (!items.length) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  container.innerHTML = items
    .map(({ t, reason }) => {
      const badge =
        reason === "name" ? "Name" : reason === "synonym" ? "Synonym" : "Match";
      return `
        <div class="suggestion-item" role="option" data-id="${escapeHTML(t.id)}">
          <div class="suggestion-left">${escapeHTML(t.test_name)}</div>
          <div class="suggestion-right">${escapeHTML(badge)}</div>
        </div>
      `;
    })
    .join("");

  container.style.display = "block";

  container.querySelectorAll(".suggestion-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      onPickById(id);
    });
  });
}

function hideSuggestionsOnOutsideClick(container, exceptions = []) {
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (container.contains(target)) return;
    if (exceptions.some((x) => x && x.contains(target))) return;
    container.style.display = "none";
  });
}

function wireSearchBox(inputEl, suggestionsEl, onSearch) {
  inputEl.addEventListener("input", () => {
    const items = buildSuggestions(inputEl.value, 8);
    setSuggestions(suggestionsEl, items, (id) => {
      const test = TESTS.find((t) => t.id === id);
      if (!test) return;
      inputEl.value = test.test_name;
      suggestionsEl.style.display = "none";
      onSearch(inputEl.value);
    });
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      suggestionsEl.style.display = "none";
      onSearch(inputEl.value);
    } else if (e.key === "Escape") {
      suggestionsEl.style.display = "none";
    }
  });

  hideSuggestionsOnOutsideClick(suggestionsEl, [inputEl]);
}

/* ---------------- Routing ---------------- */
/**
 * Hash routes:
 * #/                      -> home
 * #/search?q=term         -> results
 * #/test?id=slug&q=term   -> details
 */
function parseHash() {
  const h = window.location.hash || "#/";
  const [pathPart, queryPart] = h.split("?");
  const path = (pathPart || "#/").replace("#", "") || "/";
  const params = new URLSearchParams(queryPart || "");
  return { path, params };
}

function goHome() {
  window.location.hash = "#/";
}

function goSearch(q) {
  const qp = new URLSearchParams({ q: q || "" });
  window.location.hash = `#/search?${qp.toString()}`;
}

function goDetails(id, q) {
  const qp = new URLSearchParams({ id: id || "", q: q || "" });
  window.location.hash = `#/test?${qp.toString()}`;
}

function renderResults(q) {
  const results = searchTests(q);
  lastResultsQuery = q || "";

  els.resultsMeta.textContent = results.length
    ? `${results.length} result(s) for “${q}”`
    : `No results found for “${q}”`;

  els.resultsList.innerHTML = results
    .map((t) => {
      const snippet = t.clinical_purpose || t.biomarker_or_parameter || "";
      return `
        <div class="card" data-id="${escapeHTML(t.id)}" tabindex="0" role="button" aria-label="Open ${escapeHTML(t.test_name)}">
          <h3>${escapeHTML(t.test_name)}</h3>
          <p>${escapeHTML(snippet)}</p>
        </div>
      `;
    })
    .join("");

  els.resultsList.querySelectorAll(".card").forEach((card) => {
    const open = () => {
      const id = card.getAttribute("data-id");
      goDetails(id, q);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") open();
    });
  });

  els.qResults.value = q || "";
  showView("results");
}

function renderDetails(id, q) {
  const test = TESTS.find((t) => t.id === id);

  if (!test) {
    els.errorText.textContent = "That test record was not found in the dataset.";
    showView("error");
    return;
  }

  els.detailsTitle.textContent = test.test_name || "Test Details";
  els.detailsPurpose.textContent = test.clinical_purpose || "Not provided.";
  els.detailsBiomarker.textContent = test.biomarker_or_parameter || "Not provided.";
  els.detailsRange.textContent = test.range_or_values || "Not provided.";
  els.detailsInterpretation.textContent = test.meaning_result_interpretation || "Not provided.";
  els.detailsNotes.textContent = test.general_notes || "Not provided.";

  const synList = tokenizeSynonyms(test.synonyms);
  els.detailsSynonyms.textContent = synList.length ? synList.join(", ") : "None listed.";

  els.btnBackToResults.onclick = () => {
    const backQ = q || lastResultsQuery || "";
    if (backQ) goSearch(backQ);
    else goHome();
  };

  showView("details");
}

function onRoute() {
  const { path, params } = parseHash();

  if (!TESTS.length) {
    showView("loading");
    return;
  }

  if (path === "/" || path === "") {
    showView("home");
    els.qHome && els.qHome.focus();
    return;
  }

  if (path.startsWith("/search")) {
    const q = params.get("q") || "";
    renderResults(q);
    return;
  }

  if (path.startsWith("/test")) {
    const id = params.get("id") || "";
    const q = params.get("q") || "";
    renderDetails(id, q);
    return;
  }

  goHome();
}

/* ---------------- UI init ---------------- */
function initUI() {
  // Home search
  wireSearchBox(els.qHome, els.suggestionsHome, (q) => goSearch(q));
  els.btnSearchHome.addEventListener("click", () => goSearch(els.qHome.value));
  els.btnClearHome.addEventListener("click", () => {
    els.qHome.value = "";
    els.suggestionsHome.style.display = "none";
    els.qHome.focus();
  });

  // Results search
  wireSearchBox(els.qResults, els.suggestionsResults, (q) => goSearch(q));
  els.btnSearchResults.addEventListener("click", () => goSearch(els.qResults.value));
}

/* ---------------- Data loading ---------------- */
/**
 * Expected CSV headers (exactly as your file):
 * - Test Name
 * - Clinical purpose
 * - biomarker or parameter
 * - All possible Range / Values
 * - Meaning Result Interpretation
 * - General Notes
 *
 * Optional:
 * - Synonyms  (pipe-separated: FBC|Complete Blood Count)
 */
async function loadData() {
  showView("loading");

  try {
    const res = await fetch("./data/tests.csv", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    let text = await res.text();
    text = text.replace(/^\uFEFF/, ""); // strip BOM

    const rows = parseCSV(text);
    if (!rows.length) throw new Error("No rows parsed from tests.csv (check formatting).");

    TESTS = rows
      .map((r) => {
        const testName = getCI(r, "Test Name");
        const synonyms = getCI(r, "Synonyms"); // optional; blank if not present

        return {
          id: getCI(r, "id") || getCI(r, "ID") || slugify(testName),
          test_name: testName,
          clinical_purpose: getCI(r, "Clinical purpose"),
          biomarker_or_parameter: getCI(r, "biomarker or parameter"),
          range_or_values: getCI(r, "All possible Range / Values"),
          meaning_result_interpretation: getCI(r, "Meaning Result Interpretation"),
          general_notes: getCI(r, "General Notes"),
          synonyms: synonyms || "",
        };
      })
      .filter((t) => t.test_name && t.test_name.length > 0);

    if (!TESTS.length) {
      throw new Error(
        "No test records were found. Ensure the CSV has a header row and at least one row with a Test Name."
      );
    }

    initUI();
    onRoute();
  } catch (err) {
    els.errorText.textContent =
      "Failed to load ./data/tests.csv. Ensure the file exists and is committed to the repository. " +
      `Details: ${String(err && err.message ? err.message : err)}`;
    showView("error");
  }
}

/* ---------------- Boot ---------------- */
window.addEventListener("hashchange", onRoute);
loadData();
