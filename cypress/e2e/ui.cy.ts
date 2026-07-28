import {
  BACKEND_URL,
  FRONTEND_URL,
  CREDENTIALS,
  apiLogin,
  authHeader,
  setupOpenRound,
  getMyGroup,
  type OpenRoundFixture,
} from '../support/testHelpers.js';

describe('UI — Register', () => {
  it('สมัครบัญชีใหม่ → ล็อกอินอัตโนมัติเป็นนักศึกษาที่ /', () => {
    const username = `cy_ui_${Date.now()}`;
    cy.visit(`${FRONTEND_URL}/register`);
    cy.get('[data-cy=input-reg-name]').type('นักศึกษา สมัครใหม่');
    cy.get('[data-cy=input-reg-username]').type(username);
    cy.get('[data-cy=input-reg-password]').type('secret123');
    cy.get('[data-cy=submit-register]').click();
    // สมัครเสร็จ → เข้าหน้านักศึกษา (ปุ่ม logout โผล่) ที่ path "/"
    cy.get('[data-cy=logout]', { timeout: 10000 }).should('be.visible');
    cy.location('pathname').should('eq', '/');
  });

  it('ลิงก์ระหว่างหน้า login ↔ register ใช้ได้', () => {
    cy.visit(`${FRONTEND_URL}/login`);
    cy.get('[data-cy=link-register]').click();
    cy.location('pathname').should('eq', '/register');
    cy.get('[data-cy=link-login]').click();
    cy.location('pathname').should('eq', '/login');
  });
});

describe('UI — Routing / deep link', () => {
  it('ยังไม่ล็อกอิน: เข้า path ใด ๆ → เด้ง /login', () => {
    cy.visit(`${FRONTEND_URL}/rounds`);
    cy.location('pathname').should('eq', '/login');
    cy.get('[data-cy=submit-login]').should('be.visible');
  });

  it('อาจารย์: เข้า URL /rounds ตรง ๆ (จำลอง refresh) → อยู่หน้าแบบประเมิน', () => {
    cy.loginAsInstructor();
    cy.visit(`${FRONTEND_URL}/rounds`); // reload เต็ม = จำลอง refresh/deep link
    cy.location('pathname').should('eq', '/rounds');
    cy.contains('.page-heading', 'แบบประเมิน').should('be.visible');
    cy.get('[data-cy=select-round-course]').should('exist');
  });

  it('อาจารย์: กดเมนู → URL เปลี่ยนตามหน้า', () => {
    cy.loginAsInstructor();
    cy.location('pathname').should('eq', '/courses'); // login แล้วเด้ง /courses
    cy.get('[data-cy=nav-review]').click();
    cy.location('pathname').should('eq', '/review');
    cy.get('[data-cy=nav-groups]').click();
    cy.location('pathname').should('eq', '/groups');
  });

  it('นักศึกษา: เข้า URL /course/:id ตรง ๆ (จำลอง refresh) → อยู่หน้าวิชานั้น', () => {
    cy.loginAsStudent(CREDENTIALS.student1.username);
    cy.contains('[data-cy^=course-]', '261497')
      .invoke('attr', 'data-cy')
      .then((dc) => {
        const courseId = (dc as string).replace('course-', '');
        cy.visit(`${FRONTEND_URL}/course/${courseId}`);
        cy.location('pathname').should('eq', `/course/${courseId}`);
        cy.get('[data-cy=nav-rounds]', { timeout: 10000 }).should('be.visible');
        cy.get('[data-cy=nav-feedback]').should('be.visible');
      });
  });
});

describe('UI — Login', () => {
  it('login ผิด → ขึ้นข้อความแจ้งเตือน ไม่เข้าสู่ระบบ', () => {
    cy.visit(FRONTEND_URL);
    cy.get('[data-cy=input-username]').type(CREDENTIALS.student1.username);
    cy.get('[data-cy=input-password]').type('wrong-password');
    cy.get('[data-cy=submit-login]').click();

    // getErrorMessage() แปลข้อความจาก backend มาแสดงใน <p className="status-toast">
    cy.get('.status-toast').should('be.visible').invoke('text').should('not.be.empty');
    cy.get('[data-cy=logout]').should('not.exist');
  });
});

describe('UI — Role-based navigation', () => {
  it('นักศึกษาเห็นเมนูฝั่งนักศึกษา ไม่เห็นเมนูฝั่งอาจารย์', () => {
    cy.loginAsStudent(CREDENTIALS.student1.username);
    // nav (sidebar) ของนักศึกษาจะโผล่ก็ต่อเมื่อเข้าไปในวิชาแล้วเท่านั้น (CourseDetailView)
    cy.contains('[data-cy^=course-]', '261497').click();

    cy.get('[data-cy=nav-rounds]').should('be.visible');
    cy.get('[data-cy=nav-feedback]').should('be.visible');
    cy.get('[data-cy=nav-courses]').should('not.exist');
    cy.get('[data-cy=nav-groups]').should('not.exist');
    cy.get('[data-cy=nav-review]').should('not.exist');
  });

  it('อาจารย์เห็นเมนูฝั่งอาจารย์ ไม่เห็นเมนูฝั่งนักศึกษา', () => {
    cy.loginAsInstructor();

    cy.get('[data-cy=nav-courses]').should('be.visible');
    cy.get('[data-cy=nav-groups]').should('be.visible');
    cy.get('[data-cy=nav-rounds]').should('be.visible');
    cy.get('[data-cy=nav-review]').should('be.visible');
    // "feedback" เป็น nav key เฉพาะฝั่งนักศึกษา ไม่มีในเมนูอาจารย์
    cy.get('[data-cy=nav-feedback]').should('not.exist');
  });
});

describe('UI — Evaluation wizard', () => {
  let fixture: OpenRoundFixture;

  beforeEach(() => {
    // สร้างรอบใหม่ทุก test — กัน state ค้างข้ามกันและกัน unique constraint ตอนรันซ้ำ
    setupOpenRound().then((f) => {
      fixture = f;
    });
  });

  function enterWizardAsStudent1() {
    cy.loginAsStudent(CREDENTIALS.student1.username);
    cy.contains('[data-cy^=course-]', '261497').click();
    cy.get(`[data-cy=enter-round-${fixture.roundId}]`).click();
  }

  function fillAndSubmit(label: string) {
    const scaleId = fixture.questions.find((q) => q.type === 'scale')!.id;
    const textId = fixture.questions.find((q) => q.type === 'text')!.id;
    cy.get(`[data-cy=scale-${scaleId}]`).contains('button', '4').click();
    cy.get(`[data-cy=text-${textId}]`).clear().type(`คำตอบ ${label}`);
    cy.get('[data-cy=submit-step]').click();
  }

  it('เข้ารอบประเมิน → ขั้นแรกต้องเป็น "ประเมินตนเอง" เสมอ', () => {
    enterWizardAsStudent1();
    cy.contains('h4', 'ประเมินตนเอง').should('be.visible');
    cy.contains('ขั้นที่ 1 จาก 3').should('be.visible');
  });

  it('ตอบไม่ครบแล้วกดบันทึก → ขึ้นเตือน ไม่ไปขั้นถัดไป', () => {
    enterWizardAsStudent1();
    cy.get('[data-cy=submit-step]').click();
    cy.get('.status-toast').should('be.visible').and('contain', 'กรุณาตอบ');
    // ยังต้องอยู่ขั้นที่ 1 เหมือนเดิม แปลว่าไม่มีการส่งข้อมูลออกไป
    cy.contains('ขั้นที่ 1 จาก 3').should('be.visible');
  });

  it('ตอบครบแล้วบันทึก → ไปขั้นถัดไป', () => {
    enterWizardAsStudent1();
    fillAndSubmit('ขั้นที่ 1');
    cy.contains('ขั้นที่ 2 จาก 3', { timeout: 8000 }).should('be.visible');
  });

  it(
    'ประเมินครบทุกคน → แก้ไขคำตอบจนจบ → ออก → เข้าใหม่ ต้องเห็นหน้าสรุปเสมอ ' +
      '(regression: current.isSelf บน step ที่เกินขอบตอนบันทึกคนสุดท้ายในโหมดแก้ไข)',
    () => {
      enterWizardAsStudent1();

      // รอบแรก — ประเมินให้ครบทั้ง 3 คน (ตนเอง + เพื่อนอีก 2)
      fillAndSubmit('รอบแรก 1');
      cy.contains('ขั้นที่ 2 จาก 3', { timeout: 8000 }).should('be.visible');
      fillAndSubmit('รอบแรก 2');
      cy.contains('ขั้นที่ 3 จาก 3', { timeout: 8000 }).should('be.visible');
      fillAndSubmit('รอบแรก 3');
      cy.get('[data-cy=wizard-done]', { timeout: 8000 }).should('be.visible');

      // ออกแล้วเข้าใหม่โดยไม่แก้ไข — ต้องเห็นหน้าสรุปทันที ไม่ใช่เริ่มที่ "ประเมินตนเอง" ใหม่
      cy.get('[data-cy=wizard-done]').click();
      cy.get(`[data-cy=enter-round-${fixture.roundId}]`).click();
      cy.contains('ส่งแบบประเมินครบทุกคนแล้ว').should('be.visible');
      cy.contains('h4', 'ประเมินตนเอง').should('not.exist');

      // กด "แก้ไขคำตอบ" → ต้องกลับไปขั้นที่ 1 (ประเมินตนเอง) เสมอ
      cy.get('[data-cy=wizard-edit]').click();
      cy.contains('h4', 'ประเมินตนเอง').should('be.visible');
      cy.contains('ขั้นที่ 1 จาก 3').should('be.visible');
      cy.contains('โหมดแก้ไข').should('be.visible');

      // แก้ไขจนจบคนสุดท้าย — จุดนี้คือจุดที่เคย crash (current.isSelf อ่านจาก undefined)
      fillAndSubmit('แก้ไข 1');
      cy.contains('ขั้นที่ 2 จาก 3', { timeout: 8000 }).should('be.visible');
      fillAndSubmit('แก้ไข 2');
      cy.contains('ขั้นที่ 3 จาก 3', { timeout: 8000 }).should('be.visible');
      fillAndSubmit('แก้ไข 3');

      // ต้องกลับมาหน้าสรุปได้อย่างปลอดภัย ไม่ crash เป็นหน้าขาว
      // (ถ้าโค้ด regress กลับไป Cypress จะ fail test นี้เองจาก uncaught exception ด้วย)
      cy.get('[data-cy=wizard-done]', { timeout: 8000 }).should('be.visible');
      cy.contains('ส่งแบบประเมินครบทุกคนแล้ว').should('be.visible');
    },
  );
});

describe('UI — Psychological safety on feedback page', () => {
  it('หน้าฟีดแบ็กนักศึกษาต้องไม่แสดงข้อความดิบหรือชื่อผู้ประเมิน', () => {
    const rawMarker = `RAW_MARKER_${Date.now()}`;
    const summaryMarker = `SUMMARY_MARKER_${Date.now()}`;

    setupOpenRound().then((fixture) =>
      apiLogin(CREDENTIALS.student2.username, CREDENTIALS.student2.password).then((evaluator) =>
        apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((evaluatee) =>
          getMyGroup(evaluator.token, fixture.courseId).then((group) => {
            const textId = fixture.questions.find((q) => q.type === 'text')!.id;

            // เพื่อน (student2) ให้ raw feedback ที่มี marker เฉพาะ
            return cy
              .request({
                method: 'POST',
                url: `${BACKEND_URL}/answers`,
                headers: authHeader(evaluator.token),
                body: {
                  roundId: fixture.roundId,
                  groupId: group.id,
                  evaluateeId: evaluatee.user.id,
                  answers: [{ questionId: textId, textValue: rawMarker }],
                },
              })
              .then(() =>
                // อาจารย์เขียนสรุปข้อความคนละอันแล้วเผยแพร่
                cy.request({
                  method: 'POST',
                  url: `${BACKEND_URL}/feedback`,
                  headers: authHeader(fixture.instructorToken),
                  body: {
                    roundId: fixture.roundId,
                    studentId: evaluatee.user.id,
                    summary: summaryMarker,
                    isPublished: true,
                  },
                }),
              )
              .then(() => {
                cy.loginAsStudent(CREDENTIALS.student1.username);
                cy.contains('[data-cy^=course-]', '261497').click();
                cy.get('[data-cy=nav-feedback]').click();

                cy.contains(summaryMarker).should('be.visible');
                cy.get('body').should('not.contain', rawMarker);
                cy.get('body').should('not.contain', evaluator.user.name);
              });
          }),
        ),
      ),
    );
  });
});
