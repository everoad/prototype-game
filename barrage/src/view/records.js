// 최고 기록(순수, Node 시험 — 저장소는 받아서 쓴다): 스테이지마다 가장 빠른 시간과 가장 높은 등급을 브라우저에 남긴다.
// 판 사이에 남는 것은 이것 하나다(힘이 아니라 기록 — 한 판의 뼈대 설계 §2). 판정(src/sim)은 이 저장을 모른다.
// 저장소가 막혔거나(접근하면 던진다) 값이 깨져 있어도 던지지 않는다 — 기록만 안 남고 판과 결과 화면은 그대로다.
import { GRADES, better } from './grade.js';

const key = stage => `barrage.best.v1.stage${stage}`;

// 기록을 남길 판인가: 주소의 키가 stage와 화면만 바꾸는 옵션(소리·시점·탄 높이 등)뿐일 때. 판을 바꾸는 옵션(try·room·kit·seed·gear·hard·heal·store·speed·bot·record …)이 하나라도 있으면 연습으로 친다
const VIEW_ONLY = new Set(['stage', 'mute', 'raf', 'intro', 'ring', 'pitch', 'bh']);
export function recordable(q) {
  if (!q.has('stage')) return false;
  for (const k of q.keys()) if (!VIEW_ONLY.has(k)) return false;
  return true;
}

// { sec, grade } 또는 null. 한쪽만 깨졌으면 그쪽만 null
export function readBest(storage, stage) {
  try {
    const v = JSON.parse(storage.getItem(key(stage)));
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const sec = Number.isFinite(v.sec) && v.sec > 0 ? v.sec : null, grade = GRADES.includes(v.grade) ? v.grade : null;
    return sec == null && grade == null ? null : { sec, grade };
  } catch { return null; }
}

// 이번 판 { sec, grade }를 견줘 남긴다. 시간과 등급은 따로 최고를 지킨다. → { best, isNew: { sec, grade }, prev }
export function writeBest(storage, stage, run) {
  const prev = readBest(storage, stage);
  const isNew = { sec: !prev || prev.sec == null || run.sec < prev.sec - 1e-9, grade: !prev || prev.grade == null || better(run.grade, prev.grade) };
  const best = { sec: isNew.sec ? run.sec : prev.sec, grade: isNew.grade ? run.grade : prev.grade };
  try { storage.setItem(key(stage), JSON.stringify(best)); } catch { /* 저장이 막힌 브라우저: 기록만 안 남는다 */ }
  return { best, isNew, prev };
}
