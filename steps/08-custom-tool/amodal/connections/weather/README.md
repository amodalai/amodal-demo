# National Weather Service

This connection reads active alerts for a US state or territory. It uses
the public [NWS API](https://www.weather.gov/documentation/services-web-api),
which requires an identifying User-Agent header and no account or API key.
The service is free to use, including commercially, with rate limits.

`spec.json` selects the checked-in `openapi.json` and discovery exposure.
The runtime offers `weather__discover`; discovering `alerts_active_area`
makes `weather__alerts_active_area` available on the next model turn.
The generated operation accepts `{"path":{"area":"TX"}}` and calls
`GET https://api.weather.gov/alerts/active/area/TX`. No driver or custom
HTTP tool is needed. The empty endpoint policy permits GET reads; the
contract contains no write operations.

The contract is a small subset of the
[official specification](https://api.weather.gov/openapi.json). Its area
parameter uses the official state/territory string enum. The full NWS
area schema also accepts marine regions through a union that the native
parameter compiler cannot represent. Keeping a local contract also avoids
fetching the specification during session preparation.

The `weather` agent alone holds the connection. It has no store grants,
custom tools, or subagents. The applicant page opens this agent through
the chat stream and displays its report separately from the saved finding.
Steps 9 through 12 also grant the main chat access to this specialist through
`call_subagent`. The chat resolves the requested state or reads the saved
applicant state before delegating. Steps 7 and 8 direct chat users to the
applicant's **Check weather alerts** button.

In steps 11 and 12, the main chat's weather delegation requires
`humanPresent`; the applicant panel remains a direct weather-agent request.
Step 12 carries the selected desk's scope through both entry points.

NWS responses can exceed the runtime's inline result limit. The agent reads
spilled results with `read_spilled_result` and states when a report is
incomplete. An empty successful result means no active alerts. An outage
means the check failed. Neither result measures a property's long-term
exposure or changes the underwriting decision.

To demonstrate it, open Northstar Storage and click **Check weather
alerts**. The lookup uses Texas (`TX`) from its submission. Alerts change
throughout the day; a successful check can return none. The source link
opens the public response for comparison.

This feature requires a Cloud runtime with native OpenAPI discovery
support. The React client uses the existing chat stream API.
