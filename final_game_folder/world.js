/* Seeded campaign simulation and rendering for Abyssal Reckoning. */
(() => {
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const segmentClear = (a, b, rocks) => !rocks.some((r) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((r.x - a.x) * dx + (r.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(a.x + t * dx - r.x, a.y + t * dy - r.y) < r.r;
  });
  const distanceToSegment = (point, start, end) => {
    const dx = end.x - start.x, dy = end.y - start.y;
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(start.x + t * dx - point.x, start.y + t * dy - point.y);
  };
  const LEVELS = [
    {
      id: "depth-100",
      depth: 100,
      title: "ECHO CALIBRATION",
      subtitle: "Acoustic Navigation & Currents",
      seed: 100173,
      bounds: [70, 50],
      parTime: 115,
      enemies: { listener: 0, lurker: 0, magnetar: 0 },
      mines: 12,
      currents: 2,
      strongCurrents: 0,
      batteries: 4,
      banner:
        "OPTICS OFFLINE. PING [SPACE] TO DETECT WALLS & MINES. USE LAMP [F] SPARINGLY TO THREAD MINEFIELDS.",
      wide: true,
    },
    {
      id: "depth-200",
      depth: 200,
      title: "BLIND LISTENER",
      subtitle: "Introducing Sound Predators",
      seed: 200287,
      bounds: [82, 58],
      parTime: 145,
      enemies: { listener: 3, lurker: 0, magnetar: 0 },
      mines: 14,
      currents: 0,
      strongCurrents: 0,
      batteries: 3,
      banner:
        "LISTENER DETECTED. PING TO BAIT ITS STRAIGHT-LINE LUNGE INTO WALLS OR MINES, OR HUG ROCK WALLS SILENTLY TO MASK YOUR HULL.",
    },
    {
      id: "depth-300",
      depth: 300,
      title: "PHOTOTAXIS",
      subtitle: "Light Predators & Minefields",
      seed: 300391,
      bounds: [88, 62],
      parTime: 170,
      enemies: { listener: 0, lurker: 3, magnetar: 0 },
      mines: 16,
      currents: 0,
      strongCurrents: 0,
      batteries: 4,
      banner:
        "SHADE STALKERS CREEP IN THE DARK. SHINE YOUR LAMP [F] DIRECTLY ON THEM TO PIN AND REPEL THEM.",
    },
    {
      id: "depth-400",
      depth: 400,
      title: "ELECTRO-SILENCE",
      subtitle: "Electro-Reception & Combined Threats",
      seed: 400489,
      bounds: [94, 66],
      parTime: 205,
      enemies: { listener: 1, lurker: 1, magnetar: 1 },
      mines: 18,
      currents: 0,
      strongCurrents: 4,
      batteries: 3,
      banner:
        "MAGNETAR DETECTED. ITS EMP FIELD GLITCHES YOUR HUD. IT IS DEAF TO ENGINES BUT HUNTS SONAR PINGS & LAMP LIGHT — CUT ELECTRONICS AND FLY ON THRUSTERS OR LURE IT WITH A DECOY [Q].",
    },
    {
      id: "depth-500",
      depth: 500,
      title: "DEAD RECKONING",
      subtitle: "Multiple Electromagnetic Predators",
      seed: 500593,
      bounds: [100, 70],
      parTime: 245,
      enemies: { listener: 2, lurker: 1, magnetar: 2 },
      mines: 22,
      currents: 0,
      strongCurrents: 5,
      batteries: 4,
      banner:
        "MAGNETAR DETECTED. ITS EMP FIELD GLITCHES YOUR HUD. IT IS DEAF TO ENGINES BUT HUNTS SONAR PINGS & LAMP LIGHT — CUT ELECTRONICS AND FLY ON THRUSTERS OR LURE IT WITH A DECOY [Q].",
      tight: true,
    },
  ];
  const DAILY = {
    id: "daily",
    title: "SEEDED DAILY OPERATION",
    subtitle: "Daily Trench",
    depth: "DAILY",
    seed: 0,
    bounds: [100, 70],
    parTime: 220,
    enemies: { listener: 2, lurker: 1, magnetar: 2 },
    mines: 22,
    currents: 4,
    strongCurrents: 0,
    batteries: 4,
    banner:
      "MAGNETAR DETECTED. ITS EMP FIELD GLITCHES YOUR HUD. IT IS DEAF TO ENGINES BUT HUNTS SONAR PINGS & LAMP LIGHT — CUT ELECTRONICS AND FLY ON THRUSTERS OR LURE IT WITH A DECOY [Q].",
  };
  function dailySeed(date = new Date().toISOString().slice(0, 10)) {
    let h = 2166136261;
    for (const c of date) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s += 0x6d2b79f5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
  function buildLevel(level, config = {}) {
    const counts = {
      listenerCount: level.enemies?.listener ?? 0,
      lurkerCount: level.enemies?.lurker ?? 0,
      magnetarCount: level.enemies?.magnetar ?? 0,
      mineCount: level.mines ?? 0,
      currentCount: (level.currents ?? 0) + (level.strongCurrents ?? 0),
      ...config,
    };
    return {
      ...level,
      enemies: {
        listener: counts.listenerCount,
        lurker: counts.lurkerCount,
        magnetar: counts.magnetarCount,
      },
      mines: counts.mineCount,
      configuredCurrentCount: counts.currentCount,
    };
  }
  class World {
    constructor() {
      this.reset(LEVELS[0]);
    }
    reset(level = LEVELS[0], config = {}) {
      this.level = buildLevel(level, config);
      this.seed = Number(level.seed) >>> 0 || 1;
      const rng = seeded(this.seed);
      this.tileSize = 28;
      this.cols = 100;
      this.rows = 70;
      this.width = this.cols * this.tileSize;
      this.height = this.rows * this.tileSize;
      this.player = {
        x: 12.5 * this.tileSize,
        y: 14.5 * this.tileSize,
        estX: 12.5 * this.tileSize,
        estY: 14.5 * this.tileSize,
        angle: -0.62,
        speed: 0,
        noise: 0,
        hull: 100,
        battery: 100,
        decoys: 2,
        lamp: false,
        leaking: false,
        tether: true,
        detected: false,
        pings: 0,
        empDisabledTimer: 0,
      };
      this.goal = { x: 86.5 * this.tileSize, y: 56.5 * this.tileSize };
      this.enemies = [];
      this.generateCavern(rng);
      const spawnX = this.player.x, spawnY = this.player.y;
      const types = [
        ["listener", this.level.enemies.listener],
        ["lurker", this.level.enemies.lurker],
        ["magnetar", this.level.enemies.magnetar],
      ];
      const claimedHomes = [];
      const sampledHomes = [];
      for (let y = 90; y < this.height - 90; y += 84) for (let x = 90; x < this.width - 90; x += 84) {
        if (!this.circleHitsRock(x, y, 16)) sampledHomes.push({ x, y });
      }
      const homeCandidates = [...this.junctions, ...this.spine, ...this.hazardSites, ...this.salvageSites, ...sampledHomes]
        .filter((node, index, all) => !this.circleHitsRock(node.x, node.y, 14) &&
          all.findIndex((other) => distance(node, other) < 48) === index &&
          distance(node, this.player) > 650 && distance(node, this.goal) > 300);
      types.forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
          const magnetarCandidates = type === "magnetar" && level.depth === 400
            ? homeCandidates.filter((candidate) => distance(candidate, this.goal) > 300 && distance(candidate, this.goal) < 1900)
            : homeCandidates;
          const placementCandidates = magnetarCandidates.length ? magnetarCandidates : homeCandidates;
          const node = placementCandidates
            .map((candidate) => ({ candidate, nearest: claimedHomes.length ? Math.min(...claimedHomes.map((home) => distance(candidate, home))) : Infinity }))
            .filter((entry) => entry.nearest >= 650)
            .sort((a, b) => type === "magnetar" && level.depth === 400
              ? distance(a.candidate, this.goal) - distance(b.candidate, this.goal)
              : b.nearest - a.nearest)[0]?.candidate ||
            placementCandidates.map((candidate) => ({ candidate, nearest: claimedHomes.length ? Math.min(...claimedHomes.map((home) => distance(candidate, home))) : Infinity }))
              .sort((a, b) => b.nearest - a.nearest)[0]?.candidate || this.spine[2];
          claimedHomes.push(node);
          const x = node.x, y = node.y;
          const nodeIndex = this.spine.reduce((best, point, index) => distance(point, node) < distance(this.spine[best] || node, node) ? index : best, 0);
          const patrolNode = this.spine[Math.min(this.spine.length - 1, nodeIndex + 2)] || node;
          this.enemies.push({
            type, x, y, homeX: x, homeY: y, homeNode: { x, y }, leashRadius: 520,
            angle: rng() * 6.28, phase: rng() * 6.28,
            range: 180 + rng() * 260,
            speed: type === "magnetar" ? 52 : type === "lurker" ? 32 : 65,
            alert: 0, state: type === "lurker" ? "DORMANT" : "PATROL",
            searchTime: 0, attackCooldown: 0, passiveAt: rng() * 2.5,
            reactionTimer: 0, heardNoiseId: -1, vx: 0, vy: 0,
            heardEvent: -1, targetX: x, targetY: y, pingLockTimer: 0,
            clickAt: rng() * 3.2, stunTimer: 0, pinTimer: 0, creepTickAt: 0,
            chargeTimer: 0, dischargeTimer: 0, rechargeTimer: 0,
            magnetarTargetKind: "", magnetarTargetX: x, magnetarTargetY: y,
            patrolA: type === "listener" ? node : null,
            patrolB: type === "listener" ? patrolNode : null,
          });
        }
      });
      this.mines = [];
      this.currents = [];
      this.batteries = [];
      for (let i = 0; i < this.level.mines; i++) {
        const site = this.hazardSites[i % this.hazardSites.length] || this.spine[i + 1];
        const side = i % 2 ? 1 : -1;
        this.mines.push({ x: site.x + side * 52, y: site.y + (i % 3 - 1) * 26, r: 13, triggerRadius: 32, armed: true });
      }
      const currentCount = this.level.configuredCurrentCount;
      for (let i = 0; i < currentCount; i++) {
        const path = this.tunnelSegments[i % this.tunnelSegments.length];
        const point = path[Math.floor(path.length * 0.55)];
        this.currents.push({ x: point.x, y: point.y, r: 90, angle: path.angle, force: i < level.strongCurrents ? 40 : 16 });
      }
      for (let i = 0; i < level.batteries; i++) {
        const site = this.salvageSites[i % this.salvageSites.length] || this.spine[1];
        this.batteries.push({ x: site.x, y: site.y, taken: false });
      }
      this.decoys = [];
      this.pings = [];
      this.pingCooldown = 0;
      this.elapsed = 0;
      this.empIntensity = 0;
      this.empBearing = 0;
      this.nearestMagnetar = null;
      this.sweep = 0;
      this.collisions = 0;
      this.events = [];
      this.echoes = [];
      this.phosphor = [];
      this.fixFlash = 0;
      this.breadcrumbs = [];
      this.breadcrumbAt = 0;
      this.shockwaves = [];
      this.paused = false;
      this.over = false;
      this.won = false;
      this.lastNoise = 0;
      this.lossCause = "";
      this.lastDamageCause = "";
      this.lastScrape = -10;
      this.noiseEvents = [];
      this.noiseSequence = 0;
      this.lowBatteryWarningAt = -Infinity;
      this.passiveAt = 0;
      this.stars = Array.from({ length: 220 }, (_, i) => ({
        x: (i * 7919) % this.width,
        y: (i * 3253) % this.height,
        r: 0.3 + (i % 4) * 0.22,
        a: 0.12 + (i % 5) * 0.08,
      }));
    }
    generateCavern(rng) {
      const t = this.tileSize, cols = this.cols, rows = this.rows;
      const border = 4;
      let grid = Array.from({ length: rows }, () => new Uint8Array(cols).fill(1));
      const inside = (x, y) => x >= border && x < cols - border && y >= border && y < rows - border;
      const carve = (x, y, radius) => {
        const tx = x / t, ty = y / t, reach = Math.ceil(radius / t) + 1;
        for (let gy = Math.max(border, Math.floor(ty - reach)); gy <= Math.min(rows - border - 1, Math.ceil(ty + reach)); gy++)
          for (let gx = Math.max(border, Math.floor(tx - reach)); gx <= Math.min(cols - border - 1, Math.ceil(tx + reach)); gx++)
            if ((gx + 0.5 - tx) ** 2 + (gy + 0.5 - ty) ** 2 <= (radius / t) ** 2) grid[gy][gx] = 0;
      };
      const carveBezier = (a, c, b, radius, spacing = 0.25) => {
        const length = distance(a, c) + distance(c, b);
        const steps = Math.max(1, Math.ceil(length / (t * spacing))), route = [];
        for (let i = 0; i <= steps; i++) {
          const u = i / steps, v = 1 - u;
          const point = { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x,
            y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
          carve(point.x, point.y, radius);
          route.push(point);
        }
        route.angle = Math.atan2(b.y - a.y, b.x - a.x);
        return route;
      };
      const start = { x: 12.5 * t, y: 14.5 * t }, goal = { x: 86.5 * t, y: 56.5 * t };
      const count = 6 + Math.floor(rng() * 2);
      this.spine = Array.from({ length: count }, (_, i) => {
        const f = i / (count - 1), lateral = i && i < count - 1 ? (rng() - 0.5) * 12 : 0;
        const dx = goal.x - start.x, dy = goal.y - start.y, len = Math.hypot(dx, dy);
        return { x: clamp(start.x + dx * f - dy / len * lateral, (border + 3) * t, (cols - border - 3) * t),
          y: clamp(start.y + dy * f + dx / len * lateral, (border + 3) * t, (rows - border - 3) * t),
          type: i % 2 === 0 ? "junction" : "waypoint" };
      });
      this.spine[0] = { ...start, type: "junction" };
      this.spine[count - 1] = { ...goal, type: "junction" };
      this.junctions = this.spine.filter((n) => n.type === "junction");
      this.tunnelSegments = [];
      this.spine.forEach((node) => carve(node.x, node.y, (5.5 + rng() * 2) * t));
      for (let i = 0; i < count - 1; i++) {
        const a = this.spine[i], b = this.spine[i + 1], dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
        const bend = (rng() - 0.5) * Math.min(9 * t, len * 0.25);
        const control = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
        this.tunnelSegments.push(carveBezier(a, control, b, (3.5 + rng() * 0.7) * t));
      }
      this.branches = [];
      const branchNodes = this.spine.slice(1, -1);
      const branchCount = Math.min(branchNodes.length, 3 + Math.floor(rng() * 2));
      for (let i = 0; i < branchCount; i++) {
        const node = branchNodes[Math.floor(i * branchNodes.length / branchCount)];
        const ix = this.spine.indexOf(node), previous = this.spine[ix - 1], next = this.spine[ix + 1];
        const spineAngle = Math.atan2(next.y - previous.y, next.x - previous.x);
        const side = i % 2 ? -1 : 1;
        const angle = spineAngle + side * (1.25 + rng() * 0.45);
        const length = (14 + rng() * 8) * t;
        const endpoint = { x: clamp(node.x + Math.cos(angle) * length, (border + 6) * t, (cols - border - 6) * t),
          y: clamp(node.y + Math.sin(angle) * length, (border + 6) * t, (rows - border - 6) * t) };
        const bend = (rng() - 0.5) * 5 * t;
        const control = { x: (node.x + endpoint.x) / 2 - Math.sin(angle) * bend,
          y: (node.y + endpoint.y) / 2 + Math.cos(angle) * bend };
        carveBezier(node, control, endpoint, 3.2 * t);
        carve(endpoint.x, endpoint.y, 4.5 * t);
        this.branches.push({ endpoint, kind: "salvage" });
      }
      this.pillars = [];
      this.salvageSites = this.branches.filter((branch) => branch.kind === "salvage").map((branch) => branch.endpoint);
      this.hazardSites = [...this.spine.slice(1, -1), ...this.branches.map((branch) => branch.endpoint)];

      // Cellular smoothing uses a snapshot per pass so the result is order independent.
      for (let pass = 0; pass < 3; pass++) {
        const next = Array.from({ length: rows }, (_, y) => new Uint8Array(grid[y]));
        for (let y = border; y < rows - border; y++) for (let x = border; x < cols - border; x++) {
          let rocks = 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            if ((ox || oy) && grid[y + oy][x + ox]) rocks++;
          }
          if (grid[y][x] && rocks <= 3) next[y][x] = 0;
          else if (!grid[y][x] && rocks >= 6) next[y][x] = 1;
        }
        grid = next;
      }

      // Clear small detached rock flecks while retaining the uncarvable perimeter.
      const visitedRock = Array.from({ length: rows }, () => new Uint8Array(cols));
      for (let y = border; y < rows - border; y++) for (let x = border; x < cols - border; x++) {
        if (!grid[y][x] || visitedRock[y][x]) continue;
        const component = [[x, y]], cells = []; visitedRock[y][x] = 1;
        for (let i = 0; i < component.length; i++) {
          const [cx, cy] = component[i]; cells.push([cx, cy]);
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const xx = cx + ox, yy = cy + oy;
            if ((ox || oy) && inside(xx, yy) && grid[yy][xx] && !visitedRock[yy][xx]) {
              visitedRock[yy][xx] = 1; component.push([xx, yy]);
            }
          }
        }
        if (cells.length < 6) cells.forEach(([cx, cy]) => { grid[cy][cx] = 0; });
      }

      // Remove unreachable open pockets, then guarantee a route between the mission endpoints.
      const flood = (sx, sy) => {
        const seen = Array.from({ length: rows }, () => new Uint8Array(cols));
        if (grid[sy][sx]) return seen;
        const queue = [[sx, sy]]; seen[sy][sx] = 1;
        for (let i = 0; i < queue.length; i++) {
          const [x, y] = queue[i];
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + ox, yy = y + oy;
            if (inside(xx, yy) && !grid[yy][xx] && !seen[yy][xx]) { seen[yy][xx] = 1; queue.push([xx, yy]); }
          }
        }
        return seen;
      };
      const sx = 12, sy = 14, gx = 86, gy = 56;
      let reachable = flood(sx, sy);
      if (!reachable[gy][gx]) {
        const queue = [[sx, sy]], parent = Array.from({ length: rows }, () => Array(cols).fill(null));
        const seen = Array.from({ length: rows }, () => new Uint8Array(cols)); seen[sy][sx] = 1;
        for (let i = 0; i < queue.length && !seen[gy][gx]; i++) {
          const [x, y] = queue[i];
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + ox, yy = y + oy;
            if (inside(xx, yy) && !seen[yy][xx]) { seen[yy][xx] = 1; parent[yy][xx] = [x, y]; queue.push([xx, yy]); }
          }
        }
        let at = [gx, gy];
        while (at) { const [x, y] = at; grid[y][x] = 0; at = x === sx && y === sy ? null : parent[y][x]; }
      }
      reachable = flood(sx, sy);
      for (let y = border; y < rows - border; y++) for (let x = border; x < cols - border; x++)
        if (!grid[y][x] && !reachable[y][x]) grid[y][x] = 1;
      this.cavern = grid;
      this.rocks = [];
      for (let y = border; y < rows - border; y++) for (let x = border; x < cols - border; x++)
        if (grid[y][x] && (!grid[y - 1][x] || !grid[y + 1][x] || !grid[y][x - 1] || !grid[y][x + 1]))
          this.rocks.push({ x: (x + 0.5) * t, y: (y + 0.5) * t, r: 17, tileX: x, tileY: y });
    }
    castSonarRays(originX, originY, maxDist = 520) {
      if (![originX, originY, maxDist].every(Number.isFinite) || maxDist <= 0) return [];
      const targets = [
        ...this.mines.filter((o) => o.armed).map((o, i) => ({ ...o, r: 14, kind: "MINE", key: `m${i}` })),
        ...this.enemies.map((o, i) => ({ ...o, r: 20, kind: "FLESH", key: `e${i}` })),
        ...this.batteries.filter((o) => !o.taken).map((o, i) => ({ ...o, r: 11, kind: "BATTERY", key: `b${i}` })),
        { ...this.goal, r: 15, kind: "BEACON", key: "exit" },
      ];
      const hits = [];
      for (let ray = 0; ray < 360; ray++) {
        const angle = ray * Math.PI * 2 / 360;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        let nearest = null;
        // Sample the actual cavern mask, then refine the first water-to-rock crossing.
        let prior = 0;
        for (let dist = 4; dist <= maxDist; dist += 4) {
          const px = originX + dx * dist, py = originY + dy * dist;
          const tx = Math.floor(px / this.tileSize), ty = Math.floor(py / this.tileSize);
          if (this.cavern[ty]?.[tx]) {
            let lo = prior, hi = dist;
            for (let n = 0; n < 5; n++) {
              const mid = (lo + hi) / 2, mx = Math.floor((originX + dx * mid) / this.tileSize), my = Math.floor((originY + dy * mid) / this.tileSize);
              if (this.cavern[my]?.[mx]) hi = mid; else lo = mid;
            }
            nearest = { ray, angle, dist: hi, x: originX + dx * hi, y: originY + dy * hi, kind: "STONE", key: "wall" };
            break;
          }
          prior = dist;
        }
        for (const target of targets) {
          const ox = target.x - originX, oy = target.y - originY;
          const projection = ox * dx + oy * dy;
          if (projection < 0) continue;
          const perpendicular2 = ox * ox + oy * oy - projection * projection;
          const radius2 = target.r * target.r;
          if (perpendicular2 > radius2) continue;
          const dist = Math.max(0, projection - Math.sqrt(radius2 - perpendicular2));
          if (dist <= maxDist && (!nearest || dist < nearest.dist)) {
            nearest = { ray, angle, dist, x: originX + dx * dist, y: originY + dy * dist, kind: target.kind, key: target.key };
          }
        }
        if (nearest) hits.push(nearest);
      }
      return hits;
    }
    isRockAt(x, y) {
      const tx = Math.floor(x / this.tileSize), ty = Math.floor(y / this.tileSize);
      return !!this.cavern[ty]?.[tx];
    }
    circleHitsRock(x, y, radius = 14) {
      const minX = Math.floor((x - radius) / this.tileSize), maxX = Math.floor((x + radius) / this.tileSize);
      const minY = Math.floor((y - radius) / this.tileSize), maxY = Math.floor((y + radius) / this.tileSize);
      for (let ty = minY; ty <= maxY; ty++) for (let tx = minX; tx <= maxX; tx++) {
        if (!this.cavern[ty]?.[tx]) continue;
        const left = tx * this.tileSize, top = ty * this.tileSize;
        const nearestX = clamp(x, left, left + this.tileSize), nearestY = clamp(y, top, top + this.tileSize);
        if ((x - nearestX) ** 2 + (y - nearestY) ** 2 < radius * radius) return true;
      }
      return false;
    }
    nearRockWall(x, y, maxDistance = 24) {
      const minX = Math.floor((x - maxDistance) / this.tileSize), maxX = Math.floor((x + maxDistance) / this.tileSize);
      const minY = Math.floor((y - maxDistance) / this.tileSize), maxY = Math.floor((y + maxDistance) / this.tileSize);
      for (let ty = minY; ty <= maxY; ty++) for (let tx = minX; tx <= maxX; tx++) {
        if (!this.cavern[ty]?.[tx]) continue;
        const left = tx * this.tileSize, top = ty * this.tileSize;
        const nx = clamp(x, left, left + this.tileSize), ny = clamp(y, top, top + this.tileSize);
        if (Math.hypot(x - nx, y - ny) <= maxDistance) return true;
      }
      return false;
    }
    hasLineOfSight(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      const steps = Math.ceil(length / 10);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (this.isRockAt(a.x + dx * t, a.y + dy * t)) return false;
      }
      return true;
    }
    nearestTunnelWaypoint(enemy, sound) {
      const waypoints = [...this.spine, ...this.salvageSites];
      return waypoints.filter((point) => !this.circleHitsRock(point.x, point.y, 14))
        .sort((a, b) => (distance(enemy, a) + distance(a, sound)) - (distance(enemy, b) + distance(b, sound)))[0] || sound;
    }
    wallRepulsion(enemy) {
      let x = 0, y = 0;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, px = enemy.x + Math.cos(angle) * 28, py = enemy.y + Math.sin(angle) * 28;
        if (this.isRockAt(px, py)) { x -= Math.cos(angle); y -= Math.sin(angle); }
      }
      const magnitude = Math.hypot(x, y) || 1;
      return { x: x / magnitude, y: y / magnitude };
    }
    mineRepulsion(enemy) {
      let x=0,y=0;
      this.mines.forEach((mine)=>{
        if (!mine.armed) return;
        const dx=enemy.x-mine.x,dy=enemy.y-mine.y,d=Math.hypot(dx,dy);
        if (d<72) { const force=(72-d)/72/(d||1); x+=dx*force; y+=dy*force; }
      });
      const length=Math.hypot(x,y)||1;
      return {x:x/length,y:y/length};
    }
    moveEnemy(enemy, vx, vy) {
      enemy.vx = vx; enemy.vy = vy;
      let blockedX = false, blockedY = false;
      const nextX = enemy.x + enemy.vx;
      if (!this.circleHitsRock(nextX, enemy.y, 14)) enemy.x = nextX;
      else { enemy.vx = 0; blockedX = true; }
      const nextY = enemy.y + enemy.vy;
      if (!this.circleHitsRock(enemy.x, nextY, 14)) enemy.y = nextY;
      else { enemy.vy = 0; blockedY = true; }
      if (blockedX && blockedY && enemy.state === "PATROL") enemy.phase += Math.PI;
      return blockedX || blockedY;
    }
    alertMagnetars(kind, x, y, radius = 420) {
      for (const e of this.enemies) {
        if (e.type !== "magnetar" || e.dead || distance(e, { x, y }) > radius) continue;
        e.magnetarTargetKind = kind;
        e.magnetarTargetX = x;
        e.magnetarTargetY = y;
        e.targetX = x;
        e.targetY = y;
        e.state = "CHARGE_SURGE";
        e.chargeTimer = 0.55;
        this.events.push({ type: "magnetar-lock", pan: clamp((e.x - this.player.x) / 500, -1, 1), distNorm: distance(e, this.player) / 550 });
      }
    }
    triggerSonarPing(originX = this.player.x, originY = this.player.y, isPlayer = true) {
      if (![originX, originY].every(Number.isFinite)) return null;
      if (isPlayer && this.player.empDisabledTimer > 0) return null;
      if (isPlayer && this.pingCooldown > 0) return null;
      if (isPlayer) this.pingCooldown = 0.75;
      this.alertMagnetars(isPlayer ? "sonar" : "decoy", originX, originY, isPlayer ? 420 : 580);
      const rays = this.castSonarRays(originX, originY, 520);
      const sectors = new Map();
      rays.forEach((hit) => {
        const sector = Math.floor(hit.ray / 36);
        const prior = sectors.get(sector);
        if (!prior || hit.dist < prior.dist) sectors.set(sector, { ...hit, sector });
      });
      const sectorHits = [...sectors.values()].sort((a, b) => a.sector - b.sector);
      const colors = { STONE: "#00f0ff", MINE: "#ffaa00", FLESH: "#ff2a55", BEACON: "#00ff88", BATTERY: "#00ff88" };
      const ping = {
        x: originX, y: originY, r: 0, age: 0, decoy: !isPlayer,
        hits: sectorHits.map((hit) => {
          const dots = [{ x: hit.x, y: hit.y, color: colors[hit.kind] || colors.STONE, radius: 2, alpha: 0, age: 0, active: false }];
          return { ...hit, dots, activated: false };
        }),
        contours: rays.filter((hit) => hit.kind === "STONE" && hit.dist <= 480).map((hit) => ({
          ...hit, activated: false, dot: { x: hit.x, y: hit.y, color: colors.STONE, radius: 2, alpha: 0, age: 0, active: false },
        })),
      };
      ping.audioHits = [...sectorHits].sort((a, b) => a.dist - b.dist).slice(0, 5).map((hit) => ({
        delay: hit.dist / 450,
        pan: clamp((hit.x - this.player.x) / 520, -1, 1),
        distNorm: clamp(hit.dist / 520, 0, 1), kind: hit.kind,
      }));
      this.pings.push(ping);
      if (isPlayer) {
        this.player.isMasked = false;
        this.player.pings++;
        this.noiseEvents.push({ id: this.noiseSequence++, type: "ping", x: originX, y: originY, age: 0, radius: 460, loudness: 110, priority: 80 });
      } else {
        this.noiseEvents.push({ id: this.noiseSequence++, type: "DECOY", x: originX, y: originY, age: 0, radius: 700, loudness: 140, priority: 100 });
        this.events.push({ type: "decoy-ping", x: originX, y: originY, audioHits: ping.audioHits });
      }
      return ping;
    }
    update(dt, input) {
      if (this.over || this.paused) return;
      this.elapsed += dt;
      this.pingCooldown = Math.max(0, this.pingCooldown - dt);
      if (this.elapsed - this.breadcrumbAt >= 0.16) {
        this.breadcrumbAt = this.elapsed;
        this.breadcrumbs.push({ x: this.player.x, y: this.player.y, at: this.elapsed });
        this.breadcrumbs = this.breadcrumbs.filter((b) => this.elapsed - b.at <= 8);
      }
      this.sweep = (this.sweep + dt * 0.48) % (Math.PI * 2);
      const p = this.player;
      p.empDisabledTimer = Math.max(0, p.empDisabledTimer - dt);
      this.fixFlash = Math.max(0, this.fixFlash - dt);
      if (input.lamp && p.battery > 0 && p.empDisabledTimer <= 0) {
        if (!p.lamp) {
          p.battery = Math.max(0, p.battery - 4);
          p.lamp = p.battery > 0;
          p.lampSessionSeconds = 0;
          if (p.lamp) {
            this.events.push({ type: "lamp-on" });
            this.alertMagnetars("lamp", p.x, p.y, 420);
          }
        } else {
          if (p.lampSessionSeconds < 0.4) p.battery = Math.max(0, p.battery - (0.4 - p.lampSessionSeconds) * 5.2);
          p.lamp = false;
        }
      }
      const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      p.angle += turn * 1.45 * dt;
      const thrust = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
      p.thrusterActive = thrust !== 0;
      const max = input.silent ? 48 : input.boost ? 150 : 105;
      const accel = input.silent ? 34 : input.boost ? 88 : 62;
      p.speed = clamp(
        p.speed + thrust * accel * dt - (thrust === 0 ? 18 : 8) * dt,
        0,
        max,
      );
      if (input.silent) p.speed = Math.min(p.speed, 42);
      p.x = clamp(p.x + Math.cos(p.angle) * p.speed * dt, 25, this.width - 25);
      p.y = clamp(p.y + Math.sin(p.angle) * p.speed * dt, 25, this.height - 25);
      // The inertial plotter integrates commanded movement only. Currents and
      // collision impulses affect the physical hull below, so the estimate drifts.
      p.estX = clamp(p.estX + Math.cos(p.angle) * p.speed * dt + (Math.random() - .5) * .55 * dt, 25, this.width - 25);
      p.estY = clamp(p.estY + Math.sin(p.angle) * p.speed * dt + (Math.random() - .5) * .55 * dt, 25, this.height - 25);
      p.battery = Math.max(0, p.battery - dt * (0.055 + (p.lamp ? 5.2 : 0) + (p.tether ? 0.025 : 0)));
      if (p.lamp) p.lampSessionSeconds += dt;
      if (p.battery === 0) p.lamp = false;
      if (p.battery < 25 && this.elapsed - this.lowBatteryWarningAt >= 8) {
        this.lowBatteryWarningAt = this.elapsed;
        this.events.push({ type: "battery-warning" });
      }
      p.lampIntensity = p.battery < 25 ? 0.88 + Math.sin(this.elapsed * 19) * 0.12 : 1;
      p.noise = clamp(
        p.speed / (input.silent ? 90 : 145) + (input.ping ? 0.58 : 0),
        0.03,
        1,
      );
      p.isMasked = p.speed < 25 && !p.lamp && !p.thrusterActive && this.nearRockWall(p.x, p.y, 24);
      if (input.ping || (p.lamp && p.battery > 0)) p.isMasked = false;
      if (p.leaking) {
        p.leakRepairProgress = (p.leakRepairProgress || 0) + dt * (p.isMasked ? 2 : 1);
        if (p.leakRepairProgress >= 1) {
          p.leakRepairProgress -= 1;
          p.hull = Math.min(100, p.hull + 1);
          if (p.hull >= 100) p.leaking = false;
        }
      }
      if (Math.abs(thrust) > 0.65 && this.elapsed - (this.thrusterNoiseAt ?? -1) >= 0.8) {
        this.thrusterNoiseAt = this.elapsed;
        this.noiseEvents.push({ id: this.noiseSequence++, type: "ENGINE", x: p.x, y: p.y, age: 0, radius: 160, throttle: Math.abs(thrust), loudness: 45 + Math.abs(thrust) * 60, priority: 30 });
      }
      if (p.leaking && this.elapsed - (this.leakNoiseAt || -2.5) >= 2.5) {
        this.leakNoiseAt = this.elapsed;
        this.noiseEvents.push({ type: "leak", x: p.x, y: p.y, age: 0, radius: 260 });
        this.events.push({ type: "leak-heartbeat" });
      }
      if (input.ping) {
        if (this.triggerSonarPing(p.x, p.y, true)) this.events.push({ type: "ping" });
      }
      this.pings.forEach((q) => {
        q.r = Math.min(520, q.r + 450 * dt);
        q.age += dt;
        q.hits.forEach((hit) => {
          if (hit.activated || q.r < hit.dist) return;
          hit.activated = true;
          hit.dots.forEach((dot) => { dot.active = true; this.phosphor.push(dot); });
          const echoAngle = Math.atan2(hit.y - p.y, hit.x - p.x);
          this.echoes.push({ x: hit.x, y: hit.y, kind: hit.kind, color: hit.dots[0].color, age: 0, angle: echoAngle });
          if (!q.decoy && hit.kind === "STONE" && this.echoes.filter((e) => e.kind === "STONE").length >= 2) this.fixPosition("SONAR");
        });
        q.contours.forEach((hit) => {
          if (hit.activated || q.r < hit.dist) return;
          hit.activated = true;
          hit.dot.active = true;
          this.phosphor.push(hit.dot);
        });
      });
      this.shockwaves = this.shockwaves.filter((w) => (w.age += dt) < 1.1);
      this.echoes = this.echoes.filter((e) => (e.age += dt) < 2.8);
      this.phosphor = this.phosphor.filter((d) => {
        if (!d.active) return true;
        d.age += dt; d.alpha = Math.max(0, 1 - d.age / 2.4);
        return d.age < 2.4;
      });
      this.pings = this.pings.filter((q) => q.r < 520 || q.hits.some((hit) => !hit.activated));
      this.noiseEvents.forEach((n) => { n.age += dt; });
      this.noiseEvents = this.noiseEvents.filter((n) => n.age < 0.35);
      this.decoys.forEach((d) => {
        if (d.overcharge) { d.timer -= dt; return; }
        if (![d.x,d.y,d.vx,d.vy,d.timer,d.pingTimer,d.pulseRadius].every(Number.isFinite)) { d.timer = 0; return; }
        d.timer -= dt; d.pingTimer -= dt; d.pulseRadius = Math.max(0, d.pulseRadius - 180 * dt);
        if (d.timer <= 0) return;
        const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt;
        if (!this.isRockAt(nx, ny)) { d.x = nx; d.y = ny; }
        else { d.vx = 0; d.vy = 0; }
        d.vx *= Math.pow(0.94, dt * 60); d.vy *= Math.pow(0.94, dt * 60);
        if (d.pingTimer <= 0 && d.pingsLeft > 0) {
          d.pingTimer = 1.6; d.pingsLeft--; d.pulseRadius = 1;
          const ping = this.triggerSonarPing(d.x, d.y, false);
          // triggerSonarPing emits the isolated decoy-ping presentation event.
        }
      });
      this.decoys = this.decoys.filter((d) => d.timer > 0);
      this.currents.forEach((c) => {
        if (distance(p, c) < c.r) {
          p.x = clamp(
            p.x + Math.cos(c.angle) * c.force * dt,
            25,
            this.width - 25,
          );
          p.y = clamp(
            p.y + Math.sin(c.angle) * c.force * dt,
            25,
            this.height - 25,
          );
        }
      });
      this.enemies.forEach((e) => {
        e.phase += dt * 0.2;
        e.attackCooldown = Math.max(0, e.attackCooldown - dt);
        const home = e.homeNode || { x: e.homeX, y: e.homeY };
        const patrolX = home.x + Math.cos(e.phase) * Math.min(150, e.range * 0.25);
        const patrolY = home.y + Math.sin(e.phase) * Math.min(110, e.range * 0.25);
        const visible = this.hasLineOfSight(e, p);
        let target = { x: patrolX, y: patrolY }, aggressive = false;
        if (e.stunTimer > 0) {
          e.stunTimer = Math.max(0, e.stunTimer - dt);
          e.state = "STUNNED";
          return;
        }
        if (e.type === "listener") {
          e.clickAt -= dt;
          if (e.clickAt <= 0) {
            e.clickAt = 3.2;
            this.events.push({ type: "enemy-vocal", enemyType: "LISTENER", pan: clamp((e.x-p.x)/500,-1,1), distNorm: distance(e,p)/550 });
            if (!p.isMasked && distance(e, p) <= 240 && visible && e.state === "PATROL") {
              p.detected = true;
              e.targetX = p.x; e.targetY = p.y; e.state = "WINDUP"; e.windupTimer = 0.75;
              this.events.push({ type: "listener-windup" });
            }
          }
          const heard = this.noiseEvents.filter((n) => ["ping","DECOY","ENGINE","scrape","decoy"].includes(n.type))
            .map((n) => ({ n, d: distance(e,n), radius: n.type === "DECOY" || n.type === "decoy" ? 700 : n.type === "ping" ? 460 : n.type === "scrape" ? 450 : n.type === "ENGINE" ? (n.throttle > .65 ? 160 : 0) : 0 }))
            .find(({n,d,radius}) => d <= radius && (!p.isMasked || n.type !== "sonar"));
          if (heard && e.state === "PATROL") {
            p.detected = true;
            e.targetX = heard.n.x; e.targetY = heard.n.y;
            e.state = "WINDUP"; e.windupTimer = 0.75;
            this.events.push({ type: "listener-windup" });
          }
          if (e.state === "WINDUP") {
            target = { x: e.targetX, y: e.targetY }; e.angle = Math.atan2(target.y-e.y,target.x-e.x);
            e.windupTimer -= dt; aggressive = true;
            if (e.windupTimer <= 0) { e.state = "LUNGE"; e.lungeTimer = 1.4; e.lungeAngle = e.angle; }
          } else if (e.state === "LUNGE") {
            aggressive = true; e.lungeTimer -= dt;
            const hitWall = this.moveEnemy(e, Math.cos(e.lungeAngle)*240*dt, Math.sin(e.lungeAngle)*240*dt);
            if (hitWall) { e.state="STUNNED"; e.stunTimer=3; this.shockwaves.push({x:e.x,y:e.y,age:0,kind:"wall"}); this.events.push({type:"wall-stun",x:e.x,y:e.y}); }
            else if (e.lungeTimer <= 0 || distance(e,{x:e.targetX,y:e.targetY}) < 22) { e.state="LISTEN_PAUSE"; e.pauseTimer=1.2; }
          } else if (e.state === "LISTEN_PAUSE") {
            e.pauseTimer -= dt;
            if (e.pauseTimer <= 0) e.state = "PATROL";
          } else if (! ["WINDUP","LUNGE","LISTEN_PAUSE"].includes(e.state)) e.state = "PATROL";
        } else if (e.type === "lurker") {
          const d = distance(e,p), bearing = Math.atan2(e.y-p.y,e.x-p.x);
          const beamAngle = Math.abs(Math.atan2(Math.sin(bearing-p.angle),Math.cos(bearing-p.angle)));
          const pinned = p.lamp && p.battery > 0 && d <= 380 && beamAngle <= Math.PI*31/180 && visible;
          if (e.state === "FLEE") {
            e.fleeTimer -= dt;
            const awayX=e.x-p.x, awayY=e.y-p.y, awayDistance=Math.hypot(awayX,awayY)||1;
            target={x:clamp(e.x+awayX/awayDistance*520,25,this.width-25),y:clamp(e.y+awayY/awayDistance*520,25,this.height-25)};
            aggressive=true;
            if (e.fleeTimer <= 0) e.state="DORMANT";
          } else if (pinned) {
            p.detected = true;
            if (e.state !== "LIGHT_PINNED") this.events.push({type:"stalker-pinned",x:e.x,y:e.y});
            e.state = "LIGHT_PINNED"; e.pinTimer += dt; e.angle = Math.atan2(p.y-e.y,p.x-e.x);
            if (e.pinTimer >= 1.1) {
              e.state="FLEE"; e.fleeTimer=7; e.pinTimer=0;
              const awayX=e.x-p.x, awayY=e.y-p.y, awayDistance=Math.hypot(awayX,awayY)||1;
              target={x:clamp(e.x+awayX/awayDistance*520,25,this.width-25),y:clamp(e.y+awayY/awayDistance*520,25,this.height-25)};
              aggressive=true; this.events.push({type:"stalker-flee"});
            }
          } else if (e.state === "LIGHT_PINNED") { e.state="CREEP"; }
          else if (d <= 350 && visible && !p.lamp) {
            e.state="CREEP"; target=p; aggressive=true;
            if (this.elapsed >= (e.creepTickAt || 0)) { e.creepTickAt=this.elapsed+Math.max(.18, d/900); this.events.push({type:"stalker-tick",x:e.x,y:e.y,distNorm:d/350}); }
          } else { e.state="DORMANT"; e.pinTimer=0; }
        } else if (e.type === "magnetar") {
          const d = distance(e, p);
          if (p.lamp && p.battery > 0 && d <= 420 && e.state === "PATROL") {
            this.alertMagnetars("lamp", p.x, p.y, 420);
          }
          if (e.state === "EMP_DISCHARGE") {
            e.dischargeTimer -= dt;
            if (e.dischargeTimer <= 0) { e.state = "RECHARGE"; e.rechargeTimer = 4; }
          } else if (e.state === "RECHARGE") {
            e.rechargeTimer -= dt;
            if (e.rechargeTimer <= 0) e.state = "PATROL";
          } else if (e.state === "CHARGE_SURGE") {
            if (e.magnetarTargetKind === "lamp" && p.lamp && p.battery > 0) {
              e.magnetarTargetX = p.x; e.magnetarTargetY = p.y;
            } else if (e.magnetarTargetKind === "decoy") {
              const buoy = this.decoys.filter((d) => d.timer > 0)
                .sort((a, b) => distance(e, a) - distance(e, b))[0];
              if (buoy) { e.magnetarTargetX = buoy.x; e.magnetarTargetY = buoy.y; }
            }
            e.targetX = e.magnetarTargetX; e.targetY = e.magnetarTargetY;
            if (e.chargeTimer > 0) {
              e.chargeTimer = Math.max(0, e.chargeTimer - dt);
              e.angle = Math.atan2(e.targetY - e.y, e.targetX - e.x);
            } else {
              const dx = e.targetX - e.x, dy = e.targetY - e.y, len = Math.hypot(dx, dy) || 1;
              e.angle = Math.atan2(dy, dx);
              this.moveEnemy(e, dx / len * 215 * dt, dy / len * 215 * dt);
              e.surgeActive = true;
              if (len < 22) { e.state = "PATROL"; e.surgeActive = false; e.magnetarTargetKind = ""; }
            }
          } else {
            e.state = "PATROL";
            e.surgeActive = false;
            const patrolX = home.x + Math.cos(e.phase) * Math.min(150, e.range * 0.25);
            const patrolY = home.y + Math.sin(e.phase) * Math.min(110, e.range * 0.25);
            const dx = patrolX - e.x, dy = patrolY - e.y, len = Math.hypot(dx, dy) || 1;
            const repulsion = this.wallRepulsion(e);
            const driftX = dx / len * 52 + repulsion.x * 20, driftY = dy / len * 52 + repulsion.y * 20;
            const driftLength = Math.hypot(driftX, driftY) || 1;
            this.moveEnemy(e, driftX / driftLength * 52 * dt, driftY / driftLength * 52 * dt);
          }
          if (e.state !== "EMP_DISCHARGE" && e.state !== "RECHARGE" && d < 38) {
            this.damage(30, "EMP DISCHARGE — MAGNETAR CONTACT");
            p.battery = Math.max(0, p.battery - 30);
            p.lamp = false;
            p.empDisabledTimer = 3;
            e.state = "EMP_DISCHARGE";
            e.dischargeTimer = 0.65;
            e.surgeActive = false;
            this.shockwaves.push({ x: p.x, y: p.y, age: 0, kind: "magnetar" });
            this.events.push({ type: "magnetar-emp", x: p.x, y: p.y });
          }
          return;
        } else e.state = "PATROL";
        if (!aggressive && distance(e,home) > e.leashRadius) target=home;
        if (["PATROL","DORMANT","LISTEN_PAUSE","LIGHT_PINNED","STUNNED"].includes(e.state)) {
          if (e.state === "PATROL" || e.state === "DORMANT") {
            const dx=target.x-e.x,dy=target.y-e.y,len=Math.hypot(dx,dy)||1,repulsion=this.wallRepulsion(e),mineAvoid=this.mineRepulsion(e);
            const speed=e.state === "PATROL" ? (e.type === "listener" ? 65 : 24) : 0;
            this.moveEnemy(e,(dx/len*speed+repulsion.x*2+mineAvoid.x*30)*dt,(dy/len*speed+repulsion.y*2+mineAvoid.y*30)*dt);
          }
        } else if (e.state !== "LUNGE") {
          const angle=Math.atan2(target.y-e.y,target.x-e.x);
          e.angle=angle;
          const speed=e.type==="lurker" ? (e.state==="FLEE" ? 150 : 82) : 65;
          const repulsion=this.wallRepulsion(e);
          this.moveEnemy(e,(Math.cos(angle)+repulsion.x*.75)*speed*dt,(Math.sin(angle)+repulsion.y*.75)*speed*dt);
        }
        if (e.state === "CREEP" && this.elapsed >= (e.creepTickAt || 0)) {
          e.creepTickAt=this.elapsed+Math.max(.18,distance(e,p)/900);
          this.events.push({type:"stalker-tick",x:e.x,y:e.y,distNorm:distance(e,p)/350});
        }
        if (distance(e,p) < 36 && e.attackCooldown <= 0 && e.state !== "STUNNED" && e.state !== "LIGHT_PINNED") {
          e.attackCooldown=3;
          this.damage(e.type === "listener" ? 35 : 50, `HULL STRUCK BY ${e.type.toUpperCase()}`);
          p.leaking=true; p.isMasked=false;
        }
        if (!p.isMasked && distance(e,p)<650 && this.elapsed-e.passiveAt>=2.5) {
          e.passiveAt=this.elapsed;
          this.echoes.push({x:e.x,y:e.y,kind:"FLESH",color:"#ff2a55",age:0,angle:Math.atan2(e.y-p.y,e.x-p.x),passive:true});
          this.events.push({type:"enemy-passive",pan:clamp((e.x-p.x)/600,-1,1),distNorm:distance(e,p)/650});
        }
      });
      this.nearestMagnetar = this.enemies.filter((e) => e.type === "magnetar" && !e.dead)
        .map((e) => ({ enemy: e, dist: distance(e, p) }))
        .sort((a, b) => a.dist - b.dist)[0] || null;
      this.empIntensity = this.nearestMagnetar ? Math.max(0, 1 - this.nearestMagnetar.dist / 420) : 0;
      this.empBearing = this.nearestMagnetar
        ? Math.atan2(this.nearestMagnetar.enemy.y - p.y, this.nearestMagnetar.enemy.x - p.x) - p.angle
        : 0;
      // Aggressive creatures can be baited into armed bio-mines.
      this.mines.forEach((m) => {
        if (!m.armed) return;
        const victim=this.enemies.find((e)=>
          (e.type === "magnetar" && e.surgeActive && e.state === "CHARGE_SURGE" && distance(e,m) <= 32) ||
          (e.type !== "magnetar" && ["LUNGE","INVESTIGATE","FLEE"].includes(e.state) && distance(e,m)<=30));
        if (victim) {
          m.armed=false; victim.dead=true;
          this.events.push({type:"enemy-mine-kill",x:m.x,y:m.y});
          this.events.push({type:"tactical-kill"});
          this.shockwaves.push({x:m.x,y:m.y,age:0});
          this.noiseEvents.push({type:"mine",x:m.x,y:m.y,age:0,radius:650});
        }
      });
      this.enemies = this.enemies.filter((e)=>!e.dead);
      for (let i=0;i<this.enemies.length;i++) for(let j=i+1;j<this.enemies.length;j++) {
        const a=this.enemies[i],b=this.enemies[j];
        if (a.type!==b.type && (a.state==="LUNGE" || b.state==="LUNGE") && distance(a,b)<=28 && [a.type,b.type].includes("lurker")) {
          a.state=b.state="STUNNED"; a.stunTimer=b.stunTimer=5;
          this.shockwaves.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,age:0,kind:"brawl"});
          this.events.push({type:"creature-brawl",x:(a.x+b.x)/2,y:(a.y+b.y)/2});
        }
      }
      this.mines.forEach((m) => {
        if (m.armed && distance(p, m) < 34) {
          m.armed = false;
          this.damage(65, "DETONATED ACOUSTIC MINE");
          this.noiseEvents.push({ type: "mine", x: p.x, y: p.y, age: 0, radius: 650 });
        }
      });
      this.batteries.forEach((b) => {
        if (!b.taken && distance(p, b) < 25) {
          b.taken = true;
      p.battery = Math.min(100, p.battery + 45);
          this.events.push({ type: "battery" });
        }
      });
      this.rocks.forEach((r) => {
        const d = distance(p, r);
        if (d < r.r + 17) {
          p.isMasked = false;
          const a = Math.atan2(p.y - r.y, p.x - r.x);
          p.x = r.x + Math.cos(a) * (r.r + 18);
          p.y = r.y + Math.sin(a) * (r.r + 18);
          const impactSpeed = p.speed;
          p.speed *= 0.38;
          if (this.elapsed - this.lastScrape > 0.65) {
            this.lastScrape = this.elapsed;
            this.events.push({ type: "scrape" });
            this.noiseEvents.push({ type: "scrape", x: p.x, y: p.y, age: 0, radius: 500 });
          }
          if (impactSpeed > 35 && this.elapsed - this.lastNoise > 1.2) {
            this.damage(20, "HULL CRUSHED AGAINST ROCK");
            p.leaking = true;
          }
        }
      });
      if (p.lamp) {
        const lit = this.rocks.some((r) => distance(p, r) < r.r + 225) || distance(p, this.goal) < 225 || this.mines.some((m) => m.armed && distance(p, m) < 225);
        if (lit && !p.lampFixHeld) this.fixPosition("OPTICAL");
        p.lampFixHeld = lit;
      } else p.lampFixHeld = false;
      if (distance(p, this.goal) < 52) {
        this.over = true;
        this.won = true;
        this.events.push({ type: "win" });
      }
      if (p.hull <= 0) {
        this.over = true;
        this.won = false;
        this.events.push({ type: "lose" });
      }
      this.events = this.events.slice(-12);
    }
    fixPosition(source) {
      const p = this.player;
      if (Math.hypot(p.estX - p.x, p.estY - p.y) < 0.5) return;
      p.estX = p.x;
      p.estY = p.y;
      this.fixFlash = 1.8;
      this.events.push({ type: "position-fix", source });
    }
    damage(amount, cause) {
      const p = this.player;
      p.hull = Math.max(0, p.hull - amount);
      this.lastNoise = this.elapsed;
      this.lastDamageCause = cause;
      this.lossCause = cause;
      this.events.push({ type: cause.includes("MINE") ? "mine-hit" : "hit" });
    }
    addDecoy() {
      if (this.player.decoys <= 0) return false;
      this.player.decoys--;
      const p = this.player;
      const heading = Number.isFinite(p.angle) ? p.angle : 0;
      const x = Number(p.x), y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) { this.player.decoys++; return false; }
      this.decoys.push({ x: x + Math.cos(heading) * 24, y: y + Math.sin(heading) * 24,
        vx: Math.cos(heading) * 110, vy: Math.sin(heading) * 110,
        timer: 6, pingTimer: .25, pingsLeft: 4, pulseRadius: 0 });
      this.alertMagnetars("decoy", x + Math.cos(heading) * 24, y + Math.sin(heading) * 24, 580);
      this.events.push({ type: "decoy-launched" });
      return true;
    }
    severTether() {
      if (!this.player.tether) return false;
      this.player.tether = false;
      const tail = this.breadcrumbs[0] || this.player;
      this.noiseEvents.push({ type: "decoy", x: tail.x, y: tail.y, age: 0, radius: 550 });
      this.decoys.push({ x: tail.x, y: tail.y, timer: 7, age: 0, r: 8, angle: 0, travelled: 0, stopped: true, pingsLeft: 1, nextPing: 0, overcharge: true });
      this.alertMagnetars("tether", tail.x, tail.y, 580);
      this.events.push({ type: "tether" });
      return true;
    }
    draw(ctx) {
      const p = this.player;
      ctx.save();
      const grd = ctx.createLinearGradient(0, 0, this.width, this.height);
      grd.addColorStop(0, "#0b2932");
      grd.addColorStop(0.5, "#0a2029");
      grd.addColorStop(1, "#071a24");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = "#b0d7c4";
      this.stars.forEach((s) => {
        ctx.globalAlpha = s.a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 7);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(106,164,159,.07)";
      ctx.lineWidth = 1;
      for (let x = 0; x < this.width; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, this.height);
        ctx.stroke();
      }
      for (let y = 0; y < this.height; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }
      this.currents.forEach((c) => {
        ctx.strokeStyle =
          c.force > 25 ? "rgba(231,166,100,.3)" : "rgba(105,178,172,.22)";
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r, 0, 7);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(c.angle) * 28, c.y + Math.sin(c.angle) * 28);
        ctx.stroke();
      });
      const ts = this.tileSize;
      // Build a continuous rock mass from smoothed cells; overlapping rounded cells soften the silhouette.
      ctx.fillStyle = "#0b131e";
      for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
        if (!this.cavern[y][x]) continue;
        const px = x * ts, py = y * ts;
        ctx.fillRect(px, py, ts, ts);
        ctx.beginPath(); ctx.arc(px + ts / 2, py + ts / 2, ts * 0.73, 0, Math.PI * 2); ctx.fill();
      }
      // Trace water-facing cell edges as a connected, rounded contour rim.
      ctx.strokeStyle = "#2c5364";
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
        if (!this.cavern[y][x]) continue;
        const px = x * ts, py = y * ts;
        if (!this.cavern[y - 1]?.[x]) { ctx.moveTo(px + 3, py); ctx.lineTo(px + ts - 3, py); }
        if (!this.cavern[y + 1]?.[x]) { ctx.moveTo(px + 3, py + ts); ctx.lineTo(px + ts - 3, py + ts); }
        if (!this.cavern[y]?.[x - 1]) { ctx.moveTo(px, py + 3); ctx.lineTo(px, py + ts - 3); }
        if (!this.cavern[y]?.[x + 1]) { ctx.moveTo(px + ts, py + 3); ctx.lineTo(px + ts, py + ts - 3); }
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(58,124,165,.7)";
      ctx.lineWidth = 1;
      ctx.stroke();
      this.mines.forEach((m) => {
        if (!m.armed) return;
        ctx.fillStyle = "#e7a664";
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, 7);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,72,61,.88)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 34, 0, 7);
        ctx.stroke();
        ctx.strokeStyle = "rgba(236,187,126,.85)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - 22, m.y - 20); ctx.stroke();
      });
      this.batteries.forEach((b) => {
        if (b.taken) return;
        ctx.fillStyle = "#80c98f";
        ctx.fillRect(b.x - 5, b.y - 8, 10, 16);
        ctx.fillRect(b.x - 8, b.y - 3, 16, 6);
      });
      this.drawGoal(ctx);
      ctx.globalAlpha = 1;
      this.enemies.forEach((e) => this.drawEnemy(ctx, e));
      ctx.restore();
    }
    drawAcousticOverlay(ctx) {
      if (this.breadcrumbs.length > 1) {
        ctx.save(); ctx.strokeStyle = "#00e5ff33"; ctx.lineWidth = 2; ctx.beginPath();
        this.breadcrumbs.forEach((b, i) => i ? ctx.lineTo(b.x, b.y) : ctx.moveTo(b.x, b.y));
        ctx.stroke(); ctx.restore();
      }
      this.decoys.forEach((d) => {
        if (![d.x,d.y,d.pulseRadius].every(Number.isFinite)) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, d.timer / 6));
        ctx.strokeStyle = "#e9ae6f"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(d.x, d.y, 8 + d.pulseRadius * 32, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      });
      this.shockwaves.forEach((w) => {
        ctx.save(); ctx.globalAlpha=Math.max(0,1-w.age/1.1); ctx.strokeStyle=w.kind==="wall"?"#57eaff":w.kind==="brawl"?"#ff526b":w.kind==="magnetar"?"#ca70ff":"#ffbd42"; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(w.x,w.y,12+w.age*155,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle="#ff7040"; for(let i=0;i<8;i++){const a=i*Math.PI/4+w.age*2;ctx.beginPath();ctx.arc(w.x+Math.cos(a)*(15+w.age*65),w.y+Math.sin(a)*(15+w.age*65),2.5,0,7);ctx.fill();}
        ctx.restore();
      });
      this.pings.forEach((q) => {
        ctx.save();
        ctx.strokeStyle = "rgba(0, 240, 255, 0.28)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      });
      this.drawMagnetarCores(ctx);
      this.drawSonarDots(ctx);
      this.drawPlayer(ctx);
    }
    drawMagnetarCores(ctx) {
      this.enemies.filter((e) => e.type === "magnetar" && !e.dead).forEach((e) => {
        const pulse = 0.55 + (Math.sin(this.elapsed * 17 + e.phase) + 1) * 0.22;
        ctx.save();
        ctx.globalAlpha = pulse * 0.48;
        ctx.strokeStyle = "#bd65ff"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(e.x, e.y, 22, this.elapsed * 2, this.elapsed * 2 + Math.PI * 1.45); ctx.stroke();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = "#dc8cff"; ctx.shadowColor = "#b547ff"; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(e.x, e.y, 2.4 + pulse * 0.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
    }
    drawSonarDots(ctx) {
      this.phosphor.forEach((d) => {
        if (!d.active || d.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = d.color;
        ctx.shadowColor = d.color; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
    }
    drawGoal(ctx) {
      const g = this.goal;
      ctx.strokeStyle = "rgba(101,213,198,.32)";
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(g.x, g.y, 50, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#6cdec9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.x, g.y, 10, 0, 7);
      ctx.stroke();
      ctx.fillStyle = "#78cfc2";
      ctx.font = "12px monospace";
      ctx.fillText("EXIT BEACON", g.x + 18, g.y - 12);
    }
    drawEnemy(ctx, e) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      if (e.type === "listener") {
        if (e.state === "WINDUP") {
          ctx.save(); ctx.strokeStyle=`rgba(255,45,67,${.45+Math.sin(this.elapsed*28)*.4})`; ctx.lineWidth=3;
          ctx.beginPath();ctx.moveTo(22,0);ctx.lineTo(Math.max(55,Math.hypot(e.targetX-e.x,e.targetY-e.y)),0);ctx.stroke();
          ctx.restore();
        }
        ctx.fillStyle = "#d8d9ca";
        ctx.beginPath(); ctx.ellipse(0, 0, 21, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#b9c5bc";
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath(); ctx.arc(-i * 6, 0, 5.5 - Math.abs(i) * 0.35, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = `rgba(255,42,85,${0.35 + Math.sin(this.elapsed * 5) * 0.18})`;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath(); ctx.moveTo(i * 4, -4); ctx.lineTo(i * 4, -12); ctx.moveTo(i * 4, 4); ctx.lineTo(i * 4, 12); ctx.stroke();
        }
      } else if (e.type === "lurker") {
        ctx.fillStyle = "rgba(189,220,222,.72)";
        ctx.beginPath(); ctx.moveTo(16, 0); ctx.quadraticCurveTo(3, -5, -6, -17); ctx.quadraticCurveTo(-8, -5, -15, 0); ctx.quadraticCurveTo(-8, 5, -6, 17); ctx.quadraticCurveTo(3, 5, 16, 0); ctx.fill();
        ctx.fillStyle = e.alert ? "#fff1b2" : "#c5e7df";
        ctx.beginPath(); ctx.arc(10, -2, 1.7, 0, 7); ctx.arc(10, 2, 1.7, 0, 7); ctx.fill();
      } else if (e.type === "magnetar") {
        const charge = e.state === "CHARGE_SURGE" ? 1 : 0;
        const flicker = 0.75 + Math.sin(this.elapsed * 23 + e.phase) * 0.2;
        ctx.save();
        ctx.globalAlpha = flicker;
        ctx.shadowColor = "#b44cff"; ctx.shadowBlur = 18 + charge * 17;
        ctx.fillStyle = charge ? "#d792ff" : "#73409a";
        ctx.beginPath(); ctx.ellipse(0, 0, 31, 22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#d783ff"; ctx.lineWidth = 2;
        for (let i = 0; i < 7; i++) {
          const x = -22 + i * 7.2, sway = Math.sin(this.elapsed * 2.5 + i * 1.7 + e.phase) * 5;
          ctx.beginPath(); ctx.moveTo(x, 12); ctx.bezierCurveTo(x - 7, 25, x + sway, 35, x + sway * 1.8, 49 + (i % 3) * 5); ctx.stroke();
        }
        for (let i = 0; i < 5; i++) {
          const a = this.elapsed * 5 + i * Math.PI * 0.4, r = 22 + Math.sin(this.elapsed * 19 + i) * 5;
          ctx.strokeStyle = i % 2 ? "#70faff" : "#dc82ff";
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7); ctx.lineTo(Math.cos(a + 0.25) * r, Math.sin(a + 0.25) * r); ctx.stroke();
        }
        ctx.restore();
      } else {
        ctx.fillStyle = "#9d3e48";
        ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(6, -8); ctx.lineTo(-14, -5); ctx.lineTo(-22, 0); ctx.lineTo(-14, 5); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#ff6d63"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-13, -11); ctx.moveTo(-8, 4); ctx.lineTo(-13, 11); ctx.stroke();
      }
      if (e.state === "STUNNED") {
        ctx.save(); ctx.rotate(-e.angle); ctx.fillStyle="#79e9ff"; ctx.font="bold 14px monospace";ctx.textAlign="center";
        ctx.fillText("✦   ✦",0,-20);ctx.restore();
      }
      ctx.fillStyle = e.type === "magnetar" ? "rgba(212,139,255,.9)" : "rgba(255,125,112,.8)";
      ctx.font = "8px monospace";
      if (e.type !== "magnetar") ctx.fillText(e.type.toUpperCase(), 15, -10);
      ctx.restore();
    }
    drawPlayer(ctx) {
      const p = this.player;
      if (![p.x,p.y,p.angle].every(Number.isFinite)) return;
      ctx.save();
      ctx.translate(p.x, p.y);
      // Marine snow catches the sub's ambient halo and shifts opposite motion.
      for (let i = 0; i < 18; i++) {
        const a = i * 2.399 + this.elapsed * (0.12 + (i % 4) * 0.03);
        const r = 7 + ((i * 17 + Math.floor(this.elapsed * 3)) % 29);
        ctx.globalAlpha = 0.14 + (i % 4) * 0.035;
        ctx.fillStyle = "#c7e7d3";
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r - Math.cos(p.angle) * p.speed * 0.035, Math.sin(a) * r - Math.sin(p.angle) * p.speed * 0.035, 0.55 + (i % 3) * 0.2, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (p.isMasked) {
        ctx.strokeStyle="rgba(110,255,149,.8)";ctx.lineWidth=1.5;ctx.shadowColor="#59ff91";ctx.shadowBlur=6;
        ctx.beginPath();ctx.ellipse(0,0,24,11,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
      }
      if (p.thrusterActive && p.speed > 2) {
        const bubbles = Math.min(8, Math.ceil(p.noise * 8));
        for (let i = 0; i < bubbles; i++) {
          const age = ((this.elapsed * (1.1 + p.noise * 2) + i * .31) % 1);
          ctx.globalAlpha = (1 - age) * .45;
          ctx.fillStyle = "#a8e4db";
          ctx.beginPath();
          ctx.arc(-20 - age * 18, (i % 2 ? 1 : -1) * (4 + age * 7), 1 + age * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.rotate(p.angle);
      ctx.shadowColor = "#c3e2b4";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#c0d8b4";
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(9, -7);
      ctx.lineTo(-15, -6);
      ctx.lineTo(-20, -3);
      ctx.lineTo(-20, 3);
      ctx.lineTo(-15, 6);
      ctx.lineTo(9, 7);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      if (p.lamp) {
        ctx.fillStyle = "rgba(233,230,167,.12)";
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(225, -85);
        ctx.lineTo(225, 85);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  window.LEVELS = LEVELS;
  window.DAILY_LEVEL = DAILY;
  window.dailySeed = dailySeed;
  window.GameWorld = World;
})();
