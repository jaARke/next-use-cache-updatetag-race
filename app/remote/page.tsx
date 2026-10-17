import { Suspense } from "react";
import { getItemsRemote } from "@/lib/items";
import { ItemList } from "../item-list";

export default function Remote() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <ItemList load={getItemsRemote} />
    </Suspense>
  );
}
