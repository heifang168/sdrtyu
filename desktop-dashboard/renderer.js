const state = { data: null };

const $ = (id) => document.getElementById(id);

const SOURCE_LABELS = {
  "SERP": "Google 竞品",
  "Keyword Planner": "谷歌规划师",
  "ATP": "问题词",
  "AI": "AI 扩展",
  "Industry News": "行业新闻"
};

const CATEGORY_LABELS = {
  "Product": "产品词",
  "Supplier": "供应商词",
  "Application": "应用场景",
  "Market": "市场地区",
  "Comparison": "对比词",
  "Question": "问题词",
  "Buying": "采购词",
  "Trend": "趋势词",
  "AI": "AI 扩展"
};

const AUDIENCE_LABELS = {
  "B2B": "B2B",
  "Consumer": "C端",
  "Mixed": "混合"
};

function label(value, dict) {
  return dict[value] || value || "-";
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const parts = String(row[key] || "Unknown").split(" + ");
    for (const part of parts) acc[part] = (acc[part] || 0) + 1;
    return acc;
  }, {});
}

function renderBars(target, counts) {
  const max = Math.max(1, ...Object.values(counts));
  target.innerHTML = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => `
      <div class="bar-row">
        <div class="bar-label"><span>${keyLabel(label)}</span><strong>${value}</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, (value / max) * 100)}%"></div></div>
      </div>
    `)
    .join("");
}

function keyLabel(value) {
  return SOURCE_LABELS[value] || CATEGORY_LABELS[value] || AUDIENCE_LABELS[value] || value;
}

function render(data) {
  state.data = data;
  if (data.empty) {
    $("status").textContent = data.message;
    return;
  }

  const keywords = data.keywords || [];
  const newKeywords = data.newKeywords || [];
  const newsItems = data.newsItems || [];
  const b2b = keywords.filter((row) => row.audience === "B2B");
  const highValue = newKeywords.length ? newKeywords : keywords;

  $("lastUpdated").textContent = data.generatedAt ? `最后更新：${data.generatedAt}` : "已加载";
  $("newCount").textContent = newKeywords.length.toLocaleString();
  $("totalCount").textContent = keywords.length.toLocaleString();
  $("b2bCount").textContent = b2b.length.toLocaleString();
  $("newsCount").textContent = newsItems.length.toLocaleString();
  $("newHint").textContent = newKeywords.length ? "发现新的机会词" : "暂无新增或首次运行";

  renderBars($("sourceBars"), countBy(keywords, "source"));
  renderBars($("categoryBars"), countBy(keywords, "category"));

  $("keywordRows").innerHTML = highValue
    .filter((row) => row.audience !== "Consumer")
    .sort((a, b) => (b.valueScore || 0) - (a.valueScore || 0))
    .slice(0, 20)
    .map((row) => `
      <tr>
        <td>${row.keyword}</td>
        <td>${String(row.source || "").split(" + ").map((item) => label(item, SOURCE_LABELS)).join(" + ")}</td>
        <td>${label(row.category, CATEGORY_LABELS)}</td>
        <td><span class="pill">${label(row.audience, AUDIENCE_LABELS)}</span></td>
        <td>${row.searchVolume || "-"}</td>
        <td><strong>${row.valueScore || 0}</strong></td>
      </tr>
    `)
    .join("");

  $("newsList").innerHTML = newsItems
    .slice(0, 10)
    .map((item) => `
      <a class="news-item" href="${item.link || "#"}">
        <strong>${item.title}</strong>
        <span>${item.feedUrl || ""}</span>
      </a>
    `)
    .join("");
}

async function loadLatest() {
  $("status").textContent = "正在读取最新关键词数据...";
  try {
    if (!window.keywordHunter) {
      $("status").textContent = "当前是浏览器预览模式：界面已中文化。要读取真实数据和点击运行，请用 Electron 启动桌面版。";
      return;
    }
    const data = await window.keywordHunter.latest();
    render(data);
    $("status").textContent = "";
  } catch (error) {
    $("status").textContent = `读取失败：${error.message}`;
  }
}

async function runNow() {
  $("runBtn").disabled = true;
  $("status").textContent = "正在运行采集流程...";
  if (!window.keywordHunter) {
    $("runBtn").disabled = false;
    $("status").textContent = "浏览器预览模式不能直接运行后台脚本。请用 Electron 桌面版打开后点击“立即运行”。";
    return;
  }
  const result = await window.keywordHunter.run();
  $("runBtn").disabled = false;
  if (!result.ok) {
    $("status").textContent = `运行失败：${result.error}`;
    return;
  }
  render(result.latest);
  $("status").textContent = "采集完成。";
}

$("refreshBtn").addEventListener("click", loadLatest);
$("runBtn").addEventListener("click", runNow);

loadLatest();
