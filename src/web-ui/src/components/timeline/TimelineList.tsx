import type { TimelineItem } from "../../model";
import { TimelineBlocks } from "./TimelineBlocks";

export type TimelineListProps = {
  items: TimelineItem[];
};

export function TimelineList({ items }: TimelineListProps) {
  return (
    <div className="timeline-list" aria-label="Session events">
      {items.map((item) => <TimelineBlocks key={item.id} item={item} />)}
    </div>
  );
}
