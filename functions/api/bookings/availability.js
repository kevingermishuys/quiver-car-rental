// GET /api/bookings/availability — public list of date ranges currently
// blocking the vehicle (confirmed bookings, plus held bookings whose hold
// hasn't expired). No customer details are exposed here.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ env }) {
  const { results } = await env.REVIEWS_DB.prepare(
    `SELECT pickup_date AS start, return_date AS end FROM bookings
     WHERE status IN ('held', 'confirmed')
       AND (status = 'confirmed' OR hold_expires_at > datetime('now'))
     ORDER BY pickup_date ASC`
  ).all();
  return json({ blocked: results });
}
