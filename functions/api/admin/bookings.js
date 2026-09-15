// GET /api/admin/bookings — list all bookings for the admin panel.
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
    `SELECT id, status, period, rate, estimated_total, pickup_date, pickup_time, return_date, return_time,
            pickup_location, return_location, adults, children, name, email, phone,
            country, id_number, licence_number, notes, deposit_amount, deposit_status,
            hold_expires_at, created_at
     FROM bookings ORDER BY pickup_date ASC`
  ).all();
  return json({ bookings: results });
}
