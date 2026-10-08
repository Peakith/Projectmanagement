"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h1>Er ging iets mis</h1>
      <p className="text-sm text-zinc-600">De pagina kon niet worden geladen. Probeer het opnieuw; blijft het misgaan, laat het dan weten.</p>
      <Button onClick={reset}>Opnieuw proberen</Button>
    </main>
  );
}
