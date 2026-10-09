// ==UserScript==
// @name         解除网页限制（复制 / 粘贴 / 右键 通用版）
// @namespace    http://tampermonkey.net/
// @version      5.3
// @description  解除网页的复制、粘贴、剪切、右键、划选限制，破除 user-select 等 CSS 限制，保护 Ctrl+C/V/X/A 快捷键；对 CodeMirror 编辑器额外提供粘贴穿透。默认对 pintia.cn、icourse163.org 生效，可在脚本顶部 CONFIG 中增删站点或开启全站模式。
// @author       Your Name
// @match        *://*/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ========================= 配置区（改这里） ========================= */
    const CONFIG = {
        // 是否对所有网站生效：true = 全站；false = 仅下面 sites 列表。
        // 提示：少数网站（如在线文档 / 支持富文本剪贴板的编辑器）依赖“取消默认事件”
        // 来实现自定义复制粘贴，全站模式可能影响它们，故默认只白名单生效。
        allSites: false,

        // 生效域名（自动包含其子域名）。需要新增站点时，直接加一行即可，例如：
        //   'example.com',
        sites: [
            'pintia.cn',        // PTA 拼题A（考试 / 题目集）
            'icourse163.org',   // 中国大学 MOOC
        ],
    };
    /* =================================================================== */

    const host = location.hostname;
    const enabled = CONFIG.allSites || CONFIG.sites.some(function (d) {
        return host === d || host.slice(-(d.length + 1)) === '.' + d;
    });
    if (!enabled) return;

    // 运行标记：在控制台执行 document.documentElement.dataset.copyUnblocker 可确认脚本是否生效
    try { document.documentElement.dataset.copyUnblocker = '5.3'; } catch (_) {}

    // 已知的“自建编辑器”容器：这些编辑器靠取消默认事件 + 自己插入文本来工作，
    // 若把它们的 preventDefault 一并屏蔽，会出现“粘贴两遍 / 剪切异常”，因此放行。
    const EDITOR_SELECTOR = '.cm-editor,.CodeMirror,.ProseMirror,.monaco-editor,.ace_editor,.ace-editor';

    function inCustomEditor(node) {
        return !!(node && node.nodeType === 1 && node.closest &&
                  node.closest(EDITOR_SELECTOR));
    }

    // 始终解除的“操作类”事件（右键、划选、拖拽、旧式剪贴板事件）
    const ALWAYS_EVENTS = {
        contextmenu: 1, selectstart: 1, dragstart: 1,
        beforecopy: 1, beforecut: 1, beforepaste: 1
    };

    // 需要保护的快捷键（Ctrl / ⌘ 组合）
    const SHORTCUT_KEYS = { c: 1, v: 1, x: 1, a: 1 };

    // 该事件是否应当忽略网站的 preventDefault()（即“放行默认行为”）
    function shouldIgnoreCancel(e) {
        if (!e || typeof e.type !== 'string') return false;
        const type = e.type;

        if (ALWAYS_EVENTS[type]) return true;

        // 复制 / 剪切 / 粘贴 / 键盘快捷键：自建编辑器内部放行，避免重复处理
        if (type === 'copy' || type === 'cut' || type === 'paste' ||
            type === 'keydown' || type === 'keypress') {
            if (inCustomEditor(e.target)) return false;
            if (type === 'keydown' || type === 'keypress') {
                return !!(e.ctrlKey || e.metaKey) &&
                       SHORTCUT_KEYS[String(e.key || '').toLowerCase()] === 1;
            }
            return true;
        }

        // 粘贴 / 拖放触发的输入事件（contenteditable 站点常用此拦截）
        if (type === 'beforeinput') {
            if (inCustomEditor(e.target)) return false;
            const it = e.inputType || '';
            return it.indexOf('insertFromPaste') === 0 || it.indexOf('insertFromDrop') === 0;
        }

        return false;
    }

    // 核心：让网站对上述事件调用 preventDefault() 时失效。
    // 只屏蔽“取消默认行为”，不阻止事件传播，因此大多数网站自身逻辑不受影响。
    const nativePreventDefault = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function () {
        if (shouldIgnoreCancel(this)) return;
        return nativePreventDefault.apply(this, arguments);
    };

    // 破除 user-select:none 等 CSS 限制。
    // 选择器用 :not(#id) 叠加权重（0,3,0），可压过绝大多数带 !important 的站点样式；
    // 内联非 !important 样式也会被 !important 表样式覆盖（内联 !important 属少数派，另行由
    // mousedown 兜底处理）。
    const SEL = '*:not(#__omp_never__):not(#__omp_never__):not(#__omp_never__)';

    function injectCss() {
        const style = document.createElement('style');
        style.textContent =
            SEL + '{' +
                '-webkit-user-select:text!important;' +
                '-moz-user-select:text!important;' +
                '-ms-user-select:text!important;' +
                'user-select:text!important;' +
                '-webkit-user-drag:auto!important;' +
                '-webkit-touch-callout:default!important;' +
            '}';
        const target = document.head || document.documentElement;
        if (target) target.appendChild(style);
        else document.addEventListener('DOMContentLoaded', function () {
            (document.head || document.documentElement).appendChild(style);
        });
    }

    // 清理标签上的内联限制事件（oncontextmenu="return false" / onpaste="return false" 之类）
    const INLINE_ATTRS = [
        'oncontextmenu', 'oncopy', 'oncut', 'onpaste', 'onselectstart',
        'ondragstart', 'onbeforecopy', 'onbeforecut', 'onbeforepaste'
    ];
    const INLINE_SELECTOR = INLINE_ATTRS.map(function (a) { return '[' + a + ']'; }).join(',');

    function clean(el) {
        for (let i = 0; i < INLINE_ATTRS.length; i++) {
            if (el.hasAttribute(INLINE_ATTRS[i])) el.removeAttribute(INLINE_ATTRS[i]);
        }
    }

    function stripInline(root) {
        if (!root || root.nodeType !== 1) return;
        clean(root);
        const hit = root.querySelectorAll(INLINE_SELECTOR);
        for (let i = 0; i < hit.length; i++) clean(hit[i]);
    }

    function watchInline() {
        stripInline(document.documentElement);
        const mo = new MutationObserver(function (records) {
            for (let i = 0; i < records.length; i++) {
                const r = records[i];
                if (r.type === 'attributes') clean(r.target);
                else if (r.type === 'childList') {
                    for (let j = 0; j < r.addedNodes.length; j++) stripInline(r.addedNodes[j]);
                }
            }
        });
        mo.observe(document.documentElement, {
            subtree: true, childList: true, attributes: true, attributeFilter: INLINE_ATTRS
        });
    }

    /* --------------------------------------------------------------------
     * CodeMirror 6 粘贴穿透
     *
     * 有些站点（如 PTA 考试）并不在 DOM 层拦截粘贴，而是在编辑器内部判断：
     * 只要一次粘贴插入的非空白字符数超过阈值，就撤销该次修改并提示“禁止粘贴”。
     * 这种拦截与 preventDefault 无关，DOM 层无法解除。
     *
     * 做法：在捕获阶段抢下 paste 事件（读剪贴板 → 阻止编辑器自身处理），
     * 再用 EditorView.dispatch 直接写入文本，并打上非 "input.*" 的事件标记，
     * 使站点的“输入长度”检测不会命中。
     * ------------------------------------------------------------------ */

    // CodeMirror 6 会把内部 tile 以 `cmTile` 属性挂在编辑器 DOM 上，
    // root tile 的 `view` 即 EditorView 实例。
    function findCmView(e) {
        const path = (e.composedPath && e.composedPath()) || [e.target];
        for (let i = 0; i < path.length; i++) {
            const el = path[i];
            if (!el || el.nodeType !== 1 || !el.classList) continue;
            if (el.classList.contains('cm-content') || el.classList.contains('cm-editor')) {
                const tile = el.cmTile;
                const view = tile && tile.root && tile.root.view;
                if (view) return view;
            }
        }
        return null;
    }

    document.addEventListener('paste', function (e) {
        const target = e.target;
        if (!target || target.nodeType !== 1) return;

        // 注意：CodeMirror 6 的 EditorView **没有** `editable` 实例属性（那是 ProseMirror 的），
        // 因此不能用它来判断；只读的“题目描述”代码块 contenteditable=false、不可聚焦，收不到 paste。
        const view = findCmView(e);
        if (!view || view.state.readOnly) return;

        const cd = e.clipboardData;
        if (!cd) return;
        const text = cd.getData('text/plain') || cd.getData('text/uri-list');
        if (!text) return;

        // 抢在 CodeMirror 之前处理，避免触发站点的防粘贴逻辑
        e.stopImmediatePropagation();
        nativePreventDefault.call(e);

        // 不显式设置 selection：CodeMirror 会自动把光标放到插入内容之后。
        // 注意：不要用 `anchor: from + text.length` —— CM 会把 \r\n 归一化为 \n，
        // 原始长度偏大会让光标越界，直接抛 “Selection points outside of document”。
        const sel = view.state.selection.main;
        view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: text },
            scrollIntoView: true,
            userEvent: 'bypass.paste'
        });
        view.focus();
    }, true);

    /* ============================== 启动 ============================== */

    injectCss();

    // 兜底：个别站点把 user-select:none 写成内联 !important，表样式无法覆盖，
    // 在按下鼠标时沿祖先链就地改成内联 text!important。
    document.addEventListener('mousedown', function (e) {
        let el = e.target;
        while (el && el.nodeType === 1) {
            try {
                if (getComputedStyle(el).userSelect === 'none') {
                    el.style.setProperty('user-select', 'text', 'important');
                }
            } catch (_) { /* 忽略不可计算的节点 */ }
            el = el.parentElement;
        }
    }, true);

    if (document.documentElement) watchInline();
    else document.addEventListener('DOMContentLoaded', watchInline);

})();
