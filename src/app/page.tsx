import Link from "next/link";

export const metadata = {
  title: "Redirecting to LetDove Library"
};

export default function HomeRedirect() {
  return (
    <main className="redirect-page">
      <meta httpEquiv="refresh" content="0; url=/library/" />
      <h1>letdove knowledge base</h1>
      <p>Redirecting to the library.</p>
      <Link className="chip" href="/library/">
        Open library
      </Link>
    </main>
  );
}
