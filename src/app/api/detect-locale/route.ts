import { NextResponse } from "next/server";
import { detectLocalityCurrency } from "@/lib/localeCurrency";

export const runtime = "edge";

export async function GET(request: Request) {
  try {
    const headers = new Headers(request.headers);
    // Vercel / Cloudflare edge geo headers
    const country =
      headers.get("x-vercel-ip-country") ||
      headers.get("cf-ipcountry") ||
      headers.get("x-country-code") ||
      null;

    const acceptLang = headers.get("accept-language") || "";
    let detectedCurrency = "USD";

    if (country) {
      const c = country.toUpperCase();
      if (c === "IN") detectedCurrency = "INR";
      else if (c === "US" || c === "PR" || c === "GU") detectedCurrency = "USD";
      else if (c === "GB" || c === "UK") detectedCurrency = "GBP";
      else if (["DE", "FR", "IT", "ES", "NL", "BE", "AT", "IE", "FI", "PT", "GR"].includes(c)) detectedCurrency = "EUR";
      else if (c === "CA") detectedCurrency = "CAD";
      else if (c === "AU") detectedCurrency = "AUD";
      else if (c === "JP") detectedCurrency = "JPY";
      else if (c === "ID") detectedCurrency = "IDR";
      else if (c === "ZA") detectedCurrency = "ZAR";
    }

    return NextResponse.json({
      success: true,
      country,
      detectedCurrency,
    });
  } catch {
    return NextResponse.json({
      success: false,
      detectedCurrency: "USD",
    });
  }
}
