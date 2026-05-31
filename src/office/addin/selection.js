// Selection observation normalizes Office's loose selection errors into agent-usable states.
export async function readPowerPointSelection({ office = globalThis.Office, powerpoint = globalThis.PowerPoint } = {}) {
  const textResult = await readSelectedText(office);
  if (textResult.ok) return textResult.value ? { status: "text", text: textResult.value } : noneSelection();

  const selectedShapeCount = await readSelectedShapeCount({ office, powerpoint }).catch(() => null);
  if (selectedShapeCount === 0) return noneSelection(textResult.error);
  if (selectedShapeCount > 0 || isUnsupportedSelectionError(textResult.error)) return unsupportedSelection(textResult.error);
  if (isNoSelectionError(textResult.error)) return noneSelection(textResult.error);
  return { status: "error", message: textResult.error.message, error: textResult.error };
}

function readSelectedText(office) {
  return new Promise((resolve) => {
    office.context.document.getSelectedDataAsync(office.CoercionType.Text, (result) => {
      if (result.status === office.AsyncResultStatus.Succeeded) {
        resolve({ ok: true, value: result.value ?? "" });
      } else {
        resolve({ ok: false, error: serializeOfficeError(result.error, "Cannot read selected text") });
      }
    });
  });
}

async function readSelectedShapeCount({ office, powerpoint }) {
  if (!office?.context?.requirements?.isSetSupported?.("PowerPointApi", "1.5")) return null;
  if (typeof powerpoint?.run !== "function") return null;

  return await powerpoint.run(async (context) => {
    const shapes = context.presentation.getSelectedShapes();
    const count = shapes.getCount();
    await context.sync();
    return count.value ?? null;
  });
}

function noneSelection(error = null) {
  return {
    status: "none",
    message: "No text is currently selected.",
    ...(error ? { officeMessage: error.message } : {}),
  };
}

function unsupportedSelection(error) {
  return {
    status: "unsupported",
    message: "The current selection cannot be read as text.",
    officeMessage: error.message,
  };
}

function serializeOfficeError(error, fallbackMessage) {
  return {
    code: error?.code ?? null,
    name: error?.name ?? null,
    message: error?.message || fallbackMessage,
  };
}

function isNoSelectionError(error) {
  return /no\s+(text\s+)?(data|content|selection)\s+(is\s+)?selected|selection\s+is\s+empty|nothing\s+is\s+selected/i.test(error.message);
}

function isUnsupportedSelectionError(error) {
  return /coercion\s+type\s+is\s+not\s+supported|not\s+supported|unsupported|不支持/i.test(error.message);
}
