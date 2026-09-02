// ========== GAME FLOW HELPERS ==========
function clearContainer() {
  gameContainer.innerHTML = '';
}

function addDivider() {
  const div = document.createElement('div');
  div.className = 'ink-divider';
  gameContainer.appendChild(div);
}

function addTurnInfo(text) {
  const div = document.createElement('div');
  div.className = 'turn-info';
  div.textContent = text;
  gameContainer.appendChild(div);
}

function showLoading(duration = 1200) {
  return new Promise(resolve => {
    const loader = document.createElement('div');
    loader.className = 'loading-dots';
    loader.innerHTML = '<span></span><span></span><span></span>';
    gameContainer.appendChild(loader);
    setTimeout(() => {
      loader.remove();
      resolve();
    }, duration);
  });
}

function scrollToBottom() {
  setTimeout(() => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }, 100);
}

// ========== NAME GENERATION ==========
const SURNAMES = [
  '朱','徐','常','李','蓝','汤','邓','冯','傅','廖',
  '沐','胡','汪','刘','宋','章','叶','方','沈','陆',
  '顾','姚','高','周','吴','郑','王','陈','张','杨',
  '黄','赵','钱','孙','罗','唐','许','韩','萧','曹',
  '潘','葛','范','鲁','马','余','袁','于','董','程'
];

function randomSurname() {
  return SURNAMES[Math.floor(Math.random() * SURNAMES.length)];
}

function generateGivenName(backgroundKey) {
  const namesByBg = {
    huaixi: ['承烈','定远','崇武','振威','铁山','世勋','仲戈','毅夫','伯韬','克戎'],
    zhedong: ['景濂','伯温','允修','叔明','彦和','敬之','希孟','道传','子静','正叔'],
    shanggu: ['万贯','宝臣','通海','聚丰','世昌','德裕','金生','利源','润之','丰盈'],
    qianyuan: ['守拙','怀远','复初','遗安','慕陶','伯夷','叔齐','幼安','子隐','思齐']
  };
  const pool = namesByBg[backgroundKey] || namesByBg.huaixi;
  return pool[Math.floor(Math.random() * pool.length)];
}

function generateCharIntro(surname, givenName, bgKey) {
  const fullName = surname + givenName;
  const intros = {
    huaixi: `${fullName}，凤阳府定远县人氏。父亲早年随太祖起兵，南征北战，积功至千户，后在鄱阳湖一战中身负重伤，归乡不久便病故了。母亲蓝氏含辛茹苦将你拉扯大，她的幼弟蓝玉——你的嫡亲舅舅——如今在大都督府当差，随军北征西讨，正是当红的时候，逢年过节总不忘捎东西来看望你们母子。母亲临终前只留下一句话：「你爹是替大明死的，你莫要辱没了他。」\n\n你自幼在军营中摸爬滚打，弓马娴熟，也认得几个字。洪武三年，朝廷追录阵亡将士之后，你蒙荫补为殿前校尉，入京当差。如今你二十五岁，在应天府当了五年差，虽只是个七品武官，却也见过些世面——淮西老将们念着你父亲的旧情，舅舅蓝玉在军中又多有照拂；但朝中风向日变，这层关系究竟是福是祸，你也说不准。`,

    zhedong: `${fullName}，处州府青田县人氏。你自幼丧母，父亲在乡中开馆授徒，勉强糊口。家中虽清贫，却与村东头的刘伯温先生素有往来——刘先生是你父亲的同窗挚友，也是你真正的启蒙恩师。\n\n你七岁起便随刘先生读书。他教你不只是四书五经，更教天文兵法、术数奇门。月下竹篱旁，他常指着星空对你说：「治国如弈棋，不在一子之得失，在乎全局之势。」你十四岁那年，他已将毕生所学倾囊相授。临别时赠你一部手抄《百战奇略》，扉页题字：「此子颖悟，惜乎生不逢时。吾老矣，后生可畏。」\n\n刘先生致仕归乡后，你常去探望，师徒情深。你与宋濂先生、方孝孺师兄等浙东文人群体也结下深厚情谊。今年开春，你踏入应天府。宋濂先生念旧情，替你谋了个翰林院庶吉士的差事；方孝孺师兄也常来照应。你的机会就在这里——刘先生的门生故旧遍布朝野，这份人脉是你入仕的根基，也是你在这个风云变幻的时代最珍贵的财富。`,

    shanggu: `${fullName}，应天府江宁县人氏。你家是应天府数得上的富户，经营绸缎、茶叶和盐引，在秦淮河畔有三间铺面，在苏州、扬州也有分号。你自小锦衣玉食，五岁开蒙，请的是致仕的老儒；十二岁便跟着父亲学算盘、看账本、辨绸缎成色。\n\n然而你心里清楚，在这大明天下，商人再有钱也不过是砧板上的肉。前车之鉴犹在眼前——富可敌国又如何？一纸诏令，抄家流徙。父亲花了大笔银子替你捐了个监生，又托人在通政司谋了个知印的差事，从九品，不入流。你今年二十三岁，穿着皂色官服站在衙门里时，常觉得自己像个穿着戏服的伶人。但你知道，这是你家从商入仕的唯一一步棋——走好了，便能改换门庭；走砸了，万劫不复。`,

    qianyuan: `${fullName}，大都人氏——不对，如今该叫北平了。你祖上在前元做过翰林待制，虽不是什么大官，却也算得上诗礼传家。洪武元年徐达北伐，元顺帝仓皇北逃，你父亲带着家小滞留大都，没有跟王师走，也没有殉国——他选择了归顺。\n\n降臣之后，这四个字像烙印一样跟了你二十二年。你随父迁入应天府后，邻里侧目，同年避席。父亲被安置在翰林院做个待诏，从九品，俸禄微薄，却整日小心翼翼，连说话都要先看窗外有没有人。去年冬天他染了风寒，拖到开春便去了，临终前抓着你的手说：「为父这辈子，最错的就是没跟着圣上走。你……你莫要再走为父的老路。」你如今在翰林院做个抄誊的小吏，无品无级。你读了一肚子诗书，却连抬头走路都不敢——因为你知道，这世上最不缺的，就是揪着你出身做文章的人。`
  };
  return intros[bgKey] || intros.huaixi;
}

// ========== DEMO: OPENING SCREEN ==========
async function startGame() {
  updateStatusPanel();

  // Opening text
  const auto = getAutoSave();
  let continueBtn = '';
  if (auto && auto.gameState && auto.gameState.character.name) {
    const gs = auto.gameState;
    continueBtn = `
      <button class="confirm-btn" id="continueBtn" style="background:var(--cinnabar);margin-bottom:16px;">
        继续 · ${gs.character.name} · ${getYearName(gs.year)}第${gs.turn}回
      </button>
    `;
  }

  gameContainer.innerHTML = `
    <div class="input-screen">
      <h2>洪武八年，天下初定</h2>
      <p class="subtitle">大明立国已七载，百废待兴。<br>你即将踏入这段波澜壮阔的历史。</p>
      ${continueBtn}
      <p class="subtitle" style="margin-top:12px;">你贵姓？</p>
      <input type="text" class="name-input" id="surnameInput" placeholder="输入姓氏" maxlength="3" autofocus />
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="confirm-btn" id="surnameConfirm">落笔</button>
        <button class="random-btn" id="surnameRandom">随机姓氏</button>
      </div>
    </div>
  `;

  const continueBtnEl = document.getElementById('continueBtn');
  if (continueBtnEl) {
    continueBtnEl.addEventListener('click', () => {
      if (loadAutoSave()) {
        // Auto-save restored, close opening
      }
    });
  }

  const surnameInput = document.getElementById('surnameInput');
  const surnameConfirm = document.getElementById('surnameConfirm');
  const surnameRandom = document.getElementById('surnameRandom');

  const proceed = (surname) => {
    if (!surname) {
      surnameInput.style.borderBottomColor = '#e74c3c';
      setTimeout(() => surnameInput.style.borderBottomColor = '', 600);
      return;
    }
    showBackgroundSelection(surname);
  };

  surnameConfirm.addEventListener('click', () => proceed(surnameInput.value.trim()));
  surnameRandom.addEventListener('click', () => {
    const s = randomSurname();
    surnameInput.value = s;
    proceed(s);
  });
  surnameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') proceed(surnameInput.value.trim());
  });

  scrollToBottom();
}

// ========== DEMO: BACKGROUND SELECTION ==========
async function showBackgroundSelection(surname) {
  clearContainer();
  await showLoading(800);

  const narrative = `
    <span class="year-mark">洪武八年 · 正月</span>
    <p>你站在应天府的城门外，望着巍峨的城墙出神。</p>
    <p>自洪武元年太祖皇帝登基以来，天下历经七年休养生息。昔日战火纷飞的土地，如今已渐现太平气象。然而在这平静的表象之下，暗流从未停止涌动——淮西勋贵与浙东文官的角力、太子与诸王的微妙关系、天子日益深沉的心思……</p>
    <p>你深吸一口气。在这大明的棋盘上，每个人都是一枚棋子——但也有人，妄图做那执棋之人。</p>
    <p style="text-indent:0;text-align:center;color:var(--ink-light);font-size:0.9rem;margin-top:1.5em;">你的出身是？</p>
  `;

  gameContainer.appendChild(renderNarrative(narrative));
  scrollToBottom();

  await new Promise(r => setTimeout(r, 400));

  const backgrounds = [
    '甲、「淮西武将之后」—— 舅舅是蓝玉，自幼在军营长大，弓马娴熟',
    '乙、「浙东寒门书生」—— 恩师刘伯温门下，与浙东文人群体结下深厚情谊',
    '丙、「应天府商贾之子」—— 家富甲一方，却渴望改换门庭',
    '丁、「落魄前元官员之后」—— 祖上曾在元朝为官，如今隐姓埋名'
  ];

  const choicesArea = renderChoices(backgrounds, (choice) => {
    const bgMap = {
      '甲': { key: 'huaixi', bg: '淮西武将之后', age: 25, position: '殿前校尉', rank: 7,
              power: 15, people: 10, wisdom: 5, bond: 15, fame: 5, huaixi: 20 },
      '乙': { key: 'zhedong', bg: '浙东寒门书生', age: 22, position: '举人待选', rank: 0,
              power: 0, people: 10, wisdom: 20, bond: 5, fame: 10, zhedong: 15 },
      '丙': { key: 'shanggu', bg: '应天府商贾之子', age: 23, position: '通政司知印', rank: 9,
              power: 5, people: 5, wisdom: 10, bond: 10, fame: 5, jinchen: -5 },
      '丁': { key: 'qianyuan', bg: '落魄前元官员之后', age: 22, position: '翰林院抄吏', rank: 0,
              power: 0, people: 0, wisdom: 15, bond: 5, fame: 0, jinchen: -15 }
    };

    const idx = choice.charAt(0);
    const bgData = bgMap[idx] || bgMap['甲'];

    // Auto-generate name
    const givenName = generateGivenName(bgData.key);
    const fullName = surname + givenName;
    GameState.character.name = fullName;
    GameState.character.background = bgData.bg;
    GameState.character.age = bgData.age;
    GameState.character.baseAge = bgData.age;
    GameState.character.position = bgData.position;
    GameState.character.rank = bgData.rank;

    // Apply background bonuses
    if (bgData.power) GameState.attributes.power = Math.min(100, GameState.attributes.power + bgData.power);
    if (bgData.people) GameState.attributes.people = Math.min(100, GameState.attributes.people + bgData.people);
    if (bgData.wisdom) GameState.attributes.wisdom = Math.min(100, GameState.attributes.wisdom + bgData.wisdom);
    if (bgData.bond) GameState.attributes.bond = Math.min(100, GameState.attributes.bond + bgData.bond);
    if (bgData.fame) GameState.attributes.fame = Math.min(100, GameState.attributes.fame + bgData.fame);
    if (bgData.huaixi) GameState.factions.huaixi += bgData.huaixi;
    if (bgData.zhedong) GameState.factions.zhedong += bgData.zhedong;
    if (bgData.jinchen) GameState.factions.jinchen += bgData.jinchen;

    updateStatusPanel();

    // Show floating changes
    const attrChanges = {};
    if (bgData.power) attrChanges.power = bgData.power;
    if (bgData.people) attrChanges.people = bgData.people;
    if (bgData.wisdom) attrChanges.wisdom = bgData.wisdom;
    if (bgData.bond) attrChanges.bond = bgData.bond;
    if (bgData.fame) attrChanges.fame = bgData.fame;
    const factionChanges = {};
    if (bgData.huaixi) factionChanges.huaixi = bgData.huaixi;
    if (bgData.zhedong) factionChanges.zhedong = bgData.zhedong;
    if (bgData.jinchen) factionChanges.jinchen = bgData.jinchen;
    showFloatingChanges({ attributes: attrChanges, factions: factionChanges, emperor_feeling: 0 });

    // Show character intro, then enter game
    setTimeout(() => showCharacterIntro(surname, givenName, bgData.key), 1200);
  });

  gameContainer.appendChild(choicesArea);
  scrollToBottom();
}

// ========== SHOW CHARACTER INTRO ==========
async function showCharacterIntro(surname, givenName, bgKey) {
  clearContainer();
  await showLoading(1200);

  const fullName = surname + givenName;
  const intro = generateCharIntro(surname, givenName, bgKey);
  GameState.character.intro = intro; // 固定身世存档：之后每回合随上下文下发给AI，防止AI即兴改编身世
  const paragraphs = intro.split('\n\n');

  let html = `<span class="year-mark">洪武八年 · 正月</span>`;
  html += `<h3 style="text-align:center;font-weight:500;font-size:1.15rem;letter-spacing:0.2em;margin:8px 0 16px;color:var(--ink);">${fullName}</h3>`;
  for (const p of paragraphs) {
    html += `<p>${p}</p>`;
  }

  gameContainer.appendChild(renderNarrative(html));
  scrollToBottom();

  // Continue button
  await new Promise(r => setTimeout(r, 600));
  const continueDiv = document.createElement('div');
  continueDiv.style.cssText = 'text-align:center;padding:20px 0;';
  continueDiv.innerHTML = `<button class="confirm-btn" id="introContinue">踏入洪武</button>`;
  gameContainer.appendChild(continueDiv);
  scrollToBottom();

  document.getElementById('introContinue').addEventListener('click', () => {
    enterGameLoop();
  });
}

// ========== DEMO: GAME TURNS ==========
const DEMO_TURNS = [
  {
    text: `洪武八年，春。

${''}天下初定已经七年了。应天府的春天带着潮湿的暖意，秦淮河两岸的柳色年年如故，城头却已换了大明旗帜。

你——新任翰林院待诏——接到了一纸调令。中书省的胡惟庸大人点名要你参与修撰《大明日历》，记录太祖皇帝起兵以来的征伐大事。

这是一份荣耀，也是一份危险。

翰林院的老同僚张学士悄悄拉住了你的袖子，低声道："此差事，去也得去，不去也得去。只是你需记住——翰林院的笔，写的是天子的脸面。落笔之前，先想清楚你在替谁说话。"

你握紧了调令。胡惟庸——淮西集团的领袖，当朝第一权臣。他为何要召一个小小的待诏？

而张学士——他是浙东人，与早已故去的刘伯温同乡。他口中的"替谁说话"，又是什么意思？

你站在翰林院的值房里，窗外是应天府连绵的春雨。`,

    choices: [
      '「立即前往中书省拜见胡惟庸，以示恭敬」',
      '「先去拜访翰林院老学士张学士，打听虚实」',
      '「先去吏部打探此次调令的背景，摸清来龙去脉」',
      '自由行动：（输入你想做的任何事）'
    ],

    state: {
      turn: 1,
      year: 1375,
      month: 2,
      pacing: '缓冲',
      changes: {
        attributes: { power: 0, people: 2, wisdom: 3, bond: 0, fame: 5 },
        factions: { huaixi: 5, zhedong: 0, donggong: 0, zhuwang: 0, jinchen: 0 },
        emperor_feeling: 0,
        seeds: [{id: '修撰日历', planted_turn: 1}],
        seeds_triggered: []
      },
      character: { position: '翰林院待诏', rank: 7 }
    }
  },
  {
    text: `你在张学士的值房里坐了半个时辰。

老学士端着茶盏，说话不紧不慢："刘伯温先生在世时曾与我说过一句话——'大明之患，不在北元残余，而在朝堂之上。'当时我不懂，如今……"他苦笑了一下。

"胡惟庸此人，才干是有的。但你看他近年来笼络了多少人？文武百官中，有一半出自他门下或受过他举荐。天子是什么人？他能容忍这种事多久？"

张学士放下茶盏，目光变得锐利："你此次入日历馆，表面是修史，但我看——胡惟庸是想在史书中做文章。"

"做什么文章？"你问。

"比如——某些战役的功劳，记在谁名下。某些决策的发起者，写的是谁。"老学士站起身来，"这些笔法，看似无关紧要，但百年后的人看到的就是另一个故事。"

他拍了拍你的肩膀："去吧，小心做事。若有人让你改动不该改的……你就说笔墨不济，需查档复核——这是翰林院的老规矩，谁也挑不出毛病。"

窗外，春雨渐歇。你走出张学士的值房，在走廊上站了一会儿。远处，午门的角楼上，有士兵在换岗。`,

    choices: [
      '「前往中书省，按时赴任日历馆」',
      '「先去吏部档案房查阅洪武元年的原始军报」',
      '「去东宫拜访太子朱标，试探东宫的态度」',
      '自由行动：（输入你想做的任何事）'
    ],

    state: {
      turn: 2,
      year: 1375,
      month: 2,
      pacing: '日常',
      changes: {
        attributes: { power: 0, people: 0, wisdom: 8, bond: 5, fame: 0 },
        factions: { huaixi: -3, zhedong: 10, donggong: 0, zhuwang: 0, jinchen: 2 },
        emperor_feeling: 0,
        seeds: [{id: '张学士忠告', planted_turn: 1}],
        seeds_triggered: []
      },
      character: { position: '翰林院待诏', rank: 7 }
    }
  },
  {
    text: `你来到中书省的日历馆。

馆内已聚集了七八名官员，大多是翰林院的同僚。主事的是中书省的一名经历官，名叫陈宁——此人面色白净，说话时总带着三分笑意，让人摸不透他的心思。

"诸位，"陈宁展开一卷黄纸，"此次修撰《大明日历》，胡丞相亲自过目。太祖皇帝起兵濠州，至洪武元年登基称帝，这十几年的征伐大事，都要一一录入。"

他顿了顿，目光扫过众人："其中有些章节……已经有人初拟了稿本。"说着，他让书吏分发了一叠草稿。

你翻开草稿，看到的是鄱阳大战一节——那是太祖与陈友谅的生死之战。然而你很快发现了问题：草稿中，常遇春将军的功劳被大幅削减，而胡惟庸当时的一名幕僚却被添加了不少"运筹帷幄"的描写。

这些描写，与史实相去甚远。

你的手微微发抖。这就是张学士说的"做文章"——这不是修史，这是篡改。

你抬头看向陈宁，对方正笑眯眯地看着你："待诏大人，你觉得这草稿如何？"`,

    choices: [
      '「直言不讳：此稿与史实不符，下官不敢署名」',
      '「虚与委蛇：下官回去再仔细斟酌，改日回复」',
      '「另辟蹊径：建议查阅兵部原始战报，以"考证"之名拖延」',
      '自由行动：（输入你想做的任何事）'
    ],

    state: {
      turn: 3,
      year: 1375,
      month: 3,
      pacing: '紧迫',
      changes: {
        attributes: { power: 5, people: -3, wisdom: 2, bond: 0, fame: 4 },
        factions: { huaixi: -10, zhedong: 5, donggong: 0, zhuwang: 0, jinchen: -5 },
        emperor_feeling: -8,
        seeds: [{id: '日历馆风波', planted_turn: 1}],
        seeds_triggered: ['张学士忠告']
      },
      character: { position: '翰林院待诏', rank: 7 }
    }
  }
];

