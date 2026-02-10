/* LabSearch MVP - static GitHub Pages-ready */

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
let lastResultsIds = [];

/* ---------- CSV parsing ---------- */
/**
 * Minimal CSV parser that supports quoted fields and commas inside quotes.
 * Assumes first line is headers. Returns array of objects.
 */
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
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

    if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
      // Toggle quotes or treat double quotes inside quoted string
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

/* ---------- Search ---------- */
function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function tokenizeSynonyms(syn) {
  const raw = (syn || "").split("|").map((x) => x.trim()).filter(Boolean);
  return raw;
}

/**
 * Rank results:
 * 0 = exact match on name
 * 1 = exact match on synonym
 * 2 = starts-with name
 * 3 = starts-with synonym
 * 4 = partial includes name
 * 5 = partial includes synonym
 */
function rankTest(test, qNorm) {
  const name = normalize(test.test_name);
  const syns = tokenizeSynonyms(test.synonyms).map(normalize);

  if (!qNorm) return 999;

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
    .sort((a, b) => a.score - b.score || a.t.test_name.localeCompare(b.t.test_name));

  return scored.map((x) => x.t);
}

function buildSuggestions(query, max = 8) {
  const qNorm = normalize(query);
  if (!qNorm) return [];

  // For suggestions, prioritize name starts-with, then name includes, then synonym starts-with
  const picks = [];
  for (const t of TESTS) {
    const name = normalize(t.test_name);
    const syns = tokenizeSynonyms(t.synonyms).map(normalize);

    if (name.startsWith(qNorm)) picks.push({ t, reason: "name" });
  }
  for (const t of TESTS) {
    if (picks.length >= max) break;
    const name = normalize(t.test_name);
    if (!picks.some((p) => p.t.id === t.id) && name.includes(qNorm)) picks.push({ t, reason: "match" });
  }
  for (const t of TESTS) {
    if (picks.length >= max) break;
    const syns = tokenizeSynonyms(t.synonyms).map(normalize);
    if (!picks.some((p) => p.t.id === t.id) && syns.some((s) => s.startsWith(qNorm))) {
      picks.push({ t, reason: "synonym" });
    }
  }

  return picks.slice(0, max);
}

/* ---------- UI helpers ---------- */
function showView(name) {
  Object.values(VIEWS).forEach((v) => v.classList.add("hidden"));
  VIEWS[name].classList.remove("hidden");
}

function escapeHTML(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setSuggestions(container, items, onPick) {
  if (!items.length) {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  container.innerHTML = items
    .map(({ t, reason }) => {
      const right =
        reason === "name" ? "Exact name" : reason === "synonym" ? "Synonym" : "Match";
      return `
        <div class="suggestion-item" role="option" data-id="${escapeHTML(t.id)}">
          <div class="suggestion-left">${escapeHTML(t.test_name)}</div>
          <div class="suggestion-right">${escapeHTML(right)}</div>
        </div>
      `;
    })
    .join("");

  container.style.display = "block";

  container.querySelectorAll(".suggestion-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      onPick(id);
    });
  });
}

function hideSuggestionsOnOutsideClick(container, exceptions = []) {
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (container.contains(target)) return;
    if (exceptions.some((x) => x.contains(target))) return;
    container.style.display = "none";
  });
}

/* ---------- Routing ---------- */
/**
 * Hash routes:
 * #/                        -> home
 * #/search?q=term           -> results
 * #/test?id=testId&q=term   -> details (keeps q for back)
 */
function parseHash() {
  const h = window.location.hash || "#/";
  const [pathPart, queryPart] = h.split("?");
  const path = pathPart.replace("#", "") || "/";
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
  lastResultsIds = results.map((r) => r.id);

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
  els.detailsSynonyms.textContent = test.synonyms ? test.synonyms.split("|").join(", ") : "None listed.";

  els.btnBackToResults.onclick = () => {
    // Prefer the query in the URL; fallback to last search
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
    els.qHome.focus();
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

  // Unknown route
  goHome();
}

/* ---------- Events: Home & Results ---------- */
function wireSearchBox(inputEl, suggestionsEl, onSearch) {
  // Autocomplete on input
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

  // Enter key search
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

/* ---------- Data loading ---------- */
async function loadData() {
  showView("loading");
  try {
    const res = await fetch("./data/tests.csv", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);

    // Normalize columns into expected keys
    TESTS = rows.map((r) => ({
      id: r.id || slugify(r.test_name || ""),
      test_name: r.test_name || "",
      clinical_purpose: r.clinical_purpose || "",
      biomarker_or_parameter: r.biomarker_or_parameter || "",
      range_or_values: r.range_or_values || "",
      meaning_result_interpretation: r.meaning_result_interpretation || "",
      general_notes: r.general_notes || "",
      synonyms: r.synonyms || "",
    })).filter((t) => t.id && t.test_name);

    if (!TESTS.length) throw new Error("No test records were found in tests.csv.");

    initUI();
    onRoute();
  } catch (err) {
    els.errorText.textContent =
      "Failed to load ./data/tests.csv. Ensure the file exists and is committed to the repository. " +
      `Details: ${String(err.message || err)}`;
    showView("error");
  }
}

function slugify(s) {
  return normalize(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "test";
}

/* ---------- Boot ---------- */
window.addEventListener("hashchange", onRoute);
loadData();
