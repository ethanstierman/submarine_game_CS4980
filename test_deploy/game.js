(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $("game"),
    ctx = canvas.getContext("2d"),
    lightCanvas = document.createElement("canvas"),
    lightCtx = lightCanvas.getContext("2d"),
    radar = $("radar"),
    rctx = radar.getContext("2d");
  let pixelRatio = 1;
  const world = new GameWorld();
  const SAVE_KEY = "abyssal_reckoning_save_v1";
  let active = false,
    last = 0,
    soundOn = false,
    toastTimer = 0,
    keys = {},
    pendingPing = false,
    audioVisualAssist = true,
    shake = 0;
  let selectedLevel = LEVELS[0],
    daily = { ...DAILY_LEVEL, seed: dailySeed() };
  document.body.classList.add("high-contrast");
  function loadSave() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }
  function saveResult(level, result) {
    const data = loadSave(),
      previous = data[level.id] || {};
    data[level.id] = {
      stars: Math.max(previous.stars || 0, result.stars),
      bestTime: result.won
        ? Math.min(previous.bestTime || Infinity, result.time)
        : previous.bestTime,
      ghost: !!previous.ghost || result.ghost,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (_) {}
  }
  function fmt(seconds) {
    const m = Math.floor(seconds / 60),
      s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  function creatureLabel(subtype) {
    switch (String(subtype || "").toLowerCase()) {
      case "lurker":
      case "stalker":
      case "shade_stalker":
        return "SHADE STALKER";
      case "magnetar":
        return "MAGNETAR EMP";
      case "listener":
        return "LISTENER";
      default:
        return "UNKNOWN BIOLOGICAL CONTACT";
    }
  }
  function threatCount(level) {
    return (
      level.mines +
      (level.vents || 0) +
      (level.pylonCount || 0) +
      level.batteries +
      Object.values(level.enemies).reduce((a, b) => a + b, 0)
    );
  }
  function renderMissions() {
    const host = $("mission-select"),
      records = loadSave();
    host.innerHTML = "";
    [...LEVELS, daily].forEach((level, index) => {
      const rec = records[level.id] || {},
        card = document.createElement("button");
      card.type = "button";
      card.className = `mission-card${selectedLevel.id === level.id ? " selected" : ""}`;
      card.innerHTML = `<span class="mission-card-depth">${level.depth === "DAILY" ? "DAILY TRENCH" : `DEPTH ${level.depth}M`}</span><strong>${level.title}</strong><small>${"★".repeat(rec.stars || 0)}${"☆".repeat(3 - (rec.stars || 0))} &nbsp; BEST ${rec.bestTime ? fmt(rec.bestTime) : "—"}</small><small>${rec.ghost ? "◈ GHOST SUB EARNED" : "GHOST SUB —"}${level.id === "daily" ? ` · ${new Date().toISOString().slice(0, 10)}` : ""}</small><span class="mission-dive">DIVE ↗</span>`;
      card.addEventListener("click", () => {
        selectedLevel = level;
        updateSelected();
        renderMissions();
        openMissionBriefing(level);
      });
      host.appendChild(card);
    });
  }
  function updateSelected() {
    const l = selectedLevel;
    $("selected-depth").innerHTML =
      l.depth === "DAILY" ? "DAILY" : `${l.depth} <sup>M</sup>`;
    $("selected-threats").innerHTML =
      `${String(threatCount(l)).padStart(2, "0")} <sup>HAZARDS</sup>`;
    $("selected-seed").textContent = l.seed;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(),
      dpr = pixelRatio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lightCanvas.width = canvas.width;
    lightCanvas.height = canvas.height;
    lightCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rr = radar.getBoundingClientRect();
    radar.width = Math.max(1, rr.width * dpr);
    radar.height = Math.max(1, rr.height * dpr);
    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  function start(level = selectedLevel) {
    selectedLevel = level;
    world.reset(level);
    world.player.estX = world.player.x;
    world.player.estY = world.player.y;
    active = true;
    last = performance.now();
    keys = {};
    pendingPing = false;
    $("briefing").classList.add("hidden");
    $("mission-briefing").classList.add("hidden");
    $("play-screen").classList.remove("hidden");
    $("end-modal").classList.add("hidden");
    $("mission-status").textContent = "IN TRANSIT";
    $("pause-button").innerHTML = "Ⅱ <span>PAUSE MISSION</span>";
    $("tactical-comms").textContent = level.banner;
    $("tactical-comms").classList.remove("hidden");
    setTimeout(() => $("tactical-comms").classList.add("hidden"), 7000);
    requestAnimationFrame(resize);
    requestAnimationFrame(frame);
  }
  function frame(now) {
    if (!active) return;
    if (world.paused) {
      draw(now);
      return;
    }
    const dt = Math.min(0.04, (now - last) / 1000 || 0);
    last = now;
    const input = { ping: pendingPing };
    pendingPing = false;
    Object.keys(keys).forEach((k) => {
      if (keys[k]) input[k] = true;
    });
    world.update(dt, input);
    GameAudio.updateEngineSound(input.forward || input.back ? 1 : 0, Math.min(1, world.player.speed / 150), !!input.silent);
    GameAudio.updateMagnetarHum(world.empIntensity, Math.max(-1, Math.min(1, Math.sin(world.empBearing))));
    processEvents();
    draw(now);
    updateHud();
    if (world.over) {
      active = false;
      showEnd();
      return;
    }
    requestAnimationFrame(frame);
  }
  function processEvents() {
    for (const e of world.events.splice(0)) {
      if (e.type === "ping") {
        const ping = world.pings[world.pings.length - 1];
        playSonarAudio(ping);
        const first = ping?.hits?.slice().sort((a,b) => a.dist - b.dist)[0];
        if (first) showToast({ STONE: "[ECHO: CAVERN WALL]", MINE: "[ECHO: BIO-MINE]", PYLON: "[ECHO: RELAY PYLON]", FLESH: `[HYDROPHONE: ${creatureLabel(first.subtype)}]`, BEACON: "[SIGNAL: EXIT BEACON]", BATTERY: "[SIGNAL: BATTERY CELL]" }[first.kind] || "[ECHO: CAVERN WALL]");
      }
      if (e.type === "flesh-echo") GameAudio.playCreatureEcho(0, e.pan, e.distNorm);
      if (e.type === "enemy-vocal") GameAudio.playCreatureVocalization(e.enemyType, e.pan, e.distNorm);
      if (e.type === "magnetar-lock") GameAudio.playCreatureVocalization("HUNTER", e.pan, e.distNorm);
      if (e.type === "magnetar-emp") { GameAudio.playMagnetarDischarge(); shake = Math.max(shake, 18); showToast("[HYDROPHONE: MAGNETAR EMP]"); }
      if (e.type === "pylon-activated") {
        GameAudio.playRelayActivation();
        showToast(e.firstCharge ? "[RELAY IGNITED: +3 SONAR CHARGES]" : "[RELAY PYLON: LIGHT REIGNITED · 6.0s]");
      }
      if (e.type === "enemy-passive") GameAudio.playCreatureEcho(0, e.pan, Math.min(1, e.distNorm + 0.2));
      if (e.type === "listener-windup") { GameAudio.creatureRattle(); showToast("[HYDROPHONE: LISTENER]"); }
      if (e.type === "wall-stun") { GameAudio.creatureImpact(); shake = Math.max(shake, 10); }
      if (e.type === "enemy-mine-kill") { GameAudio.mineExplosion(); GameAudio.playMagnetarDischarge(); shake = Math.max(shake, 16); }
      if (e.type === "creature-brawl") { GameAudio.creatureImpact(); shake = Math.max(shake, 9); }
      if (e.type === "stalker-tick") { GameAudio.stalkerTick(e.distNorm); if (e.distNorm < .8) showToast("[HYDROPHONE: SHADE STALKER]"); }
      if (e.type === "enemy-vocal") showToast("[HYDROPHONE: LISTENER]");
      if (e.type === "stalker-pinned" || e.type === "stalker-flee") GameAudio.stalkerScreech();
      if (e.type === "tactical-kill") showToast("[THREAT NEUTRALIZED: MINE DETONATION] +500 TACTICAL KILL");
      if (e.type === "decoy-ping") {
        const pan = Math.max(-1, Math.min(1, (e.x - world.player.x) / 500));
        const distNorm = Math.max(0, Math.min(1, Math.hypot(e.x - world.player.x, e.y - world.player.y) / 550));
        GameAudio.enable();
        try { GameAudio.playDecoyPing(Number.isFinite(pan) ? pan : 0, Number.isFinite(distNorm) ? distNorm : 1); } catch (_) {}
        (e.audioHits || []).forEach((hit) => GameAudio.scheduleEcho(hit.delay, hit.pan, hit.distNorm, hit.kind));
      }
      if (e.type === "hit" || e.type === "mine-hit") GameAudio.hit();
      if (e.type === "win") GameAudio.contact();
      if (e.type === "lose") GameAudio.implosion();
      if (e.type === "battery") showToast("BATTERY CELL RECOVERED");
      if (e.type === "charge") {
        GameAudio.enable();
        GameAudio.scheduleEcho(0, 0, 0, "BATTERY");
        showToast(`[SONAR CHARGES: ${world.player.sonarCharges} / ${selectedLevel.levelRules.maxPings}]`);
      }
      if (e.type === "battery-warning") GameAudio.lowBatteryWarning();
      if (e.type === "tether")
        showToast("TETHER SEVERED — PHOSPHOR TRAIL LOST");
      if (e.type === "position-fix") showToast("POSITION FIX ACQUIRED");
      if (e.type === "scrape") { shake = Math.max(shake, 3); const v=document.querySelector(".canvas-wrap"); v.classList.add("impact-flash"); setTimeout(()=>v.classList.remove("impact-flash"),120); }
      if (e.type === "hit" || e.type === "mine-hit") {
        shake = Math.max(shake, e.type === "mine-hit" ? 13 : 6);
        const viewport = document.querySelector(".canvas-wrap");
        viewport.classList.add("impact-flash");
        setTimeout(() => viewport.classList.remove("impact-flash"), 230);
      }
    }
  }
  function playSonarAudio(ping) {
    GameAudio.enable();
    GameAudio.playPingEmit();
    (ping?.audioHits || []).forEach((hit) => GameAudio.scheduleEcho(hit.delay, hit.pan, hit.distNorm, hit.kind));
  }
  function triggerSonarPing(x = world.player.x, y = world.player.y, isPlayer = true) {
    const ping = world.triggerSonarPing(x, y, isPlayer);
    if (!ping) {
      if (isPlayer && Number.isFinite(world.player.sonarCharges) && world.player.sonarCharges <= 0) showToast("[SONAR CAPACITORS DEPLETED]");
      return false;
    }
    playSonarAudio(ping);
    if (isPlayer) {
      const first = ping.hits.slice().sort((a,b) => a.dist - b.dist)[0];
      if (first) showToast({ STONE: "[ECHO: CAVERN WALL]", MINE: "[ECHO: BIO-MINE]", PYLON: "[ECHO: RELAY PYLON]", FLESH: `[HYDROPHONE: ${creatureLabel(first.subtype)}]`, BEACON: "[SIGNAL: EXIT BEACON]", BATTERY: "[SIGNAL: BATTERY CELL]" }[first.kind] || "[ECHO: CAVERN WALL]");
    }
    return true;
  }
  function showToast(message) {
    const el = $("toast");
    el.textContent = message;
    el.style.color = message.includes("CAVERN WALL") ? "#70edff"
      : message.includes("BIO-MINE") ? "#ffc16d"
      : message.includes("LISTENER") ? "#ff6475"
      : message.includes("SHADE STALKER") ? "#bd83f0"
      : message.includes("MAGNETAR EMP") ? "#d97cff"
      : message.includes("EXIT BEACON") ? "#7ff0ae" : "";
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2100);
  }
  function draw(now) {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, rect.width, rect.height);
    const p = world.player;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) { p.x = world.width / 2; p.y = world.height / 2; p.speed = 0; p.estX = p.x; p.estY = p.y; }
    const
      zoom = Math.min(rect.width / 760, rect.height / 570, 1.1),
      vw = rect.width / zoom,
      vh = rect.height / zoom;
    const ox = p.x - vw / 2,
      oy = p.y - vh / 2;
    const hasShake = shake > 0;
    if (hasShake) {
      const amount = shake;
      ctx.save();
      ctx.translate((Math.random() - .5) * amount, (Math.random() - .5) * amount);
      shake *= .82;
    }
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(-ox, -oy);
    world.draw(ctx);
    drawLighting(p, rect, zoom);
    if (p.lamp && p.battery > 0) {
      ctx.save(); ctx.globalCompositeOperation = "screen"; ctx.globalAlpha = .035;
      ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      for (let i = 0; i < 6; i++) {
        const x = 55 + i * 48 + Math.sin(world.elapsed * 1.7 + i) * 7;
        ctx.fillStyle = i % 2 ? "#8edfff" : "#c8efff";
        ctx.beginPath(); ctx.ellipse(x, Math.sin(world.elapsed * 1.1 + i * 2) * 28, 1.4, 38, .12, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // Acoustic information is intentionally composited after the darkness clip.
    world.drawAcousticOverlay(ctx);
    ctx.restore();
    if (hasShake) ctx.restore();
    if (shake <= .2) shake = 0;
    drawHydrophone(rect.width, rect.height, rect.width / 2, rect.height / 2);
    drawCompass(rect.width, rect.height);
    drawRadar(now);
    drawInertialPlotter(rect.width, rect.height);
    if (p.empDisabledTimer > 0) {
      ctx.save(); ctx.textAlign = "center"; ctx.font = "bold 11px monospace";
      ctx.fillStyle = "rgba(10,5,22,.9)"; ctx.fillRect(rect.width / 2 - 130, 12, 260, 25);
      ctx.strokeStyle = "#c47dff"; ctx.strokeRect(rect.width / 2 - 130, 12, 260, 25);
      ctx.fillStyle = "#e0aaff"; ctx.fillText("[SYSTEMS OFFLINE: EMP SURGE]", rect.width / 2, 29); ctx.restore();
    }
    if (p.isMasked) {
      ctx.save(); ctx.font = "bold 11px monospace"; ctx.textAlign = "center";
      const label = "[HULL MASKED: ROCK SILHOUETTE]", width = ctx.measureText(label).width + 20;
      ctx.fillStyle = "rgba(4,24,15,.9)"; ctx.fillRect(rect.width/2-width/2, 12, width, 23);
      ctx.strokeStyle = "#72ff9a"; ctx.strokeRect(rect.width/2-width/2, 12, width, 23);
      ctx.fillStyle = "#9cffb1"; ctx.fillText(label, rect.width/2, 28); ctx.restore();
    }
    if (world.fixFlash > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, world.fixFlash * 1.7);
      ctx.fillStyle = "#b9ffe9"; ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
      ctx.fillText("POSITION FIX ACQUIRED", rect.width / 2, 42); ctx.restore();
    }
  }
  function drawLighting(p, rect, zoom) {
    const cx = rect.width / 2, cy = rect.height / 2;
    lightCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    lightCtx.globalCompositeOperation = "source-over";
    lightCtx.filter = "none";
    lightCtx.clearRect(0, 0, rect.width, rect.height);
    lightCtx.fillStyle = "rgba(0,0,0,1)";
    lightCtx.fillRect(0, 0, rect.width, rect.height);
    lightCtx.globalCompositeOperation = "destination-out";
    const halo = lightCtx.createRadialGradient(cx, cy, 6, cx, cy, 26);
    halo.addColorStop(0, "rgba(140,220,255,.055)");
    halo.addColorStop(.45, "rgba(140,220,255,.028)");
    halo.addColorStop(1, "rgba(140,220,255,0)");
    lightCtx.fillStyle = halo;
    lightCtx.beginPath(); lightCtx.arc(cx, cy, 26, 0, Math.PI * 2); lightCtx.fill();
    if (p.lamp && p.battery > 0) {
      lightCtx.save();
      lightCtx.translate(cx, cy); lightCtx.rotate(p.angle);
      const range = 380 * (p.lampIntensity || 1);
      [[72,.17],[54,.22],[36,.18]].forEach(([spread, opacity]) => {
        const halfAngle = Math.PI * spread / 360;
        const beam = lightCtx.createRadialGradient(0, 0, 12, 0, 0, range);
        beam.addColorStop(0, `rgba(205,235,255,${opacity})`);
        beam.addColorStop(.38, `rgba(175,220,250,${opacity * .76})`);
        beam.addColorStop(.72, `rgba(125,190,230,${opacity * .38})`);
        beam.addColorStop(1, "rgba(85,150,205,0)");
        lightCtx.fillStyle = beam;
        lightCtx.filter = "blur(12px)";
        lightCtx.beginPath(); lightCtx.moveTo(0, 0);
        lightCtx.arc(0, 0, range, -halfAngle, halfAngle);
        lightCtx.closePath(); lightCtx.fill();
      });
      lightCtx.filter = "none";
      lightCtx.restore();
    }
    world.pylons.forEach((pylon) => {
      if (pylon.activeTimer <= 0) return;
      const px = cx + (pylon.x - p.x) * zoom, py = cy + (pylon.y - p.y) * zoom;
      const radius = pylon.maxRadius * zoom;
      const flicker = pylon.activeTimer > 1.5 ? 1 : .42 + Math.random() * .56;
      const dome = lightCtx.createRadialGradient(px, py, 3, px, py, radius);
      dome.addColorStop(0, `rgba(255,242,218,${.98 * flicker})`);
      dome.addColorStop(.72, `rgba(255,225,187,${.94 * flicker})`);
      dome.addColorStop(.94, `rgba(255,205,165,${.76 * flicker})`);
      dome.addColorStop(1, "rgba(255,190,150,0)");
      lightCtx.filter = "none"; lightCtx.globalAlpha = 1; lightCtx.fillStyle = dome;
      lightCtx.beginPath(); lightCtx.arc(px, py, radius, 0, Math.PI * 2); lightCtx.fill();
    });
    lightCtx.globalCompositeOperation = "source-over";
    lightCtx.globalAlpha = 1;
    ctx.save();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.drawImage(lightCanvas, 0, 0, rect.width, rect.height);
    ctx.restore();
  }
  function drawVignette(w, h) {
    const g = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.2,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.74,
    );
    g.addColorStop(0, "transparent");
    g.addColorStop(1, "rgba(1,8,12,.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  function drawCompass(w, h) {
    const p = world.player;
    const emp = world.empIntensity || 0;
    const heading = ((p.angle + Math.sin(world.elapsed * 18) * emp * 2.2) * 180 / Math.PI + 3600) % 360;
    ctx.fillStyle = "#aac1b7";
    ctx.font = "9px monospace";
    ctx.fillText(
      `HDG ${String(Math.round(heading)).padStart(3, "0")}°   SPD ${Math.round(p.speed)} KTS   DECOYS ${p.decoys}`,
      17,
      h - 16,
    );
    ctx.save();
    const needleX = w / 2, needleY = h - 25, needleAngle = p.angle + Math.sin(world.elapsed * 18) * emp * 2.2;
    ctx.strokeStyle = "rgba(162,196,184,.5)"; ctx.beginPath(); ctx.arc(needleX, needleY, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.translate(needleX, needleY); ctx.rotate(needleAngle);
    ctx.fillStyle = emp > 0.35 ? "#d188ff" : "#c6dfc3";
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -3); ctx.lineTo(-2, 0); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#83d0c0";
    ctx.textAlign = "right";
    ctx.fillText(
      emp > 0.35 && Math.random() < emp * 0.65
        ? `BRG ${["▒#?", "//X", "0x?", "███"][Math.floor(Math.random() * 4)]}° · ${["#.X", "//?", "0▒0"][Math.floor(Math.random() * 3)]} NM TO EXIT`
        : `BRG ${String(Math.round((Math.atan2(world.goal.y - p.estY, world.goal.x - p.estX) * 180 / Math.PI + 360) % 360)).padStart(3,"0")}° · ${(Math.hypot(world.goal.x - p.estX, world.goal.y - p.estY) / 100).toFixed(1)} NM TO EXIT`,
      w - 17,
      h - 16,
    );
    ctx.textAlign = "left";
  }
  function drawRadar(now) {
    const r = radar.getBoundingClientRect(),
      w = r.width,
      h = r.height,
      cx = w / 2,
      cy = h / 2,
      scale = Math.min(w, h) / 660;
    rctx.clearRect(0, 0, w, h);
    rctx.fillStyle = "#091a20";
    rctx.fillRect(0, 0, w, h);
    rctx.save();
    rctx.translate(cx, cy);
    for (let i = 1; i <= 3; i++) {
      rctx.strokeStyle = "rgba(120,174,164,.2)";
      rctx.beginPath();
      rctx.arc(0, 0, (Math.min(w, h) * i) / 7, 0, 7);
      rctx.stroke();
    }
    const p = world.player,
      plot = (o, color, size) => {
      const originX = p.x, originY = p.y;
      const dx = (o.x - originX) * scale,
        dy = (o.y - originY) * scale;
        if (Math.hypot(dx, dy) > Math.min(w, h) * 0.44) return;
        rctx.fillStyle = color;
        rctx.beginPath();
        rctx.arc(dx, dy, size, 0, 7);
        rctx.fill();
      };
    world.enemies.forEach((e) =>
      plot(
        e,
        e.alert ? "#ff9b79" : e.type === "lurker" ? "#ad8bc9" : e.type === "magnetar" ? "#c871ff" : "#e97167",
        3.3,
      ),
    );
    world.decoys.forEach((d) => plot(d, "#e9b26f", 2.5));
    plot(world.goal, "#65d0c0", 3);
    rctx.save();
    rctx.rotate(p.angle);
    rctx.fillStyle = "#c5dfb4";
    rctx.beginPath();
    rctx.moveTo(6, 0);
    rctx.lineTo(-4, -3);
    rctx.lineTo(-2, 0);
    rctx.lineTo(-4, 3);
    rctx.fill();
    rctx.restore();
    rctx.strokeStyle = "rgba(128,216,200,.4)";
    rctx.beginPath();
    rctx.moveTo(0, 0);
    rctx.lineTo(Math.cos(now * 0.00038) * cx, Math.sin(now * 0.00038) * cy);
    rctx.stroke();
    rctx.restore();
  }
  function drawInertialPlotter(w, h) {
    const p = world.player, err = Math.hypot(p.x-p.estX,p.y-p.estY), x=w-126, y=h-93;
    ctx.save(); ctx.fillStyle="#07181ddd"; ctx.strokeStyle="#70bdb477"; ctx.lineWidth=1;
    ctx.fillRect(x,y,111,73); ctx.strokeRect(x,y,111,73);
    ctx.strokeStyle="#62847e55"; ctx.beginPath(); ctx.arc(x+55,y+34,22,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle="#78d5c3"; ctx.beginPath(); ctx.arc(x+55,y+34,3,0,7); ctx.fill();
    const dx=(p.x-p.estX)*.2,dy=(p.y-p.estY)*.2; ctx.strokeStyle="#f2aa68"; ctx.beginPath(); ctx.moveTo(x+55,y+34); ctx.lineTo(x+55+dx,y+34+dy); ctx.stroke();
    ctx.fillStyle=err>80?"#ff907a":"#a7cec0"; ctx.font="7px monospace"; ctx.textAlign="center";
    const emp = world.empIntensity || 0;
    const readout = emp > 0.35 && Math.random() < emp * 0.8
      ? `INERTIAL DRIFT: ${["▒▒ X?", "#0//?", "ERR_██"][Math.floor(Math.random() * 3)]}`
      : `INERTIAL DRIFT ERROR: ${Math.round(err)} m`;
    ctx.fillText(readout,x+55,y+65); ctx.restore();
  }
  function drawHydrophone(w,h,cx,cy) {
    const p=world.player,r=65;
    ctx.save(); ctx.globalAlpha=.8; ctx.strokeStyle="#83d8c866";ctx.beginPath();ctx.arc(cx,cy,r,0,7);ctx.stroke();
    const priority = { FLESH: 0, PYLON: 1, MINE: 2, BEACON: 3, BATTERY: 3, STONE: 4 };
    [...world.echoes].sort((a,b) => (priority[a.kind] ?? 4) - (priority[b.kind] ?? 4) || a.age - b.age).slice(0,8).forEach((e,i)=>{
      const a=e.angle, age=e.age, rr=r+8+(i%3)*5;
      ctx.globalAlpha=Math.max(.2,1-age/2.8);ctx.strokeStyle=e.color;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(rr-4),cy+Math.sin(a)*(rr-4));ctx.lineTo(cx+Math.cos(a)*(rr+5),cy+Math.sin(a)*(rr+5));ctx.stroke();
      if(audioVisualAssist){ctx.fillStyle=e.color;ctx.font="bold 8px monospace";ctx.textAlign="center";const names={STONE:"[ECHO: CAVERN WALL]",MINE:"[ECHO: BIO-MINE]",PYLON:"[ECHO: RELAY PYLON]",FLESH:`[HYDROPHONE: ${creatureLabel(e.subtype)}]`,BEACON:"[SIGNAL: EXIT BEACON]"};ctx.fillText(names[e.kind]||e.kind,cx+Math.cos(a)*(r+28),cy+Math.sin(a)*(r+25));}
    });
    world.enemies.filter((e)=>e.type==="listener"&&e.state==="WINDUP").forEach((e)=>{
      const a=Math.atan2(e.targetY-world.player.y,e.targetX-world.player.x)-world.player.angle;
      const pulse=2+Math.sin(world.elapsed*20)*2;
      ctx.globalAlpha=.95;ctx.strokeStyle="#ff354d";ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*(r-8),cy+Math.sin(a)*(r-8));ctx.lineTo(cx+Math.cos(a)*(r+17),cy+Math.sin(a)*(r+17));ctx.stroke();
      ctx.beginPath();ctx.arc(cx+Math.cos(a)*(r+21),cy+Math.sin(a)*(r+21),pulse+3,0,Math.PI*2);ctx.stroke();
    });
    const emp = world.empIntensity || 0;
    if (emp > 0) {
      const a = world.empBearing, pulse = 0.55 + Math.sin(world.elapsed * 28) * 0.25;
      ctx.globalAlpha = Math.min(1, emp * (0.72 + pulse * 0.28)); ctx.lineWidth = 1 + emp * 1.8;
      for (let i = 0; i < 7; i++) {
        const angle = a + (Math.random() - 0.5) * 0.42;
        const inner = r - 1 - Math.random() * 5, outer = r + 3 + Math.random() * 10;
        ctx.strokeStyle = i % 2 ? "#73faff" : "#c46bff";
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle + (Math.random() - 0.5) * 0.08) * (inner + outer) / 2, cy + Math.sin(angle) * (inner + outer) / 2);
        ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (emp > 0.35) {
        ctx.fillStyle = "#dc8cff"; ctx.font = "bold 8px monospace"; ctx.textAlign = "center";
        ctx.fillText("[HYDROPHONE: MAGNETAR EMP]", cx, cy + r + 24);
      }
    }
    ctx.restore();
  }
  function updateHud() {
      const p = world.player,
      noise = p.noise * 100,
      n = $("noise-value");
    n.textContent = noise < 27 ? "LOW" : noise < 62 ? "MODERATE" : "HIGH";
    n.style.color = noise < 27 ? "#b7d1ac" : noise < 62 ? "#e6b26f" : "#f17d6d";
    $("noise-meter").style.width = `${noise}%`;
    $("hull-value").textContent = `${Math.round(p.hull)}%`;
    $("hull-meter").style.width = `${p.hull}%`;
    $("battery-value").textContent = `${Math.round(p.battery)}%`;
    $("battery-meter").style.width = `${p.battery}%`;
    const chargeReadout = $("sonar-charges");
    if (Number.isFinite(p.sonarCharges)) {
      chargeReadout.textContent = `SONAR CHARGES: ${String(p.sonarCharges).padStart(2,"0")} / ${selectedLevel.levelRules.maxPings}`;
      chargeReadout.classList.remove("hidden");
    } else chargeReadout.classList.add("hidden");
    const prog = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (1 -
            Math.hypot(world.goal.x - p.x, world.goal.y - p.y) /
              Math.hypot(
                world.goal.x - world.spawnPoint.x,
                world.goal.y - world.spawnPoint.y,
              )) *
            100,
        ),
      ),
    );
    $("progress-bar").style.width = `${prog}%`;
    $("progress-label").textContent = `${prog}% TO EXTRACTION`;
    $("mission-time").textContent = fmt(world.elapsed);
    const ventStatus = $("vent-status");
    if (selectedLevel.vents) {
      const phase = world.elapsed % 6.5;
      ventStatus.classList.remove("hidden");
      ventStatus.classList.toggle("active", world.rumbleActive);
      ventStatus.textContent = world.rumblePhase === "WARNING"
        ? `[VENT PULSE: WARNING HISS · ${(1 - phase).toFixed(1)}s]`
        : world.rumblePhase === "ACTIVE"
          ? `[VENT PULSE: RUMBLE ACTIVE · ${(4.5 - phase).toFixed(1)}s]`
          : world.rumblePhase === "REVERB"
            ? `[VENT PULSE: ACOUSTIC REVERB · ${(5.5 - phase).toFixed(1)}s]`
            : `[VENT PULSE: CALM · ${(6.5 - phase).toFixed(1)}s]`;
    } else ventStatus.classList.add("hidden");
    $("mission-status").textContent = world.enemies.some(
      (e) => !["PATROL", "DORMANT"].includes(e.state),
    )
      ? "CONTACT SEARCHING"
      : "IN TRANSIT";
  }
  function showEnd() {
    const won = world.won,
      p = world.player,
      time = world.elapsed,
      timeTarget = time <= selectedLevel.parTime,
      batteryTarget = p.battery >= 40,
      stars = won ? 1 + (timeTarget ? 1 : 0) + (batteryTarget ? 1 : 0) : 0,
      ghost = won && !p.detected && !world.lastDamageCause;
    saveResult(selectedLevel, { stars, time, won, ghost });
    renderMissions();
    $("end-kicker").textContent = won
      ? "DIVE TELEMETRY — SUCCESS"
      : "DIVE TELEMETRY — LOST";
    $("end-title").textContent = won ? "MISSION COMPLETE" : "VESSEL LOST";
    $("end-copy").textContent = won
      ? "Exit beacon reached. Telemetry archived to the dive log."
      : "Hull failure. The surrounding cave remains visible for your final bearing.";
    $("loss-cause").textContent = won
      ? ""
      : world.lossCause || "HULL INTEGRITY DEPLETED";
    $("loss-cause").classList.toggle("visible", !won);
    $("end-time").textContent = fmt(time);
    $("end-pings").textContent = p.pings;
    $("end-battery").textContent = `${Math.round(100 - p.battery)}%`;
    $("end-hull").textContent = `${Math.round(p.hull)}%`;
    const baseScore = won ? Math.max(0, 1000 + Math.max(0, selectedLevel.parTime - time) * 8 + p.hull * 10 - p.pings * 12) : Math.max(0, Math.round(p.hull * 10 - p.pings * 12));
    $("end-score").textContent = Math.round(baseScore);
    $("end-stars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    $("end-ghost").textContent = ghost ? "◈ EARNED" : "—";
    $("next-depth").classList.toggle(
      "hidden",
      !won ||
        selectedLevel.id === "daily" ||
        selectedLevel.id.startsWith("custom"),
    );
    $("end-modal").classList.remove("hidden");
  }
  function showBriefing() {
    active = false;
    $("play-screen").classList.add("hidden");
    $("briefing").classList.remove("hidden");
    $("end-modal").classList.add("hidden");
    $("mission-briefing").classList.add("hidden");
    renderMissions();
  }
  function enemyIntel(level) {
    if (level.briefingIntel) return level.briefingIntel;
    if (level.pylonCount) return `${level.pylonCount} dormant Floodlight Pylons are distributed along the descent. Sonar returns reveal their crystal signatures; the active 260-meter domes repel Shade Stalkers, and first-time relay activations recharge sonar.`;
    if (level.topology === "LABYRINTH_GRID") return "Survey returns map a tight, right-angled rock lattice with several acoustic chambers that do not continue. Three green charge canisters are registered in isolated side pockets; only the hull-mounted hydrophone remains operational.";
    if (level.topology === "GRAND_CHAMBERS" && !Object.values(level.enemies || {}).some(Boolean)) return "The sector alternates narrow passages with vast hollow chambers. Repeated sonar returns indicate dense rock forms suspended inside several of the larger voids.";
    const creatures = [
      ["listener", "Long-range hydrophone telemetry registers a blind bio-acoustic leviathan in this sector. Subject exhibits violent straight-line lunging behavior toward sudden seismic noise and active sonar sweeps."],
      ["lurker", "Retinal scanner logs indicate photosensitive predatory organisms inhabiting unlit rifts. They actively stalk movement signatures in pitch darkness, but recoil from direct high-lumen beams."],
      ["magnetar", "Electromagnetic anomalies detected ahead. Bio-electric aura heavily scrambles onboard instrumentation. Subject is deaf to mechanical propeller noise, but surges aggressively toward active electrical pulses and light emission."],
    ];
    const depthIndex = LEVELS.findIndex((entry) => entry.id === level.id);
    const previouslySeen = new Set(
      LEVELS.slice(0, Math.max(0, depthIndex))
        .filter((entry) => entry.enemies)
        .flatMap((entry) => Object.keys(entry.enemies).filter((type) => entry.enemies[type] > 0)),
    );
    const newCreature = creatures.find(([type]) => level.enemies?.[type] > 0 && !previouslySeen.has(type));
    if (newCreature) return newCreature[1];

    const logLines = [
      "The sonar came back with one extra heartbeat. No one on watch admits to hearing it.",
      "Five hundred meters down, the dark has learned our call sign. Something keeps answering on the same frequency.",
      "Pressure steady. Hull quiet. Then three slow knocks from somewhere outside the light.",
      "The trench is holding its breath. Our instruments insist the water is empty.",
      "A clean return crossed the scope, matched our speed, then vanished without crossing behind us.",
    ];
    const seed = Number(level.seed) || 0;
    return logLines[seed % logLines.length];
  }
  function openMissionBriefing(level = selectedLevel) {
    selectedLevel = level;
    $("briefing-depth").textContent = level.depth === "DAILY" ? "DAILY DEPTH · SEEDED RUN" : `${level.depth} METERS · ${level.title}`;
    $("briefing-title").textContent = level.title;
    $("briefing-objective").textContent = `Depth ${level.depth === "DAILY" ? "varies by seed" : `${level.depth} m`}. Hazard level: ${threatCount(level)} contacts and environmental threats. Primary objective: reach the exit beacon and return the vessel intact.`;
    $("briefing-intel").textContent = enemyIntel(level);
    const rules = level.levelRules || {};
    const environment = [rules.maxHull ? `HULL COMPROMISED (${rules.maxHull} HP)` : "STANDARD HULL",
      rules.lampDisabled ? "LAMP OFFLINE" : "LAMP AVAILABLE",
      Number.isFinite(rules.maxPings) ? `${rules.maxPings} SONAR CHARGES` : "UNLIMITED SONAR",
      level.pylonCount ? `${level.pylonCount} FLOODLIGHT PYLONS` : "",
      level.vents ? `${level.vents} HYDROTHERMAL VENTS` : ""].filter(Boolean).join(" | ");
    $("briefing-meta").textContent = `TOPOLOGY: ${level.topology || "GRAND_CHAMBERS"} · ${environment} · SEED ${level.seed} · EST. ${fmt(level.parTime)}`;
    $("mission-briefing").classList.remove("hidden");
  }
  function customLevel() {
    const value = $("custom-seed").value.trim();
    if (!value) return;
    const seed = /^\d+$/.test(value) ? Number(value) >>> 0 : dailySeed(value);
    const l = {
      ...LEVELS[LEVELS.length - 1],
      id: `custom-${seed}`,
      title: "CUSTOM OPERATION",
      subtitle: "Seeded trench",
      depth: "CUSTOM",
      seed,
      parTime: 245,
      bounds: [100, 70],
      banner: `CUSTOM SEED ${seed}. GOOD HUNT.`,
    };
    selectedLevel = l;
    updateSelected();
    renderMissions();
  }
  function togglePause() {
    world.paused = !world.paused;
    $("pause-legend").classList.toggle("hidden", !world.paused);
    $("pause-button").innerHTML = world.paused
      ? "▶ <span>RESUME MISSION</span>"
      : "Ⅱ <span>PAUSE MISSION</span>";
    if (!world.paused) {
      last = performance.now();
      requestAnimationFrame(frame);
    } else {
      showToast("MISSION PAUSED");
    }
  }
  const controlKey = {
    w: "forward",
    arrowup: "forward",
    s: "back",
    arrowdown: "back",
    a: "left",
    arrowleft: "left",
    d: "right",
    arrowright: "right",
    shift: "boost",
    alt: "silent",
  };
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (e.code === "Space" && !$("mission-briefing").classList.contains("hidden")) {
      e.preventDefault();
      start(selectedLevel);
      return;
    }
    if (controlKey[k]) {
      keys[controlKey[k]] = true;
      e.preventDefault();
    }
    if (e.code === "Space") {
      e.preventDefault();
      if (active && !world.over) triggerSonarPing(world.player.x, world.player.y, true);
      else if (world.over && !world.won) openMissionBriefing(selectedLevel);
    }
    if (k === "q" && active && world.addDecoy()) {
      GameAudio.decoy();
      showToast(`DECOY RELEASED — ${world.player.decoys} REMAINING`);
    }
    if (k === "f" && active) {
      if (selectedLevel.levelRules?.lampDisabled) {
        GameAudio.tone({ freq: 180, end: 72, duration: .12, type: "square", volume: .045 });
        showToast("[OPTICS SHATTERED: LAMP OFFLINE]");
        return;
      }
      world.update(0, { lamp: true });
      showToast(
        world.player.lamp ? "LAMP ONLINE — BATTERY DRAINING" : "LAMP OFF",
      );
    }
    if (k === "e" && active) world.severTether();
    if ((k === "escape" || k === "p") && active) togglePause();
    if (k === "m") {
      soundOn = !soundOn;
      if (soundOn) GameAudio.enable(); else GameAudio.toggle();
      $("sound-state").textContent = soundOn ? "ON" : "OFF";
      $("sound-state").style.color = soundOn ? "#9ed0a1" : "#e6a464";
    }
  });
  canvas.addEventListener("click", (e) => {
    if (!active || world.over || e.button !== 0) return;
    triggerSonarPing(world.player.x, world.player.y, true);
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (controlKey[k]) keys[controlKey[k]] = false;
  });
  window.addEventListener("blur", () => (keys = {}));
  $("launch").addEventListener("click", () => {
    if (soundOn) GameAudio.enable();
    openMissionBriefing(selectedLevel);
  });
  $("custom-launch").addEventListener("click", () => {
    customLevel();
    if (soundOn) GameAudio.enable();
    openMissionBriefing(selectedLevel);
  });
  $("retry").addEventListener("click", () => openMissionBriefing(selectedLevel));
  $("next-depth").addEventListener("click", () => {
    const i = LEVELS.findIndex((l) => l.id === selectedLevel.id);
    openMissionBriefing(LEVELS[Math.min(i + 1, LEVELS.length - 1)]);
  });
  $("commence-dive").addEventListener("click", () => start(selectedLevel));
  $("return-to-deck").addEventListener("click", showBriefing);
  $("dive-log").addEventListener("click", showBriefing);
  $("pause-button").addEventListener("click", togglePause);
  $("sound-toggle").addEventListener("click", () => {
    soundOn = !soundOn;
    if (soundOn) GameAudio.enable();
    else GameAudio.toggle();
    $("sound-state").textContent = soundOn ? "ON" : "OFF";
    $("sound-state").style.color = soundOn ? "#9ed0a1" : "#e6a464";
  });
  $("assist-toggle").addEventListener("click", () => {
    audioVisualAssist = !audioVisualAssist;
    $("assist-toggle").setAttribute("aria-pressed", String(audioVisualAssist));
    $("assist-toggle").querySelector("span").textContent = audioVisualAssist ? "ON" : "OFF";
    document.body.classList.toggle("high-contrast", audioVisualAssist);
  });
  document.querySelectorAll(".mobile-controls button").forEach((button) => {
    button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      keys[button.dataset.control] = true;
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((type) =>
      button.addEventListener(
        type,
        () => (keys[button.dataset.control] = false),
      ),
    );
  });
  renderMissions();
  updateSelected();
})();
