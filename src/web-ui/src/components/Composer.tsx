import type { ComposerState } from "../model";

type ComposerProps = {
  composer: ComposerState;
  onOpenLeft: () => void;
  onOpenRight: () => void;
};

export function Composer({ composer, onOpenLeft, onOpenRight }: ComposerProps) {
  return (
    <form className="composer" aria-label="Message composer">
      <button type="button" className="mobile-toggle" onClick={onOpenLeft} aria-label="Open files">▦</button>
      <div className="composer-box">
        <textarea rows={1} placeholder={composer.placeholder} />
        <div className="composer-actions">
          <button type="button" className="session-ring" aria-label="Session" />
          <button type="button" className="chip-button">{composer.mode}</button>
          <button type="button" className="icon-action" aria-label="Attach">+</button>
          <button type="submit" className="send-icon" aria-label="Send">↑</button>
        </div>
      </div>
      <button type="button" className="mobile-toggle" onClick={onOpenRight} aria-label="Open sessions">☰</button>
    </form>
  );
}
