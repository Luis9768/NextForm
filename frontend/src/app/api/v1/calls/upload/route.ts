import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const backendOrigin =
    process.env.INTERNAL_BACKEND_URL || "http://localhost:8080";
  const targetUrl = `${backendOrigin}/api/v1/calls/upload`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    headers.set("content-length", contentLength);
  }
  const authorization = req.headers.get("authorization");
  if (authorization) {
    headers.set("authorization", authorization);
  }
  const apiKey = req.headers.get("x-api-key");
  if (apiKey) {
    headers.set("x-api-key", apiKey);
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: req.body,
      // @ts-expect-error Node.js undici fetch requires duplex: 'half' when streaming request body
      duplex: "half",
    });

    const responseText = await upstreamRes.text();
    return new NextResponse(responseText, {
      status: upstreamRes.status,
      headers: {
        "Content-Type":
          upstreamRes.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 502,
        error: "Bad Gateway",
        message:
          err instanceof Error
            ? `Falha ao encaminhar upload de áudio: ${err.message}`
            : "Falha ao encaminhar upload de áudio.",
      },
      { status: 502 }
    );
  }
}
