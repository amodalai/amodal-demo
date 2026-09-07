import { useState } from "react";
import { useAmodalContext, useChatStream } from "@amodalai/react";
import contract from "../../amodal/connections/weather/openapi.json";

const areas = contract.paths["/alerts/active/area/{area}"].parameters[0].schema.enum;

export function WeatherAlerts({ state, scopeId }: { state?: string | null; scopeId?: string }) {
  const { client } = useAmodalContext();
  const [checkedAt, setCheckedAt] = useState<string>();
  const area = state?.trim().toUpperCase() ?? "";
  const valid = areas.includes(area);
  const chat = useChatStream({
    streamFn: (text, signal) => client.chatStream(text, {
      agent: "weather",
      ...(scopeId ? { scopeId } : {}),
      signal,
    }),
    onStreamEnd: () => setCheckedAt(new Date().toLocaleString()),
  });
  const answer = chat.messages.filter((m) => m.type === "assistant_text").at(-1);
  const calls = answer?.type === "assistant_text" ? answer.toolCalls : [];
  const verified = calls.some((c) => c.toolName === "weather__alerts_active_area" && c.status === "success");
  const text = answer?.type === "assistant_text" ? answer.text.trim() : "";
  const finished = !!checkedAt && !chat.isStreaming;
  const error = chat.error || (finished && (!verified || !text)
    ? "Weather alerts could not be checked. Try again."
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
