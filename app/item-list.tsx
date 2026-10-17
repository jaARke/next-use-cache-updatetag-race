import { connection } from "next/server";

export async function ItemList({ load }: { load: () => Promise<string[]> }) {
  // Render on every request, as a page that reads cookies would.
  await connection();
  const items = await load();
  return (
    <ul id="list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
