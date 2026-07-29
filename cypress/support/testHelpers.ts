// Helper ที่ใช้ร่วมกันระหว่าง api.cy.ts และ ui.cy.ts
// ไม่ใช่ custom command (ตามที่โจทย์ระบุให้ custom command อยู่ใน e2e.ts เท่านั้น)
// เป็นฟังก์ชันธรรมดาที่คืน Cypress.Chainable ไว้ประกอบ .then() ต่อ

export const BACKEND_URL = Cypress.expose('BACKEND_URL') as string;
export const FRONTEND_URL = Cypress.expose('FRONTEND_URL') as string;

export const CREDENTIALS = {
  instructor: { username: 'ajarn.nirand', password: 'password123' },
  student1: { username: '6511500001', password: 'password123' },
  student2: { username: '6511500002', password: 'password123' },
  student3: { username: '6511500003', password: 'password123' },
};

export interface LoginResult {
  token: string;
  user: { id: string; username: string; name: string; role: string };
}

export function apiLogin(username: string, password: string): Cypress.Chainable<LoginResult> {
  return cy
    .request('POST', `${BACKEND_URL}/auth/login`, { username, password })
    .then((res) => res.body.data as LoginResult) as unknown as Cypress.Chainable<LoginResult>;
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export interface RoundQuestion {
  id: string;
  content: string;
  type: 'scale' | 'text';
  sortOrder: number;
}

export interface OpenRoundFixture {
  instructorToken: string;
  courseId: string;
  roundId: string;
  questions: RoundQuestion[];
}

/**
 * สร้างรอบประเมินใหม่ที่เปิดอยู่ในวิชา 261497 พร้อมคำถาม scale 1 ข้อ + text 1 ข้อ
 * ใช้ชื่อรอบที่มี timestamp กันชนกับรอบเดิม/รอบที่ test อื่นสร้างไว้
 * ไม่แตะ seed data เดิมเลย (ไม่สร้าง course/user/group ใหม่) จึงรันซ้ำได้เรื่อย ๆ
 * โดยไม่ต้อง reset DB — ไม่มี endpoint ลบ round ในระบบ รอบทดสอบจะค้างอยู่แบบเปิดต่อไป
 * (ไม่กระทบความถูกต้องของ test เพราะแต่ละรอบมี roundId/questionId ใหม่เสมอ)
 */
export function setupOpenRound(courseCode = '261497'): Cypress.Chainable<OpenRoundFixture> {
  return apiLogin(CREDENTIALS.instructor.username, CREDENTIALS.instructor.password).then((instructor) =>
    cy
      .request({ url: `${BACKEND_URL}/courses`, headers: authHeader(instructor.token) })
      .then((coursesRes) => {
        const course = (coursesRes.body.data as { id: string; courseCode: string }[]).find(
          (c) => c.courseCode === courseCode,
        );
        if (!course) throw new Error(`ไม่พบวิชา ${courseCode} ใน seed data — ตรวจ Database/db/prototype.ts`);

        return cy
          .request({
            method: 'POST',
            url: `${BACKEND_URL}/rounds`,
            headers: authHeader(instructor.token),
            body: { courseId: course.id, name: `Cypress Test ${Date.now()}` },
          })
          .then((roundRes) => {
            const roundId = roundRes.body.data.id as string;

            return cy
              .request({
                method: 'POST',
                url: `${BACKEND_URL}/rounds/${roundId}/questions`,
                headers: authHeader(instructor.token),
                body: [
                  { content: 'การมีส่วนร่วม (Cypress scale)', type: 'scale', sortOrder: 1 },
                  { content: 'ข้อเสนอแนะ (Cypress text)', type: 'text', sortOrder: 2 },
                ],
              })
              .then((questionsRes) =>
                cy
                  .request({
                    method: 'PATCH',
                    url: `${BACKEND_URL}/rounds/${roundId}/open`,
                    headers: authHeader(instructor.token),
                    body: { isOpen: true },
                  })
                  .then(
                    () =>
                      ({
                        instructorToken: instructor.token,
                        courseId: course.id,
                        roundId,
                        questions: questionsRes.body.data as RoundQuestion[],
                      }) as OpenRoundFixture,
                  ),
              );
          });
      }),
  ) as unknown as Cypress.Chainable<OpenRoundFixture>;
}

export interface GroupMember {
  id: string;
  name: string;
  username: string;
}

export interface Group {
  id: string;
  name: string;
  members: GroupMember[];
}

export function getMyGroup(studentToken: string, courseId: string): Cypress.Chainable<Group> {
  return cy
    .request({ url: `${BACKEND_URL}/groups/my?courseId=${courseId}`, headers: authHeader(studentToken) })
    .then((res) => res.body.data as Group) as unknown as Cypress.Chainable<Group>;
}

/** เหมือน setupOpenRound แต่ปิดรอบทันทีหลังสร้าง — ไว้ทดสอบกฎ "รอบต้องเปิดถึงจะตอบได้" */
export function setupClosedRound(
  courseCode = '261497'
): Cypress.Chainable<OpenRoundFixture> {
  return setupOpenRound(courseCode).then((fixture) =>
    // ต้อง return cy chain (ไม่ใช่ queue แล้ว return ค่า) ไม่งั้น PATCH ปิดรอบจะไม่ถูก sequence
    cy
      .request({
        method: 'PATCH',
        url: `${BACKEND_URL}/rounds/${fixture.roundId}/open`,
        headers: authHeader(fixture.instructorToken),
        body: { isOpen: false },
      })
      .then(() => fixture)
  ) as unknown as Cypress.Chainable<OpenRoundFixture>;
}

/** หา courseId จาก courseCode (ต้องมี token แล้ว) — ไว้ทดสอบข้ามวิชา */
export function getCourseIdByCode(
  token: string,
  courseCode: string
): Cypress.Chainable<string> {
  return cy
    .request({ url: `${BACKEND_URL}/courses`, headers: authHeader(token) })
    .then((res) => {
      const course = (res.body.data as { id: string; courseCode: string }[]).find(
        (c) => c.courseCode === courseCode
      );
      if (!course) throw new Error(`ไม่พบวิชา ${courseCode}`);
      return course.id;
    });
}
