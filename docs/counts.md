# 计数

日期：2026-11-23。目的是回答三个问题：哪个渠道带来了人，有多少人用阅读器订了 feed，订阅框放在哪里有人填。Cloudflare Web Analytics 不记录网址里问号后面的部分，分不出渠道，所以这三件事由 Pages Functions 自己数。

## 记什么，不记什么

一张表，一行是「UTC 日期 × 类别 × 名字 × 来源」和一个数。代码在 `src/count.mjs`。

| 类别 | 名字 | 来源 | 什么时候加一 |
|---|---|---|---|
| `page` | `/today` | 读者从哪个站点来（只留域名），站内跳转和不明来源记为空 | 有人打开今日一卡页 |
| `channel` | 渠道名，如 `x`、`mail`、`tg` | 同上 | 有人点开一个渠道链接 |
| `feed` | 阅读器的名字，如 `Feedly` | 空 | 阅读器来取 `/feed.xml`。`top` 一栏记它当天报过的最大订阅人数 |
| `subscribe` | `request` 或 `confirm` | 表单所在的位置：`home`、`card`、`today`、`page` | 确认信真的发出去了；读者点开了确认链接 |

不记 IP，不记邮箱，不设 cookie，不记完整的来源网址。User-Agent 只用来认出阅读器的名字，和排除爬虫与聊天软件生成的链接预览。

卡片页是静态文件，不经过 Functions，所以不在这里数。它们的访问量看 Cloudflare Web Analytics。

## 渠道链接

每个发帖的地方用一个专门的地址，读者点开后被数一次，然后转到当天的卡：

- `/c/<渠道>` 转到 `/today`。
- `/c/<渠道>?d=2026-11-23` 转到那一天。
- 再加 `&to=card` 转到那一天的卡片页。
- `/x` 等于 `/c/x`，是印在配图上的短地址，短到可以照着打。

转去哪里只由日期决定，链接里带别的地址不起作用。能计数的渠道名列在 `src/count.mjs` 的 `CHANNELS` 里，别的名字照样跳转，但不计数。

每日邮件里的两个链接走 `/c/mail`。Atom 源里的链接不变，仍然直达。

## 看数

```sh
curl -H "Authorization: Bearer $MODELS_CRON_SECRET" "https://models.wuhua.app/api/counts?days=30"
```

返回最近若干天的所有行。令牌和每日邮件用的是同一个 `CRON_SECRET`。

读这些数时要记住两件事。一是从 `/c/…` 进来的人接着会打开 `/today`，所以同一次来访会在 `channel` 和 `page` 里各记一次。二是 `feed` 的订阅人数只有托管型阅读器会报，装在读者自己电脑上的阅读器不报，所以它是下限。

## 开通步骤（一次性）

没有绑定数据库时，上面的代码什么都不做，页面照常。开通要在 Cloudflare 账号里做三步：

1. 建库：`npx wrangler d1 create models-counts`。
2. 建表：`npx wrangler d1 execute models-counts --remote --file ops/counts.sql`。
3. 绑定：Pages 项目 `models` → Settings → Bindings → 添加 D1 database，变量名填 `COUNTS`，选 `models-counts`。Production 要绑，Preview 可以不绑。之后重新部署一次。

D1 免费档每天可以写 10 万行，这个站用不到零头。
