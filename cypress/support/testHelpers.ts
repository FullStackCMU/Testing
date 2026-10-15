// Helper ที่ใช้ร่วมกันระหว่าง api.cy.ts และ ui.cy.ts
// ไม่ใช่ custom command (ตามที่โจทย์ระบุให้ custom command อยู่ใน e2e.ts เท่านั้น)
// เป็นฟังก์ชันธรรมดาที่คืน Cypress.Chainable ไว้ประกอบ .then() ต่อ

export const BACKEND_URL = Cypress.expose("BACKEND_URL") as string;
export const FRONTEND_URL = Cypress.expose("FRONTEND_URL") as string;

// บัญชีจาก Database/db/prototype.ts — บทบาทของแต่ละคนในข้อมูลตัวอย่างเขียนกำกับไว้
export const ACCOUNTS = {
  instructor: "wichai.t@cmu.ac.th",
  // 261497: ยังไม่มีกลุ่ม / 261492: Team Orion, รอบ 1 เผยแพร่แล้ว, รอบ 2 เปิดอยู่
  patiphan: "patiphan_leknok@cmu.ac.th",
  // Alpha: รอบ 1 มีเพื่อนประเมินคนเดียว ผลจึงถูกซ่อน, ไม่ได้เรียน 261492
  somchai: "somchai_jaidee@cmu.ac.th",
  // Alpha: ยังไม่เคยยอมรับนโยบายความเป็นส่วนตัว
  thanapon: "thanapon_meesuk@cmu.ac.th",
  // Beta: ยังไม่ยอมรับข้อตกลงกลุ่ม
  malee: "malee_srisuk@cmu.ac.th",
  // Gamma (4 คน เต็ม): รอบ 1 เพื่อนประเมินครบ 3 คน, ส่งรอบ 3 แล้ว, มีฟีดแบ็กจากอาจารย์ในรอบ 1
  napat: "napat_saengthong@cmu.ac.th",
  // Gamma: ยังไม่ได้ทำรอบ 3, ไม่มีฟีดแบ็กจากอาจารย์
  wirat: "wirat_kongman@cmu.ac.th",
  // Gamma: ยังไม่ได้ทำรอบ 3 เหมือน wirat — ใช้กับเทสต์ที่ต้องเริ่มจากฟอร์มว่าง
  kanya: "kanya_sriwong@cmu.ac.th",
  // Delta: ให้เพื่อนทุกคน 5 เท่ากันทุกข้อในรอบ 1
  anan: "anan_thongdee@cmu.ac.th",
  // Epsilon: มีฟีดแบ็กจากอาจารย์ในรอบ 1
  chaiwat: "chaiwat_promma@cmu.ac.th",
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** เรียก backend ด้วย cookie ของบัญชีที่ loginAs ไว้ — ไม่ล้มเมื่อได้ 4xx เพื่อให้ตรวจสถานะเองได้ */
export function api<T = any>(method: Method, path: string, body?: unknown): Cypress.Chainable<Cypress.Response<T>> {
  return cy.request<T>({ method, url: `${BACKEND_URL}${path}`, body: body as Cypress.RequestBody, failOnStatusCode: false });
}

export interface Member {
  id: string;
  name: string;
}

export interface Seed {
  course: { id: string };
  /** วิชาที่สอง 261492 */
  course2: { id: string };
  /** รอบของ 261497: เผยแพร่แล้ว / ปิดรับแล้ว / เปิดรับ */
  rounds: { released: string; closed: string; open: string };
  /** รอบของ 261492: เผยแพร่แล้ว / เปิดรับ */
  rounds2: { released: string; open: string };
  groups: Record<"alpha" | "beta" | "gamma" | "delta" | "epsilon", { id: string; members: Member[] }>;
  /** id ของนักศึกษาตามชื่อบัญชีใน ACCOUNTS */
  ids: Record<Exclude<AccountKey, "instructor">, string>;
}

/** อ่าน id ของข้อมูลตัวอย่างผ่าน API ของอาจารย์ — เรียกใน before() หลัง resetDb */
export function loadSeed(): Cypress.Chainable<Seed> {
  const seed = {} as Seed;
  cy.loginAs("instructor");

  api("GET", "/courses").then((res) => {
    const byCode = (code: string) => res.body.data.find((c: { courseCode: string }) => c.courseCode === code);
    seed.course = { id: byCode("261497").id };
    seed.course2 = { id: byCode("261492").id };
  });

  cy.then(() => {
    api("GET", `/rounds?courseId=${seed.course.id}`).then((res) => {
      const [r1, r2, r3] = res.body.data;
      seed.rounds = { released: r1.id, closed: r2.id, open: r3.id };
    });
    api("GET", `/rounds?courseId=${seed.course2.id}`).then((res) => {
      const [r1, r2] = res.body.data;
      seed.rounds2 = { released: r1.id, open: r2.id };
    });
    api("GET", `/groups?courseId=${seed.course.id}`).then((res) => {
      const group = (name: string) => {
        const g = res.body.data.groups.find((x: { name: string }) => x.name === `Team ${name}`);
        return { id: g.id, members: g.members.map((m: Member) => ({ id: m.id, name: m.name })) };
      };
      seed.groups = {
        alpha: group("Alpha"),
        beta: group("Beta"),
        gamma: group("Gamma"),
        delta: group("Delta"),
        epsilon: group("Epsilon"),
      };
    });
    api("GET", `/courses/${seed.course.id}/students`).then((res) => {
      const idOf = (account: string) => res.body.data.find((s: { cmuAccount: string }) => s.cmuAccount === account).id;
      seed.ids = Object.fromEntries(
        Object.entries(ACCOUNTS)
          .filter(([key]) => key !== "instructor")
          .map(([key, account]) => [key, idOf(account)])
      ) as Seed["ids"];
    });
  });

  return cy.then(() => seed);
}

export interface EvalForm {
  targets: { id: string; isSelf: boolean }[];
  questions: { id: string; type: "rating" | "text"; orderNo: number }[];
}

/** คำตอบครบทุกช่องของฟอร์ม: คะแนนเดียวกันทุกข้อ และความเห็นเดียวกันทุกช่อง */
export function fullAnswers(form: EvalForm, score = 4, comment = "ทำงานส่วนของตัวเองได้ดีและส่งตรงเวลา") {
  return form.questions.flatMap((q) =>
    form.targets.map((t) => ({
      questionId: q.id,
      evaluateeId: t.id,
      score: q.type === "rating" ? score : null,
      comment: q.type === "text" ? comment : null,
    }))
  );
}
