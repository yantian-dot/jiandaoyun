import { cacheTools } from "./cache-tools.js";
import { northwestTools } from "./northwest-tools.js";
import { assistantTools } from "./assistant-tools.js";
import { presetTools } from "./preset-tools.js";
import { arraySchema, booleanSchema, commonPaging, inputObject, numberSchema, objectSchema, stringSchema } from "./json-schema.js";
const stringArray = (description) => arraySchema(description, { type: "string" });
const numberArray = (description) => arraySchema(description, { type: "number" });
const bodyInput = inputObject({
    body: objectSchema("Exact Jiandaoyun request body for this endpoint.")
}, ["body"]);
const emptyInput = inputObject({});
const bodyOnly = (input) => asObject(input.body, "body");
const pickBody = (keys, extraKey = "extra") => (input) => {
    const body = {};
    for (const key of keys) {
        if (input[key] !== undefined)
            body[key] = input[key];
    }
    if (input[extraKey] !== undefined) {
        Object.assign(body, asObject(input[extraKey], extraKey));
    }
    return body;
};
const makePostTool = (options) => ({
    name: options.name,
    description: options.description,
    inputSchema: options.inputSchema,
    handler: async (input, client) => {
        const path = typeof options.path === "function" ? options.path(input) : options.path;
        return client.post(path, options.body ? options.body(input) : bodyOnly(input));
    }
});
export const coreTools = [
    makePostTool({
        name: "jdy_app_list",
        description: "List applications authorized for the Jiandaoyun API key.",
        path: "/api/v5/app/list",
        inputSchema: inputObject(commonPaging),
        body: pickBody(["limit", "skip"])
    }),
    makePostTool({
        name: "jdy_entry_list",
        description: "List forms under a Jiandaoyun application.",
        path: "/api/v5/app/entry/list",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            ...commonPaging
        }, ["app_id"]),
        body: pickBody(["app_id", "limit", "skip"])
    }),
    makePostTool({
        name: "jdy_widget_list",
        description: "List fields/widgets for a Jiandaoyun form.",
        path: "/api/v5/app/entry/widget/list",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID.")
        }, ["app_id", "entry_id"]),
        body: pickBody(["app_id", "entry_id"])
    }),
    makePostTool({
        name: "jdy_data_get",
        description: "Get one Jiandaoyun form record by data ID.",
        path: "/api/v5/app/entry/data/get",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_id: stringSchema("Jiandaoyun data record ID.")
        }, ["app_id", "entry_id", "data_id"]),
        body: pickBody(["app_id", "entry_id", "data_id"])
    }),
    makePostTool({
        name: "jdy_data_list",
        description: "List Jiandaoyun form records with optional fields, filter, cursor data_id, and limit.",
        path: "/api/v5/app/entry/data/list",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_id: stringSchema("Pagination cursor. Use the previous result's last data ID."),
            fields: stringArray("Field names to return."),
            filter: objectSchema("Jiandaoyun data filter object."),
            limit: numberSchema("Number of records to return, usually 1-100.")
        }, ["app_id", "entry_id"]),
        body: pickBody(["app_id", "entry_id", "data_id", "fields", "filter", "limit"])
    }),
    makePostTool({
        name: "jdy_data_create",
        description: "Create one Jiandaoyun form record.",
        path: "/api/v5/app/entry/data/create",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data: objectSchema("Jiandaoyun data object. Field values use { value: ... } shape."),
            data_creator: stringSchema("Optional submitter username."),
            is_start_workflow: booleanSchema("Whether to start workflow for workflow forms."),
            is_start_trigger: booleanSchema("Whether to trigger Jiandaoyun assistant."),
            transaction_id: stringSchema("Optional transaction ID, required when binding uploaded files.")
        }, ["app_id", "entry_id", "data"]),
        body: pickBody(["app_id", "entry_id", "data", "data_creator", "is_start_workflow", "is_start_trigger", "transaction_id"])
    }),
    makePostTool({
        name: "jdy_data_batch_create",
        description: "Create up to 100 Jiandaoyun form records.",
        path: "/api/v5/app/entry/data/batch_create",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_list: arraySchema("Jiandaoyun data objects. Each item uses field { value: ... } shape.", objectSchema("Record data.")),
            data_creator: stringSchema("Optional submitter username."),
            is_start_workflow: booleanSchema("Whether to start workflow for workflow forms."),
            transaction_id: stringSchema("Transaction ID for retry/file binding.")
        }, ["app_id", "entry_id", "data_list"]),
        body: pickBody(["app_id", "entry_id", "data_list", "data_creator", "is_start_workflow", "transaction_id"])
    }),
    makePostTool({
        name: "jdy_data_update",
        description: "Update one Jiandaoyun form record by data ID.",
        path: "/api/v5/app/entry/data/update",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_id: stringSchema("Jiandaoyun data record ID."),
            data: objectSchema("Jiandaoyun update data object."),
            is_start_trigger: booleanSchema("Whether to trigger Jiandaoyun assistant."),
            transaction_id: stringSchema("Optional transaction ID, required when binding uploaded files.")
        }, ["app_id", "entry_id", "data_id", "data"]),
        body: pickBody(["app_id", "entry_id", "data_id", "data", "is_start_trigger", "transaction_id"])
    }),
    makePostTool({
        name: "jdy_data_batch_update",
        description: "Update up to 100 Jiandaoyun records to the same values. Subforms are not supported by Jiandaoyun for this endpoint.",
        path: "/api/v5/app/entry/data/batch_update",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_ids: stringArray("Jiandaoyun data record IDs."),
            data: objectSchema("Jiandaoyun update data object."),
            transaction_id: stringSchema("Optional transaction ID, required when binding uploaded files.")
        }, ["app_id", "entry_id", "data_ids", "data"]),
        body: pickBody(["app_id", "entry_id", "data_ids", "data", "transaction_id"])
    }),
    makePostTool({
        name: "jdy_data_delete",
        description: "Delete one Jiandaoyun form record by data ID.",
        path: "/api/v5/app/entry/data/delete",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_id: stringSchema("Jiandaoyun data record ID."),
            is_start_trigger: booleanSchema("Whether to trigger Jiandaoyun assistant.")
        }, ["app_id", "entry_id", "data_id"]),
        body: pickBody(["app_id", "entry_id", "data_id", "is_start_trigger"])
    }),
    makePostTool({
        name: "jdy_data_batch_delete",
        description: "Delete up to 100 Jiandaoyun form records.",
        path: "/api/v5/app/entry/data/batch_delete",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_ids: stringArray("Jiandaoyun data record IDs.")
        }, ["app_id", "entry_id", "data_ids"]),
        body: pickBody(["app_id", "entry_id", "data_ids"])
    }),
    makePostTool({
        name: "jdy_file_get_upload_token",
        description: "Get Jiandaoyun upload tokens and upload URLs for files/images.",
        path: "/api/v5/app/entry/file/get_upload_token",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            transaction_id: stringSchema("Transaction ID. Must match create/update when binding uploaded files.")
        }, ["app_id", "entry_id", "transaction_id"]),
        body: pickBody(["app_id", "entry_id", "transaction_id"])
    }),
    {
        name: "jdy_file_upload_local",
        description: "Upload a local file using a Jiandaoyun upload URL and token. Returns the file key for create/update data calls.",
        inputSchema: inputObject({
            upload_url: stringSchema("Upload URL returned by jdy_file_get_upload_token."),
            token: stringSchema("Upload token returned by jdy_file_get_upload_token."),
            file_path: stringSchema("Absolute local file path to upload."),
            mime: stringSchema("Optional MIME type, for example application/pdf.")
        }, ["upload_url", "token", "file_path"]),
        handler: async (input, client) => client.uploadLocalFile({
            uploadUrl: requireString(input.upload_url, "upload_url"),
            token: requireString(input.token, "token"),
            filePath: requireString(input.file_path, "file_path"),
            mime: input.mime === undefined ? undefined : requireString(input.mime, "mime")
        })
    },
    makePostTool({
        name: "jdy_workflow_approval_comments",
        description: "Query approval comments for one workflow form data record.",
        path: (input) => `/api/v1/app/${encodeURIComponent(requireString(input.app_id, "app_id"))}/entry/${encodeURIComponent(requireString(input.entry_id, "entry_id"))}/data/${encodeURIComponent(requireString(input.data_id, "data_id"))}/approval_comments`,
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_id: stringSchema("Jiandaoyun data record ID.")
        }, ["app_id", "entry_id", "data_id"]),
        body: () => ({})
    }),
    makePostTool({ name: "jdy_workflow_instance_get", description: "Query workflow instance information.", path: "/api/v6/workflow/instance/get", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_instance_logs", description: "Query workflow instance logs.", path: "/api/v1/workflow/instance/logs", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_instance_close", description: "Close a workflow instance.", path: "/api/v1/workflow/instance/close", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_instance_activate", description: "Activate a closed workflow instance.", path: "/api/v1/workflow/instance/activate", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_task_list", description: "Query current user's workflow tasks.", path: "/api/v6/workflow/task/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_task_approve", description: "Approve/submit a workflow task.", path: "/api/v1/workflow/task/approve", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_task_rollback", description: "Roll back a workflow task.", path: "/api/v2/workflow/task/rollback", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_task_transfer", description: "Transfer a workflow task.", path: "/api/v1/workflow/task/transfer", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_task_add_sign", description: "Add signers to a workflow task.", path: "/api/v2/workflow/task/add_sign", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_task_revoke", description: "Revoke a workflow task.", path: "/api/v2/workflow/task/revoke", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_task_reject", description: "Reject a workflow task.", path: "/api/v1/workflow/task/reject", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_workflow_cc_list", description: "Query workflow CC list.", path: "/api/v1/workflow/cc/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_user_get", description: "Get Jiandaoyun member information.", path: "/api/v5/corp/user/get", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_user_create", description: "Create a Jiandaoyun member.", path: "/api/v5/corp/user/create", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_user_update", description: "Update a Jiandaoyun member.", path: "/api/v5/corp/user/update", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_user_delete", description: "Delete a Jiandaoyun member.", path: "/api/v5/corp/user/delete", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_user_batch_delete", description: "Batch delete Jiandaoyun members.", path: "/api/v5/corp/user/batch_delete", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_user_import", description: "Incrementally import Jiandaoyun members.", path: "/api/v5/corp/user/import", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_user_list", description: "Recursively list department members.", path: "/api/v5/corp/department/user/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_list", description: "Recursively list departments.", path: "/api/v6/corp/department/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_create", description: "Create a Jiandaoyun department.", path: "/api/v6/corp/department/create", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_update", description: "Update a Jiandaoyun department.", path: "/api/v6/corp/department/update", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_delete", description: "Delete a Jiandaoyun department.", path: "/api/v5/corp/department/delete", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_dept_no_get", description: "Get integration-mode department number.", path: "/api/v6/corp/department/dept_no/get", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_import", description: "Fully import and overwrite the Jiandaoyun department tree.", path: "/api/v5/corp/department/import", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_manager_get", description: "Get department manager list.", path: "/api/v6/corp/department/manager/get", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_department_manager_update", description: "Set department managers.", path: "/api/v6/corp/department/manager/update", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_list", description: "List Jiandaoyun roles.", path: "/api/v5/corp/role/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_create", description: "Create a custom Jiandaoyun role.", path: "/api/v5/corp/role/create", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_update", description: "Update a custom Jiandaoyun role.", path: "/api/v5/corp/role/update", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_delete", description: "Delete a custom Jiandaoyun role.", path: "/api/v5/corp/role/delete", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_user_list", description: "List members under a Jiandaoyun role.", path: "/api/v5/corp/role/user/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_add_members", description: "Batch add members to a custom Jiandaoyun role.", path: "/api/v5/corp/role/add_members", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_remove_members", description: "Batch remove members from a custom Jiandaoyun role.", path: "/api/v5/corp/role/remove_members", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_group_list", description: "List custom Jiandaoyun role groups.", path: "/api/v5/corp/role_group/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_group_create", description: "Create a custom Jiandaoyun role group.", path: "/api/v5/corp/role_group/create", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_group_update", description: "Update a custom Jiandaoyun role group.", path: "/api/v5/corp/role_group/update", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_role_group_delete", description: "Delete a custom Jiandaoyun role group.", path: "/api/v5/corp/role_group/delete", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_guest_department_list", description: "List connected external enterprises.", path: "/api/v5/corp/guest/department/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_guest_user_list", description: "List contacts in a connected external enterprise.", path: "/api/v5/corp/guest/user/list", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_guest_user_get", description: "Get contact detail for a connected external enterprise.", path: "/api/v5/corp/guest/user/get", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_usage_overview", description: "Get Jiandaoyun platform resource usage overview.", path: "/api/v1/corp_usage/overview", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_usage_app_metrics", description: "Get Jiandaoyun application resource usage metrics.", path: "/api/v1/corp_usage/app_metrics", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_corp_usage_member_metrics", description: "Get Jiandaoyun member resource usage metrics.", path: "/api/v1/corp_usage/member_metrics", inputSchema: bodyInput }),
    makePostTool({ name: "jdy_audit_log_domains", description: "Get Jiandaoyun audit-log domain and event type definitions.", path: "/api/v1/audit_log/domains", inputSchema: emptyInput, body: () => ({}) }),
    makePostTool({ name: "jdy_audit_log_list", description: "Query Jiandaoyun audit-log details.", path: "/api/v1/audit_log/list", inputSchema: bodyInput }),
    {
        name: "jdy_raw_post",
        description: "Call a Jiandaoyun POST endpoint under /api/. Use only for newly documented endpoints not yet wrapped by a dedicated tool.",
        inputSchema: inputObject({
            path: stringSchema("Jiandaoyun API path. Must start with /api/. Example: /api/v5/app/list"),
            body: objectSchema("JSON body to send.")
        }, ["path", "body"]),
        handler: async (input, client) => client.rawPost(requireString(input.path, "path"), asObject(input.body, "body"))
    }
];
export const tools = [...cacheTools, ...northwestTools, ...presetTools, ...assistantTools, ...coreTools];
function requireString(value, field) {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Expected non-empty string for ${field}.`);
    }
    return value;
}
function asObject(value, field) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`Expected object for ${field}.`);
    }
    return value;
}
//# sourceMappingURL=tools.js.map