import type { JiandaoyunClient } from "./client.js";
import { type BusinessPresetApp } from "./presets.js";
export type CachedWidget = Record<string, unknown>;
export type CachedEntry = {
    entry: Record<string, unknown>;
    entry_id?: string;
    widgets: CachedWidget[];
};
export type CachedAppSchema = {
    app: BusinessPresetApp;
    entries: CachedEntry[];
};
export type NorthwestSchemaCache = {
    version: 1;
    preset_id: "northwest_company";
    generated_at: string;
    base_url?: string;
    apps: CachedAppSchema[];
};
export type RefreshSchemaOptions = {
    appQuery?: string;
    includeWidgets?: boolean;
    limitPerApp?: number;
};
export declare function getSchemaCachePath(): string;
export declare function readNorthwestSchemaCache(cachePath?: string): Promise<NorthwestSchemaCache | undefined>;
export declare function writeNorthwestSchemaCache(cache: NorthwestSchemaCache, cachePath?: string): Promise<void>;
export declare function clearNorthwestSchemaCache(cachePath?: string): Promise<boolean>;
export declare function getNorthwestSchemaCacheStatus(cachePath?: string): Promise<{
    path: string;
    exists: boolean;
    generated_at: string | undefined;
    preset_id: "northwest_company" | undefined;
    app_count: number;
    form_count: number;
    widget_count: number;
    file_size_bytes: number | undefined;
}>;
export declare function refreshNorthwestSchemaCache(client: JiandaoyunClient, options?: RefreshSchemaOptions, cachePath?: string): Promise<NorthwestSchemaCache>;
export declare function summarizeNorthwestSchemaCache(cache: NorthwestSchemaCache): {
    preset_id: "northwest_company";
    generated_at: string;
    base_url: string | undefined;
    app_count: number;
    form_count: number;
    widget_count: number;
};
