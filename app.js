/* ============================================================
   全功能 · 项目工作区 —— 原型逻辑
   真的部分：文件树 / md 实时编辑+预览 / mermaid 脑图解析与渲染 /
             代码折叠 / 每次编辑自动备份历史 / 历史恢复 /
             重点参考与路径条 / 连续·临时·语音 三种对话。
   演示的部分（落 SwiftUI 时换真）：对话回复＝本地规则；
   文件存浏览器本地存储；「提交 git」＝本地快照。
   ============================================================ */
(() => {
'use strict';

const LS_KEY = 'wanna-workspace-v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const now = () => Date.now();
const fmtTime = ts => {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/* ── 默认样例项目 ─────────────────────────────── */
function sampleProject() {
  const path = '/Users/mjm/Documents/SuperAgent/我的笔记项目';
  return {
    id: 'p1', name: '我的笔记项目', path,
    files: {
      'README.md': `# 我的笔记项目

这是**项目根 README**。每一轮对话都会自动带上项目路径：

\`${path}\`

## 这个页面怎么用

- 左边点文件 → 自动设为 **重点参考**，并携带项目绝对路径
- 中间「正文」实时编辑实时预览；「脑图」是 mermaid，**代码可以折叠**
- 右边围绕项目提问，也能让它改脑图 —— **任何一次编辑都会自动备份历史**

## 待办

- [ ] 把会议纪要里的三条结论并进脑图
- [ ] 竞品对比补一栏价格
`,
      '脑图.mmd': `mindmap
  root((我的笔记项目))
    会议
      09-30 评审
        结论：先做左 80% 工作区
        待办：定 git 方案
      待办清单
    内容
      正文 README
      脑图 mermaid
      竞品对比
    对话
      连续对话
      临时对话
      语音
`,
      'notes/2026-09-30-会议.md': `# 09-30 评审

**结论**：先做「左 80% 工作区 + 右对话」的骨架，脑图用 mermaid。

1. 入口：弹出窗口右侧「全功能」按钮
2. 顶部模式条（图文 / 语音 / 视频）保持不变
3. 任何一次编辑都要自动备份历史
`,
      'notes/灵感.md': `# 灵感

- 脑图 = 一个文件夹，每次对话默认携带文件夹绝对路径
- 点文件 = 重点参考（一次只有一个）
- 对话可以直接改脑图，改完自动留一版历史
`,
      '资料/竞品对比.md': `# 竞品对比

| 产品 | 文件树 | md 编辑 | 脑图 | 对话改图 |
|---|---|---|---|---|
| VSCode | ✅ | ✅ | 插件 | — |
| Codex | — | — | — | ✅ |
| Trae | ✅ | ✅ | — | ✅ |

> 我的特点：**自己创建这个功能**，并复用当前软件的内容逻辑。
`
    },
    tree: [
      { name: 'README.md', type: 'file' },
      { name: '脑图.mmd', type: 'file' },
      { name: 'notes', type: 'dir', open: true, children: [
        { name: '2026-09-30-会议.md', type: 'file' },
        { name: '灵感.md', type: 'file' }
      ]},
      { name: '资料', type: 'dir', open: false, children: [
        { name: '竞品对比.md', type: 'file' }
      ]}
    ]
  };
}

/* ── 状态 ─────────────────────────────────────── */
let S = load() || {
  projects: [sampleProject()],
  activeProject: 'p1',
  openFile: 'README.md',
  focusFile: 'README.md',
  tab: 'md',
  mdVariant: 'split',          // edit | preview | split
  codeFolded: false,
  collapsed: {},               // 脑图折叠的节点 id → true
  mindZoom: 1,
  mode: 'imageText',
  chatMode: 'continuous',
  history: {},                 // filePath → [{ts, source, content, summary}]
  gitLog: [],
  chat: []
};

function load() {
  try { const r = JSON.parse(localStorage.getItem(LS_KEY)); return r && r.projects ? r : null; }
  catch { return null; }
}
let saveTimer = null;
function save(now = false) {
  clearTimeout(saveTimer);
  const doIt = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch {} };
  now ? doIt() : (saveTimer = setTimeout(doIt, 250));
}

const proj = () => S.projects.find(p => p.id === S.activeProject) || S.projects[0];
const fullPath = rel => `${proj().path}/${rel}`;
const fileContent = rel => proj().files[rel] ?? '';
/// **「当前文件」是独立字段，不跟着 tab 走**：看脑图时它 = `脑图.mmd`，
/// 看正文时它 = 点开的那个 md，**打开「历史」时不许变**（历史是视图不是文件 ——
/// 第一版写成 `tab==mind ? … : openFile`，一点开历史就掉回 md，口径当场错位）。
const MIND_FILE = '脑图.mmd';
const histFile = () => S.currentFile || S.openFile;

/* ── toast ────────────────────────────────────── */
let toastTimer;
function toast(html) {
  const t = $('#toast'); t.innerHTML = html; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600);
}

/* ============================================================
   1. 文件树（VSCode 式）
   ============================================================ */
function renderTree() {
  const p = proj(), host = $('#fileTree');
  host.innerHTML = '';
  let count = 0;
  const walk = (nodes, container) => nodes.forEach(n => {
    const el = document.createElement('div');
    el.className = 'node' + (n.type === 'dir' && !n.open ? ' is-closed' : '');
    const row = document.createElement('div');
    row.className = 'node-row';
    const rel = n.__path;
    if (n.type === 'file') {
      count++;
      if (rel === histFile()) row.classList.add('is-sel');
      if (rel === S.focusFile) row.classList.add('is-focus-file');
      row.innerHTML = `<span class="tw"></span><span class="n-name"></span>`
        + (rel === S.focusFile ? `<span class="n-badge">重点</span>` : '');
      row.querySelector('.n-name').textContent = n.name;
      row.onclick = () => openFile(rel);
    } else {
      row.innerHTML = `<span class="tw${n.open ? ' open' : ''}">▶</span>`
        + `<span class="n-name dir"></span>`;
      row.querySelector('.n-name').textContent = n.name;
      row.onclick = () => { n.open = !n.open; save(); renderTree(); };
    }
    el.appendChild(row);
    if (n.type === 'dir') {
      const kids = document.createElement('div');
      kids.className = 'children';
      el.appendChild(kids);
      walk(n.children || [], kids);
    }
    container.appendChild(el);
  });
  // 给每个节点打上相对路径
  const stamp = (nodes, prefix) => nodes.forEach(n => {
    n.__path = prefix ? `${prefix}/${n.name}` : n.name;
    if (n.children) stamp(n.children, n.__path);
  });
  stamp(p.tree, '');
  walk(p.tree, host);
  $('#treeCount').textContent = `${count} 个文件`;
  $('#treeProjectPath').textContent = p.path;
  $('#treeProjectPath').title = p.path;
  $('#gitLogCount').textContent = `${S.gitLog.length} 次提交`;
}

function findNode(rel, nodes = proj().tree, prefix = '') {
  for (const n of nodes) {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    if (p === rel) return n;
    if (n.children) { const hit = findNode(rel, n.children, p); if (hit) return hit; }
  }
  return null;
}

function openFile(rel) {
  if (!(rel in proj().files)) return;
  S.focusFile = rel;                       // 点文件 = 自动设为「重点参考」
  if (rel === MIND_FILE) {
    // 点脑图文件：开脑图这一层，但**不改正文那个 openFile**
    //（否则「脑图 → 正文」会把 .mmd 当 markdown 编辑）。
    S.currentFile = MIND_FILE;
    S.tab = 'mind';
  } else {
    S.openFile = rel;
    S.currentFile = rel;
    if (S.tab === 'mind') S.tab = 'md';    // 停在脑图上时点别的文件，内容区要跟着换
  }
  save(); renderTree(); renderContext(); renderContent();
  toast(`已设为 <b>重点参考</b> · ${rel}`);
}

/* ============================================================
   2. 上下文条（项目路径 + 重点参考）
   ============================================================ */
function renderContext() {
  const p = proj();
  $('#ctxProjectPath').textContent = p.path;
  $('#ctxProjectPath').title = p.path;
  const f = S.focusFile;
  const has = !!f;
  $('#ctxFocusPath').textContent = has ? fullPath(f) : '未选择文件';
  $('#ctxFocusPath').title = has ? fullPath(f) : '';
  $('#ctxStrip').classList.toggle('is-empty', !has);
  $('#ctxFocus').style.display = has ? '' : 'none';

  $('#chatCtxProject').textContent = p.path;
  $('#chatCtxProject').title = p.path;
  $('#chatCtxFocus').textContent = has ? fullPath(f) : '未选重点文件';
  $('#chatCtxFocus').title = has ? fullPath(f) : '';
  $('#chatCtxFocusWrap').classList.toggle('has-focus', has);

  $('#fileTitle').textContent = S.openFile ? fullPath(histFile()) : '未打开文件';
  $('#histFile').textContent = S.openFile ? fullPath(histFile()) : '—';
}

/* ============================================================
   3. 内容区：Tab + 工具条
   ============================================================ */
function renderTabs() {
  $$('#contentTabs .tab').forEach(b => b.classList.toggle('is-on', b.dataset.tab === S.tab));
  $('#viewMd').classList.toggle('is-on', S.tab === 'md');
  $('#viewMind').classList.toggle('is-on', S.tab === 'mind');
  $('#viewHistory').classList.toggle('is-on', S.tab === 'history');
  $('#viewMd').dataset.variant = S.mdVariant;
  const n = (S.history[histFile()] || []).length;
  $('#historyBadge').textContent = n;
  renderTools();
}

function renderTools() {
  const host = $('#contentTools'); host.innerHTML = '';
  const mk = (label, on, fn) => {
    const b = document.createElement('button');
    b.className = 'btn btn-mini'; b.textContent = label;
    if (on) { b.style.borderColor = 'rgba(10,132,255,.6)'; b.style.color = '#CFE4FF'; }
    b.onclick = fn; host.appendChild(b);
  };
  if (S.tab === 'md') {
    mk('编辑', S.mdVariant === 'edit', () => { S.mdVariant = 'edit'; save(); renderTabs(); });
    mk('预览', S.mdVariant === 'preview', () => { S.mdVariant = 'preview'; save(); renderTabs(); });
    mk('分栏', S.mdVariant === 'split', () => { S.mdVariant = 'split'; save(); renderTabs(); });
  } else if (S.tab === 'mind') {
    mk(S.codeFolded ? '展开 mermaid 代码' : '折叠 mermaid 代码', false, toggleCodeFold);
  }
}

function renderContent() {
  renderContext();            // 文件标题 / 历史抬头跟着「当前文件」走（脑图 vs 正文）
  renderTabs();
  if (S.tab === 'md') renderMd();
  if (S.tab === 'mind') renderMind();
  if (S.tab === 'history') renderHistory();
}

/* ============================================================
   4. Markdown：实时编辑 + 实时预览
   ============================================================ */
function mdToHtml(src) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = esc(src).split('\n');
  let html = '', inCode = false, list = null, para = [];
  const flushPara = () => { if (para.length) { html += `<p>${inline(para.join(' '))}</p>`; para = []; } };
  const inline = s => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

  for (const raw of lines) {
    if (/^```/.test(raw)) {
      flushPara(); closeList();
      if (!inCode) { html += '<pre><code>'; inCode = true; }
      else { html += '</code></pre>'; inCode = false; }
      continue;
    }
    if (inCode) { html += raw + '\n'; continue; }
    if (!raw.trim()) { flushPara(); closeList(); continue; }

    let m;
    if ((m = raw.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara(); closeList();
      html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`; continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(raw.trim())) { flushPara(); closeList(); html += '<hr>'; continue; }
    if ((m = raw.match(/^&gt;\s?(.*)$/))) { flushPara(); closeList(); html += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    if ((m = raw.match(/^[-*]\s+\[( |x)\]\s+(.*)$/i))) {
      flushPara();
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      const done = m[1].toLowerCase() === 'x';
      html += `<li>${done ? '✅' : '⬜'} ${inline(m[2])}</li>`; continue;
    }
    if ((m = raw.match(/^[-*]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    if ((m = raw.match(/^\d+\.\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1])}</li>`; continue;
    }
    closeList(); para.push(raw);
  }
  flushPara(); closeList();
  if (inCode) html += '</code></pre>';
  return html || '<div class="md-empty">（空文件）</div>';
}

let mdDebounce;
function renderMd() {
  const ta = $('#mdSource');
  if (ta.value !== fileContent(S.openFile)) ta.value = fileContent(S.openFile);
  $('#mdPreview').innerHTML = mdToHtml(ta.value);
}
function onMdEdit() {
  const rel = S.openFile; if (!rel) return;
  proj().files[rel] = $('#mdSource').value;
  $('#mdPreview').innerHTML = mdToHtml(proj().files[rel]);
  clearTimeout(mdDebounce);
  mdDebounce = setTimeout(() => {           // 任何一次编辑 → 自动备份一版
    pushHistory(rel, '手改', proj().files[rel], '正文编辑');
    save(); renderToolsBadge();
  }, 700);
  save();
}
function renderToolsBadge() {
  $('#historyBadge').textContent = (S.history[histFile()] || []).length;
}

/* ============================================================
   5. Mermaid 脑图：解析 → 布局 → SVG
   ============================================================ */
function parseMindmap(text) {
  const errors = [];
  const rows = text.split('\n')
    .map(l => ({ raw: l, indent: l.match(/^[\t ]*/)[0].replace(/\t/g, '  ').length, text: l.trim() }))
    .filter(r => r.text.length);
  if (!rows.length) throw new Error('脑图是空的');
  if (!/^mindmap\b/i.test(rows[0].text)) errors.push('第一行应以 mindmap 开头（仍按缩进解析）');
  else rows.shift();
  if (!rows.length) throw new Error('脑图里没有节点');
  // mermaid 的根写法是 `root((文字))` —— `root` 是关键字不是文字，
  // 不剥掉根节点就画成 `root((我的笔记项目))`（2026-09-30 截图发现）。
  rows[0].text = rows[0].text.replace(/^root\s*/i, '');

  const clean = t => t.replace(/^\(\((.*)\)\)$/, '$1').replace(/^\((.*)\)$/, '$1')
    .replace(/^\[\[(.*)\]\]$/, '$1').replace(/^\{\{(.*)\}\}$/, '$1')
    .replace(/^\[(.*)\]$/, '$1').trim();
  const shapeOf = t =>
    /^\(\(.*\)\)$/.test(t) ? 'root' : /^\(.*\)$/.test(t) ? 'round'
    : /^\[\[.*\]\]$/.test(t) ? 'rect' : /^\{\{.*\}\}$/.test(t) ? 'hex' : 'plain';

  const rootIndent = rows[0].indent;
  const root = { id: 'n0', text: clean(rows[0].text), shape: shapeOf(rows[0].text), depth: 0, children: [] };
  const stack = [{ indent: rootIndent, node: root }];
  let uid = 1;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.indent <= rootIndent) { errors.push(`第 ${i + 2} 行缩进回到根级，已忽略：${r.text.slice(0, 24)}`); continue; }
    while (stack.length > 1 && r.indent <= stack[stack.length - 1].indent) stack.pop();
    const node = {
      id: 'n' + (uid++), text: clean(r.text), shape: shapeOf(r.text),
      depth: stack.length, children: [], parent: stack[stack.length - 1].node
    };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent: r.indent, node });
  }
  return { root, errors };
}

const measurer = (() => {
  const c = document.createElement('canvas').getContext('2d');
  return t => { c.font = '12px -apple-system,"PingFang SC",sans-serif'; return c.measureText(t).width; };
})();

function layoutMind(root) {
  const ROW = 34, COL = 178, PAD = 26, NODE_H = 26;
  let cursor = PAD;
  const collapsed = S.collapsed;
  const place = (n, depth) => {
    n.x = PAD + depth * COL;
    const maxW = 240;
    let w = Math.max(70, measurer(n.text) + 28);
    if (w > maxW) {                          // 超长节点截断，别把框撑出屏幕
      let t = n.text;
      while (t.length > 2 && measurer(t + '…') + 28 > maxW) t = t.slice(0, -1);
      n.text = t + '…';
      w = maxW;
    }
    n.w = w;
    const kids = n.children;
    if (!kids.length || collapsed[n.id]) {
      if (collapsed[n.id] && kids.length) n.hiddenKids = kids.length;
      n.y = cursor; cursor += ROW;
    } else {
      n.hiddenKids = 0;
      kids.forEach(k => place(k, depth + 1));
      n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    }
  };
  place(root, 0);
  let maxX = 0, maxY = cursor;
  (function walk(n) {
    maxX = Math.max(maxX, n.x + n.w + PAD);
    maxY = Math.max(maxY, n.y + NODE_H + 10);
    if (!collapsed[n.id]) n.children.forEach(walk);
  })(root);
  return { maxX, maxY, NODE_H };
}

function renderMind() {
  const wrap = $('#mindCanvas');
  const src = $('#mindSource');
  if (src.value !== fileContent('脑图.mmd')) src.value = fileContent('脑图.mmd');

  let parsed;
  try { parsed = parseMindmap(src.value); }
  catch (e) {
    $('#mindErr').textContent = '解析失败：' + e.message;
    $('#mindErr').classList.add('show');
    wrap.innerHTML = '<div class="hist-empty">脑图画不出来 —— 看看左边的代码？</div>';
    return;
  }
  $('#mindErr').classList.toggle('show', parsed.errors.length > 0);
  $('#mindErr').textContent = parsed.errors.join('　·　');

  const { maxX, maxY, NODE_H } = layoutMind(parsed.root);
  const k = S.mindZoom || 1;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  svg.setAttribute('width', maxX * k);
  svg.setAttribute('height', maxY * k);

  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `<linearGradient id="rootGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0A84FF"/><stop offset="1" stop-color="#7A5CFF"/>
    </linearGradient>`;
  svg.appendChild(defs);

  const linkLayer = document.createElementNS(NS, 'g');
  const nodeLayer = document.createElementNS(NS, 'g');
  svg.appendChild(linkLayer); svg.appendChild(nodeLayer);

  (function draw(n) {
    if (n.parent) {
      const p = n.parent;
      const x1 = p.x + p.w, y1 = p.y + NODE_H / 2;
      const x2 = n.x, y2 = n.y + NODE_H / 2;
      const mid = x1 + (x2 - x1) / 2;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'mn-link');
      path.setAttribute('d', `M${x1} ${y1} H${mid} V${y2} H${x2}`);
      linkLayer.appendChild(path);
    }
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', `mn-g mn-lvl${n.depth === 0 ? 'root' : n.depth === 1 ? '1' : '2'}`
      + (S.collapsed[n.id] ? ' is-collapsed' : ''));
    g.setAttribute('transform', `translate(${n.x},${n.y})`);

    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('class', 'mn-box');
    rect.setAttribute('width', n.w); rect.setAttribute('height', NODE_H);
    rect.setAttribute('rx', n.depth === 0 ? 13 : 7);
    g.appendChild(rect);

    const label = document.createElementNS(NS, 'text');
    label.setAttribute('class', 'mn-label');
    label.setAttribute('x', 12); label.setAttribute('y', NODE_H / 2 + 4);
    label.textContent = n.text;
    g.appendChild(label);

    if (n.children.length) {
      const cnt = document.createElementNS(NS, 'text');
      cnt.setAttribute('class', 'mn-cnt');
      cnt.setAttribute('x', n.w - 8); cnt.setAttribute('y', NODE_H / 2 + 3.5);
      cnt.setAttribute('text-anchor', 'end');
      cnt.textContent = S.collapsed[n.id] ? `▸${countDesc(n)}` : `▾${n.children.length}`;
      g.appendChild(cnt);
      g.onclick = () => {
        if (S.collapsed[n.id]) delete S.collapsed[n.id]; else S.collapsed[n.id] = true;
        save(); renderMind();
      };
    }
    nodeLayer.appendChild(g);
    if (!S.collapsed[n.id]) n.children.forEach(draw);
  })(parsed.root);

  wrap.innerHTML = '';
  wrap.appendChild(svg);
  $('#mindLayout').classList.toggle('code-folded', S.codeFolded);
  $('#btnFoldCode').hidden = S.codeFolded;
  $('#btnShowCode').hidden = !S.codeFolded;
}
function countDesc(n) { return n.children.reduce((a, c) => a + 1 + countDesc(c), 0); }

function toggleCodeFold() {
  S.codeFolded = !S.codeFolded; save();
  renderMind(); renderTools();
  toast(S.codeFolded ? '已折叠 mermaid 代码 —— 只显示脑图' : '已展开 mermaid 代码');
}

/* mermaid 文本级编辑（对话改图也走这里） */
function mindAddBranch(label, underFirst = true) {
  const lines = ($('#mindSource').value || fileContent('脑图.mmd')).split('\n');
  // 找最深缩进里第一个有孩子的分支；否则挂在 root 下
  let best = -1, bestIndent = -1;
  lines.forEach((l, i) => {
    if (!l.trim() || /^mindmap/i.test(l.trim())) return;
    const ind = l.match(/^[\t ]*/)[0].replace(/\t/g, '  ').length;
    if (ind > bestIndent) { bestIndent = ind; best = i; }
  });
  const rootIndent = (lines[1] || '  ').match(/^[\t ]*/)[0].length;
  const indent = ' '.repeat(Math.max(rootIndent + 2, bestIndent >= 0 ? bestIndent : rootIndent + 2));
  const at = underFirst && best >= 0 ? best + 1 : lines.length;
  lines.splice(at, 0, indent + label);
  const text = lines.join('\n');
  $('#mindSource').value = text;
  proj().files['脑图.mmd'] = text;
  pushHistory('脑图.mmd', '对话', text, `脑图新增分支「${label}」`);
  save(); renderMind(); renderToolsBadge();
  return true;
}
function mindRemoveNode(keyword) {
  const lines = ($('#mindSource').value || '').split('\n');
  const idx = lines.findIndex(l => l.includes(keyword) && !/^mindmap/i.test(l.trim()));
  if (idx < 0) return false;
  const removed = lines.splice(idx, 1)[0].trim();
  const text = lines.join('\n');
  $('#mindSource').value = text;
  proj().files['脑图.mmd'] = text;
  pushHistory('脑图.mmd', '对话', text, `脑图删除「${removed.replace(/[()[\]{}]/g, '')}」`);
  save(); renderMind(); renderToolsBadge();
  return true;
}

/* ============================================================
   6. 历史：任何一次编辑都自动备份 + 恢复
   ============================================================ */
function pushHistory(rel, source, content, summary, force = false) {
  if (!rel) return;
  const list = S.history[rel] || (S.history[rel] = []);
  const last = list[0];
  // 内容没变不记 —— 但**恢复要强制记**：它记的是"做过这个动作"，
  // 而恢复到最新一版时内容恰好相同，去重会把这条痕迹吃掉（需求 5.3）。
  if (!force && last && last.content === content) return;
  list.unshift({ ts: now(), source, content, summary });
  if (list.length > 50) list.length = 50;                // 每文件留 50 条
  save();
  if (S.tab === 'history') renderHistory(); else renderToolsBadge();
}
function renderHistory() {
  const rel = histFile(), list = S.history[rel] || [];
  const host = $('#histList'); host.innerHTML = '';
  if (!list.length) {
    host.innerHTML = `<div class="hist-empty">这个文件还没有历史。<br>
      改一次正文、改一次脑图，或让对话动它一下 —— 都会自动出现在这里。</div>`;
    return;
  }
  list.forEach((h, i) => {
    const li = document.createElement('li');
    li.className = 'hist-item' + (i === 0 ? ' is-new' : '');
    li.innerHTML = `
      <span class="hist-when">${fmtTime(h.ts)}</span>
      <span class="hist-src src-${h.source}">${h.source}</span>
      <span class="hist-sum">${h.summary || ''}</span>
      <span class="hist-acts">
        <button class="btn btn-mini" data-a="view">查看</button>
        <button class="btn btn-mini" data-a="restore">恢复</button>
      </span>`;
    li.querySelector('[data-a="view"]').onclick = () => {
      toast(`<b>${fmtTime(h.ts)}</b> ${h.source} · ${h.summary || ''}`);
      if (confirm('把这一版放到内容区看？（不写回）')) {
        S.currentFile = rel;                          // 只换「当前文件」，不动正文的 openFile
        if (rel === MIND_FILE) { $('#mindSource').value = h.content; S.tab = 'mind'; }
        else { $('#mdSource').value = h.content; $('#mdPreview').innerHTML = mdToHtml(h.content); S.tab = 'md'; }
        save(); renderContent();
      }
    };
    li.querySelector('[data-a="restore"]').onclick = () => restore(rel, i);
    host.appendChild(li);
  });
}
function restore(rel, index) {
  const h = (S.history[rel] || [])[index];
  if (!h) return;
  const current = proj().files[rel];
  proj().files[rel] = h.content;
  pushHistory(rel, '恢复', h.content, `恢复到 ${fmtTime(h.ts)} 那一版（改前内容已备份）`, true);
  if (rel === MIND_FILE) { $('#mindSource').value = h.content; S.tab = 'mind'; }
  else { $('#mdSource').value = h.content; $('#mdPreview').innerHTML = mdToHtml(h.content); S.tab = 'md'; }
  S.currentFile = rel;
  if (rel !== MIND_FILE) S.openFile = rel;            // 正文那个槽只放 md
  save(); renderTree(); renderContext(); renderContent();
  toast(`已恢复 <b>${fmtTime(h.ts)}</b> 那一版；改前的内容仍在历史里`);
  void current;
}

/* ============================================================
   7. 右侧对话（连续 / 临时 / 语音）
   ============================================================ */
function addMsg(role, html, meta) {
  S.chat.push({ role, html, meta, ts: now(), temp: S.chatMode === 'temporary' });
  if (S.chat.length > 60) S.chat.shift();
  save(); renderChat();
}
function renderChat() {
  const host = $('#msgs'); host.innerHTML = '';
  if (!S.chat.length) {
    host.innerHTML = `<div class="msg msg-sys"><div class="bubble">
      这就是「把当前会话搬到右侧」。围绕项目提问，或直接让它改脑图 ——
      每次改动都会自动备份历史。</div></div>`;
  }
  S.chat.forEach(m => {
    const el = document.createElement('div');
    el.className = `msg msg-${m.role}` + (m.temp ? ' msg-temp' : '');
    const who = m.role === 'user' ? '你' : m.role === 'ai' ? (m.temp ? 'AI · 临时对话' : 'AI') : '系统';
    el.innerHTML = `<div class="msg-who">${who}</div><div class="bubble">${m.html}</div>`
      + (m.meta ? `<div class="msg-meta">${m.meta}</div>` : '');
    host.appendChild(el);
  });
  host.scrollTop = host.scrollHeight;
}

function sendChat() {
  const ta = $('#chatInput');
  const text = ta.value.trim();
  if (!text) return;
  ta.value = '';                                   // 发送后清空，光标留在框里
  ta.focus();
  addMsg('user', escapeHtml(text));

  setTimeout(() => reply(text), 380);
}

function reply(q) {
  const p = proj(), focus = S.focusFile;
  const ctx = `<code>${p.path}</code>` + (focus ? ` · 重点参考 <code>${fullPath(focus)}</code>` : '');
  const demo = `本地演示回复 · 未接模型`;

  // ① 对话改脑图（需求 6.3）
  if (/(脑图|思维导图|mindmap|分支|节点)/.test(q) && /(加|新增|添加|插入|来一个|来条)/.test(q)) {
    const m = q.match(/[「"'"']([^「」"'"']+)[」"'"']/) || q.match(/[:：]\s*(\S+)$/);
    const label = (m ? m[1] : q.replace(/.*(?:加|新增|添加)/, '').trim()).slice(0, 16) || '新分支';
    mindAddBranch(label);
    S.tab = 'mind'; S.currentFile = MIND_FILE; save(); renderContent();
    addMsg('ai',
      `改好了 —— 脑图上多了一支 <b>${escapeHtml(label)}</b>。\n\n` +
      `· 文件：<code>${fullPath('脑图.mmd')}</code>\n` +
      `· 已自动备份一版历史（来源＝对话）→ 右上「历史」能看见、能恢复\n` +
      `· 上下文：${ctx}`, demo);
    return;
  }
  if (/(脑图|思维导图)/.test(q) && /(删|去掉|移除|不要)/.test(q)) {
    const kw = (q.match(/[「"'"']([^「」"'"']+)[」"'"']/) || [, q.split(/[删去掉移除]/).pop()])[1] || '';
    if (kw && mindRemoveNode(kw.trim())) {
      S.tab = 'mind'; S.currentFile = MIND_FILE; save(); renderContent();
      addMsg('ai', `已从脑图删掉「${escapeHtml(kw.trim())}」，并自动备份了一版（来源＝对话）。`, demo);
      return;
    }
    addMsg('ai', `没在脑图里找到「${escapeHtml(kw)}」。告诉我准确的分支名，或切到「脑图」看一眼。`, demo);
    return;
  }

  // ② 回答围绕项目 / 重点文件
  if (/(路径|目录|项目在哪|绝对路径)/.test(q)) {
    addMsg('ai',
      `当前项目：<code>${p.path}</code>\n` +
      (focus ? `重点参考：<code>${fullPath(focus)}</code>\n` : '（还没选重点文件，点左边任意文件即可）') +
      `\n每一轮对话都会自动带上这两条。`, demo);
    return;
  }
  if (/(总结|讲讲|说了什么|概览|README)/i.test(q) && focus) {
    const body = fileContent(focus).split('\n').filter(l => l.trim() && !/^```/.test(l)).slice(0, 5).join('\n');
    addMsg('ai', `重点参考是 <code>${escapeHtml(focus)}</code>，开头这些：\n\n${escapeHtml(body)}\n\n要我把它并进脑图吗？说「给脑图加一个 …」就行。`, demo);
    return;
  }
  if (/(历史|备份|恢复|版本)/.test(q)) {
    const n = (S.history[histFile()] || []).length;
    addMsg('ai',
      `<code>${escapeHtml(histFile())}</code> 目前有 <b>${n}</b> 版历史。\n` +
      `任何一次编辑（手改 / 对话改 / 恢复）都会自动存一版，最多留 50 条，点「恢复」随时回去 —— 恢复本身也会留一版。`, demo);
    return;
  }
  // ③ 默认：结合上下文
  addMsg('ai',
    `收到。我按这个上下文来答：${ctx}\n\n` +
    `（演示回复：真机上这里走的是当前卡片的管线 —— 图文带截图、语音走朗读、` +
    `连续/临时对话按你选的那颗走。）\n\n` +
    `可以试试：\n· 「给脑图加一个「定价」分支」\n· 「讲讲 README 开头」\n· 「项目路径是多少」`,
    demo);
}
const escapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ============================================================
   8. 顶部：模式 / 新建项目 / 提交 git / 关闭
   ============================================================ */
function renderModes() {
  $$('#modeChips .chip').forEach(c => c.classList.toggle('is-on', c.dataset.mode === S.mode));
  const map = {
    imageText: ['围绕当前项目', '图文模式：发送可带屏幕截图'],
    voice: ['语音模式', '语音模式：回答会念出来'],
    video: ['视频模式', '视频模式：带摄像头画面']
  };
  $('#chatStatus').textContent = map[S.mode][0];
  $('#composerHint').textContent =
    S.mode === 'voice' ? '语音模式 · 回车发送文字，接入后可直接说话'
    : S.mode === 'video' ? '视频模式 · 回车发送'
    : '回车发送 · Shift+回车换行';
  $('#chatStatus').title = map[S.mode][1];
}

function renderChatModes() {
  $$('#chatModes .dchip').forEach(c => c.classList.toggle('is-on', c.dataset.chat === S.chatMode));
}

function newProject() {
  const name = prompt('新项目的名字（＝新建一个文件夹）', '新项目');
  if (!name) return;
  const id = 'p' + now();
  const path = `/Users/mjm/Documents/SuperAgent/${name}`;
  S.projects.push({
    id, name, path,
    files: {
      'README.md': `# ${name}\n\n新建的项目。绝对路径：\`${path}\`\n`,
      '脑图.mmd': `mindmap\n  root((${name}))\n    待办\n      先写 README\n`
    },
    tree: [{ name: 'README.md', type: 'file' }, { name: '脑图.mmd', type: 'file' }]
  });
  S.activeProject = id; S.openFile = 'README.md'; S.focusFile = 'README.md';
  save(true); renderTree(); renderContext(); renderContent();
  addMsg('sys', `新建项目 <b>${escapeHtml(name)}</b> · <code>${path}</code> —— 后续对话默认携带这个绝对路径。`);
  toast(`新项目 <b>${escapeHtml(name)}</b> 已建好`);
}

function commitGit() {
  const p = proj();
  S.gitLog.unshift({ ts: now(), path: p.path, files: Object.keys(p.files).length });
  save(true); renderTree();
  pushHistory(S.openFile, '提交', fileContent(S.openFile), `提交快照（${S.gitLog.length}）`);
  addMsg('sys', `已提交一次快照：<code>${p.path}</code> · ${Object.keys(p.files).length} 个文件 · 第 ${S.gitLog.length} 次`);
  toast(`提交成功 · 第 <b>${S.gitLog.length}</b> 次（原型记快照，落 SwiftUI 后接真 git）`);
}

/* ============================================================
   9. 分栏拖拽
   ============================================================ */
function dragSplit(el, apply) {
  el.addEventListener('mousedown', e => {
    e.preventDefault(); el.classList.add('drag');
    const move = ev => apply(ev);
    const up = () => {
      el.classList.remove('drag');
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      if (S.tab === 'mind') renderMind();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });
}

/* ============================================================
   10. 绑定
   ============================================================ */
function bind() {
  $$('#modeChips .chip').forEach(c => c.onclick = () => { S.mode = c.dataset.mode; save(); renderModes(); });
  $$('#chatModes .dchip').forEach(c => c.onclick = () => {
    S.chatMode = c.dataset.chat; save(); renderChatModes();
    toast(`对话方式：${c.textContent}`);
  });
  $$('#contentTabs .tab').forEach(b => b.onclick = () => {
    S.tab = b.dataset.tab;
    // 切到脑图/正文时把「当前文件」钉到对应文件；切历史不动它。
    if (S.tab === 'mind') S.currentFile = MIND_FILE;
    else if (S.tab === 'md') S.currentFile = S.openFile;
    save(); renderContent();
  });

  $('#mdSource').addEventListener('input', onMdEdit);

  let mindTimer;
  $('#mindSource').addEventListener('input', () => {
    proj().files['脑图.mmd'] = $('#mindSource').value;
    save();
    clearTimeout(mindTimer);
    mindTimer = setTimeout(() => {
      pushHistory('脑图.mmd', '手改', $('#mindSource').value, '脑图源码编辑');
      renderMind(); renderToolsBadge();
    }, 700);
  });

  $('#btnFoldCode').onclick = toggleCodeFold;
  $('#btnShowCode').onclick = toggleCodeFold;
  $('#btnFit').onclick = () => {
    const wrap = $('#mindCanvas'), svg = wrap.querySelector('svg');
    if (!svg) return;
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const k = Math.min(1, (wrap.clientWidth - 16) / vb[2], (wrap.clientHeight - 16) / vb[3]);
    S.mindZoom = Math.max(0.3, k); save(); renderMind();
    toast(`已适应窗口 · ${Math.round(S.mindZoom * 100)}%`);
  };

  $('#btnNewProject').onclick = newProject;
  $('#btnCommitGit').onclick = commitGit;
  $('#btnClose').onclick = () => toast('（原型）关闭 = 回到原来的会话页，右侧这段对话就是把当前会话搬过来的');
  $('#btnFullFeature').onclick = () => toast('当前就在「全功能」页');

  $('#btnSend').onclick = sendChat;
  $('#chatInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  $('#btnHistClear').onclick = () => {
    const rel = histFile();
    if (!rel) return;
    if (!confirm(`清空 ${rel} 的全部历史？`)) return;
    delete S.history[rel]; save(true); renderHistory(); renderToolsBadge();
    toast('已清空该文件的历史');
  };

  dragSplit($('#vSplit'), e => {
    const r = $('#workspace').getBoundingClientRect();
    const w = Math.max(170, Math.min(r.width * 0.5, e.clientX - r.left));
    document.documentElement.style.setProperty('--tree-w', w + 'px');
  });
  dragSplit($('#hSplit'), e => {
    const r = document.body.getBoundingClientRect();
    const w = Math.max(280, Math.min(r.width * 0.45, r.right - e.clientX));
    document.documentElement.style.setProperty('--chat-w', w + 'px');
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('#btnClose').click();
  });
}

/* ── 启动 ─────────────────────────────────────── */
function boot() {
  bind();
  renderTree(); renderContext(); renderModes(); renderChatModes();
  renderContent(); renderChat();
  // 起手给一句系统说明（＝"当前会话搬到右侧"）
  if (!S.chat.length) {
    S.chat.push({
      role: 'sys', ts: now(),
      html: `已进入<b>全功能</b>：左 80% 是工作区（文件夹 · md · 脑图），右边是对话。` +
            `当前项目 <code>${proj().path}</code>`,
      meta: ''
    });
    save();
    renderChat();
  }
}
document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', boot)
  : boot();

})();
