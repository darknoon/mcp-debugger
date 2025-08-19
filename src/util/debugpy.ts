import { createHash } from "crypto";
import { readFileSync, existsSync, mkdirSync, createWriteStream } from "fs";
import { join } from "path";
import { homedir } from "os";
import https from "https";
import { execFile } from "child_process";
import { promisify } from "node:util";

const pexecFile = promisify(execFile);

export async function ensureDebugpy(): Promise<{ debugpyWheel: string }> {
  // Check if python3 is available (non-blocking)
  try {
    await pexecFile("python3", ["--version"]);
  } catch (_error) {
    throw new Error(
      "Python 3 is not available on the system PATH. " +
        "Please ensure Python 3 is installed and accessible as 'python3' command. " +
        "On macOS: Install via 'brew install python3' or download from python.org. " +
        "On Ubuntu/Debian: Install via 'apt-get install python3'. " +
        "On Windows: Install from python.org and ensure it's added to PATH.",
    );
  }

  // Ensure debugpy is available
  const debugpyDir = join(homedir(), ".mcp-debugger");
  const debugpyWheel = join(debugpyDir, "debugpy-1.8.16-py2.py3-none-any.whl");
  const expectedSha256 =
    "19c9521962475b87da6f673514f7fd610328757ec993bf7ec0d8c96f9a325f9e";

  // Create directory if it doesn't exist
  if (!existsSync(debugpyDir)) {
    mkdirSync(debugpyDir, { recursive: true });
  }

  // Download debugpy if not present
  if (!existsSync(debugpyWheel)) {
    console.error("[debugpy] Downloading debugpy wheel...");
    const url =
      "https://files.pythonhosted.org/packages/52/57/ecc9ae29fa5b2d90107cd1d9bf8ed19aacb74b2264d986ae9d44fe9bdf87/debugpy-1.8.16-py2.py3-none-any.whl";

    await new Promise<void>((resolve, reject) => {
      const file = createWriteStream(debugpyWheel);

      https
        .get(url, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // Handle redirect
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error("Redirect without location header"));
              return;
            }

            https
              .get(redirectUrl, (redirectResponse) => {
                if (redirectResponse.statusCode !== 200) {
                  reject(
                    new Error(
                      `Failed to download: HTTP ${redirectResponse.statusCode}`,
                    ),
                  );
                  return;
                }

                redirectResponse.pipe(file);

                file.on("finish", () => {
                  file.close();
                  resolve();
                });
              })
              .on("error", (err) => {
                reject(new Error(`Failed to download debugpy: ${err.message}`));
              });
          } else if (response.statusCode === 200) {
            response.pipe(file);

            file.on("finish", () => {
              file.close();
              resolve();
            });
          } else {
            reject(
              new Error(`Failed to download: HTTP ${response.statusCode}`),
            );
          }
        })
        .on("error", (err) => {
          reject(new Error(`Failed to download debugpy: ${err.message}`));
        });

      file.on("error", (err) => {
        reject(new Error(`Failed to write debugpy wheel: ${err.message}`));
      });
    });

    console.error("[debugpy] Downloaded debugpy wheel");
  }

  // Verify SHA256
  const fileBuffer = readFileSync(debugpyWheel);
  const hashSum = createHash("sha256");
  hashSum.update(fileBuffer);
  const actualSha256 = hashSum.digest("hex");

  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `SHA256 mismatch for debugpy wheel. Expected: ${expectedSha256}, Got: ${actualSha256}`,
    );
  }

  console.error("[debugpy] Verified debugpy wheel SHA256");
  return { debugpyWheel };
}
