/** Desktop supplies only public endpoint URLs; credentials stay on the backend. */
declare global {
  interface Window {
    woofDesktop?: Readonly<{
      apiUrl: string;
      uploadApiUrl: string;
      realtimeUrl: string;
    }>;
  }
}
export function getBackendConnection() {
  if (typeof window !== "undefined" && window.woofDesktop) return window.woofDesktop;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "/backend-api";
  const uploadApiUrl = process.env.NEXT_PUBLIC_UPLOAD_API_URL || apiUrl;
  return {
    apiUrl,
    uploadApiUrl,
    realtimeUrl: process.env.NEXT_PUBLIC_WS_URL?.trim().replace(/\/$/, "") || (uploadApiUrl.startsWith("/") ? "http://localhost:3001" : uploadApiUrl).replace(/\/api\/?$/, "").replace(/\/$/, ""),
  };
}
