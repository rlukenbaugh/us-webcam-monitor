export type AdapterConfig = {
  key: string;
  stateCode: string;
  displayName: string;
  sourceType: "dot" | "weather" | "tourism" | "manual";
  providerUrl: string;
  defaultApiUrl?: string;
  apiUrlEnvVar?: string;
  credentialEnvVars?: string[];
  defaultSyncCron?: string;
};

export const adapterConfigs: Record<string, AdapterConfig> = {
  "mndot-511": {
    key: "mndot-511",
    stateCode: "MN",
    displayName: "Minnesota 511 Cameras",
    sourceType: "dot",
    providerUrl: "https://511mn.org/",
    defaultApiUrl: "https://mntg.carsprogram.org/cameras_v1/api/cameras",
    apiUrlEnvVar: "MNDOT_511_API_URL",
    defaultSyncCron: "*/30 * * * *"
  },
  "wa-dot": {
    key: "wa-dot",
    stateCode: "WA",
    displayName: "Washington DOT Cameras",
    sourceType: "dot",
    providerUrl: "https://wsdot.wa.gov/",
    defaultApiUrl:
      "https://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/GetHighwayCamerasAsJson",
    apiUrlEnvVar: "WSDOT_API_URL",
    credentialEnvVars: ["WSDOT_ACCESS_CODE"],
    defaultSyncCron: "*/30 * * * *"
  },
  "ohgo-dot": {
    key: "ohgo-dot",
    stateCode: "OH",
    displayName: "Ohio OHGO Cameras",
    sourceType: "dot",
    providerUrl: "https://www.ohgo.com/",
    defaultApiUrl: "https://publicapi.ohgo.com/api/v1/cameras",
    apiUrlEnvVar: "OHGO_API_URL",
    credentialEnvVars: ["OHGO_API_KEY"],
    defaultSyncCron: "*/30 * * * *"
  },
  "caltrans-quickmap": {
    key: "caltrans-quickmap",
    stateCode: "CA",
    displayName: "Caltrans CCTV Cameras",
    sourceType: "dot",
    providerUrl: "https://quickmap.dot.ca.gov/",
    defaultApiUrl: "https://cwwp2.dot.ca.gov/data",
    apiUrlEnvVar: "CALTRANS_CCTV_BASE_URL",
    defaultSyncCron: "*/30 * * * *"
  }
};

export function getAdapterConfig(key: string): AdapterConfig | undefined {
  return adapterConfigs[key];
}
