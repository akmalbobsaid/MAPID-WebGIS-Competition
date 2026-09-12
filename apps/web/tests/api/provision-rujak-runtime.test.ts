import { describe, expect, it, vi } from "vitest";

import { provisionRuntimeRole } from "../../../../scripts/database/provision-rujak-runtime.mjs";

const connectionString = "postgresql://admin@localhost:5432/postgres?sslmode=verify-full";
const runtimePassword = "test-only-runtime-password";

function safeRoleAttributes() {
  return {
    rolcanlogin: true,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
  };
}

function fakePool(roleExists: boolean, alterationFailure?: Error) {
  const client = {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("SELECT EXISTS")) return { rows: [{ role_exists: roleExists }], rowCount: 1 };
      if (sql.includes("pg_auth_members")) return { rows: [], rowCount: 0 };
      if (sql.includes("FROM pg_roles")) return { rows: [safeRoleAttributes()], rowCount: 1 };
      if (sql.includes("ALTER ROLE") && alterationFailure) throw alterationFailure;
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = {
    connect: vi.fn(async () => client),
    end: vi.fn(async () => undefined),
  };
  class FakePool {
    constructor(options: unknown) {
      expect(options).toEqual({ connectionString, max: 1 });
      return pool;
    }
  }
  return { client, pool, FakePool };
}

describe("PHASE-05 runtime-role provisioning", () => {
  it("creates an absent role with only LOGIN and a parameterized password", async () => {
    const { client, pool, FakePool } = fakePool(false);

    await provisionRuntimeRole({ connectionString, runtimePassword, PoolConstructor: FakePool });

    expect(client.query).toHaveBeenCalledWith(
      "SELECT set_config('rujak.runtime_password', $1, true)",
      [runtimePassword],
    );
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("CREATE ROLE rujak_runtime WITH LOGIN PASSWORD"))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("ALTER ROLE"))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("updates only LOGIN and password when the role already exists", async () => {
    const { client, FakePool } = fakePool(true);

    await provisionRuntimeRole({ connectionString, runtimePassword, PoolConstructor: FakePool });

    const alter = client.query.mock.calls.find(([sql]) => String(sql).includes("ALTER ROLE"));
    expect(alter?.[0]).toContain("ALTER ROLE rujak_runtime WITH LOGIN PASSWORD");
    expect(alter?.[0]).not.toContain("NOBYPASSRLS");
    expect(alter?.[0]).not.toContain("NOREPLICATION");
  });

  it("reports an existing-role alteration failure without masking it and closes connections", async () => {
    const { client, pool, FakePool } = fakePool(true, new Error("permission denied to alter role"));

    try {
      await provisionRuntimeRole({ connectionString, runtimePassword, PoolConstructor: FakePool });
      throw new Error("Expected provisioning to fail.");
    } catch (error) {
      expect(error).toMatchObject({
        message: "rujak_runtime provisioning failed during existing-role login password update.",
        cause: expect.objectContaining({ message: "permission denied to alter role" }),
      });
    }

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });
});
