"use client"; // Error boundaries must be Client Components

import { useEffect, useRef } from "react";
import { Wordmark } from "@/components/dom/Wordmark";
import { loginCopy as copy } from "@/config/experience";

/** Shown when the login action can't reach the server (e.g. the network drops mid-submit). */
export default function LoginError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const retryRef = useRef<HTMLButtonElement>(null);

  // The focused field was just unmounted; put focus where the user can act.
  useEffect(() => retryRef.current?.focus(), []);

  return (
    <main className="grid min-h-dvh place-items-center px-safe">
      <section className="ti-hairline w-full max-w-[440px] rounded-[20px] border border-carbon-600 bg-carbon-800/85 p-8 text-center">
        <Wordmark className="justify-center" />
        <div role="alert">
          <h1 className="mt-6 text-xl font-normal text-ti-50">{copy.unexpected}</h1>
        </div>
        <button
          ref={retryRef}
          type="button"
          onClick={() => retry()}
          className="mt-6 h-[52px] w-full rounded-[10px] bg-ember-500 font-semibold text-carbon-900 transition-colors hover:bg-ember-400 active:bg-ember-600"
        >
          {copy.retry}
        </button>
      </section>
    </main>
  );
}
