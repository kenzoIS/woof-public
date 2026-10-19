import { Fragment } from "react";

function inlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part}</Fragment>,
  );
}

/** Render generated paragraphs and lists as text, without accepting HTML. */
export function InsightText({ text }: { text: string }) {
  const blocks: Array<{ kind: "paragraph" | "list"; lines: string[] }> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      // Keep consecutive paragraphs separate even when their type matches.
      blocks.push({ kind: "paragraph", lines: [] });
      continue;
    }
    const match = line.match(/^(?:[-*•]\s+|\d+[.)]\s+)(.+)$/);
    const kind = match ? "list" : "paragraph";
    const value = match ? match[1] : line.replace(/^#{1,6}\s+/, "");
    const last = blocks[blocks.length - 1];
    if (last?.kind === kind) last.lines.push(value);
    else blocks.push({ kind, lines: [value] });
  }

  return (
    <div className="space-y-3 text-sm md:text-base leading-relaxed text-[#223047]">
      {blocks.filter((block) => block.lines.length).map((block, index) =>
        block.kind === "list" ? (
          <ul key={index} className="list-disc pl-5 space-y-1.5">
            {block.lines.map((line, item) => <li key={item}>{inlineText(line)}</li>)}
          </ul>
        ) : <p key={index}>{inlineText(block.lines.join(" "))}</p>,
      )}
    </div>
  );
}
