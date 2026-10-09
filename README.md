# 🔓 解除网页限制（复制 / 粘贴 / 右键 通用版）

一个 Tampermonkey / Greasemonkey 油猴脚本，用于解除网页对**复制、粘贴、剪切、右键、文本划选**的限制，并保护 `Ctrl+C / V / X / A` 快捷键。

默认对 **PTA 拼题A（pintia.cn）** 与 **中国大学 MOOC（icourse163.org）** 生效，也可在脚本顶部的 `CONFIG` 中自由增删站点，或一键开启全站模式。

## 核心功能

| 能力 | 说明 |
| --- | --- |
| 解除右键限制 | 屏蔽网站的 `contextmenu` 拦截，恢复浏览器右键菜单 |
| 恢复文本划选 | 覆盖 `user-select:none` 等 CSS，鼠标可正常划选 |
| 解除复制 / 剪切 | 放行 `copy` / `cut` 的 `preventDefault`，`Ctrl+C/X` 不再被吞掉 |
| **解除粘贴限制** | 放行 `paste` 的 `preventDefault`；对 CodeMirror 6 编辑器额外提供**粘贴穿透**（见下） |
| 快捷键保护 | `Ctrl+C / V / X / A`（macOS 为 `⌘`）的键盘拦截失效 |
| 清理内联事件 | 移除 `onpaste="return false"`、`oncontextmenu="return false"` 之类内联属性（含动态插入） |

## 安装与更新

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开本仓库的 `icourse163-unblocker.user.js`，点击右上角 **`Raw`**，按提示安装。
3. 若你安装过旧版本（名字为「中国大学MOOC专用 + 快捷键保护」），请在 Tampermonkey 面板里**删除旧脚本**，两个脚本同时启用没有意义。

## 配置：让哪些网站生效

脚本使用 `@match *://*/*` 加载，但只有当域名命中 `CONFIG.sites`（或其子域名）时才会执行；否则立即退出、不做任何事。

```js
const CONFIG = {
    // true = 所有网站生效；false = 仅 sites 列表生效
    allSites: false,

    // 生效域名（自动包含子域名，例如 exam.pintia.cn 也算 pintia.cn）
    sites: [
        'pintia.cn',        // PTA 拼题A
        'icourse163.org',   // 中国大学 MOOC
        // 'example.com',   // ← 需要新站点就在这里加一行，保存后立即生效
    ],
};
```

- **新增网站**：在 `sites` 里加一行域名即可，无需改动识别当前网站的配置，也不需要重装。
- **全站模式**：把 `allSites` 改成 `true`。
  ⚠️ 少数网站（如在线文档、支持“富剪贴板”的编辑器）依赖取消默认事件来实现自定义复制粘贴，全站模式可能让它们的复制粘贴行为异常，所以默认只对白名单生效。

## 关于 PTA 考试的“禁止粘贴”

PTA 考试页（`pintia.cn/problem-sets/.../exam/...`）的代码框使用的是 **CodeMirror 6**。它**不是**在 DOM 层拦截粘贴，而是在编辑器内部判断：

- 只要某次输入事务的**非空白字符数超过阈值**（`forbidPasting` 开启时阈值为 5），
- 就撤销这次修改，并抛出 `code-editor:rate-limit` 事件，弹出「本题目集禁用代码粘贴」。

这类拦截和 `preventDefault` 无关，纯 DOM 层的脚本无法解除。本脚本的处理方式是：

1. 在**捕获阶段**抢下 `paste` 事件，读出剪贴板纯文本；
2. 阻止编辑器自身处理该事件（避免触发它的长度检测）；
3. 通过 `EditorView.dispatch` 直接把文本写进编辑器，并打上非 `input.*` 的事件标记，使阈值检测不会命中。

> 该「禁止粘贴」是老师在题目集设置（`forbidPasting`）里开启的考试防作弊措施，本脚本会使它失效。请自行判断是否使用。

## 技术实现

- monkey-patch `Event.prototype.preventDefault`：对「操作类事件」忽略网站的取消请求，**只屏蔽“取消默认行为”，不阻止事件传播**，因此网站自身的逻辑大多不受影响。
- 对**自建编辑器**（CodeMirror / ProseMirror / Monaco / Ace）内部的事件放行 `preventDefault`，避免出现「粘贴两遍 / 剪切异常」。
- 注入高权重选择器 `*:not(#id):not(#id):not(#id)`（特异性 `0,3,0`），压过绝大多数带 `!important` 的站点样式；对少数内联 `!important` 的场景，在 `mousedown` 时沿祖先链就地修正。
- 用 `MutationObserver` 持续清理复制/粘贴相关的内联 `on*` 属性。
- CodeMirror 6 的 `EditorView` 通过编辑器 DOM 上的 `cmTile → root.view` 取得，无需依赖网站内部变量。两个坑：
  - **不能用 `view.editable` 判断可编辑性**——CM6 的 `EditorView` 没有这个实例属性（那是 ProseMirror 的），恒为 `undefined`；
  - **写入时不要显式指定 `selection`**——CM 会把插入文本里的 `\r\n` 归一化成 `\n`，用原始长度算光标位置会越界并抛 `RangeError: Selection points outside of document`；不传 `selection` 时 CM 会自动把光标放到插入内容之后。

## 已知限制

- 若编辑器把 `preventDefault` 之外的手段与「服务端校验」结合（例如提交时校验代码来源），本脚本无法绕过。
- 若站点用 ≥1 个 `id` 选择器 + `!important` 强制 `user-select:none`，CSS 覆盖可能失效（属罕见写法）。
- 部分网站把编辑器放在跨域 iframe 中，脚本需要在对应 iframe 域名下同样命中 `CONFIG.sites`。

## 免责声明

本脚本仅供个人学习、做笔记及前端技术交流使用。请尊重原作者的知识产权与平台规则，切勿用于商业盈利、非法传播或任何违反考试纪律的行为。
