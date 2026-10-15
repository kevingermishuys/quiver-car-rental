export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === "www.quivercarrental.com") {
    url.hostname = "quivercarrental.com";
    return Response.redirect(url.toString(), 301);
  }
  return next();
}
