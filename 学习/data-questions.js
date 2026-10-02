// data-questions.js —— 七关闯关题（题面 / 答案 / 知识点映射 / 能量合成公式）
// 题型：input=填空 · input2=两个空 · mc=选择 · energy=能量合成（每关末尾，判定后解锁下一关）
// answer 为标准答案；accept 为可接受的等价写法（数字类由 app 做数值等价比较）
// energy.compute(answers) 由本关前面题目的作答算出能量数；energy.answer 是标准能量数（解锁判据）
const STAGES = [];

STAGES.push({
  id: 1,
  title: "登岛清点",
  gradeLabel: "一年级",
  intro:
    "你乘小船登上数学岛。岛中央的灯塔已经熄灭，七道石门把七块能量石封在里面。守岛长老说：「先学会清点，才能出发。」清点背包、绳子、金币与罐头，把五块石板上的数相加，就能铸出第一块能量石。",
  energy: {
    label: "第一块能量石",
    formulaText: "水与面包(13) ＋ 绳比木板长(3) ＋ 下一块地砖(10) ＋ 金币(18) ＋ 罐头(21)",
    compute: (a) => a.s1q1 + a.s1q2 + a.s1q5 + a.s1q6 + a.s1q7,
    answer: 65,
    referenced: ["s1q1", "s1q2", "s1q5", "s1q6", "s1q7"],
  },
  items: [
    { id: "s1q1", type: "input", prompt: "你背包里有 8 瓶水和 5 块面包，一共多少件？", answer: 13, kps: ["g1_add20"] },
    { id: "s1q2", type: "input", prompt: "码头上的绳子长 9 米，木板长 6 米。绳子比木板长几米？", answer: 3, kps: ["g1_compare"] },
    { id: "s1q3", type: "input", prompt: "队伍里你排第 7，你前面有几个人？", answer: 6, kps: ["g1_count"] },
    { id: "s1q4", type: "input", prompt: "石门在 7:30 开启，你提前 30 分钟到达。你是几点到的？（写成 7:00 这样的形式）", answer: "7:00", accept: ["7:00", "7：00", "7点", "7时", "七点", "七时", "7:00整"], kps: ["g1_clock"] },
    { id: "s1q5", type: "input", prompt: "地砖花纹按 2、4、6、8 排列，下一块应该是几？", answer: 10, kps: ["g1_pattern"] },
    { id: "s1q6", type: "input", prompt: "钱包里有 1 张 10 元、1 张 5 元、3 枚 1 元硬币，一共几元？", answer: 18, kps: ["g1_money", "g1_add100a"] },
    { id: "s1q7", type: "input", prompt: "上层放了 12 个罐头，下层放了 9 个，一共几个？", answer: 21, kps: ["g1_add100b"] },
    { id: "s1q8", type: "mc", prompt: "哪一个是正方体？", options: ["皮球（球体）", "骰子（六个面都是同样大的正方形）", "易拉罐（上下一样粗的圆柱）", "长长的大纸箱"], answer: 1, kps: ["g1_solid"] },
    { id: "s1q9", type: "mc", prompt: "哪一个是长方形？", options: ["三角尺的面", "硬币的面（圆）", "课本的封面", "红领巾的面"], answer: 2, kps: ["g1_plane"] },
    { id: "s1q10", type: "input", prompt: "数字 35 中的 3 在哪一位？（写「十」或「十位」）", answer: "十", accept: ["十", "十位"], kps: ["g1_num100"] },
    { id: "s1q11", type: "input", prompt: "数一数：▲▲▲●●●● 一共有几个图形？", answer: 7, kps: ["g1_class"] },
    { id: "s1q12", type: "mc", prompt: "书放在书架上层，盒子放在下层。盒子在书的哪一面？", options: ["上面", "下面", "左面", "前面"], answer: 1, kps: ["g1_pos"] },
    { id: "s1q13", type: "input", prompt: "石头堆里有 3 个 ▲ 和 5 个 ●，● 比 ▲ 多几个？", answer: 2, kps: ["g1_stat1"] },
    { id: "s1q14", type: "input", prompt: "口袋里有 6 颗糖，又放进去 4 颗，现在一共几颗？", answer: 10, kps: ["g1_add10"] },
    { id: "s1q15", type: "input", prompt: "石门上镶着 4 颗宝石，再镶上 1 颗，一共几颗？", answer: 5, kps: ["g1_add5"] },
    { id: "s1q16", type: "input", prompt: "石板上刻着 11 到 20 的数，其中第 4 个数是几？", answer: 14, kps: ["g1_teen"] },
  ],
});

STAGES.push({
  id: 2,
  title: "划地安营",
  gradeLabel: "二年级",
  intro:
    "（第一块能量石：65）你清点出 65 件物资，必须在天黑前划地安营。把物资装箱、接好木板、算清绳钱、称好盐糖、记下采摘数……按长老给的合成式，铸出第二块能量石。",
  energy: {
    label: "第二块能量石",
    formulaText: "余数(5) × 箱数(7) ＋ 绳钱(24)",
    compute: (a) => a.s2q1[1] * a.s2q1[0] + a.s2q3,
    answer: 59,
    referenced: ["s2q1", "s2q3"],
  },
  items: [
    { id: "s2q1", type: "input2", prompt: "65 个包裹每箱装 8 个。需要几个箱子？还剩几个？（依次填两个数）", answer: [7, 5], kps: ["g2_remainder", "g2_div"] },
    { id: "s2q2", type: "input", prompt: "3 块木板，每块长 7 分米，接起来一共多少分米？", answer: 21, kps: ["g2_mul", "g2_length"] },
    { id: "s2q3", type: "input", prompt: "绳子每米 4 元，买 6 米一共花多少元？", answer: 24, kps: ["g2_mul"] },
    { id: "s2q4", type: "input", prompt: "5 × 7 − 9 ＝ ？", answer: 26, kps: ["g2_mixed"] },
    { id: "s2q5", type: "input", prompt: "300 克盐和 2 千克糖混在一起，一共有多少克？", answer: 2300, kps: ["g2_mass"] },
    { id: "s2q6", type: "mc", prompt: "哪一个是锐角？", options: ["像方桌角一样的直角", "比直角小、尖尖的角", "比直角大、懒懒张开的角", "平平的一条线"], answer: 1, kps: ["g2_angle"] },
    { id: "s2q7", type: "mc", prompt: "下面是一个两层积木（下层大方块、上层小方块居中）。从正上方往下看，看到的形状是？", options: ["两个上下叠着的正方形侧面", "大正方形中间套着一个小正方形", "一个三角形", "一个圆"], answer: 1, kps: ["g2_observe"] },
    { id: "s2q8", type: "input", prompt: "四天摘果记录是 5、8、6、9 个，四天一共摘了多少个？", answer: 28, kps: ["g2_stat2", "g2_add100"] },
    { id: "s2q9", type: "input", prompt: "图书馆有 2045 本书。2045 中的 4 在哪一位？（写「百」或「百位」）", answer: "百", accept: ["百", "百位"], kps: ["g2_wan"] },
    { id: "s2q10", type: "mc", prompt: "3 件上衣和 2 条裤子，一件上衣配一条裤子，共有几种穿法？", options: ["3 种", "5 种", "6 种", "9 种"], answer: 2, kps: ["g2_combo"] },
    { id: "s2q11", type: "input", prompt: "估算：498 最接近哪个整百数？", answer: 500, kps: ["g2_addsub_wan"] },
  ],
});

STAGES.push({
  id: 3,
  title: "架桥运粮",
  gradeLabel: "三年级",
  intro:
    "（第二块能量石：59）59 名工人集结完毕，要在河上架桥、把粮食运进谷仓。这一关要管时间、吨位、分数、周长和方向——桥合拢时，第三块能量石会在桥心亮起。",
  energy: {
    label: "第三块能量石",
    formulaText: "每仓粮食(186) ＋ 地基周长(34) × 2",
    compute: (a) => a.s3q2 + a.s3q6 * 2,
    answer: 254,
    referenced: ["s3q2", "s3q6"],
  },
  items: [
    { id: "s3q1", type: "input", prompt: "每船装 248 千克货物，6 船一共多少千克？", answer: 1488, kps: ["g3_mul3"] },
    { id: "s3q2", type: "input", prompt: "1488 袋粮食平均分给 8 个仓库，每个仓库分多少袋？", answer: 186, kps: ["g3_div3", "g3_div3b"] },
    { id: "s3q3", type: "input", prompt: "8:15 出发，45 分钟后到达。到达时刻是？（写成 9:00 这样的形式）", answer: "9:00", accept: ["9:00", "9：00", "9点", "9时", "九点", "九时"], kps: ["g3_time"] },
    { id: "s3q4", type: "input", prompt: "3 吨石料和 500 千克沙子，一共多少千克？", answer: 3500, kps: ["g3_measure"] },
    { id: "s3q5", type: "input", prompt: "蛋糕平均切成 8 份，吃了 3 份，还剩几分之几？", answer: "5/8", accept: ["5/8", "八分之五"], kps: ["g3_frac1"] },
    { id: "s3q6", type: "input", prompt: "长方形地基长 12 米、宽 5 米，周长是多少米？", answer: 34, kps: ["g3_peri"] },
    { id: "s3q7", type: "input", prompt: "货物数量是 59 箱的 4 倍，一共多少箱？", answer: 236, kps: ["g3_times"] },
    { id: "s3q8", type: "mc", prompt: "你面对着太阳（东方），此时你的左边是哪个方向？", options: ["东", "南", "西", "北"], answer: 3, kps: ["g3_dir"] },
    { id: "s3q9", type: "input", prompt: "A 组 12 人、B 组 15 人，其中 8 人两组都参加。一共有多少人？", answer: 19, kps: ["g3_set"] },
    { id: "s3q10", type: "input", prompt: "一周摘果：周一 5、周二 7、周三 6、周四 9（个）。哪一天最多？（写「周四」）", answer: "周四", accept: ["周四", "星期四", "礼拜四"], kps: ["g3_bar1"] },
    { id: "s3q11", type: "input", prompt: "每车装 23 袋，14 车一共多少袋？", answer: 322, kps: ["g3_2x2"] },
    { id: "s3q12", type: "input", prompt: "木板长 6 分米、宽 4 分米，面积是多少平方分米？", answer: 24, kps: ["g3_area", "g3_areaRect"] },
    { id: "s3q13", type: "input", prompt: "7 月一共有多少天？", answer: 31, kps: ["g3_date"] },
    { id: "s3q14", type: "input", prompt: "一支笔 2 元 5 角，写成小数是多少元？", answer: 2.5, kps: ["g3_dec1"] },
    { id: "s3q15", type: "mc", prompt: "复式统计表的好处是？", options: ["只记录一组数据", "把两组数据合在一张表里，方便对比", "让表格更好看", "可以不用写数字"], answer: 1, kps: ["g3_2stat"] },
    { id: "s3q16", type: "input", prompt: "用数字 1、2、3 各用一次，能组成多少个不同的两位数？", answer: 6, kps: ["g3_combo2"] },
    { id: "s3q17", type: "input", prompt: "工地上有 1245 块砖，运走 678 块，还剩多少块？", answer: 567, kps: ["g3_addsub"] },
  ],
});

STAGES.push({
  id: 4,
  title: "铺路进城",
  gradeLabel: "四年级",
  intro:
    "（第三块能量石：254）254 车石料运抵城下，开始铺路进城。大数改写、笔算乘除、简便运算、鸡兔同笼、角与对称……城门的转盘只认第四块能量石。",
  energy: {
    label: "第四块能量石",
    formulaText: "进城商(115) × 2 ＋ 鸡兔总头数(20)",
    compute: (a) => a.s4q3 * 2 + 20,
    answer: 250,
    referenced: ["s4q3", "s4q6"],
  },
  items: [
    { id: "s4q1", type: "input", prompt: "一座城市有 3054000 人，四舍五入改写成以「万」为单位是多少万？（写成 305万 这样的形式）", answer: "305万", accept: ["305万", "305", "305 万"], kps: ["g4_big"] },
    { id: "s4q2", type: "input", prompt: "235 × 46 ＝ ？", answer: 10810, kps: ["g4_mul4"] },
    { id: "s4q3", type: "input", prompt: "10810 ÷ 94 ＝ ？", answer: 115, kps: ["g4_div4"] },
    { id: "s4q4", type: "input", prompt: "沥青原有 12.5 千克，用去 3.75 千克，还剩多少千克？", answer: 8.75, kps: ["g4_decadd"] },
    { id: "s4q5", type: "input", prompt: "用简便方法计算：25 × 37 × 4 ＝ ？", answer: 3700, kps: ["g4_law"] },
    { id: "s4q6", type: "input", prompt: "笼子里鸡和兔共 20 只，共有 56 只脚。鸡有几只？", answer: 12, kps: ["g4_cfr"] },
    { id: "s4q7", type: "input", prompt: "∠1 ＝ 35°，它的余角是多少度？（余角：两个角加起来正好 90°）", answer: 55, kps: ["g4_angle4"] },
    { id: "s4q8", type: "mc", prompt: "关于平行四边形，哪句话是对的？", options: ["四条边都相等、四个角都是直角", "两组对边分别平行，容易变形", "只有一组对边平行", "没有直的边"], answer: 1, kps: ["g4_para"] },
    { id: "s4q9", type: "input", prompt: "边长 100 米的正方形土地，面积是多少平方米？（它正好是 1 公顷）", answer: 10000, kps: ["g4_land"] },
    { id: "s4q10", type: "mc", prompt: "哪一个是轴对称图形？", options: ["一般形状的平行四边形", "等腰三角形", "数字 5", "闪电形状"], answer: 1, kps: ["g4_sym"] },
    { id: "s4q11", type: "input", prompt: "四天修路 30、40、50、60 米，平均每天修多少米？", answer: 45, kps: ["g4_avg"] },
    { id: "s4q12", type: "mc", prompt: "烙饼：每次锅里最多放 2 张，每张要烙两面，每面 1 分钟。3 张饼最快几分钟烙熟？", options: ["2 分钟", "3 分钟", "4 分钟", "6 分钟"], answer: 1, kps: ["g4_opt"] },
    { id: "s4q13", type: "input", prompt: "条形统计图中一格代表 5 吨，一共画了 6 格，表示多少吨？", answer: 30, kps: ["g4_bar2"] },
    { id: "s4q14", type: "mc", prompt: "书店编号规则是「K-楼层-序号」。编号 K-3-005 表示？", options: ["三楼第 5 本", "三楼第 5 排", "五楼第 3 本", "第 35 本"], answer: 0, kps: ["g4_code"] },
    { id: "s4q15", type: "mc", prompt: "3.050 应该读作？", options: ["三点零五零", "三点五零", "三点零五十", "三零五零"], answer: 0, kps: ["g4_dec"] },
    { id: "s4q16", type: "input", prompt: "三角形的内角和是多少度？", answer: 180, kps: ["g4_tri"] },
  ],
});

STAGES.push({
  id: 5,
  title: "装仓清点",
  gradeLabel: "五年级",
  intro:
    "（第四块能量石：250）250 箱货物入仓，装卸清点开始。小数乘除、方程、面积、因数与质数、分数、体积、可能性、植树与找次品……账本核对无误，第五块能量石自动浮现。",
  energy: {
    label: "第五块能量石",
    formulaText: "三角形面积(180) ＋ 梯形面积(66) ＋ 仓库体积(72)",
    compute: (a) => a.s5q4 + a.s5q5 + a.s5q10,
    answer: 318,
    referenced: ["s5q4", "s5q5", "s5q10"],
  },
  items: [
    { id: "s5q1", type: "input", prompt: "每箱 45.6 元，买 250 箱一共多少元？", answer: 11400, kps: ["g5_muldec"] },
    { id: "s5q2", type: "input", prompt: "73.6 ÷ 16 ＝ ？", answer: 4.6, kps: ["g5_divdec"] },
    { id: "s5q3", type: "input", prompt: "解方程：3x ＋ 45 ＝ 180，x ＝ ？", answer: 45, kps: ["g5_eq"] },
    { id: "s5q4", type: "input", prompt: "三角形菜地：底 24 米、高 15 米，面积是多少平方米？", answer: 180, kps: ["g5_multiArea"] },
    { id: "s5q5", type: "input", prompt: "梯形屋顶：上底 8 米、下底 14 米、高 6 米，面积是多少平方米？", answer: 66, kps: ["g5_multiArea"] },
    { id: "s5q6", type: "input", prompt: "平行四边形货台：底 12 米、高 5 米，面积是多少平方米？", answer: 60, kps: ["g5_multiArea"] },
    { id: "s5q7", type: "input", prompt: "24 和 36 的最大公因数是几？", answer: 12, kps: ["g5_factor", "g5_gcd"] },
    { id: "s5q8", type: "input", prompt: "100 以内最大的质数是几？", answer: 97, kps: ["g5_prime"] },
    { id: "s5q9", type: "input", prompt: "3/4 ＋ 5/6 ＝ ？（写成 19/12 或 1又7/12 都可以）", answer: "19/12", accept: ["19/12", "1又7/12", "1 7/12", "一又十二分之七"], kps: ["g5_fracadd"] },
    { id: "s5q10", type: "input", prompt: "长方体仓库长 6 米、宽 4 米、高 3 米，体积是多少立方米？", answer: 72, kps: ["g5_vol"] },
    { id: "s5q11", type: "input", prompt: "袋子里 3 个红球、2 个蓝球，摸到红球的可能性是几分之几？", answer: "3/5", accept: ["3/5", "五分之三"], kps: ["g5_prob"] },
    { id: "s5q12", type: "input", prompt: "一条路长 100 米，每隔 5 米栽一棵树（两端都栽），一共栽几棵？", answer: 21, kps: ["g5_plant"] },
    { id: "s5q13", type: "input", prompt: "时针从 3 走到 6，转了多少度？", answer: 90, kps: ["g5_rot"] },
    { id: "s5q14", type: "input", prompt: "8 个零件中有 1 个较轻的次品，用天平至少称几次能保证找出？", answer: 2, kps: ["g5_find"] },
    { id: "s5q15", type: "input", prompt: "把 18/24 约分到最简是多少？", answer: "3/4", accept: ["3/4", "四分之三"], kps: ["g5_fracprop"] },
    { id: "s5q16", type: "mc", prompt: "想看清一个星期内气温的升降变化，选哪种统计图最合适？", options: ["统计表", "条形统计图", "折线统计图", "扇形统计图"], answer: 2, kps: ["g5_line"] },
  ],
});

STAGES.push({
  id: 6,
  title: "灯塔图纸",
  gradeLabel: "六年级",
  intro:
    "（第五块能量石：318）318 米长绳挂上灯塔，最后一张图纸展开：分数乘除、折扣、圆、比例尺、圆锥、负数、扇形……图纸合上的瞬间，第六块能量石嵌入塔身。",
  energy: {
    label: "第六块能量石",
    formulaText: "某长度(300) − 折后价(240) ＋ 实际米数(50) ＋ 圆锥体积(72)",
    compute: (a) => a.s6q2 - a.s6q3 + a.s6q5 + a.s6q6,
    answer: 182,
    referenced: ["s6q2", "s6q3", "s6q5", "s6q6"],
  },
  items: [
    { id: "s6q1", type: "input", prompt: "318 米绳子用去了 2/3，还剩多少米？", answer: 106, kps: ["g6_fracmul"] },
    { id: "s6q2", type: "input", prompt: "某长度的 5/6 正好是 250 米，这个长度是多少米？", answer: 300, kps: ["g6_fracdiv"] },
    { id: "s6q3", type: "input", prompt: "原价 300 元的灯打八折，折后价是多少元？", answer: 240, kps: ["g6_pctapp"] },
    { id: "s6q4", type: "input", prompt: "圆形花坛直径 10 米，面积是多少平方米？（π 取 3.14）", answer: 78.5, kps: ["g6_circle"] },
    { id: "s6q5", type: "input", prompt: "比例尺是 1:1000，图上 5 厘米代表实际多少米？", answer: 50, kps: ["g6_scale"] },
    { id: "s6q6", type: "input", prompt: "圆锥形沙堆底面积 24 平方米、高 9 米，体积是多少立方米？", answer: 72, kps: ["g6_cyl"] },
    { id: "s6q7", type: "input", prompt: "山脚气温 5°C，山顶气温 −3°C。山顶比山脚低多少度？", answer: 8, kps: ["g6_neg"] },
    { id: "s6q8", type: "input", prompt: "扇形统计图中占 25% 的那一块，圆心角是多少度？", answer: 90, kps: ["g6_fan"] },
    { id: "s6q9", type: "input", prompt: "把 120 按 2:3 分给两组，较多的那一份是多少？", answer: 72, kps: ["g6_ratio"] },
    { id: "s6q10", type: "input", prompt: "解比例：x : 6 ＝ 4 : 3，x ＝ ？", answer: 8, kps: ["g6_prop"] },
    { id: "s6q11", type: "mc", prompt: "下面哪一组量成正比例关系？", options: ["人的年龄与身高", "正方形的周长与边长", "圆的面积与半径", "袋中球数与球的颜色"], answer: 1, kps: ["g6_prop"] },
    { id: "s6q12", type: "input", prompt: "看规律：1＝1²，1＋3＝2²，1＋3＋5＝3²，那么 1＋3＋5＋7 ＝ ？", answer: 16, kps: ["g6_np"] },
    { id: "s6q13", type: "input", prompt: "圆柱水塔底面半径 2 米、高 5 米，体积是多少立方米？（π 取 3.14）", answer: 62.8, kps: ["g6_cyl"] },
    { id: "s6q14", type: "input", prompt: "25% 写成小数是多少？", answer: 0.25, kps: ["g6_pct"] },
  ],
});

STAGES.push({
  id: 7,
  title: "点亮灯塔",
  gradeLabel: "综合冲刺",
  intro:
    "六块能量石已集齐：65 · 59 · 254 · 250 · 318 · 182。唤醒它们、按比例分配、搬运称重，算出灯塔密码并嵌入石门——整座灯塔将被你点亮。",
  energy: {
    label: "灯塔密码",
    formulaText: "核心能量(282) × 4",
    compute: (a) => a.s7q2 * 4,
    answer: 1128,
    referenced: ["s7q1", "s7q2", "s7q3", "s7q4"],
    isFinal: true,
  },
  items: [
    { id: "s7q1", type: "input", prompt: "六块能量石依次是 65、59、254、250、318、182，它们加起来一共是多少？", answer: 1128, kps: ["g3_addsub"] },
    { id: "s7q2", type: "input", prompt: "把总能量的 25% 作为「核心能量」，核心能量是多少？", answer: 282, kps: ["g6_pct"] },
    { id: "s7q3", type: "input", prompt: "把总能量按 1:3 分给外环与内环，较多的那一份是多少？", answer: 846, kps: ["g6_ratio"] },
    { id: "s7q4", type: "input", prompt: "4 趟共搬运 1128 块砖，每趟搬 x 块。由 4x ＝ 1128 得 x ＝ ？", answer: 282, kps: ["g5_eq"] },
    { id: "s7q5", type: "input", prompt: "灯塔底座是半径 4 米的圆，面积是多少平方米？（π 取 3.14）", answer: 50.24, kps: ["g6_circle"] },
    { id: "s7q6", type: "input", prompt: "1 ＋ 2 ＋ 3 ＋ … ＋ 10 ＝ ？", answer: 55, kps: ["g6_np"] },
    { id: "s7q7", type: "input", prompt: "维修费 1128.5 元由两队平摊，每队各出多少元？", answer: 564.25, kps: ["g5_muldec"] },
    { id: "s7q8", type: "input", prompt: "六块能量石中，能量最高的一块是多少？", answer: 318, kps: ["g3_bar1"] },
    { id: "s7q9", type: "input", prompt: "把 1128 人平均分成每组 8 人，可以分成几组？", answer: 141, kps: ["g5_factor"] },
  ],
});

if (typeof module !== "undefined") module.exports = { STAGES };
