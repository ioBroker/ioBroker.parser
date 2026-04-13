
// Windows temporarily needs this file, https://github.com/module-federation/vite/issues/68

    import {loadShare} from "@module-federation/runtime";
    const importMap = {
      
        "@iobroker/adapter-react-v5": async () => {
          let pkg = await import("__mf__virtual/ConfigCustomParserSet__prebuild___mf_0_iobroker_mf_1_adapter_mf_2_react_mf_2_v5__prebuild__.js");
            return pkg;
        }
      ,
        "@iobroker/json-config": async () => {
          let pkg = await import("__mf__virtual/ConfigCustomParserSet__prebuild___mf_0_iobroker_mf_1_json_mf_2_config__prebuild__.js");
            return pkg;
        }
      ,
        "@mui/icons-material": async () => {
          let pkg = await import("__mf__virtual/ConfigCustomParserSet__prebuild___mf_0_mui_mf_1_icons_mf_2_material__prebuild__.js");
            return pkg;
        }
      ,
        "@mui/material": async () => {
          let pkg = await import("__mf__virtual/ConfigCustomParserSet__prebuild___mf_0_mui_mf_1_material__prebuild__.js");
            return pkg;
        }
      ,
        "react": async () => {
          let pkg = await import("__mf__virtual/ConfigCustomParserSet__prebuild__react__prebuild__.js");
            return pkg;
        }
      ,
        "react-dom": async () => {
          let pkg = await import("__mf__virtual/ConfigCustomParserSet__prebuild__react_mf_2_dom__prebuild__.js");
            return pkg;
        }
      
    }
      const usedShared = {
      
          "@iobroker/adapter-react-v5": {
            name: "@iobroker/adapter-react-v5",
            version: "8.1.8",
            scope: ["default"],
            loaded: false,
            from: "ConfigCustomParserSet",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@iobroker/adapter-react-v5"}' must be provided by host`);
              }
              usedShared["@iobroker/adapter-react-v5"].loaded = true
              const {"@iobroker/adapter-react-v5": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@iobroker/adapter-react-v5" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "*",
              
            }
          }
        ,
          "@iobroker/json-config": {
            name: "@iobroker/json-config",
            version: "8.3.8",
            scope: ["default"],
            loaded: false,
            from: "ConfigCustomParserSet",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@iobroker/json-config"}' must be provided by host`);
              }
              usedShared["@iobroker/json-config"].loaded = true
              const {"@iobroker/json-config": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@iobroker/json-config" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "*",
              
            }
          }
        ,
          "@mui/icons-material": {
            name: "@mui/icons-material",
            version: "6.5.0",
            scope: ["default"],
            loaded: false,
            from: "ConfigCustomParserSet",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@mui/icons-material"}' must be provided by host`);
              }
              usedShared["@mui/icons-material"].loaded = true
              const {"@mui/icons-material": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@mui/icons-material" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "*",
              
            }
          }
        ,
          "@mui/material": {
            name: "@mui/material",
            version: "6.5.0",
            scope: ["default"],
            loaded: false,
            from: "ConfigCustomParserSet",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@mui/material"}' must be provided by host`);
              }
              usedShared["@mui/material"].loaded = true
              const {"@mui/material": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@mui/material" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "*",
              
            }
          }
        ,
          "react": {
            name: "react",
            version: "18.3.1",
            scope: ["default"],
            loaded: false,
            from: "ConfigCustomParserSet",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"react"}' must be provided by host`);
              }
              usedShared["react"].loaded = true
              const {"react": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "react" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "*",
              
            }
          }
        ,
          "react-dom": {
            name: "react-dom",
            version: "18.3.1",
            scope: ["default"],
            loaded: false,
            from: "ConfigCustomParserSet",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"react-dom"}' must be provided by host`);
              }
              usedShared["react-dom"].loaded = true
              const {"react-dom": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "react-dom" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "*",
              
            }
          }
        
    }
      const usedRemotes = [
      ]
      export {
        usedShared,
        usedRemotes
      }
      