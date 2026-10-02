// data-questions.js —— 一副骨架（92 个知识点全覆盖）× 7 道难度递进的「一道题」
//
// 设计（2026-10-02 用户澄清后重构）：
//   · 对学生来说永远只有「一道题」：一个故事、一张连续任务卷，(1)…(N) 一步接一步。
//   · 7 道题 = 7 个难度档：知识点完全相同，差异只有两处 ——
//     ① 问法变式（style B：逆向/绕弯；低档全直问，高档变式比例升高）
//     ② 题内连锁密度（低档只有末段链；高档每隔一段就有一个「连锁汇聚」步，
//        其结果又被后续连锁引用 → 上一步结果成为下一步输入，越难链越深）。
//   · 数值刻意不随难度放大：知识点不能漂（一年级的「20 以内加法」放到高档还是它）。
//   · getQuestion(level) 预计算该道题的全部步骤与标准答案（含级联），app 只负责渲染与判分。

const LEVELS = [
  { n: 1, name: "入门",   styleB: 0.0,  midEvery: 0,  midChain: false, note: "直问直答，步与步基本独立，只在末段汇聚成灯塔密码。" },
  { n: 2, name: "熟悉",   styleB: 0.2,  midEvery: 34, midChain: false, note: "两成步骤换成逆向问法；每 34 步出现一次连锁汇聚。" },
  { n: 3, name: "进阶",   styleB: 0.4,  midEvery: 34, midChain: true,  note: "近半步骤逆向；末段连锁引用前面的连锁结果。" },
  { n: 4, name: "熟练",   styleB: 0.55, midEvery: 23, midChain: true,  note: "过半步骤换问法；连锁汇聚开始首尾相接。" },
  { n: 5, name: "挑战",   styleB: 0.7,  midEvery: 12, midChain: true,  note: "七成步骤逆向；每隔十几步就要把前面的结果接进来。" },
  { n: 6, name: "高手",   styleB: 0.85, midEvery: 12, midChain: true,  note: "几乎全部换问法，连锁贯穿全题。" },
  { n: 7, name: "巅峰",   styleB: 1.0,  midEvery: 11, midChain: true,  note: "凡有变式的步骤全部逆向，连锁最密 —— 同样 92 个知识点的最难用法。" },
];

const STORY =
  "你乘小船登上数学岛。岛中央的灯塔熄灭了，七块能量散在岛上。守岛长老说：「这道题会带你走遍整座岛 —— 清点、划地、架桥、铺路、装仓、读图纸，最后点亮灯塔。把每一步算对，结果会在后面用得上；走到最后一步，灯塔密码就出来了。」记住：这是**一道题**，从第 (1) 步一路做到底，中间不需要离开。";

const LEVEL_SUFFIX = (n) =>
  n === 1 ? "（这是第一道题，最直白的走法。）"
  : n === 7 ? "（这是第七道题 —— 同样的知识点，最难的用法。）"
  : `（这是第 ${n} 道题，同一张卷，问法更绕、连锁更多。）`;

function fill(t, p) {
  return t.replace(/\{(\w+)\}/g, (_, k) => (p[k] !== undefined ? p[k] : "{" + k + "}"));
}
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
function fracStr(n, d) { const g = gcd(n, d); return (n / g) + "/" + (d / g); }
function fracVal(n, d) { return n / d; }
function clockAdd(t, add) {
  const [h, m] = t.split(":").map(Number);
  const tot = h * 60 + m + add;
  return String(Math.floor(tot / 60) % 24).padStart(2, "0").replace(/^0/, "") + ":" + String(tot % 60).padStart(2, "0");
}
function clockMinus(t, minus) { return clockAdd(t, -minus); }
function evalExpr(s) { // 仅含数字与 + - * ( )，无用户输入
  return Function('"use strict";return (' + s + ")")();
}
const DATE_DAYS = { 1:31,2:28,3:31,4:30,5:31,6:30,7:31,8:31,9:30,10:31,11:30,12:31 };

// ───────── 步骤类型表 ─────────
// 每类：A(p, t) = 直问；B(p, t) = 变式（没有 B 的类自动回落 A）。
// 返回 { prompt, ans, ansText? }；ans 用于判分（number | string | number[]）。
const STEP_TYPES = {
  add: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.a + p.b }),
    B: (p) => ({ prompt: `两部分一共是 ${p.a + p.b}，其中一部分是 ${p.a}，另一部分是多少？`, ans: p.b }),
  },
  sub: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.a - p.b }),
    B: (p) => ({ prompt: `两数相差 ${p.a - p.b}，大的是 ${p.a}，小的是多少？`, ans: p.b }),
  },
  addList: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.xs.reduce((s, x) => s + x, 0) }),
    B: (p) => {
      const sum = p.xs.reduce((s, x) => s + x, 0);
      return { prompt: `这些数一共是 ${sum}，去掉其中一个 ${p.xs[0]}，剩下的和是多少？`, ans: sum - p.xs[0] };
    },
  },
  mul: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.a * p.b }),
    B: (p) => ({ prompt: `两个因数的积是 ${p.a * p.b}，其中一个因数是 ${p.a}，另一个是多少？`, ans: p.b }),
  },
  mixed: {
    A: (p, t) => ({ prompt: fill(t, p), ans: evalExpr(p.expr) }),
  },
  divExact: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.a / p.b }),
    B: (p) => ({ prompt: `一个数除以 ${p.b} 商是 ${p.a / p.b}，这个数是多少？`, ans: p.a }),
  },
  divRem: {
    A: (p, t) => ({ prompt: fill(t, p), ans: [Math.floor(p.total / p.box), p.total % p.box] }),
  },
  approxHundred: {
    A: (p, t) => ({ prompt: fill(t, p), ans: Math.round(p.n / 100) * 100 }),
  },
  clockAdd: {
    A: (p, t) => ({ prompt: fill(t, p), ans: clockAdd(p.t, p.add) }),
    B: (p) => ({ prompt: `到达时刻是 ${clockAdd(p.t, p.add)}，路上走了 ${p.add} 分钟，出发时刻是？`, ans: p.t }),
  },
  clockMinus: {
    A: (p, t) => ({ prompt: fill(t, p), ans: clockMinus(p.t, p.minus) }),
    B: (p) => ({ prompt: `石门 ${p.t} 开启，你是在 ${clockMinus(p.t, p.minus)} 到达的 —— 那么石门开启的时刻是？`, ans: p.t }),
  },
  seqNext: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.start + p.step * p.count }),
  },
  seqItem: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.start + p.step * (p.k - 1) }),
  },
  ordinal: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.pos - 1 }),
    B: (p) => ({ prompt: `队伍里你前面有 ${p.pos - 1} 个人，你排第几？`, ans: p.pos }),
  },
  moneySum: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.parts.reduce((s, x) => s + x, 0) }),
    B: (p) => {
      const sum = p.parts.reduce((s, x) => s + x, 0);
      return { prompt: `钱包里一共 ${sum} 元，其中一张是 ${p.parts[0]} 元，其余合起来是多少元？`, ans: sum - p.parts[0] };
    },
  },
  unitMass: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.a + p.b * (p.bu === "kg" || p.bu === "t" ? 1000 : 1) }),
    B: (p) => {
      const total = p.a + p.b * (p.bu === "kg" || p.bu === "t" ? 1000 : 1);
      return { prompt: `两样东西一共 ${total} 克，其中一样是 ${p.a} 克，另一样是多少克？`, ans: total - p.a };
    },
  },
  place: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.place }),
  },
  fracSimple: {
    A: (p, t) => ({ prompt: fill(t, p), ans: `${p.whole - p.taken}/${p.whole}` }),
    B: (p) => ({ prompt: `还剩下 ${p.whole - p.taken}/${p.whole}，一共 ${p.whole} 份，吃掉了几份？`, ans: p.taken }),
  },
  fracAdd: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.op === "+" ? fracStr(p.n1 * p.d2 + p.n2 * p.d1, p.d1 * p.d2) : fracStr(p.n1 * p.d2 - p.n2 * p.d1, p.d1 * p.d2) }),
    B: (p) => ({ prompt: `两个分数相减：${p.n2}/${p.d2} − ${p.n1}/${p.d1} ＝ ？`, ans: fracStr(p.n2 * p.d1 - p.n1 * p.d2, p.d2 * p.d1) }),
  },
  fracSimplify: {
    A: (p, t) => ({ prompt: fill(t, p), ans: fracStr(p.n, p.d) }),
    B: (p) => ({ prompt: `把 ${fracStr(p.n, p.d)} 的分子分母同时乘 ${p.k}，得到多少？（不必约分）`, ans: `${p.n * p.k}/${p.d * p.k}` }),
  },
  fracMulRemain: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.total * (1 - p.num / p.den) }),
    B: (p) => ({ prompt: `一共 ${p.total} 米，用去了 ${p.total * p.num / p.den} 米，用去的部分占全长的几分之几？`, ans: `${p.num}/${p.den}` }),
  },
  fracDiv: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (p.part * p.den) / p.num }),
  },
  rectPeri: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (p.a + p.b) * 2 }),
    B: (p) => ({ prompt: `长方形周长是 ${(p.a + p.b) * 2}，宽是 ${p.b}，长是多少？`, ans: p.a }),
  },
  triArea: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (p.base * p.h) / 2 }),
    B: (p) => ({ prompt: `三角形面积是 ${(p.base * p.h) / 2}，高是 ${p.h}，底是多少？`, ans: p.base }),
  },
  trapArea: {
    A: (p, t) => ({ prompt: fill(t, p), ans: ((p.a + p.b) * p.h) / 2 }),
  },
  paraArea: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.base * p.h }),
    B: (p) => ({ prompt: `平行四边形面积是 ${p.base * p.h}，底是 ${p.base}，高是多少？`, ans: p.h }),
  },
  boxVol: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.l * p.w * p.h }),
    B: (p) => ({ prompt: `长方体体积是 ${p.l * p.w * p.h}，长 ${p.l} 宽 ${p.w}，高是多少？`, ans: p.h }),
  },
  avgList: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.xs.reduce((s, x) => s + x, 0) / p.xs.length }),
    B: (p) => ({ prompt: `平均每天 ${p.xs.reduce((s, x) => s + x, 0) / p.xs.length}，一共 ${p.xs.length} 天，总共多少？`, ans: p.xs.reduce((s, x) => s + x, 0) }),
  },
  gcdStep: {
    A: (p, t) => ({ prompt: fill(t, p), ans: gcd(p.a, p.b) }),
  },
  primeStep: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.value }),
  },
  setUnion: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.a + p.b - p.both }),
    B: (p) => ({ prompt: `两组一共 ${p.a + p.b - p.both} 人，B 组 ${p.b} 人，两组都参加的 ${p.both} 人 —— A 组几人？`, ans: p.a }),
  },
  statLabel: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.labels[p.data.indexOf(Math.max(...p.data))] }),
    B: (p) => ({ prompt: `记录是 ${p.labels.map((l, i) => l + " " + p.data[i]).join("、")}，最少的是哪一天？`, ans: p.labels[p.data.indexOf(Math.min(...p.data))] }),
  },
  cfr: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.ask === "chicken" ? (p.legs / 2 - p.heads) : p.heads - (p.legs / 2 - p.heads) }),
    B: (p) => ({ prompt: `笼子里鸡兔共 ${p.heads} 只、共 ${p.legs} 只脚，兔有几只？`, ans: p.ask === "chicken" ? p.heads - (p.legs / 2 - p.heads) : p.legs / 2 - p.heads }),
  },
  complement: {
    A: (p, t) => ({ prompt: fill(t, p), ans: 90 - p.angle }),
    B: (p) => ({ prompt: `一个角的余角是 ${90 - p.angle}°，这个角是多少度？`, ans: p.angle }),
  },
  constStep: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.value }),
  },
  dateDays: {
    A: (p, t) => ({ prompt: fill(t, p), ans: DATE_DAYS[p.month] }),
  },
  roundWan: {
    A: (p, t) => ({ prompt: fill(t, p), ans: `${Math.round(p.n / 10000)}万` }),
  },
  lawMul: {
    A: (p, t) => ({ prompt: fill(t, p), ans: evalExpr(p.expr) }),
  },
  decMul: {
    A: (p, t) => ({ prompt: fill(t, p), ans: +(p.price * p.qty).toFixed(2) }),
    B: (p) => ({ prompt: `一共花了 ${(p.price * p.qty).toFixed(2)} 元，买了 ${p.qty} 箱，每箱多少元？`, ans: p.price }),
  },
  decDiv: {
    A: (p, t) => ({ prompt: fill(t, p), ans: +(p.a / p.b).toFixed(6) }),
    B: (p) => ({ prompt: `一个数除以 ${p.b} 等于 ${(p.a / p.b).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}，这个数是多少？`, ans: p.a }),
  },
  decSub: {
    A: (p, t) => ({ prompt: fill(t, p), ans: +(p.a - p.b).toFixed(2) }),
    B: (p) => ({ prompt: `用去一部分后还剩 ${(p.a - p.b).toFixed(2)}，用去了 ${p.b}，原来有多少？`, ans: p.a }),
  },
  eqLinear: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (p.c - p.b) / p.a }),
  },
  plant: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.len / p.gap + 1 }),
    B: (p) => ({ prompt: `两端都栽，一共栽了 ${p.len / p.gap + 1} 棵树，每两棵之间 ${p.gap} 米 —— 路长多少米？`, ans: p.len }),
  },
  clockDeg: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (p.to - p.from) * 30 }),
    B: (p) => ({ prompt: `时针从 ${p.from} 起转了 ${(p.to - p.from) * 30}°，这时是几时？`, ans: p.to }),
  },
  weighFind: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.value }),
  },
  probStep: {
    A: (p, t) => ({ prompt: fill(t, p), ans: fracStr(p.r, p.r + p.b) }),
    B: (p) => ({ prompt: `摸到红球的可能性是 ${fracStr(p.r, p.r + p.b)}，红球有 ${p.r} 个，一共有多少个球？`, ans: p.r + p.b }),
  },
  discount: {
    A: (p, t) => ({ prompt: fill(t, p), ans: +(p.price * p.rate).toFixed(2) }),
    B: (p) => ({ prompt: `打${p.rate * 10}折后的价格是 ${(p.price * p.rate).toFixed(2)} 元，原价是多少元？`, ans: p.price }),
  },
  circleArea: {
    A: (p, t) => ({ prompt: fill(t, p), ans: +(3.14 * p.r * p.r).toFixed(2) }),
    B: (p) => ({ prompt: `一个圆的周长是 ${(2 * 3.14 * p.r).toFixed(2)} 米（π 取 3.14），它的面积是多少平方米？`, ans: +(3.14 * p.r * p.r).toFixed(2) }),
  },
  scaleStep: {
    A: (p, t) => ({ prompt: fill(t, p), ans: +((p.cm * p.ratio) / 100).toFixed(6) }),
    B: (p) => ({ prompt: `比例尺 1:${p.ratio}，实际距离 ${((p.cm * p.ratio) / 100).toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} 米，图上几厘米？`, ans: p.cm }),
  },
  coneVol: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (p.base * p.h) / 3 }),
    B: (p) => ({ prompt: `圆锥体积是 ${(p.base * p.h) / 3}，底面积 ${p.base}，高是多少？`, ans: p.h }),
  },
  tempDiff: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.a - p.b }),
    B: (p) => ({ prompt: `山脚 ${p.a}°C，比山顶高 ${p.a - p.b}°C，山顶是多少度？`, ans: p.b }),
  },
  fanAngle: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (360 * p.pct) / 100 }),
    B: (p) => ({ prompt: `扇形统计图里一个扇形的圆心角是 ${(360 * p.pct) / 100}°，它占整体的百分之几？`, ans: p.pct }),
  },
  ratioSplit: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (p.total * (p.part === "larger" ? Math.max(...p.r) : Math.min(...p.r))) / (p.r[0] + p.r[1]) }),
    B: (p) => ({ prompt: `把 ${p.total} 按 ${p.r[0]}:${p.r[1]} 分成两份，较少的那一份是多少？`, ans: (p.total * Math.min(...p.r)) / (p.r[0] + p.r[1]) }),
  },
  solveProp: {
    A: (p, t) => ({ prompt: fill(t, p), ans: (p.x0 * p.u1) / p.u2 }),
    B: (p) => ({ prompt: `解比例：${p.x0} : x ＝ ${p.u2} : ${p.u1}，x ＝ ？`, ans: (p.x0 * p.u1) / p.u2 }),
  },
  npSum: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.xs.reduce((s, x) => s + x, 0) }),
    B: (p) => {
      const xs = p.xs.slice();
      const step = xs.length > 1 ? xs[xs.length - 1] - xs[xs.length - 2] : 2;
      xs.push(xs[xs.length - 1] + step);
      return { prompt: `按同样规律继续：${xs.join("＋")} ＝ ？`, ans: xs.reduce((s, x) => s + x, 0) };
    },
  },
  cylVol: {
    A: (p, t) => ({ prompt: fill(t, p), ans: +(3.14 * p.r * p.r * p.h).toFixed(2) }),
    B: (p) => ({ prompt: `圆柱体积是 ${(3.14 * p.r * p.r * p.h).toFixed(2)}，半径 ${p.r}（π 取 3.14），高是多少？`, ans: p.h }),
  },
  pctDecimal: {
    A: (p, t) => ({ prompt: fill(t, p), ans: +(p.pct / 100).toFixed(6) }),
    B: (p) => ({ prompt: `${p.dec} 写成百分数是多少？（直接写百分数前的数，如 40% 写 40）`, ans: p.pct }),
  },
  permCount: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.digits * (p.digits - 1) }),
  },
  mc: {
    A: (p, t) => ({ prompt: fill(t, p), ans: p.correct, ansText: p.options[p.correct] }),
  },
  // —— 连锁 / 汇聚类（由 getQuestion 组装时赋 refs，答案级联预计算）——
  gatherSum: { A: null, B: null },   // refs 求和
  pctOf:    { A: null, B: null },   // refs[0] × pct%
  ratioOf:  { A: null, B: null },   // refs[0] 按比取份
  refDiv:   { A: null, B: null },   // refs[0] ÷ 除数
  refAdd:   { A: null, B: null },   // refs 相加（两个引用）
};

// ───────── 一副骨架：99 个基础步（覆盖全部 92 个知识点）─────────
// 字段：id / type / kp(知识点) / p(参数) / t(直问题面，{占位}会被p填充) / useRef(引用前面步骤的答案)
const BASE_STEPS = [
  { id: "k01", type: "add", kp: ["g1_add20"], p: { a: 8, b: 5 }, t: "你背包里有 {a} 瓶水和 {b} 块面包，一共多少件？" },
  { id: "k02", type: "sub", kp: ["g1_compare"], p: { a: 9, b: 6 }, t: "码头上的绳子长 {a} 米，木板长 {b} 米。绳子比木板长几米？" },
  { id: "k03", type: "ordinal", kp: ["g1_count"], p: { pos: 7 }, t: "队伍里你排第 {pos}，你前面有几个人？" },
  { id: "k04", type: "clockMinus", kp: ["g1_clock"], p: { t: "7:30", minus: 30 }, t: "石门在 {t} 开启，你提前 {minus} 分钟到达。你是几点到的？（写成 7:00 这样的形式）" },
  { id: "k05", type: "seqNext", kp: ["g1_pattern"], p: { start: 2, step: 2, count: 4 }, t: "地砖花纹按 2、4、6、8 排列，下一块应该是几？" },
  { id: "k06", type: "moneySum", kp: ["g1_money", "g1_add100a"], p: { parts: [10, 5, 1, 1, 1] }, t: "钱包里有 1 张 10 元、1 张 5 元、3 枚 1 元硬币，一共几元？" },
  { id: "k07", type: "add", kp: ["g1_add100b"], p: { a: 12, b: 9 }, t: "上层放了 {a} 个罐头，下层放了 {b} 个，一共几个？" },
  { id: "k08", type: "mc", kp: ["g1_solid"], p: { correct: 1, options: ["皮球（球体）", "骰子（六个面都是同样大的正方形）", "易拉罐（上下一样粗的圆柱）", "长长的大纸箱"] }, t: "哪一个是正方体？" },
  { id: "k09", type: "mc", kp: ["g1_plane"], p: { correct: 2, options: ["三角尺的面", "硬币的面（圆）", "课本的封面", "红领巾的面"] }, t: "哪一个是长方形？" },
  { id: "k10", type: "place", kp: ["g1_num100"], p: { place: "十" }, t: "数字 35 中的 3 在哪一位？（写「十」或「十位」）" },
  { id: "k11", type: "add", kp: ["g1_class"], p: { a: 3, b: 4 }, t: "数一数：▲▲▲●●●● 一共有几个图形？" },
  { id: "k12", type: "mc", kp: ["g1_pos"], p: { correct: 1, options: ["上面", "下面", "左面", "前面"] }, t: "书放在书架上层，盒子放在下层。盒子在书的哪一面？" },
  { id: "k13", type: "sub", kp: ["g1_stat1"], p: { a: 5, b: 3 }, t: "石头堆里有 3 个 ▲ 和 5 个 ●，● 比 ▲ 多几个？" },
  { id: "k14", type: "add", kp: ["g1_add10"], p: { a: 6, b: 4 }, t: "口袋里有 {a} 颗糖，又放进去 {b} 颗，现在一共几颗？" },
  { id: "k15", type: "add", kp: ["g1_add5"], p: { a: 4, b: 1 }, t: "石门上镶着 {a} 颗宝石，再镶上 {b} 颗，一共几颗？" },
  { id: "k16", type: "seqItem", kp: ["g1_teen"], p: { start: 11, step: 1, k: 4 }, t: "石板上刻着 11 到 20 的数，其中第 4 个数是几？" },
  { id: "k17", type: "divRem", kp: ["g2_remainder", "g2_div"], p: { total: 65, box: 8 }, t: "{total} 个包裹每箱装 {box} 个。需要几个箱子？还剩几个？（依次填两个数）" },
  { id: "k18", type: "mul", kp: ["g2_mul", "g2_length"], p: { a: 3, b: 7 }, t: "{a} 块木板，每块长 {b} 分米，接起来一共多少分米？" },
  { id: "k19", type: "mul", kp: ["g2_mul"], p: { a: 6, b: 4 }, t: "绳子每米 {b} 元，买 {a} 米一共花多少元？" },
  { id: "k20", type: "mixed", kp: ["g2_mixed"], p: { expr: "5*7-9" }, t: "5 × 7 − 9 ＝ ？" },
  { id: "k21", type: "unitMass", kp: ["g2_mass"], p: { a: 300, b: 2, bu: "kg" }, t: "300 克盐和 2 千克糖混在一起，一共有多少克？" },
  { id: "k22", type: "mc", kp: ["g2_angle"], p: { correct: 1, options: ["像方桌角一样的直角", "比直角小、尖尖的角", "比直角大、懒懒张开的角", "平平的一条线"] }, t: "哪一个是锐角？" },
  { id: "k23", type: "mc", kp: ["g2_observe"], p: { correct: 1, options: ["两个上下叠着的正方形侧面", "大正方形中间套着一个小正方形", "一个三角形", "一个圆"] }, t: "下面是一个两层积木（下层大方块、上层小方块居中）。从正上方往下看，看到的形状是？" },
  { id: "k24", type: "addList", kp: ["g2_stat2", "g2_add100"], p: { xs: [5, 8, 6, 9] }, t: "四天摘果记录是 5、8、6、9 个，四天一共摘了多少个？" },
  { id: "k25", type: "place", kp: ["g2_wan"], p: { place: "百" }, t: "图书馆有 2045 本书。2045 中的 4 在哪一位？（写「百」或「百位」）" },
  { id: "k26", type: "mc", kp: ["g2_combo"], p: { correct: 2, options: ["3 种", "5 种", "6 种", "9 种"] }, t: "3 件上衣和 2 条裤子，一件上衣配一条裤子，共有几种穿法？" },
  { id: "k27", type: "approxHundred", kp: ["g2_addsub_wan"], p: { n: 498 }, t: "估算：{n} 最接近哪个整百数？" },
  { id: "k28", type: "mul", kp: ["g3_mul3"], p: { a: 6, b: 248 }, t: "每船装 {b} 千克货物，{a} 船一共多少千克？" },
  { id: "k29", type: "divExact", kp: ["g3_div3", "g3_div3b"], p: { a: 1488, b: 8 }, t: "{a} 袋粮食平均分给 {b} 个仓库，每个仓库分多少袋？" },
  { id: "k30", type: "clockAdd", kp: ["g3_time"], p: { t: "8:15", add: 45 }, t: "{t} 出发，{add} 分钟后到达。到达时刻是？（写成 9:00 这样的形式）" },
  { id: "k31", type: "unitMass", kp: ["g3_measure"], p: { a: 500, b: 3, bu: "t" }, t: "3 吨石料和 500 千克沙子，一共多少千克？" },
  { id: "k32", type: "fracSimple", kp: ["g3_frac1"], p: { whole: 8, taken: 3 }, t: "蛋糕平均切成 {whole} 份，吃了 {taken} 份，还剩几分之几？" },
  { id: "k33", type: "rectPeri", kp: ["g3_peri"], p: { a: 12, b: 5 }, t: "长方形地基长 {a} 米、宽 {b} 米，周长是多少米？" },
  { id: "k34", type: "mul", kp: ["g3_times"], p: { a: 59, b: 4 }, t: "货物数量是 {a} 箱的 {b} 倍，一共多少箱？" },
  { id: "k35", type: "mc", kp: ["g3_dir"], p: { correct: 3, options: ["东", "南", "西", "北"] }, t: "你面对着太阳（东方），此时你的左边是哪个方向？" },
  { id: "k36", type: "setUnion", kp: ["g3_set"], p: { a: 12, b: 15, both: 8 }, t: "A 组 {a} 人、B 组 {b} 人，其中 {both} 人两组都参加。一共有多少人？" },
  { id: "k37", type: "statLabel", kp: ["g3_bar1"], p: { labels: ["周一", "周二", "周三", "周四"], data: [5, 7, 6, 9] }, t: "一周摘果：周一 5、周二 7、周三 6、周四 9（个）。哪一天最多？（写「周四」）" },
  { id: "k38", type: "mul", kp: ["g3_2x2"], p: { a: 14, b: 23 }, t: "每车装 {b} 袋，{a} 车一共多少袋？" },
  { id: "k39", type: "paraArea", kp: ["g3_area", "g3_areaRect"], p: { base: 6, h: 4 }, t: "木板长 {base} 分米、宽 {h} 分米，面积是多少平方分米？" },
  { id: "k40", type: "dateDays", kp: ["g3_date"], p: { month: 7 }, t: "7 月一共有多少天？" },
  { id: "k41", type: "constStep", kp: ["g3_dec1"], p: { value: 2.5 }, t: "一支笔 2 元 5 角，写成小数是多少元？" },
  { id: "k42", type: "mc", kp: ["g3_2stat"], p: { correct: 1, options: ["只记录一组数据", "把两组数据合在一张表里，方便对比", "让表格更好看", "可以不用写数字"] }, t: "复式统计表的好处是？" },
  { id: "k43", type: "permCount", kp: ["g3_combo2"], p: { digits: 3 }, t: "用数字 1、2、3 各用一次，能组成多少个不同的两位数？" },
  { id: "k44", type: "sub", kp: ["g3_addsub"], p: { a: 1245, b: 678 }, t: "工地上有 {a} 块砖，运走 {b} 块，还剩多少块？" },
  { id: "k45", type: "roundWan", kp: ["g4_big"], p: { n: 3054000 }, t: "一座城市有 {n} 人，四舍五入改写成以「万」为单位是多少万？（写成 305万 这样的形式）" },
  { id: "k46", type: "mul", kp: ["g4_mul4"], p: { a: 235, b: 46 }, t: "{a} × {b} ＝ ？" },
  { id: "k47", type: "divExact", kp: ["g4_div4"], p: { b: 94 }, useRef: { field: "a", from: "k46" }, t: "{a} ÷ {b} ＝ ？" },
  { id: "k48", type: "decSub", kp: ["g4_decadd"], p: { a: 12.5, b: 3.75 }, t: "沥青原有 {a} 千克，用去 {b} 千克，还剩多少千克？" },
  { id: "k49", type: "lawMul", kp: ["g4_law"], p: { expr: "25*37*4" }, t: "用简便方法计算：25 × 37 × 4 ＝ ？" },
  { id: "k50", type: "cfr", kp: ["g4_cfr"], p: { heads: 20, legs: 56, ask: "chicken" }, t: "笼子里鸡和兔共 {heads} 只，共有 {legs} 只脚。鸡有几只？" },
];

BASE_STEPS.push(
  { id: "k51", type: "complement", kp: ["g4_angle4"], p: { angle: 35 }, t: "∠1 ＝ {angle}°，它的余角是多少度？（余角：两个角加起来正好 90°）" },
  { id: "k52", type: "mc", kp: ["g4_para"], p: { correct: 1, options: ["四条边都相等、四个角都是直角", "两组对边分别平行，容易变形", "只有一组对边平行", "没有直的边"] }, t: "关于平行四边形，哪句话是对的？" },
  { id: "k53", type: "mul", kp: ["g4_land"], p: { a: 100, b: 100 }, t: "边长 100 米的正方形土地，面积是多少平方米？（它正好是 1 公顷）" },
  { id: "k54", type: "mc", kp: ["g4_sym"], p: { correct: 1, options: ["一般形状的平行四边形", "等腰三角形", "数字 5", "闪电形状"] }, t: "哪一个是轴对称图形？" },
  { id: "k55", type: "avgList", kp: ["g4_avg"], p: { xs: [30, 40, 50, 60] }, t: "四天修路 30、40、50、60 米，平均每天修多少米？" },
  { id: "k56", type: "mc", kp: ["g4_opt"], p: { correct: 1, options: ["2 分钟", "3 分钟", "4 分钟", "6 分钟"] }, t: "烙饼：每次锅里最多放 2 张，每张要烙两面，每面 1 分钟。3 张饼最快几分钟烙熟？" },
  { id: "k57", type: "mul", kp: ["g4_bar2"], p: { a: 6, b: 5 }, t: "条形统计图中一格代表 {b} 吨，一共画了 {a} 格，表示多少吨？" },
  { id: "k58", type: "mc", kp: ["g4_code"], p: { correct: 0, options: ["三楼第 5 本", "三楼第 5 排", "五楼第 3 本", "第 35 本"] }, t: "书店编号规则是「K-楼层-序号」。编号 K-3-005 表示？" },
  { id: "k59", type: "mc", kp: ["g4_dec"], p: { correct: 0, options: ["三点零五零", "三点五零", "三点零五十", "三零五零"] }, t: "3.050 应该读作？" },
  { id: "k60", type: "constStep", kp: ["g4_tri"], p: { value: 180 }, t: "三角形的内角和是多少度？" },
  { id: "k61", type: "decMul", kp: ["g5_muldec"], p: { price: 45.6, qty: 250 }, t: "每箱 {price} 元，买 {qty} 箱一共多少元？" },
  { id: "k62", type: "decDiv", kp: ["g5_divdec"], p: { a: 73.6, b: 16 }, t: "{a} ÷ {b} ＝ ？" },
  { id: "k63", type: "eqLinear", kp: ["g5_eq"], p: { a: 3, b: 45, c: 180 }, t: "解方程：{a}x ＋ {b} ＝ {c}，x ＝ ？" },
  { id: "k64", type: "triArea", kp: ["g5_multiArea"], p: { base: 24, h: 15 }, t: "三角形菜地：底 {base} 米、高 {h} 米，面积是多少平方米？" },
  { id: "k65", type: "trapArea", kp: ["g5_multiArea"], p: { a: 8, b: 14, h: 6 }, t: "梯形屋顶：上底 {a} 米、下底 {b} 米、高 {h} 米，面积是多少平方米？" },
  { id: "k66", type: "paraArea", kp: ["g5_multiArea"], p: { base: 12, h: 5 }, t: "平行四边形货台：底 {base} 米、高 {h} 米，面积是多少平方米？" },
  { id: "k67", type: "gcdStep", kp: ["g5_factor", "g5_gcd"], p: { a: 24, b: 36 }, t: "{a} 和 {b} 的最大公因数是几？" },
  { id: "k68", type: "primeStep", kp: ["g5_prime"], p: { value: 97 }, t: "100 以内最大的质数是几？" },
  { id: "k69", type: "fracAdd", kp: ["g5_fracadd"], p: { n1: 3, d1: 4, n2: 5, d2: 6, op: "+" }, t: "3/4 ＋ 5/6 ＝ ？（写成 19/12 或 1又7/12 都可以）" },
  { id: "k70", type: "boxVol", kp: ["g5_vol"], p: { l: 6, w: 4, h: 3 }, t: "长方体仓库长 {l} 米、宽 {w} 米、高 {h} 米，体积是多少立方米？" },
  { id: "k71", type: "probStep", kp: ["g5_prob"], p: { r: 3, b: 2 }, t: "袋子里 {r} 个红球、{b} 个蓝球，摸到红球的可能性是几分之几？" },
  { id: "k72", type: "plant", kp: ["g5_plant"], p: { len: 100, gap: 5 }, t: "一条路长 {len} 米，每隔 {gap} 米栽一棵树（两端都栽），一共栽几棵？" },
  { id: "k73", type: "clockDeg", kp: ["g5_rot"], p: { from: 3, to: 6 }, t: "时针从 {from} 走到 {to}，转了多少度？" },
  { id: "k74", type: "weighFind", kp: ["g5_find"], p: { value: 2 }, t: "8 个零件中有 1 个较轻的次品，用天平至少称几次能保证找出？" },
  { id: "k75", type: "fracSimplify", kp: ["g5_fracprop"], p: { n: 18, d: 24, k: 2 }, t: "把 18/24 约分到最简是多少？" },
  { id: "k76", type: "mc", kp: ["g5_line"], p: { correct: 2, options: ["统计表", "条形统计图", "折线统计图", "扇形统计图"] }, t: "想看清一个星期内气温的升降变化，选哪种统计图最合适？" },
  { id: "k77", type: "fracMulRemain", kp: ["g6_fracmul"], p: { total: 318, num: 2, den: 3 }, t: "{total} 米绳子用去了 {num}/{den}，还剩多少米？" },
  { id: "k78", type: "fracDiv", kp: ["g6_fracdiv"], p: { part: 250, num: 5, den: 6 }, t: "某长度的 {num}/{den} 正好是 {part} 米，这个长度是多少米？" },
  { id: "k79", type: "discount", kp: ["g6_pctapp"], p: { price: 300, rate: 0.8 }, t: "原价 {price} 元的灯打八折，折后价是多少元？" },
  { id: "k80", type: "circleArea", kp: ["g6_circle"], p: { r: 5 }, t: "圆形花坛直径 10 米，面积是多少平方米？（π 取 3.14）" },
  { id: "k81", type: "scaleStep", kp: ["g6_scale"], p: { cm: 5, ratio: 1000 }, t: "比例尺是 1:{ratio}，图上 {cm} 厘米代表实际多少米？" },
  { id: "k82", type: "coneVol", kp: ["g6_cyl"], p: { base: 24, h: 9 }, t: "圆锥形沙堆底面积 {base} 平方米、高 {h} 米，体积是多少立方米？" },
  { id: "k83", type: "tempDiff", kp: ["g6_neg"], p: { a: 5, b: -3 }, t: "山脚气温 {a}°C，山顶气温 {b}°C。山顶比山脚低多少度？" },
  { id: "k84", type: "fanAngle", kp: ["g6_fan"], p: { pct: 25 }, t: "扇形统计图中占 {pct}% 的那一块，圆心角是多少度？" },
  { id: "k85", type: "ratioSplit", kp: ["g6_ratio"], p: { total: 120, r: [2, 3], part: "larger" }, t: "把 {total} 按 {r0}:{r1} 分给两组，较多的那一份是多少？" },
  { id: "k86", type: "solveProp", kp: ["g6_prop"], p: { x0: 4, u1: 6, u2: 3 }, t: "解比例：x : {u1} ＝ {x0} : {u2}，x ＝ ？" },
  { id: "k87", type: "mc", kp: ["g6_prop"], p: { correct: 1, options: ["人的年龄与身高", "正方形的周长与边长", "圆的面积与半径", "袋中球数与球的颜色"] }, t: "下面哪一组量成正比例关系？" },
  { id: "k88", type: "npSum", kp: ["g6_np"], p: { xs: [1, 3, 5, 7] }, t: "看规律：1＝1²，1＋3＝2²，1＋3＋5＝3²，那么 1＋3＋5＋7 ＝ ？" },
  { id: "k89", type: "cylVol", kp: ["g6_cyl"], p: { r: 2, h: 5 }, t: "圆柱水塔底面半径 {r} 米、高 {h} 米，体积是多少立方米？（π 取 3.14）" },
  { id: "k90", type: "pctDecimal", kp: ["g6_pct"], p: { pct: 25, dec: 0.4 }, t: "{pct}% 写成小数是多少？" },
  // —— 末段：连锁收束（refs 由 getQuestion 组装，答案级联预计算）——
  { id: "k91", type: "gatherSum", kp: ["g3_addsub"], refs: ["k07", "k24", "k44", "k55", "k70", "k72"], tail: true },
  { id: "k92", type: "pctOf", kp: ["g6_pct"], refs: ["k91"], p: { pct: 25 }, tail: true },
  { id: "k93", type: "ratioOf", kp: ["g6_ratio"], refs: ["k91"], p: { r: [1, 3] }, tail: true },
  { id: "k94", type: "refDiv", kp: ["g4_div4"], refs: ["k91"], p: { divisor: 4 }, tail: true },
  { id: "k95", type: "circleArea", kp: ["g6_circle"], p: { r: 4 }, t: "灯塔底座是半径 4 米的圆，面积是多少平方米？（π 取 3.14）", tail: true },
  { id: "k96", type: "npSum", kp: ["g6_np"], p: { xs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, t: "1 ＋ 2 ＋ 3 ＋ … ＋ 10 ＝ ？", tail: true },
  { id: "k97", type: "refDiv", kp: ["g5_divdec"], refs: ["k91"], p: { divisor: 2 }, tail: true },
  { id: "k98", type: "refAdd", kp: ["g3_addsub"], refs: ["k92", "k94"], tail: true },
  { id: "k99", type: "gatherSum", kp: ["g4_law"], refs: ["k91", "k92", "k93", "k94", "k95", "k96", "k97", "k98"], tail: true, isFinal: true }
);

// r0/r1 占位符支持（ratioSplit 的题面要写 2:3）
const _origFill = fill;
function fillWithRatio(t, p) {
  let s = _origFill(t, p);
  if (p.r && Array.isArray(p.r)) s = s.replace(/\{r0\}/g, p.r[0]).replace(/\{r1\}/g, p.r[1]);
  return s;
}

// ───────── preflight：组装第 level 道题 ─────────
function getQuestion(level) {
  const cfg = LEVELS[level - 1];
  const ansById = {};
  const planById = {};

  // 1) 99 个基础步：按档位选问法 → 级联算标准答案
  const basePlan = [];
  BASE_STEPS.forEach((s, i) => {
    const type = STEP_TYPES[s.type];
    const useB = !!(cfg.styleB > 0 && type.B && ((i * 37 + level * 17) % 100) < cfg.styleB * 100);
    const p = Object.assign({}, s.p);
    if (s.useRef) p[s.useRef.field] = ansById[s.useRef.from];
    let r;
    if (s.refs) {
      r = chainAnswer(s, s.refs.map((id) => ansById[id]), p);
    } else {
      r = (useB ? type.B : type.A)(p, s.t);
      if (!useB && s.t && s.t.includes("{r0}")) r.prompt = fillWithRatio(s.t, p);
    }
    ansById[s.id] = r.ans;
    planById[s.id] = { s, useB, prompt: r.prompt, ans: r.ans, ansText: r.ansText };
    basePlan.push(planById[s.id]);
  });

  // 2) 中段连锁（难度越高越密；midChain 时末段连锁要接上最后一个中段连锁）
  const mids = [];
  if (cfg.midEvery > 0) {
    for (let stop = cfg.midEvery; stop <= 90; stop += cfg.midEvery) {
      const slice = basePlan.slice(Math.max(0, stop - 6), stop);
      let refs = slice.map((x) => x.s.id).filter((id) => typeof ansById[id] === "number" && isFinite(ansById[id]));
      if (refs.length < 4) continue;
      if (cfg.midChain && mids.length) refs = refs.concat([mids[mids.length - 1].id]);
      const id = "mid" + (mids.length + 1) + "@" + level;
      const val = Math.round((refs.reduce((s, rid) => s + ansById[rid], 0) + Number.EPSILON) * 1e4) / 1e4;
      ansById[id] = val;
      mids.push({ id, refs, ans: val, stopIndex: stop - 1 });
    }
  }

  // 2b) midChain：k91 的引用追加最后一个中段连锁，并把末段（k91..k99）的答案全部级联重算
  if (cfg.midChain && mids.length) {
    const lastMid = mids[mids.length - 1].id;
    const k91 = planById["k91"];
    k91.s = Object.assign({}, k91.s, { refs: k91.s.refs.concat([lastMid]) });
    ["k91", "k92", "k93", "k94", "k95", "k96", "k97", "k98", "k99"].forEach((id) => {
      const pl = planById[id];
      const p = Object.assign({}, pl.s.p);
      const r = pl.s.refs
        ? chainAnswer(pl.s, pl.s.refs.map((rid) => ansById[rid]), p)
        : (pl.useB ? STEP_TYPES[pl.s.type].B : STEP_TYPES[pl.s.type].A)(p, pl.s.t);
      ansById[id] = r.ans;
      pl.ans = r.ans;
      if (!pl.s.refs) pl.prompt = r.prompt;
      else pl.prompt = ""; // 连锁步题面在编号后拼
    });
  }

  // 3) 排版：正文步按序、中段连锁插在对应位置之后、末段收尾
  const midByAfter = {};
  mids.forEach((m) => { (midByAfter[m.stopIndex] = midByAfter[m.stopIndex] || []).push(m); });
  const ordered = [];
  basePlan.filter((bp) => !bp.s.tail).forEach((bp, i) => {
    ordered.push({ bp });
    (midByAfter[i] || []).forEach((m) => ordered.push({ mid: m }));
  });
  basePlan.filter((bp) => bp.s.tail).forEach((bp) => ordered.push({ bp }));

  // 4) 编号
  let no = 0;
  const noById = {};
  ordered.forEach((o) => { no += 1; noById[o.mid ? o.mid.id : o.bp.s.id] = no; });
  const numOf = (id) => noById[id];

  // 5) 拼连锁步题面（需要编号），产出最终步骤列表
  const fmtRefs = (refs) => refs.map((r) => "(" + numOf(r) + ")").join("、");
  const steps = ordered.map((o) => {
    if (o.mid) {
      const m = o.mid;
      return {
        id: m.id, no: numOf(m.id), kind: "chain", kp: ["g2_mixed"],
        prompt: `连锁汇聚：把第 ${fmtRefs(m.refs)} 步的结果全部加起来，写在这里（后面会用到）。`,
        ans: m.ans, ansText: String(m.ans), refs: m.refs.slice(), styleB: false, isFinal: false,
      };
    }
    const pl = o.bp;
    const s = pl.s;
    let prompt = pl.prompt;
    if (s.refs) {
      if (s.id === "k91") {
        const extra = "";
        prompt = `总能量启动：把第 ${fmtRefs(s.refs)} 步的结果${extra}全部相加 —— 这个数后面一路要用。`;
      } else if (s.id === "k92") prompt = `总能量（第 (${numOf("k91")}) 步）的 ${s.p.pct}% 是多少？`;
      else if (s.id === "k93") prompt = `把总能量（第 (${numOf("k91")}) 步）按 1:3 分给外环与内环，较多的那一份是多少？`;
      else if (s.id === "k94") prompt = `4 趟搬完了总能量（第 (${numOf("k91")}) 步）那么多的砖，每趟搬多少？`;
      else if (s.id === "k97") prompt = `总能量（第 (${numOf("k91")}) 步）由两队平摊，每队分到多少？`;
      else if (s.id === "k98") prompt = `把第 (${numOf("k92")}) 步与第 (${numOf("k94")}) 步的结果相加。`;
      else if (s.id === "k99") prompt = `灯塔密码：把第 ${fmtRefs(s.refs)} 步的结果全部相加 —— 输入它，整座灯塔将被你点亮。`;
    }
    return {
      id: s.id, no: numOf(s.id), kind: s.isFinal ? "final" : s.refs ? "chain" : "normal",
      kp: s.kp, prompt,
      ans: pl.ans, ansText: pl.ansText !== undefined ? pl.ansText : ansTextOf(pl.ans),
      refs: s.refs ? s.refs.slice() : undefined, styleB: pl.useB,
      options: s.type === "mc" ? s.p.options : undefined,
      isFinal: !!s.isFinal,
    };
  });

  return {
    level, name: cfg.name, note: cfg.note,
    title: "数学岛 · 点亮灯塔",
    difficultyLabel: `第 ${level} 道题 · 难度 ${level}/7（${cfg.name}）`,
    story: STORY + "\n\n" + LEVEL_SUFFIX(level),
    steps,
    styleB: cfg.styleB, midCount: mids.length,
  };
}

function chainAnswer(s, refVals, p) {
  const r4 = (v) => Math.round((v + Number.EPSILON) * 1e4) / 1e4; // 连锁结果统一 ≤4 位小数，消浮点漂移
  switch (s.type) {
    case "gatherSum": {
      const v = refVals.reduce((a, b) => a + b, 0);
      return { prompt: "", ans: r4(v) };
    }
    case "pctOf": return { prompt: "", ans: r4(refVals[0] * p.pct / 100) };
    case "ratioOf": return { prompt: "", ans: r4((refVals[0] * Math.max(...p.r)) / (p.r[0] + p.r[1])) };
    case "refDiv": return { prompt: "", ans: r4(refVals[0] / p.divisor) };
    case "refAdd": return { prompt: "", ans: r4(refVals[0] + (refVals[1] || 0)) };
    default: throw new Error("未知连锁类型 " + s.type);
  }
}
function ansTextOf(ans) {
  if (Array.isArray(ans)) return ans.join(" 和 ");
  return String(ans);
}

if (typeof module !== "undefined") module.exports = { LEVELS, STORY, LEVEL_SUFFIX, STEP_TYPES, BASE_STEPS, getQuestion, fill, gcd, fracStr, evalExpr };
