import type { Metadata } from "next";
import { LoginForm } from "@/components/dom/LoginForm";
import { Wordmark } from "@/components/dom/Wordmark";
import { ThaiReveal } from "@/components/dom/ThaiReveal";
import { loginCopy as copy, motion } from "@/config/experience";

export const metadata: Metadata = { title: copy.pageTitle };

/**
 * S01 Login (docs/07). Fully static: it never reads the session, so it prerenders into the
 * static shell and the form is usable before any JS or 3D arrives.
 *
 * Layouts (docs/07 §6): phone portrait = stage on top + bottom sheet; tablet = the sheet
 * centred; phone landscape = stage left, form right; laptop = stage left, 420px panel right.
 * The header is sized in svh so it doesn't grow while mobile toolbars collapse.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col phone-landscape:grid phone-landscape:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] phone-landscape:gap-6 phone-landscape:px-safe lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,420px)] lg:gap-16 lg:px-14 xl:px-24">
      <header className="flex h-[30svh] min-h-28 flex-col justify-between px-safe pt-[max(1.25rem,env(safe-area-inset-top))] short-portrait:h-[20svh] phone-landscape:h-auto phone-landscape:px-0 phone-landscape:py-5 sm:[--gutter:2rem] lg:h-auto lg:min-h-dvh lg:px-0 lg:py-10">
        <Wordmark />
        <p lang="en" className="hidden font-mono text-[11px] tracking-[0.14em] text-ti-500 uppercase lg:block">
          {copy.footer}
        </p>
      </header>

      <main className="flex flex-1 flex-col justify-end phone-landscape:justify-center phone-landscape:py-4 lg:justify-center lg:py-10">
        <section
          data-stage-block
          aria-labelledby="login-title"
          className="ti-hairline rounded-t-[28px] border border-b-0 border-carbon-600 bg-carbon-800/85 px-safe pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-8 sm:[--gutter:2rem] md:mx-auto md:w-full md:max-w-[480px] phone-landscape:rounded-[20px] phone-landscape:border-b phone-landscape:px-6 phone-landscape:pb-6 phone-landscape:pt-6 lg:mx-0 lg:max-w-none lg:rounded-[20px] lg:border-b lg:px-10 lg:pb-10 lg:pt-10 motion-safe:animate-rise"
        >
          <p lang="en" className="font-mono text-[11px] tracking-[0.14em] text-ti-400 uppercase">
            {copy.eyebrow}
          </p>
          <h1 id="login-title" className="mt-3 text-[28px] font-light leading-[1.35] text-ti-50 sm:text-[32px]">
            {copy.titleLines.map((line, i) => (
              <span key={line} className="block">
                <ThaiReveal text={line} startMs={motion.thaiReveal.startMs + i * (motion.thaiReveal.lineGapMs + 4 * motion.thaiReveal.stepMs)} />
              </span>
            ))}
          </h1>
          {copy.lead && <p className="mt-2 text-sm text-ti-400">{copy.lead}</p>}

          <LoginForm />

          <p className="mt-6 text-sm text-ti-500">{copy.forgot}</p>
          <p lang="en" className="mt-8 font-mono text-[11px] tracking-[0.14em] text-ti-500 uppercase lg:hidden">
            {copy.footer}
          </p>
        </section>
      </main>
    </div>
  );
}
