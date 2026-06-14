# homestraw.com GSC 垃圾外链批量检查工具

这套工具用于把 GSC、Ahrefs、Semrush 等外链 CSV 合并去重，并按保守标准筛选垃圾外链候选名单。

## 1. 从 GSC 导出外链

在 Google Search Console 中选择 `homestraw.com`：

1. 进入左侧 `Links` / `链接`
2. 导出 `Latest links`
3. 导出 `More sample links`
4. 可选导出 `Top linking sites`
5. 可选导出 `Top linking text`

把 CSV 放到：

```text
inputs/backlink-audit/homestraw.com/
```

## 2. 可选导入第三方工具

如果你有 Ahrefs / Semrush / 其他外链工具，把导出的 CSV 也放进同一个目录即可。脚本会按文件名识别来源。

## 3. 运行检查

```bash
node scripts/backlink-audit.mjs --config scripts/backlink-audit.config.example.json
```

## 4. 输出文件

输出目录：

```text
outputs/backlink-audit/homestraw.com/YYYY-MM-DD/
```

文件说明：

- `merged-backlinks.csv`：合并去重后的外链总表
- `domain-summary.csv`：按域名聚合的风险汇总
- `high-risk-review.csv`：高风险外链，必须人工复核
- `medium-risk-review.csv`：中风险外链，建议人工复核
- `safe-or-low-risk.csv`：低风险或暂不处理外链
- `disavow-candidates.txt`：候选拒绝文件，不要直接上传
- `backlink-audit-report.md`：中文审计报告

## 5. 风险规则

当前使用保守标准：

- 成人、博彩、药品、黑客、诈骗、盗版、假证等明显垃圾词：高风险
- 可疑 TLD、目录页、标签页、聚合页、异常语言：中风险
- Google、Bing、主流社媒、真实平台：白名单
- 中风险不直接拒绝，只建议人工复核

## 6. 重要提醒

不要把 `disavow-candidates.txt` 直接上传到 Google。它只是候选名单，必须先人工确认。Google 官方提醒，错误拒绝正常外链可能影响搜索表现。
