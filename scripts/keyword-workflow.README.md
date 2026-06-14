# ALEO POWER 关键词自动采集工作流

这个工作流用于把外贸 B2B 行业关键词整理成可筛选的 Excel / CSV / JSON 表格，适合后续做博客选题、产品页 SEO、广告投放和 AIO/GEO 内容布局。

## 一键运行

在项目目录运行：

```bash
node scripts/keyword-workflow.mjs --config scripts/keyword-workflow.config.example.json
```

也可以临时输入关键词：

```bash
node scripts/keyword-workflow.mjs --seed "1000kW gas generator" --seed "generator supplier UAE"
```

## 输出文件

运行后会生成：

- `outputs/keyword-research/keyword-research.xlsx`：主表格，包含 Summary、Keywords、Competitors、Config 四个工作表
- `outputs/keyword-research/keywords.csv`：关键词 CSV
- `outputs/keyword-research/keywords.json`：结构化 JSON
- `outputs/keyword-research/competitors.csv`：SERP 竞争对手列表
- `outputs/keyword-research/keyword-report.md`：自动报告

## 表格字段说明

- `keyword`：关键词
- `source`：SERP / Keyword Planner / ATP / AI
- `category`：Product / Supplier / Application / Market / Comparison / Question / Buying
- `audience`：B2B / Consumer / Mixed
- `searchVolume`：Google Keyword Planner 搜索量，需要接入 Google Ads API
- `competition`：Google Keyword Planner 竞争程度，需要接入 Google Ads API
- `valueScore`：B2B 价值评分，用于快速筛选高价值词
- `intent`：采购、对比、应用、问题、市场等搜索意图
- `recommendedUse`：建议用于博客、产品页、市场页或广告

## 懒人模式

不配置任何账号也能运行。系统会自动生成：

- AnswerThePublic 风格的问题词、对比词、采购词
- 适合外贸 B2B 的 AI 扩展词
- 按国家、功率、应用场景拆分的关键词组合

这种模式适合先做内容规划，但不会包含真实 Google 搜索量和真实 SERP 前 10 名数据。

## 接入 SERP 竞争对手数据

二选一即可：

```bash
export SERPER_API_KEY="你的 Serper API Key"
```

或：

```bash
export SERPAPI_KEY="你的 SerpApi API Key"
```

接入后，脚本会抓取 Google 首页前 10 名结果，并提取标题、描述、H1/H2 和关键短语。

## 接入 Google Keyword Planner

需要 Google Ads API 权限和 OAuth access token：

```bash
export GOOGLE_ADS_DEVELOPER_TOKEN="你的 Developer Token"
export GOOGLE_ADS_ACCESS_TOKEN="你的 OAuth Access Token"
export GOOGLE_ADS_CUSTOMER_ID="你的 Google Ads Customer ID，不带横线"
```

如果使用 MCC 管理账号，再加：

```bash
export GOOGLE_ADS_LOGIN_CUSTOMER_ID="你的 MCC Customer ID，不带横线"
```

脚本默认使用 Google Ads API `v24`，并调用 `keywordPlanIdeas.generateKeywordIdeas` 获取关键词、搜索量和竞争度。

## 修改关键词和市场

编辑：

```text
scripts/keyword-workflow.config.example.json
```

常改位置：

- `seedKeywords`：输入产品/行业关键词
- `markets`：目标国家和地区
- `applications`：应用场景
- `competitorUrls`：没有 SERP API 时，可手动放竞争对手网址
- `outputDir`：输出目录

## 建议使用方式

1. 先用懒人模式跑一版，拿到博客和页面关键词方向。
2. 接入 SERP API，补充真实竞争对手标题、描述和页面结构。
3. 接入 Google Ads API，补充搜索量和竞争度。
4. 用 `valueScore`、`audience`、`category` 筛选：
   - 博客：Question / Comparison / Application
   - 产品页：Product / Supplier
   - 市场页：Market / Supplier
   - 广告：Buying / Supplier，优先带国家和功率段的关键词

