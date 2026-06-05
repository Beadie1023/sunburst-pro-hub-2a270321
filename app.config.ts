import { defineConfig } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default {
  vite: {
    plugins: [
      defineConfig({
        routesDirectory: "./src/routes",
        generatedRouteTree: "./src/routeTree.gen.ts",
      }),
      tsconfigPaths(),
    ],
  },
};
