import { DOCELLA_PROJECT_NAME } from "@docella/schemas";

import "./styles.css";

export function App() {
  return (
    <main className="app-shell">
      <section className="intro" aria-labelledby="page-title">
        <p className="kicker">PDF ⇄ Form</p>
        <h1 id="page-title">{DOCELLA_PROJECT_NAME}</h1>
        <p className="status">Application scaffold is ready for the next implementation task.</p>
      </section>
    </main>
  );
}
