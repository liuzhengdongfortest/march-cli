import { runAttachmentReferencesSmoke } from "./attachment-references.smoke.mjs";
import { runAttachmentsSmoke } from "./attachments.smoke.mjs";
import { runImageClipboardSmoke } from "./image-clipboard.smoke.mjs";
import { runPasteImageCommandSmoke } from "./paste-image-command.smoke.mjs";
import { runRunnerImageAttachmentsSmoke } from "./runner-image-attachments.smoke.mjs";
import { runTuiPasteImageSmoke } from "./tui-paste-image.smoke.mjs";

export async function runImageSmokeSuite({ setupTmp, cleanup }) {
  await runAttachmentsSmoke({ setupTmp, cleanup });
  await runAttachmentReferencesSmoke({ setupTmp, cleanup });
  await runImageClipboardSmoke();
  await runPasteImageCommandSmoke();
  await runTuiPasteImageSmoke({ setupTmp, cleanup });
  await runRunnerImageAttachmentsSmoke({ setupTmp, cleanup });
}
