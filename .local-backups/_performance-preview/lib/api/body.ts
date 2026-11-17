/**
 * Request fields read the same way whether the browser sent JSON (our forms) or a plain form
 * post (curl, Postman, a form without JavaScript). The existing form parsers take a `get(key)`
 * reader, so they keep working unchanged.
 */
export type Fields = {
  /** The string value, or null when missing or not a string. Numbers and booleans from JSON count as strings. */
  get(key: string): string | null;
  /** Like `get` but "" when missing. */
  text(key: string): string;
  /** Every string value of a repeated field (checkboxes, several assignees); a single value comes back as a one-item list. */
  all(key: string): string[];
};

function fieldsOf(source: (key: string) => unknown): Fields {
  const scalar = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : null);
  return {
    get: (key) => scalar(source(key)),
    text: (key) => scalar(source(key)) ?? "",
    all: (key) => {
      const value = source(key);
      return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string");
    },
  };
}

/** Next.js caps a Server Action body at 1 MB; a route handler has no cap of its own, so this is it. */
const DEFAULT_MAX_BYTES = 1024 * 1024;

/**
 * A body that is missing, unreadable, not an object, or declares more than `maxBytes` gives empty
 * fields, so the normal "required" checks answer it — nothing here throws on bad input. The size
 * is the declared Content-Length (what browsers always send); a proxy still has to cap chunked uploads.
 */
export async function readFields(request: Request, { maxBytes = DEFAULT_MAX_BYTES }: { maxBytes?: number } = {}): Promise<Fields> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) return fieldsOf(() => undefined);
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body: unknown = await request.json();
      const object = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
      return fieldsOf((key) => (Object.hasOwn(object, key) ? object[key] : undefined));
    }
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await request.formData();
      return fieldsOf((key) => {
        const values = form.getAll(key).filter((value): value is string => typeof value === "string");
        return values.length > 1 ? values : values[0];
      });
    }
  } catch {
    // fall through to empty fields
  }
  return fieldsOf(() => undefined);
}
