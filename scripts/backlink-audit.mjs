#!/usr/bin/env node
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";

const DEFAULT_CONFIG = {
  site: "homestraw.com",
  inputDir: "inputs/backlink-audit/homestraw.com",
  outputDir: "outputs/backlink-audit/homestraw.com",
  riskMode: "conservative",
  whitelistDomains: [],
  brandTerms: ["homestraw"],
  spamTerms: [
    "casino", "poker", "betting", "gambling", "porn", "xxx", "sex", "escort",
    "viagra", "cialis", "pharmacy", "loan", "payday", "hack", "malware",
    "torrent", "warez", "fake diploma", "replica", "counterfeit"
  ],
  suspiciousTlds: [".xyz", ".top", ".click", ".club", ".monster", ".work", ".icu", ".loan", ".casino"],
  highRiskThreshold: 70,
  mediumRiskThreshold: 35
};

const SOURCE_URL_HEADERS = [
  "source url", "source page", "sourcepage", "source", "referring page url", "referring page",
  "linking page", "linking page url", "page url", "url from", "from", "backlink url", "external link"
];
const SOURCE_DOMAIN_HEADERS = [
  "source domain", "domain", "referring domain", "linking site", "site", "top linking sites",
  "linking domain", "refdomain", "root domain"
];
const TARGET_URL_HEADERS = [
  "target url", "target page", "linked page", "linked pages", "target", "to", "destination url",
  "your page", "page"
];
const ANCHOR_HEADERS = [
  "anchor", "anchor text", "link text", "top linking text", "text", "keyword"
];

const SAFE_DOMAIN_PATTERNS = [
  /(^|\.)google\./i,
  /(^|\.)bing\./i,
  /(^|\.)youtube\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)pinterest\.com$/i,
  /(^|\.)wikipedia\.org$/i
];

const LOW_QUALITY_PATTERNS = [
  /\/tag\//i,
  /\/search\//i,
  /\/author\//i,
  /\/feed/i,
  /\/page\/\d+/i,
  /\/category\//i,
  /\/comment/i,
  /\/profile/i,
  /\/member/i,
  /\/user/i,
  /\/links/i,
  /directory/i,
  /bookmark/i
];

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--config") parsed.configPath = args[++i];
    else if (args[i] === "--input") parsed.inputDir = args[++i];
    else if (args[i] === "--out") parsed.outputDir = args[++i];
    else if (args[i] === "--site") parsed.site = args[++i];
    else if (args[i] === "--help") parsed.help = true;
  }
  return parsed;
}

function printHelp() {
  console.log(`Backlink audit workflow

Usage:
  node scripts/backlink-audit.mjs --config scripts/backlink-audit.config.example.json
  node scripts/backlink-audit.mjs --site homestraw.com --input inputs/backlink-audit/homestraw.com

Input:
  Put GSC / Ahrefs / Semrush CSV files into the input directory.

Output:
  merged-backlinks.csv
  domain-summary.csv
  high-risk-review.csv
  medium-risk-review.csv
  safe-or-low-risk.csv
  disavow-candidates.txt
  backlink-audit-report.md
`);
}

async function readConfig(args) {
  let config = { ...DEFAULT_CONFIG };
  if (args.configPath) {
    const userConfig = JSON.parse(await fs.readFile(args.configPath, "utf8"));
    config = { ...config, ...userConfig };
  }
  if (args.inputDir) config.inputDir = args.inputDir;
  if (args.outputDir) config.outputDir = args.outputDir;
  if (args.site) config.site = args.site;
  return config;
}

function localDateId() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
}

function localTimestamp() {
  const now = new Date();
  return `${localDateId()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
}

function normalizeHeader(header) {
  return String(header || "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  return rows;
}

function toCsv(rows) {
  return rows.map((row) => row.map((value) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\n");
}

function pick(row, headers, candidates) {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate);
    if (index >= 0 && row[index] != null && String(row[index]).trim()) return String(row[index]).trim();
  }
  for (let i = 0; i < headers.length; i += 1) {
    if (candidates.some((candidate) => headers[i].includes(candidate)) && row[i] != null && String(row[i]).trim()) {
      return String(row[i]).trim();
    }
  }
  return "";
}

function normalizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return `https://${text}`;
  return text;
}

function getDomain(value) {
  const text = normalizeUrl(value);
  if (!text) return "";
  try {
    return new URL(text).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return text
      .replace(/^https?:\/\//i, "")
      .split("/")[0]
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/[^a-z0-9.-]/g, "");
  }
}

function inferSourceTool(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.includes("ahrefs")) return "Ahrefs";
  if (lower.includes("semrush")) return "Semrush";
  if (lower.includes("gsc") || lower.includes("latest") || lower.includes("sample") || lower.includes("links")) return "GSC";
  return "CSV";
}

async function readInputFiles(inputDir) {
  if (!fssync.existsSync(inputDir)) return [];
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.csv$/i.test(entry.name))
    .map((entry) => path.join(inputDir, entry.name));
}

function rowFromRecord(row, headers, filePath) {
  let sourceUrl = normalizeUrl(pick(row, headers, SOURCE_URL_HEADERS));
  let sourceDomain = getDomain(pick(row, headers, SOURCE_DOMAIN_HEADERS));
  const targetUrl = normalizeUrl(pick(row, headers, TARGET_URL_HEADERS));
  const anchorText = pick(row, headers, ANCHOR_HEADERS);
  if (!sourceDomain && sourceUrl) sourceDomain = getDomain(sourceUrl);
  if (!sourceUrl && sourceDomain) sourceUrl = `https://${sourceDomain}`;
  return {
    sourceUrl,
    sourceDomain,
    targetUrl,
    anchorText,
    sourceTool: inferSourceTool(path.basename(filePath)),
    inputFile: path.basename(filePath)
  };
}

async function loadBacklinks(inputFiles) {
  const rows = [];
  const warnings = [];
  for (const file of inputFiles) {
    const raw = await fs.readFile(file, "utf8");
    const table = parseCsv(raw);
    if (table.length < 2) {
      warnings.push(`${path.basename(file)}: 文件为空或没有数据行`);
      continue;
    }
    const headers = table[0].map(normalizeHeader);
    for (const record of table.slice(1)) {
      const row = rowFromRecord(record, headers, file);
      if (!row.sourceDomain && !row.sourceUrl && !row.anchorText) continue;
      rows.push(row);
    }
  }
  return { rows, warnings };
}

function normalizeBacklinkKey(row) {
  return [
    row.sourceUrl || row.sourceDomain,
    row.targetUrl,
    row.anchorText
  ].map((value) => String(value || "").toLowerCase().trim()).join("|");
}

function dedupeBacklinks(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = normalizeBacklinkKey(row);
    if (!map.has(key)) {
      map.set(key, { ...row, sourceTools: [row.sourceTool], inputFiles: [row.inputFile] });
    } else {
      const existing = map.get(key);
      existing.sourceTools = [...new Set([...existing.sourceTools, row.sourceTool])];
      existing.inputFiles = [...new Set([...existing.inputFiles, row.inputFile])];
    }
  }
  return [...map.values()];
}

function includesAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.filter((term) => lower.includes(String(term).toLowerCase()));
}

function isWhitelisted(domain, config) {
  if (!domain) return false;
  if (SAFE_DOMAIN_PATTERNS.some((pattern) => pattern.test(domain))) return true;
  return (config.whitelistDomains || []).some((safe) => domain === safe || domain.endsWith(`.${safe}`));
}

function classifyLanguageRisk(text) {
  const value = String(text || "");
  if (!value) return 0;
  const cjk = (value.match(/[\u3400-\u9FFF]/g) || []).length;
  const cyrillic = (value.match(/[\u0400-\u04FF]/g) || []).length;
  const thai = (value.match(/[\u0E00-\u0E7F]/g) || []).length;
  const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
  return cjk + cyrillic + thai + arabic > 8 ? 12 : 0;
}

function scoreBacklink(row, config) {
  const domain = row.sourceDomain || getDomain(row.sourceUrl);
  const haystack = `${domain} ${row.sourceUrl} ${row.anchorText} ${row.targetUrl}`;
  const reasons = [];
  let score = 0;

  if (isWhitelisted(domain, config)) {
    return { score: 0, level: "Low", reasons: ["白名单域名"], action: "Keep" };
  }

  const spamHits = includesAny(haystack, config.spamTerms || []);
  if (spamHits.length) {
    score += 80;
    reasons.push(`明显垃圾主题词: ${spamHits.slice(0, 5).join(", ")}`);
  }

  const brandHits = includesAny(haystack, config.brandTerms || []);
  if (!brandHits.length && row.anchorText && row.anchorText.length > 10) {
    score += 10;
    reasons.push("锚文本与品牌/业务词弱相关");
  }

  if ((config.suspiciousTlds || []).some((tld) => domain.endsWith(tld))) {
    score += 18;
    reasons.push("可疑低质 TLD");
  }

  if (LOW_QUALITY_PATTERNS.some((pattern) => pattern.test(row.sourceUrl || ""))) {
    score += 18;
    reasons.push("来源页面像目录/标签/聚合页");
  }

  const languageRisk = classifyLanguageRisk(`${row.sourceUrl} ${row.anchorText}`);
  if (languageRisk) {
    score += languageRisk;
    reasons.push("来源或锚文本语言明显异常");
  }

  if (!row.sourceUrl && domain) {
    score += 5;
    reasons.push("只有域名级数据，需人工复核");
  }

  const level = score >= config.highRiskThreshold ? "High" : score >= config.mediumRiskThreshold ? "Medium" : "Low";
  const action = level === "High" ? "Review for disavow" : level === "Medium" ? "Manual review" : "Keep";
  return { score, level, reasons: reasons.length ? reasons : ["未发现明显垃圾信号"], action };
}

function buildDomainSummary(rows, config) {
  const map = new Map();
  for (const row of rows) {
    const risk = scoreBacklink(row, config);
    row.riskScore = risk.score;
    row.riskLevel = risk.level;
    row.riskReasons = risk.reasons.join("; ");
    row.recommendedAction = risk.action;

    const domain = row.sourceDomain || getDomain(row.sourceUrl) || "(unknown)";
    if (!map.has(domain)) {
      map.set(domain, {
        sourceDomain: domain,
        linkCount: 0,
        targetUrls: new Set(),
        anchorTexts: new Set(),
        sourceTools: new Set(),
        inputFiles: new Set(),
        maxRiskScore: 0,
        riskSignals: new Set(),
        highLinks: 0,
        mediumLinks: 0,
        lowLinks: 0
      });
    }
    const summary = map.get(domain);
    summary.linkCount += 1;
    if (row.targetUrl) summary.targetUrls.add(row.targetUrl);
    if (row.anchorText) summary.anchorTexts.add(row.anchorText);
    for (const tool of row.sourceTools || [row.sourceTool]) summary.sourceTools.add(tool);
    for (const file of row.inputFiles || [row.inputFile]) summary.inputFiles.add(file);
    summary.maxRiskScore = Math.max(summary.maxRiskScore, row.riskScore);
    for (const reason of row.riskReasons.split("; ")) summary.riskSignals.add(reason);
    if (row.riskLevel === "High") summary.highLinks += 1;
    else if (row.riskLevel === "Medium") summary.mediumLinks += 1;
    else summary.lowLinks += 1;
  }

  for (const summary of map.values()) {
    if (summary.linkCount >= 50) {
      summary.maxRiskScore = Math.max(summary.maxRiskScore, 40);
      summary.riskSignals.add("同一域名链接数量异常偏多");
      if (!summary.highLinks && !summary.mediumLinks) summary.mediumLinks += summary.linkCount;
    }
    summary.riskLevel = summary.maxRiskScore >= config.highRiskThreshold ? "High" : summary.maxRiskScore >= config.mediumRiskThreshold ? "Medium" : "Low";
    summary.recommendedAction = summary.riskLevel === "High" ? "Review for disavow" : summary.riskLevel === "Medium" ? "Manual review" : "Keep";
  }

  return [...map.values()].sort((a, b) => b.maxRiskScore - a.maxRiskScore || b.linkCount - a.linkCount);
}

function backlinkCsvRows(rows) {
  const headers = ["sourceDomain", "sourceUrl", "targetUrl", "anchorText", "sourceTools", "inputFiles", "riskLevel", "riskScore", "riskReasons", "recommendedAction"];
  return [headers, ...rows.map((row) => [
    row.sourceDomain,
    row.sourceUrl,
    row.targetUrl,
    row.anchorText,
    (row.sourceTools || [row.sourceTool]).join(" + "),
    (row.inputFiles || [row.inputFile]).join(" + "),
    row.riskLevel,
    row.riskScore,
    row.riskReasons,
    row.recommendedAction
  ])];
}

function domainCsvRows(rows) {
  const headers = ["sourceDomain", "riskLevel", "maxRiskScore", "linkCount", "highLinks", "mediumLinks", "lowLinks", "targetUrlCount", "anchorExamples", "sourceTools", "riskSignals", "recommendedAction"];
  return [headers, ...rows.map((row) => [
    row.sourceDomain,
    row.riskLevel,
    row.maxRiskScore,
    row.linkCount,
    row.highLinks,
    row.mediumLinks,
    row.lowLinks,
    row.targetUrls.size,
    [...row.anchorTexts].slice(0, 8).join(" | "),
    [...row.sourceTools].join(" + "),
    [...row.riskSignals].slice(0, 8).join("; "),
    row.recommendedAction
  ])];
}

function buildDisavow(domains, config) {
  const candidates = domains.filter((row) => row.riskLevel === "High" && !isWhitelisted(row.sourceDomain, config));
  const lines = [
    "# homestraw.com disavow candidates",
    "# Generated by Codex backlink audit",
    `# Date: ${localTimestamp()}`,
    "# IMPORTANT: This is a review candidate file, not an automatically approved upload.",
    "# Upload to Google Disavow Tool only after manual review.",
    ""
  ];
  for (const row of candidates) {
    lines.push(`# score ${row.maxRiskScore}; links ${row.linkCount}; reasons: ${[...row.riskSignals].slice(0, 4).join("; ")}`);
    lines.push(`domain:${row.sourceDomain}`);
    lines.push("");
  }
  return lines.join("\n");
}

function buildReport({ config, inputFiles, warnings, rows, domains, runDir }) {
  const highRows = rows.filter((row) => row.riskLevel === "High");
  const mediumRows = rows.filter((row) => row.riskLevel === "Medium");
  const lowRows = rows.filter((row) => row.riskLevel === "Low");
  const highDomains = domains.filter((row) => row.riskLevel === "High");
  const mediumDomains = domains.filter((row) => row.riskLevel === "Medium");
  const topReasons = new Map();
  for (const row of rows) {
    for (const reason of String(row.riskReasons || "").split("; ")) {
      if (!reason) continue;
      topReasons.set(reason, (topReasons.get(reason) || 0) + 1);
    }
  }
  const reasonLines = [...topReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([reason, count]) => `- ${reason}: ${count}`).join("\n");

  return `# homestraw.com 外链垃圾风险审计报告

生成时间：${localTimestamp()}

输出目录：${runDir}

## 总览

- 导入文件数：${inputFiles.length}
- 去重后外链数：${rows.length}
- 来源域名数：${domains.length}
- 高风险外链：${highRows.length}
- 中风险外链：${mediumRows.length}
- 低风险/暂不处理外链：${lowRows.length}
- 高风险域名：${highDomains.length}
- 中风险域名：${mediumDomains.length}

## 主要风险信号

${reasonLines || "- 暂未发现明显垃圾信号。"}

## 高风险域名前 30

${highDomains.slice(0, 30).map((row, index) => `${index + 1}. ${row.sourceDomain} | score ${row.maxRiskScore} | links ${row.linkCount} | ${[...row.riskSignals].slice(0, 3).join("; ")}`).join("\n") || "- 暂无高风险域名。"}

## 建议处理动作

1. 先打开 \`high-risk-review.csv\`，人工抽查高风险域名前 50 个。
2. 确认确实是垃圾外链后，再参考 \`disavow-candidates.txt\`。
3. 不要直接上传整份候选文件，先删除误判域名。
4. 对中风险外链只做人工复核，不建议直接拒绝。
5. 正常社媒、新闻、行业目录、合作伙伴链接应保留。

## 导入提醒

${warnings.map((warning) => `- ${warning}`).join("\n") || "- 无导入警告。"}

## 重要说明

这份报告只做保守风险筛选，不会自动上传 Google Disavow。Google 官方提醒，错误使用拒绝工具可能伤害网站搜索表现。
`;
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const config = await readConfig(args);
  const inputFiles = await readInputFiles(config.inputDir);
  const runDir = path.join(config.outputDir, localDateId());
  await fs.mkdir(runDir, { recursive: true });

  const { rows: loadedRows, warnings } = await loadBacklinks(inputFiles);
  const rows = dedupeBacklinks(loadedRows);
  const domains = buildDomainSummary(rows, config);
  const highRows = rows.filter((row) => row.riskLevel === "High");
  const mediumRows = rows.filter((row) => row.riskLevel === "Medium");
  const lowRows = rows.filter((row) => row.riskLevel === "Low");

  await fs.writeFile(path.join(runDir, "merged-backlinks.csv"), toCsv(backlinkCsvRows(rows)));
  await fs.writeFile(path.join(runDir, "domain-summary.csv"), toCsv(domainCsvRows(domains)));
  await fs.writeFile(path.join(runDir, "high-risk-review.csv"), toCsv(backlinkCsvRows(highRows)));
  await fs.writeFile(path.join(runDir, "medium-risk-review.csv"), toCsv(backlinkCsvRows(mediumRows)));
  await fs.writeFile(path.join(runDir, "safe-or-low-risk.csv"), toCsv(backlinkCsvRows(lowRows)));
  await fs.writeFile(path.join(runDir, "disavow-candidates.txt"), buildDisavow(domains, config));
  await fs.writeFile(path.join(runDir, "backlink-audit-report.md"), buildReport({ config, inputFiles, warnings, rows, domains, runDir }));
  await fs.writeFile(path.join(config.outputDir, "latest.json"), JSON.stringify({
    site: config.site,
    generatedAt: localTimestamp(),
    runDir,
    inputFiles,
    totals: {
      backlinks: rows.length,
      domains: domains.length,
      highRiskBacklinks: highRows.length,
      mediumRiskBacklinks: mediumRows.length,
      lowRiskBacklinks: lowRows.length,
      highRiskDomains: domains.filter((row) => row.riskLevel === "High").length,
      mediumRiskDomains: domains.filter((row) => row.riskLevel === "Medium").length
    }
  }, null, 2));

  console.log(`Backlink audit complete.
Input files: ${inputFiles.length}
Backlinks: ${rows.length}
Domains: ${domains.length}
Output: ${runDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
