"use client"; // Error boundaries must be Client Components

import { useEffect, useRef } from "react";
import { Wordmark } from "@/components/dom/Wordmark";
import { loginCopy as copy } from "@/lib/config/experience";

/**
 * Last resort when the login page itself crashes while rendering. A sign-in request that fails (network
 * dropped, server restarting) is handled inside the form — see `unreachable` in LoginForm.
 */
export default function LoginError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const retryRef = useRef<HTMLButtonElement>(null);

  // The focused field was just unmounted; put focus where the user can act.
  useEffect(() => retryRef.current?.focus(), []);

  return (
    <main className="grid min-h-dvh place-items-center px-safe">
      <section className="ti-hairline w-full max-w-[440px] rounded-surface border border-carbon-600 bg-carbon-800/85 p-8 text-center">
        <Wordmark className="justify-center" />
        <div role="alert">
          <h1 className="mt-6 text-xl font-normal text-ti-50">{copy.unexpected}</h1>
        </div>
        <button
          ref={retryRef}
          type="button"
          onClick={() => retry()}
          className="mt-6 h-[52px] w-full rounded-control bg-ember-500 font-semibold text-carbon-900 transition-colors hover:bg-ember-400 active:bg-ember-600"
        >
          {copy.retry}
        </button>
      </section>
    </main>
  );
}
