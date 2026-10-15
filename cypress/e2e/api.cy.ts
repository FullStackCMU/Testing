// ทดสอบ REST API ของ Backend โดยตรง — ทุกครั้งเริ่มจากข้อมูลตัวอย่างชุดเดียวกัน (db:prototype)
// เทสต์ในไฟล์นี้เรียงตามลำดับและบางข้อเปลี่ยนข้อมูล ข้อที่พึ่งผลของข้อก่อนหน้าเขียนกำกับไว้

import {
  ACCOUNTS,
  BACKEND_URL,
  api,
  fullAnswers,
  loadSeed,
  type EvalForm,
  type Method,
  type Seed,
} from "../support/testHelpers";

const DAY = 24 * 60 * 60 * 1000;
const fromNow = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const NO_SUCH_ID = "00000000-0000-0000-0000-000000000000";

function expectError(res: Cypress.Response<any>, status: number, message?: string) {
  expect(res.status).to.eq(status);
  if (message) expect(res.body.message).to.include(message);
}

let seed: Seed;

before(() => {
  cy.resetDb();
  loadSeed().then((s) => {
    seed = s;
  });
  // cookie ที่ตั้งใน before ไม่ถูกล้างก่อนเทสต์ข้อแรก
  cy.logout();
});

describe("API — Authentication", () => {
  it("ไม่มี cookie → 401", () => {
    api("GET", "/auth/me").then((res) => expectError(res, 401, "Not logged in"));
    api("GET", "/courses").then((res) => expectError(res, 401));
  });

  it("cookie ที่ระบบไม่ได้ออกให้ → 401", () => {
    cy.setCookie("cr_token", "not-a-real-token", { domain: new URL(BACKEND_URL).hostname });
    api("GET", "/auth/me").then((res) => expectError(res, 401, "Invalid or expired token"));
  });

  it("อาจารย์และนักศึกษาได้ข้อมูลบัญชีของตัวเอง ในรูป { msg, data }", () => {
    cy.loginAs("instructor");
    api("GET", "/auth/me").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body).to.have.all.keys("msg", "data");
      expect(res.body.data).to.include({ cmuAccount: ACCOUNTS.instructor, accountType: "MISEmpAcc" });
    });

    cy.loginAs("patiphan");
    api("GET", "/auth/me").then((res) => {
      expect(res.body.data).to.include({ cmuAccount: ACCOUNTS.patiphan, accountType: "StdAcc", studentId: "660610771" });
    });
  });

  it("ออกจากระบบแล้ว cookie ถูกลบ", () => {
    cy.loginAs("patiphan");
    api("POST", "/auth/logout").then((res) => {
      expect(res.status).to.eq(200);
      expect(String(res.headers["set-cookie"])).to.match(/cr_token=;/);
    });
    api("GET", "/auth/me").then((res) => expectError(res, 401, "Not logged in"));
  });
});

describe("API — Authorization", () => {
  it("นักศึกษาสร้างวิชาไม่ได้ → 403", () => {
    cy.loginAs("patiphan");
    api("POST", "/courses", { courseCode: "261999", title: "ไม่ควรถูกสร้าง", semester: 1, academicYear: 2569 }).then((res) =>
      expectError(res, 403)
    );
  });

  it("นักศึกษาเรียก endpoint ของอาจารย์ในวิชาตัวเอง → 403 ทุกตัว", () => {
    const c = seed.course.id;
    const note = `/feedback/rounds/${seed.rounds.released}/students/${seed.ids.wirat}`;
    const calls: [Method, string, unknown?][] = [
      ["GET", `/groups?courseId=${c}`],
      ["GET", `/courses/${c}/students`],
      ["POST", `/courses/${c}/students/import`, { rows: [] }],
      ["POST", "/groups", { courseId: c, name: "ไม่ควรถูกสร้าง" }],
      ["POST", "/rounds/generate", { courseId: c, count: 1 }],
      ["PATCH", `/rounds/${seed.rounds.closed}/release`, { scores: true }],
      ["DELETE", `/rounds/${seed.rounds.open}`],
      ["GET", `/feedback/rounds/${seed.rounds.released}/overview`],
      ["GET", note],
      ["PUT", `${note}/note`, { body: "ไม่ควรถูกบันทึก" }],
    ];
    cy.loginAs("napat");
    for (const [method, path, body] of calls)
      api(method, path, body).then((res) => expect(res.status, `${method} ${path}`).to.eq(403));
  });

  it("อาจารย์เรียก endpoint ของนักศึกษา → 403", () => {
    cy.loginAs("instructor");
    for (const path of [
      `/answers/${seed.rounds.open}`,
      `/groups/my?courseId=${seed.course.id}`,
      `/feedback/rounds/${seed.rounds.released}`,
    ])
      api("GET", path).then((res) => expect(res.status, path).to.eq(403));
  });

  it("นักศึกษาที่ไม่ได้ลงวิชานั้น → 403", () => {
    cy.loginAs("somchai");
    for (const path of [
      `/courses/${seed.course2.id}`,
      `/rounds?courseId=${seed.course2.id}`,
      `/answers/${seed.rounds2.open}`,
      `/feedback/rounds/${seed.rounds2.released}`,
    ])
      api("GET", path).then((res) => expect(res.status, path).to.eq(403));
  });

  it("ไม่ระบุวิชา → 400", () => {
    cy.loginAs("instructor");
    api("GET", "/rounds").then((res) => expectError(res, 400, "courseId is required"));
  });
});

describe("API — Courses", () => {
  const byCode = (res: Cypress.Response<any>, code: string) => res.body.data.find((c: any) => c.courseCode === code);

  it("อาจารย์เห็นวิชาที่สอนพร้อมจำนวนนักศึกษาและรอบ", () => {
    cy.loginAs("instructor");
    api("GET", "/courses").then((res) => {
      expect(res.body.data).to.have.length(2);
      expect(byCode(res, "261497")).to.include({ studentCount: 17, roundCount: 3, openRoundCount: 1 });
      expect(byCode(res, "261492")).to.include({ studentCount: 3, roundCount: 2 });
    });
  });

  it("นักศึกษาเห็นเฉพาะวิชาที่ลง พร้อมกลุ่มของตัวเอง", () => {
    cy.loginAs("patiphan");
    api("GET", "/courses").then((res) => {
      expect(res.body.data).to.have.length(2);
      expect(byCode(res, "261497").myGroup).to.eq(null);
      expect(byCode(res, "261492").myGroup.name).to.eq("Team Orion");
    });

    cy.loginAs("somchai");
    api("GET", "/courses").then((res) => {
      expect(res.body.data.map((c: any) => c.courseCode)).to.deep.eq(["261497"]);
    });
  });

  it("สร้างวิชา: ตรวจข้อมูล กันวิชาซ้ำ และผู้สร้างเป็นอาจารย์ของวิชา", () => {
    const course = { courseCode: "261111", title: "Cypress Course", section: "701", semester: 2, academicYear: 2569 };
    cy.loginAs("instructor");
    api("POST", "/courses", { ...course, courseCode: "26111" }).then((res) =>
      expectError(res, 400, "รหัสวิชาต้องเป็นตัวเลข 6 หลัก")
    );
    api("POST", "/courses", { ...course, academicYear: 2026 }).then((res) => expectError(res, 400, "ปีการศึกษาต้องเป็นปี พ.ศ."));
    api("POST", "/courses", { ...course, courseCode: "261497", section: "001", semester: 1 }).then((res) =>
      expectError(res, 400, "มีวิชานี้ในภาคการศึกษานี้อยู่แล้ว")
    );
    api("POST", "/courses", course).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.include({ courseCode: "261111", role: "instructor", studentCount: 0 });
    });
    api("GET", "/courses").its("body.data").should("have.length", 3);
  });

  it("นำเข้ารายชื่อ: เพิ่มคนใหม่ ข้ามคนที่อยู่ในวิชาแล้ว และรายงานแถวที่ผิด", () => {
    cy.loginAs("instructor");
    api("POST", `/courses/${seed.course.id}/students/import`, {
      rows: [
        { studentId: "670000001", cmuAccount: "cypress_new@cmu.ac.th", nameTh: "ไซเปรส ทดสอบ" },
        { studentId: "669999001", cmuAccount: ACCOUNTS.somchai, nameTh: "สมชาย ใจดี" },
        { studentId: "12345", cmuAccount: "short_id@cmu.ac.th", nameTh: "รหัสสั้นไป" },
      ],
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.include({ added: 1, created: 1, duplicate: 1, invalid: 1 });
      expect(res.body.data.issues.map((i: any) => [i.line, i.kind])).to.deep.eq([
        [3, "duplicate"],
        [4, "invalid"],
      ]);
    });
    api("GET", `/courses/${seed.course.id}/students`).its("body.data").should("have.length", 18);
  });
});

describe("API — Groups", () => {
  it("อาจารย์เห็นทุกกลุ่มและคนที่ยังไม่มีกลุ่ม", () => {
    cy.loginAs("instructor");
    api("GET", `/groups?courseId=${seed.course.id}`).then((res) => {
      expect(res.body.data.groups).to.have.length(5);
      expect(res.body.data.unassigned.map((s: any) => s.cmuAccount)).to.include(ACCOUNTS.patiphan);
    });
  });

  it("นักศึกษาเห็นกลุ่มที่เลือกได้ โดยไม่มีรหัสนักศึกษาหรืออีเมลของเพื่อน", () => {
    cy.loginAs("patiphan");
    api("GET", `/groups/available?courseId=${seed.course.id}`).then((res) => {
      expect(res.body.data).to.have.length(5);
      for (const g of res.body.data) for (const m of g.members) expect(m).to.have.all.keys("id", "name");
      expect(JSON.stringify(res.body)).to.not.match(/@cmu\.ac\.th|studentId|cmuAccount/);
    });
  });

  it("เข้ากลุ่ม ยอมรับข้อตกลง และออกจากกลุ่ม", () => {
    const { alpha, beta, gamma } = seed.groups;
    const mine = (res: Cypress.Response<any>) => res.body.data.members.find((m: any) => m.id === seed.ids.patiphan);
    cy.loginAs("patiphan");

    api("POST", `/groups/${gamma.id}/join`).then((res) => expectError(res, 409, "กลุ่มนี้เต็มแล้ว"));
    api("POST", `/groups/${alpha.id}/join`).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data.members).to.have.length(4);
      expect(mine(res).contractAcceptedAt).to.eq(null);
    });
    api("POST", `/groups/${beta.id}/join`).then((res) => expectError(res, 409, "คุณมีกลุ่มในวิชานี้แล้ว"));
    api("POST", `/groups/${beta.id}/accept-contract`).then((res) => expectError(res, 403, "คุณไม่ได้อยู่ในกลุ่มนี้"));
    api("POST", `/groups/${alpha.id}/accept-contract`).then((res) => {
      expect(res.status).to.eq(200);
      expect(mine(res).contractAcceptedAt).to.be.a("string");
    });
    api("GET", `/groups/my?courseId=${seed.course.id}`).its("body.data.name").should("eq", "Team Alpha");

    api("POST", "/groups/leave", { courseId: seed.course.id }).its("status").should("eq", 200);
    api("GET", `/groups/my?courseId=${seed.course.id}`).then((res) => expect(res.body.data).to.eq(null));
    api("POST", "/groups/leave", { courseId: seed.course.id }).then((res) => expectError(res, 409, "คุณยังไม่มีกลุ่มในวิชานี้"));
  });

  it("อาจารย์สร้างกลุ่ม: ต้องมีชื่อและชื่อไม่ซ้ำในวิชา", () => {
    const courseId = seed.course.id;
    cy.loginAs("instructor");
    api("POST", "/groups", { courseId, name: " " }).then((res) => expectError(res, 400, "กรุณากรอกชื่อกลุ่ม"));
    api("POST", "/groups", { courseId, name: "Team Alpha" }).then((res) => expectError(res, 400, "มีกลุ่มชื่อนี้ในวิชานี้แล้ว"));
    api("POST", "/groups", { courseId, name: "Team Cypress", maxMembers: 3 }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.deep.include({ name: "Team Cypress", maxMembers: 3, members: [] });
    });
  });
});

describe("API — Rounds", () => {
  const rounds = () => api("GET", `/rounds?courseId=${seed.course.id}`);
  const generate = (body: object) =>
    api("POST", "/rounds/generate", { courseId: seed.course.id, count: 2, intervalWeeks: 1, openDays: 3, ...body });

  it("อาจารย์เห็นจำนวนคนส่ง นักศึกษาเห็นสถานะของตัวเองแทน", () => {
    cy.loginAs("instructor");
    rounds().then((res) => {
      expect(res.body.data.map((r: any) => [r.sequenceNo, r.submittedCount, r.studentCount])).to.deep.eq([
        [1, 15, 16],
        [2, 16, 16],
        [3, 2, 16],
      ]);
    });

    cy.loginAs("napat");
    rounds().then((res) => {
      expect(res.body.data[2].mySubmission.status).to.eq("submitted");
      expect(res.body.data[2]).to.not.have.property("submittedCount");
    });
    cy.loginAs("wirat");
    rounds().then((res) => expect(res.body.data[2].mySubmission).to.eq(null));
  });

  it("สร้างรอบ: วันเปิดต้องอยู่ในอนาคตและไม่ทับรอบเดิม", () => {
    cy.loginAs("instructor");
    generate({ firstOpensAt: fromNow(-1) }).then((res) => expectError(res, 400, "วันเปิดรอบแรกต้องเป็นเวลาในอนาคต"));
    generate({ firstOpensAt: fromNow(2) }).then((res) => expectError(res, 400, "รอบแรกต้องเปิดหลังรอบที่ 3 ปิดรับ"));
    generate({ firstOpensAt: fromNow(10), count: 0 }).then((res) => expectError(res, 400, "จำนวนรอบต้องเป็น"));
    generate({ firstOpensAt: fromNow(10), openDays: 8 }).then((res) => expectError(res, 400, "ระยะเปิดรับต้องเป็น 1–7 วัน"));

    generate({ firstOpensAt: fromNow(10) }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data.map((r: any) => r.sequenceNo)).to.deep.eq([1, 2, 3, 4, 5]);
      const [, , , r4, r5] = res.body.data;
      expect(Date.parse(r4.closesAt)).to.be.greaterThan(Date.parse(r4.opensAt));
      expect(Date.parse(r5.opensAt) - Date.parse(r4.opensAt)).to.eq(7 * DAY);
    });
  });

  // ต่อจากข้อก่อนหน้า: มีรอบ 4 และ 5 ที่ยังไม่เปิด
  it("ลบรอบ: เฉพาะรอบที่ยังไม่เปิด และเลขรอบที่เหลือเลื่อนขึ้นมาแทน", () => {
    cy.loginAs("instructor");
    api("DELETE", `/rounds/${seed.rounds.open}`).then((res) => expectError(res, 400, "ลบได้เฉพาะรอบที่ยังไม่เปิดรับ"));
    rounds().then((before) => {
      const [, , , r4, r5] = before.body.data;
      api("DELETE", `/rounds/${r4.id}`).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.data.map((r: any) => [r.id, r.sequenceNo]).at(-1)).to.deep.eq([r5.id, 4]);
        expect(res.body.data).to.have.length(4);
      });
    });
  });

  it("เผยแพร่ผล: เฉพาะรอบที่ปิดรับแล้ว และเปิดปิดคะแนนกับฟีดแบ็กแยกกัน", () => {
    const release = (roundId: string, body: object) => api("PATCH", `/rounds/${roundId}/release`, body);
    const closed = (res: Cypress.Response<any>) => res.body.data.find((r: any) => r.id === seed.rounds.closed);
    cy.loginAs("instructor");

    release(seed.rounds.open, { scores: true }).then((res) => expectError(res, 400, "เผยแพร่ได้เฉพาะรอบที่ปิดรับแล้ว"));
    release(seed.rounds.closed, {}).then((res) => expectError(res, 400, "ระบุ scores หรือ feedback"));
    release(seed.rounds.closed, { scores: "yes" }).then((res) => expectError(res, 400, "scores ต้องเป็น true หรือ false"));

    release(seed.rounds.closed, { scores: true }).then((res) => {
      expect(closed(res).scoresReleasedAt).to.be.a("string");
      expect(closed(res).feedbackReleasedAt).to.eq(null);
    });
    release(seed.rounds.closed, { scores: false }).then((res) => expect(closed(res).scoresReleasedAt).to.eq(null));
  });
});

describe("API — Evaluation", () => {
  const form = (roundId: string) => api("GET", `/answers/${roundId}`).its("body.data") as Cypress.Chainable<EvalForm & Record<string, any>>;
  const draft = (roundId: string, answers: unknown) => api("PUT", `/answers/${roundId}/draft`, { answers });
  const submit = (roundId: string, body: object) => api("POST", `/answers/${roundId}/submit`, body);

  it("ฟอร์มมีตัวเองเป็นคนแรก ตามด้วยเพื่อนร่วมกลุ่ม และคำถามจากรูบริก", () => {
    cy.loginAs("wirat");
    form(seed.rounds.open).then((data) => {
      expect(data.targets).to.have.length(4);
      expect(data.targets[0]).to.include({ id: seed.ids.wirat, isSelf: true });
      expect(data.questions.map((q) => q.type)).to.deep.eq(["rating", "rating", "rating", "rating", "rating", "text", "text"]);
      expect(data).to.include({ blocker: null, submission: null });
    });
  });

  it("ทำไม่ได้เมื่อรอบปิดแล้ว ยังไม่มีกลุ่ม หรือยังไม่ยอมรับข้อตกลงกลุ่ม", () => {
    cy.loginAs("patiphan");
    draft(seed.rounds.closed, []).then((res) => expectError(res, 409, "รอบนี้ปิดรับแล้ว"));
    draft(seed.rounds.open, []).then((res) => expectError(res, 409, "ต้องเข้ากลุ่มก่อนจึงทำแบบประเมินได้"));

    cy.loginAs("malee");
    draft(seed.rounds.open, []).then((res) => expectError(res, 409, "ต้องยอมรับข้อตกลงกลุ่มก่อนจึงทำแบบประเมินได้"));
  });

  it("ต้องยอมรับนโยบายความเป็นส่วนตัวฉบับปัจจุบันก่อน", () => {
    cy.loginAs("thanapon");
    draft(seed.rounds.open, []).then((res) => expectError(res, 403, "ต้องยอมรับนโยบายความเป็นส่วนตัวก่อนทำแบบประเมิน"));

    api("GET", "/consents/me").then((res) => {
      expect(res.body.data.accepted).to.eq(false);
      api("POST", "/consents", { policyVersion: "ฉบับเก่า" }).then((old) => expectError(old, 409, "นโยบายมีการเปลี่ยนแปลง"));
      api("POST", "/consents", { policyVersion: res.body.data.policyVersion }).its("body.data.accepted").should("eq", true);
    });
    draft(seed.rounds.open, []).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data.submission.status).to.eq("draft");
    });
  });

  it("ปฏิเสธคำตอบที่ผิด: คะแนนนอกสเกล คนนอกกลุ่ม ความเห็นยาวเกิน คำถามที่ไม่มี", () => {
    cy.loginAs("wirat");
    form(seed.rounds.open).then((data) => {
      const rating = data.questions.find((q) => q.type === "rating")!.id;
      const text = data.questions.find((q) => q.type === "text")!.id;
      const self = seed.ids.wirat;
      const one = (answer: object) => draft(seed.rounds.open, [answer]);

      one({ questionId: rating, evaluateeId: self, score: 6 }).then((res) => expectError(res, 400, "คะแนนต้องอยู่ระหว่าง 1–5"));
      one({ questionId: rating, evaluateeId: self, score: 2.5 }).then((res) => expectError(res, 400, "คะแนนต้องอยู่ระหว่าง 1–5"));
      one({ questionId: rating, evaluateeId: seed.ids.somchai, score: 4 }).then((res) =>
        expectError(res, 403, "ประเมินได้เฉพาะสมาชิกในกลุ่มของคุณ")
      );
      one({ questionId: text, evaluateeId: self, comment: "ก".repeat(501) }).then((res) =>
        expectError(res, 400, "ความเห็นยาวได้ไม่เกิน 500 ตัวอักษร")
      );
      one({ questionId: NO_SUCH_ID, evaluateeId: self, score: 4 }).then((res) => expectError(res, 400, "พบคำถามที่ไม่อยู่ในแบบประเมิน"));
      draft(seed.rounds.open, "ไม่ใช่รายการ").then((res) => expectError(res, 400, "answers ต้องเป็น array"));
    });
  });

  it("บันทึกแบบร่างแทนที่คำตอบเดิมทั้งชุด", () => {
    cy.loginAs("wirat");
    form(seed.rounds.open).then((data) => {
      const [first, second] = fullAnswers(data);
      draft(seed.rounds.open, [first, second]).then((res) => {
        expect(res.body.data.submission.status).to.eq("draft");
        expect(res.body.data.answers).to.have.length(2);
      });
      draft(seed.rounds.open, [first]).its("body.data.answers").should("have.length", 1);
    });
  });

  // ข้อนี้ส่งความเห็นให้ระบบตรวจข้อความ (ถ้าเปิด AI_PROVIDER ไว้) — ถ้าถูกเตือนจะยืนยันส่งตามเดิม
  it("ส่งไม่ครบถูกปฏิเสธ ส่งครบแล้วแก้ไขไม่ได้ และอาจารย์เห็นจำนวนคนส่งเพิ่ม", () => {
    cy.loginAs("wirat");
    form(seed.rounds.open).then((data) => {
      const answers = fullAnswers(data);
      submit(seed.rounds.open, { answers: answers.filter((a) => a.score !== null) }).then((res) =>
        expectError(res, 422, "ยังตอบไม่ครบ: คำถามข้อ 6, 7")
      );

      submit(seed.rounds.open, { answers }).then((res) => {
        expect(res.status).to.eq(200);
        const acknowledged = res.body.data.warnings.map((w: any) => `${w.questionId}:${w.evaluateeId}`);
        if (acknowledged.length > 0) submit(seed.rounds.open, { answers, acknowledged }).its("status").should("eq", 200);
      });
      form(seed.rounds.open).its("submission.status").should("eq", "submitted");
      draft(seed.rounds.open, answers).then((res) => expectError(res, 409, "คุณส่งแบบประเมินรอบนี้แล้ว แก้ไขไม่ได้"));
    });

    cy.loginAs("instructor");
    api("GET", `/rounds?courseId=${seed.course.id}`).its("body.data.2.submittedCount").should("eq", 3);
  });
});

describe("API — Results and psychological safety", () => {
  const myResult = (roundId: string) => api("GET", `/feedback/rounds/${roundId}`).its("body.data");

  it("ก่อนเผยแพร่ นักศึกษาไม่ได้ทั้งคะแนน ความเห็น และฟีดแบ็กจากอาจารย์", () => {
    cy.loginAs("napat");
    myResult(seed.rounds.closed).then((data) => {
      expect(data).to.include({ scores: null, comments: null, overall: null, instructorNote: null });
      expect(data.round).to.include({ scoresReleasedAt: null, feedbackReleasedAt: null });
    });
  });

  it("หลังเผยแพร่ ได้คะแนนเฉลี่ยจากเพื่อนโดยไม่นับตัวเอง และความเห็นที่ไม่มีตัวตนผู้เขียน", () => {
    cy.loginAs("napat");
    api("GET", `/feedback/rounds/${seed.rounds.released}`).then((res) => {
      const { data } = res.body;
      // เพื่อนสามคนให้ข้อแรก 4, 5, 4 — ตัวเองให้ 4
      expect(data.scores[0]).to.include({ peerAverage: 4.3, peerCount: 3, selfScore: 4 });
      expect(data.overall).to.include({ peerAverage: 4.3, selfAverage: 4.2 });
      expect(data.comments).to.have.length(2);
      for (const c of data.comments) expect(c.comments).to.have.length(3);

      const raw = JSON.stringify(res.body);
      expect(raw).to.not.include("evaluator");
      for (const peer of seed.groups.gamma.members.filter((m) => m.id !== seed.ids.napat)) {
        expect(raw, `id ของ ${peer.name}`).to.not.include(peer.id);
        expect(raw, `ชื่อของ ${peer.name}`).to.not.include(peer.name);
      }
    });
  });

  it("เพื่อนประเมินไม่ถึง 2 คน ผลถูกซ่อนทั้งคะแนนและความเห็น", () => {
    cy.loginAs("somchai");
    myResult(seed.rounds.released).then((data) => {
      expect(data).to.include({ peerCount: 1, minPeers: 2, scores: null, comments: null });
      expect(data.withheldReason).to.be.a("string");
    });
  });

  it("เผยแพร่เฉพาะคะแนน นักศึกษาได้คะแนนแต่ยังไม่ได้ความเห็น", () => {
    const release = (scores: boolean) => api("PATCH", `/rounds/${seed.rounds.closed}/release`, { scores });
    cy.loginAs("instructor");
    release(true).its("status").should("eq", 200);

    cy.loginAs("napat");
    myResult(seed.rounds.closed).then((data) => {
      expect(data.scores).to.have.length(5);
      expect(data.comments).to.eq(null);
    });

    cy.loginAs("instructor");
    release(false).its("status").should("eq", 200);
  });

  it("ภาพรวมของอาจารย์มีทุกกลุ่ม ชื่อผู้ประเมิน และสัญญาณที่คำนวณแล้ว", () => {
    cy.loginAs("instructor");
    api("GET", `/feedback/rounds/${seed.rounds.released}/overview`).then((res) => {
      const { data } = res.body;
      const group = (id: string) => data.groups.find((g: any) => g.id === id);
      expect(data.questions).to.have.length(5);
      for (const g of Object.values(seed.groups)) expect(group(g.id), g.id).to.exist;

      expect(group(seed.groups.delta.id).signals.givers).to.deep.include({
        studentId: seed.ids.anan,
        type: "straight_lining",
        value: 5,
      });
      const somchai = group(seed.groups.alpha.id).rows.find((r: any) => r.student.id === seed.ids.somchai);
      expect(somchai.peerCount).to.eq(1);
      expect(group(seed.groups.alpha.id).signals.received).to.deep.include({
        studentId: seed.ids.somchai,
        type: "few_raters",
        count: 1,
      });
    });

    api("GET", `/feedback/rounds/${seed.rounds.released}/students/${seed.ids.napat}`).then((res) => {
      const names = res.body.data.evaluations.map((e: any) => e.evaluator.name);
      expect(names).to.have.length(4);
      expect(res.body.data.evaluations[0].evaluator.isSelf).to.eq(true);
    });
  });
});

describe("API — Instructor feedback", () => {
  const note = (roundId: string, studentId: string, body: string) =>
    api("PUT", `/feedback/rounds/${roundId}/students/${studentId}/note`, { body });
  // คืน null เมื่อไม่มีฟีดแบ็กหรือยังไม่เผยแพร่
  const myNote = (roundId: string) =>
    api("GET", `/feedback/rounds/${roundId}`).then((res) => cy.wrap<{ body: string; authorName: string } | null>(res.body.data.instructorNote));
  const releaseFeedback = (feedback: boolean) => api("PATCH", `/rounds/${seed.rounds.closed}/release`, { feedback });

  it("นักศึกษาเห็นฟีดแบ็กจากอาจารย์เฉพาะของตัวเอง ในรอบที่เผยแพร่แล้ว", () => {
    cy.loginAs("chaiwat");
    myNote(seed.rounds.released).then((n) => {
      expect(n!.body).to.include("เพื่อนในทีมให้คะแนนสูงกว่าที่ให้ตัวเอง");
      expect(n!.authorName).to.eq("วิชัย ตันติวัฒนกุล");
    });

    cy.loginAs("wirat");
    myNote(seed.rounds.released).then((n) => expect(n).to.eq(null));
  });

  it("เขียนได้เฉพาะอาจารย์ของวิชา เฉพาะรอบที่ปิดรับแล้ว และไม่เกิน 2,000 ตัวอักษร", () => {
    cy.loginAs("instructor");
    note(seed.rounds.open, seed.ids.wirat, "เร็วเกินไป").then((res) => expectError(res, 400, "เขียนฟีดแบ็กได้หลังรอบปิดรับ"));
    note(seed.rounds.closed, NO_SUCH_ID, "ไม่มีคนนี้").then((res) => expectError(res, 404, "ไม่พบนักศึกษาคนนี้ในวิชา"));
    note(seed.rounds.closed, seed.ids.wirat, "ก".repeat(2001)).then((res) => expectError(res, 400, "ฟีดแบ็กยาวเกิน 2000 ตัวอักษร"));

    cy.loginAs("wirat");
    note(seed.rounds.closed, seed.ids.wirat, "เขียนให้ตัวเอง").then((res) => expectError(res, 403));
  });

  it("บันทึก แก้ไข และลบ: นักศึกษาเห็นเมื่อเผยแพร่ฟีดแบ็กของรอบนั้นแล้วเท่านั้น", () => {
    cy.loginAs("instructor");
    note(seed.rounds.closed, seed.ids.wirat, "  รอบนี้ทำได้ดี  ").then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data).to.include({ body: "รอบนี้ทำได้ดี", authorName: "วิชัย ตันติวัฒนกุล" });
    });
    note(seed.rounds.closed, seed.ids.wirat, "รอบนี้ทำได้ดีมาก").its("body.data.body").should("eq", "รอบนี้ทำได้ดีมาก");
    api("GET", `/feedback/rounds/${seed.rounds.closed}/overview`).then((res) => {
      const noted = res.body.data.groups.flatMap((g: any) => g.rows).filter((r: any) => r.hasNote);
      expect(noted.map((r: any) => r.student.id)).to.deep.eq([seed.ids.wirat]);
    });

    cy.loginAs("wirat");
    myNote(seed.rounds.closed).then((n) => expect(n).to.eq(null));

    cy.loginAs("instructor");
    releaseFeedback(true).its("status").should("eq", 200);
    cy.loginAs("wirat");
    myNote(seed.rounds.closed).then((n) => expect(n!.body).to.eq("รอบนี้ทำได้ดีมาก"));

    cy.loginAs("instructor");
    note(seed.rounds.closed, seed.ids.wirat, " ").then((res) => expect(res.body.data).to.eq(null));
    cy.loginAs("wirat");
    myNote(seed.rounds.closed).then((n) => expect(n).to.eq(null));

    cy.loginAs("instructor");
    releaseFeedback(false).its("status").should("eq", 200);
  });

  it("ฟีดแบ็กจากอาจารย์ไม่ถูกซ่อนด้วยกฎผู้ประเมินขั้นต่ำ", () => {
    cy.loginAs("instructor");
    note(seed.rounds.released, seed.ids.somchai, "ส่งงานตรงเวลาทุกครั้ง").its("status").should("eq", 200);

    cy.loginAs("somchai");
    api("GET", `/feedback/rounds/${seed.rounds.released}`).then((res) => {
      expect(res.body.data.scores).to.eq(null);
      expect(res.body.data.withheldReason).to.be.a("string");
      expect(res.body.data.instructorNote.body).to.eq("ส่งงานตรงเวลาทุกครั้ง");
    });
  });
});
