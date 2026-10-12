import { defineConfig } from "cypress";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

dotenv.config();

// ค่าลับ (JWT_SECRET, รหัสฐานข้อมูล) อ่านจาก .env ของ Backend ตรงๆ — ไม่คัดลอกมาไว้ที่นี่ และไม่ส่งเข้า browser
const BACKEND_DIR = path.resolve(process.env.BACKEND_DIR ?? "../Backend");
const backendEnv = dotenv.parse(readFileSync(path.join(BACKEND_DIR, ".env")));

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

let sql: ReturnType<typeof postgres> | undefined;
function db() {
  const e = backendEnv;
  sql ??= postgres(
    `postgres://${e.POSTGRES_APP_USER}:${e.POSTGRES_APP_PASSWORD}@${e.POSTGRES_HOST}:${e.POSTGRES_PORT}/${e.POSTGRES_DB}`
  );
  return sql;
}

export default defineConfig({
  allowCypressEnv: false,
  expose: {
    FRONTEND_URL: process.env.FRONTEND_URL,
    BACKEND_URL: process.env.BACKEND_URL,
  },
  e2e: {
    baseUrl: process.env.FRONTEND_URL,
    // กว้างพอให้เห็นเมนูซ้ายและแถบขั้นตอนของฟอร์มประเมิน (แสดงตั้งแต่ 1100px)
    viewportWidth: 1280,
    viewportHeight: 800,
    setupNodeEvents(on) {
      on("task", {
        // ล้างฐานข้อมูลแล้วสร้างข้อมูลตัวอย่างใหม่ — ทุก spec เริ่มจากสถานะเดียวกัน
        resetDb() {
          if (!LOCAL_HOSTS.includes(backendEnv.POSTGRES_HOST))
            throw new Error(`ไม่ล้างฐานข้อมูลที่ไม่ใช่เครื่องตัวเอง (POSTGRES_HOST=${backendEnv.POSTGRES_HOST})`);
          // Cypress ตั้งตัวแปรของ TypeScript loader ชี้มาที่ tsconfig ของโปรเจกต์นี้ — ส่งต่อไปแล้ว tsx ของ Backend จะหา @db/* ไม่เจอ
          const env = Object.fromEntries(
            Object.entries(process.env).filter(([key]) => !/^(TSX_|TS_NODE_|NODE_OPTIONS$)/.test(key))
          );
          execSync("pnpm run db:prototype", { cwd: BACKEND_DIR, stdio: "pipe", env });
          return null;
        },
        // เข้าสู่ระบบจริงต้องผ่าน CMU OAuth ซึ่งเทสต์ทำแทนไม่ได้ จึงออก token แบบเดียวกับที่ /auth/callback ออกให้
        async sessionToken(cmuAccount: string) {
          const [user] = await db()`select id from users where cmu_account = ${cmuAccount}`;
          if (!user) throw new Error(`ไม่พบบัญชี ${cmuAccount} ในฐานข้อมูล`);
          return jwt.sign({ userId: user.id }, backendEnv.JWT_SECRET, { expiresIn: "1h" });
        },
      });
    },
  },
});
