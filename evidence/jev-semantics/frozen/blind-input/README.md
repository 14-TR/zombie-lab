# Blind semantic interpretation input

Read ONLY the five files in this directory. Interpret every test text using instructions.json, the exact answer options in its questions, and the permitted labeled development examples. Questions are independent interpretations of the same text. Return a JSON object matching output-schema.json, exactly one prediction per test id, no missing or duplicate ids. Use the five wire fields exactly as named. Do not access sibling directories, evaluation labels, parser/model outputs, reports, outcomes or outside tools/sources. Do not infer nonexistent facts. Do not calculate routes or simulator outcomes.

Output shape: {"predictions":[{"id":"<test id>","interpretation":{"mara_at_depot":"<option>","ash_in_east":"<option>","west_blocked":"<option>","policy":"<option>","clarification":"<option>"}}]}.
