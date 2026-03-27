import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return buildIconResponse(512, 512);
}

function buildIconResponse(width: number, height: number) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(160deg, rgb(250, 238, 221) 0%, rgb(244, 210, 181) 45%, rgb(205, 104, 67) 100%)"
        }}
      >
        <div
          style={{
            width: Math.round(width * 0.66),
            height: Math.round(height * 0.66),
            borderRadius: Math.round(width * 0.22),
            background: "rgba(255,255,255,0.88)",
            color: "rgb(181, 82, 51)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: Math.round(width * 0.28),
            fontWeight: 700,
            boxShadow: "0 32px 72px rgba(119, 58, 38, 0.22)"
          }}
        >
          宝
        </div>
      </div>
    ),
    {
      width,
      height
    }
  );
}
