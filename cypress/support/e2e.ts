// support/e2e.ts โหลดอัตโนมัติก่อนทุก test file
// ที่นี่คือจุดเดียวที่ประกาศ custom command ของโปรเจกต์

const FRONTEND_URL = Cypress.expose('FRONTEND_URL') as string;

Cypress.Commands.add('loginAsStudent', (username = '6511500001') => {
  cy.visit(FRONTEND_URL);
  cy.get('[data-cy=input-username]').clear().type(username);
  cy.get('[data-cy=input-password]').clear().type('password123');
  cy.get('[data-cy=submit-login]').click();
  // logout ปุ่มมีทั้งฝั่งนักศึกษา (StudentDashboard) และอาจารย์ (AppShell)
  // การรอปุ่มนี้คือสัญญาณว่า login ผ่านและ dashboard render แล้วจริง ๆ
  cy.get('[data-cy=logout]', { timeout: 10000 }).should('be.visible');
});

Cypress.Commands.add('loginAsInstructor', () => {
  cy.visit(FRONTEND_URL);
  cy.get('[data-cy=input-username]').clear().type('ajarn.nirand');
  cy.get('[data-cy=input-password]').clear().type('password123');
  cy.get('[data-cy=submit-login]').click();
  cy.get('[data-cy=logout]', { timeout: 10000 }).should('be.visible');
});

declare global {
  namespace Cypress {
    interface Chainable {
      /** login ผ่านหน้า UI จริง ด้วย username นักศึกษา (default 6511500001) รหัสผ่าน password123 */
      loginAsStudent(username?: string): Chainable<void>;
      /** login ผ่านหน้า UI จริง ด้วยบัญชีอาจารย์ ajarn.nirand */
      loginAsInstructor(): Chainable<void>;
    }
  }
}
