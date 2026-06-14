#!/usr/bin/env node
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_CONFIG = {
  projectName: "Daily Keyword Hunter",
  site: "",
  baseOutputDir: "outputs/keyword-desktop",
  keywordWorkflowConfig: "scripts/keyword-workflow.config.example.json",
  newsFeeds: [],
  newsKeywords: ["generator", "industrial power", "backup power", "microgrid"],
  topNewKeywords: 25,
  topTrendItems: 12
};

const B2B_TERMS = [
  "manufacturer", "supplier", "factory", "industrial", "commercial", "oem", "odm",
  "project", "epc", "contractor", "dealer", "distributor", "importer", "backup",
  "standby", "prime power", "containerized", "quotation", "rfq", "specification",
  "export", "custom", "data center", "oil and gas", "mining"
];

const CONSUMER_TERMS = ["home", "portable", "camping", "rv", "cheap", "residential", "rental", "used"];

const CATEGORY_RULES = [
  ["Product", /(gas|diesel|generator|genset|generator set|kw|kva|microgrid)/i],
  ["Supplier", /(manufacturer|supplier|factory|oem|odm|china|exporter|wholesale)/i],
  ["Application", /(construction|oil|gas|mining|factory|hospital|hotel|building|data center|epc|backup|standby|prime)/i],
  ["Market", /(uae|dubai|saudi|arabia|nigeria|south africa|africa|middle east|qatar|oman|kuwait)/i],
  ["Comparison", /(vs|versus|compare|difference|gas vs diesel|diesel vs gas)/i],
  ["Question", /^(how|what|why|when|where|which|can|does|is|are)\b/i],
  ["Buying", /(price|cost|quote|quotation|rfq|buy|choose|selection|checklist|lead time|delivery)/i],
  ["Trend", /(market|demand|growth|shortage|policy|project|investment|launch|tender|contract)/i]
];

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--config") parsed.configPath = args[++i];
    if (args[i] === "--out") parsed.baseOutputDir = args[++i];
    if (args[i] === "--help") parsed.help = true;
  }
  return parsed;
}

function help() {
  console.log(`Daily keyword desktop workflow

Usage:
  node scripts/daily-keyword-desktop-workflow.mjs --config scripts/desktop-keyword-system.config.example.json

Optional API environment variables used by the inner keyword workflow:
  SERPER_API_KEY
  SERPAPI_KEY
  GOOGLE_ADS_DEVELOPER_TOKEN
  GOOGLE_ADS_ACCESS_TOKEN
  GOOGLE_ADS_CUSTOMER_ID
  GOOGLE_ADS_LOGIN_CUSTOMER_ID
`);
}

async function readConfig(args) {
  let config = { ...DEFAULT_CONFIG };
  if (args.configPath) {
    const user = JSON.parse(await fs.readFile(args.configPath, "utf8"));
    config = { ...config, ...user };
  }
  if (args.baseOutputDir) config.baseOutputDir = args.baseOutputDir;
  return config;
}

function todayId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimestamp() {
  const now = new Date();
  const date = todayId();
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join(":");
  return `${date} ${time}`;
}

function normalizeKeyword(keyword) {
  return String(keyword || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(block, tag) {
  return stripTags(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
}

function classifyAudience(keyword) {
  const lower = keyword.toLowerCase();
  const b2bHits = B2B_TERMS.filter((term) => lower.includes(term)).length;
  const consumerHits = CONSUMER_TERMS.filter((term) => lower.includes(term)).length;
  if (consumerHits > b2bHits) return "Consumer";
  if (b2bHits > 0 || /(kw|kva|industrial|commercial|epc|project)/i.test(keyword)) return "B2B";
  return "Mixed";
}

function getCategory(keyword) {
  for (const [category, regex] of CATEGORY_RULES) {
    if (regex.test(keyword)) return category;
  }
  return "Trend";
}

function valueScore(row) {
  let score = 0;
  if (row.audience === "B2B") score += 35;
  if (["Buying", "Supplier", "Trend"].includes(row.category)) score += 22;
  if (["Product", "Market", "Application"].includes(row.category)) score += 15;
  if (typeof row.searchVolume === "number") score += Math.min(25, Math.log10(row.searchVolume + 1) * 8);
  if (row.competition === "HIGH") score -= 8;
  if (row.competition === "LOW") score += 5;
  if (row.keyword.length > 18 && row.keyword.length < 75) score += 8;
  if (row.source === "Industry News") score += 6;
  return Math.round(score);
}

function makeRow({ keyword, source, searchVolume = "", hotness = "", competition = "", url = "", evidence = "", confidence = "medium" }) {
  const clean = String(keyword || "").replace(/\s+/g, " ").trim();
  const row = {
    keyword: clean,
    normalizedKeyword: normalizeKeyword(clean),
    source,
    category: getCategory(clean),
    audience: classifyAudience(clean),
    searchVolume,
    hotness,
    competition,
    url,
    evidence,
    confidence
  };
  row.valueScore = valueScore(row);
  return row;
}

function extractNewsPhrases(text, allowTerms) {
  const clean = normalizeKeyword(text);
  const words = clean.split(" ").filter((word) => word.length > 1);
  const phrases = new Map();
  const allow = allowTerms.map((term) => term.toLowerCase());
  for (let n = 2; n <= 5; n += 1) {
    for (let i = 0; i <= words.length - n; i += 1) {
      const phrase = words.slice(i, i + n).join(" ");
      if (!allow.some((term) => phrase.includes(term))) continue;
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }
  }
  return [...phrases.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

async function fetchRss(feedUrl, config) {
  try {
    const res = await fetch(feedUrl, {
      headers: { "user-agent": "ALEO Keyword Hunter desktop workflow" },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const xml = await res.text();
    const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]).slice(0, 12);
    const rows = [];
    const items = [];
    for (const block of blocks) {
      const title = getTag(block, "title");
      const description = getTag(block, "description") || getTag(block, "summary") || getTag(block, "content");
      const link = getTag(block, "link") || block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || feedUrl;
      const pubDate = getTag(block, "pubDate") || getTag(block, "updated") || getTag(block, "published");
      if (!title) continue;
      items.push({ title, description, link, pubDate, feedUrl });
      for (const phrase of extractNewsPhrases(`${title} ${description}`, config.newsKeywords)) {
        rows.push(makeRow({
          keyword: phrase,
          source: "Industry News",
          hotness: 1,
          url: link,
          evidence: title,
          confidence: "medium"
        }));
      }
    }
    return { rows, items };
  } catch (error) {
    return { rows: [], items: [{ title: `RSS fetch failed: ${feedUrl}`, description: error.message, link: feedUrl, pubDate: "", feedUrl }] };
  }
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.keyword || row.keyword.length < 3) continue;
    const key = row.normalizedKeyword || normalizeKeyword(row.keyword);
    if (!map.has(key)) {
      map.set(key, { ...row, sources: [row.source] });
      continue;
    }
    const existing = map.get(key);
    existing.sources = [...new Set([...existing.sources, row.source])];
    existing.source = existing.sources.join(" + ");
    existing.hotness = Number(existing.hotness || 0) + Number(row.hotness || 0);
    if (!existing.searchVolume && row.searchVolume) existing.searchVolume = row.searchVolume;
    if (!existing.competition && row.competition) existing.competition = row.competition;
    existing.valueScore = Math.max(existing.valueScore, row.valueScore);
  }
  return [...map.values()].sort((a, b) => b.valueScore - a.valueScore);
}

function toCsv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");
}

async function findPreviousRun(baseOutputDir, today) {
  try {
    const dailyRoot = path.join(baseOutputDir, "daily");
    const names = (await fs.readdir(dailyRoot)).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name) && name !== today).sort().reverse();
    for (const name of names) {
      const file = path.join(dailyRoot, name, "daily-keywords.json");
      if (fssync.existsSync(file)) return JSON.parse(await fs.readFile(file, "utf8"));
    }
  } catch {
    return null;
  }
  return null;
}

function buildDailyReport({ config, rows, previous, newsItems, runDir }) {
  const previousKeys = new Set((previous?.keywords || []).map((row) => row.normalizedKeyword || normalizeKeyword(row.keyword)));
  const newRows = rows.filter((row) => !previousKeys.has(row.normalizedKeyword));
  const bySource = {};
  const byAudience = {};
  const byCategory = {};
  for (const row of rows) {
    for (const source of row.source.split(" + ")) bySource[source] = (bySource[source] || 0) + 1;
    byAudience[row.audience] = (byAudience[row.audience] || 0) + 1;
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
  }
  const highValueNew = newRows.filter((row) => row.audience === "B2B").slice(0, config.topNewKeywords);
  const trendItems = newsItems.filter((item) => !item.title.startsWith("RSS fetch failed")).slice(0, config.topTrendItems);
  return `# ${config.projectName} Daily Report

Generated: ${localTimestamp()}

Output folder: ${runDir}

## Summary

- Total deduped keywords: ${rows.length}
- New keywords vs previous run: ${newRows.length}
- B2B keywords: ${byAudience.B2B || 0}
- Consumer keywords: ${byAudience.Consumer || 0}
- Mixed keywords: ${byAudience.Mixed || 0}

## Source Counts

${Object.entries(bySource).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Category Counts

${Object.entries(byCategory).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## New High-Value Keywords

${highValueNew.map((row, index) => `${index + 1}. ${row.keyword} | ${row.category} | ${row.source} | score ${row.valueScore}`).join("\n") || "- No new high-value keywords detected yet."}

## Important Industry Trend Signals

${trendItems.map((item, index) => `${index + 1}. ${item.title} (${item.feedUrl})`).join("\n") || "- No fresh RSS trend items collected. Check feed URLs or network access."}

## API Status

- SERP: ${process.env.SERPER_API_KEY || process.env.SERPAPI_KEY ? "connected" : "not connected, fallback keyword generation used"}
- Google Keyword Planner: ${process.env.GOOGLE_ADS_ACCESS_TOKEN && process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? "connected" : "not connected, search volume/competition unavailable"}
- RSS: ${config.newsFeeds.length} feed(s) configured
`;
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    help();
    return;
  }
  const config = await readConfig(args);
  const today = todayId();
  const runDir = path.join(config.baseOutputDir, "daily", today);
  await fs.mkdir(runDir, { recursive: true });

  const keywordOutDir = path.join(runDir, "keyword-workflow");
  await execFileAsync(process.execPath, [
    "scripts/keyword-workflow.mjs",
    "--config",
    config.keywordWorkflowConfig,
    "--out",
    keywordOutDir
  ], { cwd: process.cwd(), env: process.env, maxBuffer: 1024 * 1024 * 8 });

  const keywordData = JSON.parse(await fs.readFile(path.join(keywordOutDir, "keywords.json"), "utf8"));
  const baseRows = (keywordData.keywords || []).map((row) => ({
    ...row,
    hotness: row.hotness || "",
    normalizedKeyword: row.normalizedKeyword || normalizeKeyword(row.keyword)
  }));

  const newsResults = await Promise.all((config.newsFeeds || []).map((feed) => fetchRss(feed, config)));
  const newsRows = newsResults.flatMap((result) => result.rows);
  const newsItems = newsResults.flatMap((result) => result.items);
  const rows = dedupeRows([...baseRows, ...newsRows]);
  const previous = await findPreviousRun(config.baseOutputDir, today);
  const previousKeys = new Set((previous?.keywords || []).map((row) => row.normalizedKeyword || normalizeKeyword(row.keyword)));
  const newKeywords = rows.filter((row) => !previousKeys.has(row.normalizedKeyword));

  const headers = ["keyword", "source", "category", "audience", "searchVolume", "hotness", "competition", "valueScore", "url", "evidence", "confidence"];
  const csvRows = rows.map((row) => headers.map((key) => row[key] ?? ""));
  const files = {
    json: path.join(runDir, "daily-keywords.json"),
    csv: path.join(runDir, "daily-keywords.csv"),
    newCsv: path.join(runDir, "new-keywords.csv"),
    newsJson: path.join(runDir, "news-items.json"),
    report: path.join(runDir, "daily-report.md"),
    latestJson: path.join(config.baseOutputDir, "latest.json")
  };

  await fs.writeFile(files.json, JSON.stringify({ config, generatedAt: localTimestamp(), keywords: rows, newKeywords, newsItems }, null, 2));
  await fs.writeFile(files.csv, toCsv([headers, ...csvRows]));
  await fs.writeFile(files.newCsv, toCsv([headers, ...newKeywords.map((row) => headers.map((key) => row[key] ?? ""))]));
  await fs.writeFile(files.newsJson, JSON.stringify(newsItems, null, 2));
  await fs.writeFile(files.report, buildDailyReport({ config, rows, previous, newsItems, runDir }));
  await fs.mkdir(config.baseOutputDir, { recursive: true });
  await fs.writeFile(files.latestJson, JSON.stringify({ generatedAt: localTimestamp(), runDir, files }, null, 2));

  console.log(`Daily desktop keyword workflow complete.
JSON: ${files.json}
CSV: ${files.csv}
New: ${files.newCsv}
News: ${files.newsJson}
Report: ${files.report}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
