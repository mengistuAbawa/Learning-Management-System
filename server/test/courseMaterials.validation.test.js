const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  extensionFor,
  materialTypes,
} = require("../src/controllers/courseMaterialController");

const validHeaders = {
  ".pdf": Buffer.from("%PDF-1.7"),
  ".doc": Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  ".docx": Buffer.from("PK\u0003\u0004"),
  ".ppt": Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  ".pptx": Buffer.from("PK\u0003\u0004"),
};

const validTypes = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

test("course materials accept supported extensions with compatible MIME types", () => {
  for (const [extension, mediaType] of Object.entries(validTypes)) {
    const file = {
      originalname: `lesson${extension}`,
      mimetype: mediaType,
    };
    assert.equal(extensionFor(file).mediaType, mediaType);
  }
});

test("course materials reject unsupported extensions and mismatched MIME types", () => {
  assert.equal(
    extensionFor({ originalname: "lesson.exe", mimetype: "application/octet-stream" }),
    null
  );
  assert.equal(
    extensionFor({ originalname: "lesson.pdf", mimetype: "application/msword" }),
    null
  );
});

test("course materials validate document signatures for all supported formats", () => {
  for (const [extension, header] of Object.entries(validHeaders)) {
    assert.equal(materialTypes[extension].signature(header), true);
    assert.equal(materialTypes[extension].signature(Buffer.from("not a document")), false);
  }
});
