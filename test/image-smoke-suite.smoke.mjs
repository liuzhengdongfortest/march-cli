import { runAttachmentReferencesSmoke } from "./attachment-references.smoke.mjs";
import { runAttachmentDisplaySmoke } from "./attachment-display.smoke.mjs";
import { runAttachmentsSmoke } from "./attachments.smoke.mjs";
import { runImageClipboardSmoke } from "./image-clipboard.smoke.mjs";
import { runPasteImageCommandSmoke } from "./paste-image-command.smoke.mjs";
import { runRunnerImageAttachmentsSmoke } from "./runner-image-attachments.smoke.mjs";
import { runTuiCtrlCSmoke, runTuiPasteImageSmoke } from "./tui-paste-image.smoke.mjs";

export async function runImageSmokeSuite({ setupTmp, cleanup }) {
  await runAttachmentsSmoke({ setupTmp, cleanup });
  await runAttachmentDisplaySmoke();
  await runAttachmentReferencesSmoke({ setupTmp, cleanup });
  await runImageClipboardSmoke();
  await runPasteImageCommandSmoke();
  await runTuiPasteImageSmoke({ setupTmp, cleanup });
  await runTuiCtrlCSmoke({ setupTmp, cleanup });
  await runRunnerImageAttachmentsSmoke({ setupTmp, cleanup });
}
