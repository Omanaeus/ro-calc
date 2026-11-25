// สูตรคำนวณราคา + ตัวจับคู่ข้อความจาก screenshot (ไม่มีส่วน UI ทดสอบแยกได้)
(function (root) {
  const DEFAULT_CFG = { base: 0, k: 1.5, floor: 0.2 };

  // คีย์น้ำหนักของออปชัน: "type|ช่อง|ชื่อ"
  const wkey = (type, slot, name) => type + "|" + (slot + 1) + "|" + name;

  // คุณภาพของค่าที่ roll ได้ 0..1
  function quality(v, min, max) {
    if (!(v >= min)) return 0;
    if (max <= min) return 1;
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  }

  // มูลค่าออปชัน = น้ำหนัก × (floor + (1−floor) × q^k)
  function optionValue(weight, q, cfg) {
    const f = Math.max(0, Math.min(1, cfg.floor)), k = Math.max(0.1, cfg.k);
    return Math.round((Number(weight) || 0) * (f + (1 - f) * Math.pow(q, k)));
  }

  /** picks = [{name, value} | null ต่อช่อง] */
  function price(type, picks, weights, cfg) {
    cfg = Object.assign({}, DEFAULT_CFG, cfg || {});
    const lines = type.slots.map((pool, s) => {
      const p = picks[s];
      if (!p || !p.name) return null;
      const opt = pool.find(o => o[0] === p.name);
      if (!opt) return null;
      const q = quality(Number(p.value), opt[1], opt[2]);
      const w = Number(weights[wkey(type.id, s, opt[0])]) || 0;
      return { slot: s, name: opt[0], value: Number(p.value), min: opt[1], max: opt[2], q, weight: w, worth: optionValue(w, q, cfg) };
    });
    const total = Math.round((Number(cfg.base) || 0) + lines.reduce((a, l) => a + (l ? l.worth : 0), 0));
    return { total, lines, cfg };
  }

  /* ---------- OCR matching ---------- */
  const norm = s => String(s).toLowerCase().replace(/\(mhp\)|\(msp\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  function bigrams(s) { const t = s.replace(/ /g, ""), out = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); out.set(g, (out.get(g) || 0) + 1); } return out; }
  function dice(a, b) {
    const A = bigrams(a), B = bigrams(b); let inter = 0, na = 0, nb = 0;
    A.forEach(v => na += v); B.forEach(v => nb += v);
    A.forEach((v, g) => { if (B.has(g)) inter += Math.min(v, B.get(g)); });
    return na + nb ? 2 * inter / (na + nb) : 0;
  }
  // ชื่อเรียกอื่นที่มักเจอใน tooltip
  const ALIAS = [[/\bmax\s*hp\b|\bmhp\b/g, "maxhp"], [/\bmax\s*sp\b|\bmsp\b/g, "maxsp"], [/\bcrit(ical)?\b(?! damage)/g, "cri"], [/demi\s*human/g, "demi human"]];
  function canon(s) { let t = norm(s); ALIAS.forEach(([re, r]) => t = t.replace(re, r)); return t; }

  /** อ่านทีละบรรทัด หาออปชันที่ตรงที่สุด + ตัวเลข แล้ววางลงช่องที่ว่าง */
  function matchText(type, text) {
    const cands = [];
    type.slots.forEach((pool, s) => pool.forEach(o => cands.push({ s, o, c: canon(o[0]).replace(/\s*\b(?:increase|reduction)\b\s*/g, " ").trim(), pct: /%/.test(o[0]) })));
    const found = [];
    String(text || "").split(/\r?\n/).forEach(raw => {
      const nums = raw.match(/\d+(?:\.\d+)?/g); if (!nums) return;
      const hasPct = /%/.test(raw);
      const line = canon(raw.replace(/[+\-]?\d+(?:\.\d+)?\s*%?/g, " ")).replace(/\s*\b(?:increase|reduction)\b\s*/g, " ").trim();
      if (line.length < 2) return;
      let best = null;
      cands.forEach(c => {
        let sc = line === c.c ? 1.2 : dice(line, c.c);
        if (c.pct !== hasPct) sc -= 0.15;
        if (!best || sc > best.sc) best = { ...c, sc };
      });
      if (best && best.sc >= 0.72) found.push({ name: best.o[0], value: parseFloat(nums[nums.length - 1]), sc: best.sc });
    });
    const picks = type.slots.map(() => null); let n = 0;
    found.forEach(f => {
      const s = type.slots.findIndex((pool, i) => !picks[i] && pool.some(o => o[0] === f.name));
      if (s >= 0) { picks[s] = { name: f.name, value: f.value }; n++; }
    });
    return { picks, count: n };
  }

  const api = { DEFAULT_CFG, wkey, quality, optionValue, price, matchText };
  root.CALC = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
