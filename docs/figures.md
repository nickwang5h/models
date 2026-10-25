# 卡片的图

每张卡可以有一个 `figure`，画在开场故事和大白话下面；今日一卡在首页也带着它。图由 `public/figure.mjs` 画成 SVG：构建时画进页面，浏览器里拖滑块时重画。颜色只用站点的几种，跟着浅色、深色主题走，JSON 里不写颜色值。

## 什么时候画、画什么

图要让读者一眼看到正文要花一段话才说清的东西：一条因果链、一个回路、一张收益表、几个数怎么变。正文已经一句话说完的，不画。

- **flow**：有先后或因果的几步、一个回路、一棵分叉的树。五个为什么、反馈回路、决策树。
- **grid**：两个问题交叉出的四格、一张收益表。囚徒困境、单向门与双向门。
- **chart**：正文里有一组数，画出来能看到形状。边际收益递减的 20、15、10、5 碗。
- **demo**：改一个数，结局跟着变，而这个「跟着变」正是卡要讲的。马尔可夫模型的两个换店比例、大数定律的罚球次数。

图里的事和数，用卡片正文里的那个例子：读者刚读完超市甲乙两店，图里就是甲乙两店，数也对得上。正文没有合适的数，就画 flow 或 grid，不为画 chart 编数。

文字按 `knowledge-compiler/style.md` 写：`title` 是一句判断（「两种开局，一年后站到同一处」），不是话题词（「收敛示意图」）；`caption` 一两句，说读者该看哪里，或者该拖哪个滑块、看什么变。节点、表头、系列名用读者会说出口的短词。

## 字段

所有图都有：

| 字段 | 内容 |
|---|---|
| `kind` | `flow`、`grid`、`chart`、`demo` |
| `title` | 一句判断，最多 28 个字 |
| `caption` | 可选，最多 90 个字；首页不显示 |

### flow

```json
{"kind": "flow", "layout": "right", "title": "…",
 "nodes": [{"id": "a", "label": "领口发黄", "sub": "换洗涤剂没用"}, {"id": "d", "label": "篮子在卧室", "tone": "accent"}],
 "edges": [{"from": "a", "to": "d", "label": "为什么"}]}
```

- `layout`：`right`（从左往右分层，手机上自动改成从上往下）、`down`（从上往下）、`loop`（节点按顺序排成一圈，适合回路，可加 `center` 和 `centerSub` 写在圈中间）。
- 节点 2–12 个；`label` 最多 12 个字，`sub` 是可选的第二行，最多 16 个字；`tone` 可选 `accent`（要读者看的那一个）、`muted`（次要、反例）、`warn`（出问题的地方）。节点可以写 `layer` 指定它在第几层（从 0 数）。
- 边：`label` 最多 10 个字；`tone` 同上；`dashed: true` 画虚线。指回前面节点的边，会从外侧绕回去。`loop` 里的边可以用 `bend`（默认 0.32）调弯曲程度。
- 画出来超过 900 宽会报错：同一行别超过五个节点，或者改用 `down`。手机上，`right` 和 `down` 哪个方向缩得少就用哪个。

### grid

```json
{"kind": "grid", "title": "…", "rowLabel": "你", "colLabel": "同事", "rows": ["认真", "省力"], "cols": ["认真", "省力"],
 "cells": [[{"text": "3，3", "sub": "本来能到这里", "tone": "accent"}, "0，5"], ["5，0", {"text": "1，1", "tone": "warn"}]]}
```

1–5 行、2–4 列，表头最多 10 个字。格子是字符串，或 `{text, sub, tone}`：`text` 最多 14 个字，`sub` 最多 18 个字。

### chart

折线：

```json
{"kind": "chart", "title": "…", "x": {"label": "月"}, "y": {"label": "甲店份额", "unit": "%", "min": 0, "max": 100},
 "series": [{"name": "开业全在甲店", "points": [[0, 100], [1, 90], [2, 83]], "tone": "accent"}],
 "marks": [{"y": 67, "text": "进出相抵"}]}
```

柱状（`bar` 竖着，`hbar` 横着，类别名长时用 `hbar`）：

```json
{"kind": "chart", "type": "bar", "title": "…", "categories": ["1 人", "2 人", "3 人"], "y": {"label": "每小时碗数"},
 "series": [{"name": "多出来的", "values": [20, 15, 10], "tone": "accent"}]}
```

- 系列 1–6 条，名字最多 12 个字，写在线的末端（柱状图有两条以上时出图例）。`tone`：`accent`、`ink`、`muted`、`warn`；柱状图可用 `tones` 给每根柱子单独上色。系列可加 `dashed`、`dots`（`true` 或 `"small"`）、`fill`（填充到底）、`line: false`（只画点）。
- 坐标轴：`label` 最多 20 个字；`unit` 接在刻度数字后面；`format: "cn"` 写成万、亿；`min`、`max` 固定范围，不写时轴顶延到上面一个整刻度（多出四分之一以上就停在数据上方）；`y.step` 固定刻度间隔，比如人数用 1；`x.ticks` 可以给 `[{"at": 0, "label": "开业"}]`。
- `marks`：只有 `y` 是横线，只有 `x` 是竖线，两个都有是一个标出来的点；`text` 最多 16 个字，自动放在离线条最远的一侧。柱状图只认 `y`：竖柱画一条横线，横柱画一条竖线，用来标承诺、上限、平均数这类参考值。
- `height` 改高度（默认 300）。

### demo

在 chart 的基础上加滑块，数由公式算出。两种写法：

**函数**：每条系列是 `x` 的函数，`x` 从 `x.min` 到 `x.max`（可以写成公式，比如滑块名）。

```json
{"kind": "demo", "title": "…", "x": {"label": "投入", "min": 0, "max": 10}, "y": {"label": "产出"},
 "params": [{"id": "a", "label": "上限", "min": 10, "max": 100, "step": 10, "value": 50}],
 "series": [{"name": "产出", "expr": "a*(1-exp(-x/3))"}]}
```

**逐步推演**：`model.init` 给出各个状态的初值，`model.next` 给出每一步之后的新值（同时更新），一共推 `model.steps` 步。系列的 `expr` 在每一步取值；`k` 是第几步，`n` 是总步数。系列可写 `from: 1`，从第 1 步才开始画（比如要除以 `k` 时）。

```json
{"kind": "demo", "title": "…", "x": {"label": "月"}, "y": {"unit": "%", "min": 0, "max": 100},
 "params": [{"id": "p", "label": "甲店每月流向乙", "min": 5, "max": 40, "step": 5, "value": 10, "unit": "%"}],
 "model": {"steps": 12, "init": {"a": 1}, "next": {"a": "a*(1-p/100) + (1-a)*0.2"}},
 "series": [{"name": "甲店份额", "expr": "a*100"}],
 "marks": [{"y": "20/(p+20)*100", "text": "进出相抵"}],
 "readouts": [{"label": "长期份额", "expr": "20/(p+20)*100", "unit": "%", "digits": 0}]}
```

- 滑块 1–4 个：`id` 用字母，不能是 `x`、`k`、`n`、`pi`、`e`；`label` 最多 10 个字（手机上两个一行，7 个字以内不折行）；`min`、`max`、`step`、`value`、`unit`。
- `runs`：同一模型跑几遍（最多 30），用来画多条随机路线；这时的线画细，某条系列写 `thin: false` 就保持粗线（比如参考线）。
- `seed`：整数，换一组第一次画出来的随机数（比如要让第一张图里就出现一次少见的结果）。
- `err`：系列可写一个半宽公式，每个点画一根从 `y − err` 到 `y + err` 的竖线，用来画区间（配 `line: false` 和 `dots: true`）。
- `readouts`：最多 3 个，在最后一步取值，`label` 最多 12 个字，`digits` 是小数位。
- `marks` 的 `x`、`y` 可以写公式。

公式支持数字、滑块和状态名、`+ - * / % ^`、比较（得 1 或 0）、`a ? b : c`，以及函数 `exp log ln log10 log2 sqrt abs min max pow floor ceil round sin cos sign clamp(v, lo, hi) if(c, a, b)`、常数 `pi e`。随机数：`rand()` 是 0–1 的均匀数，`randn()` 是标准正态，`flip(p)` 以概率 p 得 1。用了随机数，图下会出现「重抽」按钮；第一次画出来的总是同一组，构建和每个读者看到的一样。

构建会把每个滑块都放在最小、最大和初始值各算一遍，算出非数（除以零、对负数取对数）就报错。

## 写进卡片、检查

```sh
node scripts/set-figure.mjs <id> figure.json   # 按构建的规则检查，合格才写进 content/<id>.json
node scripts/set-figure.mjs <id> --remove
npm run build                                   # 所有卡一起检查
```

`set-figure.mjs` 保留卡片文件原来的排版（缩进 1 格，文件末尾换行）。画完在浏览器里看一遍宽屏和手机宽度：字够不够大、线有没有压住字。
