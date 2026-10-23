# 思维模型 · models.wuhua.app

[models.wuhua.app](https://models.wuhua.app) 是一个中文思维模型站：204 张来自 12 个学科的模型卡（思维方法、数学与统计、物理、生物、系统、经济学、博弈论、心理学、商业、投资、社会与组织、计算机），按芒格的“格栅”思路组织，首页按重要程度排列。每张卡按“浅 → 深 → 用”讲透一个模型：先是一个真实的开场故事和一段大白话；再是它为什么成立、出处、边界与误用；最后是它拿来做什么（按 Scott Page《模型思维》的七种用途）、三个不同领域的例子、遇事时问自己的话、和另外两三张卡一起看会看到什么，以及三道情境选择题，每个选项都有反馈。

网站是纯静态页面加几个 Cloudflare Pages Functions：

- 读卡、答题、复习、随机一张，进度只存在浏览器的 localStorage 里，没有账号；
- 可以安装到主屏幕，离线也能读全部卡片；
- **今日一卡**：每个 UTC 日一张卡和一道题，所有人看到的相同。网页 `/today`、Atom 源 `/feed.xml`、每日邮件和 Telegram 推送用的是同一个选取函数。

## 本地开发

需要 Node.js 22 或更新版本。

```sh
npm ci
npm test          # node:test：渲染、内容格式、今日一卡、订阅、Telegram 脚本
npm run build     # content/ → dist/
npx wrangler pages dev dist   # 本地预览，包括 functions/ 里的 /today、/feed.xml 和 /api/*
```

邮件相关的接口在本地没有配置时返回 503，页面会提示“邮件订阅还没有开通”。要在本地试，把变量写进 `.dev.vars`（已被 `.gitignore` 忽略），见 [docs/email.md](docs/email.md)。

## 部署

站点部署在 Cloudflare Pages 项目 `models`，绑定 models.wuhua.app：

```sh
npm run deploy    # 构建，然后 wrangler pages deploy dist --project-name models --branch main
```

要在仓库根目录运行：wrangler 会把根目录的 `functions/` 一起打包。每日邮件的开通步骤和环境变量见 [docs/email.md](docs/email.md)。

## 目录

| 路径 | 内容 |
|---|---|
| `content/` | 每张卡一个 JSON，外加 `index.json`（学科，以及每张卡的名次、核心或进阶、开场故事的一句话和年份） |
| `build.mjs` | 校验 `content/`，生成 `dist/`：卡片页、首页（每个学科再出一页，预先选好学科）、复习、订阅页、`ids.json`、`questions.json` |
| `src/render.mjs` | 页面渲染（Markdown + KaTeX）和内容校验 `validate()` |
| `src/shell.mjs` | 所有页面共用的头部和页脚 |
| `src/daily.mjs` | 今日一卡的选取函数 |
| `src/today.mjs`、`src/handlers.mjs` | `/today` 页面、Atom 源和它们的请求处理 |
| `src/mail.mjs` | 订阅、确认和每日邮件（Resend） |
| `functions/` | Cloudflare Pages Functions，只把请求转给 `src/` 里的处理函数 |
| `public/` | 浏览器脚本、样式、字体（Inter，SIL OFL）、图标、Service Worker、`_redirects`（合并或删掉的旧卡跳到新卡） |
| `ops/models-daily.py` | 每日 Telegram 推送，同时触发每日邮件 |
| `test/` | `node:test` 测试 |

## 卡片格式

`content/<id>.json`，`id` 只用小写字母、数字和连字符，与文件名一致。

| 字段 | 内容 |
|---|---|
| `id`、`name`、`en`、`discipline` | 标识、中文名、英文名、学科 |
| `one_line` | 一句话说清 |
| `shallow.scene` | 开场故事，真实事件，先不点名模型 |
| `shallow.plain` | 大白话讲清它是什么 |
| `deep.mechanism` | Markdown：为什么成立，两三节，每节一个 `### 小标题`，可以有 `$…$` 公式 |
| `deep.origin` | 出处：学科、提出者、年代、经典证据 |
| `deep.limits` | 边界与误用 |
| `use.uses` | 1–4 个 `{use, text}`；`use` 取 reason、explain、design、communicate、act、predict、explore（Scott Page 的七种用途），不重复 |
| `use.examples` | 恰好 3 个 `{field, title, text}`，来自 3 个不同领域 |
| `use.ask` | 2–4 句遇事时问自己的话 |
| `use.with` | 2–4 个 `{id, sees}`：和这张卡一起看时会看到什么；`id` 必须是已有的卡，不能指向自己 |
| `use.questions` | 至少 2 道 `{stem, question, explain, options}`；每道 4 个 `{text, correct, feedback}`，恰好一个正确；题面和选项不出现模型名 |

`index.json` 的 `cards` 每张卡一条：`name`、`en`、`discipline`、`one_line` 与卡片一致；`rank` 是名次（1 到卡片总数各一次）；`tier` 是核心（core）或进阶（adv）；`story`、`year` 是开场故事的一句话和年份。`npm run build` 和 `npm test`（`test/content.test.mjs`）都会跑同一个 `validate()`，不合格会列出卡片 id 和问题。

## 卡片是怎么来的

2026-10-22 这一版的 204 张卡由作者的审稿流水线重写（私有，不随本仓库发布）：先评估原来的 215 张卡，合并重复的、删掉证据弱或跨领域窄的，补上 Page《模型思维》等来源里重要的模型；每张卡由一个模型按写作规范起草，脚本检查格式和写法，另外两次调用分别查证事实（带网络搜索和算术核对），再由一次调用不看答案做全部题目，答错的题修改；最后全站统一人名译法和引号，并把每题正确选项的位置打乱。

名次由几项信号合成：两位评审给普适性、能否拿来做决定、证据强弱、好不好学打的分，芒格、Page 和 Farnam Street 的清单是否收录，被别的卡引用的次数，维基百科的语言版本数和浏览量；明显不对的十几张由人工调整。

卡里不放名人引语，因为这类内容最容易被编造。机器写作加机器审读仍会出错，所以非常欢迎指出问题。

## 报告错误、参与贡献

- 卡片里的事实、出处、题目或解析有错：每个卡片页底部有“报告错误”，会打开预填了卡片 id 的 [issue 表单](https://github.com/nickwang5h/models/issues/new?template=content-error.yml)。请尽量附上依据。
- 网站功能有问题：用 [网站问题](https://github.com/nickwang5h/models/issues/new?template=bug.yml) 表单。
- 想直接改：见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

- 代码：[MIT](LICENSE)。
- 卡片内容（`content/` 下的全部文件）：[CC BY-NC-SA 4.0](LICENSE-content)。可以转载和改编，但要署名“思维模型 · models.wuhua.app”并附链接，不能用于商业用途，改编后的作品须以相同许可发布。

---

## English

[models.wuhua.app](https://models.wuhua.app) is a Chinese-language site of 204 mental-model cards from 12 disciplines, in the spirit of Charlie Munger's "latticework of mental models", listed by importance. Each card goes shallow → deep → use: an opening story and a plain explanation; why the model works, its origin, its limits; then what it is good for (Scott Page's seven uses), three examples from different fields, questions to ask yourself, what you see when you read it with two or three other cards, and three scenario questions with feedback on every option. Progress stays in the browser's localStorage; there are no accounts. **今日一卡 (card of the day)** shows one card and one question per UTC day, the same for everyone, at `/today`, in the Atom feed `/feed.xml`, in a daily email and in a Telegram push.

- **Develop**: Node.js 22+. `npm ci`, `npm test`, `npm run build`; `npx wrangler pages dev dist` previews the site with its Pages Functions.
- **Deploy**: `npm run deploy` from the repository root (Cloudflare Pages project `models`). Email setup: [docs/email.md](docs/email.md).
- **Content**: one JSON file per card in `content/`, schema above; the build and the tests reject cards that break it. Cards are drafted, fact-checked and blind-answered by the author's private review pipeline, then exported here.
- **Contribute**: report a mistake in a card with the [content-error form](https://github.com/nickwang5h/models/issues/new?template=content-error.yml) (linked from every card page), or see [CONTRIBUTING.md](CONTRIBUTING.md).
- **License**: code under [MIT](LICENSE); card content in `content/` under [CC BY-NC-SA 4.0](LICENSE-content).
