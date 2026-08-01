import { ImageResponse } from "next/og";
import { MARCA } from "@/site.config";
import { PECAS } from "@/lib/manifesto";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(140deg, #ffffff 0%, #f3faf7 55%, #e9f6f0 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 22,
            fontWeight: 600,
            color: "#065f46",
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          Portfólio · {PECAS.length} peças no ar
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 600, color: "#0f172a", marginTop: 24 }}>
          {MARCA.nome}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 28,
            fontSize: 34,
            color: "#134e4a",
            maxWidth: 900,
          }}
        >
          {MARCA.promessa}
        </div>
      </div>
    ),
    size
  );
}
