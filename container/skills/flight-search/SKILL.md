---
name: flight-search
description: Search for flights using Kiwi.com. Use this proactively when the user asks about flights, fares, travel options, or wants to book a trip. Returns the best options with direct booking links. No API key required.
allowed-tools: mcp__kiwi__search_flight
---

# Flight Search

Search flights via the Kiwi.com MCP server using `mcp__kiwi__search_flight`. Results include the best fare options with direct booking links.

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `origin` | ✓ | City name or IATA code (e.g. `"London"` or `"LHR"`) |
| `destination` | ✓ | City name or IATA code (e.g. `"New York"` or `"JFK"`) |
| `departure_date` | ✓ | `YYYY-MM-DD`. Kiwi searches ±3 days for the best price. |
| `return_date` | | `YYYY-MM-DD`. Omit for one-way flights. |
| `adults` | | Number of adults. Default: `1` |
| `children` | | Number of children. Default: `0` |
| `infants` | | Number of infants. Default: `0` |
| `cabin_class` | | `"economy"` (default), `"premium_economy"`, `"business"`, `"first"` |
| `one_way` | | `true` for one-way, `false` for round-trip. Default: `false` |

## Examples

**Round trip, 2 adults:**
```
mcp__kiwi__search_flight({
  origin: "London",
  destination: "Barcelona",
  departure_date: "2025-08-10",
  return_date: "2025-08-17",
  adults: 2
})
```

**One-way, business class:**
```
mcp__kiwi__search_flight({
  origin: "LHR",
  destination: "JFK",
  departure_date: "2025-07-20",
  adults: 1,
  one_way: true,
  cabin_class: "business"
})
```

**Family trip with children:**
```
mcp__kiwi__search_flight({
  origin: "Manchester",
  destination: "Malaga",
  departure_date: "2025-07-25",
  return_date: "2025-08-08",
  adults: 2,
  children: 2
})
```

## Tips

- **Date flexibility is automatic** — Kiwi searches ±3 days, so results may include nearby dates with better prices. Mention this to the user.
- **Always pass booking links** directly to the user — don't summarise them away.
- **Clarify return date** if the user hasn't specified one. Most people want round trips.
- **Midweek departures** (Tue/Wed) are usually cheaper. Suggest this if the user is flexible.
- **City names vs IATA codes** — both work, but IATA codes are more precise for cities with multiple airports (London has LHR, LGW, STN, LCY, LTN).
- **Format results clearly** — lead with price, airline, and duration. Put the booking link at the end.
