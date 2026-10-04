// Ported from Androperator; adaptations recorded in docs/provenance.md.
import { spawn } from "node:child_process";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
  error?: Error;
}

export interface ProcessRunner {
  run(command: string, args: string[], options?: { timeoutMs?: number; cwd?: string; input?: string }): Promise<ProcessResult>;
  // Detached emulator launch.
  spawn(command: string, args: string[], options?: { detached?: boolean; stdio?: any; shell?: boolean; env?: NodeJS.ProcessEnv }): any;
}

export class NodeProcessRunner implements ProcessRunner {
  async run(command: string, args: string[], options?: { timeoutMs?: number; cwd?: string; input?: string }): Promise<ProcessResult> {
    return new Promise((resolve) => {
      const stdin = options?.input !== undefined ? "pipe" : "ignore";
      const proc = spawn(command, args, {
        cwd: options?.cwd,
        stdio: [stdin, "pipe", "pipe"],
        shell: false,
      });
      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (d) => (stdout += d.toString()));
      proc.stderr?.on("data", (d) => (stderr += d.toString()));

      proc.stdin?.on("error", () => { /* The tool may exit before consuming stdin. */ });
      if (options?.input !== undefined) {
        proc.stdin?.write(options.input);
        proc.stdin?.end();
      }

      const timeoutMs = options?.timeoutMs ?? 30_000;
      let timedOut = false;
      const t = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGKILL");
      }, timeoutMs);

      proc.on("error", (err) => {
        clearTimeout(t);
        resolve({ stdout, stderr, code: (err as any).code === "ENOENT" ? 127 : 1, error: err });
      });

      proc.on("close", (code) => {
        clearTimeout(t);
        resolve({ stdout, stderr: timedOut ? `${stderr}\nProcess timed out after ${timeoutMs}ms` : stderr, code: timedOut ? null : code ?? null });
      });
    });
  }

  spawn(command: string, args: string[], options?: { detached?: boolean; stdio?: any; shell?: boolean; env?: NodeJS.ProcessEnv }): any {
    const detached = options?.detached ?? false;
    const stdio = options?.stdio ?? (detached ? ["ignore", "ignore", "ignore"] : ["ignore", "pipe", "pipe"]);
    return spawn(command, args, {
      detached,
      stdio,
      shell: options?.shell ?? false,
      env: options?.env,
    });
  }
}
