import type { ForgeConfig } from "@electron-forge/shared-types";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
  },

  rebuildConfig: {},

  plugins: [
    new WebpackPlugin({
      mainConfig: "./webpack.main.config.ts",

      renderer: {
        config: "./webpack.renderer.config.ts",
        entryPoints: [
          {
            html: "./src/index.html",
            js: "./src/renderer.ts",
            name: "main_window",
          },
        ],
      },
    }),
  ],

  makers: [
    new MakerSquirrel({
      name: "awaken_client",
    }),
    new MakerZIP({}, ["win32"]),
  ],
};

export default config;