// POST /api/admin/bookings/:id — confirm, cancel, mark deposit paid, or delete a booking
// Body: { "action": "confirm" | "cancel" | "markPaid" | "delete" }
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

export async function onRequestPost({ request, env, params }) {
  if (!checkAuth(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return json({ error: "Invalid booking id." }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (body.action === "delete") {
    await env.REVIEWS_DB.prepare("DELETE FROM bookings WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  if (body.action === "markPaid") {
    await env.REVIEWS_DB.prepare(
      "UPDATE bookings SET deposit_status = 'paid', status = 'confirmed' WHERE id = ?"
    )
      .bind(id)
      .run();
    return json({ ok: true });
  }

  if (body.action !== "confirm" && body.action !== "cancel") {
    return json({ error: "action must be confirm, cancel, markPaid, or delete." }, 400);
  }

  const status = body.action === "confirm" ? "confirmed" : "cancelled";
  await env.REVIEWS_DB.prepare("UPDATE bookings SET status = ? WHERE id = ?").bind(status, id).run();
  return json({ ok: true });
}
