// 스테이지를 끝냈을 때의 등급(순수, Node 시험): 걸린 시간·맞은 횟수·다시 한 횟수. 표는 RULES.grade[스테이지].
// 표의 줄 = [등급, { sec, hits, retries }] — 위에서부터 세 조건(≤)을 모두 채우는 첫 등급, 아무것도 안 맞으면 C.
export const GRADES = ['C', 'B', 'A', 'S'];

export function gradeOf(table, { sec, hits, retries }) {
  for (const [name, c] of table ?? []) if (sec <= c.sec + 1e-9 && hits <= c.hits && retries <= c.retries) return name;
  return 'C';
}

// a가 b보다 높은 등급인가
export const better = (a, b) => GRADES.indexOf(a) > GRADES.indexOf(b);
