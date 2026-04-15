import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: "awaken-client",
  },

  makers: [
    new MakerSquirrel({
      name: "awaken_client",
    }),
    new MakerZIP({}, ["win32"]),
  ],
};

export default config;