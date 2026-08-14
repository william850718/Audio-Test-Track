#!/usr/bin/env node
/**
 * 產生上一週(週一 ~ 週日,台北時間)的開發週報。
 *
 * 這份報告是「素材」,不是給老闆看的成品:內容直接來自 commit 訊息,
 * 保留英文原文與技術細節,方便之後改寫成中文版本時有東西可引用。
 *
 * 用法:
 *   node scripts/weekly-report.mjs                     # 上一週
 *   node scripts/weekly-report.mjs --since 2026-08-04 --until 2026-08-11
 *   node scripts/weekly-report.mjs --stdout            # 只印出來,不寫檔
 *
 * 只依賴 git 與 Node 內建模組,沒有 npm 套件。
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const TZ_OFFSET = '+08:00';            // 台北,git 的日期比對需要明確時區
const OUT_DIR = 'docs/weekly';
const BOT_AUTHORS = [/github-actions/i];   // 週報自己的 commit 不該出現在下一份週報裡

// ---------- 參數 ----------

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}
const toStdout = process.argv.includes('--stdout');

/** 今天(台北)的 00:00,以 YYYY-MM-DD 表示 */
function taipeiToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** 往前找到最近的星期一(含當天) */
function mondayOnOrBefore(ymd) {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay();   // 0=日
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}
/** ISO 8601 週次,例如 2026-W33 */
function isoWeek(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);                 // 移到該週的星期四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// 預設:上一個完整的週一~週日。週一早上跑,涵蓋的就是剛結束的那一週。
const thisMonday = mondayOnOrBefore(taipeiToday());
const since = arg('since') || addDays(thisMonday, -7);
const until = arg('until') || thisMonday;                 // 不含當天
const lastDay = addDays(until, -1);
const label = isoWeek(since);

// ---------- 取 git 資料 ----------

const git = (args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const RS = '\x1e', FS = '\x1f';        // commit 訊息不可能出現的分隔字元
const range = [`--since=${since}T00:00:00${TZ_OFFSET}`, `--until=${until}T00:00:00${TZ_OFFSET}`];

const commits = git(['log', ...range, '--no-merges', `--format=${RS}%h${FS}%ad${FS}%an${FS}%s${FS}%b`, '--date=short'])
  .split(RS).slice(1)
  .map((chunk) => {
    const [hash, date, author, subject, body] = chunk.split(FS);
    return { hash, date, author, subject, body: (body || '').trim() };
  })
  .filter((c) => c.hash && !BOT_AUTHORS.some((re) => re.test(c.author)));

// 變動量:逐筆累加 numstat,避免依賴區間端點的 commit 是否存在
let added = 0, removed = 0;
const files = new Set();
for (const line of git(['log', ...range, '--no-merges', '--numstat', '--format=']).split('\n')) {
  const m = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
  if (!m) continue;
  if (m[1] !== '-') added += Number(m[1]);
  if (m[2] !== '-') removed += Number(m[2]);
  files.add(m[3]);
}

// ---------- 分類 ----------

// 依開頭動詞推斷。準確度大約八成,分錯不影響閱讀 — 這份是素材,不是對外文件。
const RULES = [
  [/^(fix|fixes|correct|repair|resolve|prevent|restore|guard|stop)\b/i, 'fix'],
  [/^(add|allow|introduce|support|require|build|create|enable|give|let|bring)\b/i, 'feat'],
  [/^(make|slim|match|move|drop|remove|reorder|simplify|rename|keep|replace|reduce|tidy|unify|split|collapse|trim|shorten|rework|refactor|update)\b/i, 'chore'],
];
const SECTIONS = [
  ['feat',  '新功能'],
  ['fix',   '問題修正'],
  ['chore', '調整與優化'],
  ['other', '其他'],
];

function classify(subject) {
  // 去掉 "Project Log: " 這類範圍前綴後再看動詞
  const s = subject.replace(/^[A-Za-z][\w .&-]{0,24}:\s+/, '');
  for (const [re, cat] of RULES) if (re.test(s)) return cat;
  return 'other';
}
for (const c of commits) c.cat = classify(c.subject);

/** commit body 的第一段 — 我的 commit 習慣在這裡寫「為什麼要改」,是改寫成中文版時最有用的部分 */
function why(body) {
  if (!body) return '';
  const para = body.split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ').trim();
  return /^(Co-Authored-By|Signed-off-by)/i.test(para) ? '' : para;
}

// ---------- 產出 ----------

const counts = SECTIONS.map(([k, l]) => [l, commits.filter((c) => c.cat === k).length])
  .filter(([, n]) => n > 0).map(([l, n]) => `${l} ${n}`).join(' · ');

const lines = [];
lines.push(`# 開發週報 ${label}`);
lines.push('');
lines.push(`**期間** ${since} ~ ${lastDay}(台北時間)`);
lines.push('');
lines.push('> 由 git commit 自動產生,分類為關鍵字推斷,僅作為整理素材。');
lines.push('> 要給主管的版本請另行改寫成中文、以使用者影響為主的敘述。');
lines.push('');
lines.push('## 摘要');
lines.push('');
lines.push(`- commit 數:**${commits.length}**`);
lines.push(`- 程式碼變動:**+${added} −${removed}**(${files.size} 個檔案)`);
if (counts) lines.push(`- 分類:${counts}`);
lines.push('');

if (!commits.length) {
  lines.push('本週無程式異動。');
} else {
  for (const [key, title] of SECTIONS) {
    const group = commits.filter((c) => c.cat === key);
    if (!group.length) continue;
    lines.push(`## ${title}`);
    lines.push('');
    for (const c of group) {
      lines.push(`### ${c.subject}`);
      lines.push(`\`${c.hash}\` · ${c.date}`);
      const w = why(c.body);
      if (w) { lines.push(''); lines.push(w); }
      lines.push('');
    }
  }
  lines.push('---');
  lines.push('');
  lines.push('<details><summary>完整 commit 清單</summary>');
  lines.push('');
  for (const c of commits) lines.push(`- \`${c.hash}\` ${c.date} — ${c.subject}`);
  lines.push('');
  lines.push('</details>');
}
lines.push('');

const md = lines.join('\n');
const outPath = `${OUT_DIR}/${label}.md`;   // 固定用 /,讓 Windows 本機測試與 Linux runner 的輸出一致

/**
 * 重建 docs/weekly/README.md。
 * 直接從已產生的週報檔回讀數字,所以不需要另外維護一份狀態,
 * 手動補跑或刪掉某一週之後索引都會跟著正確。
 */
function writeIndex() {
  const rows = readdirSync(OUT_DIR)
    .filter((f) => /^\d{4}-W\d{2}\.md$/.test(f))
    .sort().reverse()
    .map((f) => {
      const t = readFileSync(`${OUT_DIR}/${f}`, 'utf8');
      return {
        week: f.replace(/\.md$/, ''),
        span: (t.match(/\*\*期間\*\*\s*(.+?)(?:\(|$)/m) || [, ''])[1].trim(),
        n: (t.match(/commit 數:\*\*(\d+)\*\*/) || [, '0'])[1],
        diff: (t.match(/程式碼變動:\*\*(.+?)\*\*/) || [, ''])[1],
        file: f,
      };
    });
  const total = rows.reduce((s, r) => s + Number(r.n), 0);
  const out = [
    '# 開發週報',
    '',
    `每週一 09:00(台北)自動產生,資料來源為 git commit。共 ${rows.length} 週、${total} 筆 commit。`,
    '',
    '| 週次 | 期間 | commit | 程式碼變動 |',
    '| --- | --- | ---: | --- |',
    ...rows.map((r) => `| [${r.week}](${r.file}) | ${r.span} | ${r.n} | ${r.diff} |`),
    '',
  ].join('\n');
  writeFileSync(`${OUT_DIR}/README.md`, out, 'utf8');
}

if (toStdout) {
  process.stdout.write(md);
} else {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, md, 'utf8');
  writeIndex();
  console.error(`寫入 ${outPath}(${commits.length} 筆 commit)`);
}

// 供 workflow 判斷要不要開 Issue
if (process.env.GITHUB_OUTPUT) {
  writeFileSync(process.env.GITHUB_OUTPUT,
    `count=${commits.length}\nlabel=${label}\npath=${outPath}\nsince=${since}\nuntil=${lastDay}\n`,
    { flag: 'a' });
}
