// Fonts: LINE Seed covers English, Korean, Japanese, and traditional characters, but has no accented Latin letters
// (Vietnamese, pinyin tone marks, Japanese ō) and no simplified-only Chinese characters. So any word with an accented
// letter is drawn in Noto Sans, and any run of characters with one LINE Seed lacks is drawn in Noto Sans SC (or KR in
// Korean text) as a whole, so a word never mixes two fonts. New text on the page is checked as it appears.
(function () {
  const NO_LINE_SEED = new Set("぀ヿㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ㐀䶿专业丛东丝两严丧临为丽举义乌乐乔习乡书买亚产亲亵亿仅仓仪们众伞伟传伤伦侣侥侦侧侨俩俭倂债倻倾偿兑关兴养兽军农冻净减凤凯击凿刍则刚创别剂剑剧劝办务动劲劳势勋华协单卖卧卫卽厅历压厌县发变叠叹启吴呕员呜咛响哑唤啬啮喷团园围图圆场块坚坛坟坠垒垦堑壳壶处备头夺奋奖妆妇妈娇娱婴媤嫔孙孼实宠审宪宫宽宾对寻导尔尘尙尝层屿岁岗岛崭巩币帅师帐帜带幷庆库应庙废开张弹强归录彻忆忧态怂总恳恶恻恼悤悬惩惮惯愤懒戏战戱户执扩扫扬抚护报拟拣拥择挚挛挥捞损换掷揷搅摄摇撑敌敛斋斩旣时旷显暂暧术杀杂权杨枣柹栀标栉栋栏树样桥检榈槪欢歼殒毁毕汇汉汤沦沧沪泻泼泽浆浊测济浑浓涡涤润渎渐渔渗溃滚满滤滥澜濒灭灵灾灿炼烂烦烧烬热爱牵牺犊狈狮狱猎环现电畅畓畵疗疟疡疮痉癎盏盐监盘瞒矫矾矿砚础硏硕祸积稳穷竖竞笃笔笼签简篮类粪紧纠红纤约级纪纬纯纱纲纳纵纷纸纹纺纽线练组绅细织终绎经绒结绘给绚络绝绞统绣继绩绪续绰绳维绵绷绸综绽绿缀缎缓缔编缘缚缝缩缮罗罚罢聋职联聪肃肠肤肾肿胀胁胧胶脏脑脓腾舆舰舱艰艺节芪苍苏荡荣荧药莲获萤营萧萨蓝蔷蕴虑虽蚀蛰蛲衔补袭褛褴见观规视览觉计订讣认讨让训议讯记讲讴许讹论讼讽设访诀证评识诈诉诊词译试诗诘诚诛话诞诡诣该详诫诬语误诱说诵请诸诺读诽课调谅谈谊谋谍谏谐谑谒谓谚谛谜谢谣谤谥谦谨谱谴贝贞负贡财责贤败账货质贩贪贫购贮贯贱贵贸费贺贼赃资赈赋赌赎赏赐赔赖赙赞赠趋跃踌躏车轨转轮软轴轻载轿较辅辆辈辉辑输辖辗辩边达迁过迈运还进远违连迟选逊递遗邮邻郑酦酿释鉴针钉钝钟钢钦钱钵钻铁铃铄铅铜铨铭银铺锁锋锐错锤锥锦键锻镀镇镜长门闪闭问闯闰闲间闷闸闺闻阀阁阅阐阔阙队阳阴阵阶际陆陈陨险隐难雏雳雾霁韦韧韩顶顷项顺须顽顾顿颁颂预领颇颈频颓颗题颚额风飞飡飨餜饥饭饮饯饰饱饲饶饼饿馃馆馒馔马驯驱驳驸驹驻驿验骏骑骚髥鱼鲜鲢鲸鳄鳞鸟鸡鸣鸭鸯鸳鸿鹃鹉鹏鹤鹦鹭齐齿龄龊龌龙龟鿿六");
  const ACCENTED = /[À-ɏḀ-ỿ]/;
  // a word with an accented letter, or a run of Chinese characters
  const WORDS = /[^\s()\[\],;:·/]*[À-ɏḀ-ỿ][^\s()\[\],;:·/]*|[㐀-鿿豈-﫿\u{20000}-\u{2FFFF}]+/gu;
  const SKIP = "script, style, textarea, input, select, svg, canvas, .f-noto, .f-sc";
  function needsSpan(t) {
    if (ACCENTED.test(t)) return true;
    for (const c of t) if (NO_LINE_SEED.has(c)) return true;
    return false;
  }
  function fix(node) {
    const t = node.nodeValue;
    if (!t || !needsSpan(t)) return;
    const p = node.parentNode;
    if (!p || p.nodeType !== 1 || p.closest(SKIP)) return;
    const frag = document.createDocumentFragment();
    let last = 0, changed = false;
    for (const m of t.matchAll(WORDS)) {
      const w = m[0];
      const cls = ACCENTED.test(w) ? "f-noto" : [...w].some(c => NO_LINE_SEED.has(c)) ? "f-sc" : "";
      if (!cls) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = w;
      frag.appendChild(s);
      last = m.index + w.length;
      changed = true;
    }
    if (!changed) return;
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    p.replaceChild(frag, node);
  }
  function scan(root) {
    if (root.nodeType === 3) { fix(root); return; }
    if (root.nodeType !== 1 || root.closest(SKIP)) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walk.nextNode()) nodes.push(walk.currentNode);
    nodes.forEach(fix);
  }
  function start() {
    scan(document.body);
    new MutationObserver(list => {
      for (const m of list) {
        if (m.type === "characterData") fix(m.target);
        else m.addedNodes.forEach(scan);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
