import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#00A0F0",
          borderRadius: 6,
          color: "#ffffff",
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        A
      </div>
    ),
    { ...size },
  );
}
