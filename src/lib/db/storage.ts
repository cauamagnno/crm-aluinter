import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { withContext } from "./pool";
import { publicUrl } from "./public-url";
import type { ExecContext, StorageBucket, UploadOptions } from "./types";

export { publicUrl };

function storageRoot(): string {
  return process.env.STORAGE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "storage");
}

function safeSegment(value: string): boolean {
  return value.length > 0 && !value.includes("\0") && !value.includes("..");
}

export function resolveObjectPath(bucket: string, objectPath: string): string {
  if (!safeSegment(bucket) || objectPath.split("/").some((p) => !safeSegment(p))) {
    throw new Error("Invalid storage path");
  }
  return path.join(storageRoot(), bucket, objectPath);
}

async function writeObject(
  ctx: ExecContext,
  bucket: string,
  objectPath: string,
  bytes: Uint8Array,
  options: UploadOptions | undefined,
): Promise<void> {
  const dest = resolveObjectPath(bucket, objectPath);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes);

  await withContext(ctx, async (client) => {
    await client.query(
      `INSERT INTO storage.objects (bucket_id, name, owner, metadata)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bucket_id, name) DO UPDATE
         SET metadata = EXCLUDED.metadata, updated_at = now()`,
      [
        bucket,
        objectPath,
        ctx.userId,
        JSON.stringify({
          mimetype: options?.contentType ?? "application/octet-stream",
          size: bytes.byteLength,
        }),
      ],
    );
  });
}

async function toBytes(
  file: File | Blob | ArrayBuffer | Uint8Array | Buffer,
): Promise<Uint8Array> {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(file)) {
    return new Uint8Array(file);
  }
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  if (typeof Blob !== "undefined" && file instanceof Blob) {
    return new Uint8Array(await file.arrayBuffer());
  }
  throw new Error("Unsupported upload body");
}

export function createStorage(
  ctx: ExecContext,
  remote?: {
    upload: (
      bucket: string,
      objectPath: string,
      file: File | Blob | ArrayBuffer | Uint8Array | Buffer,
      options?: UploadOptions,
    ) => Promise<{ error: { message: string } | null }>;
    remove: (
      bucket: string,
      paths: string[],
    ) => Promise<{ error: { message: string } | null }>;
  },
): { from: (bucket: string) => StorageBucket } {
  return {
    from(bucket: string): StorageBucket {
      return {
        async upload(objectPath, file, options) {
          try {
            if (remote) {
              const { error } = await remote.upload(bucket, objectPath, file, options);
              if (error) return { data: null, error };
              return { data: { path: objectPath }, error: null };
            }
            const bytes = await toBytes(file);
            await writeObject(ctx, bucket, objectPath, bytes, options);
            return { data: { path: objectPath }, error: null };
          } catch (err) {
            return {
              data: null,
              error: { message: err instanceof Error ? err.message : "Upload failed" },
            };
          }
        },
        async remove(paths) {
          try {
            if (remote) {
              const { error } = await remote.remove(bucket, paths);
              return { data: null, error };
            }
            for (const objectPath of paths) {
              try {
                await unlink(resolveObjectPath(bucket, objectPath));
              } catch {
                // missing file is fine
              }
              await withContext(ctx, async (client) => {
                await client.query(
                  "DELETE FROM storage.objects WHERE bucket_id = $1 AND name = $2",
                  [bucket, objectPath],
                );
              });
            }
            return { data: null, error: null };
          } catch (err) {
            return {
              data: null,
              error: { message: err instanceof Error ? err.message : "Delete failed" },
            };
          }
        },
        getPublicUrl(objectPath) {
          return { data: { publicUrl: publicUrl(bucket, objectPath) } };
        },
      };
    },
  };
}
