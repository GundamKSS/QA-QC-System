/**
 * The no-WebGL stage (docs/07 §8 "Static" tier): an inspection-bay grid, a soft key light
 * and a slow ember scan line. The 3D canvas mounts above it; Pass 6 adds the
 * rendered poster image for devices that stay on this tier.
 * Purely decorative — hidden from assistive tech.
 */
export function StaticStage() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Key light pooling where the 3D object will sit (top on phones, left on laptops). */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_18%,color-mix(in_srgb,var(--color-ti-metal)_16%,transparent),transparent_70%)] lg:bg-[radial-gradient(42%_55%_at_30%_48%,color-mix(in_srgb,var(--color-ti-metal)_16%,transparent),transparent_70%)]" />
      {/* Warm rim from behind the object. */}
      <div className="absolute inset-0 bg-[radial-gradient(35%_25%_at_70%_30%,color-mix(in_srgb,var(--color-ember-500)_7%,transparent),transparent_70%)] lg:bg-[radial-gradient(25%_35%_at_45%_62%,color-mix(in_srgb,var(--color-ember-500)_7%,transparent),transparent_70%)]" />
      {/* Engineering grid, fading out with distance. */}
      <div className="absolute inset-0 bg-[linear-gradient(color-mix(in_srgb,var(--color-ti-200)_5%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_srgb,var(--color-ti-200)_5%,transparent)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(70%_50%_at_50%_20%,black,transparent)] lg:[mask-image:radial-gradient(45%_60%_at_30%_50%,black,transparent)]" />
      {/* Keep this fallback scan until the real 3D laser has drawn its first frame. */}
      <div className="absolute inset-x-[8%] top-[6%] h-px bg-[linear-gradient(90deg,transparent,var(--color-ember-500),transparent)] opacity-0 [--scan-travel:30dvh] motion-safe:animate-scan group-data-ready/stage:hidden lg:inset-x-auto lg:left-[10%] lg:w-[40%] lg:top-[18%] lg:[--scan-travel:60dvh]" />
      {/* Vignette into carbon black. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,var(--color-carbon-950)_100%)]" />
    </div>
  );
}
