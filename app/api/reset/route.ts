import { revalidateTag } from "next/cache";
import { writeItems } from "@/lib/items";

// Puts b back and expires the tag, so the next read of the list is a cache miss.
export async function POST() {
  writeItems(["a", "b", "c"]);
  revalidateTag("items", { expire: 0 });
  return Response.json({ reset: true });
}
