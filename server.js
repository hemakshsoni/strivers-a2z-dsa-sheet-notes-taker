const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");

// ============================================================
// CONFIG
// ============================================================
const NOTES_PATH = "D:\\Striver Sheet\\DSA new"; // Change this to your folder
const PORT = 27182;
const PROBLEM_MAP_FILE = path.join(__dirname, "problem_map.json");
const REFRESH_INTERVAL_HOURS = 24; // Re-fetch problem map every 24 hours
const A2Z_SHEET_URL =
  "https://takeuforward.org/strivers-a2z-sheet-learn-dsa-a-to-z";
// ============================================================

let PROBLEM_MAP = {};

// ── Helpers ──────────────────────────────────────────────────

function sanitize(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim();
}

function shorten(name) {
  return name
    .replace(/\s*\[.*?\]\s*$/g, "")
    .replace(/\s+or similar thing in your\s+language\s*$/i, "")
    .trim();
}

// ── Problem map: load, parse, save ───────────────────────────

function parseProblemsFromHTML(html) {
  // Pull out the sections array embedded in Next.js streaming data
  const pushBlocks = [
    ...html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs),
  ].map((m) => {
    try {
      return m[1].encode ? m[1] : Buffer.from(m[1]).toString();
    } catch {
      return m[1];
    }
  });

  // Decode unicode escapes
  const decoded = pushBlocks
    .map((s) => {
      try {
        return s.replace(/\\u([\dA-Fa-f]{4})/g, (_, h) =>
          String.fromCharCode(parseInt(h, 16)),
        );
      } catch {
        return s;
      }
    })
    .join("");

  // Also try directly on raw html
  const source = decoded.length > 1000 ? decoded : html;

  const sectionsMatch = source.match(/"sections":\[(\{[\s\S]*?\})\]/);
  if (!sectionsMatch) return null;

  // Use a proper bracket-matching extraction
  const idx = source.indexOf('"sections":[{');
  if (idx < 0) return null;
  const start = idx + '"sections":'.length;
  let depth = 0,
    end = start,
    inStr = false,
    esc = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\" && inStr) {
      esc = true;
      continue;
    }
    if (c === '"' && !esc) inStr = !inStr;
    if (!inStr) {
      if (c === "[") depth++;
      else if (c === "]") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
  }

  try {
    return JSON.parse(source.slice(start, end));
  } catch {
    return null;
  }
}

function buildProblemMap(sections) {
  const map = {};
  sections.forEach((cat, ci) => {
    const catName = cat.category_name.trim();
    const catShort = shorten(catName);
    const catDir = sanitize(`${String(ci + 1).padStart(2, "0")}. ${catShort}`);

    (cat.subcategories || []).forEach((sub, si) => {
      const subName = sub.subcategory_name.trim();
      const subShort = shorten(subName);
      const subFile = sanitize(
        `${String(si + 1).padStart(2, "0")}. ${subShort}`,
      );

      (sub.problems || []).forEach((prob) => {
        const lc = prob.leetcode === "$undefined" ? "" : prob.leetcode || "";
        map[prob.problem_id] = {
          problem_name: prob.problem_name,
          category: catName,
          category_dir: catDir,
          subcategory: subName,
          subcategory_file: subFile,
          difficulty: prob.difficulty || "",
          leetcode: lc,
        };
      });
    });
  });
  return map;
}

function fetchAndRefreshProblemMap() {
  console.log("🔄 Fetching latest problem list from A2Z Sheet...");
  return new Promise((resolve) => {
    https
      .get(
        A2Z_SHEET_URL,
        { headers: { "User-Agent": "Mozilla/5.0" } },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            const sections = parseProblemsFromHTML(data);
            if (sections && sections.length > 0) {
              const newMap = buildProblemMap(sections);
              const count = Object.keys(newMap).length;
              if (count > 0) {
                PROBLEM_MAP = newMap;
                fs.writeFileSync(
                  PROBLEM_MAP_FILE,
                  JSON.stringify(newMap, null, 2),
                );
                console.log(
                  `✅ Problem map updated: ${count} problems loaded.`,
                );
              } else {
                console.warn("⚠️  Parsed 0 problems — keeping existing map.");
              }
            } else {
              console.warn(
                "⚠️  Could not parse sections from A2Z Sheet — keeping existing map.",
              );
            }
            resolve();
          });
        },
      )
      .on("error", (e) => {
        console.warn(
          `⚠️  Failed to fetch A2Z page: ${e.message} — keeping existing map.`,
        );
        resolve();
      });
  });
}

function loadProblemMap() {
  // 1. Load from disk first so server starts instantly
  if (fs.existsSync(PROBLEM_MAP_FILE)) {
    try {
      PROBLEM_MAP = JSON.parse(fs.readFileSync(PROBLEM_MAP_FILE, "utf8"));
      console.log(
        `📦 Loaded ${Object.keys(PROBLEM_MAP).length} problems from local cache.`,
      );
    } catch {
      console.warn("⚠️  Could not parse local problem_map.json.");
    }
  }

  // 2. Check if the cache is stale (older than REFRESH_INTERVAL_HOURS)
  let needsRefresh = true;
  if (fs.existsSync(PROBLEM_MAP_FILE)) {
    const ageMs = Date.now() - fs.statSync(PROBLEM_MAP_FILE).mtimeMs;
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < REFRESH_INTERVAL_HOURS) {
      console.log(
        `📅 Cache is ${ageHours.toFixed(1)}h old — no refresh needed.`,
      );
      needsRefresh = false;
    }
  }

  if (needsRefresh) return fetchAndRefreshProblemMap();
  return Promise.resolve();
}

// ── Note writing ──────────────────────────────────────────────

function writeNote(problemId, noteContent) {
  const problem = PROBLEM_MAP[problemId];

  if (!problem) {
    console.warn(
      `⚠️  Unknown problem ID: ${problemId}. Triggering map refresh...`,
    );
    // Unknown ID — maybe the sheet added/changed something. Refresh immediately.
    fetchAndRefreshProblemMap().then(() => {
      const retried = PROBLEM_MAP[problemId];
      if (retried) {
        console.log(`✅ Found after refresh! Saving note for Q${problemId}.`);
        writeNote(problemId, noteContent);
      } else {
        // Last resort: save to an "unknown" file so the note is never lost
        const fallbackDir = path.join(NOTES_PATH, "_Unknown");
        fs.mkdirSync(fallbackDir, { recursive: true });
        const fallbackFile = path.join(fallbackDir, `q_${problemId}.md`);
        fs.writeFileSync(
          fallbackFile,
          `# Unknown Problem (ID: ${problemId})\n\n${noteContent}\n`,
        );
        console.warn(`📝 Saved to _Unknown/q_${problemId}.md as fallback.`);
      }
    });
    return false;
  }

  const dir = path.join(NOTES_PATH, problem.category_dir);
  const file = path.join(dir, `${problem.subcategory_file}.md`);

  fs.mkdirSync(dir, { recursive: true });

  // If file exists, update just this problem's section; otherwise create it
  let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const lc = problem.leetcode ? ` | [LeetCode](${problem.leetcode})` : "";
  const diff = problem.difficulty ? ` \`${problem.difficulty}\`` : "";
  const header = `## ${problem.problem_name}${diff}${lc}`;
  const cleanNote = noteContent.replace(/\\n/g, "\n").trim();
  const newSection = `${header}\n\n${cleanNote}\n\n---\n\n`;

  if (content.includes(`## ${problem.problem_name}`)) {
    // Replace existing section — preserve correct header, update note body only
    const regex = new RegExp(
      `## ${escapeRegex(problem.problem_name)}[^\n]*\n[\s\S]*?(?=\n## |$)`,
      "g",
    );
    content = content.replace(regex, newSection);
  } else {
    // Append new section
    content += `\n${newSection}`;
  }

  fs.writeFileSync(file, content, "utf8");
  console.log(
    `✅ Saved: ${problem.category} > ${problem.subcategory} > ${problem.problem_name}`,
  );
  return true;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── HTTP Server ───────────────────────────────────────────────

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Save a note
  if (req.method === "POST" && req.url === "/note") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      console.log("📩 Received body:", body);
      try {
        const { q_id, q_data } = JSON.parse(body);
        console.log(`🔍 q_id: ${q_id} | q_data length: ${q_data?.length}`);
        console.log(`🗺️  Problem map size: ${Object.keys(PROBLEM_MAP).length}`);
        console.log(`🔎 Problem lookup:`, PROBLEM_MAP[q_id]);
        const success = writeNote(q_id, q_data);
        console.log(`📝 writeNote returned: ${success}`);
        res.writeHead(success ? 200 : 404, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify({ success }));
      } catch (e) {
        console.error("❌ Handler error:", e);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Force a manual map refresh
  if (req.method === "GET" && req.url === "/refresh") {
    fetchAndRefreshProblemMap().then(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          success: true,
          problems: Object.keys(PROBLEM_MAP).length,
        }),
      );
    });
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status: "ok",
        problems: Object.keys(PROBLEM_MAP).length,
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end();
});

// ── Start ─────────────────────────────────────────────────────

fs.mkdirSync(NOTES_PATH, { recursive: true });

loadProblemMap().then(() => {
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`\n🚀 Striver's A2Z Sheet Notes server running on http://127.0.0.1:${PORT}`);
    console.log(`📁 Notes path: ${NOTES_PATH}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /note    — save a note`);
    console.log(`  GET  /refresh — force problem map refresh`);
    console.log(`  GET  /ping    — health check\n`);
  });

  // Schedule automatic refresh every 24 hours
  setInterval(
    fetchAndRefreshProblemMap,
    REFRESH_INTERVAL_HOURS * 60 * 60 * 1000,
  );
});