// ทดสอบผ่านหน้าเว็บจริงใน browser — ทุกครั้งเริ่มจากข้อมูลตัวอย่างชุดเดียวกัน (db:prototype)
// เลือกองค์ประกอบจากข้อความและ aria-label ที่ผู้ใช้เห็น จึงตรวจถ้อยคำบนหน้าจอไปด้วย

import { loadSeed, type Seed } from "../support/testHelpers";

const COMMENT = "ทำงานส่วนของตัวเองได้ดีและส่งตรงเวลา";

// หน้าจอกว้างมีเมนูซ้าย หน้าจอแคบมีเมนูล่าง — ใช้ชื่อเดียวกันทั้งคู่
const mainNav = () => cy.get('nav[aria-label="เมนูหลัก"]').filter(":visible");
const dialog = () => cy.get("dialog[open]");
const stepIs = (n: number) => cy.contains(`ขั้นที่ ${n} จาก 7`).should("be.visible");
const nextButton = () => cy.contains("button", /^(ถัดไป|ส่งแบบประเมิน)$/);

// ให้คะแนนเดียวกันกับทุกคนในหน้าปัจจุบัน
function rateEveryone(score: number) {
  cy.get('[role="radiogroup"]').each(($group) => {
    cy.wrap($group).contains("button", String(score)).click();
  });
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

describe("UI — เข้าสู่ระบบและการนำทาง", () => {
  it("ยังไม่เข้าสู่ระบบ: เปิดหน้าไหนก็ถูกพาไปหน้าเข้าสู่ระบบ", () => {
    cy.visit("/courses");
    cy.location("pathname").should("eq", "/login");
    cy.contains("a", "เข้าสู่ระบบด้วยบัญชี CMU").should("have.attr", "href", "/api/auth/login");
  });

  it("เข้าสู่ระบบไม่สำเร็จ: แสดงเหตุผลตามรหัสข้อผิดพลาด", () => {
    cy.visit("/login?error=account_type_not_allowed");
    cy.contains("บัญชีประเภทนี้ใช้งานระบบไม่ได้").should("be.visible");
  });

  it("อาจารย์เห็นเมนูของอาจารย์ นักศึกษาเห็นสามเมนูของนักศึกษา", () => {
    cy.loginAs("instructor");
    cy.visit("/");
    cy.location("pathname").should("eq", "/courses");
    mainNav().should("contain", "คอร์สของฉัน").and("not.contain", "แบบประเมิน");

    cy.loginAs("patiphan");
    cy.visit("/");
    cy.location("pathname").should("eq", "/assignments");
    mainNav().should("contain", "แบบประเมิน").and("contain", "วิชาของฉัน").and("contain", "ฟีดแบ็ก").and("not.contain", "คอร์สของฉัน");
  });

  it("นักศึกษาเปิดหน้าของอาจารย์ไม่ได้", () => {
    cy.loginAs("patiphan");
    cy.visit(`/courses/${seed.course.id}/rounds`);
    cy.location("pathname").should("eq", "/assignments");
  });

  it("ออกจากระบบจากเมนู แล้วกลับไปหน้าเข้าสู่ระบบ", () => {
    cy.loginAs("patiphan");
    cy.visit("/assignments");
    cy.get('button[aria-label="ออกจากระบบ"]').filter(":visible").click();
    cy.location("pathname").should("eq", "/login");
    cy.visit("/assignments");
    cy.location("pathname").should("eq", "/login");
  });
});

describe("UI — นักศึกษา", () => {
  it("นักศึกษาที่ยังไม่ยอมรับนโยบายต้องยอมรับก่อนจึงเข้าใช้งานได้", () => {
    cy.loginAs("thanapon");
    cy.visit("/assignments");
    cy.location("pathname").should("eq", "/consent");
    cy.contains("h1", "ก่อนเริ่มใช้งาน").should("be.visible");

    cy.contains("button", "ยอมรับและเริ่มใช้งาน").should("be.disabled");
    cy.get('input[type="checkbox"]').check({ force: true });
    cy.contains("button", "ยอมรับและเริ่มใช้งาน").click();
    cy.location("pathname").should("eq", "/assignments");
  });

  it("เลือกกลุ่ม: กลุ่มที่เต็มถูกพับไว้ เข้ากลุ่มแล้วต้องยอมรับข้อตกลง", () => {
    cy.loginAs("patiphan");
    cy.visit(`/courses/${seed.course.id}`);
    cy.contains("h2", "เลือกกลุ่มของคุณ").should("be.visible");

    // Cypress มองเนื้อหาใน <details> ที่พับอยู่ว่ายังมองเห็น จึงตรวจจากสถานะเปิด/ปิดของ <details> แทน
    cy.contains("summary", "กลุ่มที่เต็มแล้ว 3 กลุ่ม").parent("details").as("full").should("not.have.attr", "open");
    cy.contains("summary", "กลุ่มที่เต็มแล้ว 3 กลุ่ม").click();
    cy.get("@full").should("have.attr", "open");
    cy.get("@full").contains("li", "Team Gamma").should("be.visible").find("button").should("not.exist");

    cy.contains("li", "Team Alpha").contains("button", "เข้ากลุ่ม").click();
    cy.contains("h2", "ข้อตกลงของ Team Alpha").should("be.visible");
    cy.contains("button", "ยอมรับข้อตกลง").click();

    cy.contains("h2", "ข้อตกลงของ Team Alpha").should("not.exist");
    cy.contains("li", "(คุณ)").should("contain", "ปฏิพันธ์ เลขนอก");
    cy.contains("button", "ออกจากกลุ่ม").should("be.visible");
    // กำหนดการรอบ: รอบที่เปิดอยู่มีปุ่มไปทำแบบประเมิน
    cy.contains("li", "รอบที่ 3").contains("a", "ทำแบบประเมิน").should("be.visible");
  });

  it("หน้าแบบประเมินแยกงานที่ต้องทำกับที่ส่งแล้ว", () => {
    cy.loginAs("wirat");
    cy.visit("/assignments");
    cy.contains("section", "ต้องทำ").within(() => {
      cy.contains("รอบที่ 3").should("be.visible");
      cy.contains("a", "เริ่มประเมิน").should("be.visible");
    });

    cy.loginAs("napat");
    cy.visit("/assignments");
    cy.contains("section", "ส่งแล้ว").should("contain", "รอบที่ 3");
    cy.contains("a", "เริ่มประเมิน").should("not.exist");
  });

  it("ส่งโดยยังตอบไม่ครบ: บอกขั้นที่ขาดและพากลับไปขั้นนั้น แบบร่างที่บันทึกไว้ทำต่อได้", () => {
    cy.loginAs("kanya");
    cy.visit(`/courses/${seed.course.id}/rounds/${seed.rounds.open}/evaluate?q=7`);
    stepIs(7);
    cy.contains("button", "ส่งแบบประเมิน").click();
    cy.contains("ยังตอบไม่ครบ").should("be.visible");
    stepIs(1);

    rateEveryone(5);
    cy.contains("button", "บันทึกและออก").click();
    cy.location("pathname").should("eq", `/courses/${seed.course.id}`);

    cy.visit("/assignments");
    cy.contains("ตอบแล้ว 4 จาก 28 ช่อง").should("be.visible");
    cy.contains("a", "ทำต่อ").should("be.visible");
  });

  it("ทำแบบประเมินครบทุกขั้นและส่ง: 5 ด้านคะแนน ความเห็น ทบทวน ยืนยัน", () => {
    cy.loginAs("wirat");
    cy.visit("/assignments");
    cy.contains("a", "เริ่มประเมิน").click();

    // หน้าแรกของรอบสรุปว่าต้องทำอะไร
    cy.contains("3 คน + ตัวเอง").should("be.visible");
    cy.contains("7 คำถาม").should("be.visible");
    cy.contains("a", "เริ่มประเมิน").click();

    for (let step = 1; step <= 5; step++) {
      stepIs(step);
      cy.get('[role="radiogroup"]').should("have.length", 4);
      rateEveryone(4);
      nextButton().click();
    }

    stepIs(6);
    cy.get("textarea").should("have.length", 8).each(($field) => {
      cy.wrap($field).type(COMMENT, { delay: 0 });
    });
    // ออกจากหน้าความเห็น = บันทึกพร้อมส่งให้ระบบตรวจข้อความ
    // ถ้าถูกเตือนให้ยืนยันส่งตามเดิมทุกข้อแล้วไปต่อ — เทสต์จึงผ่านทั้งตอนเปิดและปิด AI_PROVIDER
    cy.intercept("PUT", "**/api/answers/*/draft").as("check");
    nextButton().click();
    cy.wait("@check", { timeout: 20000 }).then(({ response }) => {
      const warned: number = response!.body.data.warnings.length;
      if (warned === 0) return;
      for (let i = 0; i < warned; i++) cy.contains("button", "ส่งตามนี้").click();
      nextButton().click();
    });

    stepIs(7);
    cy.contains("ตรวจคำตอบอีกครั้ง ส่งแล้วจะแก้ไขไม่ได้").should("be.visible");
    cy.contains("ยังไม่ให้").should("not.exist");
    nextButton().click();
    dialog().should("contain", "ส่งแบบประเมิน?").contains("button", "ส่งแบบประเมิน").click();

    cy.contains("h1", "ส่งเรียบร้อยแล้ว", { timeout: 20000 }).should("be.visible");
    cy.visit("/assignments");
    cy.contains("section", "ส่งแล้ว").should("contain", "รอบที่ 3");
  });

  it("ผลที่เผยแพร่แล้ว: เห็นคะแนน ความเห็น และฟีดแบ็กจากอาจารย์ โดยไม่มีชื่อเพื่อน", () => {
    cy.loginAs("napat");
    cy.visit("/feedback");
    cy.contains("รอบที่ 1").should("be.visible");
    cy.contains("a", "ดูผลประเมิน").click();
    cy.location("pathname").should("eq", `/feedback/${seed.rounds.released}`);

    cy.contains("คะแนนรายด้าน").should("be.visible");
    cy.contains("เพื่อน (3 คน)").should("be.visible");
    cy.contains("ฟีดแบ็กจากอาจารย์").parent().parent().should("contain", "ทำงานได้สม่ำเสมอ").and("contain", "วิชัย ตันติวัฒนกุล");

    for (const peer of seed.groups.gamma.members.filter((m) => m.id !== seed.ids.napat))
      cy.get("body").should("not.contain", peer.name);
  });

  it("เพื่อนประเมินไม่ถึง 2 คน: ผลถูกซ่อนพร้อมเหตุผล", () => {
    cy.loginAs("somchai");
    cy.visit(`/feedback/${seed.rounds.released}`);
    cy.contains("ผู้ประเมินไม่พอสำหรับแสดงผลแบบไม่ระบุชื่อ").should("be.visible");
    cy.contains("คะแนนรายด้าน").should("not.exist");
  });

  it("รอบที่ยังไม่เผยแพร่: บอกว่ารออาจารย์เผยแพร่ผล", () => {
    cy.loginAs("napat");
    cy.visit(`/feedback/${seed.rounds.closed}`);
    cy.contains("h1", "ผลประเมินยังไม่พร้อม").should("be.visible");
    cy.contains("อาจารย์เผยแพร่ผล").should("be.visible");
    cy.contains("คะแนนรายด้าน").should("not.exist");
  });
});

describe("UI — อาจารย์", () => {
  const course = () => `/courses/${seed.course.id}`;

  it("เข้าวิชาจากรายการ: ภาพรวมเปิดที่รอบล่าสุดที่ปิดแล้ว และกรองตามกลุ่มได้", () => {
    cy.loginAs("instructor");
    cy.visit("/courses");
    cy.contains("h2", "Software Engineering").should("be.visible");
    cy.contains("h2", "Fullstack Development").click();
    cy.location("pathname").should("eq", course());

    cy.get('select[aria-label="รอบประเมิน"]').should("have.value", seed.rounds.closed);
    cy.contains("a", "ยังไม่ได้เผยแพร่ผล").should("be.visible");
    mainNav().should("contain", "ภาพรวม").and("contain", "สมาชิก").and("contain", "รอบประเมิน").and("contain", "ฟีดแบ็ก");

    cy.get('section[aria-label="คะแนนรายคน"]').as("scores").should("contain", "ณภัทร แสงทอง").and("contain", "อนันต์ ทองดี");
    cy.get('nav[aria-label="กรองตามกลุ่ม"]').contains("a", "Team Delta").click();
    cy.location("search").should("include", `group=${seed.groups.delta.id}`);
    cy.get("@scores").should("contain", "อนันต์ ทองดี").and("not.contain", "ณภัทร แสงทอง");
  });

  it("เปิดรายละเอียดนักศึกษา: เห็นคะแนนรายผู้ประเมิน แล้วไปหน้าเขียนฟีดแบ็กของคนนั้น", () => {
    cy.loginAs("instructor");
    cy.visit(`${course()}?round=${seed.rounds.closed}`);
    cy.get('section[aria-label="คะแนนรายคน"]').contains("button", "วิรัช คงมั่น").click();

    dialog().within(() => {
      cy.contains("h2", "วิรัช คงมั่น").should("be.visible");
      cy.contains("คะแนนที่ได้รับ").should("be.visible");
      cy.get("textarea").should("not.exist");
      cy.contains("a", "เขียนที่หน้าฟีดแบ็ก").click();
    });

    cy.location("pathname").should("eq", `${course()}/feedback`);
    cy.location("search").should("include", `student=${seed.ids.wirat}`);
    cy.contains("h3", "วิรัช คงมั่น").should("be.visible");
  });

  it("เขียนฟีดแบ็ก: เตือนเมื่อเปลี่ยนคนโดยยังไม่บันทึก บันทึกแล้วนักศึกษาเห็นในหน้าผลของตัวเอง", () => {
    const text = "รอบนี้ช่วยรีวิวงานของเพื่อนได้ละเอียด";
    cy.loginAs("instructor");
    cy.visit(`${course()}/feedback?round=${seed.rounds.released}`);
    cy.contains("เขียนแล้ว 4 จาก 17 คน").should("be.visible");
    cy.contains("เผยแพร่ฟีดแบ็กแล้ว นักศึกษาเห็นทันทีที่บันทึก").should("be.visible");
    cy.contains("button", "AI ร่างฟีดแบ็กทั้งหมด").should("be.disabled");

    cy.get('nav[aria-label="นักศึกษา"]').as("students").contains("button", "วิรัช คงมั่น").click();
    cy.contains("h3", "วิรัช คงมั่น").should("be.visible");
    cy.get("#instructor-note").should("have.value", "").type(text, { delay: 0 });

    cy.get("@students").contains("button", "ณภัทร แสงทอง").click();
    dialog().should("contain", "ยังไม่ได้บันทึกฟีดแบ็ก").contains("button", "ยกเลิก").click();
    cy.contains("h3", "วิรัช คงมั่น").should("be.visible");
    cy.get("#instructor-note").should("have.value", text);

    cy.contains("button", /^บันทึก$/).click();
    cy.contains("เขียนแล้ว 5 จาก 17 คน").should("be.visible");
    cy.get("@students").contains("button", "วิรัช คงมั่น").find('[aria-label="เขียนแล้ว"]').should("exist");

    cy.loginAs("wirat");
    cy.visit(`/feedback/${seed.rounds.released}`);
    cy.contains(text).should("be.visible");
  });

  it("เผยแพร่คะแนนจากหน้ารอบประเมิน: ถามยืนยันก่อน แล้วนักศึกษาเห็นคะแนนแต่ยังไม่เห็นความเห็น", () => {
    cy.loginAs("instructor");
    cy.visit(`${course()}/rounds`);
    cy.contains("tr", "รอบที่ 2").as("round2").should("contain", "ปิดรับแล้ว");
    cy.get('button[aria-label="เผยแพร่คะแนนรอบที่ 3"]').should("be.disabled");

    cy.get('button[aria-label="เผยแพร่คะแนนรอบที่ 2"]').should("have.attr", "aria-checked", "false").click();
    dialog().should("contain", "เผยแพร่คะแนนรอบที่ 2?").contains("button", /^เผยแพร่$/).click();
    cy.get('button[aria-label="เผยแพร่คะแนนรอบที่ 2"]').should("have.attr", "aria-checked", "true");
    cy.get("@round2").should("contain", "เผยแพร่ผลแล้ว");

    cy.loginAs("napat");
    cy.visit(`/feedback/${seed.rounds.closed}`);
    cy.contains("คะแนนรายด้าน").should("be.visible");
    cy.contains("อาจารย์ยังไม่ได้เผยแพร่ความเห็นจากเพื่อนของรอบนี้").should("be.visible");
  });

  it("หน้าสมาชิก: ค้นหานักศึกษาด้วยชื่อ", () => {
    cy.loginAs("instructor");
    cy.visit(`${course()}/members`);
    cy.contains("td", "สมชาย ใจดี").should("be.visible");
    cy.get('input[aria-label="ค้นหานักศึกษา"]').type("กัญญา");
    cy.contains("td", "กัญญา ศรีวงศ์").should("be.visible");
    cy.contains("td", "สมชาย ใจดี").should("not.exist");
  });

  it("สร้างคอร์สใหม่: ตรวจข้อมูลในฟอร์ม แล้วคอร์สใหม่ขึ้นในรายการ", () => {
    cy.loginAs("instructor");
    cy.visit("/courses");
    cy.contains("button", "สร้างคอร์สใหม่").click();

    dialog().within(() => {
      cy.get("#courseCode").type("2612");
      cy.contains("button", "สร้างคอร์ส").click();
      cy.get("#courseCode").should("have.attr", "aria-invalid", "true");

      cy.get("#courseCode").clear().type("261222");
      cy.get("#section").type("801");
      cy.get("#title").type("Cypress UI Course");
      cy.contains("button", "สร้างคอร์ส").click();
    });

    dialog().should("not.exist");
    cy.contains("h2", "Cypress UI Course").should("be.visible");
  });
});
