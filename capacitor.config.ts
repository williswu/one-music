import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.otterhub.music",
  appName: "One Music",
  webDir: "dist",
  plugins: {
    SystemBars: {
      insetsHandling: "css",
    },
  },
};

export default config;
