# Northwest Business Tools Design

## Scope

Version 0.4.0 adds OpenClaw-oriented one-step tools for the `northwest_company` preset.

These tools compose the existing Jiandaoyun APIs and do not add dangerous-tool guards or local caching.

## Tools

- `jdy_openclaw_doctor`: check API key presence, base URL, read-only API probe, and preset integrity.
- `jdy_northwest_get_form_context`: resolve app/form context and return widgets.
- `jdy_northwest_read_records`: resolve app/form, map field labels, and query records.
- `jdy_northwest_create_record`: resolve app/form, map field labels, and create one record.
- `jdy_northwest_update_record`: resolve app/form, map field labels, and update one record.

## Data Flow

1. Match `app_query` or `app_id` against the built-in northwest-company app preset.
2. Fetch forms dynamically from `POST /api/v5/app/entry/list`.
3. Match `form_query` or `entry_id`.
4. Fetch widgets dynamically from `POST /api/v5/app/entry/widget/list`.
5. For data operations, map Chinese field labels to Jiandaoyun field IDs and call data APIs.

## Ambiguity Handling

Read/create/update tools require a single matched form. If multiple forms match, they fail with candidate information unless `allow_first_match` is true.

## Testing

Unit tests cover doctor checks, form-context resolution, read, create, and update request mapping.
