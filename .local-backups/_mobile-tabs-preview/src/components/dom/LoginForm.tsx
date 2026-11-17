"use client";

import { useActionState, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { login } from "@/app/(auth)/login/actions";
import { loginCopy as copy, motion } from "@/config/experience";
import { useCountdown, useHydrated, useOnline, useReducedMotion, useSearchParam } from "@/hooks/useBrowserState";
import { EMPLOYEE_CODE_MAX, normalizeEmployeeCode, PASSWORD_MAX } from "@/lib/auth/employee-code";
import type { LoginState } from "@/lib/auth/types";
import { publishAuthStage } from "@/lib/auth-stage";

const initialState: LoginState = { status: "idle" };

type FieldErrors = { employeeCode?: boolean; password?: boolean };

// Focus beats the invalid border so the focused field is always ember (WCAG 1.4.11);
// outline-hidden keeps a real outline in Windows contrast themes, where shadows are dropped.
const inputClass =
  "block h-[52px] w-full rounded-[10px] border border-ti-600 bg-carbon-700 px-4 text-base text-ti-50 " +
  "placeholder:text-ti-400 transition-[border-color,box-shadow] duration-200 " +
  "focus:border-ember-500 focus:ring-3 focus:ring-ember-500/25 focus:outline-hidden " +
  "aria-[invalid=true]:not-focus:border-fail";

/** Kedmanee layout left on: the masked password is Thai letters, and it still counts toward the lock. */
const THAI = /[฀-๿]/;

const clockFormat = new Intl.DateTimeFormat("th-TH-u-nu-latn", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Bangkok",
});

/** Absolute unlock time, fixed to factory time so server and client render the same text. */
function formatClock(epochMs: number) {
  return `${clockFormat.format(epochMs)} น.`;
}

/** mm:ss (docs/07 §4 state 7). */
function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  const hydrated = useHydrated();
  const online = useOnline();
  const reducedMotion = useReducedMotion();
  const nextPath = useSearchParam("next");
  const ids = useId();

  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);

  const stateAt = state.status === "idle" ? 0 : state.at;
  // Restored by React's automatic form reset after every response, success included.
  const stateCode = state.status === "idle" ? "" : state.employeeCode;

  // Local edits are tied to the server response they follow, so a new response resets them.
  const [codeDraft, setCodeDraft] = useState<{ at: number; value: string } | null>(null);
  const [clientErrors, setClientErrors] = useState<{ at: number; errors: FieldErrors; round: number } | null>(null);
  const [thaiInputAt, setThaiInputAt] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [focused, setFocused] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordActivity, setPasswordActivity] = useState<{ at: number; hasContent: boolean } | null>(null);
  const [editedAfter, setEditedAfter] = useState<number | null>(null);
  // Bumped when a submit is blocked offline, so the banner is announced again.
  const [offlineRound, setOfflineRound] = useState(0);

  const typedCode = codeDraft?.at === stateAt ? codeDraft.value : stateCode;
  const ownClientErrors = clientErrors?.at === stateAt ? clientErrors : null;
  const fieldErrors: FieldErrors = ownClientErrors
    ? ownClientErrors.errors
    : state.status === "invalid"
      ? (state.fieldErrors ?? {})
      : {};
  // "Wrong code or password" marks both fields; a missing field marks only itself.
  const credentialsRejected = state.status === "invalid" && !state.fieldErrors && !ownClientErrors;
  const thaiInput = thaiInputAt === stateAt;

  const isLockState = state.status === "locked";
  const lockRemainingMs = useCountdown(stateAt, isLockState ? state.lockedUntil - state.at : 0, isLockState);
  // The lock belongs to one employee code; someone else can still sign in on this device.
  const locked = isLockState && lockRemainingMs > 0 && normalizeEmployeeCode(typedCode) === normalizeEmployeeCode(state.employeeCode);
  const succeeded = state.status === "success";
  const typing = passwordActivity?.at === stateAt && passwordActivity.hasContent;

  const stageError =
    editedAfter !== stateAt &&
    (state.status === "invalid" ||
      state.status === "disabled" ||
      state.status === "pinLocked" ||
      state.status === "forbidden" ||
      state.status === "unavailable");
  const stagePhase = !online ? "offline" : pending ? "submitting" : succeeded ? "success" : locked ? "locked" : stageError ? "error" : focused ? "focus" : "idle";
  useEffect(() => {
    publishAuthStage(stagePhase, stateAt, typing, usernameFocused);
  }, [stagePhase, stateAt, typing, usernameFocused]);
  useEffect(() => () => publishAuthStage("idle"), []);

  // Next.js keeps hidden pages alive with <Activity>, which re-runs effects when a page is
  // shown again — so each server response is handled exactly once.
  const handledAt = useRef(0);
  const navigatedAt = useRef(0);

  // After each server response: shake on failure, move focus to the field to fix.
  useEffect(() => {
    if (state.status === "idle" || state.status === "success" || handledAt.current === state.at) return;
    handledAt.current = state.at;
    // Shake means "you typed something wrong" — not when the central system is down.
    if (!reducedMotion && state.status !== "unavailable") {
      fieldsRef.current?.animate(
        motion.shake.offsetsPx.map((x) => ({ transform: `translateX(${x}px)` })),
        { duration: motion.shake.durationMs, easing: motion.shake.easing },
      );
    }
    if (
      state.status === "locked" ||
      state.status === "pinLocked" ||
      state.status === "forbidden" ||
      (state.status === "invalid" && state.fieldErrors?.employeeCode)
    ) {
      // Locked or forbidden: focus code field
      codeRef.current?.focus();
      if (state.status === "locked") codeRef.current?.select();
    } else {
      passwordRef.current?.focus();
    }
  }, [state, reducedMotion]);

  // Finish the whole-page fade as well as the 3D welcome beat before navigating.
  // Keep full navigation so no previous user's in-memory state survives on shared devices.
  // A back/forward-cache restore of this page is reloaded by <BfcacheGuard> in the root layout.
  useEffect(() => {
    if (state.status !== "success" || navigatedAt.current === state.at) return;
    const { at, next } = state;
    let cancelled = false;
    const id = window.setTimeout(
      async () => {
        if (!reducedMotion) {
          const departure = document.querySelector(".auth-screen")?.getAnimations()
            .filter((animation) => animation instanceof CSSAnimation && animation.animationName === "auth-departure") ?? [];
          await Promise.allSettled(departure.map((animation) => animation.finished));
          // Let the covered frame paint before starting the new document.
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
        }
        if (cancelled) return;
        navigatedAt.current = at;
        window.location.replace(next);
      },
      reducedMotion ? motion.successHoldReducedMs : motion.successHoldMs,
    );
    return () => { cancelled = true; window.clearTimeout(id); };
  }, [state, reducedMotion]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!navigator.onLine) {
      event.preventDefault();
      setOfflineRound((round) => round + 1);
      return;
    }
    if (pending || succeeded || locked) {
      event.preventDefault();
      return;
    }
    const data = new FormData(event.currentTarget);
    const errors: FieldErrors = {
      employeeCode: normalizeEmployeeCode(data.get("employeeCode")) === "",
      password: String(data.get("password") ?? "") === "",
    };
    if (errors.employeeCode || errors.password) {
      event.preventDefault();
      setClientErrors((previous) => ({ at: stateAt, errors, round: (previous?.round ?? 0) + 1 }));
      (errors.employeeCode ? codeRef : passwordRef).current?.focus();
    }
  }

  function clearFieldError(field: keyof FieldErrors) {
    if (fieldErrors[field]) {
      setClientErrors((previous) => ({
        at: stateAt,
        errors: { ...fieldErrors, [field]: false },
        round: previous?.round ?? 0,
      }));
    }
  }

  // The "Next" key on phone keyboards still sends Enter; go to the password instead of submitting.
  function handleCodeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing || passwordRef.current?.value) return;
    event.preventDefault();
    passwordRef.current?.focus();
  }

  function trackCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState?.("CapsLock") ?? false);
  }

  const codeErrorId = `${ids}-code-error`;
  const passwordErrorId = `${ids}-password-error`;
  const hintId = `${ids}-hint`;
  const formErrorId = `${ids}-form-error`;
  const formMessage = credentialsRejected
    ? {
        line: copy.invalid,
        detail: state.attemptsLeft !== null ? copy.attemptsLeft(state.attemptsLeft) : undefined,
      }
    : locked
      ? { line: copy.locked(formatClock(state.lockedUntil)) }
      : state.status === "pinLocked"
        ? { line: copy.pinLocked }
      : state.status === "disabled"
        ? { line: copy.disabled }
        : state.status === "forbidden"
          ? { line: state.message || copy.forbidden() }
          : state.status === "unavailable"
            ? { line: copy.unavailable }
            : null;
  const hasFormError = formMessage !== null;
  const describedBy = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ") || undefined;
  const errorRound = ownClientErrors?.round ?? 0;

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      onInputCapture={(event) => {
        setEditedAfter(stateAt);
        const input = event.target;
        // The canvas receives activity only, never password text or its length.
        if (input instanceof HTMLInputElement && input.name === "password") setPasswordActivity({ at: stateAt, hasContent: input.value.length > 0 });
      }}
      onFocusCapture={(event) => {
        setFocused(true);
        setUsernameFocused((event.target as unknown) === codeRef.current);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(false);
          setUsernameFocused(false);
        }
      }}
      noValidate={hydrated}
      aria-describedby={hasFormError ? formErrorId : undefined}
      className="mt-8"
    >
      {/* Live regions stay mounted (never display:none) so screen readers announce changes. */}
      <div role="status">
        {!online && (
          <p className="mb-5 flex items-center gap-2 rounded-[10px] border border-carbon-600 bg-carbon-900/60 px-4 py-3 text-sm text-ti-200">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-ti-500" />
            <span key={offlineRound}>{copy.offline}</span>
          </p>
        )}
      </div>

      <input type="hidden" name="enhanced" value={hydrated ? "1" : ""} />
      <input type="hidden" name="next" value={nextPath} />

      <div ref={fieldsRef} className="space-y-5">
        <div>
          <label htmlFor={`${ids}-code`} className="mb-2 block text-sm text-ti-400">
            {copy.employeeLabel}
          </label>
          <input
            ref={codeRef}
            id={`${ids}-code`}
            name="employeeCode"
            type="text"
            inputMode="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            required
            maxLength={EMPLOYEE_CODE_MAX}
            defaultValue={stateCode}
            placeholder={copy.employeePlaceholder}
            aria-invalid={fieldErrors.employeeCode || credentialsRejected ? true : undefined}
            aria-describedby={describedBy(fieldErrors.employeeCode && codeErrorId, hasFormError && formErrorId)}
            onChange={(event) => {
              setCodeDraft({ at: stateAt, value: event.currentTarget.value });
              clearFieldError("employeeCode");
            }}
            onKeyDown={handleCodeKeyDown}
            className={`${inputClass} font-mono tracking-[0.08em]`}
          />
          <p id={codeErrorId} aria-live="polite" className="text-sm text-fail">
            {fieldErrors.employeeCode && (
              <span key={errorRound} className="mt-2 block">
                {copy.requiredEmployee}
              </span>
            )}
          </p>
        </div>

        <div>
          <label htmlFor={`${ids}-password`} className="mb-2 block text-sm text-ti-400">
            {copy.passwordLabel}
          </label>
          <div className="relative">
            <input
              ref={passwordRef}
              id={`${ids}-password`}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              required
              maxLength={PASSWORD_MAX}
              aria-invalid={fieldErrors.password || credentialsRejected ? true : undefined}
              aria-describedby={describedBy(
                fieldErrors.password && passwordErrorId,
                hasFormError && formErrorId,
                (capsLock || thaiInput) && hintId,
              )}
              onChange={(event) => {
                setThaiInputAt(THAI.test(event.currentTarget.value) ? stateAt : null);
                clearFieldError("password");
              }}
              onKeyDown={trackCapsLock}
              onKeyUp={trackCapsLock}
              onBlur={() => setCapsLock(false)}
              className={`${inputClass} pr-14`}
            />
            <button
              type="button"
              aria-label={copy.showPassword}
              aria-pressed={showPassword}
              aria-controls={`${ids}-password`}
              // Keep focus (and the phone keyboard) in the password field; Tab still reaches it.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-1 my-auto grid size-11 place-items-center rounded-lg text-ti-400 transition-colors hover:text-ti-50 aria-pressed:text-ember-400"
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
          <p id={passwordErrorId} aria-live="polite" className="text-sm text-fail">
            {fieldErrors.password && (
              <span key={errorRound} className="mt-2 block">
                {copy.requiredPassword}
              </span>
            )}
          </p>
          <p id={hintId} aria-live="polite" className="text-sm text-ember-400">
            {capsLock && <span className="mt-2 block">{copy.capsLock}</span>}
            {thaiInput && <span className="mt-2 block">{copy.thaiLayout}</span>}
          </p>
        </div>
      </div>

      {/* Emptied while a request is in flight, so a repeat of the same error is announced again. */}
      <div role="alert" id={formErrorId}>
        {formMessage && !pending && <FormMessage line={formMessage.line} detail={formMessage.detail} />}
      </div>

      <div role="status">
        {pending && <span className="sr-only">{copy.submitting}</span>}
        {succeeded && <p className="mt-5 text-sm text-pass">{copy.welcome(state.fullName)}</p>}
      </div>

      <button
        type="submit"
        disabled={locked}
        aria-disabled={pending || succeeded ? true : undefined}
        aria-busy={pending || undefined}
        className="mt-7 flex h-[52px] w-full items-center justify-center gap-3 rounded-[10px] bg-ember-500 text-base font-semibold text-carbon-900 transition-colors duration-200 hover:bg-ember-400 active:bg-ember-600 aria-disabled:cursor-progress disabled:cursor-not-allowed disabled:bg-carbon-600 disabled:text-ti-400"
      >
        {pending || succeeded ? (
          <>
            <span
              aria-hidden="true"
              className="size-4 rounded-full border-2 border-carbon-900/30 border-t-carbon-900 motion-safe:animate-spin"
            />
            {copy.submitting}
          </>
        ) : locked ? (
          copy.lockedButton(formatRemaining(lockRemainingMs))
        ) : (
          copy.submit
        )}
      </button>
    </form>
  );
}

function FormMessage({ line, detail }: { line: string; detail?: string }) {
  return (
    <div className="mt-5 flex gap-3 rounded-[10px] border border-fail/40 bg-fail/10 px-4 py-3 text-sm text-ti-50">
      <svg viewBox="0 0 20 20" aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-fail">
        <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 5.75v5.5M10 13.75v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <span>
        <span className="block">{line}</span>
        {detail && <span className="mt-1 block text-ti-200">{detail}</span>}
      </span>
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.75" />
      {!open && <path d="M4 4l16 16" strokeLinecap="round" />}
    </svg>
  );
}
