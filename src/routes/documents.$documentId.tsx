import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { getDocumentDownloadUrl } from "@/server/document.functions";

export const Route = createFileRoute("/documents/$documentId")({
  head: () => ({
    meta: [{ title: "Baby's Document — Mr. Satan" }],
  }),
  component: DocumentDownloadPage,
});

function DocumentDownloadPage() {
  const { documentId } = Route.useParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getDocumentDownloadUrl({
      data: { document_id: documentId },
    })
      .then(({ url }) => {
        if (!cancelled) window.location.replace(url);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Baby couldn't open that document.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-6 text-center">
        <FileText className="mx-auto mb-3 size-8 text-primary" />
        {error ? (
          <>
            <h1 className="font-display text-xl text-foreground">
              Couldn't open it, daddy.
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Link
              to="/"
              className="mt-5 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Back to Baby
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-3 size-5 animate-spin text-primary" />
            <h1 className="font-display text-xl text-foreground">
              Opening your document…
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Baby's fetching the private file.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
