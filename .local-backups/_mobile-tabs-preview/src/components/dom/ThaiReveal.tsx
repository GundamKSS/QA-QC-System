import { motion } from "@/config/experience";

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("th", { granularity: "word" }) : null;

/** Splits on Thai word boundaries so a reveal never cuts a vowel or tone mark off its consonant. */
export function thaiWords(text: string): string[] {
  if (!segmenter) return [text];
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/**
 * Reveals a line word by word (docs/07 §3, Pass 5). Server-rendered and CSS-only: the full
 * text is in the DOM from the first byte, so screen readers and no-JS users get it at once;
 * `prefers-reduced-motion` collapses the animation in globals.css.
 */
export function ThaiReveal({ text, startMs = 0 }: { text: string; startMs?: number }) {
  const { stepMs } = motion.thaiReveal;
  let index = 0;
  return (
    <>
      {thaiWords(text).map((word, i) => {
        if (!word.trim()) return word;
        const delay = startMs + index++ * stepMs;
        return (
          <span key={i} className="inline-block whitespace-nowrap motion-safe:animate-word" style={{ animationDelay: `${delay}ms` }}>
            {word}
          </span>
        );
      })}
    </>
  );
}
