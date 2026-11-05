import QRCode from "qrcode";
import { notFound } from "@/lib/errors";
import { route } from "@/lib/http";
import { isValidPassportId, normalizePassportId } from "@/lib/passport-id";
import { publicUrl } from "@/modules/passport/projection";

/** Imagen PNG del QR (generada en el servidor) que apunta a la URL estable del pasaporte. */
export const GET = route<{ passportId: string }>(async (_req, { params }) => {
  const id = normalizePassportId(decodeURIComponent((await params).passportId));
  if (!isValidPassportId(id)) throw notFound("Identificador inválido");
  const png = await QRCode.toBuffer(publicUrl(id), { errorCorrectionLevel: "Q", margin: 2, width: 512 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable" },
  });
});
