import {
  countActiveAdmins,
  createUser,
  getUserById,
  listUsers,
  setUserPassword,
  toPublicUser,
  updateUser,
} from "@/lib/db";
import { MIN_PASSWORD_LENGTH, type Role } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

// Postgres unique_violation — the username is taken.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
}

function parseRole(value: unknown): Role | undefined {
  return value === "admin" || value === "rep" ? value : undefined;
}

// GET /api/users — admin only.
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const users = await listUsers();
    return Response.json(users.map(toPublicUser));
  } catch (err) {
    console.error("Users GET error:", err);
    return Response.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

// POST /api/users — create a rep with a temporary password.
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const username = String(body?.username ?? "").trim().toLowerCase();
    const displayName = String(body?.displayName ?? "").trim();
    const password = body?.password;
    const role = parseRole(body?.role) ?? "rep";

    if (!USERNAME_PATTERN.test(username)) {
      return Response.json(
        {
          error:
            "Username must be 3-32 characters, using letters, numbers, dot, dash or underscore.",
        },
        { status: 400 }
      );
    }
    if (!displayName) {
      return Response.json(
        { error: "Display name is required" },
        { status: 400 }
      );
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return Response.json(
        {
          error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters`,
        },
        { status: 400 }
      );
    }

    // createUser always sets must_change_password, so the temporary password
    // above is only ever used once.
    const user = await createUser({ username, displayName, password, role });
    return Response.json(toPublicUser(user));
  } catch (err) {
    if (isUniqueViolation(err)) {
      return Response.json(
        { error: "That username is already taken" },
        { status: 409 }
      );
    }
    console.error("Users POST error:", err);
    return Response.json({ error: "Failed to create user" }, { status: 500 });
  }
}

// PATCH /api/users — rename, change role, deactivate, or reset a password.
export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const me = auth.user;

    const body = await request.json();
    const id = String(body?.id ?? "");
    if (!id) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const target = await getUserById(id);
    if (!target) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const role = parseRole(body?.role);
    const isActive =
      typeof body?.isActive === "boolean" ? body.isActive : undefined;
    const displayName =
      typeof body?.displayName === "string" ? body.displayName : undefined;

    // Don't let an admin lock everyone out of /admin. Checked before anything
    // is written, so a rejected request changes nothing.
    const losesAdmin =
      target.role === "admin" &&
      ((role !== undefined && role !== "admin") || isActive === false);

    if (losesAdmin && (await countActiveAdmins()) <= 1) {
      return Response.json(
        { error: "This is the only active admin. Promote someone else first." },
        { status: 400 }
      );
    }

    if (target.id === me.id && isActive === false) {
      return Response.json(
        { error: "You can't deactivate your own account" },
        { status: 400 }
      );
    }

    if (typeof body?.password === "string") {
      if (body.password.length < MIN_PASSWORD_LENGTH) {
        return Response.json(
          {
            error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
          },
          { status: 400 }
        );
      }
      // mustChange = true: an admin-issued password is temporary by definition.
      await setUserPassword(id, body.password, true);
    }

    const updated = await updateUser(id, { displayName, role, isActive });
    if (!updated) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json(toPublicUser(updated));
  } catch (err) {
    console.error("Users PATCH error:", err);
    return Response.json({ error: "Failed to update user" }, { status: 500 });
  }
}
