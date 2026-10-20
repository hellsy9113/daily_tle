import { ImageResponse } from "next/og";

export const alt =
  "Track.it — coding activity, private notes, daily articles and optional Telegram recaps";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  const levels = [
    0, 1, 0, 2, 1, 3, 0, 1, 2, 1, 0, 3, 2, 1, 1, 0, 2, 3, 1, 2, 0, 1, 2, 3, 1, 2, 3, 0, 2, 1, 3, 2,
    1, 0, 2, 1, 3, 2, 3, 1, 2, 3, 1, 2, 3, 2, 1, 3, 2, 3, 1, 2, 3, 2, 3, 1,
  ];
  const colors = ["#e6e9e3", "#b4d8ad", "#6ba56a", "#326a41"];
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: "#faf7f1",
        padding: "58px",
        color: "#222822",
        fontFamily: "sans-serif",
        gap: 48,
      }}
    >
      <div
        style={{
          width: 610,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 700 }}
        >
          <div
            style={{
              display: "flex",
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#a84812",
              color: "white",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 28 28">
              <path
                d="m5 14 6 6L23 6"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          Track.it
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 70, letterSpacing: -3, fontWeight: 700, lineHeight: 1.05 }}>
            A home for your
          </div>
          <div
            style={{
              fontSize: 70,
              letterSpacing: -3,
              fontWeight: 700,
              lineHeight: 1.05,
              color: "#a84812",
              marginTop: 8,
            }}
          >
            coding routine.
          </div>
          <div
            style={{
              fontSize: 25,
              lineHeight: 1.5,
              color: "#565d54",
              marginTop: 28,
              maxWidth: 555,
            }}
          >
            Track your practice. Keep the useful bits. Discover your next read.
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 20, color: "#565d54" }}>
          Google or Telegram sign-in · Every service is optional
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          gap: 18,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid #d9ddcf",
            background: "white",
            padding: 24,
            borderRadius: 20,
            boxShadow: "0 10px 24px #22282208",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 22,
              fontWeight: 700,
              marginBottom: 20,
            }}
          >
            Your practice<span style={{ fontSize: 17, color: "#326a41" }}>Accepted</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, width: 297 }}>
            {levels.map((level, i) => (
              <div
                key={i}
                style={{ width: 31, height: 27, borderRadius: 5, background: colors[level] }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 16, color: "#565d54", marginTop: 18 }}>
            LeetCode · GFG · HackerRank · Codeforces
          </div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {["Private Notes", "Daily Articles"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                flex: 1,
                padding: "20px 14px",
                borderRadius: 16,
                background: "#eee8db",
                fontSize: 21,
                fontWeight: 700,
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", color: "#565d54", fontSize: 18, paddingLeft: 5 }}>
          + Daily Grind · Optional Telegram recaps
        </div>
      </div>
    </div>,
    size,
  );
}
