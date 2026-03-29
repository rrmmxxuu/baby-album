import { buildAppIconResponse } from "../icon-response";

export const runtime = "edge";

export async function GET() {
  return buildAppIconResponse(512, 512);
}
