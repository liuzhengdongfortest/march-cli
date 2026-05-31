import { strict as assert } from "node:assert";
import { readPowerPointSelection } from "../src/office/addin/selection.js";

export async function runOfficeSelectionSmoke() {
  console.log("--- smoke: office selection observation ---");

  assert.deepEqual(await readPowerPointSelection({ office: mockOffice({ status: "succeeded", value: "hello" }) }), {
    status: "text",
    text: "hello",
  });

  assert.deepEqual(await readPowerPointSelection({ office: mockOffice({ status: "succeeded", value: "" }) }), {
    status: "none",
    message: "No text is currently selected.",
  });

  assert.deepEqual(await readPowerPointSelection({
    office: mockOffice({ status: "failed", error: { message: "The current selection is not supported." }, supportsPowerPoint15: true }),
    powerpoint: mockPowerPoint({ selectedShapeCount: 0 }),
  }), {
    status: "none",
    message: "No text is currently selected.",
    officeMessage: "The current selection is not supported.",
  });

  assert.deepEqual(await readPowerPointSelection({
    office: mockOffice({ status: "failed", error: { message: "The current selection is not supported." }, supportsPowerPoint15: true }),
    powerpoint: mockPowerPoint({ selectedShapeCount: 2 }),
  }), {
    status: "unsupported",
    message: "The current selection cannot be read as text.",
    officeMessage: "The current selection is not supported.",
  });

  assert.deepEqual(await readPowerPointSelection({
    office: mockOffice({ status: "failed", error: { code: 5001, name: "InternalError", message: "Office host failed" } }),
  }), {
    status: "error",
    message: "Office host failed",
    error: { code: 5001, name: "InternalError", message: "Office host failed" },
  });

  console.log("  PASS");
}

function mockOffice({ status, value = "", error = null, supportsPowerPoint15 = false }) {
  return {
    CoercionType: { Text: "text" },
    AsyncResultStatus: { Succeeded: "succeeded", Failed: "failed" },
    context: {
      requirements: { isSetSupported: (name, version) => name === "PowerPointApi" && version === "1.5" && supportsPowerPoint15 },
      document: {
        getSelectedDataAsync: (_coercionType, callback) => callback({ status, value, error }),
      },
    },
  };
}

function mockPowerPoint({ selectedShapeCount }) {
  return {
    run: async (callback) => callback({
      presentation: {
        getSelectedShapes: () => ({ getCount: () => ({ value: selectedShapeCount }) }),
      },
      sync: async () => {},
    }),
  };
}
