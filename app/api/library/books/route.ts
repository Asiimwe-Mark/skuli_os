import { createBookSchema } from "@/lib/validations/library";
import { route, AuthError, paginatedResponse, dbError } from "@/lib/http";

export const GET = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = ctx.supabase
      .from("library_books")
      .select("*", { count: "exact" })
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .order("title");

    if (search) {
      query = query.or(
        `title.ilike.%${search}%,author.ilike.%${search}%,isbn.ilike.%${search}%`,
      );
    }
    if (category) {
      query = query.eq("category", category);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) return dbError(error, "Database error");

    return paginatedResponse(data ?? [], count ?? 0, page, limit);
  },
});

export const POST = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createBookSchema,
  handler: async (ctx, body) => {
    const schoolId = ctx.profile.school_id!;

    const { data, error } = await ctx.supabase
      .from("library_books")
      .insert({
        school_id: schoolId,
        title: body.title,
        author: body.author ?? null,
        isbn: body.isbn ?? null,
        category: body.category ?? null,
        total_copies: body.total_copies,
        available_copies: body.total_copies,
        shelf_location: body.shelf_location ?? null,
      })
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    return data;
  },
});

export const PATCH = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  schema: createBookSchema.partial(),
  handler: async (ctx, body, request) => {
    const schoolId = ctx.profile.school_id!;
    const id = new URL(request.url).searchParams.get("id");

    if (!id) throw new AuthError("Book ID is required", 400);

    const { data, error } = await ctx.supabase
      .from("library_books")
      .update(body)
      .eq("id", id)
      .eq("school_id", schoolId)
      .eq("is_deleted", false)
      .select()
      .single();

    if (error) return dbError(error, "Database error");

    return data;
  },
});

export const DELETE = route({
  roles: ["SCHOOL_ADMIN", "BURSAR", "SUPER_ADMIN"],
  handler: async (ctx, request) => {
    const schoolId = ctx.profile.school_id!;
    const id = new URL(request.url).searchParams.get("id");

    if (!id) throw new AuthError("Book ID is required", 400);

    const { error } = await ctx.supabase
      .from("library_books")
      .update({ is_deleted: true })
      .eq("id", id)
      .eq("school_id", schoolId);

    if (error) return dbError(error, "Database error");

    return { deleted: true };
  },
});