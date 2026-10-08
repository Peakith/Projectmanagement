import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1>Niet gevonden</h1>
      <p className="text-sm text-zinc-600">Deze pagina bestaat niet of je hebt er geen toegang toe.</p>
      <Link href="/" className="font-semibold underline">
        Naar de startpagina
      </Link>
    </main>
  );
}
