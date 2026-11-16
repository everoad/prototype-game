// 사건: sim이 틱마다 내고 화면(연출·소리)이 drainEvents로 꺼내 간다. 모듈끼리 서로 가져오는 고리를 피하려고 따로 둔다.
export function emit(w, type, data) {
  const e = { type, t: w.time };
  if (data) Object.assign(e, data);
  w.events.push(e);
  return e;
}
