import { deleteB } from "./actions";

export default function Edit() {
  return (
    <>
      <form action={deleteB}>
        <input type="hidden" name="to" value="/" />
        <button>Delete b and show /</button>
      </form>
      <form action={deleteB}>
        <input type="hidden" name="to" value="/remote" />
        <button>Delete b and show /remote</button>
      </form>
    </>
  );
}
