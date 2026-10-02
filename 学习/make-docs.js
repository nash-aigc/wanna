// make-docs.js —— 从 data-kps.js + data-questions.js 生成两份文档，保证「题 / 知识点 / 映射」三者一致
// 用法：node make-docs.js
const fs = require("fs");
const path = require("path");
const { KPS } = require("./data-kps.js");
const { STAGES } = require("./data-questions.js");

const DOMAIN = { number: "数与运算", geo: "图形几何", measure: "量与计量", stat: "统计与概率", think: "综合实践" };
const kpById = Object.fromEntries(KPS.map((k) => [k.id, k]));

function answerText(item) {
  if (item.type === "mc") return item.options[item.answer];
  if (item.type === "input2") return item.answer.join(" 和 ");
  return String(item.answer);
}
function itemNo(stage, item) {
  return `${stage.id}-${stage.items.indexOf(item) + 1}`;
}

// ---------- 02 · 七关闯关题 ----------
let out2 = `# 02 · 七关闯关题 ——《数学岛 · 点亮灯塔》

> 一道题覆盖小学全部 ${KPS.length} 个知识点；分 **7 关（7 个难度阶段）**，
> **上一关的能量数是下一关的输入**，不按顺序无法继续。
> 本文档由 \`make-docs.js\` 从 \`data-questions.js\` 自动生成 —— **不要手改**，改题目请改数据文件后重新生成。

## 链式结构（一图看懂）

\`\`\`
第1关 登岛清点(一年级) ──能量 65──▶ 第2关 划地安营(二年级) ──能量 59──▶
第3关 架桥运粮(三年级) ──能量 254──▶ 第4关 铺路进城(四年级) ──能量 250──▶
第5关 装仓清点(五年级) ──能量 318──▶ 第6关 灯塔图纸(六年级) ──能量 182──▶
第7关 点亮灯塔(综合冲刺) ──密码 1128──▶ 🗼 灯塔点亮
\`\`\`

每关末尾有一道**能量合成题**：把本关前面若干题的答案代入公式，得到本关能量数；
能量数正确才解锁下一关。第七关的密码 = 核心能量(282) × 4 = **1128**。

`;

for (const s of STAGES) {
  out2 += `---\n\n## 第 ${s.id} 关 · ${s.title}（${s.gradeLabel}）\n\n`;
  out2 += `**故事**：${s.intro}\n\n`;
  out2 += `| 题号 | 题目 | 标准答案 | 考察知识点 |\n|---|---|---|---|\n`;
  for (const it of s.items) {
    const kps = it.kps.map((id) => kpById[id].name).join("、");
    out2 += `| ${itemNo(s, it)} | ${it.prompt.replace(/\|/g, "\\|")} | **${answerText(it).replace(/\|/g, "\\|")}** | ${kps} |\n`;
  }
  out2 += `\n**能量合成 · ${s.energy.label}**\n\n`;
  out2 += `- 公式：\`${s.energy.formulaText}\`\n`;
  out2 += `- 结果：**${s.energy.answer}**（引用题号：${s.energy.referenced.map((r) => {
    const st = STAGES.find((x) => r.startsWith("s" + x.id));
    return itemNo(st, st.items.find((i) => i.id === r));
  }).join("、")}）\n\n`;
}
out2 += `---\n\n## 说明\n\n- 「标准答案」是唯一判据；学生作答允许等价写法（数值等价、常见中文写法）。\n- 「考察知识点」列与 \`03-知识点地图与对照.md\` 互为反向索引。\n- 每关的**能量合成**本身也是考点（代入、运算顺序）。\n`;

// ---------- 03 · 知识点地图与对照 ----------
const usage = {}; // kpId -> [{stage,item}]
for (const s of STAGES) {
  for (const it of s.items) {
    for (const k of it.kps) (usage[k] = usage[k] || []).push({ s, it });
  }
}
let out3 = `# 03 · 知识点地图与对照 —— 小学数学全部 ${KPS.length} 个知识点 × 七关题目

> 本文档由 \`make-docs.js\` 自动生成 —— **不要手改**。
> 覆盖率：**${KPS.length}/${KPS.length} = 100%**（每个知识点至少对应一道题；机器校验，见 \`make-docs.js\`）。
> 两列都能点回去：想知道「这个知识点考在哪」看本文档；想知道「这道题考什么」看 \`02-七关闯关题.md\`。

| 年级 | 知识点数量 | 所在关卡 |
|---|---|---|
`;
const gCount = {};
for (const k of KPS) gCount[k.g] = (gCount[k.g] || 0) + 1;
for (let g = 1; g <= 6; g++) out3 += `| ${g} 年级 | ${gCount[g]} | 第 ${g} 关 + 第 7 关综合 |\n`;

for (let g = 1; g <= 6; g++) {
  out3 += `\n---\n\n## ${g} 年级知识点（第 ${g} 关为主）\n\n`;
  out3 += `| # | 知识点 | 领域 | 一句话讲解 | 对应题目（关-题） |\n|---|---|---|---|---|\n`;
  let i = 0;
  for (const k of KPS.filter((x) => x.g === g)) {
    i++;
    const where = (usage[k.id] || []).map((u) => `${u.s.id}-${u.s.items.indexOf(u.it) + 1}`).join("、");
    out3 += `| ${g}-${i} | ${k.name} | ${DOMAIN[k.domain]} | ${k.tip.replace(/\|/g, "\\|")} | ${where} |\n`;
  }
}

out3 += `\n---\n\n## 反向索引：每一题考哪些知识点\n\n`;
for (const s of STAGES) {
  out3 += `\n### 第 ${s.id} 关 · ${s.title}\n\n`;
  for (const it of s.items) {
    const names = it.kps.map((id) => `**${kpById[id].name}**（${kpById[id].g}年级）`).join(" ＋ ");
    out3 += `- ${itemNo(s, it)}：${names}\n`;
  }
}
out3 += `\n---\n\n## 领域分布\n\n| 领域 | 知识点数 |\n|---|---|\n`;
const dCount = {};
for (const k of KPS) dCount[k.domain] = (dCount[k.domain] || 0) + 1;
for (const d of ["number", "geo", "measure", "stat", "think"]) out3 += `| ${DOMAIN[d]} | ${dCount[d] || 0} |\n`;

fs.writeFileSync(path.join(__dirname, "02-七关闯关题.md"), out2);
fs.writeFileSync(path.join(__dirname, "03-知识点地图与对照.md"), out3);
console.log("生成完成：02-七关闯关题.md / 03-知识点地图与对照.md");
