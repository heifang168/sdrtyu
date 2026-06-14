# homestraw.com 外链导入目录

把 Google Search Console、Ahrefs、Semrush 等工具导出的 CSV 文件放到这个目录。

建议文件名：

- `gsc-latest-links.csv`
- `gsc-more-sample-links.csv`
- `gsc-top-linking-sites.csv`
- `ahrefs-backlinks.csv`
- `semrush-backlinks.csv`

然后运行：

```bash
node scripts/backlink-audit.mjs --config scripts/backlink-audit.config.example.json
```

注意：这里只做批量检查和候选整理，不会自动上传 Google Disavow。
