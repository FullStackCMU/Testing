// support/e2e.ts โหลดอัตโนมัติก่อนทุก test file
// ที่นี่คือจุดเดียวที่ประกาศ custom command ของโปรเจกต์

import { ACCOUNTS, BACKEND_URL, type AccountKey } from "./testHelpers";

// ต้องตรงกับ AUTH_COOKIE ใน Backend/src/middlewares/auth.middleware.ts
const AUTH_COOKIE = "cr_token";

Cypress.Commands.add("resetDb", () => {
  cy.task("resetDb", null, { timeout: 120000 });
});

Cypress.Commands.add("loginAs", (who) => {
  // log: false — ไม่ให้ token ไปโผล่ใน command log หรือวิดีโอ
  cy.task<string>("sessionToken", ACCOUNTS[who], { log: false }).then((token) => {
    cy.setCookie(AUTH_COOKIE, token, { domain: new URL(BACKEND_URL).hostname, httpOnly: true, log: false });
  });
});

Cypress.Commands.add("logout", () => {
  cy.clearCookie(AUTH_COOKIE);
});

declare global {
  namespace Cypress {
    interface Chainable {
      /** ล้างฐานข้อมูลในเครื่องแล้วสร้างข้อมูลตัวอย่างใหม่ (db:prototype) */
      resetDb(): Chainable<void>;
      /** เข้าสู่ระบบเป็นบัญชีตัวอย่างโดยตั้ง cookie — ใช้ได้ทั้งกับ cy.request และ cy.visit */
      loginAs(who: AccountKey): Chainable<void>;
      /** ลบ cookie เข้าสู่ระบบ */
      logout(): Chainable<void>;
    }
  }
}
