import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.midwesthardenduro.station",
  appName: "MWHE Station",
  webDir: "dist",
  android: {},
  server: {
    androidScheme: "https",
    // The laptop hub on the travel router is http://, not https.
    cleartext: true,
  },
};

export default config;
