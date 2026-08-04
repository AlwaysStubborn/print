(() => {
  const TOTAL_DAYS = 12;
  const START_BAG = 100;

  const WEATHER = {
    sunny: {
      id: "sunny",
      name: "晴天",
      icon: "☀",
      desc: "产量偏旺。传说果可能很多，也不一定。",
    },
    cloudy: {
      id: "cloudy",
      name: "阴天",
      icon: "☁",
      desc: "产量普通。甜果林可能晃一下。",
    },
    storm: {
      id: "storm",
      name: "暴雨",
      icon: "⛈",
      desc: "果园挨冲。追传说果最疼；坚果林相对扛得住。",
    },
  };

  const PLOTS = {
    steady: { id: "steady", name: "坚果林", vibe: "稳，每天一点点" },
    sweet: { id: "sweet", name: "甜果林", vibe: "会晃，长期往往还过得去" },
    legend: { id: "legend", name: "传说果", vibe: "偶尔很多，经常摔疼" },
  };

  const STRATEGY_LABEL = {
    steady: "全程坚果",
    rules: "混合规矩",
    follow: "跟岛民",
  };

  const RUMORS = [
    {
      id: "legend_boom",
      text: "岛民说：传说果今年必翻倍，不采就踏空了。",
      tempt: "legend",
      breakCost: 18,
    },
    {
      id: "early_move",
      text: "岛民说：有人已经提前搬家躲雨了，你们怎么还不走？",
      tempt: "cash",
      breakCost: 16,
    },
    {
      id: "sweet_dead",
      text: "岛民说：连续下雨，甜果林没戏了，清掉配额吧。",
      tempt: "dump_sweet",
      breakCost: 14,
    },
    {
      id: "wait_more",
      text: "岛民说：再等等，更熟再采。差一天而已。",
      tempt: "delay",
      breakCost: 12,
    },
  ];

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randInt(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function generateWeather(seedStr) {
    const rng = mulberry32(hashSeed(seedStr + ":weather"));
    const seq = [];
    for (let i = 0; i < TOTAL_DAYS; i++) {
      const r = rng();
      if (r < 0.30) seq.push("sunny");
      else if (r < 0.72) seq.push("cloudy");
      else seq.push("storm");
    }
    return seq;
  }

  function rollYield(rng, plot, weather, boostStormOnPick = false) {
    const table = {
      steady: { sunny: [1, 2], cloudy: [1, 1], storm: [0, 1] },
      sweet: { sunny: [3, 6], cloudy: [-1, 2], storm: [-8, -3] },
      legend: { sunny: [8, 15], cloudy: [-5, 0], storm: [-20, -10] },
    };
    let [lo, hi] = table[plot][weather];
    if (boostStormOnPick && weather === "storm" && plot !== "steady") {
      lo -= 2;
      hi -= 1;
    }
    return randInt(rng, lo, hi);
  }

  // Slightly more often ripe on sunny late-game so rules aren't always "skip sunny"
  function sweetRipe(day, weather, bag) {
    if (weather === "storm") return true;
    if (weather === "cloudy" && day % 3 === 0) return true;
    if (bag < 95 && weather !== "sunny") return true;
    if (day >= 8 && weather === "cloudy") return true;
    if (day >= 9 && weather === "sunny" && bag < 105) return true;
    return false;
  }

  const $ = (id) => document.getElementById(id);
  const screens = {
    start: $("screen-start"),
    play: $("screen-play"),
    end: $("screen-end"),
  };

  function show(name) {
    Object.entries(screens).forEach(([k, el]) => {
      el.classList.toggle("hidden", k !== name);
    });
  }

  function setSeedInput(v) {
    $("seed-input").value = v;
  }

  function randomSeed() {
    const words = ["tide", "moss", "rain", "nut", "leaf", "bay", "fog", "palm"];
    const w = words[Math.floor(Math.random() * words.length)];
    return `${w}-${Math.floor(Math.random() * 9000 + 1000)}`;
  }

  let state = null;
  // Remember last finished run for compare hint on next finish of same seed
  let lastFinished = null;

  function freshState(seed, strategy) {
    return {
      seed,
      strategy,
      weather: generateWeather(seed),
      day: 0,
      bag: START_BAG,
      peak: START_BAG,
      maxDrawdown: 0,
      process: 100,
      followedRumor: 0,
      ignoredRumor: 0,
      justPickedRain: 0,
      skippedSunny: 0,
      allocations: { steady: 0, sweet: 0, legend: 0 },
      lastPlot: null,
      pendingDelay: false,
      rumorActive: null,
      planned: null,
      log: [],
      finished: false,
      yieldRng: mulberry32(hashSeed(seed + ":yield")),
      eventRng: mulberry32(hashSeed(seed + ":event")),
    };
  }

  function log(msg) {
    state.log.unshift(msg);
    $("log").innerHTML = state.log
      .slice(0, 40)
      .map((m) => `<li>${m}</li>`)
      .join("");
  }

  function updateDrawdown() {
    if (state.bag > state.peak) state.peak = state.bag;
    const dd = (state.bag / state.peak - 1) * 100;
    if (dd < state.maxDrawdown) state.maxDrawdown = dd;
  }

  function renderPlots(highlight, deltas) {
    const wrap = $("plots");
    wrap.innerHTML = Object.values(PLOTS)
      .map((p) => {
        const d = deltas?.[p.id];
        let deltaHtml = '<p class="delta zero">—</p>';
        if (typeof d === "number") {
          const cls = d > 0 ? "pos" : d < 0 ? "neg" : "zero";
          const sign = d > 0 ? "+" : "";
          deltaHtml = `<p class="delta ${cls}">${sign}${d}</p>`;
        }
        const planned =
          state?.planned?.plot === p.id ? " active" : highlight === p.id ? " active" : "";
        return `
          <article class="plot${planned}">
            <h3>${p.name}</h3>
            <p class="meta">${p.vibe}</p>
            ${deltaHtml}
          </article>`;
      })
      .join("");
  }

  function renderWeather(w) {
    const meta = WEATHER[w];
    $("weather-block").className = `weather-block ${w}`;
    $("weather-icon").textContent = meta.icon;
    $("weather-name").textContent = meta.name;
    $("weather-desc").textContent = meta.desc;
  }

  function updateStatus() {
    $("day-label").textContent = `${state.day} / ${TOTAL_DAYS}`;
    $("bag-label").textContent = String(Math.round(state.bag));
    $("strat-label").textContent = STRATEGY_LABEL[state.strategy];
    $("seed-label").textContent = state.seed;
  }

  function clearBoxes() {
    $("event-box").classList.add("hidden");
    $("event-box").textContent = "";
    $("rumor-box").classList.add("hidden");
    $("rumor-box").textContent = "";
    state.rumorActive = null;
    $("btn-obey").disabled = true;
    $("btn-ignore").disabled = true;
    $("btn-next").disabled = false;
  }

  function showEvent(text) {
    const box = $("event-box");
    box.textContent = text;
    box.classList.remove("hidden");
  }

  function ripeLabel(day, weather, bag) {
    const ok = sweetRipe(day, weather, bag);
    return {
      ok,
      text: ok
        ? "甜果熟度：够（按混合规矩可以采甜果）"
        : "甜果熟度：不够（按混合规矩今天空过甜果，可能少赚，也可能少挨打）",
    };
  }

  /** Peek plan without mutating counters */
  function peekAllocation(weather, dayIndex) {
    if (state.pendingDelay) {
      return {
        plot: "steady",
        note: "你拖了一天，只能先采坚果。",
        reason: "delay",
      };
    }
    if (state.strategy === "steady") {
      return { plot: "steady", note: "采法：只进坚果林。", reason: "steady" };
    }
    if (state.strategy === "rules") {
      if (sweetRipe(dayIndex, weather, state.bag)) {
        return { plot: "sweet", note: "采法：熟度够 → 采甜果林。", reason: "ripe" };
      }
      if (weather === "sunny") {
        return {
          plot: "steady",
          note: "采法：熟度不够 → 空过甜果，守坚果。",
          reason: "skip_sunny",
        };
      }
      return { plot: "steady", note: "采法：回坚果林。", reason: "steady_fallback" };
    }
    if (weather === "sunny") {
      return { plot: "legend", note: "采法：晴天追传说果。", reason: "follow_sun" };
    }
    if (weather === "storm") {
      return { plot: "legend", note: "采法：暴雨还想抄传说果……", reason: "follow_storm" };
    }
    return { plot: "sweet", note: "采法：阴天采甜果凑热闹。", reason: "follow_cloud" };
  }

  function commitPlanSideEffects(plan, weather) {
    if (plan.reason === "skip_sunny" || (state.pendingDelay && weather === "sunny")) {
      state.skippedSunny += 1;
    }
    if (state.pendingDelay) state.pendingDelay = false;
  }

  function renderPlan(plan, weather, dayIndex) {
    state.planned = plan;
    $("plan-text").textContent = `${plan.note} → ${PLOTS[plan.plot].name}`;
    const ripeEl = $("ripe-text");
    if (state.strategy === "rules") {
      const r = ripeLabel(dayIndex, weather, state.bag);
      ripeEl.textContent = r.text;
      ripeEl.className = `ripe-text ${r.ok ? "ok" : "no"}`;
    } else {
      ripeEl.textContent = "";
      ripeEl.className = "ripe-text";
    }
    renderPlots(plan.plot, null);
  }

  function maybeShowRumor(dayIndex) {
    if (![3, 6, 9].includes(dayIndex)) return false;
    const rumor = RUMORS[(dayIndex / 3 - 1) % RUMORS.length];
    state.rumorActive = rumor;
    const box = $("rumor-box");
    box.innerHTML = `<strong>岛民传言</strong><br>${rumor.text}<br><span style="opacity:.8">听了不保证亏，守了不保证赚。先选听或不听。</span>`;
    box.classList.remove("hidden");
    $("btn-obey").disabled = false;
    $("btn-ignore").disabled = false;
    $("btn-next").disabled = true;
    return true;
  }

  function applyRumorObey(rumor, weather) {
    state.followedRumor += 1;
    state.process = Math.max(0, state.process - rumor.breakCost);

    if (rumor.tempt === "legend") {
      return { plot: "legend", note: "你听了传言，冲进传说果。", reason: "rumor" };
    }
    if (rumor.tempt === "cash") {
      state.pendingDelay = true;
      return {
        plot: "steady",
        note: "你想搬家躲雨，但今天还挪不走，先采坚果。",
        reason: "rumor",
      };
    }
    if (rumor.tempt === "dump_sweet") {
      return { plot: "steady", note: "你清掉甜果，缩回坚果林。", reason: "rumor" };
    }
    if (rumor.tempt === "delay") {
      state.pendingDelay = true;
      return {
        plot: "steady",
        note: "你决定再等等——今天错过了本可采的窗口。",
        reason: "rumor",
      };
    }
    return peekAllocation(weather, state.day);
  }

  function resolveDay(choice) {
    const dayIndex = state.day;
    const weather = state.weather[dayIndex - 1];
    commitPlanSideEffects(choice, weather);

    const boost =
      state.lastPlot &&
      state.lastPlot !== "steady" &&
      weather === "storm" &&
      state.eventRng() < 0.55;

    let delta = rollYield(state.yieldRng, choice.plot, weather, boost);
    if (choice.plot === "steady" && delta === 0 && state.yieldRng() < 0.4) {
      delta = 1;
    }

    state.bag += delta;
    state.allocations[choice.plot] += 1;
    updateDrawdown();

    const deltas = { steady: null, sweet: null, legend: null };
    deltas[choice.plot] = delta;
    state.planned = null;
    renderPlots(choice.plot, deltas);

    if (boost) {
      state.justPickedRain += 1;
      showEvent("你刚采完，天就黑了。按规矩采的，照样挨暴雨。");
    }

    const sign = delta > 0 ? "+" : "";
    log(
      `第${dayIndex}天·${WEATHER[weather].name}｜${choice.note} → ${PLOTS[choice.plot].name} ${sign}${delta}｜背包 ${Math.round(state.bag)}`
    );

    state.lastPlot = choice.plot;
    updateStatus();

    if (dayIndex >= TOTAL_DAYS) finish();
  }

  function beginDay() {
    clearBoxes();
    state.day += 1;
    const weather = state.weather[state.day - 1];
    renderWeather(weather);
    updateStatus();

    const plan = peekAllocation(weather, state.day);
    renderPlan(plan, weather, state.day);

    const hasRumor = maybeShowRumor(state.day);
    if (!hasRumor) $("btn-next").disabled = false;
  }

  function onNext() {
    if (state.finished || state.rumorActive) return;
    const weather = state.weather[state.day - 1];
    const choice = peekAllocation(weather, state.day);
    if (state.strategy === "rules" && choice.plot !== "legend") {
      state.process = Math.min(100, state.process + 1);
    }
    resolveDay(choice);
    if (!state.finished) beginDay();
  }

  function onObey() {
    if (!state.rumorActive) return;
    const rumor = state.rumorActive;
    const weather = state.weather[state.day - 1];
    state.rumorActive = null;
    $("btn-obey").disabled = true;
    $("btn-ignore").disabled = true;
    $("btn-next").disabled = false;
    $("rumor-box").classList.add("hidden");

    const choice = applyRumorObey(rumor, weather);
    renderPlan(choice, weather, state.day);
    log(`传言：你选择听从。过程 -${rumor.breakCost}`);
    resolveDay(choice);
    if (!state.finished) beginDay();
  }

  function onIgnore() {
    if (!state.rumorActive) return;
    state.ignoredRumor += 1;
    state.rumorActive = null;
    $("btn-obey").disabled = true;
    $("btn-ignore").disabled = true;
    $("btn-next").disabled = false;
    $("rumor-box").classList.add("hidden");

    state.process = Math.min(100, state.process + 8);
    const weather = state.weather[state.day - 1];
    const choice = peekAllocation(weather, state.day);
    renderPlan(choice, weather, state.day);
    log("传言：你选择不听，守自己的采法。过程 +8");
    resolveDay(choice);
    if (!state.finished) beginDay();
  }

  function gradeResult(bag) {
    if (bag >= 160) return { label: "很高", tip: "果子很多——也可能只是天气罩着你。" };
    if (bag >= 125) return { label: "中上", tip: "收成不错，但单局说明不了采法好坏。" };
    if (bag >= 95) return { label: "中等", tip: "没发财，也没翻船。" };
    if (bag >= 70) return { label: "偏弱", tip: "背包瘪了。可能是采法，也可能只是雨季。" };
    return { label: "很差", tip: "摔得不轻。跟风硬扛暴雨时常见。" };
  }

  function gradeProcess(p) {
    if (p >= 90) return { label: "很好", tip: "大多时候守住了自己的采法。" };
    if (p >= 70) return { label: "还行", tip: "被传言带偏过，但没完全失控。" };
    if (p >= 45) return { label: "摇摆", tip: "听了不少岛民的话。" };
    return { label: "很乱", tip: "过程被传言牵着走。" };
  }

  function buildVerdict(resultG, processG) {
    if (resultG.label === "很高" && processG.label === "很乱") {
      return "结果好看，过程很乱。这局运气罩着你，不是采法罩着你。";
    }
    if (["偏弱", "很差"].includes(resultG.label) && processG.label === "很好") {
      return "这一局果子不多，但你没在暴雨天乱跑。选对，不保证好看。";
    }
    if (resultG.label === "很高" && processG.label === "很好") {
      return "结果与过程都漂亮——享受，但别当成每次都能复制。";
    }
    if (state.strategy === "follow") {
      return "跟风晃得大：有时果子多，有时摔得狠。换同一天气再比一次才看得出来。";
    }
    if (state.strategy === "steady") {
      return "坚果路线：稳、少第一。睡得着，但很少亮眼。";
    }
    return "混合规矩更在乎「别摔太惨」，不是每一局果子最多。";
  }

  function buildCompareBox(resultG) {
    const box = $("compare-box");
    const lines = [];

    lines.push(
      `<strong>建议下一步：</strong>点下面「同一天气 · 换采法」，天气编号别改，只换一种采法再玩。`
    );

    if (state.strategy === "follow" && ["很高", "中上"].includes(resultG.label)) {
      lines.push(
        `这局跟风果子不少——<strong>果子多不等于采法更稳</strong>。用同一串晴雨再跑「混合规矩」或「全程坚果」，看看回撤差多少。`
      );
    }
    if (state.strategy === "rules" && ["偏弱", "很差"].includes(resultG.label)) {
      lines.push(
        `这局规矩对了也可能果子少。不是坏了：同一天气换「跟岛民」再开，常会看到另一种晃法。`
      );
    }
    if (lastFinished && lastFinished.seed === state.seed && lastFinished.strategy !== state.strategy) {
      lines.push(
        `对比刚才：${STRATEGY_LABEL[lastFinished.strategy]} 期末 ${lastFinished.bag}（回撤 ${lastFinished.maxDrawdown.toFixed(1)}%）→ 这次 ${STRATEGY_LABEL[state.strategy]} 期末 ${Math.round(state.bag)}（回撤 ${state.maxDrawdown.toFixed(1)}%）。`
      );
    }

    box.innerHTML = lines.map((l) => `<p style="margin:0.35rem 0">${l}</p>`).join("");
  }

  function finish() {
    state.finished = true;
    show("end");

    const resultG = gradeResult(state.bag);
    const processG = gradeProcess(state.process);
    $("result-score").textContent = String(Math.round(state.bag));
    $("result-note").textContent = `结果：${resultG.label} · ${resultG.tip}`;
    $("process-score").textContent = String(Math.round(state.process));
    $("process-note").textContent = `过程：${processG.label} · ${processG.tip}`;
    $("verdict").textContent = buildVerdict(resultG, processG);
    buildCompareBox(resultG);

    const alloc = state.allocations;
    $("end-stats").innerHTML = `
      <li>天气编号：<code>${state.seed}</code></li>
      <li>采法：${STRATEGY_LABEL[state.strategy]}</li>
      <li>最大回撤：${state.maxDrawdown.toFixed(1)}%</li>
      <li>去过哪：坚果 ${alloc.steady} · 甜果 ${alloc.sweet} · 传说 ${alloc.legend}</li>
      <li>刚采完就下雨：${state.justPickedRain} 次</li>
      <li>听传言 / 不听：${state.followedRumor} / ${state.ignoredRumor}</li>
      <li>因规矩空过晴天：${state.skippedSunny} 次</li>
    `;

    lastFinished = {
      seed: state.seed,
      strategy: state.strategy,
      bag: Math.round(state.bag),
      maxDrawdown: state.maxDrawdown,
    };
  }

  function startGame(seed, strategy) {
    state = freshState(seed, strategy);
    show("play");
    $("log").innerHTML = "";
    log(`开局背包 ${START_BAG}。采法：${STRATEGY_LABEL[strategy]}。晴雨已写好，改不了。`);
    beginDay();
  }

  setSeedInput(randomSeed());
  $("btn-random-seed").addEventListener("click", () => setSeedInput(randomSeed()));

  $("btn-start").addEventListener("click", () => {
    const seed = ($("seed-input").value || "").trim() || randomSeed();
    setSeedInput(seed);
    const strategy = document.querySelector('input[name="strategy"]:checked').value;
    startGame(seed, strategy);
  });

  $("btn-next").addEventListener("click", onNext);
  $("btn-obey").addEventListener("click", onObey);
  $("btn-ignore").addEventListener("click", onIgnore);

  $("btn-replay-same").addEventListener("click", () => {
    show("start");
    setSeedInput(state.seed);
  });

  $("btn-new-seed").addEventListener("click", () => {
    show("start");
    setSeedInput(randomSeed());
  });

  renderPlots(null, null);
})();
