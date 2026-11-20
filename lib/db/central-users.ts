import "server-only";
import { sql, getPool } from "./pool";
import { knownProgramRole, knownRoles } from "@/lib/auth/roles";
import type { ProgramRole, Role } from "@/lib/auth/types";

export type CentralUserItem = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  department: string | null;
  /** Coarse permission level synced from Datacenter ProgramPermission (`USER` | `ADMIN` | `DEV`). */
  programRole: ProgramRole | null;
  /** QCheck granular sub-roles assigned inside the app (`dbo.user_roles`). */
  roles: Role[];
  isActive: boolean;
  lastLoginAt: string | null;
  updatedAt: string;
};

export type CentralUsersPayload = {
  users: CentralUserItem[];
};

export type DatacenterEmployeeMatch = {
  employeeCode: string;
  fullName: string;
  email: string | null;
  jobTitle: string | null;
  hasProgramPermission: boolean;
  canUse: boolean;
  programRole: ProgramRole | null;
  qcheckUserId: string | null;
  roles: Role[];
};

export type DatacenterEmployeesPayload = {
  employees: DatacenterEmployeeMatch[];
};

const SAFE_IDENT = /^[A-Za-z0-9_]+$/;

function dataCenterDb(): string {
  const name = process.env.DATA_CENTER_DB?.trim() || "DATA_CENTER";
  if (!SAFE_IDENT.test(name)) {
    throw new Error("Invalid DATA_CENTER_DB identifier");
  }
  return `[${name}]`;
}

export function qcheckProgramId(): number {
  const raw = process.env.PROGRAM_ID?.trim();
  const id = raw ? Number(raw) : 3;
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid PROGRAM_ID configuration");
  }
  return id;
}

const DC_ROLE_LABEL: Record<ProgramRole, string> = {
  USER: "User",
  ADMIN: "Admin",
  DEV: "Dev",
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildFullName(firstName: string | null | undefined, lastName: string | null | undefined, fallbackCode: string): string {
  const full = [clean(firstName), clean(lastName)].filter(Boolean).join(" ").trim();
  return (full || fallbackCode).slice(0, 200);
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_\[]/g, (ch) => `\\${ch}`);
}

/** Lists all CENTRAL users with their ProgramPermission level and QCheck sub-roles. */
export async function listCentralUsers(): Promise<CentralUsersPayload> {
  const pool = await getPool();
  const res = await pool.request().query<{
    id: string;
    employee_code: string;
    full_name: string;
    email: string | null;
    department: string | null;
    program_role: string | null;
    is_active: boolean;
    last_login_at: Date | null;
    updated_at: Date;
    roles_csv: string | null;
  }>(`
    SELECT
      CAST(u.id AS VARCHAR(20)) AS id,
      u.employee_code,
      u.full_name,
      u.email,
      u.department,
      u.program_role,
      u.is_active,
      u.last_login_at,
      u.updated_at,
      (SELECT STRING_AGG(r.role, ',') FROM dbo.user_roles r WHERE r.user_id = u.id) AS roles_csv
    FROM dbo.users u
    WHERE u.source = 'CENTRAL'
    ORDER BY
      CASE u.program_role WHEN 'DEV' THEN 0 WHEN 'ADMIN' THEN 1 WHEN 'USER' THEN 2 ELSE 3 END,
      CASE WHEN NOT EXISTS (SELECT 1 FROM dbo.user_roles r WHERE r.user_id = u.id) AND ISNULL(u.program_role, 'USER') <> 'DEV' THEN 0 ELSE 1 END,
      u.employee_code ASC
  `);

  const users: CentralUserItem[] = res.recordset.map((row) => ({
    id: row.id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    email: row.email,
    department: row.department,
    programRole: knownProgramRole(row.program_role) ?? null,
    roles: row.roles_csv ? knownRoles(row.roles_csv.split(",")) : [],
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at ? row.last_login_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
  }));

  return { users };
}

/**
 * Searches `[DATA_CENTER].[dbo].[Employee]` (never selecting `PasswordHash`) by employee code,
 * name, or email, along with any existing `ProgramPermission` (ProgramID = 3) and QCheck sub-roles.
 */
export async function searchDatacenterEmployees(query: string, limit = 15): Promise<DatacenterEmployeesPayload> {
  const trimmed = query.trim();
  if (!trimmed) return { employees: [] };

  const dc = dataCenterDb();
  const programId = qcheckProgramId();
  const safeLimit = Math.max(1, Math.min(30, Math.floor(limit)));
  const like = `%${escapeLike(trimmed)}%`;
  const prefix = `${escapeLike(trimmed)}%`;

  const pool = await getPool();
  const res = await pool
    .request()
    .input("program_id", sql.Int, programId)
    .input("exact", sql.NVarChar(100), trimmed)
    .input("prefix", sql.NVarChar(120), prefix)
    .input("like", sql.NVarChar(120), like)
    .input("limit", sql.Int, safeLimit)
    .query<{
      employee_no: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      job_title: string | null;
      pp_exists: number;
      pp_can_use: boolean | null;
      pp_role: string | null;
      qcheck_user_id: string | null;
      roles_csv: string | null;
    }>(`
      SELECT TOP (@limit)
        e.[No] AS employee_no,
        e.First_Name AS first_name,
        e.Last_Name AS last_name,
        e.E_Mail AS email,
        e.Job_Title AS job_title,
        CASE WHEN pp.EmployeeID IS NOT NULL THEN 1 ELSE 0 END AS pp_exists,
        pp.CanUse AS pp_can_use,
        pp.[Role] AS pp_role,
        CAST(u.id AS VARCHAR(20)) AS qcheck_user_id,
        (SELECT STRING_AGG(r.role, ',') FROM dbo.user_roles r WHERE r.user_id = u.id) AS roles_csv
      FROM ${dc}.[dbo].[Employee] e
      LEFT JOIN ${dc}.[dbo].[ProgramPermission] pp
        ON pp.EmployeeID = e.[No] AND pp.ProgramID = @program_id
      LEFT JOIN dbo.users u
        ON u.employee_code = e.[No] COLLATE DATABASE_DEFAULT AND u.source = 'CENTRAL'
      WHERE
        e.[No] LIKE @like ESCAPE '\\'
        OR e.First_Name LIKE @like ESCAPE '\\'
        OR e.Last_Name LIKE @like ESCAPE '\\'
        OR (ISNULL(e.First_Name, '') + ' ' + ISNULL(e.Last_Name, '')) LIKE @like ESCAPE '\\'
        OR e.E_Mail LIKE @like ESCAPE '\\'
      ORDER BY
        CASE
          WHEN e.[No] = @exact THEN 0
          WHEN e.[No] LIKE @prefix ESCAPE '\\' THEN 1
          ELSE 2
        END,
        e.[No] ASC
    `);

  const employees: DatacenterEmployeeMatch[] = res.recordset.map((row) => ({
    employeeCode: row.employee_no.trim(),
    fullName: buildFullName(row.first_name, row.last_name, row.employee_no.trim()),
    email: clean(row.email),
    jobTitle: clean(row.job_title),
    hasProgramPermission: row.pp_exists === 1,
    canUse: Boolean(row.pp_can_use),
    programRole: knownProgramRole(row.pp_role) ?? null,
    qcheckUserId: row.qcheck_user_id,
    roles: row.roles_csv ? knownRoles(row.roles_csv.split(",")) : [],
  }));

  return { employees };
}

export type GrantCentralUserResult =
  | {
      ok: true;
      created: boolean;
      user: { id: string; employeeCode: string; fullName: string };
      before: { programRole: ProgramRole | null; roles: Role[] };
      after: { programRole: ProgramRole; roles: Role[] };
    }
  | { ok: false; error: "employee_not_found" | "code_too_long" };

/**
 * Grants a DATA_CENTER employee access to QCheck in one transaction:
 * 1. Looks up employee in `[DATA_CENTER].[dbo].[Employee]` (never reads `PasswordHash`).
 * 2. Upserts `[DATA_CENTER].[dbo].[ProgramPermission]` for `ProgramID = 3` (`CanUse = 1`, `Role = User/Admin/Dev`).
 * 3. Upserts `[QCheck].[dbo].[users]` (`source = 'CENTRAL'`, `program_role`).
 * 4. Replaces `[QCheck].[dbo].[user_roles]` with the selected QCheck sub-roles.
 */
export async function grantCentralUserAccess(input: {
  employeeCode: string;
  programRole: ProgramRole;
  roles: readonly Role[];
  actorId: string | null;
}): Promise<GrantCentralUserResult> {
  const code = input.employeeCode.trim();
  if (!code) return { ok: false, error: "employee_not_found" };

  const dc = dataCenterDb();
  const programId = qcheckProgramId();
  const canonicalRoles = knownRoles([...input.roles]);
  const dcRoleLabel = DC_ROLE_LABEL[input.programRole];
  const actorNumericId = input.actorId && /^\d+$/.test(input.actorId) ? Number(input.actorId) : null;

  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    // 1. Verify employee exists in DATA_CENTER.dbo.Employee
    const empRes = await new sql.Request(tx)
      .input("no", sql.VarChar(50), code)
      .query<{
        employee_no: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        job_title: string | null;
      }>(`
        SELECT [No] AS employee_no, First_Name AS first_name, Last_Name AS last_name, E_Mail AS email, Job_Title AS job_title
        FROM ${dc}.[dbo].[Employee]
        WHERE [No] = @no
      `);

    if (empRes.recordset.length === 0) {
      await tx.rollback();
      return { ok: false, error: "employee_not_found" };
    }

    const emp = empRes.recordset[0];
    const employeeCode = emp.employee_no.trim();
    if (employeeCode.length > 32) {
      await tx.rollback();
      return { ok: false, error: "code_too_long" };
    }

    const fullName = buildFullName(emp.first_name, emp.last_name, employeeCode);
    const email = clean(emp.email)?.slice(0, 256) ?? null;
    const department = clean(emp.job_title)?.slice(0, 100) ?? null;

    // Snapshot previous ProgramPermission (if any) for audit
    const prevPpRes = await new sql.Request(tx)
      .input("employee_id", sql.VarChar(50), emp.employee_no)
      .input("program_id", sql.Int, programId)
      .query<{ role: string | null }>(
        `SELECT [Role] AS role FROM ${dc}.[dbo].[ProgramPermission] WHERE EmployeeID = @employee_id AND ProgramID = @program_id`,
      );
    const prevProgramRole = prevPpRes.recordset.length > 0 ? (knownProgramRole(prevPpRes.recordset[0].role) ?? null) : null;
    const hadPermission = prevPpRes.recordset.length > 0;

    // 2. Upsert DATA_CENTER.dbo.ProgramPermission (ProgramID = 3)
    await new sql.Request(tx)
      .input("employee_id", sql.VarChar(50), emp.employee_no)
      .input("program_id", sql.Int, programId)
      .input("dc_role", sql.VarChar(255), dcRoleLabel)
      .query(`
        IF EXISTS (
          SELECT 1 FROM ${dc}.[dbo].[ProgramPermission] WITH (UPDLOCK, HOLDLOCK)
          WHERE EmployeeID = @employee_id AND ProgramID = @program_id
        )
        BEGIN
          UPDATE ${dc}.[dbo].[ProgramPermission]
          SET CanUse = 1, [Role] = @dc_role, GrantedAt = GETDATE()
          WHERE EmployeeID = @employee_id AND ProgramID = @program_id;
        END
        ELSE
        BEGIN
          INSERT INTO ${dc}.[dbo].[ProgramPermission] (EmployeeID, ProgramID, CanUse, GrantedAt, [Role])
          VALUES (@employee_id, @program_id, 1, GETDATE(), @dc_role);
        END
      `);

    // 3. Upsert QCheck.dbo.users
    const upsertUser = await new sql.Request(tx)
      .input("employee_code", sql.NVarChar(32), employeeCode)
      .input("full_name", sql.NVarChar(200), fullName)
      .input("department", sql.NVarChar(100), department)
      .input("email", sql.NVarChar(256), email)
      .input("program_role", sql.VarChar(16), input.programRole)
      .input("actor_id", sql.BigInt, actorNumericId)
      .query<{ id: string; was_inserted: number }>(`
        MERGE dbo.users WITH (HOLDLOCK) AS t
        USING (SELECT @employee_code AS employee_code) AS s ON t.employee_code = s.employee_code
        WHEN MATCHED THEN UPDATE SET
          full_name = @full_name,
          department = COALESCE(@department, t.department),
          email = COALESCE(@email, t.email),
          program_role = @program_role,
          is_active = 1,
          roles_synced_at = SYSUTCDATETIME(),
          updated_at = SYSUTCDATETIME(),
          updated_by = @actor_id
        WHEN NOT MATCHED THEN INSERT (employee_code, source, full_name, department, email, program_role, is_active, roles_synced_at, created_by, updated_by)
          VALUES (@employee_code, 'CENTRAL', @full_name, @department, @email, @program_role, 1, SYSUTCDATETIME(), @actor_id, @actor_id)
        OUTPUT CAST(inserted.id AS VARCHAR(20)) AS id, CASE WHEN $action = 'INSERT' THEN 1 ELSE 0 END AS was_inserted;
      `);

    const userId = upsertUser.recordset[0].id;
    const wasCreated = !hadPermission || upsertUser.recordset[0].was_inserted === 1;

    // 4. Snapshot previous QCheck sub-roles & replace dbo.user_roles
    const beforeRolesRes = await new sql.Request(tx)
      .input("user_id", sql.BigInt, userId)
      .query<{ role: string }>("SELECT role FROM dbo.user_roles WHERE user_id = @user_id");
    const beforeRoles = knownRoles(beforeRolesRes.recordset.map((r) => r.role));

    await new sql.Request(tx)
      .input("user_id", sql.BigInt, userId)
      .query("DELETE FROM dbo.user_roles WHERE user_id = @user_id");

    for (const role of canonicalRoles) {
      await new sql.Request(tx)
        .input("user_id", sql.BigInt, userId)
        .input("role", sql.VarChar(16), role)
        .query("INSERT INTO dbo.user_roles (user_id, role) VALUES (@user_id, @role)");
    }

    await tx.commit();
    return {
      ok: true,
      created: wasCreated,
      user: { id: userId, employeeCode, fullName },
      before: { programRole: prevProgramRole, roles: beforeRoles },
      after: { programRole: input.programRole, roles: canonicalRoles },
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}

export type UpdateCentralUserRolesResult =
  | {
      ok: true;
      user: { id: string; employeeCode: string; fullName: string };
      before: Role[];
      after: Role[];
      beforeProgramRole: ProgramRole | null;
      afterProgramRole: ProgramRole | null;
    }
  | { ok: false; error: "not_found" | "forbidden_dev" };

/**
 * Replaces QCheck sub-roles (`dbo.user_roles`) for a CENTRAL user in a single transaction.
 * When `nextProgramRole` is also supplied, updates `[DATA_CENTER].[dbo].[ProgramPermission]`
 * (ProgramID = 3) and `dbo.users.program_role` in the same transaction.
 */
export async function updateCentralUserRoles(
  userId: string,
  nextRoles: readonly Role[],
  actorId: string | null,
  options?: { nextProgramRole?: ProgramRole; actorCanGrantDev?: boolean },
): Promise<UpdateCentralUserRolesResult> {
  const numericId = Number(userId);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return { ok: false, error: "not_found" };
  }

  const canonical = knownRoles([...nextRoles]);
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const existing = await new sql.Request(tx)
      .input("id", sql.BigInt, numericId)
      .query<{ id: string; employee_code: string; full_name: string; program_role: string | null }>(
        "SELECT CAST(id AS VARCHAR(20)) AS id, employee_code, full_name, program_role FROM dbo.users WHERE id = @id AND source = 'CENTRAL'",
      );

    if (existing.recordset.length === 0) {
      await tx.rollback();
      return { ok: false, error: "not_found" };
    }

    const row = existing.recordset[0];
    const beforeProgramRole = knownProgramRole(row.program_role) ?? null;
    const requestedProgramRole = options?.nextProgramRole;

    if (
      requestedProgramRole &&
      requestedProgramRole !== beforeProgramRole &&
      (requestedProgramRole === "DEV" || beforeProgramRole === "DEV") &&
      !options?.actorCanGrantDev
    ) {
      await tx.rollback();
      return { ok: false, error: "forbidden_dev" };
    }

    const beforeRes = await new sql.Request(tx)
      .input("user_id", sql.BigInt, numericId)
      .query<{ role: string }>("SELECT role FROM dbo.user_roles WHERE user_id = @user_id");
    const before = knownRoles(beforeRes.recordset.map((r) => r.role));

    await new sql.Request(tx)
      .input("user_id", sql.BigInt, numericId)
      .query("DELETE FROM dbo.user_roles WHERE user_id = @user_id");

    for (const role of canonical) {
      await new sql.Request(tx)
        .input("user_id", sql.BigInt, numericId)
        .input("role", sql.VarChar(16), role)
        .query("INSERT INTO dbo.user_roles (user_id, role) VALUES (@user_id, @role)");
    }

    const afterProgramRole = requestedProgramRole ?? beforeProgramRole;
    if (requestedProgramRole && requestedProgramRole !== beforeProgramRole) {
      const dc = dataCenterDb();
      const programId = qcheckProgramId();
      await new sql.Request(tx)
        .input("employee_id", sql.VarChar(50), row.employee_code)
        .input("program_id", sql.Int, programId)
        .input("dc_role", sql.VarChar(255), DC_ROLE_LABEL[requestedProgramRole])
        .query(`
          IF EXISTS (SELECT 1 FROM ${dc}.[dbo].[Employee] WHERE [No] = @employee_id)
          BEGIN
            IF EXISTS (
              SELECT 1 FROM ${dc}.[dbo].[ProgramPermission] WITH (UPDLOCK, HOLDLOCK)
              WHERE EmployeeID = @employee_id AND ProgramID = @program_id
            )
              UPDATE ${dc}.[dbo].[ProgramPermission]
              SET CanUse = 1, [Role] = @dc_role, GrantedAt = GETDATE()
              WHERE EmployeeID = @employee_id AND ProgramID = @program_id;
            ELSE
              INSERT INTO ${dc}.[dbo].[ProgramPermission] (EmployeeID, ProgramID, CanUse, GrantedAt, [Role])
              VALUES (@employee_id, @program_id, 1, GETDATE(), @dc_role);
          END
        `);
    }

    const actorNumericId = actorId && /^\d+$/.test(actorId) ? Number(actorId) : null;
    await new sql.Request(tx)
      .input("id", sql.BigInt, numericId)
      .input("program_role", sql.VarChar(16), afterProgramRole)
      .input("updated_by", sql.BigInt, actorNumericId)
      .query("UPDATE dbo.users SET program_role = @program_role, updated_at = SYSUTCDATETIME(), updated_by = @updated_by WHERE id = @id");

    await tx.commit();
    return {
      ok: true,
      user: { id: row.id, employeeCode: row.employee_code, fullName: row.full_name },
      before,
      after: canonical,
      beforeProgramRole,
      afterProgramRole,
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}
