# RUJAK P0 limitations

RUJAK P0 is a focused decision-support prototype for a nine-stop Central Surabaya study cluster. Its walking-reachability result is useful for comparing the included canonical destinations, but it is not a turn-by-turn navigation service or a guarantee of real-world accessibility.

- The walking graph is a road-derived proxy. It does not fully encode sidewalks, crossings, accessibility barriers, temporary closures, safety, gradients, or every pedestrian-only connection.
- Walking time is estimated from precomputed network distance using a fixed 1.3 m/s speed assumption. Actual time varies by person, weather, crossings, traffic, and street conditions.
- Results depend on the topology and coverage of the frozen network. A reachable result means connected within that proxy, not that every route is safe, legal, step-free, or currently open.
- Catchments are limited to 5 and 10 minutes and to the frozen `p0-central-v1` analysis. They are not live route calculations.
- Transit evidence is from a local human survey at each stop and its immediate surroundings. It is not a claim about the entire route to a merchant, and conditions can change after the survey.
- The culinary dataset is limited to the canonical 2025 source in the P0 study area. RUJAK does not provide prices, ratings, opening hours, menu information, availability, or personal recommendations.
- RUJAK does not provide real-time transit, multimodal trip planning, current-location routing, or full navigation.
- AGUS is optional. Its answers are restricted to the selected stop, canonical discovery data, and approved local evidence; it should not be used for facts outside that scope.

Use the map together with local judgment and current on-site conditions.
