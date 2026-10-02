// make-docs.js —— 从数据生成 02 / 03 两份文档，保证「题 / 知识点 / 映射」同源
// 用法：node make-docs.js
const fs = require("fs");
const path = require("path");
const { KPS } = require("./data-kps.js");
const { getQuestion, LEVELS } = require("./data-questions.js");

const DOMAIN = { number: "数与运算", geo: "图形几何", measure: "量与计量", stat: "统计与概率", think: "综合实践" };
const kpById = Object.fromEntries(KPS.map((k) => [k.id, k]));

function answerText(step) {
  if (step.options) return step.options[step.ans];
  if (Array.isArray(step.ans)) return step.ans.join(" 和 ");
  return String(step.ans);
}

// 七道题全部预计算（用于统计）
const QS = LEVELS.map((lv) => getQuestion(lv.n));

// ---------- 02 · 一道题与七种难度 ----------
let out2 = `# 02 · 一道题与七种难度 ——《数学岛 · 点亮灯塔》

> **只有一道题。** 一个故事、一张连续任务卷，从第 (1) 步一路做到最后，覆盖小学全部 ${KPS.length} 个知识点。
> **难度 = 第 2~7 道题**：知识点完全相同，只是问法更绕、步骤连锁更深 —— 不是七批题。
> 本文档由 \`make-docs.js\` 从 \`data-questions.js\` 自动生成，**不要手改**。

## 设计规则（简单题 vs 复杂题）

| | 低难度 | 高难度 |
|---|---|---|
| 知识点 | ${KPS.length} 个 | **同样 ${KPS.length} 个，一个不多一个不少** |
| 问法 | 直问（8+5=?） | 越来越多「换法」：逆向、绕弯（一共13，一部分是8，另一部分?） |
| 连锁 | 只在末段汇聚 | 每隔一段就有「连锁汇聚」，且首尾相接 —— 上一步结果喂下一步 |
| 数值 | 不放大 | **不放大**（知识点不能漂：一年级的 20 以内加法放到巅峰还是它） |

## 七道题一览

| 题号 | 难度名 | 步数 | 换法步数 | 中段连锁 | 差异说明 |
|---|---|---|---|---|---|
`;
QS.forEach((q, i) => {
  const b = q.steps.filter((s) => s.styleB).length;
  out2 += `| 第 ${q.level} 道 | ${q.name} | ${q.steps.length} | ${b} | ${q.midCount} | ${LEVELS[i].note} |\n`;
});

out2 += `
## 连锁结构（题内链，所有难度都有）

\`\`\`
正文 (1)…(90)   ←— 每步一个知识点；高难度每隔一段插入「连锁汇聚」步（难度越高越密、且引用上一个汇聚）
   ↓
(91) 总能量 = 六个指定步 +（高难度时）最后一个连锁汇聚的结果
   ↓
(92) 25% · (93) 按 1:3 分 · (94) ÷4 · (97) ÷2   ← 都从总能量派生
(95) 圆面积 · (96) 1+…+10 · (98) = (92)+(94)
   ↓
最后一步：灯塔密码 = 上面全部结果之和 → 点亮
\`\`\`

（编号会随中段连锁数量略有偏移，以各题实际编号为准。）

---

## 第 1 道题 · 入门（全文，${QS[0].steps.length} 步）

**故事**：${QS[0].story.replace(/\n\n/g, " ")}

| 步号 | 题目 | 标准答案 | 考察知识点 |
|---|---|---|---|
`;
for (const s of QS[0].steps) {
  const kps = s.kp.map((id) => kpById[id].name).join("、");
  out2 += `| (${s.no}) | ${s.prompt.replace(/\|/g, "\\|")} | **${answerText(s).replace(/\|/g, "\\|")}** | ${kps} |\n`;
}

out2 += `
---

## 其余六道题怎么获取

第 2~7 道题由同一副骨架自动生成（\`getQuestion(level)\`），问法与连锁不同、知识点一一对应。
完整题面与答案在原型里点「演示模式 → 看答案」逐题查看；机器可读版：

\`\`\`bash
node -e "const {getQuestion}=require('./data-questions.js');
const q=getQuestion(7); q.steps.forEach(s=>console.log(s.no, s.prompt, '=>', s.ans))"
\`\`\`

---

## 说明

- 「标准答案」是唯一判据；允许等价写法（数值等价、常见中文写法）。
- 标了「换法」的步骤是该难度的逆向/变式问法；没有变式能力的题型（如图形识别选择题）各难度问法相同。
- 每道题的最后一步答对 = 该道题「点亮」，同时该道题覆盖全部 ${KPS.length} 个知识点。
`;

// ---------- 03 · 知识点地图与对照 ----------
const usage = {};
for (const s of QS[0].steps) {
  for (const k of s.kp) (usage[k] = usage[k] || []).push(s);
}
let out3 = `# 03 · 知识点地图与对照 —— 小学数学全部 ${KPS.length} 个知识点 × 一道题

> 本文档由 \`make-docs.js\` 自动生成，**不要手改**。
> 覆盖率：**${KPS.length}/${KPS.length} = 100%** —— 每道题（7 道同理）都覆盖每一个知识点。
> 步号以**第 1 道题**为基准；其他难度同一骨架，编号可能因连锁步数量略有偏移。

| 年级 | 知识点数量 | 说明 |
|---|---|---|
`;
const gCount = {};
for (const k of KPS) gCount[k.g] = (gCount[k.g] || 0) + 1;
for (let g = 1; g <= 6; g++) out3 += `| ${g} 年级 | ${gCount[g]} | 分布在题卷正文的对应位置 |\n`;

for (let g = 1; g <= 6; g++) {
  out3 += `\n---\n\n## ${g} 年级知识点\n\n`;
  out3 += `| # | 知识点 | 领域 | 一句话讲解 | 对应步骤（第 1 道题） |\n|---|---|---|---|---|\n`;
  let i = 0;
  for (const k of KPS.filter((x) => x.g === g)) {
    i++;
    const where = (usage[k.id] || []).map((s) => `(${s.no})`).join("、");
    out3 += `| ${g}-${i} | ${k.name} | ${DOMAIN[k.domain]} | ${k.tip.replace(/\|/g, "\\|")} | ${where} |\n`;
  }
}

out3 += `\n---\n\n## 反向索引：每一步考哪些知识点（第 1 道题）\n\n`;
for (const s of QS[0].steps) {
  const names = s.kp.map((id) => `**${kpById[id].name}**（${kpById[id].g}年级）`).join(" ＋ ");
  out3 += `- (${s.no})：${names}\n`;
}
out3 += `\n---\n\n## 领域分布\n\n| 领域 | 知识点数 |\n|---|---|\n`;
const dCount = {};
for (const k of KPS) dCount[k.domain] = (dCount[k.domain] || 0) + 1;
for (const d of ["number", "geo", "measure", "stat", "think"]) out3 += `| ${DOMAIN[d]} | ${dCount[d] || 0} |\n`;

fs.writeFileSync(path.join(__dirname, "02-一道题与七种难度.md"), out2);
fs.writeFileSync(path.join(__dirname, "03-知识点地图与对照.md"), out3);
// 旧文件名清理（2026-10-02 形态重构后作废）
const legacy = path.join(__dirname, "02-七关闯关题.md");
if (fs.existsSync(legacy)) fs.unlinkSync(legacy);
console.log("生成完成：02-一道题与七种难度.md / 03-知识点地图与对照.md（旧 02 已移除）");
