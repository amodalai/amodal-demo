import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { ReplyModal } from "./ReplyModal";

test("the reply preview uses the send address and rejects a blank recipient", () => {
  for (const broker_email of [" broker@example.invalid ", " ", undefined]) {
    const dom = new JSDOM(renderToStaticMarkup(<ReplyModal
      s={{ submission_id: "sub_a", applicant_name: "Ember Bistro", business_type: "Restaurant", broker_email }}
      finding={{ finding_id: "find_sub_a", submission_id: "sub_a", recommendation: "refer", risk_score: 60, summary: "Review required", missing_info: [], conditions: [] }}
      sending={false} onConfirm={() => {}} onCancel={() => {}}
    />));
    try {
      assert.equal(dom.window.document.querySelector("dd")!.textContent, broker_email?.trim() || "—");
      const button = [...dom.window.document.querySelectorAll("button")].find((b) => b.textContent === "Confirm & send")!;
      assert.equal(button.disabled, !broker_email?.trim());
    } finally {
      dom.window.close();
    }
  }
});
