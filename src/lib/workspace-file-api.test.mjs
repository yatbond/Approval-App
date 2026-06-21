import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultParseLanguageHint,
  parseWorkspaceFile,
  uploadWorkspaceAttachmentFile,
} from "./workspace-file-api.ts";

function makeFile(name = "invoice.pdf") {
  return new File(["hello"], name, { type: "application/pdf" });
}

const documentRequirement = {
  id: "invoice-doc",
  documentType: "Invoice",
  format: "pdf",
  required: true,
  fields: [],
};

test("uploads an attachment with document metadata", async () => {
  let capturedUrl = "";
  let capturedInit;
  const result = await uploadWorkspaceAttachmentFile({
    file: makeFile(),
    documentRequirement,
    fetcher: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Response.json({
        storagePath: "user/invoice-doc/invoice.pdf",
        publicUrl: "https://example.com/invoice.pdf",
      });
    },
  });

  assert.equal(capturedUrl, "/api/attachments/upload");
  assert.equal(capturedInit?.method, "POST");
  assert.ok(capturedInit?.body instanceof FormData);
  assert.equal(capturedInit.body.get("file").name, "invoice.pdf");
  assert.equal(capturedInit.body.get("documentId"), "invoice-doc");
  assert.equal(capturedInit.body.get("documentType"), "Invoice");
  assert.deepEqual(result, {
    storagePath: "user/invoice-doc/invoice.pdf",
    publicUrl: "https://example.com/invoice.pdf",
  });
});

test("uses ad hoc attachment metadata when no document requirement is supplied", async () => {
  let capturedBody;
  await uploadWorkspaceAttachmentFile({
    file: makeFile("note.txt"),
    fetcher: async (_url, init) => {
      capturedBody = init.body;
      return Response.json({ storagePath: "user/ad-hoc/note.txt" });
    },
  });

  assert.equal(capturedBody.get("documentId"), "ad-hoc");
  assert.equal(capturedBody.get("documentType"), "Ad hoc document");
});

test("throws the upload API error when storage fails", async () => {
  await assert.rejects(
    uploadWorkspaceAttachmentFile({
      file: makeFile(),
      documentRequirement,
      fetcher: async () =>
        Response.json({ error: "Sign in before uploading documents." }, { status: 401 }),
    }),
    /Sign in before uploading documents\./,
  );

  await assert.rejects(
    uploadWorkspaceAttachmentFile({
      file: makeFile(),
      documentRequirement,
      fetcher: async () => Response.json({}, { status: 200 }),
    }),
    /Unable to store document in Supabase\./,
  );
});

test("parses a workspace file with the default language hint", async () => {
  let capturedUrl = "";
  let capturedInit;
  const result = await parseWorkspaceFile({
    file: makeFile("receipt.png"),
    fetcher: async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Response.json({
        fields: { amount: "1000" },
        confidence: { amount: "high" },
      });
    },
  });

  assert.equal(capturedUrl, "/api/parse");
  assert.equal(capturedInit?.method, "POST");
  assert.ok(capturedInit?.body instanceof FormData);
  assert.equal(capturedInit.body.get("file").name, "receipt.png");
  assert.equal(capturedInit.body.get("languageHint"), defaultParseLanguageHint);
  assert.deepEqual(result.fields, { amount: "1000" });
});

test("posts document-specific extraction fields when parsing a required document", async () => {
  let capturedBody;
  await parseWorkspaceFile({
    file: makeFile(),
    documentRequirement: {
      ...documentRequirement,
      fields: [
        {
          name: "invoice_total",
          label: "Invoice total",
          type: "currency",
          required: true,
          source: "ai",
          instructions: "Extract the grand total.",
        },
      ],
    },
    fetcher: async (_url, init) => {
      capturedBody = init.body;
      return Response.json({ fields: {}, confidence: {} });
    },
  });

  assert.deepEqual(JSON.parse(capturedBody.get("fieldsJson")), [
    {
      name: "invoice_total",
      label: "Invoice total",
      type: "currency",
      required: true,
      source: "ai",
      instructions: "Extract the grand total.",
    },
  ]);
});

test("posts ad hoc extraction fields and rendered PDF page images", async () => {
  let capturedBody;
  await parseWorkspaceFile({
    file: makeFile(),
    adHocFields: [
      {
        name: "patient_name",
        label: "Patient name",
        type: "text",
        required: false,
        source: "ai",
        instructions: "Extract the patient name.",
      },
    ],
    pageImages: [
      { pageNumber: 1, mimeType: "image/png", imageBase64: "page-one" },
    ],
    fetcher: async (_url, init) => {
      capturedBody = init.body;
      return Response.json({ fields: {}, confidence: {} });
    },
  });

  assert.deepEqual(JSON.parse(capturedBody.get("fieldsJson")), [
    {
      name: "patient_name",
      label: "Patient name",
      type: "text",
      required: false,
      source: "ai",
      instructions: "Extract the patient name.",
    },
  ]);
  assert.deepEqual(JSON.parse(capturedBody.get("pageImagesJson")), [
    { pageNumber: 1, mimeType: "image/png", imageBase64: "page-one" },
  ]);
});

test("throws the parse API error when parsing fails", async () => {
  await assert.rejects(
    parseWorkspaceFile({
      file: makeFile(),
      fetcher: async () =>
        Response.json({ error: "Unable to parse file." }, { status: 503 }),
    }),
    /Unable to parse file\./,
  );
});
