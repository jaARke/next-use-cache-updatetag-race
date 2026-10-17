"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { readItems, writeItems } from "@/lib/items";

// The read-your-own-writes pattern from the updateTag docs: write, updateTag, redirect.
export async function deleteB(formData: FormData) {
  writeItems(readItems().filter((item) => item !== "b"));
  updateTag("items");
  redirect(formData.get("to") === "/remote" ? "/remote" : "/");
}
