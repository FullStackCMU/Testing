import {
  BACKEND_URL,
  CREDENTIALS,
  apiLogin,
  authHeader,
  setupOpenRound,
  setupClosedRound,
  getMyGroup,
  getCourseIdByCode,
} from '../support/testHelpers.js';

describe('API — Authentication', () => {
  it('login สำเร็จ ได้ token และไม่มี password หลุดมาใน response', () => {
    cy.request('POST', `${BACKEND_URL}/auth/login`, CREDENTIALS.student1).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data.token).to.be.a('string').and.not.be.empty;
      expect(res.body.data.user).to.not.have.property('password');
    });
  });

  it('แยก role ถูกต้องระหว่างนักศึกษากับอาจารย์', () => {
    cy.request('POST', `${BACKEND_URL}/auth/login`, CREDENTIALS.student1).then((res) => {
      expect(res.body.data.user.role).to.eq('student');
    });
    cy.request('POST', `${BACKEND_URL}/auth/login`, CREDENTIALS.instructor).then((res) => {
      expect(res.body.data.user.role).to.eq('instructor');
    });
  });

  it('รหัสผ่านผิด → 4xx', () => {
    cy.request({
      method: 'POST',
      url: `${BACKEND_URL}/auth/login`,
      body: { username: CREDENTIALS.student1.username, password: 'wrong-password' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.within(400, 499);
    });
  });

  it('ไม่ส่ง body → 4xx', () => {
    cy.request({
      method: 'POST',
      url: `${BACKEND_URL}/auth/login`,
      body: {},
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.within(400, 499);
    });
  });
});

describe('API — Register', () => {
  it('สมัครสำเร็จ → role student + ไม่มี password + ได้ token', () => {
    const username = `cy_api_${Date.now()}`;
    cy.request('POST', `${BACKEND_URL}/auth/register`, {
      username,
      name: 'สมัคร ทดสอบ',
      password: 'secret123',
    }).then((res) => {
      expect(res.status).to.eq(200);
      expect(res.body.data.token).to.be.a('string').and.not.be.empty;
      expect(res.body.data.user.role).to.eq('student');
      expect(res.body.data.user).to.not.have.property('password');
    });
  });

  it('username ซ้ำ → 4xx', () => {
    const body = { username: `cy_dup_${Date.now()}`, name: 'x', password: 'secret123' };
    cy.request('POST', `${BACKEND_URL}/auth/register`, body).then((res) => {
      expect(res.status).to.eq(200);
    });
    cy.request({
      method: 'POST',
      url: `${BACKEND_URL}/auth/register`,
      body,
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.within(400, 499);
    });
  });

  it('รหัสผ่านสั้นเกินไป → 4xx', () => {
    cy.request({
      method: 'POST',
      url: `${BACKEND_URL}/auth/register`,
      body: { username: `cy_short_${Date.now()}`, name: 'x', password: '123' },
      failOnStatusCode: false,
    }).then((res) => {
      expect(res.status).to.be.within(400, 499);
    });
  });

  it('สมัครแล้ว login ต่อได้ด้วยรหัสที่ตั้ง', () => {
    const username = `cy_login_${Date.now()}`;
    cy.request('POST', `${BACKEND_URL}/auth/register`, {
      username,
      name: 'สมัคร แล้วเข้า',
      password: 'secret123',
    }).then(() =>
      cy
        .request('POST', `${BACKEND_URL}/auth/login`, { username, password: 'secret123' })
        .then((res) => {
          expect(res.status).to.eq(200);
          expect(res.body.data.user.role).to.eq('student');
        }),
    );
  });
});

describe('API — Authorization', () => {
  it('ไม่มี token → 401', () => {
    cy.request({ url: `${BACKEND_URL}/courses`, failOnStatusCode: false }).then((res) => {
      expect(res.status).to.eq(401);
    });
  });

  it('อาจารย์เรียก GET /users → 200', () => {
    apiLogin(CREDENTIALS.instructor.username, CREDENTIALS.instructor.password).then((instructor) =>
      cy.request({ url: `${BACKEND_URL}/users`, headers: authHeader(instructor.token) }).then((res) => {
        expect(res.status).to.eq(200);
        expect(res.body.data).to.be.an('array');
      }),
    );
  });

  // ทุก endpoint ที่ backend gate ด้วย requireInstructor — นักศึกษาเรียกต้องโดน 403 ทุกตัว
  // (403 เด้งที่ middleware ก่อนถึง handler จึงใช้ id/body ปลอมได้)
  const FAKE_ID = '00000000-0000-0000-0000-000000000000';
  const instructorOnly: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    path: string;
    body?: object;
  }[] = [
    { method: 'GET', path: '/users' },
    { method: 'POST', path: '/courses', body: { courseCode: 'X', name: 'x' } },
    { method: 'POST', path: `/courses/${FAKE_ID}/enroll`, body: { userIds: [FAKE_ID] } },
    { method: 'POST', path: '/groups', body: { name: 'x', courseId: FAKE_ID } },
    { method: 'POST', path: '/rounds', body: { courseId: FAKE_ID, name: 'x' } },
    { method: 'POST', path: `/rounds/${FAKE_ID}/questions`, body: { content: 'x' } },
    { method: 'PATCH', path: `/rounds/${FAKE_ID}/open`, body: { isOpen: true } },
    { method: 'DELETE', path: `/rounds/questions/${FAKE_ID}` },
    { method: 'GET', path: `/feedback/raw/${FAKE_ID}?groupId=${FAKE_ID}` },
    { method: 'POST', path: '/feedback', body: { roundId: FAKE_ID, studentId: FAKE_ID, summary: 'x' } },
    { method: 'PATCH', path: `/feedback/${FAKE_ID}/publish`, body: { isPublished: true } },
    { method: 'GET', path: `/feedback/round/${FAKE_ID}` },
  ];

  it('นักศึกษาเรียก endpoint เฉพาะอาจารย์ทุกตัว → 403', () => {
    apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) => {
      instructorOnly.forEach((ep) => {
        cy.request({
          method: ep.method,
          url: `${BACKEND_URL}${ep.path}`,
          headers: authHeader(student.token),
          body: ep.body,
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status, `${ep.method} ${ep.path}`).to.eq(403);
        });
      });
    });
  });
});

describe('API — Answers validation', () => {
  it('scale ส่งค่านอกช่วง (99) → 4xx', () => {
    setupOpenRound().then((fixture) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
        getMyGroup(student.token, fixture.courseId).then((group) => {
          const scaleQuestion = fixture.questions.find((q) => q.type === 'scale')!;
          return cy
            .request({
              method: 'POST',
              url: `${BACKEND_URL}/answers`,
              headers: authHeader(student.token),
              failOnStatusCode: false,
              body: {
                roundId: fixture.roundId,
                groupId: group.id,
                evaluateeId: student.user.id,
                answers: [{ questionId: scaleQuestion.id, scoreValue: 99 }],
              },
            })
            .then((res) => {
              expect(res.status).to.be.within(400, 499);
            });
        }),
      ),
    );
  });

  it('text ส่งช่องว่างล้วน → 4xx', () => {
    setupOpenRound().then((fixture) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
        getMyGroup(student.token, fixture.courseId).then((group) => {
          const textQuestion = fixture.questions.find((q) => q.type === 'text')!;
          return cy
            .request({
              method: 'POST',
              url: `${BACKEND_URL}/answers`,
              headers: authHeader(student.token),
              failOnStatusCode: false,
              body: {
                roundId: fixture.roundId,
                groupId: group.id,
                evaluateeId: student.user.id,
                answers: [{ questionId: textQuestion.id, textValue: '    ' }],
              },
            })
            .then((res) => {
              expect(res.status).to.be.within(400, 499);
            });
        }),
      ),
    );
  });

  it('รอบที่ปิดแล้ว → 4xx (ตอบไม่ได้)', () => {
    setupClosedRound().then((fixture) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
        getMyGroup(student.token, fixture.courseId).then((group) => {
          const q = fixture.questions.find((x) => x.type === 'scale')!;
          return cy
            .request({
              method: 'POST',
              url: `${BACKEND_URL}/answers`,
              headers: authHeader(student.token),
              failOnStatusCode: false,
              body: {
                roundId: fixture.roundId,
                groupId: group.id,
                evaluateeId: student.user.id,
                answers: [{ questionId: q.id, scoreValue: 3 }],
              },
            })
            .then((res) => {
              expect(res.status).to.be.within(400, 499);
            });
        }),
      ),
    );
  });

  it('กลุ่มไม่ได้อยู่วิชาเดียวกับรอบ → 4xx', () => {
    // รอบอยู่ 261497 แต่ส่ง groupId ของกลุ่มในวิชา 261448
    setupOpenRound('261497').then((fixture) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
        getCourseIdByCode(student.token, '261448').then((otherCourseId) =>
          getMyGroup(student.token, otherCourseId).then((otherGroup) => {
            const q = fixture.questions.find((x) => x.type === 'scale')!;
            return cy
              .request({
                method: 'POST',
                url: `${BACKEND_URL}/answers`,
                headers: authHeader(student.token),
                failOnStatusCode: false,
                body: {
                  roundId: fixture.roundId,
                  groupId: otherGroup.id,
                  evaluateeId: student.user.id,
                  answers: [{ questionId: q.id, scoreValue: 3 }],
                },
              })
              .then((res) => {
                expect(res.status).to.be.within(400, 499);
              });
          }),
        ),
      ),
    );
  });

  it('ผู้ถูกประเมินไม่ได้อยู่ในกลุ่ม → 4xx', () => {
    // ใช้ id ของอาจารย์เป็น evaluatee (อาจารย์ไม่ได้เป็นสมาชิกกลุ่มนักศึกษา)
    setupOpenRound().then((fixture) =>
      apiLogin(CREDENTIALS.instructor.username, CREDENTIALS.instructor.password).then((outsider) =>
        apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
          getMyGroup(student.token, fixture.courseId).then((group) => {
            const q = fixture.questions.find((x) => x.type === 'scale')!;
            return cy
              .request({
                method: 'POST',
                url: `${BACKEND_URL}/answers`,
                headers: authHeader(student.token),
                failOnStatusCode: false,
                body: {
                  roundId: fixture.roundId,
                  groupId: group.id,
                  evaluateeId: outsider.user.id,
                  answers: [{ questionId: q.id, scoreValue: 3 }],
                },
              })
              .then((res) => {
                expect(res.status).to.be.within(400, 499);
              });
          }),
        ),
      ),
    );
  });

  it('ประเมินตนเอง (evaluator = evaluatee) → 200', () => {
    setupOpenRound().then((fixture) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
        getMyGroup(student.token, fixture.courseId).then((group) => {
          const scaleQuestion = fixture.questions.find((q) => q.type === 'scale')!;
          const textQuestion = fixture.questions.find((q) => q.type === 'text')!;
          return cy
            .request({
              method: 'POST',
              url: `${BACKEND_URL}/answers`,
              headers: authHeader(student.token),
              body: {
                roundId: fixture.roundId,
                groupId: group.id,
                evaluateeId: student.user.id, // evaluator (จาก token) === evaluatee → self-eval
                answers: [
                  { questionId: scaleQuestion.id, scoreValue: 4 },
                  { questionId: textQuestion.id, textValue: 'สะท้อนตนเองจาก Cypress' },
                ],
              },
            })
            .then((res) => {
              expect(res.status).to.eq(200);
              expect(res.body.msg).to.contain('ตนเอง');
            });
        }),
      ),
    );
  });

  it('ประเมินเพื่อน (evaluator ≠ evaluatee) → 200', () => {
    setupOpenRound().then((fixture) =>
      apiLogin(CREDENTIALS.student2.username, CREDENTIALS.student2.password).then((peer) =>
        apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
          getMyGroup(student.token, fixture.courseId).then((group) => {
            const scaleQuestion = fixture.questions.find((q) => q.type === 'scale')!;
            const textQuestion = fixture.questions.find((q) => q.type === 'text')!;
            return cy
              .request({
                method: 'POST',
                url: `${BACKEND_URL}/answers`,
                headers: authHeader(student.token),
                body: {
                  roundId: fixture.roundId,
                  groupId: group.id,
                  evaluateeId: peer.user.id,
                  answers: [
                    { questionId: scaleQuestion.id, scoreValue: 4 },
                    { questionId: textQuestion.id, textValue: 'ความเห็นถึงเพื่อนจาก Cypress' },
                  ],
                },
              })
              .then((res) => {
                expect(res.status).to.eq(200);
                expect(res.body.msg).to.contain('เพื่อน');
              });
          }),
        ),
      ),
    );
  });

  it('ส่งคำตอบซ้ำในรอบที่เปิดอยู่ → 200 (แก้ไขคำตอบเดิมได้)', () => {
    setupOpenRound().then((fixture) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
        getMyGroup(student.token, fixture.courseId).then((group) => {
          const scaleQuestion = fixture.questions.find((q) => q.type === 'scale')!;
          const baseBody = {
            roundId: fixture.roundId,
            groupId: group.id,
            evaluateeId: student.user.id,
          };

          cy.request({
            method: 'POST',
            url: `${BACKEND_URL}/answers`,
            headers: authHeader(student.token),
            body: { ...baseBody, answers: [{ questionId: scaleQuestion.id, scoreValue: 3 }] },
          }).then((res) => {
            expect(res.status).to.eq(200);
          });

          return cy
            .request({
              method: 'POST',
              url: `${BACKEND_URL}/answers`,
              headers: authHeader(student.token),
              body: { ...baseBody, answers: [{ questionId: scaleQuestion.id, scoreValue: 5 }] },
            })
            .then((res) => {
              expect(res.status).to.eq(200);
              expect(res.body.data[0].scoreValue).to.eq(5);
            });
        }),
      ),
    );
  });
});

describe('API — Access control', () => {
  it('นักศึกษาดึงคำถามของรอบที่ยังไม่เปิด → 403', () => {
    setupClosedRound().then((fixture) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
        cy
          .request({
            url: `${BACKEND_URL}/rounds/${fixture.roundId}/questions`,
            headers: authHeader(student.token),
            failOnStatusCode: false,
          })
          .then((res) => {
            expect(res.status).to.eq(403);
          }),
      ),
    );
  });

  it('นักศึกษาดึงคำถามของรอบที่เปิดอยู่ → 200 (gate ไม่บล็อกเกิน)', () => {
    setupOpenRound().then((fixture) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
        cy
          .request({
            url: `${BACKEND_URL}/rounds/${fixture.roundId}/questions`,
            headers: authHeader(student.token),
          })
          .then((res) => {
            expect(res.status).to.eq(200);
            expect(res.body.data).to.have.length(2);
          }),
      ),
    );
  });

  it('GET /rounds — นักศึกษาเห็นเฉพาะรอบที่เปิด, อาจารย์เห็นทั้งหมด', () => {
    setupClosedRound().then((closed) =>
      apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then(
        (student) => {
          // นักศึกษา: ทุกรอบที่เห็นต้อง isOpen และต้องไม่มีรอบปิดที่เพิ่งสร้าง
          cy
            .request({
              url: `${BACKEND_URL}/rounds?courseId=${closed.courseId}`,
              headers: authHeader(student.token),
            })
            .then((res) => {
              const rounds = res.body.data as { id: string; isOpen: boolean }[];
              expect(
                rounds.every((r) => r.isOpen),
                "ทุกรอบที่นักศึกษาเห็นต้องเปิด"
              ).to.be.true;
              expect(rounds.map((r) => r.id)).to.not.include(closed.roundId);
            });
          // อาจารย์: ต้องเห็นรอบปิดด้วย
          return cy
            .request({
              url: `${BACKEND_URL}/rounds?courseId=${closed.courseId}`,
              headers: authHeader(closed.instructorToken),
            })
            .then((res) => {
              const ids = (res.body.data as { id: string }[]).map((r) => r.id);
              expect(ids, "อาจารย์ต้องเห็นรอบปิดด้วย").to.include(closed.roundId);
            });
        }
      )
    );
  });
});

describe('API — Psychological Safety', () => {
  it('GET /feedback/me คืนเฉพาะ summary ที่ isPublished = true', () => {
    const publishedSummary = `PUBLISHED ${Date.now()}`;
    const draftSummary = `DRAFT-SHOULD-NOT-LEAK ${Date.now()}`;

    apiLogin(CREDENTIALS.student1.username, CREDENTIALS.student1.password).then((student) =>
      setupOpenRound().then((publishedFixture) =>
        cy
          .request({
            method: 'POST',
            url: `${BACKEND_URL}/feedback`,
            headers: authHeader(publishedFixture.instructorToken),
            body: {
              roundId: publishedFixture.roundId,
              studentId: student.user.id,
              summary: publishedSummary,
              isPublished: true,
            },
          })
          .then(() =>
            setupOpenRound().then((draftFixture) =>
              cy
                .request({
                  method: 'POST',
                  url: `${BACKEND_URL}/feedback`,
                  headers: authHeader(draftFixture.instructorToken),
                  body: {
                    roundId: draftFixture.roundId,
                    studentId: student.user.id,
                    summary: draftSummary,
                    isPublished: false,
                  },
                })
                .then(() =>
                  cy
                    .request({ url: `${BACKEND_URL}/feedback/me`, headers: authHeader(student.token) })
                    .then((res) => {
                      expect(res.status).to.eq(200);
                      const summaries: string[] = (res.body.data as { summary: string }[]).map(
                        (f) => f.summary,
                      );
                      expect(summaries).to.include(publishedSummary);
                      expect(summaries).to.not.include(draftSummary);
                    }),
                ),
            ),
          ),
      ),
    );
  });
});
