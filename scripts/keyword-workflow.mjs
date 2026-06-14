#!/usr/bin/env node
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DEFAULT_CONFIG = {
  projectName: "B2B Keyword Research Workflow",
  site: "",
  seedKeywords: ["gas generator set", "generator set manufacturer"],
  markets: ["UAE", "Saudi Arabia", "Nigeria", "South Africa"],
  language: "en",
  serp: { provider: "serper", gl: "us", hl: "en", num: 10, fetchCompetitorPages: true },
  googleAds: {
    apiVersion: "v24",
    customerId: "",
    languageResource: "languageConstants/1000",
    geoTargetConstants: ["geoTargetConstants/2840"]
  },
  competitorUrls: [],
  outputDir: "outputs/keyword-research"
};

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "your", "you", "are", "our", "that", "this",
  "into", "about", "what", "when", "where", "which", "their", "have", "has", "can",
  "will", "how", "why", "set", "sets", "solutions", "solution", "power"
]);

const B2B_TERMS = [
  "manufacturer", "supplier", "factory", "industrial", "commercial", "oem", "odm",
  "project", "epc", "contractor", "dealer", "distributor", "importer", "backup",
  "standby", "prime power", "containerized", "silent type", "open type", "quotation",
  "rfq", "specification", "price", "export", "custom"
];

const CONSUMER_TERMS = [
  "home", "portable", "camping", "rv", "small", "cheap", "near me", "residential",
  "inverter generator", "used generator", "rental"
];

const INTENT_RULES = [
  ["Product", /(gas|diesel|generator|genset|generator set|kw|kva)/i],
  ["Supplier", /(manufacturer|supplier|factory|oem|odm|china|exporter|wholesale)/i],
  ["Application", /(construction|oil|gas|mining|factory|hospital|hotel|building|epc|backup|standby|prime)/i],
  ["Market", /(uae|dubai|saudi|arabia|nigeria|south africa|africa|middle east|qatar|oman|kuwait)/i],
  ["Comparison", /(vs|versus|compare|difference|gas vs diesel|diesel vs gas)/i],
  ["Question", /^(how|what|why|when|where|which|can|does|is|are)\b/i],
  ["Buying", /(price|cost|quote|quotation|rfq|buy|choose|selection|checklist|lead time|delivery)/i]
];

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { seeds: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--config") parsed.configPath = args[++i];
    else if (arg === "--seed") parsed.seeds.push(args[++i]);
    else if (arg === "--out") parsed.outputDir = args[++i];
    else if (arg === "--help") parsed.help = true;
  }
  return parsed;
}

function printHelp() {
  console.log(`Keyword workflow

Usage:
  node scripts/keyword-workflow.mjs --config scripts/keyword-workflow.config.example.json
  node scripts/keyword-workflow.mjs --seed "1000kW gas generator" --seed "generator supplier UAE"

Optional API environment variables:
  SERPER_API_KEY                  Google SERP data from serper.dev
  SERPAPI_KEY                     Google SERP data from SerpApi fallback
  GOOGLE_ADS_DEVELOPER_TOKEN      Google Ads API developer token
  GOOGLE_ADS_ACCESS_TOKEN         OAuth access token
  GOOGLE_ADS_CUSTOMER_ID          Customer ID without hyphens
  GOOGLE_ADS_LOGIN_CUSTOMER_ID    Optional manager account ID
`);
}

async function readConfig(args) {
  let config = { ...DEFAULT_CONFIG, serp: { ...DEFAULT_CONFIG.serp }, googleAds: { ...DEFAULT_CONFIG.googleAds } };
  if (args.configPath) {
    const raw = await fs.readFile(args.configPath, "utf8");
    const userConfig = JSON.parse(raw);
    config = {
      ...config,
      ...userConfig,
      serp: { ...config.serp, ...(userConfig.serp || {}) },
      googleAds: { ...config.googleAds, ...(userConfig.googleAds || {}) }
    };
  }
  if (args.seeds.length) config.seedKeywords = args.seeds;
  if (args.outputDir) config.outputDir = args.outputDir;
  return config;
}

function normalizeKeyword(keyword) {
  return keyword
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(text) {
  return text.replace(/\w\S*/g, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
}

function getCategory(keyword) {
  for (const [category, regex] of INTENT_RULES) {
    if (regex.test(keyword)) return category;
  }
  return "AI";
}

function classifyAudience(keyword) {
  const lower = keyword.toLowerCase();
  const b2bHits = B2B_TERMS.filter((term) => lower.includes(term)).length;
  const consumerHits = CONSUMER_TERMS.filter((term) => lower.includes(term)).length;
  if (consumerHits > b2bHits) return "Consumer";
  if (b2bHits > 0 || /(kw|kva|industrial|commercial|epc|project)/i.test(keyword)) return "B2B";
  return "Mixed";
}

function estimateValueScore(row) {
  let score = 0;
  if (row.audience === "B2B") score += 35;
  if (row.category === "Buying" || row.category === "Supplier") score += 25;
  if (row.category === "Product" || row.category === "Market") score += 15;
  if (typeof row.searchVolume === "number") score += Math.min(25, Math.log10(row.searchVolume + 1) * 8);
  if (row.competition === "HIGH") score -= 8;
  if (row.competition === "LOW") score += 5;
  if (row.keyword.length > 18 && row.keyword.length < 70) score += 8;
  return Math.round(score);
}

function keywordRow({ keyword, source, category, searchVolume = "", competition = "", competitor = "", url = "", evidence = "", confidence = "medium" }) {
  const clean = keyword
    .replace(/\b(manufacturer|supplier|factory|exporter)\s+\1\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const audience = classifyAudience(clean);
  const row = {
    keyword: clean,
    normalizedKeyword: normalizeKeyword(clean),
    source,
    category: category || getCategory(clean),
    audience,
    searchVolume,
    competition,
    competitor,
    url,
    evidence,
    confidence
  };
  row.valueScore = estimateValueScore(row);
  return row;
}

function extractMeta(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
  const description = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
  const headings = [];
  for (const match of html.matchAll(/<h([12])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    headings.push(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }
  return { title, description, headings: headings.slice(0, 12) };
}

function extractPhrases(text) {
  const source = text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = source.split(" ").filter((word) => word.length > 1 && !STOPWORDS.has(word));
  const phrases = new Map();
  for (let n = 2; n <= 5; n += 1) {
    for (let i = 0; i <= words.length - n; i += 1) {
      const phrase = words.slice(i, i + n).join(" ");
      if (!/(generator|genset|industrial|manufacturer|supplier|factory|diesel|gas|kw|kva|backup|epc|oem|odm|power)/i.test(phrase)) continue;
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }
  }
  return [...phrases.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 18)
    .map(([phrase]) => phrase);
}

async function safeFetchText(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "user-agent": "Mozilla/5.0 ALEO keyword research bot for internal SEO analysis",
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function searchSerper(query, config) {
  if (!process.env.SERPER_API_KEY) return [];
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      q: query,
      gl: config.serp.gl || "us",
      hl: config.serp.hl || "en",
      num: config.serp.num || 10
    })
  });
  if (!res.ok) throw new Error(`Serper error ${res.status}`);
  const data = await res.json();
  return (data.organic || []).slice(0, config.serp.num || 10).map((item, index) => ({
    rank: index + 1,
    title: item.title || "",
    description: item.snippet || "",
    url: item.link || "",
    sourceKeyword: query
  }));
}

async function searchSerpApi(query, config) {
  if (!process.env.SERPAPI_KEY) return [];
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", process.env.SERPAPI_KEY);
  url.searchParams.set("gl", config.serp.gl || "us");
  url.searchParams.set("hl", config.serp.hl || "en");
  url.searchParams.set("num", String(config.serp.num || 10));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi error ${res.status}`);
  const data = await res.json();
  return (data.organic_results || []).slice(0, config.serp.num || 10).map((item, index) => ({
    rank: index + 1,
    title: item.title || "",
    description: item.snippet || "",
    url: item.link || "",
    sourceKeyword: query
  }));
}

async function collectSerp(config) {
  const competitors = [];
  const rows = [];
  for (const seed of config.seedKeywords) {
    let results = [];
    try {
      results = await searchSerper(seed, config);
      if (!results.length) results = await searchSerpApi(seed, config);
    } catch (error) {
      console.warn(`SERP skipped for "${seed}": ${error.message}`);
    }
    competitors.push(...results);
  }

  if (!competitors.length && config.competitorUrls?.length) {
    competitors.push(...config.competitorUrls.slice(0, 10).map((url, index) => ({
      rank: index + 1,
      title: "",
      description: "",
      url,
      sourceKeyword: config.seedKeywords[0]
    })));
  }

  for (const item of competitors) {
    let pageMeta = { title: item.title, description: item.description, headings: [] };
    if (config.serp.fetchCompetitorPages && item.url) {
      try {
        const html = await safeFetchText(item.url, { signal: AbortSignal.timeout(9000) });
        pageMeta = extractMeta(html);
      } catch (error) {
        pageMeta.headings = [];
      }
    }
    item.title = pageMeta.title || item.title;
    item.description = pageMeta.description || item.description;
    item.headings = pageMeta.headings || [];
    const text = [item.title, item.description, ...item.headings].join(" ");
    for (const phrase of extractPhrases(text)) {
      rows.push(keywordRow({
        keyword: phrase,
        source: "SERP",
        category: getCategory(phrase),
        competitor: domainFromUrl(item.url),
        url: item.url,
        evidence: `Rank ${item.rank} for "${item.sourceKeyword}"`,
        confidence: "high"
      }));
    }
  }
  return { competitors, rows };
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

async function collectGoogleAds(config) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const accessToken = process.env.GOOGLE_ADS_ACCESS_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID || config.googleAds.customerId;
  if (!developerToken || !accessToken || !customerId) return [];

  const apiVersion = config.googleAds.apiVersion || "v24";
  const endpoint = `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/keywordPlanIdeas:generateKeywordIdeas`;
  const headers = {
    "Authorization": `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json"
  };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers["login-customer-id"] = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  }
  const body = {
    keywordSeed: { keywords: config.seedKeywords },
    language: config.googleAds.languageResource,
    geoTargetConstants: config.googleAds.geoTargetConstants,
    includeAdultKeywords: false
  };
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API error ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  return (data.results || []).map((item) => {
    const metrics = item.keywordIdeaMetrics || {};
    return keywordRow({
      keyword: item.text,
      source: "Keyword Planner",
      category: getCategory(item.text),
      searchVolume: Number(metrics.avgMonthlySearches || 0),
      competition: metrics.competition || "",
      evidence: "Google Ads API keywordPlanIdeas.generateKeywordIdeas",
      confidence: "high"
    });
  });
}

function generateAtpLikeKeywords(config) {
  const rows = [];
  const applications = ["construction site", "oil and gas project", "mining site", "factory", "commercial building", "EPC project", "backup power"];
  const powers = ["700kW", "1000kW", "2000kW"];
  const buyerTerms = ["manufacturer", "supplier", "factory", "OEM supplier", "ODM manufacturer", "exporter"];
  const questionTemplates = [
    "how to choose {seed} for {application}",
    "what is {seed} used for",
    "what affects {seed} price",
    "which {seed} is best for {market}",
    "how long does {seed} delivery take",
    "what specifications are needed for {seed}",
    "can {seed} support {application}"
  ];
  const comparisonTemplates = [
    "{seed} vs diesel generator set",
    "gas generator vs diesel generator for {application}",
    "open type vs silent type generator set",
    "{power} gas generator vs {power} diesel generator"
  ];
  const searchTemplates = [
    "{seed} {buyer}",
    "{seed} supplier for {market}",
    "{power} gas generator supplier",
    "{power} gas generator set manufacturer",
    "industrial generator supplier for {market}",
    "generator set manufacturer in China for {market}",
    "OEM generator set factory for importers"
  ];

  for (const [seedIndex, seed] of config.seedKeywords.entries()) {
    for (const [templateIndex, template] of questionTemplates.entries()) {
      const application = applications[(seedIndex + templateIndex) % applications.length];
      const market = config.markets[(seedIndex + templateIndex) % config.markets.length];
      rows.push(keywordRow({
        keyword: template.replace("{seed}", seed).replace("{application}", application).replace("{market}", market),
        source: "ATP",
        category: "Question",
        evidence: "AnswerThePublic-style generated question pattern",
        confidence: "medium"
      }));
    }
    for (const template of comparisonTemplates) {
      for (const power of powers.slice(0, 2)) {
        rows.push(keywordRow({
          keyword: template
            .replaceAll("{seed}", seed)
            .replaceAll("{application}", applications[0])
            .replaceAll("{power}", power),
          source: "ATP",
          category: "Comparison",
          evidence: "AnswerThePublic-style generated comparison pattern",
          confidence: "medium"
        }));
      }
    }
    for (const [templateIndex, template] of searchTemplates.entries()) {
      for (const [marketIndex, market] of config.markets.slice(0, 4).entries()) {
        const power = powers[(seedIndex + templateIndex + marketIndex) % powers.length];
        const buyer = buyerTerms[(seedIndex + templateIndex + marketIndex) % buyerTerms.length];
        rows.push(keywordRow({
          keyword: template
            .replaceAll("{seed}", seed)
            .replaceAll("{market}", market)
            .replaceAll("{power}", power)
            .replaceAll("{buyer}", buyer),
          source: "ATP",
          category: getCategory(template),
          evidence: "AnswerThePublic-style generated search phrase pattern",
          confidence: "medium"
        }));
      }
    }
  }
  return rows;
}

function generateAiKeywords(config) {
  const rows = [];
  const products = ["gas generator set", "diesel generator set", "industrial generator", "silent generator set", "containerized generator set"];
  const modifiers = ["manufacturer", "supplier", "factory", "OEM solution", "project solution", "price factors", "buying guide", "RFQ checklist"];
  const applications = ["construction", "oil and gas", "mining", "factory backup power", "commercial building", "EPC power project"];
  const powers = ["700kW", "1000kW", "2000kW"];
  for (const product of products) {
    for (const modifier of modifiers) {
      rows.push(keywordRow({
        keyword: `${product} ${modifier}`,
        source: "AI",
        category: getCategory(`${product} ${modifier}`),
        evidence: "B2B seed expansion",
        confidence: "medium"
      }));
    }
  }
  for (const power of powers) {
    rows.push(keywordRow({ keyword: `${power} gas generator set price factors`, source: "AI", category: "Buying", evidence: "Power segment expansion" }));
    rows.push(keywordRow({ keyword: `${power} gas generator set specifications`, source: "AI", category: "Product", evidence: "Power segment expansion" }));
  }
  for (const market of config.markets) {
    rows.push(keywordRow({ keyword: `generator supplier for ${market}`, source: "AI", category: "Market", evidence: "Target market expansion" }));
    rows.push(keywordRow({ keyword: `industrial generator for ${market} EPC projects`, source: "AI", category: "Market", evidence: "Target market expansion" }));
  }
  for (const application of applications) {
    rows.push(keywordRow({ keyword: `generator set for ${application}`, source: "AI", category: "Application", evidence: "Application expansion" }));
    rows.push(keywordRow({ keyword: `how to choose generator for ${application}`, source: "AI", category: "Question", evidence: "Application question expansion" }));
  }
  return rows;
}

function dedupeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!row.keyword || row.keyword.length < 3) continue;
    const key = row.normalizedKeyword;
    if (!map.has(key)) {
      map.set(key, { ...row, sources: [row.source] });
    } else {
      const existing = map.get(key);
      existing.sources = [...new Set([...existing.sources, row.source])];
      existing.source = existing.sources.join(" + ");
      if (!existing.searchVolume && row.searchVolume) existing.searchVolume = row.searchVolume;
      if (!existing.competition && row.competition) existing.competition = row.competition;
      if (row.valueScore > existing.valueScore) existing.valueScore = row.valueScore;
    }
  }
  return [...map.values()].sort((a, b) => b.valueScore - a.valueScore || String(b.searchVolume || "").localeCompare(String(a.searchVolume || "")));
}

function toCsv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

async function writeXlsx(filePath, sheets) {
  const tmp = `${filePath}.tmp`;
  await fs.rm(tmp, { recursive: true, force: true });
  await fs.mkdir(path.join(tmp, "_rels"), { recursive: true });
  await fs.mkdir(path.join(tmp, "xl", "_rels"), { recursive: true });
  await fs.mkdir(path.join(tmp, "xl", "worksheets"), { recursive: true });

  const sheetEntries = sheets.map((sheet, i) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const relEntries = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");

  await fs.writeFile(path.join(tmp, "[Content_Types].xml"), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overrides}
</Types>`);
  await fs.writeFile(path.join(tmp, "_rels", ".rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  await fs.writeFile(path.join(tmp, "xl", "workbook.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetEntries}</sheets>
</workbook>`);
  await fs.writeFile(path.join(tmp, "xl", "_rels", "workbook.xml.rels"), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${relEntries}
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  await fs.writeFile(path.join(tmp, "xl", "styles.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`);

  for (let i = 0; i < sheets.length; i += 1) {
    const rows = sheets[i].rows;
    const xmlRows = rows.map((row, r) => {
      const cells = row.map((value, c) => {
        const ref = `${colName(c)}${r + 1}`;
        const style = r === 0 ? ' s="1"' : "";
        if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
        return `<c r="${ref}" t="inlineStr"${style}><is><t>${escapeXml(value)}</t></is></c>`;
      }).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    }).join("");
    await fs.writeFile(path.join(tmp, "xl", "worksheets", `sheet${i + 1}.xml`), `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetData>${xmlRows}</sheetData>
</worksheet>`);
  }

  await fs.rm(filePath, { force: true });
  execFileSync("zip", ["-qr", path.resolve(filePath), "."], { cwd: tmp });
  await fs.rm(tmp, { recursive: true, force: true });
}

function buildReport({ config, rows, serpRows, plannerRows, atpRows, aiRows, competitors }) {
  const bySource = {};
  const byCategory = {};
  const byAudience = {};
  for (const row of rows) {
    for (const source of row.source.split(" + ")) bySource[source] = (bySource[source] || 0) + 1;
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    byAudience[row.audience] = (byAudience[row.audience] || 0) + 1;
  }
  const highValue = rows.filter((row) => row.audience === "B2B").slice(0, 25);
  return `# ${config.projectName}

Generated: ${new Date().toISOString()}

## Summary

- Seed keywords: ${config.seedKeywords.join(", ")}
- Total deduped keywords: ${rows.length}
- SERP keywords: ${serpRows.length}
- Keyword Planner keywords: ${plannerRows.length}
- ATP-style keywords: ${atpRows.length}
- AI expansion keywords: ${aiRows.length}
- Competitors collected: ${competitors.length}

## Source Counts

${Object.entries(bySource).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Category Counts

${Object.entries(byCategory).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Audience Split

${Object.entries(byAudience).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## High-Value B2B Keywords

${highValue.map((row, index) => `${index + 1}. ${row.keyword} | ${row.category} | ${row.source} | score ${row.valueScore}`).join("\n")}

## API Status

- SERP: ${process.env.SERPER_API_KEY || process.env.SERPAPI_KEY ? "API configured" : "No SERP API key found. Used config URLs and AI/ATP fallback where available."}
- Google Keyword Planner: ${process.env.GOOGLE_ADS_ACCESS_TOKEN && process.env.GOOGLE_ADS_DEVELOPER_TOKEN ? "Google Ads API configured" : "Not connected. Add Google Ads OAuth credentials to get real search volume and competition."}

## Recommended Usage

- Blog topics: use Question, Comparison, Application and Buying categories.
- SEO product pages: use Product, Supplier and Market categories.
- Google Ads: prioritize B2B + Buying/Supplier keywords with clear power range or country modifiers.
- Negative keywords: review Consumer keywords such as home, portable, rental, used, camping and residential.
`;
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const config = await readConfig(args);
  await fs.mkdir(config.outputDir, { recursive: true });

  const serp = await collectSerp(config);
  let plannerRows = [];
  try {
    plannerRows = await collectGoogleAds(config);
  } catch (error) {
    console.warn(error.message);
  }
  const atpRows = generateAtpLikeKeywords(config);
  const aiRows = generateAiKeywords(config);
  const allRows = dedupeRows([...serp.rows, ...plannerRows, ...atpRows, ...aiRows]);

  const keywordHeaders = ["Keyword", "Source", "Category", "Audience", "Search Volume", "Competition", "Value Score", "Competitor", "URL", "Evidence", "Confidence"];
  const keywordRows = allRows.map((row) => [
    row.keyword, row.source, row.category, row.audience, row.searchVolume, row.competition,
    row.valueScore, row.competitor, row.url, row.evidence, row.confidence
  ]);
  const competitorHeaders = ["Seed Keyword", "Rank", "Domain", "Title", "Description", "URL", "H1/H2"];
  const competitorRows = serp.competitors.map((item) => [
    item.sourceKeyword, item.rank, domainFromUrl(item.url), item.title, item.description, item.url, (item.headings || []).join(" | ")
  ]);

  const summaryRows = [
    ["Metric", "Value"],
    ["Project", config.projectName],
    ["Generated", new Date().toISOString()],
    ["Seed Keywords", config.seedKeywords.join(", ")],
    ["Total Deduped Keywords", allRows.length],
    ["SERP Raw Keywords", serp.rows.length],
    ["Keyword Planner Keywords", plannerRows.length],
    ["ATP Keywords", atpRows.length],
    ["AI Keywords", aiRows.length],
    ["Competitors", serp.competitors.length]
  ];
  const configRows = [["Field", "Value"], ...Object.entries({
    site: config.site,
    markets: config.markets.join(", "),
    language: config.language,
    serpProvider: config.serp.provider,
    googleAdsCustomerId: config.googleAds.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || ""
  })];

  const files = {
    json: path.join(config.outputDir, "keywords.json"),
    csv: path.join(config.outputDir, "keywords.csv"),
    competitorsCsv: path.join(config.outputDir, "competitors.csv"),
    xlsx: path.join(config.outputDir, "keyword-research.xlsx"),
    report: path.join(config.outputDir, "keyword-report.md")
  };
  await fs.writeFile(files.json, JSON.stringify({ config, keywords: allRows, competitors: serp.competitors }, null, 2));
  await fs.writeFile(files.csv, toCsv([keywordHeaders, ...keywordRows]));
  await fs.writeFile(files.competitorsCsv, toCsv([competitorHeaders, ...competitorRows]));
  await writeXlsx(files.xlsx, [
    { name: "Summary", rows: summaryRows },
    { name: "Keywords", rows: [keywordHeaders, ...keywordRows] },
    { name: "Competitors", rows: [competitorHeaders, ...competitorRows] },
    { name: "Config", rows: configRows }
  ]);
  await fs.writeFile(files.report, buildReport({
    config,
    rows: allRows,
    serpRows: serp.rows,
    plannerRows,
    atpRows,
    aiRows,
    competitors: serp.competitors
  }));

  console.log(`Keyword workflow complete.
JSON: ${files.json}
CSV: ${files.csv}
Excel: ${files.xlsx}
Report: ${files.report}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
