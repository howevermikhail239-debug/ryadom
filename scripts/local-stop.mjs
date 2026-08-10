import { composePrefix, docker, ensureDockerEngine } from "./local-docker.mjs";

await ensureDockerEngine();
const result = docker([...composePrefix, "stop"]);
if (result.status !== 0) process.exitCode = result.status ?? 1;
