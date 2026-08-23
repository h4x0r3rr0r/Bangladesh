import Alpine from "alpinejs";

import CTFd from "./index";

import { Modal, Tab, Tooltip } from "bootstrap";
import highlight from "./theme/highlight";
import { intl } from "./theme/times";
import { DISTRICTS, DISTRICT_IDS } from "./bd_districts";

// Stable unique color per category name (HSL).
// Old ColdHeat hash collided (e.g. Forensics/Reversing/Scripting all green).
function hashString(s) {
  // FNV-1a 32-bit
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function colorhashStr(s) {
  const h = hashString(String(s).toLowerCase().trim());
  // Spread hues around the wheel; keep saturation/lightness readable on dark UI
  const hue = h % 360;
  const sat = 55 + (h % 25); // 55–79%
  const light = 42 + ((h >> 8) % 16); // 42–57%
  return hslToHex(hue, sat, light);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = n => {
    const v = Math.round((n + m) * 255);
    return v.toString(16).padStart(2, "0");
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

// Assigns challenges to districts.
// - Challenges tagged with a valid district id (e.g. "feni", "dhaka") are
//   pinned to that district. MULTIPLE challenges may share the same tag,
//   so a connected series (e.g. 3–4 OSINT challenges) can all sit on one district.
// - Untagged challenges are auto-assigned one-per-free-district.
// Returns: { districtId: [chal, chal, ...] }
function assignDistricts(challenges) {
  const districtToChallenges = {};
  const challengeToDistrict = {};
  const occupiedByTag = new Set();

  // 1) Pin by explicit district tags (many challenges can share one district)
  challenges.forEach(chal => {
    const tagMatch = (chal.tags || []).find(t => DISTRICT_IDS.includes(t.value));
    if (tagMatch) {
      const id = tagMatch.value;
      if (!districtToChallenges[id]) districtToChallenges[id] = [];
      districtToChallenges[id].push(chal);
      challengeToDistrict[chal.id] = id;
      occupiedByTag.add(id);
    }
  });

  // 2) Auto-assign untagged challenges to free districts (1 each)
  let cursor = 0;
  challenges.forEach(chal => {
    if (challengeToDistrict[chal.id] !== undefined) return;

    while (
      cursor < DISTRICT_IDS.length &&
      (occupiedByTag.has(DISTRICT_IDS[cursor]) ||
        districtToChallenges[DISTRICT_IDS[cursor]])
    ) {
      cursor++;
    }
    if (cursor >= DISTRICT_IDS.length) {
      // No free districts left — extra untagged challenges stay off the map
      return;
    }
    const id = DISTRICT_IDS[cursor];
    districtToChallenges[id] = [chal];
    challengeToDistrict[chal.id] = id;
    cursor++;
  });

  return districtToChallenges;
}

function addTargetBlank(html) {
  let dom = new DOMParser();
  let view = dom.parseFromString(html, "text/html");
  let links = view.querySelectorAll('a[href*="://"]');
  links.forEach(link => {
    link.setAttribute("target", "_blank");
  });
  return view.documentElement.outerHTML;
}

window.Alpine = Alpine;

Alpine.store("challenge", {
  data: {
    view: "",
  },
});

Alpine.data("Hint", () => ({
  id: null,
  html: null,

  async showHint(event) {
    if (event.target.open) {
      let response = await CTFd.pages.challenge.loadHint(this.id);

      // Hint has some kind of prerequisite or access prevention
      if (response.errors) {
        event.target.open = false;
        CTFd._functions.challenge.displayUnlockError(response);
        return;
      }
      let hint = response.data;
      if (hint.content) {
        this.html = addTargetBlank(hint.html);
      } else {
        let answer = await CTFd.pages.challenge.displayUnlock(this.id);
        if (answer) {
          let unlock = await CTFd.pages.challenge.loadUnlock(this.id);

          if (unlock.success) {
            let response = await CTFd.pages.challenge.loadHint(this.id);
            let hint = response.data;
            this.html = addTargetBlank(hint.html);
          } else {
            event.target.open = false;
            CTFd._functions.challenge.displayUnlockError(unlock);
          }
        } else {
          event.target.open = false;
        }
      }
    }
  },
}));

Alpine.data("Challenge", () => ({
  id: null,
  next_id: null,
  submission: "",
  tab: null,
  solves: [],
  submissions: [],
  solution: null,
  response: null,
  share_url: null,
  max_attempts: 0,
  attempts: 0,
  ratingValue: 0,
  selectedRating: 0,
  ratingReview: "",
  ratingSubmitted: false,

  async init() {
    highlight();
  },

  getStyles() {
    let styles = {
      "modal-dialog": true,
    };
    try {
      let size = CTFd.config.themeSettings.challenge_window_size;
      switch (size) {
        case "sm":
          styles["modal-sm"] = true;
          break;
        case "lg":
          styles["modal-lg"] = true;
          break;
        case "xl":
          styles["modal-xl"] = true;
          break;
        default:
          break;
      }
    } catch (error) {
      // Ignore errors with challenge window size
      console.log("Error processing challenge_window_size");
      console.log(error);
    }
    return styles;
  },

  async init() {
    highlight();
  },

  async showChallenge() {
    new Tab(this.$el).show();
  },

  async showSolves() {
    this.solves = await CTFd.pages.challenge.loadSolves(this.id);
    this.solves.forEach(solve => {
      solve.date = intl.format(new Date(solve.date));
      return solve;
    });
    new Tab(this.$el).show();
  },

  async showSubmissions() {
    let response = await CTFd.pages.users.userSubmissions("me", this.id);
    this.submissions = response.data;
    this.submissions.forEach(s => {
      s.date = intl.format(new Date(s.date));
      return s;
    });
    new Tab(this.$el).show();
  },

  getSolutionId() {
    let data = Alpine.store("challenge").data;
    return data.solution_id;
  },

  getSolutionState() {
    let data = Alpine.store("challenge").data;
    return data.solution_state;
  },

  setSolutionId(solutionId) {
    Alpine.store("challenge").data.solution_id = solutionId;
  },

  async showSolution() {
    let solution_id = this.getSolutionId();
    CTFd._functions.challenge.displaySolution = solution => {
      this.solution = solution.html;
      new Tab(this.$el).show();
    };
    await CTFd.pages.challenge.displaySolution(solution_id);
  },

  getNextId() {
    let data = Alpine.store("challenge").data;
    return data.next_id;
  },

  async nextChallenge() {
    let modal = Modal.getOrCreateInstance("[x-ref='challengeWindow']");

    // TODO: Get rid of this private attribute access
    // See https://github.com/twbs/bootstrap/issues/31266
    modal._element.addEventListener(
      "hidden.bs.modal",
      event => {
        // Dispatch load-challenge event to call loadChallenge in the ChallengeBoard
        Alpine.nextTick(() => {
          this.$dispatch("load-challenge", this.getNextId());
        });
      },
      { once: true },
    );
    modal.hide();
  },

  async getShareUrl() {
    let body = {
      type: "solve",
      challenge_id: this.id,
    };
    const response = await CTFd.fetch("/api/v1/shares", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const data = await response.json();
    const url = data["data"]["url"];
    this.share_url = url;
  },

  copyShareUrl() {
    navigator.clipboard.writeText(this.share_url);
    let t = Tooltip.getOrCreateInstance(this.$el);
    t.enable();
    t.show();
    setTimeout(() => {
      t.hide();
      t.disable();
    }, 2000);
  },

  async submitChallenge() {
    this.response = await CTFd.pages.challenge.submitChallenge(
      this.id,
      this.submission,
    );

    // Challenges page might be visible to anonymous users, redirect to login on submit
    if (this.response.data.status === "authentication_required") {
      window.location = `${CTFd.config.urlRoot}/login?next=${CTFd.config.urlRoot}${window.location.pathname}${window.location.hash}`;
      return;
    }

    await this.renderSubmissionResponse();
  },

  async renderSubmissionResponse() {
    if (this.response.data.status === "correct") {
      this.submission = "";
    }

    // Decide whether to check for the solution
    if (this.getSolutionId() == null) {
      if (
        CTFd.pages.challenge.checkSolution(
          this.getSolutionState(),
          Alpine.store("challenge").data,
          this.response.data.status,
        )
      ) {
        let data = await CTFd.pages.challenge.getSolution(this.id);
        this.setSolutionId(data.id);
      }
    }

    // Increment attempts counter
    if (
      this.max_attempts > 0 &&
      this.response.data.status != "already_solved" &&
      this.response.data.status != "ratelimited"
    ) {
      this.attempts += 1;
    }

    // Dispatch load-challenges event to call loadChallenges in the ChallengeBoard
    this.$dispatch("load-challenges");
  },

  async submitRating() {
    const response = await CTFd.pages.challenge.submitRating(
      this.id,
      this.selectedRating,
      this.ratingReview,
    );
    if (response.value) {
      this.ratingValue = this.selectedRating;
      this.ratingSubmitted = true;
    } else {
      alert("Error submitting rating");
    }
  },
}));

Alpine.data("ChallengeBoard", () => ({
  loaded: false,
  challenges: [],
  challenge: null,
  districts: DISTRICTS,
  districtMap: {},
  categoryColors: {},
  mapSvgHtml: "",
  pickerDistrict: null,
  pickerChallenges: [],

  async init() {
    this.challenges = await CTFd.pages.challenges.getChallenges();
    this.rebuildDistrictMap();
    this.loaded = true;

    // Event delegation for district clicks (SVG injected via x-html)
    this.$nextTick(() => {
      const container = this.$refs.mapContainer;
      if (container) {
        container.addEventListener("click", e => {
          const el = e.target.closest("[data-district]");
          if (el) {
            this.onDistrictClick(el.getAttribute("data-district"));
          }
        });
      }
    });

    if (window.location.hash) {
      let chalHash = decodeURIComponent(window.location.hash.substring(1));
      let idx = chalHash.lastIndexOf("-");
      if (idx >= 0) {
        let pieces = [chalHash.slice(0, idx), chalHash.slice(idx + 1)];
        let id = pieces[1];
        await this.loadChallenge(id);
      }
    }
  },

  rebuildDistrictMap() {
    this.districtMap = assignDistricts(this.challenges);
    const colors = {};
    this.getCategories().forEach(cat => {
      colors[cat] = colorhashStr(cat);
    });
    this.categoryColors = colors;
    this.mapSvgHtml = this.buildMapSvg();
  },

  // District helpers (districtMap values are arrays of challenges)
  getDistrictChallenges(districtId) {
    return this.districtMap[districtId] || [];
  },

  // - empty: light gray
  // - active: solid category color
  // - completed: full-district yellow COMPLETED ribbon fill
  getDistrictStyle(districtId) {
    const chals = this.getDistrictChallenges(districtId);
    if (!chals.length) {
      return { fill: "#e8e8e8" };
    }
    const allSolved = chals.every(c => c.solved_by_me);
    if (allSolved) {
      return { fill: "url(#ribbon-completed)" };
    }
    return { fill: this.getCategoryColor(chals[0].category) };
  },

  getDistrictTooltipText(districtId) {
    const chals = this.getDistrictChallenges(districtId);
    const name = DISTRICTS.find(d => d.id === districtId)?.name || districtId;
    if (!chals.length) return name;
    if (chals.length === 1) {
      const c = chals[0];
      const done = c.solved_by_me ? " ✓ COMPLETED" : "";
      return `${c.category} ${c.value}: ${c.name}${done}`;
    }
    const lines = chals.map(c => {
      const mark = c.solved_by_me ? "✓ " : "• ";
      return `${mark}${c.category} ${c.value}: ${c.name}`;
    });
    return `${name} (${chals.length} challenges)\n` + lines.join("\n");
  },

  // Full-area COMPLETED caution-tape pattern (fills whole district)
  buildRibbonDefs() {
    return `<defs>
      <pattern id="ribbon-completed" patternUnits="userSpaceOnUse"
               width="160" height="36" patternTransform="rotate(-28)">
        <rect width="160" height="36" fill="#ffcc00"/>
        <rect y="0" width="160" height="4" fill="#111"/>
        <rect y="32" width="160" height="4" fill="#111"/>
        <text x="8" y="24" font-family="Arial Black, Arial, sans-serif"
              font-size="15" font-weight="900" fill="#111"
              letter-spacing="1">COMPLETED</text>
      </pattern>
    </defs>`;
  },

  buildMapSvg() {
    const defs = this.buildRibbonDefs();
    const stroke = "#ffffff";
    const strokeW = "2";

    const paths = this.districts
      .map(d => {
        const chals = this.getDistrictChallenges(d.id);
        const style = this.getDistrictStyle(d.id);
        const cursor = chals.length ? "pointer" : "default";
        const title = this.getDistrictTooltipText(d.id);
        const safeTitle = title
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;")
          .replace(/</g, "&lt;");

        return (
          `<path data-district="${d.id}" d="${d.d}" fill="${style.fill}" ` +
          `stroke="${stroke}" stroke-width="${strokeW}" style="cursor:${cursor}">` +
          `<title>${safeTitle}</title></path>`
        );
      })
      .join("");
    return (
      `<svg viewBox="0 0 1555 2140" style="width:100%;height:auto;max-height:85vh;" ` +
      `xmlns="http://www.w3.org/2000/svg">${defs}${paths}</svg>`
    );
  },

  getCategoryColor(category) {
    return this.categoryColors[category] || "#eeeeee";
  },

  onDistrictClick(districtId) {
    const chals = this.getDistrictChallenges(districtId);
    if (!chals.length) return;

    if (chals.length === 1) {
      this.loadChallenge(chals[0].id);
      return;
    }

    // Multiple challenges on this district → show picker modal
    this.pickerDistrict = districtId;
    this.pickerChallenges = chals;
    this.$nextTick(() => {
      const el = document.getElementById("district-picker-modal");
      if (el) {
        Modal.getOrCreateInstance(el).show();
      }
    });
  },

  pickChallenge(challengeId) {
    const el = document.getElementById("district-picker-modal");
    if (el) {
      const modal = Modal.getInstance(el);
      if (modal) modal.hide();
    }
    this.loadChallenge(challengeId);
  },

  getCategories() {
    const categories = [];

    this.challenges.forEach(challenge => {
      const { category } = challenge;

      if (!categories.includes(category)) {
        categories.push(category);
      }
    });

    try {
      const f = CTFd.config.themeSettings.challenge_category_order;
      if (f) {
        const getSort = new Function(`return (${f})`);
        categories.sort(getSort());
      }
    } catch (error) {
      // Ignore errors with theme category sorting
      console.log("Error running challenge_category_order function");
      console.log(error);
    }

    return categories;
  },

  getChallenges(category) {
    let challenges = this.challenges;

    if (category !== null) {
      challenges = this.challenges.filter(challenge => challenge.category === category);
    }

    try {
      const f = CTFd.config.themeSettings.challenge_order;
      if (f) {
        const getSort = new Function(`return (${f})`);
        challenges.sort(getSort());
      }
    } catch (error) {
      // Ignore errors with theme challenge sorting
      console.log("Error running challenge_order function");
      console.log(error);
    }

    return challenges;
  },

  async loadChallenges() {
    this.challenges = await CTFd.pages.challenges.getChallenges();
    this.rebuildDistrictMap();
  },

  async loadChallenge(challengeId) {
    await CTFd.pages.challenge.displayChallenge(challengeId, challenge => {
      challenge.data.view = addTargetBlank(challenge.data.view);
      Alpine.store("challenge").data = challenge.data;

      // nextTick is required here because we're working in a callback
      Alpine.nextTick(() => {
        let modal = Modal.getOrCreateInstance("[x-ref='challengeWindow']");
        // TODO: Get rid of this private attribute access
        // See https://github.com/twbs/bootstrap/issues/31266
        modal._element.addEventListener(
          "hidden.bs.modal",
          event => {
            // Remove location hash
            history.replaceState(null, null, " ");
          },
          { once: true },
        );
        modal.show();
        history.replaceState(null, null, `#${challenge.data.name}-${challengeId}`);
      });
    });
  },
}));

Alpine.start();
