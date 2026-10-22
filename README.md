# 思维模型 · models.wuhua.app

[models.wuhua.app](https://models.wuhua.app) 是一个中文思维模型站：215 张来自 12 个学科的模型卡（思维方法、数学与统计、物理、生物、系统、经济学、博弈论、心理学、商业、投资、社会与组织、计算机），按芒格的“格栅”思路组织。每张卡讲透一个模型：一个真实的开场故事、它为什么成立、出处、三个不同领域的例子、遇事时问自己的问题、边界与误用、格栅里的相邻模型，最后是三道情境选择题，每个选项都有反馈。

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
| `content/` | 每张卡一个 JSON，外加 `index.json`（学科、顺序、标题和目录里的全部模型名） |
| `build.mjs` | 校验 `content/`，生成 `dist/`：卡片页、学科页、首页、复习、订阅页、`ids.json`、`questions.json` |
| `src/render.mjs` | 页面渲染（Markdown + KaTeX）和内容校验 `validate()` |
| `src/shell.mjs` | 所有页面共用的头部和页脚 |
| `src/daily.mjs` | 今日一卡的选取函数 |
| `src/today.mjs`、`src/handlers.mjs` | `/today` 页面、Atom 源和它们的请求处理 |
| `src/mail.mjs` | 订阅、确认和每日邮件（Resend） |
| `functions/` | Cloudflare Pages Functions，只把请求转给 `src/` 里的处理函数 |
| `public/` | 浏览器脚本、样式、图标、Service Worker |
| `ops/models-daily.py` | 每日 Telegram 推送，同时触发每日邮件 |
| `test/` | `node:test` 测试 |

## 卡片格式

`content/<id>.json`，`id` 只用小写字母、数字和连字符，与文件名一致。完整说明见 [docs/2026-10-05-models-design.md](docs/2026-10-05-models-design.md)。

| 字段 | 内容 |
|---|---|
| `id`、`name`、`en`、`discipline` | 标识、中文名、英文名、学科（必须与 `index.json` 里所在的学科一致） |
| `one_line` | 一句话说清，20–40 字；与 `index.json` 里的同名字段一致 |
| `scene` | 开场故事，真实事件优先，先不点名模型 |
| `mechanism` | Markdown：为什么成立，可以有 `$…$` 公式 |
| `origin` | 出处：学科、提出者、年代、经典证据 |
| `examples` | 恰好 3 个 `{field, title, text}`，来自 3 个不同领域 |
| `use` | 3–5 个遇事时问自己的问题 |
| `limits` | 边界与误用 |
| `related` | 3–5 个 `{id, relation, why}`；`relation` 取 互补、相反、常一起出现、是它的特例、是它的一般化；`id` 必须是已有的卡或 `index.json` 的 `names` 里的模型，不能指向自己 |
| `questions` | 至少 2 道 `{stem, question, explain, options}`；每道 4 个 `{text, correct, feedback}`，恰好一个正确；题面不出现模型名 |

`npm run build` 和 `npm test`（`test/content.test.mjs`）都会跑同一个 `validate()`，不合格会列出卡片 id 和问题。

## 卡片是怎么来的

卡片由作者的 knowledge-compiler 流水线生成（私有仓库，不随本仓库发布），然后导出到 `content/`：

1. **cards**：按模型目录（每个模型带一句划定范围的提示，避免相邻模型写重）生成卡片；确定性检查字段、字数、`related` 和写作规范，不合格发回重写；再由另一次调用盲审事实、出处、年份和人名，有问题带着清单修一次，修后仍有问题的卡不发布；
2. **questions**：根据卡片出题，再由另一次调用盲答，与标准答案不一致的题修一次，仍不一致就丢掉；
3. **one-lines**：成批重写一句话介绍（第二版）；
4. **export**：写出 `content/*.json` 和 `index.json`。

卡里不放名人引语，因为这类内容最容易被编造。机器生成加机器审读仍会出错，所以非常欢迎指出问题。

## 报告错误、参与贡献

- 卡片里的事实、出处、题目或解析有错：每个卡片页底部有“报告错误”，会打开预填了卡片 id 的 [issue 表单](https://github.com/nickwang5h/models/issues/new?template=content-error.yml)。请尽量附上依据。
- 网站功能有问题：用 [网站问题](https://github.com/nickwang5h/models/issues/new?template=bug.yml) 表单。
- 想直接改：见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

- 代码：[MIT](LICENSE)。
- 卡片内容（`content/` 下的全部文件）：[CC BY-NC-SA 4.0](LICENSE-content)。可以转载和改编，但要署名“思维模型 · models.wuhua.app”并附链接，不能用于商业用途，改编后的作品须以相同许可发布。

---

## English

[models.wuhua.app](https://models.wuhua.app) is a Chinese-language site of 215 mental-model cards from 12 disciplines, in the spirit of Charlie Munger's "latticework of mental models". Each card has an opening story, why the model works, its origin, three examples from different fields, questions to ask yourself, limits and misuses, related models, and three scenario questions with feedback on every option. Progress stays in the browser's localStorage; there are no accounts. **今日一卡 (card of the day)** shows one card and one question per UTC day, the same for everyone, at `/today`, in the Atom feed `/feed.xml`, in a daily email and in a Telegram push.

- **Develop**: Node.js 22+. `npm ci`, `npm test`, `npm run build`; `npx wrangler pages dev dist` previews the site with its Pages Functions.
- **Deploy**: `npm run deploy` from the repository root (Cloudflare Pages project `models`). Email setup: [docs/email.md](docs/email.md).
- **Content**: one JSON file per card in `content/`, schema above and in [the design doc](docs/2026-10-05-models-design.md); the build and the tests reject cards that break it. Cards are generated and blind-audited by the author's private knowledge-compiler pipeline, then exported here.
- **Contribute**: report a mistake in a card with the [content-error form](https://github.com/nickwang5h/models/issues/new?template=content-error.yml) (linked from every card page), or see [CONTRIBUTING.md](CONTRIBUTING.md).
- **License**: code under [MIT](LICENSE); card content in `content/` under [CC BY-NC-SA 4.0](LICENSE-content).
