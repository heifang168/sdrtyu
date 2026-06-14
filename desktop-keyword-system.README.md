# ALEO POWER 桌面版关键词与内容自动采集系统

这套系统用于每天自动采集并整理：

- Google SERP 前 10 名竞争对手标题、描述、H1/H2
- Google Keyword Planner 建议关键词、搜索量、竞争度
- 行业新闻 RSS 趋势内容
- AnswerThePublic 风格的问题型、比较型、搜索型关键词
- B2B / C 端分类、关键词去重、每日新增词、趋势报告

## 主要文件

- `scripts/daily-keyword-desktop-workflow.mjs`：每日自动工作流入口
- `scripts/desktop-keyword-system.config.example.json`：桌面系统配置
- `scripts/keyword-workflow.mjs`：关键词采集核心
- `automation/com.aleo.keyword-hunter.plist.template`：macOS 每天定时运行模板
- `desktop-dashboard/`：Electron 桌面仪表盘示例

## 手动运行

```bash
node scripts/daily-keyword-desktop-workflow.mjs --config scripts/desktop-keyword-system.config.example.json
```

运行后生成：

- `outputs/keyword-desktop/daily/YYYY-MM-DD/daily-keywords.json`
- `outputs/keyword-desktop/daily/YYYY-MM-DD/daily-keywords.csv`
- `outputs/keyword-desktop/daily/YYYY-MM-DD/new-keywords.csv`
- `outputs/keyword-desktop/daily/YYYY-MM-DD/news-items.json`
- `outputs/keyword-desktop/daily/YYYY-MM-DD/daily-report.md`
- `outputs/keyword-desktop/latest.json`

## 配置 API Key

没有 API Key 也可以运行，系统会用本地 B2B 关键词模型生成 ATP 风格问题词和 AI 扩展词。

如需真实 SERP 前 10 名数据，配置其中一个：

```bash
export SERPER_API_KEY="你的 Serper Key"
```

或：

```bash
export SERPAPI_KEY="你的 SerpApi Key"
```

如需 Google Keyword Planner 搜索量和竞争度：

```bash
export GOOGLE_ADS_DEVELOPER_TOKEN="你的 Developer Token"
export GOOGLE_ADS_ACCESS_TOKEN="你的 OAuth Access Token"
export GOOGLE_ADS_CUSTOMER_ID="你的 Customer ID，不带横线"
```

如果有 MCC 管理账号：

```bash
export GOOGLE_ADS_LOGIN_CUSTOMER_ID="你的 MCC Customer ID，不带横线"
```

## 修改行业新闻 RSS

编辑：

```text
scripts/desktop-keyword-system.config.example.json
```

重点修改：

- `newsFeeds`：行业新闻 RSS 地址
- `newsKeywords`：从新闻里提取趋势词时使用的行业词
- `topNewKeywords`：日报展示多少个新增高价值关键词
- `topTrendItems`：日报展示多少条趋势新闻

## 设置每天自动运行

macOS 可以使用 LaunchAgent。

1. 复制模板：

```bash
cp automation/com.aleo.keyword-hunter.plist.template ~/Library/LaunchAgents/com.aleo.keyword-hunter.plist
```

2. 如需修改运行时间，编辑里面的 `Hour` 和 `Minute`。

3. 加载定时任务：

```bash
launchctl load ~/Library/LaunchAgents/com.aleo.keyword-hunter.plist
```

4. 立即测试一次：

```bash
launchctl start com.aleo.keyword-hunter
```

## Electron 桌面界面

示例代码在：

```text
desktop-dashboard/
```

使用方式：

```bash
cd desktop-dashboard
cp package.example.json package.json
npm install
npm start
```

界面功能：

- 显示总关键词数、新增关键词、B2B 关键词、新闻信号
- 展示来源分布和搜索意图分布
- 展示新增高价值关键词
- 展示行业新闻趋势
- 支持点击 `Run Now` 立即执行采集

## 当前限制

- Google SERP 和 Keyword Planner 的真实数据需要 API Key。
- AnswerThePublic 如果没有账号，当前使用问题型、比较型、搜索型关键词模板模拟。
- RSS 抓取依赖本机网络；如果网络或站点限制访问，日报会记录未抓取成功。
- 这是一套本地桌面版示例，可以继续扩展成完整 Electron 应用、Tauri 应用或 PyQt 应用。

