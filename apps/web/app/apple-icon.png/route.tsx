import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
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
            width: 118,
            height: 118,
            borderRadius: 40,
            background: "rgba(255,255,255,0.9)",
            color: "rgb(181, 82, 51)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 52,
            fontWeight: 700
          }}
        >
          宝
        </div>
      </div>
    ),
    {
      width: 180,
      height: 180
    }
  );
}
