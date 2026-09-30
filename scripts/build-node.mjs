process.env.MVP_RUNTIME = "node";
process.argv = [process.execPath, "vinext", "build", ...process.argv.slice(2)];
await import("../node_modules/vinext/dist/cli.js");
