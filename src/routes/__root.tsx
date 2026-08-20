import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { ReminderWatcher } from "@/components/reminder-watcher";
import { AuthGate } from "@/components/auth-gate";

import appCss from "../styles.css?url";
import babyFireflyCss from "../baby-firefly-design.css?url";
import babyFireflyHotfixCss from "../baby-firefly-hotfix.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          That page has been cast into the void.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Back to Baby
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
      { title: "Baby's Killer Notebook — Mr. Satan" },
      { name: "description", content: "A dark, voice-driven AI notebook. Whisper your ideas, let Baby file them where they belong." },
      { name: "theme-color", content: "#000000" },
      { property: "og:title", content: "Baby's Killer Notebook — Mr. Satan" },
      { property: "og:description", content: "A dark, voice-driven AI notebook. Whisper your ideas, let Baby file them where they belong." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Baby's Killer Notebook — Mr. Satan" },
      { name: "twitter:description", content: "A dark, voice-driven AI notebook. Whisper your ideas, let Baby file them where they belong." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: babyFireflyCss },
      { rel: "stylesheet", href: babyFireflyHotfixCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/app-icon-192.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthGate>
      <Outlet />
      <ReminderWatcher />
      <Toaster theme="dark" position="top-center" />
    </AuthGate>
  );
}
