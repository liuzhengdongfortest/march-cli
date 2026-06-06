import { createAvatarTools } from "../../avatars/tools.mjs";

export const AVATAR_TOOL_CAPABILITY_PROVIDERS = [
  {
    id: "avatar",
    toolNames: ["DispatchAvatar", "AvatarStatus", "AvatarResult", "AvatarCancel"],
    createTools: createAvatarToolCapability,
  },
];

function createAvatarToolCapability(boundary) {
  const { avatarRuntime } = boundary.capabilities;
  return avatarRuntime ? createAvatarTools({ runtime: avatarRuntime }) : [];
}
