import { Suspense } from "react";
import { getItems } from "@/lib/items";
import { ItemList } from "./item-list";

export default function Home() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <ItemList load={getItems} />
    </Suspense>
  );
}
