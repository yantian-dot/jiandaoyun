export type BusinessPresetApp = {
    app_id: string;
    name: string;
    group: string;
    aliases: string[];
};
export type BusinessPreset = {
    id: string;
    name: string;
    description: string;
    source: string;
    apps: BusinessPresetApp[];
};
export declare const northwestCompanyPreset: BusinessPreset;
export declare const businessPresets: BusinessPreset[];
