import { useState } from "react";
import { useAmodalContext, useChatStream } from "@amodalai/react";
import contract from "../../amodal/connections/weather/openapi.json";

const areas = contract.paths["/alerts/active/area/{area}"].parameters[0].schema.enum;
const unavailable = "Weather alerts could not be checked. Try again.";

export function WeatherAlerts({ state, scopeId }: { state?: string | null; scopeId?: string }) {
  const { client } = useAmodalContext();
  const [checkedAt, setCheckedAt] = useState<string>();
  const area = state?.trim().toUpperCase() ?? "";
  const valid = areas.includes(area);
  const chat = useChatStream({
    streamFn: async function* (text, signal) {
      let completed = false;
      for await (const event of client.chatStream(text, {
        agent: "weather",
        ...(scopeId ? { scopeId } : {}),
        signal,
      })) {
        if (event.type === "done") {
          if ("reason" in event && event.reason !== "model_stop") throw new Error(unavailable);
          completed = true;
        }
        yield event;
      }
      if (!completed && !signal.aborted) throw new Error(unavailable);
    },
    onStreamEnd: () => setCheckedAt(new Date().toLocaleString()),
  });
  const answer = chat.messages.filter((m) => m.type === "assistant_text").at(-1);
  const calls = answer?.type === "assistant_text" ? answer.toolCalls : [];
  const verified = calls.some((c) => {
    const path = c.parameters.path;
    return c.toolName === "weather__alerts_active_area" && c.status === "success"
      && path !== null && typeof path === "object" && "area" in path && path.area === area;
  });
  const text = answer?.type === "assistant_text" ? answer.text.trim() : "";
  const finished = !!checkedAt && !chat.isStreaming;
  const error = chat.error || (finished && (!verified || !text)
    ? unavailable
    : null);

  return (
    <section className="weather" aria-label="Weather alerts">
      <h3>Weather alerts{valid ? ` · ${area}` : ""}</h3>
      <p className="sub">
        Active alerts across the state. Affected areas may be far from this property.
        This check does not change the assessment or decision.
      </p>
      {valid ? (
        <button className="btn" disabled={chat.isStreaming} onClick={() => {
          chat.reset();
          setCheckedAt(undefined);
          chat.send(`Check active weather alerts for ${area}.`);
        }}>
          {chat.isStreaming ? "Checking weather alerts…" : "Check weather alerts"}
        </button>
      ) : <p className="sub">Add a valid US state or territory code to check weather alerts.</p>}
      <div role="status" aria-live="polite">
        {error ? <p className="banner error">{error}</p> : finished ? (
          <>
            <p className="weather__report">{text}</p>
            <p className="sub">Checked {checkedAt}</p>
          </>
        ) : null}
      </div>
      <p className="sub">
        Source: <a href={valid ? `https://api.weather.gov/alerts/active/area/${area}` : "https://www.weather.gov/alerts"}
          target="_blank" rel="noreferrer">National Weather Service</a>
      </p>
    </section>
  );
}
