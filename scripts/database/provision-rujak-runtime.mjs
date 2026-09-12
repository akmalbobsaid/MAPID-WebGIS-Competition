import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const requireFromWeb = createRequire(path.join(ROOT, "apps", "web", "package.json"));
const { Pool } = requireFromWeb("pg");
const RUNTIME_ROLE = "rujak_runtime";

function required(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function provisioningError(operation, cause) {
  return new Error(`rujak_runtime provisioning failed during ${operation}.`, { cause });
}

export async function provisionRuntimeRole({ connectionString, runtimePassword, PoolConstructor = Pool }) {
  const pool = new PoolConstructor({ connectionString, max: 1 });
  let client;
  let transactionOpen = false;
  let operation = "admin database connection";

  try {
    client = await pool.connect();
    operation = "transaction start";
    await client.query("BEGIN");
    transactionOpen = true;

    operation = "role existence check";
    const role = await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS role_exists",
      [RUNTIME_ROLE],
    );
    const roleExists = role.rows[0]?.role_exists === true;

    operation = "role membership check";
    const memberships = await client.query(
      `SELECT granted.rolname
       FROM pg_auth_members AS membership
       JOIN pg_roles AS granted ON granted.oid = membership.roleid
       JOIN pg_roles AS member ON member.oid = membership.member
       WHERE member.rolname = $1`,
      [RUNTIME_ROLE],
    );
    if (memberships.rowCount !== 0) {
      throw new Error("rujak_runtime has unexpected role memberships.");
    }

    operation = "local runtime-password setup";
    await client.query("SELECT set_config('rujak.runtime_password', $1, true)", [runtimePassword]);

    if (roleExists) {
      operation = "existing-role login password update";
      await client.query(`
        DO $$
        BEGIN
          EXECUTE format(
            'ALTER ROLE rujak_runtime WITH LOGIN PASSWORD %L',
            current_setting('rujak.runtime_password', true)
          );
        END;
        $$;
      `);
    } else {
      operation = "runtime role creation";
      await client.query(`
        DO $$
        BEGIN
          EXECUTE format(
            'CREATE ROLE rujak_runtime WITH LOGIN PASSWORD %L',
            current_setting('rujak.runtime_password', true)
          );
        END;
        $$;
      `);
    }

    operation = "runtime role safety verification";
    const attributes = await client.query(
      `SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
       FROM pg_roles
       WHERE rolname = $1`,
      [RUNTIME_ROLE],
    );
    const runtimeRole = attributes.rows[0];
    if (!runtimeRole?.rolcanlogin
      || runtimeRole.rolsuper
      || runtimeRole.rolcreatedb
      || runtimeRole.rolcreaterole
      || runtimeRole.rolreplication
      || runtimeRole.rolbypassrls) {
      throw new Error("rujak_runtime does not meet the required minimal role contract.");
    }

    operation = "transaction commit";
    await client.query("COMMIT");
    transactionOpen = false;
  } catch (cause) {
    if (client && transactionOpen) {
      await client.query("ROLLBACK").catch(() => undefined);
    }
    throw provisioningError(operation, cause);
  } finally {
    try {
      client?.release();
    } finally {
      await pool.end();
    }
  }
}

async function main() {
  await provisionRuntimeRole({
    connectionString: required(process.env.DATABASE_URL_ADMIN, "DATABASE_URL_ADMIN"),
    runtimePassword: required(process.env.RUJAK_RUNTIME_DB_PASSWORD, "RUJAK_RUNTIME_DB_PASSWORD"),
  });
  console.log("rujak_runtime is provisioned with the required minimal role contract.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Runtime-role provisioning failed.");
    process.exitCode = 1;
  });
}
