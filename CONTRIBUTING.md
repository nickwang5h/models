# 参与贡献

谢谢你愿意帮忙。最有价值的贡献是指出卡片里的错误。

## 报告卡片错误

在卡片页底部点“报告错误”，或者直接打开 [内容错误表单](https://github.com/nickwang5h/models/issues/new?template=content-error.yml)。请写清：

- 哪张卡、哪一部分，引用原句；
- 为什么不对，最好附上论文、书籍（含页码）或可靠来源；
- 题目有错时，写出你认为的正确答案和理由。

## 直接修改卡片

1. Fork 并新建分支，修改 `content/<id>.json`。
2. 遵守卡片格式（见 [README](README.md#卡片格式)），以及这些写作约定：
   - 写给聪明的成年中文读者：开场一读就懂，机制经得起懂行的人挑剔；
   - 事实、年份、人名和出处要可查证，不确定的说法写明有争议；
   - 不放名人引语；
   - 题面和选项不出现模型名；错误选项的 `feedback` 第一句直接说错在哪里；
   - 改了 `name`、`en` 或 `one_line`，同时改 `content/index.json` 里对应的条目。
3. 运行 `npm test && npm run build`，确保通过。
4. 提交 Pull Request，说明改了什么、依据是什么。

卡片由流水线生成后导出到本仓库（见 README）。合并的人工修改会同步回流水线，以免下次导出时被覆盖。

## 修改代码

- 不引入框架：浏览器端是原生 ES 模块，构建是一个 Node 脚本，服务端是几个 Cloudflare Pages Functions；
- 页面不开 JavaScript 也要能读，脚本只负责答题、进度、复习和订阅表单；
- 新逻辑尽量写成纯函数，用 `node:test` 测试（`test/*.test.mjs`）；
- 不提交任何密钥。本地变量放在 `.dev.vars`，它已被忽略；
- 提交前运行 `npm test && npm run build`，CI 也会跑这两步。

## 许可

提交到本仓库的代码按 [MIT](LICENSE) 授权，对 `content/` 的修改按 [CC BY-NC-SA 4.0](LICENSE-content) 授权。提交 Pull Request 即表示你同意以这两种许可发布你的贡献。
