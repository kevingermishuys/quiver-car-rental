// GET /api/admin/reviews — list all reviews (any status) for the moderation panel
// Requires ?token=ADMIN_TOKEN or an Authorization: Bearer <token> header

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function checkAuth(request, env) {
  const url = new URL(request.url);
  const tokenFromQuery = url.searchParams.get("token");
  const authHeader = request.headers.get("authorization") || "";
  const tokenFromHeader = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = tokenFromHeader || tokenFromQuery;
  return Boolean(token) && token === env.ADMIN_TOKEN;
}

export async function onRequestGet({ request, env }) {
  if (!checkAuth(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { results } = await env.REVIEWS_DB.prepare(
    "SELECT id, name, rating, trip, review, status, created_at FROM reviews ORDER BY created_at DESC LIMIT 200"
  ).all();
  return json({ reviews: results });
}
