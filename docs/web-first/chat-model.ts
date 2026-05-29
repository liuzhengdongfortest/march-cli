/**
 * Web-first chat data model draft.
 *
 * This file intentionally describes the product data model only. It does not
 * depend on March core types: Web Chat is the durable source of truth; model
 * context is rebuilt from this state at turn start.
 */

export type ChatId = string;
export type ChatMemberId = string;
export type MessageId = string;
export type ChatSummaryId = string;
export type AgentId = string;
export type UserId = string;
export type TaskId = string;
export type ExecutionId = string;

export type TimestampMs = number;

export type ChatType = "private" | "group";

export interface Chat {
  id: ChatId;
  type: ChatType;
  title: string | null;

  createdAt: TimestampMs;
  updatedAt: TimestampMs;

  lastMessageId: MessageId | null;
  lastMessagePreview: string | null;

  archivedAt: TimestampMs | null;
  deletedAt: TimestampMs | null;

  metadata: Record<string, unknown> | null;
}

export type ChatMemberType = "user" | "agent" | "system";

export type ChatMemberRole = "owner" | "member" | "assistant" | "scheduler";

export interface ChatMember {
  id: ChatMemberId;
  chatId: ChatId;

  memberType: ChatMemberType;
  memberId: UserId | AgentId | "system";

  /** Role is scoped to this chat, so the same agent can act differently per chat. */
  role: ChatMemberRole;

  displayName: string;
  avatarUrl: string | null;

  joinedAt: TimestampMs;
  leftAt: TimestampMs | null;

  lastReadMessageId: MessageId | null;
  muted: boolean;
}

export type MessageSenderType = "user" | "agent" | "system" | "scheduler";

export type MessageKind =
  | "text"
  | "system_event"
  | "execution_result"
  | "task_update";

export type MessageVisibility = "public" | "private" | "internal";

export interface Message {
  id: MessageId;
  chatId: ChatId;

  senderMemberId: ChatMemberId | null;
  senderType: MessageSenderType;

  kind: MessageKind;

  /** Human-readable display text. Keep this usable without parsing contentJson. */
  content: string;
  contentJson: Record<string, unknown> | null;

  replyToMessageId: MessageId | null;
  taskId: TaskId | null;
  executionId: ExecutionId | null;

  visibility: MessageVisibility;

  createdAt: TimestampMs;
  editedAt: TimestampMs | null;
  deletedAt: TimestampMs | null;
}

export type ChatSummaryKind = "rolling" | "checkpoint" | "topic";

export interface ChatSummary {
  id: ChatSummaryId;
  chatId: ChatId;

  fromMessageId: MessageId;
  toMessageId: MessageId;

  summary: string;
  kind: ChatSummaryKind;

  createdAt: TimestampMs;
}

export interface ChatContextSnapshot {
  chat: Chat;
  members: ChatMember[];
  latestSummary: ChatSummary | null;
  recentMessages: Message[];
}

export interface BuildChatContextOptions {
  maxRecentMessages: number;
  includeInternalMessages: boolean;
}

/**
 * Turn-start context is a projection, not persisted state. Persist Chat,
 * ChatMember, Message, and ChatSummary; rebuild this text when a turn starts.
 */
export interface BuiltChatContext {
  chatId: ChatId;
  text: string;
  source: ChatContextSnapshot;
}

export const CHAT_SQLITE_TABLES = [
  "chat",
  "chat_member",
  "message",
  "chat_summary",
] as const;

export const CHAT_SQLITE_INDEXES = [
  "chat(updated_at)",
  "chat_member(chat_id)",
  "message(chat_id, created_at)",
  "message(chat_id, id)",
  "chat_summary(chat_id, created_at)",
] as const;
