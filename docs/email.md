# 今日一卡与每日邮件

日期：2026-10-22。邮件订阅沿用 learn.wuhua.app 的做法（`wuhua-learn` 仓库的 `server/subscribe.ts`、`server/daily-mail.ts` 和它的 `docs/email.md`）：Resend 双重确认订阅，加每天一条 Broadcast，发件域名 `wuhua.app`。这里改写成 Cloudflare Pages Functions。

## 今日一卡怎么选

`src/daily.mjs` 的 `dailyPick(ids, date)` 是日期和卡片 id 集合的纯函数，与 id 的顺序无关：

- 从 `EPOCH`（2026-10-22）起按 UTC 日计数，每 `ids.length` 天为一轮；
- 每轮把全部卡片按 `(轮次, id)` 的 FNV-1a 哈希排序，一天一张，一轮之内不重复，下一轮换一个顺序；
- 第 n 轮出每张卡的第 n 道题（超出题数就从头轮回）。

增删卡片会改变一轮的长度，之后的日子随之重排；已经发生的日子对所有读者都一样，这就够了。网页、Atom 源、邮件和 Telegram 都从同一次部署的 `questions.json` 计算，所以同一个 UTC 日它们一定给出同一张卡。

| 路径 | 由谁生成 | 内容 |
|---|---|---|
| `/today` | `functions/today.js` | 当天的卡：名称、一句话、链接、当天那道题（可作答）。`?date=YYYY-MM-DD` 可回看 30 天 |
| `/today.json` | `functions/today.json.js` | 同一天的数据，含正确答案；`?date=` 可取任意一天。Telegram 脚本读它 |
| `/feed.xml` | `functions/feed.xml.js` | Atom 1.0，最近 14 天，每天一条，不含答案 |
| `/subscribe` | `build.mjs`（静态页） | 订阅表单，提交到 `/api/subscribe` |

当天的响应最多缓存到 UTC 零点（`max-age` 不超过 1 小时）。

## 订阅流程

1. 读者在 `/subscribe` 填邮箱。`POST /api/subscribe` 只接受同源（`Origin` 与站点一致）的 JSON，正文不超过 24 KiB；隐藏的诱捕字段 `website` 非空时返回 202 但不发信。
2. 它用 `MAIL_FROM` 发一封确认信，链接是 `/api/confirm?t=<令牌>`。令牌是 `base64url(邮箱|过期时间).base64url(HMAC-SHA256)`，密钥为 `SUBSCRIBE_SECRET`，自申请当天 UTC 零点起 48 小时有效。同一地址同一天的确认信内容相同，并带同一个 `Idempotency-Key`，多按几次也只发一封。
3. 读者点开链接，`GET /api/confirm` 验证令牌后，把地址加入 Resend Segment（`RESEND_AUDIENCE_ID`），再跳回 `/subscribe?confirmed=1`；令牌无效或过期跳到 `/subscribe?expired=1`。
4. 每天一次，`POST /api/daily-mail`（`Authorization: Bearer <CRON_SECRET>`）把当天的卡作为一条名为 `models-today-YYYY-MM-DD` 的 Broadcast 发给该 Segment。它先列出账号里的 Broadcast：同名且已发送就跳过；同名的草稿（上次创建后发送失败）就接着发送；都没有才新建。退订链接由 Resend 的 `{{{RESEND_UNSUBSCRIBE_URL}}}` 占位符生成。

地址只保存在 Resend，代码不记录、不落库。变量不全时，三个接口都返回 503：订阅页提示“邮件订阅还没有开通”，确认链接显示同样的说明，`/today` 和 `/feed.xml` 不受影响。

## 每天由谁触发

Pages 没有定时任务。每天已经在跑的 `ops/models-daily.py`（Telegram 推送）在发完 Telegram 之后，用 `~/vps-msg.env` 里的 `MODELS_CRON_SECRET` 调用 `POST https://models.wuhua.app/api/daily-mail`。选它而不是 GitHub Actions 定时任务，是因为公开仓库 60 天没有提交时 GitHub 会停用定时工作流，而且定时触发常常延迟。

- Telegram 失败不影响邮件；邮件接口返回非 `ok` 时脚本以非零状态退出，便于在 cron 日志里看到。
- 接口本身是幂等的，重跑脚本或手动调用不会重复发信。
- 脚本按 UTC 日期工作。如果它的 cron 时间离 UTC 零点很近，留意本地日期和 UTC 日期可能不同。
- 手动补发：`python3 ops/models-daily.py --mail-only`，或者

  ```sh
  curl -X POST -H "Authorization: Bearer $MODELS_CRON_SECRET" https://models.wuhua.app/api/daily-mail
  ```

## 开通步骤（一次性）

在现有的 Resend 账号（已验证发件域名 `wuhua.app`）和 Cloudflare 账号里操作。不要把任何密钥写进仓库、命令行参数或前端代码。

1. **Resend Segment**：Audience → Segments → 新建一个 Segment，例如 `Wuhua Models daily`，记下它的 ID。不要与 learn 的 Segment 共用，否则两边的订阅者会收到对方的邮件。
2. **Resend API 密钥**：管理联系人和 Broadcast 需要 **Full access** 密钥（控制台不能把这种密钥限制到单个域名）。建议新建一把 `Wuhua Models production`，便于单独轮换和撤销；也可以复用 learn 的订阅密钥。
3. **Cloudflare Pages 变量**：Pages 项目 `models` → Settings → Variables and Secrets → Production，全部以 Secret（加密）类型添加：

   | 变量 | 值 |
   |---|---|
   | `RESEND_API_KEY` | 第 2 步的密钥 |
   | `RESEND_AUDIENCE_ID` | 第 1 步的 Segment ID（沿用 learn 的变量名，存的是 Segment ID） |
   | `SUBSCRIBE_SECRET` | `openssl rand -hex 32` 生成 |
   | `MAIL_FROM` | 例如 `思维模型 <notifications@wuhua.app>`，域名必须是已验证的 `wuhua.app` |
   | `CRON_SECRET` | 再用 `openssl rand -hex 32` 生成一个 |

   也可以用命令行，值从标准输入读取：`npx wrangler pages secret put RESEND_API_KEY --project-name models`。改完变量后要重新部署，新值才会生效。
4. **触发**：在运行 `ops/models-daily.py` 的机器上，往 `~/vps-msg.env` 加一行 `MODELS_CRON_SECRET=<与 CRON_SECRET 相同的值>`，再把仓库里新的 `ops/models-daily.py` 放上去。先部署站点，再换脚本：新脚本依赖 `/today.json`。
5. **限流（建议）**：Cloudflare → models.wuhua.app 所在的 zone → Security → WAF → Rate limiting rules，新建一条：路径等于 `/api/subscribe` 且方法为 POST，每个 IP 每 10 分钟最多 5 次，超出返回 429。Origin 检查挡不住伪造请求的脚本，Resend 的幂等键只能挡住同一地址的重复。

## 验收

不发真实邮件的检查：

- `GET /api/subscribe` → 405；`Origin` 不对的 POST → 403；
- 变量缺失时，`POST /api/subscribe` 和 `POST /api/daily-mail` → 503；
- 变量齐全时，不带 `Authorization` 的 `POST /api/daily-mail` → 401；
- `/today`、`/today.json`、`/feed.xml` 返回 200，并且是同一张卡；
- `python3 ops/models-daily.py --dry-run` 打印的卡与 `/today` 相同。

端到端只用作者自己的邮箱：订阅 → 收到确认信 → 点链接 → 在 Resend Segment 里看到该联系人 → 运行一次 `ops/models-daily.py --mail-only` → 收到 `今日一卡：…` 邮件 → 再运行一次，接口应返回 `skipped` → 点退订，确认 Resend 把联系人标为已退订。
