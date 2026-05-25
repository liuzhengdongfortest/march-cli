import type { TimelineItem } from "../../model";

type TimelineBlocksProps = {
  item: TimelineItem;
};

export function TimelineBlocks({ item }: TimelineBlocksProps) {
  if (item.kind === "message") return <MessageBlock item={item} />;

  return (
    <article className="message-row assistant-turn">
      <div className="agent-dot march">M</div>
      <div className="message-body"><AuxBlock item={item} /></div>
    </article>
  );
}

function MessageBlock({ item }: { item: Extract<TimelineItem, { kind: "message" }> }) {
  return (
    <article className={`message-row ${item.actor === "user" ? "user-turn" : "assistant-turn"}`}>
      <div className={item.actor === "user" ? "agent-dot" : "agent-dot march"}>
        {item.actor === "user" ? "U" : "M"}
      </div>
      <div className="message-body">
        <p>{item.text}</p>
        {item.time ? <time>{item.time}</time> : null}
      </div>
    </article>
  );
}

function AuxBlock({ item }: { item: Exclude<TimelineItem, { kind: "message" }> }) {
  switch (item.kind) {
    case "thought":
      return <ThoughtBlock item={item} />;
    case "tool":
      return <ToolBlock item={item} />;
    case "diff":
      return <DiffBlock item={item} />;
    case "terminal":
      return <TerminalBlock item={item} />;
    case "memoryRecall":
      return <MemoryRecallBlock item={item} />;

    case "error":
      return <ErrorBlock item={item} />;
  }
}

function ThoughtBlock({ item }: { item: Extract<TimelineItem, { kind: "thought" }> }) {
  return (
    <details className="timeline-aux thought-block" open={item.status === "open"}>
      <summary><span>thinking</span><strong>{item.title}</strong></summary>
      <p>{item.text}</p>
    </details>
  );
}

function ToolBlock({ item }: { item: Extract<TimelineItem, { kind: "tool" }> }) {
  return (
    <details className="timeline-aux tool-block" open={item.status !== "done"}>
      <summary>
        <span>{item.tool}</span>
        <strong>{item.target}</strong>
        <em>{item.status}</em>
      </summary>
      {item.summary ? <p>{item.summary}</p> : null}
    </details>
  );
}

function DiffBlock({ item }: { item: Extract<TimelineItem, { kind: "diff" }> }) {
  return (
    <div className="timeline-aux diff-block">
      <div className="aux-title"><span>diff</span><strong>{item.path}</strong></div>
      <div className="diff-inline">
        {item.lines.map((line) => (
          <div key={`${line.kind}:${line.text}`} className={`diff-line ${line.kind}`}>{line.text}</div>
        ))}
      </div>
    </div>
  );
}

function TerminalBlock({ item }: { item: Extract<TimelineItem, { kind: "terminal" }> }) {
  return (
    <details className="timeline-aux terminal-block" open={item.status !== "done"}>
      <summary><span>terminal</span><strong>{item.command}</strong><em>{item.status}</em></summary>
      <pre>{item.output}</pre>
    </details>
  );
}

function MemoryRecallBlock({ item }: { item: Extract<TimelineItem, { kind: "memoryRecall" }> }) {
  const candidates = item.report?.candidates?.length ? item.report.candidates : item.hints.map((hint) => ({ ...hint, recalled: true }));
  const threshold = typeof item.report?.threshold === "number" ? `threshold ${item.report.threshold.toFixed(2)}` : "semantic recall";
  return (
    <div className="timeline-aux memory-recall-block">
      <div className="aux-title"><span>memory</span><strong>{item.source} recall · {threshold}</strong></div>
      <ul>
        {candidates.map((hint) => (
          <li key={hint.id} className={hint.recalled === false ? "skipped" : "recalled"}>
            <span>{hint.recalled === false ? "×" : "✓"}</span>
            <strong>{typeof hint.score === "number" ? `${hint.score.toFixed(2)} ` : ""}{hint.name ?? hint.id}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorBlock({ item }: { item: Extract<TimelineItem, { kind: "error" }> }) {
  return (
    <div className="timeline-aux error-block">
      <div className="aux-title"><span>error</span><strong>{item.message}</strong></div>
      {item.detail ? <p>{item.detail}</p> : null}
    </div>
  );
}
