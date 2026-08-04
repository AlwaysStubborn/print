(() => {
  const TOTAL_DAYS = 12;
  const START_BAG = 100;

  const WEATHER = {
    sunny: {
      id: "sunny",
      name: "晴天",
      icon: "☀",
      desc: "产量偏旺。传说果可能疯长，也可能只是普通好天气。",
    },
    cloudy: {
      id: "cloudy",
      name: "阴天",
      icon: "☁",
      desc: "产量普通。甜果林可能晃一下，坚果林几乎无感。",
    },
    storm: {
      id: "storm",
      name: "暴雨",
      icon: "⛈",
      desc: "果园遭冲刷。追传说果最疼；坚果林相对扛得住。",
    },
  };

  const PLOTS = {
    steady: { id: "steady", name: "坚果林", vibe: "稳，像收息的底仓" },
    sweet: { id: "sweet", name: "甜果林", vibe: "晃，但长期往往过得去" },
    legend: { id: "legend", name: "传说果", vibe: "偶尔暴富，经常挨打" },
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

  // ---------- RNG ----------
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

  function pick(rng, arr) {
    return arr[Math.floor(rng() * arr.length)];
  }

  function generateWeather(seedStr) {
    const rng = mulberry32(hashSeed(seedStr + ":weather"));
    const seq = [];
    for (let i = 0; i < TOTAL_DAYS; i++) {
      const r = rng();
      // More cloudy than extremes — storm is painful but not constant
      if (r < 0.30) seq.push("sunny");
      else if (r < 0.72) seq.push("cloudy");
      else seq.push("storm");
    }
    return seq;
  }

  // Yield tables: ranges [min,max] by weather
  function rollYield(rng, plot, weather, boostStormOnPick = false) {
    const table = {
      steady: {
        sunny: [1, 2],
        cloudy: [1, 1],
        storm: [0, 1],
      },
      sweet: {
        sunny: [3, 6],
        cloudy: [-1, 2],
        storm: [-8, -3],
      },
      legend: {
        sunny: [8, 15],
        cloudy: [-5, 0],
        storm: [-20, -10],
      },
    };

    let [lo, hi] = table[plot][weather];
    // Just-picked rain: amplify sweet/legend storm pain (correct choice still hurts)
    if (boostStormOnPick && weather === "storm" && plot !== "steady") {
      lo -= 2;
      hi -= 1;
    }
    return randInt(rng, lo, hi);
  }

  // Sweet "ripeness" gate for rules strategy — proxy for valuation threshold
  function sweetRipe(day, weather, bag) {
    // Ripeness rises after storms / when bag dipped — "cheaper"
    // Not always ripe: sometimes correct to skip (and then miss a sunny day)
    if (weather === "storm") return true;
    if (weather === "cloudy" && day % 3 === 0) return true;
    if (bag < 95 && weather !== "sunny") return true;
    if (day >= 8 && weather === "cloudy") return true;
    return false;
  }

  // ---------- DOM ----------
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

  // ---------- State ----------
  let state = null;

  function freshState(seed, strategy) {
    const weather = generateWeather(seed);
    return {
      seed,
      strategy,
      weather,
      day: 0, // 0-based before advance
      bag: START_BAG,
      peak: START_BAG,
      maxDrawdown: 0,
      process: 100,
      brokeRules: 0,
      followedRumor: 0,
      ignoredRumor: 0,
      justPickedRain: 0,
      skippedSunny: 0,
      allocations: { steady: 0, sweet: 0, legend: 0, cash: 0 },
      lastPlot: null,
      pendingDelay: false,
      rumorActive: null,
      log: [],
      finished: false,
      yieldRng: mulberry32(hashSeed(seed + ":yield")),
      eventRng: mulberry32(hashSeed(seed + ":event")),
    };
  }

  function log(msg) {
    state.log.unshift(msg);
    const ol = $("log");
    ol.innerHTML = state.log
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
        return `
          <article class="plot ${highlight === p.id ? "active" : ""}">
            <h3>${p.name}</h3>
            <p class="meta">${p.vibe}</p>
            ${deltaHtml}
          </article>`;
      })
      .join("");
  }

  function renderWeather(w) {
    const meta = WEATHER[w];
    const block = $("weather-block");
    block.className = `weather-block ${w}`;
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

  function maybeShowRumor(dayIndex) {
    // Rumors on days 3,6,9 (1-based: 3,6,9)
    if (![3, 6, 9].includes(dayIndex)) return false;
    const rumor = RUMORS[(dayIndex / 3 - 1) % RUMORS.length];
    state.rumorActive = rumor;
    const box = $("rumor-box");
    box.innerHTML = `<strong>岛民传言</strong><br>${rumor.text}<br><span style="opacity:.8">你可以听，也可以守规矩。听了不保证亏，守了不保证赚。</span>`;
    box.classList.remove("hidden");
    $("btn-obey").disabled = false;
    $("btn-ignore").disabled = false;
    $("btn-next").disabled = true;
    return true;
  }

  // Decide allocation for this day under strategy (before rumor override)
  function planAllocation(weather, dayIndex) {
    if (state.pendingDelay) {
      state.pendingDelay = false;
      // Delayed: sit in cash/steady — may miss sunny
      if (weather === "sunny") state.skippedSunny += 1;
      return { plot: "steady", note: "你拖了一天，只能先采坚果。" };
    }

    if (state.strategy === "steady") {
      return { plot: "steady", note: "按策略：只进坚果林。" };
    }

    if (state.strategy === "rules") {
      if (sweetRipe(dayIndex, weather, state.bag)) {
        return { plot: "sweet", note: "规矩：熟度够，采甜果林。" };
      }
      if (weather === "sunny") {
        // Correct skip can miss boom — intentional
        state.skippedSunny += 1;
        return { plot: "steady", note: "规矩：熟度不够，空甜果，守坚果。（可能踏空晴天）" };
      }
      return { plot: "steady", note: "规矩：回坚果林打底。" };
    }

    // follow: chase legend on sunny / after rumors bias; otherwise sweet
    if (weather === "sunny") {
      return { plot: "legend", note: "跟风：晴天追传说果。" };
    }
    if (weather === "storm") {
      // followers often panic-hold legend or dump late — still exposed
      return { plot: "legend", note: "跟风：还想抄传说果的底……" };
    }
    return { plot: "sweet", note: "跟风：阴天先采甜果凑热闹。" };
  }

  function applyRumorObey(rumor, weather, dayIndex) {
    state.followedRumor += 1;
    state.brokeRules += 1;
    state.process = Math.max(0, state.process - rumor.breakCost);

    if (rumor.tempt === "legend") {
      return { plot: "legend", note: "你听了传言，冲进传说果。" };
    }
    if (rumor.tempt === "cash") {
      // "move away" = all steady next feel, but delayed
      state.pendingDelay = true;
      return { plot: "steady", note: "你想搬家躲雨，但今天还挪不走，只能先采坚果。" };
    }
    if (rumor.tempt === "dump_sweet") {
      return { plot: "steady", note: "你清掉甜果配额，缩回坚果林。" };
    }
    if (rumor.tempt === "delay") {
      state.pendingDelay = true;
      if (weather === "sunny") state.skippedSunny += 1;
      return { plot: "steady", note: "你决定再等等——今天错过了本可采的窗口。" };
    }
    return planAllocation(weather, dayIndex);
  }

  function resolveDay(choice) {
    const dayIndex = state.day;
    const weather = state.weather[dayIndex - 1];
    const boost =
      state.lastPlot &&
      state.lastPlot !== "steady" &&
      weather === "storm" &&
      state.eventRng() < 0.55;

    let delta = rollYield(state.yieldRng, choice.plot, weather, boost);
    // Tiny steady drip so "bond-like" feels alive on quiet days
    if (choice.plot === "steady" && delta === 0 && state.yieldRng() < 0.4) {
      delta = 1;
    }

    state.bag += delta;
    state.allocations[choice.plot] += 1;
    updateDrawdown();

    const deltas = { steady: null, sweet: null, legend: null };
    deltas[choice.plot] = delta;
    renderPlots(choice.plot, deltas);

    let eventText = "";
    if (boost) {
      state.justPickedRain += 1;
      eventText = "你刚采完，天就黑了。规矩内的采摘，照样挨暴雨。";
      showEvent(eventText);
    }

    const sign = delta > 0 ? "+" : "";
    log(
      `第${dayIndex}日·${WEATHER[weather].name}｜${choice.note} → ${PLOTS[choice.plot].name} ${sign}${delta}｜背包 ${Math.round(state.bag)}`
    );

    state.lastPlot = choice.plot;
    updateStatus();

    if (dayIndex >= TOTAL_DAYS) {
      finish();
    }
  }

  function beginDay() {
    clearBoxes();
    state.day += 1;
    const weather = state.weather[state.day - 1];
    renderWeather(weather);
    renderPlots(null, null);
    updateStatus();

    const hasRumor = maybeShowRumor(state.day);
    if (!hasRumor) {
      // auto path ready via next button
      $("btn-next").disabled = false;
    }
  }

  function onNext() {
    if (state.finished || state.rumorActive) return;
    const weather = state.weather[state.day - 1];
    const choice = planAllocation(weather, state.day);
    // rules strategy ignoring sunny sweet: process stays high
    if (state.strategy === "rules" && choice.plot !== "legend") {
      // small process tick for sticking to plan
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

    const choice = applyRumorObey(rumor, weather, state.day);
    log(`传言干扰：你选择听从。过程分 -${rumor.breakCost}`);
    resolveDay(choice);
    if (!state.finished) beginDay();
  }

  function onIgnore() {
    if (!state.rumorActive) return;
    const rumor = state.rumorActive;
    state.ignoredRumor += 1;
    state.rumorActive = null;
    $("btn-obey").disabled = true;
    $("btn-ignore").disabled = true;
    $("btn-next").disabled = false;
    $("rumor-box").classList.add("hidden");

    // Ignoring rumor = process bonus
    state.process = Math.min(100, state.process + 8);
    const weather = state.weather[state.day - 1];
    const choice = planAllocation(weather, state.day);
    log("传言干扰：你选择不听，守自己的规矩。过程分 +8");
    resolveDay(choice);
    if (!state.finished) beginDay();
  }

  function gradeResult(bag) {
    if (bag >= 160) return { label: "很高", tip: "这局果子很多——也可能只是天气罩着你。" };
    if (bag >= 125) return { label: "中上", tip: "收成不错，但单局说明不了规矩好坏。" };
    if (bag >= 95) return { label: "中等", tip: "没发财，也没翻船。" };
    if (bag >= 70) return { label: "偏弱", tip: "背包瘪了。可能是规矩问题，也可能只是雨季。" };
    return { label: "很差", tip: "接近采空。跟风或硬扛暴雨时常见。" };
  }

  function gradeProcess(p) {
    if (p >= 90) return { label: "很好", tip: "你大多时候守住了规矩。" };
    if (p >= 70) return { label: "还行", tip: "被传言带偏过，但没完全失控。" };
    if (p >= 45) return { label: "摇摆", tip: "听了不少岛民的话。" };
    return { label: "很乱", tip: "过程被传言牵着走。" };
  }

  function buildVerdict(resultG, processG) {
    if (resultG.label === "很高" && processG.label === "很乱") {
      return "结果好看，过程很乱。这局运气罩着你，不是规矩罩着你。";
    }
    if (["偏弱", "很差"].includes(resultG.label) && processG.label === "很好") {
      return "这一局没发财，但你没在暴雨天清仓。选对，不保证好看。";
    }
    if (resultG.label === "很高" && processG.label === "很好") {
      return "结果与过程都漂亮——享受，但别当成可复制的预言。";
    }
    if (state.strategy === "follow") {
      return "跟风策略方差大：有时第一，有时崩。多开几局才看得见。";
    }
    if (state.strategy === "steady") {
      return "坚果林路线：波动小、终局常中等。你睡得着，但很少第一。";
    }
    return "混合规矩提高的是「最差情况没那么惨」的概率，不是每一局必赢。";
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

    const alloc = state.allocations;
    $("end-stats").innerHTML = `
      <li>天气种子：<code>${state.seed}</code></li>
      <li>策略：${STRATEGY_LABEL[state.strategy]}</li>
      <li>最大回撤：${state.maxDrawdown.toFixed(1)}%</li>
      <li>采摘分布：坚果 ${alloc.steady} · 甜果 ${alloc.sweet} · 传说 ${alloc.legend}</li>
      <li>刚采完就下雨：${state.justPickedRain} 次</li>
      <li>听从传言 / 拒绝传言：${state.followedRumor} / ${state.ignoredRumor}</li>
      <li>因规矩踏空晴天：${state.skippedSunny} 次</li>
    `;
  }

  function startGame(seed, strategy) {
    state = freshState(seed, strategy);
    show("play");
    $("log").innerHTML = "";
    log(`开局背包 ${START_BAG}。策略：${STRATEGY_LABEL[strategy]}。天气已写好，你改不了。`);
    beginDay();
  }

  // ---------- Wire UI ----------
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
