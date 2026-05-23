import { useState } from "react";
import type { FormEvent } from "react";
import type { ComposerState } from "../model";

export type ComposerProps = {
  composer: ComposerState;
  running: boolean;
  onSubmit: (prompt: string) => Promise<void>;
  onOpenLeft: () => void;
  onOpenRight: () => void;
};

export function Composer({ composer, running, onSubmit, onOpenLeft, onOpenRight }: ComposerProps) {
  const [prompt, setPrompt] = useState("");
  const canSubmit = prompt.trim().length > 0 && !running;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const nextPrompt = prompt.trim();
    setPrompt("");
    await onSubmit(nextPrompt);
  }

  return (
    <form className="composer" aria-label="Message composer" onSubmit={handleSubmit}>
      <button type="button" className="mobile-toggle" onClick={onOpenLeft} aria-label="Open files">▦</button>
      <div className="composer-box">
        <textarea
          rows={1}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={composer.placeholder}
        />
        <div className="composer-actions">
          <button type="button" className="session-ring" aria-label="Session" />
          <button type="button" className="chip-button">{running ? "Running" : composer.mode}</button>
          <button type="button" className="icon-action" aria-label="Attach">+</button>
          <button type="submit" className="send-icon" aria-label="Send" disabled={!canSubmit}>↑</button>
        </div>
      </div>
      <button type="button" className="mobile-toggle" onClick={onOpenRight} aria-label="Open sessions">☰</button>
    </form>
  );
}
