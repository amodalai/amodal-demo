import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDeclarations } from "./extract.js";
import { SRC_DIRS } from "./helpers.js";

type DraftDocument = { kind: string; name: string; status: string; required: boolean };
type DocumentRow = DraftDocument & { document_id: string; submission_id: string };
type PacketEdit = { submission_id: string; packet: DraftDocument[] };
type PacketFor = (
  submission_id: string,
  documents: DocumentRow[],
  edit: PacketEdit | null,
) => DraftDocument[];

const doc = (name: string, submission_id = "sub_a"): DocumentRow => ({
  document_id: `${submission_id}_${name}`,
  submission_id,
  kind: "financials",
  name,
  status: "received",
  required: true,
});

const filed = [doc("2023 P&L"), doc("Loss runs")];

/**
 * The resubmit editor is what replaces a submission's whole packet, so an
 * empty draft is a deletion. These pin the draft against the two moments the
 * rows are not the ones the broker is looking at: before the first fetch
 * lands, and right after the route moves to another submission.
 */
const loaded = await Promise.all(
  SRC_DIRS.map(async (dir) => ({
    dir,
    ...(await loadDeclarations<{ packetFor: PacketFor }>(
      ["packetFor"],
      [`${dir}/screens/SubmissionDetail.tsx`],
    )),
  })),
);

for (const { dir, packetFor } of loaded) {
  test(`${dir}: documents that arrive after the first render reach the editor`, () => {
    assert.deepEqual(packetFor("sub_a", [], null), [], "a deep link renders once with no rows");
    assert.deepEqual(
      packetFor("sub_a", filed, null).map((d) => d.name),
      ["2023 P&L", "Loss runs"],
      "the fetched packet shows, rather than the empty one from mount",
    );
  });

  test(`${dir}: an untouched editor never files an empty packet over the filed one`, () => {
    assert.equal(packetFor("sub_a", filed, null).length, 2);
  });

  test(`${dir}: the broker's edits win over the filed packet`, () => {
    const edit = { submission_id: "sub_a", packet: [{ ...doc("Loss runs"), status: "missing" }] };
    assert.deepEqual(packetFor("sub_a", filed, edit), edit.packet, "a removal is not undone");
  });

  test(`${dir}: another submission does not inherit the previous one's edits`, () => {
    const edit = { submission_id: "sub_a", packet: [] };
    const others = [doc("Inspection", "sub_b")];
    assert.deepEqual(
      packetFor("sub_b", others, edit).map((d) => d.name),
      ["Inspection"],
    );
  });

  test(`${dir}: the draft carries only the editable fields`, () => {
    assert.deepEqual(packetFor("sub_a", [doc("2023 P&L")], null), [
      { kind: "financials", name: "2023 P&L", status: "received", required: true },
    ]);
  });
}
