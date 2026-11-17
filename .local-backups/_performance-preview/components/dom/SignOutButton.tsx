import { authPolicy } from "@/lib/config/auth";
import { sessionCopy } from "@/lib/config/experience";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <form method="post" action={authPolicy.logoutPath}>
      <button
        type="submit"
        className={`h-11 rounded-control border border-ti-600 px-4 text-sm text-ti-200 transition-colors hover:border-ti-400 hover:text-ti-50 ${className}`}
      >
        {sessionCopy.signOut}
      </button>
    </form>
  );
}
