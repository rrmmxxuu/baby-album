import { ImageResponse } from "next/og";

export function buildAppIconResponse(width: number, height: number) {
  const cardWidth = Math.round(width * 0.66);
  const cardHeight = Math.round(height * 0.66);
  const brand = "rgb(181, 82, 51)";
  const stroke = Math.max(4, Math.round(width * 0.045));
  const spineWidth = Math.round(cardWidth * 0.24);
  const lineHeight = Math.max(6, Math.round(width * 0.04));

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
            width: cardWidth,
            height: cardHeight,
            borderRadius: Math.round(width * 0.22),
            background: "rgba(255,255,255,0.9)",
            boxShadow: width >= 256 ? "0 32px 72px rgba(119, 58, 38, 0.22)" : "0 20px 50px rgba(119, 58, 38, 0.22)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div
            style={{
              width: Math.round(cardWidth * 0.56),
              height: Math.round(cardHeight * 0.56),
              borderRadius: Math.round(width * 0.1),
              border: `${stroke}px solid ${brand}`,
              background: "rgba(181, 82, 51, 0.06)",
              display: "flex",
              overflow: "hidden"
            }}
          >
            <div
              style={{
                width: spineWidth,
                height: "100%",
                background: "rgba(181, 82, 51, 0.14)",
                borderRight: `${Math.max(3, Math.round(stroke * 0.7))}px solid ${brand}`
              }}
            />
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: Math.max(8, Math.round(width * 0.03)),
                paddingLeft: Math.max(10, Math.round(width * 0.04)),
                paddingRight: Math.max(10, Math.round(width * 0.04))
              }}
            >
              <div
                style={{
                  width: "72%",
                  height: lineHeight,
                  borderRadius: 999,
                  background: brand
                }}
              />
              <div
                style={{
                  width: "88%",
                  height: lineHeight,
                  borderRadius: 999,
                  background: "rgba(181, 82, 51, 0.78)"
                }}
              />
              <div
                style={{
                  width: "60%",
                  height: lineHeight,
                  borderRadius: 999,
                  background: "rgba(181, 82, 51, 0.48)"
                }}
              />
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width,
      height
    }
  );
}
