import "server-only";
import { sql, getPool } from "./pool";
import type { LocalUser, LocalUserDetail, LocalUserProfile, LocalUserStore } from "@/lib/auth/local-store";
import { ROLES, type Role } from "@/lib/auth/types";

type Row = {
  id: string; employee_code: string; full_name: string; nickname: string | null; email: string | null; department: string | null;
  pin_hash: string | null; is_active: boolean; locked: number; must_change: boolean;
  last_login_at: Date | null; created_at: Date; updated_at: Date; roles: string | null;
};

const SELECT = `
  SELECT CAST(u.id AS VARCHAR(20)) AS id, u.employee_code, u.full_name, u.nickname, u.email, u.department, u.pin_hash, u.is_active,
         CASE WHEN u.pin_locked_at IS NULL THEN 0 ELSE 1 END AS locked, u.pin_must_change AS must_change,
         u.last_login_at, u.created_at, u.updated_at,
         (SELECT STRING_AGG(r.role, ',') FROM dbo.user_roles r WHERE r.user_id = u.id) AS roles
  FROM dbo.users u`;

const known = new Set<string>(ROLES);
const rolesOf = (row: Row): Role[] => (row.roles ?? "").split(",").filter((role): role is Role => known.has(role));

/** Login view. A LOCAL account without a PIN can't sign in, so it counts as absent. */
function toLogin(row: Row | undefined): LocalUser | null {
  if (!row || !row.pin_hash) return null;
  return { id: row.id, employeeCode: row.employee_code, fullName: row.full_name, pinHash: row.pin_hash, isActive: Boolean(row.is_active), pinLocked: row.locked === 1, mustChangePin: Boolean(row.must_change), roles: rolesOf(row) };
}

function toDetail(row: Row): LocalUserDetail {
  return {
    id: row.id, employeeCode: row.employee_code, fullName: row.full_name, nickname: row.nickname, email: row.email, department: row.department,
    isActive: Boolean(row.is_active), pinLocked: row.locked === 1, mustChangePin: Boolean(row.must_change), hasPin: Boolean(row.pin_hash),
    roles: rolesOf(row), lastLoginAt: row.last_login_at, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const idOf = (value: string) => {
  if (!/^\d{1,18}$/.test(value)) throw new Error("Invalid user id");
  return value;
};

const isNumericId = (value: string) => /^\d{1,18}$/.test(value);

/** SQL Server store for field users (db/003_local_users.sql). Only `source = 'LOCAL'` rows. UNVERIFIED against a live server. */
export function createSqlLocalStore(): LocalUserStore {
  const one = async (where: string, bind: (r: sql.Request) => sql.Request) => {
    const pool = await getPool();
    const result = await bind(pool.request()).query<Row>(`${SELECT} WHERE u.source = 'LOCAL' AND ${where}`);
    return result.recordset[0];
  };
  const exec = async (query: string, bind: (r: sql.Request) => sql.Request) => {
    const pool = await getPool();
    await bind(pool.request()).query(query);
  };
  const stamp = "updated_at = SYSUTCDATETIME(), updated_by = @by";

  /**
   * Who did it, as a `users.id` for created_by/updated_by. A field user's session id already is one;
   * an office (central) user's session id is their employee code, so look up the row synced at login.
   * No row (e.g. the database was down at their login) → null, which the columns allow.
   */
  async function resolveBy(by: string): Promise<string | null> {
    if (isNumericId(by)) return by;
    const pool = await getPool();
    const result = await pool.request().input("code", sql.NVarChar(32), by.trim()).query<{ id: string }>(
      "SELECT CAST(id AS VARCHAR(20)) AS id FROM dbo.users WHERE employee_code = @code",
    );
    return result.recordset[0]?.id ?? null;
  }

  async function writeRoles(tx: InstanceType<typeof sql.Transaction>, userId: string, roles: Role[]) {
    await new sql.Request(tx).input("user_id", sql.BigInt, userId).query("DELETE FROM dbo.user_roles WHERE user_id = @user_id");
    for (const role of new Set(roles)) {
      await new sql.Request(tx).input("user_id", sql.BigInt, userId).input("role", sql.VarChar(16), role).query("INSERT INTO dbo.user_roles (user_id, role) VALUES (@user_id, @role)");
    }
  }

  return {
    async findByCode(code) {
      return toLogin(await one("u.employee_code = @code", (r) => r.input("code", sql.NVarChar(32), code.trim())));
    },
    async findById(id) {
      if (!/^\d{1,18}$/.test(id)) return null;
      return toLogin(await one("u.id = @id", (r) => r.input("id", sql.BigInt, id)));
    },
    lockPin: (id) => exec("UPDATE dbo.users SET pin_locked_at = SYSUTCDATETIME(), updated_at = SYSUTCDATETIME() WHERE id = @id AND source = 'LOCAL'", (r) => r.input("id", sql.BigInt, idOf(id))),
    touchLogin: (id) => exec("UPDATE dbo.users SET last_login_at = SYSUTCDATETIME() WHERE id = @id AND source = 'LOCAL'", (r) => r.input("id", sql.BigInt, idOf(id))),

    async list() {
      const pool = await getPool();
      const result = await pool.request().query<Row>(`${SELECT} WHERE u.source = 'LOCAL' ORDER BY u.employee_code`);
      return result.recordset.map(toDetail);
    },

    async findDetailById(id) {
      if (!isNumericId(id)) return null;
      const row = await one("u.id = @id", (r) => r.input("id", sql.BigInt, id));
      return row ? toDetail(row) : null;
    },

    async create(input) {
      const byId = await resolveBy(input.createdBy);
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        // UPDLOCK + HOLDLOCK serialises concurrent creates so two Admins can't get the same code.
        const next = await new sql.Request(tx).query<{ n: number }>(
          "SELECT ISNULL(MAX(CAST(SUBSTRING(employee_code, 2, 20) AS INT)), 0) + 1 AS n FROM dbo.users WITH (UPDLOCK, HOLDLOCK) WHERE source = 'LOCAL'",
        );
        const code = `F${String(next.recordset[0].n).padStart(4, "0")}`;
        const created = await new sql.Request(tx)
          .input("code", sql.NVarChar(32), code).input("name", sql.NVarChar(200), input.fullName).input("nick", sql.NVarChar(100), input.nickname)
          .input("email", sql.NVarChar(256), input.email).input("dept", sql.NVarChar(100), input.department).input("pin", sql.NVarChar(200), input.pinHash)
          .input("must", sql.Bit, input.mustChangePin).input("by", sql.BigInt, byId)
          .query<{ id: string }>(`INSERT INTO dbo.users (employee_code, source, full_name, nickname, email, department, pin_hash, pin_set_at, pin_must_change, created_by, updated_by)
            OUTPUT CAST(inserted.id AS VARCHAR(20)) AS id
            VALUES (@code, 'LOCAL', @name, @nick, @email, @dept, @pin, SYSUTCDATETIME(), @must, @by, @by)`);
        const id = created.recordset[0].id;
        await writeRoles(tx, id, input.roles);
        await tx.commit();
        const row = await one("u.id = @id", (r) => r.input("id", sql.BigInt, id));
        return toDetail(row);
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    },

    async updateProfile(id: string, p: LocalUserProfile, by: string) {
      const byId = await resolveBy(by);
      await exec(`UPDATE dbo.users SET full_name = @name, nickname = @nick, email = @email, department = @dept, ${stamp} WHERE id = @id AND source = 'LOCAL'`, (r) =>
        r.input("id", sql.BigInt, idOf(id)).input("name", sql.NVarChar(200), p.fullName).input("nick", sql.NVarChar(100), p.nickname)
          .input("email", sql.NVarChar(256), p.email).input("dept", sql.NVarChar(100), p.department).input("by", sql.BigInt, byId));
    },

    async setRoles(id, roles, by) {
      const byId = await resolveBy(by);
      const pool = await getPool();
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        await writeRoles(tx, idOf(id), roles);
        await new sql.Request(tx).input("id", sql.BigInt, idOf(id)).input("by", sql.BigInt, byId).query(`UPDATE dbo.users SET ${stamp} WHERE id = @id AND source = 'LOCAL'`);
        await tx.commit();
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw error;
      }
    },

    async setPin(id, pinHash, { mustChange, by }) {
      const byId = await resolveBy(by);
      await exec(`UPDATE dbo.users SET pin_hash = @pin, pin_set_at = SYSUTCDATETIME(), pin_locked_at = NULL, pin_must_change = @must, ${stamp} WHERE id = @id AND source = 'LOCAL'`, (r) =>
        r.input("id", sql.BigInt, idOf(id)).input("pin", sql.NVarChar(200), pinHash).input("must", sql.Bit, mustChange).input("by", sql.BigInt, byId));
    },

    async unlockPin(id, by) {
      const byId = await resolveBy(by);
      await exec(`UPDATE dbo.users SET pin_locked_at = NULL, ${stamp} WHERE id = @id AND source = 'LOCAL'`, (r) => r.input("id", sql.BigInt, idOf(id)).input("by", sql.BigInt, byId));
    },

    async setActive(id, active, by) {
      const byId = await resolveBy(by);
      await exec(`UPDATE dbo.users SET is_active = @active, ${stamp} WHERE id = @id AND source = 'LOCAL'`, (r) => r.input("id", sql.BigInt, idOf(id)).input("active", sql.Bit, active).input("by", sql.BigInt, byId));
    },
  };
}
