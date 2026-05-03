const fileInput = document.querySelector("#dataFiles");
const fileStatus = document.querySelector("#fileStatus");
const form = document.querySelector("#filters");
const downloadButton = document.querySelector("#downloadReport");
const possibleResults = document.querySelector("#possibleResults");
const nearResults = document.querySelector("#nearResults");
const nearSection = document.querySelector("#nearSection");
const advancedQualified = document.querySelector("#advancedQualified");
const advancedRankWrap = document.querySelector("#advancedRankWrap");
const advancedRankInput = document.querySelector("#advancedRank");
const mainsRankInput = document.querySelector("#mainsRank");
const websiteVisitCount = document.querySelector("#websiteVisitCount");
const resultUseCount = document.querySelector("#resultUseCount");
const loadedCount = document.querySelector("#loadedCount");
const possibleCount = document.querySelector("#possibleCount");
const nearCount = document.querySelector("#nearCount");

const defaultQuotas = ["AI", "All India", "Other State"];
const counterKeys = {
  websiteVisits: "jeeInstituteFinder.websiteVisits",
  resultUses: "jeeInstituteFinder.resultUses",
};
let rows = [];
let lastReport = "";

function readCounter(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeCounter(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    return value;
  }
  return value;
}

function incrementCounter(key) {
  return writeCounter(key, readCounter(key) + 1);
}

function formatCount(value) {
  return value.toLocaleString("en-IN");
}

function updateUsageStats() {
  websiteVisitCount.textContent = formatCount(readCounter(counterKeys.websiteVisits));
  resultUseCount.textContent = formatCount(readCounter(counterKeys.resultUses));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseRank(value) {
  const text = String(value ?? "").trim().replaceAll(",", "");
  return /^\d+$/.test(text) ? Number(text) : null;
}

function parseList(value, defaults) {
  const text = String(value ?? "").trim();
  if (!text) return defaults;
  if (["all", "any", "*"].includes(normalize(text))) return null;
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseLimit(value) {
  const text = String(value ?? "").trim();
  if (!text) return 100;
  if (normalize(text) === "all") return null;
  return /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : 100;
}

function fileSortKey(name) {
  const match = String(name).match(/^(round|csab)_(\d+)/i);
  if (!match) return [99, 0, name];
  return [match[1].toLowerCase() === "round" ? 0 : 1, Number(match[2]), name];
}

function compareKeys(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

function quotaMatches(rowQuota, selectedQuotas) {
  if (selectedQuotas === null) return true;
  const aliases = {
    ai: ["ai", "all india", "all-india"],
    "all india": ["ai", "all india", "all-india"],
    "other state": ["os", "other state"],
    os: ["os", "other state"],
    "home state": ["hs", "home state"],
    hs: ["hs", "home state"],
  };

  const rowValue = normalize(rowQuota);
  return selectedQuotas.some((quota) => {
    const quotaValue = normalize(quota);
    return (aliases[quotaValue] ?? [quotaValue]).includes(rowValue);
  });
}

function fieldMatches(rowValue, selectedValues) {
  if (selectedValues === null) return true;
  const rowText = normalize(rowValue);
  return selectedValues.some((value) => rowText === normalize(value));
}

function isIit(institute) {
  return normalize(institute).startsWith("indian institute of technology");
}

function rankForRow(row, mainsRank, advancedRank) {
  if (isIit(row.institute)) {
    if (advancedRank === null) return null;
    return { rank: advancedRank, exam: "JEE Advanced" };
  }
  return { rank: mainsRank, exam: "JEE Main" };
}

function achievementMessage(items) {
  const instituteNames = items.map((row) => normalize(row.institute));

  if (instituteNames.some((name) => name.startsWith("indian institute of technology"))) {
    return "Congratulations, you can be IITian.";
  }
  if (instituteNames.some((name) => name.includes("national institute of technology"))) {
    return "Congratulations, you can be NITian.";
  }
  if (instituteNames.some((name) => name.includes("indian institute of information technology"))) {
    return "Congratulations, you can be IIITian.";
  }
  return "";
}

function parseTsv(text, source) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return {
      source,
      institute: row.Institute?.trim() ?? "",
      program: row["Academic Program Name"]?.trim() ?? "",
      quota: row.Quota?.trim() ?? "",
      seatType: row["Seat Type"]?.trim() ?? "",
      gender: row.Gender?.trim() ?? "",
      openingRank: parseRank(row["Opening Rank"]),
      closingRank: parseRank(row["Closing Rank"]),
    };
  }).filter((row) => row.closingRank !== null);
}

async function loadFiles(files) {
  const sortedFiles = [...files].sort((a, b) => compareKeys(fileSortKey(a.name), fileSortKey(b.name)));
  const loadedRows = [];

  for (const file of sortedFiles) {
    const text = await file.text();
    loadedRows.push(...parseTsv(text, file.name));
  }

  rows = loadedRows;
  loadedCount.textContent = rows.length.toLocaleString("en-IN");
  fileStatus.textContent = `${sortedFiles.length} files selected`;
}

function filterRows(mainsRank, advancedRank, quotas, seatTypes, genders) {
  const filtered = rows.filter((row) => {
    return quotaMatches(row.quota, quotas)
      && fieldMatches(row.seatType, seatTypes)
      && fieldMatches(row.gender, genders);
  });

  const possible = filtered
    .map((row) => ({ ...row, rankInfo: rankForRow(row, mainsRank, advancedRank) }))
    .filter((row) => row.rankInfo !== null && row.closingRank > row.rankInfo.rank)
    .sort((a, b) => compareKeys(
      [...fileSortKey(a.source), a.closingRank, a.institute, a.program],
      [...fileSortKey(b.source), b.closingRank, b.institute, b.program],
    ));

  const near = filtered
    .map((row) => ({ ...row, rankInfo: rankForRow(row, mainsRank, advancedRank) }))
    .filter((row) => row.rankInfo !== null && row.closingRank < row.rankInfo.rank)
    .sort((a, b) => compareKeys(
      [...fileSortKey(a.source), -a.closingRank, a.institute, a.program],
      [...fileSortKey(b.source), -b.closingRank, b.institute, b.program],
    ));

  return { possible, near };
}

function applyLimit(items, limit) {
  return limit === null ? items : items.slice(0, limit);
}

function renderTable(target, items) {
  if (!items.length) {
    target.innerHTML = '<p class="empty">No matching institute/program found.</p>';
    return;
  }

  const body = items.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.source)}</td>
      <td>${escapeHtml(row.rankInfo.exam)}</td>
      <td>${row.rankInfo.rank}</td>
      <td>${escapeHtml(row.institute)}</td>
      <td>${escapeHtml(row.program)}</td>
      <td>${escapeHtml(row.quota)}</td>
      <td>${escapeHtml(row.seatType)}</td>
      <td>${escapeHtml(row.gender)}</td>
      <td>${row.openingRank ?? "-"}</td>
      <td>${row.closingRank}</td>
    </tr>
  `).join("");

  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>No.</th>
          <th>File</th>
          <th>Exam</th>
          <th>Rank Used</th>
          <th>Institute</th>
          <th>Program</th>
          <th>Quota</th>
          <th>Seat</th>
          <th>Gender</th>
          <th>Opening</th>
          <th>Closing</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderPossibleResults(target, items, message) {
  renderTable(target, items);
  if (!message) return;

  const banner = document.createElement("p");
  banner.className = "achievement";
  banner.textContent = message;
  target.prepend(banner);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function valuesText(values) {
  return values === null ? "all" : values.join(", ");
}

function reportSection(title, items, total) {
  const lines = ["", title];
  if (!items.length) {
    lines.push("No matching institute/program found.");
    return lines.join("\n");
  }

  lines.push("No.\tFile\tExam\tRank Used\tInstitute\tProgram\tQuota\tSeat\tGender\tOpening\tClosing");
  items.forEach((row, index) => {
    lines.push([
      index + 1,
      row.source,
      row.rankInfo.exam,
      row.rankInfo.rank,
      row.institute,
      row.program,
      row.quota,
      row.seatType,
      row.gender,
      row.openingRank ?? "-",
      row.closingRank,
    ].join("\t"));
  });
  lines.push(`Showing ${items.length} of ${total} matching rows.`);
  return lines.join("\n");
}

function buildReport(mainsRank, advancedRank, quotas, seatTypes, genders, possible, shownPossible, near, shownNear, includeNear) {
  const message = achievementMessage(possible);
  const lines = [
    "JEE Institute/Program Rank Results",
    `Generated at: ${new Date().toLocaleString("en-IN")}`,
    `JEE Advanced qualified: ${advancedRank === null ? "no" : "yes"}`,
    `JEE Advanced rank: ${advancedRank === null ? "-" : advancedRank}`,
    `JEE Main rank: ${mainsRank}`,
    `Quota: ${valuesText(quotas)}`,
    `Seat type: ${valuesText(seatTypes)}`,
    `Gender: ${valuesText(genders)}`,
  ];

  if (message) {
    lines.push("", message);
  }

  lines.push(reportSection("Possible options: closing rank greater than your rank", shownPossible, possible.length));

  if (includeNear) {
    lines.push(reportSection("Near misses: closing rank less than your rank, nearest first", shownNear, near.length));
  }

  return lines.join("\n");
}

incrementCounter(counterKeys.websiteVisits);
updateUsageStats();

fileInput.addEventListener("change", async (event) => {
  await loadFiles(event.target.files);
});

advancedQualified.addEventListener("change", () => {
  advancedRankWrap.classList.toggle("is-hidden", !advancedQualified.checked);
  advancedRankInput.required = advancedQualified.checked;
  if (!advancedQualified.checked) advancedRankInput.value = "";
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const mainsRank = parseRank(mainsRankInput.value);
  if (!mainsRank) {
    mainsRankInput.focus();
    return;
  }

  const advancedRank = advancedQualified.checked ? parseRank(advancedRankInput.value) : null;
  if (advancedQualified.checked && !advancedRank) {
    advancedRankInput.focus();
    return;
  }

  const quotas = parseList(document.querySelector("#quota").value, defaultQuotas);
  const seatTypes = parseList(document.querySelector("#seatType").value, ["OPEN"]);
  const genders = parseList(document.querySelector("#gender").value, ["Gender-Neutral"]);
  const possibleLimit = parseLimit(document.querySelector("#possibleLimit").value);
  const nearLimit = parseLimit(document.querySelector("#nearLimit").value);
  const includeNear = document.querySelector("#showNear").checked;

  const { possible, near } = filterRows(mainsRank, advancedRank, quotas, seatTypes, genders);
  const shownPossible = applyLimit(possible, possibleLimit);
  const shownNear = applyLimit(near, nearLimit);
  const message = achievementMessage(possible);

  renderPossibleResults(possibleResults, shownPossible, message);
  nearSection.hidden = !includeNear;
  if (includeNear) renderTable(nearResults, shownNear);

  incrementCounter(counterKeys.resultUses);
  updateUsageStats();
  possibleCount.textContent = possible.length.toLocaleString("en-IN");
  nearCount.textContent = includeNear ? near.length.toLocaleString("en-IN") : "0";
  lastReport = buildReport(mainsRank, advancedRank, quotas, seatTypes, genders, possible, shownPossible, near, shownNear, includeNear);
  downloadButton.disabled = !lastReport;
});

downloadButton.addEventListener("click", () => {
  if (!lastReport) return;

  const blob = new Blob([lastReport], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);

  link.href = url;
  link.download = `rank_results_${timestamp}.txt`;
  link.click();
  URL.revokeObjectURL(url);
});
