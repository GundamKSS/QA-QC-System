import type { Metadata } from "next";
import { Suspense } from "react";
import { SignOutButton } from "@/components/dom/SignOutButton";
import { Wordmark } from "@/components/dom/Wordmark";
import { authPolicy } from "@/config/auth";
import { changePasswordCopy as copy } from "@/config/experience";
import { requireSignedIn } from "@/lib/auth/dal";
import { PinChangeForm } from "./PinChangeForm";

export const metadata: Metadata = { title: copy.pageTitle };

/**
 * First-login password change (FR-AUTH-02). Pass 1 only routes here and confirms who is
 * signed in; the form itself is Pass 7 (docs/07 §13).
 */
export default function ChangePasswordPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-safe py-10">
      <section
        aria-labelledby="change-password-title"
        className="ti-hairline w-full max-w-[440px] rounded-[20px] border border-carbon-600 bg-carbon-800/85 p-8"
      >
        <Wordmark />
        <h1 id="change-password-title" className="mt-6 text-2xl font-light text-ti-50">
          {copy.title}
        </h1>
        <Suspense fallback={<div className="mt-3 h-6 w-48 rounded-md bg-carbon-700" />}>
          <SignedInAs />
        </Suspense>
        <Suspense fallback={null}>
          <ChangeBody />
        </Suspense>
        <SignOutButton className="mt-6 w-full" />
      </section>
    </main>
  );
}

async function SignedInAs() {
  const user = await requireSignedIn(authPolicy.changePasswordPath);
  return (
    <p className="mt-3 text-sm text-ti-200">
      {user.fullName} · <span className="font-mono tracking-[0.08em]">{user.employeeCode}</span>
    </p>
  );
}

/** Field users pick their own PIN here; central users have nothing to change in QCheck (DEC-09). */
async function ChangeBody() {
  const user = await requireSignedIn(authPolicy.changePasswordPath);
  if (user.source !== "LOCAL") return <p className="mt-4 text-sm text-ti-400">{copy.pending}</p>;
  return (
    <>
      <p className="mt-4 text-sm text-ti-400">{copy.pinIntro}</p>
      <PinChangeForm />
    </>
  );
}
