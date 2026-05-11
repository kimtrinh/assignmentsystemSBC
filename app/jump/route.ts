import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const site = url.searchParams.get("site");
  const date = url.searchParams.get("date");
  if (!site || !date) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.redirect(new URL(`/${site}/${date}`, req.url));
}
