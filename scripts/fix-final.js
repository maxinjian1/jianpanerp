const bcrypt = require("bcryptjs");
const { Client } = require("pg");
const client = new Client({ connectionString: "postgresql://japan-erp:japan-erp-password@localhost:5432/japan-erp" });

async function run() {
  await client.connect();
  try {
    console.log("🛠️ Starting repairs...");

    // 1. 创建缺失的 Schema (关键！)
    await client.query(`CREATE SCHEMA IF NOT EXISTS "tenant_admin"`);
    console.log("✅ Schema 'tenant_admin' created");

    // 2. 清理旧数据
    try { await client.query(`TRUNCATE TABLE "User", "Tenant" CASCADE`); } catch(e) {}

    // 3. 重新插入管理员公司
    const hash = await bcrypt.hash("admin123456", 10);
    await client.query(`
      INSERT INTO "Tenant" (id, name, domain, "schemaName", "subscriptionPlan", status, "createdAt", "updatedAt", settings)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)`,
      ["admin-tenant", "Admin Corp", "admin", "tenant_admin", "ENTERPRISE", "ACTIVE", "{}"]
    );
    console.log("✅ Tenant 'Admin Corp' created");

    // 4. 重新插入管理员用户
    await client.query(`
      INSERT INTO "User" (id, email, "passwordHash", name, role, "tenantId", "createdAt", "updatedAt", permissions)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7)`,
      ["admin-user", "admin@japan-erp.com", hash, "Super Admin", "ADMIN", "admin-tenant", "[]"]
    );
    console.log("✅ User 'admin@japan-erp.com' created");

  } catch (e) {
    console.error("❌ Error:", e);
  } finally {
    await client.end();
  }
}
run();
