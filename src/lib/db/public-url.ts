export function publicUrl(bucket: string, objectPath: string): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3004").replace(
          /\/$/,
          "",
        );
  return `${base}/api/storage/${bucket}/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
